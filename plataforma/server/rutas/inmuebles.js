/* ==========================================================================
   rutas/inmuebles.js — INMUEBLES, HABITACIONES Y CONTRATOS
   ========================================================================== */
'use strict';
const db = require('../db');
const { ruta, ErrorHttp } = require('../http');
const { tiene } = require('../seguridad/permisos');
const { validar, filtroId } = require('../seguridad/validar');
const { registrar } = require('../servicios/auditoria');
const ocup = require('../servicios/ocupacion');
const costes = require('../servicios/costes');
const { estadoPago } = require('../servicios/cobros');

const REGLAS_INMUEBLE = {
  codigo: { tipo: 'texto', req: true, max: 20, etiqueta: 'Código' },
  nombre: { tipo: 'texto', req: true, max: 120, etiqueta: 'Nombre' },
  direccion: { tipo: 'texto', max: 200 }, barrio: { tipo: 'texto', max: 80 },
  propietario: { tipo: 'texto', max: 120 },
  renta_propietario: { tipo: 'euros', etiqueta: 'Renta al propietario' },
  notas: { tipo: 'texto', max: 2000 }, activo: { tipo: 'bool' }
};
const REGLAS_HAB = {
  codigo: { tipo: 'texto', req: true, max: 20, etiqueta: 'Código' },
  nombre: { tipo: 'texto', max: 80 },
  precio: { tipo: 'euros', etiqueta: 'Precio' },
  tipo: { tipo: 'enum', valores: ['estandar', 'grande', 'doble', 'suite'], etiqueta: 'Tipo' },
  m2: { tipo: 'entero', min: 4, max: 60 }, caracteristicas: { tipo: 'texto', max: 300 },
  bloqueo: { tipo: 'enum', valores: ['mantenimiento', 'no_disponible'] },
  activo: { tipo: 'bool' }
};
const REGLAS_CONTRATO = {
  habitacion_id: { tipo: 'id', req: true, etiqueta: 'Habitación' },
  inquilino: { tipo: 'texto', req: true, max: 120, etiqueta: 'Inquilino' },
  email: { tipo: 'email' }, telefono: { tipo: 'texto', max: 30 },
  estado: { tipo: 'enum', req: true, valores: ['activo', 'reservado', 'finalizado', 'rescindido'] },
  inicio: { tipo: 'fecha', req: true, etiqueta: 'Inicio' }, fin: { tipo: 'fecha', etiqueta: 'Fin' },
  renta: { tipo: 'euros', req: true, etiqueta: 'Renta' }, servicios: { tipo: 'euros' }, fianza: { tipo: 'euros' },
  renovacion: { tipo: 'enum', valores: ['solicitada', 'en_negociacion', 'no_renueva'], etiqueta: 'Renovación' }
};

function actualizar(tabla, id, datos) {
  const campos = Object.keys(datos);
  if (!campos.length) return;
  const extra = tabla === 'inmuebles' || tabla === 'contratos' ? ", actualizado = datetime('now')" : '';
  db.ejecutar('UPDATE ' + tabla + ' SET ' + campos.map((c) => c + ' = ?').join(', ') + extra + ' WHERE id = ?', ...campos.map((c) => datos[c]), id);
}

// ---------- Inmuebles ----------
ruta('GET', '/api/inmuebles', { permiso: 'inmuebles.ver' }, ({ usuario }) => {
  const lista = db.todos('SELECT id, codigo, nombre, direccion, barrio, activo FROM inmuebles ORDER BY activo DESC, codigo');
  const habs = ocup.habitaciones({ conInquilino: false });
  const verFin = tiene(usuario, 'gastos.ver');
  const p = costes.periodoActual();
  const c = verFin ? costes.resumen(costes.sumarMes(p, -2), p) : null;
  return lista.map((i) => {
    const r = ocup.resumen(habs.filter((h) => h.inmueble.id === i.id));
    const proxima = ocup.proximasSalidas(habs.filter((h) => h.inmueble.id === i.id))[0] || null;
    return { ...i, ...r, proximaSalida: proxima && { fin: proxima.fin, dias: proxima.diasRestantes, habitacion: proxima.habitacion },
      costeMedio: c ? Math.round((c.porInmueble[i.id] || 0) / 3) : undefined };
  });
});

