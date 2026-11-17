/* ==========================================================================
   rutas/incidencias.js — TABLERO DE INCIDENCIAS DEL EQUIPO
   Todo el equipo con permiso ve las mismas incidencias: quién la tiene
   asignada, en qué estado está, los comentarios y los cambios (historial).
   Si una incidencia cuesta dinero se crea un mantenimiento enlazado, y su
   coste pasa automáticamente a los gastos del piso.
   ========================================================================== */
'use strict';
const db = require('../db');
const { ruta, ErrorHttp } = require('../http');
const { tiene } = require('../seguridad/permisos');
const { validar, filtroId } = require('../seguridad/validar');
const { registrar } = require('../servicios/auditoria');
const { TIPOS_MANT } = require('./mantenimientos');

const CATEGORIAS = { fontaneria: 'Fontanería', electricidad: 'Electricidad', electrodomesticos: 'Electrodomésticos', cerrajeria: 'Cerrajería y seguridad',
  limpieza: 'Limpieza', convivencia: 'Convivencia', seguridad: 'Seguridad', plagas: 'Plagas', climatizacion: 'Climatización', mobiliario: 'Mobiliario', persianas: 'Persianas y ventanas', otros: 'Otros' };
const ESTADOS = { nueva: 'Nueva', en_curso: 'En curso', esperando: 'Esperando (proveedor / inquilino)', resuelta: 'Resuelta' };
const PRIORIDADES = { urgente: 'Urgente', alta: 'Alta', media: 'Media', baja: 'Baja' };
const ORIGENES = { inquilino: 'Inquilino', propietario: 'Propietario', equipo: 'Equipo ALKI', revision: 'Revisión del piso' };

const REGLAS = {
  titulo: { tipo: 'texto', req: true, max: 140, etiqueta: 'Título' }, descripcion: { tipo: 'texto', max: 3000 },
  inmueble_id: { tipo: 'id', req: true, etiqueta: 'Inmueble' }, habitacion_id: { tipo: 'id' }, zona: { tipo: 'texto', max: 60 },
  categoria: { tipo: 'enum', req: true, valores: Object.keys(CATEGORIAS), etiqueta: 'Categoría' },
  prioridad: { tipo: 'enum', req: true, valores: Object.keys(PRIORIDADES), etiqueta: 'Prioridad' },
  estado: { tipo: 'enum', valores: Object.keys(ESTADOS), etiqueta: 'Estado' },
  origen: { tipo: 'enum', valores: Object.keys(ORIGENES) }, reportado_por: { tipo: 'texto', max: 120 },
  asignado_a: { tipo: 'id' }, fecha_limite: { tipo: 'fecha' }
};

const SELECT = 'SELECT n.*, i.codigo AS inmueble, i.nombre AS inmueble_nombre, h.codigo AS habitacion, ua.nombre AS asignado, uc.nombre AS creador, ' +
  "(SELECT COUNT(*) FROM incidencia_eventos e WHERE e.incidencia_id = n.id AND e.tipo = 'comentario') AS comentarios, " +
  "(SELECT COUNT(*) FROM documentos d WHERE d.entidad = 'incidencia' AND d.entidad_id = n.id) AS adjuntos, m.coste AS coste, m.estado AS mant_estado " +
  'FROM incidencias n JOIN inmuebles i ON i.id = n.inmueble_id LEFT JOIN habitaciones h ON h.id = n.habitacion_id ' +
  'LEFT JOIN usuarios ua ON ua.id = n.asignado_a LEFT JOIN usuarios uc ON uc.id = n.creado_por LEFT JOIN mantenimientos m ON m.id = n.mantenimiento_id ';

