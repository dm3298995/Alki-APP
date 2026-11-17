/* ==========================================================================
   rutas/ingresos.js — REGISTRO E HISTORIAL DE INGRESOS
   · Ingresos manuales: lo que entra fuera de los recibos mensuales.
   · Historial completo: ingresos manuales + cobros de recibos, en una sola
     lista filtrable por fechas, piso, persona y concepto.
   Los ingresos manuales suman en Rentabilidad, Panel y Estadísticas.
   ========================================================================== */
'use strict';
const db = require('../db');
const { ruta, ErrorHttp } = require('../http');
const { tiene } = require('../seguridad/permisos');
const { validar, filtroId, FECHA } = require('../seguridad/validar');
const { registrar } = require('../servicios/auditoria');

const TIPOS = { penalizacion: 'Penalización / salida anticipada', danos: 'Cargo por daños o llaves', seguro: 'Reembolso del seguro', estancia: 'Estancia corta', venta: 'Venta de mobiliario', reserva: 'Reserva o señal', otros: 'Otros ingresos' };
const METODOS = ['Transferencia', 'Bizum', 'Efectivo', 'Tarjeta', 'Domiciliación', 'Otro'];

const REGLAS = {
  fecha: { tipo: 'fecha', req: true, etiqueta: 'Fecha' },
  pagador: { tipo: 'texto', req: true, max: 140, etiqueta: 'Quién paga' },
  importe: { tipo: 'euros', req: true, etiqueta: 'Importe' },
  concepto: { tipo: 'texto', req: true, max: 200, etiqueta: 'Concepto' },
  tipo: { tipo: 'enum', valores: Object.keys(TIPOS), etiqueta: 'Tipo' },
  metodo: { tipo: 'enum', valores: METODOS, etiqueta: 'Método de pago' },
  inmueble_id: { tipo: 'id' }, habitacion_id: { tipo: 'id' },
  observaciones: { tipo: 'texto', max: 1500 }
};

function comprobar(d) {
  if (d.importe === 0) throw new ErrorHttp(400, 'El importe debe ser mayor que cero.');
  if (d.inmueble_id && !db.uno('SELECT 1 FROM inmuebles WHERE id = ?', d.inmueble_id)) throw new ErrorHttp(404, 'Inmueble no encontrado.');
  if (d.habitacion_id && !d.inmueble_id) throw new ErrorHttp(400, 'Elige también el inmueble de la habitación.');
  if (d.habitacion_id && !db.uno('SELECT 1 FROM habitaciones WHERE id = ? AND inmueble_id = ?', d.habitacion_id, d.inmueble_id)) throw new ErrorHttp(400, 'La habitación no pertenece a ese inmueble.');
}