/* Actividad reciente del piso, construida a partir de los propios datos
   (cobros, contratos, mantenimientos y salidas próximas): siempre coherente. */
function actividad(inmuebleId, habs, { verFin, verInq }) {
  const hoy = ocup.hoyISO();
  const desde = new Date(Date.parse(hoy) - 45 * 86400000).toISOString().slice(0, 10);
  const ev = [];
  const nombre = (n) => (verInq && n ? n : 'el inquilino');
  if (verFin) {
    for (const p of db.todos(
      "SELECT p.pagado_el, p.importe, p.concepto, p.periodo, p.vence, h.codigo AS hab, q.nombre FROM pagos p JOIN contratos c ON c.id = p.contrato_id LEFT JOIN habitaciones h ON h.id = c.habitacion_id " +
      "LEFT JOIN inquilinos q ON q.id = c.inquilino_id WHERE c.inmueble_id = ? AND p.pagado_el >= ? AND p.concepto = 'renta' ORDER BY p.pagado_el DESC LIMIT 8", inmuebleId, desde))
      ev.push({ fecha: p.pagado_el, tipo: 'pago', texto: 'Pago registrado · ' + p.hab + ' · ' + (p.importe / 100).toLocaleString('es-ES') + ' € de ' + nombre(p.nombre) + (p.pagado_el > p.vence ? ' (con retraso)' : '') });
    for (const p of db.todos(
      "SELECT p.vence, p.importe, p.cobrado, h.codigo AS hab FROM pagos p JOIN contratos c ON c.id = p.contrato_id LEFT JOIN habitaciones h ON h.id = c.habitacion_id WHERE c.inmueble_id = ? AND p.pagado_el IS NULL AND p.vence < ? ORDER BY p.vence", inmuebleId, hoy))
      ev.push({ fecha: p.vence, tipo: 'alerta', texto: (p.cobrado ? 'Pago parcial · ' + p.hab + ' · faltan ' : 'Recibo atrasado · ' + p.hab + ' · ') + ((p.importe - p.cobrado) / 100).toLocaleString('es-ES') + ' €' });
  }
  for (const c of db.todos(
    'SELECT c.firmado, c.inicio, c.renovacion_de, h.codigo AS hab, q.nombre FROM contratos c LEFT JOIN habitaciones h ON h.id = c.habitacion_id LEFT JOIN inquilinos q ON q.id = c.inquilino_id ' +
    'WHERE c.inmueble_id = ? AND COALESCE(c.firmado, c.inicio) >= ? ORDER BY COALESCE(c.firmado, c.inicio) DESC LIMIT 6', inmuebleId, desde))
    ev.push({ fecha: c.firmado || c.inicio, tipo: 'contrato', texto: (c.renovacion_de ? 'Contrato renovado · ' : 'Nuevo contrato · ') + c.hab + ' · ' + nombre(c.nombre) + (c.inicio > hoy ? ' (entra el ' + c.inicio.split('-').reverse().join('/') + ')' : '') });
  for (const m of db.todos(
    "SELECT m.fecha, m.estado, m.descripcion, h.codigo AS hab, m.zona FROM mantenimientos m LEFT JOIN habitaciones h ON h.id = m.habitacion_id WHERE m.inmueble_id = ? AND m.fecha >= ? ORDER BY m.fecha DESC LIMIT 6", inmuebleId, desde))
    ev.push({ fecha: m.fecha, tipo: 'mantenimiento', texto: (m.estado === 'terminado' ? 'Mantenimiento completado · ' : m.estado === 'en_curso' ? 'Mantenimiento en curso · ' : 'Incidencia abierta · ') + m.descripcion + ' (' + (m.hab || m.zona || 'zona común') + ')' });
  for (const h of habs) if (h.actual?.fin && h.actual.diasRestantes >= 0 && h.actual.diasRestantes <= 30)
    ev.push({ fecha: hoy, tipo: 'aviso', texto: nombre(h.actual.inquilino).replace(/^el/, 'El') + ' (' + h.codigo + ') termina contrato el ' + h.actual.fin.split('-').reverse().join('/') + (h.actual.renovacion === 'solicitada' ? ' · ha pedido renovar' : h.actual.renovacion === 'no_renueva' ? ' · no renueva' : '') });
  return ev.sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 14);
}