const evento = (id, usuarioId, tipo, texto) => db.ejecutar('INSERT INTO incidencia_eventos (incidencia_id, usuario_id, tipo, texto) VALUES (?, ?, ?, ?)', id, usuarioId, tipo, texto);
const nombreUsuario = (id) => (id ? db.uno('SELECT nombre FROM usuarios WHERE id = ?', id)?.nombre || '—' : 'nadie');
function comprobar(d, inmuebleId) {
  if (d.habitacion_id && !db.uno('SELECT 1 FROM habitaciones WHERE id = ? AND inmueble_id = ?', d.habitacion_id, inmuebleId)) throw new ErrorHttp(400, 'La habitación no pertenece a ese inmueble.');
  // Solo se puede asignar a alguien que pueda ver el tablero
  if (d.asignado_a) {
    const u = db.uno('SELECT id, rol, permisos, activo FROM usuarios WHERE id = ?', d.asignado_a);
    if (!u || !u.activo || !tiene(u, 'incidencias.ver')) throw new ErrorHttp(400, 'Esa persona no tiene acceso a las incidencias.');
  }
}
const sinCoste = (n, verCostes) => (verCostes ? n : { ...n, coste: undefined });

ruta('GET', '/api/incidencias', { permiso: 'incidencias.ver' }, ({ query, usuario }) => {
  const cond = ['1 = 1'], p = [];
  const inm = filtroId(query.get('inmueble')); if (inm) { cond.push('n.inmueble_id = ?'); p.push(inm); }
  if (query.get('mias') === '1') { cond.push('n.asignado_a = ?'); p.push(usuario.id); }
  // Resueltas: solo las de los últimos 30 días en el tablero (el historial completo, con ?todas=1)
  if (query.get('todas') !== '1') cond.push("(n.estado <> 'resuelta' OR n.resuelta_el >= datetime('now', '-30 days'))");
  const verCostes = tiene(usuario, 'gastos.ver');
  const lista = db.todos(SELECT + 'WHERE ' + cond.join(' AND ') + " ORDER BY CASE n.prioridad WHEN 'urgente' THEN 0 WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END, n.creado DESC LIMIT 1500", ...p)
    .map((n) => sinCoste(n, verCostes));
  const equipo = db.todos('SELECT id, nombre, rol, permisos FROM usuarios WHERE activo = 1 ORDER BY nombre').filter((u) => tiene(u, 'incidencias.ver')).map(({ id, nombre }) => ({ id, nombre }));
  const abiertas = db.uno("SELECT COUNT(*) AS n, SUM(asignado_a = ?) AS mias, SUM(asignado_a IS NULL) AS sinAsignar, SUM(prioridad = 'urgente') AS urgentes FROM incidencias WHERE estado <> 'resuelta'", usuario.id);
  const tiempo = db.uno("SELECT AVG(julianday(resuelta_el) - julianday(creado)) AS d FROM incidencias WHERE estado = 'resuelta' AND resuelta_el >= datetime('now', '-90 days')").d;
  return { incidencias: lista, equipo, resumen: { ...abiertas, diasMedios: tiempo ? Math.round(tiempo * 10) / 10 : null }, categorias: CATEGORIAS, estados: ESTADOS, prioridades: PRIORIDADES, origenes: ORIGENES };
});

ruta('GET', '/api/incidencias/:id', { permiso: 'incidencias.ver' }, ({ params, usuario }) => {
  const n = db.uno(SELECT + 'WHERE n.id = ?', params.id);
  if (!n) throw new ErrorHttp(404, 'Incidencia no encontrada.');
  const eventos = db.todos('SELECT e.*, u.nombre AS usuario FROM incidencia_eventos e LEFT JOIN usuarios u ON u.id = e.usuario_id WHERE e.incidencia_id = ? ORDER BY e.creado, e.id', n.id);
  const adjuntos = db.todos("SELECT id, nombre, tipo_mime, bytes, creado FROM documentos WHERE entidad = 'incidencia' AND entidad_id = ?", n.id);
  return { incidencia: sinCoste(n, tiene(usuario, 'gastos.ver')), eventos, adjuntos };
});

