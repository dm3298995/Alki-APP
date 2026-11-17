/* ==========================================================================
   rutas/contratos.js — HISTORIAL DE CONTRATOS, RENOVACIONES Y DOCUMENTOS
   · Lista filtrable: activos, por finalizar, pendientes de renovación,
     renovados, próximos inicios y finalizados.
   · Ficha: datos del contrato, línea de tiempo (renovaciones y ocupantes de
     la habitación), resumen de pagos y documentos.
   ========================================================================== */
'use strict';
const db = require('../db');
const { ruta, ErrorHttp } = require('../http');
const { tiene } = require('../seguridad/permisos');
const { validar, filtroId } = require('../seguridad/validar');
const { registrar } = require('../servicios/auditoria');
const ocup = require('../servicios/ocupacion');
const { desglose } = require('../servicios/cobros');

const meses = (a, b) => (b ? Math.max(1, Math.round(ocup.diasEntre(a, b) / 30.44)) : null);

const VISTAS = {
  activos: (c, hoy) => c.estado === 'activo' && c.inicio <= hoy,
  por_finalizar: (c, hoy) => c.estado === 'activo' && c.inicio <= hoy && c.fin && ocup.diasEntre(hoy, c.fin) <= 60,
  renovacion: (c, hoy) => c.estado === 'activo' && !!c.renovacion && c.renovacion !== 'no_renueva',
  proximos: (c, hoy) => (c.estado === 'activo' || c.estado === 'reservado') && c.inicio > hoy,
  renovados: (c) => c.renovado || c.esRenovacion,
  finalizados: (c) => c.estado === 'finalizado' || c.estado === 'rescindido',
  todos: () => true
};

function listar(verInq) {
  return db.todos(
    'SELECT c.id, c.codigo, c.estado, c.inicio, c.fin, c.renta, c.servicios, c.fianza, c.renovacion, c.renovacion_de, c.firmado, c.tipo, ' +
    'i.id AS inmueble_id, i.codigo AS inmueble, h.id AS habitacion_id, h.codigo AS habitacion, q.nombre AS inquilino, ' +
    '(SELECT COUNT(*) FROM contratos s WHERE s.renovacion_de = c.id) AS renovado FROM contratos c JOIN inmuebles i ON i.id = c.inmueble_id ' +
    'LEFT JOIN habitaciones h ON h.id = c.habitacion_id LEFT JOIN inquilinos q ON q.id = c.inquilino_id ORDER BY c.inicio DESC')
    .map((c) => ({ ...c, inquilino: verInq ? c.inquilino : undefined, esRenovacion: !!c.renovacion_de, renovado: !!c.renovado, duracion: meses(c.inicio, c.fin) }));
}

ruta('GET', '/api/contratos', { permiso: 'contratos.ver' }, ({ query, usuario }) => {
  const hoy = ocup.hoyISO();
  const vista = VISTAS[query.get('vista')] ? query.get('vista') : 'activos';
  const inm = filtroId(query.get('inmueble'));
  let todos = listar(tiene(usuario, 'inquilinos.ver'));
  if (inm) todos = todos.filter((c) => c.inmueble_id === inm);
  const cuentas = Object.fromEntries(Object.entries(VISTAS).map(([k, f]) => [k, todos.filter((c) => f(c, hoy)).length]));
  let lista = todos.filter((c) => VISTAS[vista](c, hoy)).map((c) => ({ ...c, diasRestantes: c.fin ? ocup.diasEntre(hoy, c.fin) : null }));
  if (vista === 'por_finalizar' || vista === 'renovacion') lista.sort((a, b) => a.fin.localeCompare(b.fin));
  if (vista === 'proximos') lista.sort((a, b) => a.inicio.localeCompare(b.inicio));
  // Contratos firmados por año (para el resumen)
  const porAnio = {};
  for (const c of todos) porAnio[c.inicio.slice(0, 4)] = (porAnio[c.inicio.slice(0, 4)] || 0) + 1;
  return { vista, cuentas, contratos: lista.slice(0, 600), total: lista.length, porAnio };
});