ruta('GET', '/api/inmuebles/:id', { permiso: 'inmuebles.ver' }, ({ params, usuario }) => {
  const i = db.uno('SELECT * FROM inmuebles WHERE id = ?', params.id);
  if (!i) throw new ErrorHttp(404, 'Inmueble no encontrado.');
  const verFin = tiene(usuario, 'gastos.ver');
  const habs = ocup.habitaciones({ inmuebleId: i.id, conInquilino: tiene(usuario, 'inquilinos.ver') });
  const fuera = db.todos('SELECT id, codigo, nombre, activo FROM habitaciones WHERE inmueble_id = ? AND activo = 0 ORDER BY codigo', i.id);
  const mantenimientos = db.todos(
    'SELECT m.id, m.fecha, m.descripcion, m.tipo, m.categoria, m.estado, m.coste, h.codigo AS habitacion, m.zona FROM mantenimientos m ' +
    'LEFT JOIN habitaciones h ON h.id = m.habitacion_id WHERE m.inmueble_id = ? ORDER BY m.fecha DESC LIMIT 15', i.id);
  const salida = { inmueble: verFin ? i : { ...i, renta_propietario: undefined }, habitaciones: habs, inactivas: fuera,
    resumen: ocup.resumen(habs), proximasSalidas: ocup.proximasSalidas(habs), mantenimientos: verFin ? mantenimientos : mantenimientos.map((m) => ({ ...m, coste: undefined })) };
  if (verFin) {
    const p = costes.periodoActual();
    salida.costes = costes.resumen(costes.sumarMes(p, 11 * -1), p, i.id);
    salida.recurrentes = db.todos('SELECT * FROM gastos_recurrentes WHERE inmueble_id = ? ORDER BY activo DESC, categoria', i.id);
    // Ingresos esperados del mes (rentas de contratos en vigor), solo informativo
    // Los ingresos son un módulo aparte: solo los ve quien tiene acceso a Ingresos o a Cobros
    if (tiene(usuario, 'ingresos.ver') || tiene(usuario, 'pagos.ver')) salida.ingresosMes = habs.reduce((s, h) => s + (h.actual ? h.actual.renta + h.actual.servicios : 0), 0);
    const est = ocup.estadoPagosContratos(habs.filter((h) => h.actual).map((h) => h.actual.id));
    for (const h of habs) if (h.actual) h.actual.pagos = est.get(h.actual.id)?.estado || 'al_dia';
  }
  salida.actividad = actividad(i.id, habs, { verFin, verInq: tiene(usuario, 'inquilinos.ver') });
  return salida;
});

ruta('POST', '/api/inmuebles', { permiso: 'inmuebles.editar' }, ({ peticion, cuerpo }) => {
  const d = validar(cuerpo, REGLAS_INMUEBLE);
  if (db.uno('SELECT 1 FROM inmuebles WHERE codigo = ?', d.codigo)) throw new ErrorHttp(409, 'Ya existe un inmueble con ese código.');
  const r = db.ejecutar('INSERT INTO inmuebles (codigo, nombre, direccion, barrio, propietario, renta_propietario, notas) VALUES (?, ?, ?, ?, ?, ?, ?)',
    d.codigo, d.nombre, d.direccion ?? null, d.barrio ?? null, d.propietario ?? null, d.renta_propietario ?? 0, d.notas ?? null);
  const id = Number(r.lastInsertRowid);
  registrar(peticion, 'inmueble.crear', { entidad: 'inmueble', id, detalle: d.codigo });
  return { id };
});

ruta('PUT', '/api/inmuebles/:id', { permiso: 'inmuebles.editar' }, ({ peticion, params, cuerpo }) => {
  if (!db.uno('SELECT 1 FROM inmuebles WHERE id = ?', params.id)) throw new ErrorHttp(404, 'Inmueble no encontrado.');
  const d = validar(cuerpo, REGLAS_INMUEBLE, { parcial: true });
  if (d.codigo && db.uno('SELECT 1 FROM inmuebles WHERE codigo = ? AND id <> ?', d.codigo, params.id)) throw new ErrorHttp(409, 'Ya existe un inmueble con ese código.');
  if (d.activo !== undefined) d.activo = d.activo ? 1 : 0;
  actualizar('inmuebles', params.id, d);
  registrar(peticion, 'inmueble.editar', { entidad: 'inmueble', id: params.id, detalle: Object.keys(d) });
  return { ok: true };
});