// Contador para el menú: incidencias abiertas asignadas a mí
ruta('GET', '/api/incidencias/mias/contador', { permiso: 'incidencias.ver', noRenueva: true }, ({ usuario }) => ({
  abiertas: db.uno("SELECT COUNT(*) AS n FROM incidencias WHERE estado <> 'resuelta' AND asignado_a = ?", usuario.id).n
}));

ruta('POST', '/api/incidencias', { permiso: 'incidencias.editar' }, ({ peticion, cuerpo, usuario }) => {
  const d = validar(cuerpo, REGLAS);
  if (!db.uno('SELECT 1 FROM inmuebles WHERE id = ?', d.inmueble_id)) throw new ErrorHttp(404, 'Inmueble no encontrado.');
  comprobar(d, d.inmueble_id);
  const estado = d.estado || (d.asignado_a ? 'en_curso' : 'nueva');
  const id = db.transaccion(() => {
    const nuevo = Number(db.ejecutar(
      'INSERT INTO incidencias (titulo, descripcion, inmueble_id, habitacion_id, zona, categoria, prioridad, estado, origen, reportado_por, asignado_a, creado_por, fecha_limite, resuelta_el) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      d.titulo, d.descripcion ?? null, d.inmueble_id, d.habitacion_id ?? null, d.zona ?? null, d.categoria, d.prioridad, estado, d.origen || 'equipo', d.reportado_por ?? null,
      d.asignado_a ?? null, usuario.id, d.fecha_limite ?? null, estado === 'resuelta' ? new Date().toISOString().replace('T', ' ').slice(0, 19) : null).lastInsertRowid);
    db.ejecutar('UPDATE incidencias SET codigo = ? WHERE id = ?', 'INC-' + String(nuevo).padStart(4, '0'), nuevo);
    evento(nuevo, usuario.id, 'cambio', 'Creó la incidencia' + (d.asignado_a ? ' y la asignó a ' + nombreUsuario(d.asignado_a) : ''));
    return nuevo;
  });
  registrar(peticion, 'incidencia.crear', { entidad: 'incidencia', id });
  return { id };
});

ruta('PUT', '/api/incidencias/:id', { permiso: 'incidencias.editar' }, ({ peticion, params, cuerpo, usuario }) => {
  const n = db.uno('SELECT * FROM incidencias WHERE id = ?', params.id);
  if (!n) throw new ErrorHttp(404, 'Incidencia no encontrada.');
  const d = validar(cuerpo, REGLAS, { parcial: true });
  comprobar(d, d.inmueble_id || n.inmueble_id);
  const cambios = [];
  if (d.estado && d.estado !== n.estado) cambios.push('Estado: ' + ESTADOS[n.estado] + ' → ' + ESTADOS[d.estado]);
  if (d.asignado_a !== undefined && d.asignado_a !== n.asignado_a) cambios.push('Asignada a ' + nombreUsuario(d.asignado_a));
  if (d.prioridad && d.prioridad !== n.prioridad) cambios.push('Prioridad: ' + PRIORIDADES[n.prioridad] + ' → ' + PRIORIDADES[d.prioridad]);
  if (d.fecha_limite !== undefined && d.fecha_limite !== n.fecha_limite) cambios.push(d.fecha_limite ? 'Fecha límite: ' + d.fecha_limite.split('-').reverse().join('/') : 'Sin fecha límite');
  const campos = Object.keys(d);
  db.transaccion(() => {
    if (campos.length) db.ejecutar('UPDATE incidencias SET ' + campos.map((c) => c + ' = ?').join(', ') + ", actualizado = datetime('now') WHERE id = ?", ...campos.map((c) => d[c]), n.id);
    if (d.estado === 'resuelta' && n.estado !== 'resuelta') db.ejecutar("UPDATE incidencias SET resuelta_el = datetime('now') WHERE id = ?", n.id);
    if (d.estado && d.estado !== 'resuelta' && n.estado === 'resuelta') db.ejecutar('UPDATE incidencias SET resuelta_el = NULL WHERE id = ?', n.id);
    // Asignar una incidencia nueva la pone en curso
    if (d.asignado_a && n.estado === 'nueva' && !d.estado) { db.ejecutar("UPDATE incidencias SET estado = 'en_curso' WHERE id = ?", n.id); cambios.push('Estado: Nueva → En curso'); }
    if (cambios.length) evento(n.id, usuario.id, 'cambio', cambios.join(' · '));
  });
  registrar(peticion, 'incidencia.editar', { entidad: 'incidencia', id: n.id, detalle: d });
  return { ok: true };
});