ruta('GET', '/api/contratos/:id', { permiso: 'contratos.ver' }, ({ params, usuario }) => {
  const verInq = tiene(usuario, 'inquilinos.ver'), verFin = tiene(usuario, 'pagos.ver');
  const c = db.uno(
    'SELECT c.*, i.codigo AS inmueble, i.nombre AS inmueble_nombre, i.direccion, i.barrio, h.codigo AS habitacion, h.tipo AS habitacion_tipo, h.m2 AS habitacion_m2, h.caracteristicas, ' +
    'q.nombre AS inquilino, q.email, q.telefono FROM contratos c JOIN inmuebles i ON i.id = c.inmueble_id LEFT JOIN habitaciones h ON h.id = c.habitacion_id ' +
    'LEFT JOIN inquilinos q ON q.id = c.inquilino_id WHERE c.id = ?', params.id);
  if (!c) throw new ErrorHttp(404, 'Contrato no encontrado.');
  if (!verInq) { delete c.inquilino; delete c.email; delete c.telefono; }
  const hoy = ocup.hoyISO();

  // Cadena de renovaciones (hacia atrás y hacia delante)
  const cadena = [c.id];
  for (let ant = c.renovacion_de; ant && cadena.length < 20; ant = db.uno('SELECT renovacion_de FROM contratos WHERE id = ?', ant)?.renovacion_de) cadena.unshift(ant);
  for (let sig = c.id; sig && cadena.length < 20;) { const s = db.uno('SELECT id FROM contratos WHERE renovacion_de = ?', sig); sig = s?.id; if (sig) cadena.push(sig); }

  // Línea de tiempo de la habitación: todos sus contratos
  const linea = c.habitacion_id ? db.todos(
    'SELECT c.id, c.codigo, c.estado, c.inicio, c.fin, c.renta, c.renovacion_de, q.nombre AS inquilino FROM contratos c LEFT JOIN inquilinos q ON q.id = c.inquilino_id WHERE c.habitacion_id = ? ORDER BY c.inicio', c.habitacion_id)
    .map((x) => ({ ...x, inquilino: verInq ? x.inquilino : undefined, enCadena: cadena.includes(x.id), actual: x.id === c.id, duracion: meses(x.inicio, x.fin) })) : [];

  let pagos = null;
  if (verFin) {
    const lista = db.todos('SELECT periodo, concepto, importe, vence, pagado_el, cobrado FROM pagos WHERE contrato_id = ? ORDER BY periodo DESC, concepto', c.id);
    pagos = { recibos: lista.length, cobrado: 0, pendiente: 0, atrasado: 0, conRetraso: 0, ultimos: [] };
    for (const p of lista) {
      const x = desglose(p, hoy);
      pagos.cobrado += x.cobrado;
      if (x.falta) pagos[x.atrasado ? 'atrasado' : 'pendiente'] += x.falta;
      if (x.conRetraso) pagos.conRetraso++;
    }
    pagos.ultimos = lista.slice(0, 12).map((p) => ({ ...p, estado: desglose(p, hoy).estado }));
  }
  const documentos = db.todos("SELECT id, nombre, tipo_mime, bytes, creado FROM documentos WHERE entidad = 'contrato' AND entidad_id = ?", c.id);
  return { contrato: { ...c, duracion: meses(c.inicio, c.fin), diasRestantes: c.fin ? ocup.diasEntre(hoy, c.fin) : null }, cadena, linea, pagos, documentos };
});

// Renovar: crea un contrato nuevo enlazado al anterior, que empieza al día siguiente de terminar
ruta('POST', '/api/contratos/:id/renovar', { permiso: 'contratos.editar' }, ({ peticion, params, cuerpo }) => {
  const c = db.uno('SELECT * FROM contratos WHERE id = ?', params.id);
  if (!c) throw new ErrorHttp(404, 'Contrato no encontrado.');
  if (db.uno('SELECT 1 FROM contratos WHERE renovacion_de = ?', c.id)) throw new ErrorHttp(409, 'Este contrato ya está renovado.');
  const d = validar(cuerpo, { inicio: { tipo: 'fecha', req: true }, fin: { tipo: 'fecha', req: true }, renta: { tipo: 'euros', req: true } });
  if (d.fin <= d.inicio) throw new ErrorHttp(400, 'La fecha de fin debe ser posterior al inicio.');
  const id = db.transaccion(() => {
    const nuevo = Number(db.ejecutar(
      "INSERT INTO contratos (nombre, inmueble_id, habitacion_id, inquilino_id, tipo, estado, inicio, fin, renta, servicios, fianza, renovacion_de, firmado) VALUES (?, ?, ?, ?, ?, 'activo', ?, ?, ?, ?, ?, ?, date('now'))",
      c.nombre, c.inmueble_id, c.habitacion_id, c.inquilino_id, c.tipo, d.inicio, d.fin, d.renta, c.servicios, c.fianza, c.id).lastInsertRowid);
    db.ejecutar('UPDATE contratos SET codigo = ? WHERE id = ?', 'ALK-' + d.inicio.slice(0, 4) + '-' + String(nuevo).padStart(4, '0'), nuevo);
    db.ejecutar('UPDATE contratos SET renovacion = NULL WHERE id = ?', c.id);
    return nuevo;
  });
  registrar(peticion, 'contrato.renovar', { entidad: 'contrato', id, detalle: { anterior: c.id } });
  return { id };
});