// ---------- Habitaciones ----------
ruta('GET', '/api/habitaciones', { permiso: 'habitaciones.ver' }, ({ usuario, query }) => {
  const habs = ocup.habitaciones({ inmuebleId: filtroId(query.get('inmueble')), conInquilino: tiene(usuario, 'inquilinos.ver') });
  if (tiene(usuario, 'pagos.ver')) {
    const est = ocup.estadoPagosContratos(habs.filter((h) => h.actual).map((h) => h.actual.id));
    for (const h of habs) if (h.actual) h.actual.pagos = est.get(h.actual.id)?.estado || 'al_dia';
  }
  return { resumen: ocup.resumen(habs), habitaciones: habs };
});

ruta('GET', '/api/habitaciones/:id', { permiso: 'habitaciones.ver' }, ({ params, usuario }) => {
  const verInq = tiene(usuario, 'inquilinos.ver'), verFin = tiene(usuario, 'pagos.ver'), verCostes = tiene(usuario, 'gastos.ver');
  const h = ocup.habitaciones({ habitacionId: params.id, conInquilino: verInq })[0] || db.uno('SELECT * FROM habitaciones WHERE id = ?', params.id);
  if (!h) throw new ErrorHttp(404, 'Habitación no encontrada.');
  const contratos = db.todos(
    'SELECT c.id, c.codigo, c.renovacion, c.renovacion_de, c.nombre, c.estado, c.inicio, c.fin, c.renta, c.servicios, c.fianza, c.origen, q.nombre AS inquilino, q.email, q.telefono FROM contratos c ' +
    'LEFT JOIN inquilinos q ON q.id = c.inquilino_id WHERE c.habitacion_id = ? ORDER BY c.inicio DESC', params.id)
    .map((c) => verInq ? c : { ...c, inquilino: undefined, email: undefined, telefono: undefined });
  const pagos = verFin ? db.todos(
    'SELECT p.*, q.nombre AS inquilino FROM pagos p JOIN contratos c ON c.id = p.contrato_id LEFT JOIN inquilinos q ON q.id = c.inquilino_id ' +
    'WHERE c.habitacion_id = ? ORDER BY p.periodo DESC, p.concepto LIMIT 60', params.id).map((p) => ({ ...p, estado: estadoPago(p), inquilino: verInq ? p.inquilino : undefined })) : null;
  const mantenimientos = db.todos('SELECT id, fecha, descripcion, tipo, categoria, estado, coste, proveedor FROM mantenimientos WHERE habitacion_id = ? ORDER BY fecha DESC', params.id)
    .map((m) => verCostes ? m : { ...m, coste: undefined });
  return { habitacion: h, contratos, pagos, mantenimientos };
});