ruta('GET', '/api/ingresos', { permiso: 'ingresos.ver' }, ({ query, usuario }) => {
  const hoy = new Date().toISOString().slice(0, 10);
  const desde = FECHA.test(query.get('desde') || '') ? query.get('desde') : new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  const hasta = FECHA.test(query.get('hasta') || '') ? query.get('hasta') : hoy;
  const inm = filtroId(query.get('inmueble'));
  const texto = String(query.get('q') || '').trim().toLowerCase().slice(0, 80);
  const origen = ['manual', 'recibos'].includes(query.get('origen')) ? query.get('origen') : 'todos';
  // Solo quien puede ver los Cobros ve también los cobros de recibos en el historial
  const verCobros = tiene(usuario, 'pagos.ver');
  const verInq = tiene(usuario, 'inquilinos.ver');

  const manuales = origen === 'recibos' ? [] : db.todos(
    'SELECT g.*, i.codigo AS inmueble, h.codigo AS habitacion, u.nombre AS registrado_por FROM ingresos g LEFT JOIN inmuebles i ON i.id = g.inmueble_id ' +
    'LEFT JOIN habitaciones h ON h.id = g.habitacion_id LEFT JOIN usuarios u ON u.id = g.creado_por WHERE g.fecha BETWEEN ? AND ?' + (inm ? ' AND g.inmueble_id = ?' : '') + ' ORDER BY g.fecha DESC, g.id DESC',
    ...(inm ? [desde, hasta, inm] : [desde, hasta])).map((g) => ({ ...g, origen: 'manual', tipoNombre: TIPOS[g.tipo] || g.tipo }));
  const recibos = origen === 'manual' || !verCobros ? [] : db.todos(
    'SELECT p.id, p.pagado_el AS fecha, p.periodo, p.importe, p.concepto AS tipo, p.metodo, c.inmueble_id, c.habitacion_id, i.codigo AS inmueble, h.codigo AS habitacion, q.nombre AS pagador, c.codigo AS contrato FROM pagos p ' +
    'JOIN contratos c ON c.id = p.contrato_id JOIN inmuebles i ON i.id = c.inmueble_id LEFT JOIN habitaciones h ON h.id = c.habitacion_id LEFT JOIN inquilinos q ON q.id = c.inquilino_id ' +
    'WHERE p.pagado_el BETWEEN ? AND ?' + (inm ? ' AND c.inmueble_id = ?' : '') + ' ORDER BY p.pagado_el DESC LIMIT 4000', ...(inm ? [desde, hasta, inm] : [desde, hasta]))
    .map((p) => ({ ...p, origen: 'recibo', pagador: verInq ? p.pagador : 'Inquilino de ' + (p.habitacion || p.inmueble), concepto: 'Recibo de ' + p.tipo + ' · ' + p.periodo.split('-').reverse().join('/'), tipoNombre: p.tipo === 'renta' ? 'Renta' : p.tipo === 'servicios' ? 'Servicios' : p.tipo }));
  let lista = [...manuales, ...recibos].sort((a, b) => b.fecha.localeCompare(a.fecha));
  if (texto) lista = lista.filter((x) => [x.pagador, x.concepto, x.observaciones, x.inmueble, x.habitacion, x.tipoNombre, x.contrato].join(' ').toLowerCase().includes(texto));
  const total = lista.reduce((s, x) => s + x.importe, 0);
  const porTipo = {};
  for (const x of lista) porTipo[x.tipoNombre] = (porTipo[x.tipoNombre] || 0) + x.importe;
  return {
    desde, hasta, origen, verCobros, total, manual: lista.filter((x) => x.origen === 'manual').reduce((s, x) => s + x.importe, 0),
    recibos: lista.filter((x) => x.origen === 'recibo').reduce((s, x) => s + x.importe, 0),
    porTipo: Object.entries(porTipo).map(([tipo, importe]) => ({ tipo, importe })).sort((a, b) => b.importe - a.importe),
    ingresos: lista.slice(0, 1500), totalFilas: lista.length, tipos: TIPOS, metodos: METODOS
  };
});

ruta('POST', '/api/ingresos', { permiso: 'ingresos.editar' }, ({ peticion, cuerpo, usuario }) => {
  const d = validar(cuerpo, REGLAS);
  comprobar(d);
  const r = db.ejecutar('INSERT INTO ingresos (fecha, periodo, pagador, importe, concepto, tipo, metodo, inmueble_id, habitacion_id, observaciones, creado_por) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    d.fecha, d.fecha.slice(0, 7), d.pagador, d.importe, d.concepto, d.tipo || 'otros', d.metodo ?? null, d.inmueble_id ?? null, d.habitacion_id ?? null, d.observaciones ?? null, usuario.id);
  registrar(peticion, 'ingreso.crear', { entidad: 'ingreso', id: Number(r.lastInsertRowid), detalle: { importe: d.importe, concepto: d.concepto } });
  return { id: Number(r.lastInsertRowid) };
});

ruta('PUT', '/api/ingresos/:id', { permiso: 'ingresos.editar' }, ({ peticion, params, cuerpo }) => {
  const g = db.uno('SELECT * FROM ingresos WHERE id = ?', params.id);
  if (!g) throw new ErrorHttp(404, 'Ingreso no encontrado.');
  const d = validar(cuerpo, REGLAS, { parcial: true });
  comprobar({ ...g, ...d });
  if (d.fecha) d.periodo = d.fecha.slice(0, 7);
  const campos = Object.keys(d);
  if (campos.length) db.ejecutar('UPDATE ingresos SET ' + campos.map((c) => c + ' = ?').join(', ') + ' WHERE id = ?', ...campos.map((c) => d[c]), g.id);
  registrar(peticion, 'ingreso.editar', { entidad: 'ingreso', id: g.id, detalle: d });
  return { ok: true };
});

ruta('DELETE', '/api/ingresos/:id', { permiso: 'ingresos.editar' }, ({ peticion, params }) => {
  const g = db.uno('SELECT * FROM ingresos WHERE id = ?', params.id);
  if (!g) throw new ErrorHttp(404, 'Ingreso no encontrado.');
  db.ejecutar('DELETE FROM ingresos WHERE id = ?', g.id);
  registrar(peticion, 'ingreso.borrar', { entidad: 'ingreso', id: g.id, detalle: g });
  return { ok: true };
});

module.exports = { TIPOS };
