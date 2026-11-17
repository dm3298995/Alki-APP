/* ==========================================================================
   rutas/mantenimientos.js — MANTENIMIENTOS, REPARACIONES Y DOCUMENTOS
   Los documentos (facturas, fotos) se validan por su contenido real (no solo
   por la extensión), se guardan fuera de la carpeta pública con un nombre
   aleatorio y solo se descargan con sesión y permiso.
   ========================================================================== */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const db = require('../db');
const config = require('../config');
const { ruta, ErrorHttp } = require('../http');
const { tiene } = require('../seguridad/permisos');
const { validar, filtroId } = require('../seguridad/validar');
const { tokenAleatorio } = require('../seguridad/cifrado');
const { registrar } = require('../servicios/auditoria');

const CARPETA = path.join(config.DATA, 'documentos');
fs.mkdirSync(CARPETA, { recursive: true, mode: 0o700 });

const TIPOS_MANT = { fontaneria: 'Fontanería', electricidad: 'Electricidad', climatizacion: 'Climatización', cerrajeria: 'Cerrajería y seguridad',
  plagas: 'Plagas', persianas: 'Persianas', carpinteria: 'Carpintería', pintura: 'Pintura', mobiliario: 'Mobiliario', electrodomesticos: 'Electrodomésticos', limpieza: 'Limpieza a fondo', otros: 'Otros' };

const REGLAS = {
  inmueble_id: { tipo: 'id', req: true, etiqueta: 'Inmueble' },
  habitacion_id: { tipo: 'id' },
  zona: { tipo: 'texto', max: 60 },
  categoria: { tipo: 'enum', req: true, valores: ['mantenimiento', 'reparaciones'], etiqueta: 'Categoría' },
  tipo: { tipo: 'enum', req: true, valores: Object.keys(TIPOS_MANT), etiqueta: 'Tipo' },
  descripcion: { tipo: 'texto', req: true, max: 1000, etiqueta: 'Descripción' },
  fecha: { tipo: 'fecha', req: true, etiqueta: 'Fecha' },
  coste: { tipo: 'euros', etiqueta: 'Coste' },
  proveedor: { tipo: 'texto', max: 120 },
  estado: { tipo: 'enum', req: true, valores: ['pendiente', 'en_curso', 'terminado', 'cancelado'], etiqueta: 'Estado' }
};

function comprobarHabitacion(d, inmuebleId) {
  if (d.habitacion_id && !db.uno('SELECT 1 FROM habitaciones WHERE id = ? AND inmueble_id = ?', d.habitacion_id, inmuebleId))
    throw new ErrorHttp(400, 'La habitación no pertenece a ese inmueble.');
}

ruta('GET', '/api/mantenimientos', { permiso: 'mantenimientos.ver' }, ({ query, usuario }) => {
  const cond = ['1 = 1'], p = [];
  const inm = filtroId(query.get('inmueble')); if (inm) { cond.push('m.inmueble_id = ?'); p.push(inm); }
  const est = query.get('estado');
  if (est === 'abiertos') cond.push("m.estado IN ('pendiente','en_curso')");
  else if (REGLAS.estado.valores.includes(est)) { cond.push('m.estado = ?'); p.push(est); }
  const desde = query.get('desde'), hasta = query.get('hasta');
  if (desde && /^\d{4}-\d{2}-\d{2}$/.test(desde)) { cond.push('m.fecha >= ?'); p.push(desde); }
  if (hasta && /^\d{4}-\d{2}-\d{2}$/.test(hasta)) { cond.push('m.fecha <= ?'); p.push(hasta); }
  const verFin = tiene(usuario, 'gastos.ver'), verFacturas = tiene(usuario, 'facturas.ver');
  const lista = db.todos(
    'SELECT m.*, i.codigo AS inmueble, h.codigo AS habitacion, (SELECT COUNT(*) FROM documentos d WHERE d.entidad = \'mantenimiento\' AND d.entidad_id = m.id) AS documentos ' +
    'FROM mantenimientos m JOIN inmuebles i ON i.id = m.inmueble_id LEFT JOIN habitaciones h ON h.id = m.habitacion_id WHERE ' + cond.join(' AND ') +
    ' ORDER BY m.fecha DESC, m.id DESC LIMIT 2000', ...p).map((m) => ({ ...(verFin ? m : { ...m, coste: undefined }), documentos: verFacturas ? m.documentos : 0 }));

  // Ranking: qué inmuebles/habitaciones generan más incidencias y coste (últimos 12 meses)
  const hace12 = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
  const ranking = db.todos(
    "SELECT i.id, i.codigo, i.nombre, COUNT(*) AS n, SUM(m.coste) AS coste FROM mantenimientos m JOIN inmuebles i ON i.id = m.inmueble_id " +
    "WHERE m.estado <> 'cancelado' AND m.fecha >= ? GROUP BY i.id ORDER BY n DESC, coste DESC LIMIT 10", hace12).map((r) => verFin ? r : { ...r, coste: undefined });
  const rankingHab = db.todos(
    "SELECT h.id, h.codigo, i.codigo AS inmueble, COUNT(*) AS n, SUM(m.coste) AS coste FROM mantenimientos m JOIN habitaciones h ON h.id = m.habitacion_id JOIN inmuebles i ON i.id = m.inmueble_id " +
    "WHERE m.estado <> 'cancelado' AND m.fecha >= ? GROUP BY h.id HAVING n > 1 ORDER BY n DESC, coste DESC LIMIT 10", hace12).map((r) => verFin ? r : { ...r, coste: undefined });
  return { mantenimientos: lista, ranking, rankingHab, tipos: TIPOS_MANT };
});