ruta('POST', '/api/incidencias/:id/comentarios', { permiso: 'incidencias.editar' }, ({ peticion, params, cuerpo, usuario }) => {
  if (!db.uno('SELECT 1 FROM incidencias WHERE id = ?', params.id)) throw new ErrorHttp(404, 'Incidencia no encontrada.');
  const { texto } = validar(cuerpo, { texto: { tipo: 'texto', req: true, max: 2000, etiqueta: 'Comentario' } });
  evento(params.id, usuario.id, 'comentario', texto);
  db.ejecutar("UPDATE incidencias SET actualizado = datetime('now') WHERE id = ?", params.id);
  registrar(peticion, 'incidencia.comentar', { entidad: 'incidencia', id: params.id });
  return { ok: true };
});

// Registrar el coste: crea (o actualiza) el mantenimiento enlazado
ruta('POST', '/api/incidencias/:id/coste', { permiso: 'incidencias.editar' }, ({ peticion, params, cuerpo, usuario }) => {
  if (!tiene(usuario, 'mantenimientos.editar')) throw new ErrorHttp(403, 'Necesitas permiso para editar mantenimientos.');
  const n = db.uno('SELECT * FROM incidencias WHERE id = ?', params.id);
  if (!n) throw new ErrorHttp(404, 'Incidencia no encontrada.');
  const d = validar(cuerpo, { coste: { tipo: 'euros', req: true, etiqueta: 'Coste' }, proveedor: { tipo: 'texto', max: 120 }, fecha: { tipo: 'fecha', req: true },
    categoria: { tipo: 'enum', valores: ['mantenimiento', 'reparaciones'] } });
  const tipo = TIPOS_MANT[n.categoria] ? n.categoria : 'otros';
  const id = db.transaccion(() => {
    let m = n.mantenimiento_id;
    if (m && db.uno('SELECT 1 FROM mantenimientos WHERE id = ?', m)) db.ejecutar('UPDATE mantenimientos SET coste = ?, proveedor = COALESCE(?, proveedor), fecha = ? WHERE id = ?', d.coste, d.proveedor ?? null, d.fecha, m);
    else {
      m = Number(db.ejecutar("INSERT INTO mantenimientos (inmueble_id, habitacion_id, zona, categoria, tipo, descripcion, fecha, coste, proveedor, estado, creado_por) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        n.inmueble_id, n.habitacion_id, n.zona, d.categoria || 'reparaciones', tipo, n.titulo + ' (' + (n.codigo || 'incidencia') + ')', d.fecha, d.coste, d.proveedor ?? null, n.estado === 'resuelta' ? 'terminado' : 'en_curso', usuario.id).lastInsertRowid);
      db.ejecutar('UPDATE incidencias SET mantenimiento_id = ? WHERE id = ?', m, n.id);
    }
    evento(n.id, usuario.id, 'cambio', 'Coste registrado: ' + (d.coste / 100).toLocaleString('es-ES', { minimumFractionDigits: 2 }) + ' €' + (d.proveedor ? ' (' + d.proveedor + ')' : '') + ' · se suma a los gastos del piso');
    return m;
  });
  registrar(peticion, 'incidencia.coste', { entidad: 'incidencia', id: n.id, detalle: { mantenimiento: id, coste: d.coste } });
  return { mantenimiento: id };
});

module.exports = { CATEGORIAS, ESTADOS, PRIORIDADES };