ruta('POST', '/api/inmuebles/:id/habitaciones', { permiso: 'habitaciones.editar' }, ({ peticion, params, cuerpo }) => {
  if (!db.uno('SELECT 1 FROM inmuebles WHERE id = ?', params.id)) throw new ErrorHttp(404, 'Inmueble no encontrado.');
  const d = validar(cuerpo, REGLAS_HAB);
  if (db.uno('SELECT 1 FROM habitaciones WHERE inmueble_id = ? AND codigo = ?', params.id, d.codigo)) throw new ErrorHttp(409, 'Ese código de habitación ya existe en el inmueble.');
  const r = db.ejecutar('INSERT INTO habitaciones (inmueble_id, codigo, nombre, precio, tipo, m2, caracteristicas, bloqueo) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    params.id, d.codigo, d.nombre ?? null, d.precio ?? 0, d.tipo ?? 'estandar', d.m2 ?? null, d.caracteristicas ?? null, d.bloqueo ?? null);
  registrar(peticion, 'habitacion.crear', { entidad: 'habitacion', id: Number(r.lastInsertRowid) });
  return { id: Number(r.lastInsertRowid) };
});

ruta('PUT', '/api/habitaciones/:id', { permiso: 'habitaciones.editar' }, ({ peticion, params, cuerpo }) => {
  const h = db.uno('SELECT inmueble_id FROM habitaciones WHERE id = ?', params.id);
  if (!h) throw new ErrorHttp(404, 'Habitación no encontrada.');
  const d = validar(cuerpo, REGLAS_HAB, { parcial: true });
  if (d.codigo && db.uno('SELECT 1 FROM habitaciones WHERE inmueble_id = ? AND codigo = ? AND id <> ?', h.inmueble_id, d.codigo, params.id)) throw new ErrorHttp(409, 'Ese código ya existe en el inmueble.');
  if (d.activo !== undefined) d.activo = d.activo ? 1 : 0;
  actualizar('habitaciones', params.id, d);
  registrar(peticion, 'habitacion.editar', { entidad: 'habitacion', id: params.id, detalle: Object.keys(d) });
  return { ok: true };
});

// ---------- Contratos ----------
function inquilinoId(nombre, email, telefono) {
  const existe = db.uno('SELECT id FROM inquilinos WHERE nombre = ? COLLATE NOCASE', nombre);
  if (existe) {
    if (email || telefono) db.ejecutar('UPDATE inquilinos SET email = COALESCE(?, email), telefono = COALESCE(?, telefono) WHERE id = ?', email ?? null, telefono ?? null, existe.id);
    return existe.id;
  }
  return Number(db.ejecutar('INSERT INTO inquilinos (nombre, email, telefono) VALUES (?, ?, ?)', nombre, email ?? null, telefono ?? null).lastInsertRowid);
}

ruta('POST', '/api/contratos', { permiso: 'contratos.editar' }, ({ peticion, cuerpo }) => {
  const d = validar(cuerpo, REGLAS_CONTRATO);
  const h = db.uno('SELECT inmueble_id, codigo FROM habitaciones WHERE id = ?', d.habitacion_id);
  if (!h) throw new ErrorHttp(404, 'Habitación no encontrada.');
  if (d.fin && d.fin < d.inicio) throw new ErrorHttp(400, 'La fecha de fin no puede ser anterior al inicio.');
  const id = db.transaccion(() => {
    const q = inquilinoId(d.inquilino, d.email, d.telefono);
    const nuevo = Number(db.ejecutar("INSERT INTO contratos (nombre, inmueble_id, habitacion_id, inquilino_id, estado, inicio, fin, renta, servicios, fianza, firmado) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, date('now'))",
      h.codigo + ' · ' + d.inquilino, h.inmueble_id, d.habitacion_id, q, d.estado, d.inicio, d.fin ?? null, d.renta, d.servicios ?? 0, d.fianza ?? 0).lastInsertRowid);
    db.ejecutar('UPDATE contratos SET codigo = ? WHERE id = ?', 'ALK-' + d.inicio.slice(0, 4) + '-' + String(nuevo).padStart(4, '0'), nuevo);
    return nuevo;
  });
  registrar(peticion, 'contrato.crear', { entidad: 'contrato', id });
  return { id };
});

ruta('PUT', '/api/contratos/:id', { permiso: 'contratos.editar' }, ({ peticion, params, cuerpo }) => {
  const c = db.uno('SELECT * FROM contratos WHERE id = ?', params.id);
  if (!c) throw new ErrorHttp(404, 'Contrato no encontrado.');
  const reglas = { ...REGLAS_CONTRATO }; delete reglas.habitacion_id; delete reglas.inquilino; delete reglas.email; delete reglas.telefono;
  const d = validar(cuerpo, reglas, { parcial: true });
  if ((d.fin || c.fin) && (d.fin || c.fin) < (d.inicio || c.inicio)) throw new ErrorHttp(400, 'La fecha de fin no puede ser anterior al inicio.');
  actualizar('contratos', params.id, d);
  registrar(peticion, 'contrato.editar', { entidad: 'contrato', id: params.id, detalle: d });
  return { ok: true };
});

module.exports = { inquilinoId };