ruta('GET', '/api/mantenimientos/:id', { permiso: 'mantenimientos.ver' }, ({ params, usuario }) => {
  const m = db.uno('SELECT m.*, i.codigo AS inmueble, h.codigo AS habitacion FROM mantenimientos m JOIN inmuebles i ON i.id = m.inmueble_id LEFT JOIN habitaciones h ON h.id = m.habitacion_id WHERE m.id = ?', params.id);
  if (!m) throw new ErrorHttp(404, 'Mantenimiento no encontrado.');
  if (!tiene(usuario, 'gastos.ver')) delete m.coste;
  const docs = tiene(usuario, 'facturas.ver') ? db.todos("SELECT id, nombre, tipo_mime, bytes, creado FROM documentos WHERE entidad = 'mantenimiento' AND entidad_id = ?", params.id) : [];
  return { mantenimiento: m, documentos: docs, tipos: TIPOS_MANT };
});

ruta('POST', '/api/mantenimientos', { permiso: 'mantenimientos.editar' }, ({ peticion, cuerpo, usuario }) => {
  const d = validar(cuerpo, REGLAS);
  if (!db.uno('SELECT 1 FROM inmuebles WHERE id = ?', d.inmueble_id)) throw new ErrorHttp(404, 'Inmueble no encontrado.');
  comprobarHabitacion(d, d.inmueble_id);
  const r = db.ejecutar('INSERT INTO mantenimientos (inmueble_id, habitacion_id, zona, categoria, tipo, descripcion, fecha, coste, proveedor, estado, creado_por) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    d.inmueble_id, d.habitacion_id ?? null, d.zona ?? null, d.categoria, d.tipo, d.descripcion, d.fecha, d.coste ?? 0, d.proveedor ?? null, d.estado, usuario.id);
  const id = Number(r.lastInsertRowid);
  registrar(peticion, 'mantenimiento.crear', { entidad: 'mantenimiento', id });
  return { id };
});

ruta('PUT', '/api/mantenimientos/:id', { permiso: 'mantenimientos.editar' }, ({ peticion, params, cuerpo }) => {
  const m = db.uno('SELECT * FROM mantenimientos WHERE id = ?', params.id);
  if (!m) throw new ErrorHttp(404, 'Mantenimiento no encontrado.');
  const d = validar(cuerpo, REGLAS, { parcial: true });
  comprobarHabitacion(d, d.inmueble_id || m.inmueble_id);
  const campos = Object.keys(d);
  if (campos.length) db.ejecutar('UPDATE mantenimientos SET ' + campos.map((c) => c + ' = ?').join(', ') + ' WHERE id = ?', ...campos.map((c) => d[c]), params.id);
  registrar(peticion, 'mantenimiento.editar', { entidad: 'mantenimiento', id: params.id, detalle: d });
  return { ok: true };
});

// ---------- Documentos ----------
// Firma real del archivo ("magic bytes"): un .exe renombrado a .pdf no pasa
function tipoReal(buf) {
  if (buf.subarray(0, 5).toString() === '%PDF-') return ['application/pdf', '.pdf'];
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return ['image/jpeg', '.jpg'];
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return ['image/png', '.png'];
  if (buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return ['image/webp', '.webp'];
  return null;
}

// [tabla, permiso para adjuntar, permiso para descargar]
const ENTIDADES = {
  // Las facturas (documentos de mantenimientos y gastos) son un módulo financiero: piden además «facturas.ver»
  mantenimiento: ['mantenimientos', 'mantenimientos.editar', 'mantenimientos.ver', 'facturas.ver'], gasto: ['gastos', 'gastos.editar', 'gastos.ver', 'facturas.ver'],
  inmueble: ['inmuebles', 'inmuebles.editar', 'inmuebles.ver'], contrato: ['contratos', 'contratos.editar', 'contratos.ver'],
  incidencia: ['incidencias', 'incidencias.editar', 'incidencias.ver']
};

ruta('POST', '/api/documentos', { crudo: true, maxBytes: config.subidas.maxMB * 1024 * 1024 }, ({ peticion, cuerpo, query, usuario }) => {
  const entidad = query.get('entidad'), id = filtroId(query.get('id'));
  const nombre = String(query.get('nombre') || 'documento').replace(/[^\p{L}\p{N} ._()-]/gu, '_').slice(0, 120);
  if (!ENTIDADES[entidad] || !id) throw new ErrorHttp(400, 'Falta indicar a qué pertenece el documento.');
  if (!tiene(usuario, ENTIDADES[entidad][1]) || (ENTIDADES[entidad][3] && !tiene(usuario, ENTIDADES[entidad][3]))) throw new ErrorHttp(403, 'No tienes permiso para adjuntar aquí.');
  if (!db.uno('SELECT 1 FROM ' + ENTIDADES[entidad][0] + ' WHERE id = ?', id)) throw new ErrorHttp(404, 'No existe el elemento.');
  if (!cuerpo?.length) throw new ErrorHttp(400, 'El archivo está vacío.');
  const tipo = tipoReal(cuerpo);
  if (!tipo) throw new ErrorHttp(415, 'Solo se admiten PDF, JPG, PNG o WEBP.');
  const archivo = tokenAleatorio(18) + tipo[1];
  fs.writeFileSync(path.join(CARPETA, archivo), cuerpo, { mode: 0o600 });
  const r = db.ejecutar('INSERT INTO documentos (nombre, archivo, tipo_mime, bytes, entidad, entidad_id, subido_por) VALUES (?, ?, ?, ?, ?, ?, ?)',
    nombre, archivo, tipo[0], cuerpo.length, entidad, id, usuario.id);
  registrar(peticion, 'documento.subir', { entidad, id, detalle: nombre });
  return { id: Number(r.lastInsertRowid) };
});

ruta('GET', '/api/documentos/:id', {}, ({ peticion, res, params, usuario }) => {
  const d = db.uno('SELECT * FROM documentos WHERE id = ?', params.id);
  if (!d) throw new ErrorHttp(404, 'Documento no encontrado.');
  const e = ENTIDADES[d.entidad];
  if (!e || !tiene(usuario, e[2]) || (e[3] && !tiene(usuario, e[3]))) throw new ErrorHttp(403, 'No tienes permiso para ver este documento.');
  registrar(peticion, 'documento.descargar', { entidad: d.entidad, id: d.entidad_id, detalle: d.nombre });
  res.writeHead(200, {
    'Content-Type': d.tipo_mime, 'Content-Length': d.bytes, 'Cache-Control': 'private, no-store',
    'Content-Disposition': "attachment; filename*=UTF-8''" + encodeURIComponent(d.nombre + (path.extname(d.nombre) ? '' : path.extname(d.archivo)))
  });
  fs.createReadStream(path.join(CARPETA, d.archivo)).on('error', () => res.destroy()).pipe(res);
});

// ---------- Facturas: todas las facturas adjuntas a gastos y mantenimientos ----------
ruta('GET', '/api/facturas', { permiso: 'facturas.ver' }, ({ query }) => {
  const desde = /^\d{4}-\d{2}-\d{2}$/.test(query.get('desde') || '') ? query.get('desde') : '2000-01-01';
  const hasta = /^\d{4}-\d{2}-\d{2}$/.test(query.get('hasta') || '') ? query.get('hasta') : '2999-12-31';
  const inm = filtroId(query.get('inmueble'));
  const lista = db.todos(
    "SELECT d.id, d.nombre, d.bytes, d.creado, d.entidad, d.entidad_id, COALESCE(m.fecha, g.fecha) AS fecha, COALESCE(m.inmueble_id, g.inmueble_id) AS inmueble_id, " +
    "COALESCE(m.proveedor, g.proveedor) AS proveedor, COALESCE(m.descripcion, g.descripcion) AS concepto, COALESCE(m.coste, g.importe) AS importe, COALESCE(m.categoria, g.categoria) AS categoria, i.codigo AS inmueble " +
    "FROM documentos d LEFT JOIN mantenimientos m ON d.entidad = 'mantenimiento' AND m.id = d.entidad_id LEFT JOIN gastos g ON d.entidad = 'gasto' AND g.id = d.entidad_id " +
    "LEFT JOIN inmuebles i ON i.id = COALESCE(m.inmueble_id, g.inmueble_id) WHERE d.entidad IN ('mantenimiento', 'gasto')")
    .filter((f) => f.fecha && f.fecha >= desde && f.fecha <= hasta && (!inm || f.inmueble_id === inm))
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
  return { facturas: lista.slice(0, 2000), total: lista.reduce((s, f) => s + (f.importe || 0), 0), n: lista.length };
});

module.exports = { TIPOS_MANT };
