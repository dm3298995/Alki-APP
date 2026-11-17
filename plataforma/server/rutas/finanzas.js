/* ==========================================================================
   rutas/finanzas.js — PAGOS, GASTOS, GASTOS FIJOS Y COSTES POR INMUEBLE
   ========================================================================== */
'use strict';
const db = require('../db');
const { ruta, ErrorHttp } = require('../http');
const { tiene } = require('../seguridad/permisos');
const { validar, filtroId, PERIODO } = require('../seguridad/validar');
const { registrar } = require('../servicios/auditoria');
const costes = require('../servicios/costes');
const cobros = require('../servicios/cobros');
const { hoyISO } = require('../servicios/ocupacion');

const per = (v, porDefecto) => (v && PERIODO.test(v) ? v : porDefecto);

// ---------- Pagos ----------
ruta('GET', '/api/pagos', { permiso: 'pagos.ver' }, ({ query, usuario }) => {
  const hoy = hoyISO(), actual = costes.periodoActual();
  const desde = per(query.get('desde'), costes.sumarMes(actual, -2)), hasta = per(query.get('hasta'), actual);
  const estado = query.get('estado'); const inm = filtroId(query.get('inmueble'));
  const cond = ['p.periodo BETWEEN ? AND ?'], params = [desde, hasta];
  if (inm) { cond.push('c.inmueble_id = ?'); params.push(inm); }
  if (estado === 'pagado') cond.push('p.pagado_el IS NOT NULL');
  if (estado === 'pendiente') { cond.push('p.pagado_el IS NULL AND p.cobrado = 0 AND p.vence >= ?'); params.push(hoy); }
  if (estado === 'parcial') cond.push('p.pagado_el IS NULL AND p.cobrado > 0');
  // Atrasados: con la fecha límite pasada y sin cobrar del todo (incluye parciales)
  if (estado === 'vencido') { cond.push('p.pagado_el IS NULL AND p.vence < ?'); params.push(hoy); }
  // Los atrasados y parciales se muestran siempre, aunque sean de meses anteriores al filtro
  if (estado === 'vencido' || estado === 'parcial') { cond[0] = 'p.periodo <= ?'; params.splice(0, 2, hasta); }
  const verInq = tiene(usuario, 'inquilinos.ver');
  const lista = db.todos(
    'SELECT p.*, i.codigo AS inmueble, i.id AS inmueble_id, h.codigo AS habitacion, h.id AS habitacion_id, c.codigo AS contrato, q.nombre AS inquilino FROM pagos p ' +
    'JOIN contratos c ON c.id = p.contrato_id JOIN inmuebles i ON i.id = c.inmueble_id LEFT JOIN habitaciones h ON h.id = c.habitacion_id ' +
    'LEFT JOIN inquilinos q ON q.id = c.inquilino_id WHERE ' + cond.join(' AND ') + ' ORDER BY p.vence DESC, i.codigo, h.codigo LIMIT 3000', ...params)
    .map((p) => { const d = cobros.desglose(p, hoy); return { ...p, estado: d.estado, cobrado: d.cobrado, falta: d.falta, atrasado: d.atrasado, conRetraso: d.conRetraso, inquilino: verInq ? p.inquilino : undefined }; });
  const totales = { pagado: 0, pendiente: 0, vencido: 0, nParcial: 0, nVencido: 0 };
  for (const p of lista) {
    totales.pagado += p.cobrado;
    if (p.falta) totales[p.atrasado ? 'vencido' : 'pendiente'] += p.falta;
    if (p.estado === 'parcial') totales.nParcial++;
    if (p.atrasado) totales.nVencido++;
  }
  return { desde, hasta, totales, pagos: lista };
});

ruta('PUT', '/api/pagos/:id', { permiso: 'pagos.editar' }, ({ peticion, params, cuerpo }) => {
  if (!db.uno('SELECT 1 FROM pagos WHERE id = ?', params.id)) throw new ErrorHttp(404, 'Recibo no encontrado.');
  const actual = db.uno('SELECT importe, cobrado FROM pagos WHERE id = ?', params.id);
  const d = validar(cuerpo, { pagado_el: { tipo: 'fecha' }, cobrado: { tipo: 'euros' }, metodo: { tipo: 'texto', max: 40 }, notas: { tipo: 'texto', max: 500 }, importe: { tipo: 'euros' }, vence: { tipo: 'fecha' } }, { parcial: true });
  const importe = d.importe ?? actual.importe;
  // Coherencia entre "cobrado" y "pagado_el": pagado del todo ⇔ cobrado = importe
  if (d.cobrado != null) {
    if (d.cobrado > importe) throw new ErrorHttp(400, 'Lo cobrado no puede superar el importe del recibo.');
    if (d.cobrado >= importe) d.pagado_el = d.pagado_el || hoyISO(); else d.pagado_el = null;
  } else if (d.pagado_el) d.cobrado = importe;
  else if (d.pagado_el === null) d.cobrado = 0;
  const campos = Object.keys(d);
  if (campos.length) db.ejecutar('UPDATE pagos SET ' + campos.map((c) => c + ' = ?').join(', ') + ' WHERE id = ?', ...campos.map((c) => d[c]), params.id);
  registrar(peticion, d.pagado_el ? 'pago.cobrado' : 'pago.editar', { entidad: 'pago', id: params.id, detalle: d });
  return { ok: true };
});

// ---------- Cobro masivo: varios recibos (o todos los vencidos) de una vez ----------
// Resumen de lo que está vencido ahora (para el botón y la confirmación)
ruta('GET', '/api/pagos/vencidos/resumen', { permiso: 'pagos.ver' }, () => {
  const hoy = hoyISO();
  const filas = db.todos('SELECT importe, cobrado FROM pagos WHERE pagado_el IS NULL AND vence < ?', hoy);
  return { recibos: filas.length, pendiente: filas.reduce((s, p) => s + p.importe - (p.cobrado || 0), 0), parciales: filas.filter((p) => p.cobrado > 0).length };
});

ruta('POST', '/api/pagos/cobrar-lote', { permiso: 'pagos.editar' }, ({ peticion, cuerpo }) => {
  const d = validar(cuerpo, { pagado_el: { tipo: 'fecha', req: true, etiqueta: 'Fecha de cobro' }, metodo: { tipo: 'texto', max: 40 }, todosVencidos: { tipo: 'bool' } });
  const hoy = hoyISO();
  if (d.pagado_el > hoy) throw new ErrorHttp(400, 'La fecha de cobro no puede ser futura.');
  let ids;
  if (d.todosVencidos) ids = db.todos('SELECT id FROM pagos WHERE pagado_el IS NULL AND vence < ?', hoy).map((x) => x.id);
  else {
    if (!Array.isArray(cuerpo.ids) || !cuerpo.ids.length || cuerpo.ids.length > 2000) throw new ErrorHttp(400, 'No has seleccionado ningún recibo.');
    ids = [...new Set(cuerpo.ids.map(Number))];
    if (ids.some((x) => !Number.isInteger(x) || x <= 0)) throw new ErrorHttp(400, 'Selección no válida.');
  }
  if (!ids.length) return { cobrados: 0, importe: 0 };
  let cobrados = 0, importe = 0;
  db.transaccion(() => {
    for (const id of ids) {
      const p = db.uno('SELECT id, importe, cobrado, notas FROM pagos WHERE id = ? AND pagado_el IS NULL', id);
      if (!p) continue; // ya estaba cobrado o no existe
      importe += p.importe - (p.cobrado || 0);
      db.ejecutar('UPDATE pagos SET pagado_el = ?, cobrado = importe, metodo = COALESCE(?, metodo) WHERE id = ?', d.pagado_el, d.metodo ?? null, id);
      cobrados++;
    }
  });
  registrar(peticion, 'pagos.cobro_masivo', { detalle: { recibos: cobrados, importe, fecha: d.pagado_el, todosVencidos: !!d.todosVencidos } });
  return { cobrados, importe };
});

ruta('POST', '/api/pagos', { permiso: 'pagos.editar' }, ({ peticion, cuerpo }) => {
  const d = validar(cuerpo, {
    contrato_id: { tipo: 'id', req: true, etiqueta: 'Contrato' }, periodo: { tipo: 'periodo', req: true },
    concepto: { tipo: 'enum', req: true, valores: ['renta', 'servicios', 'fianza', 'otro'] }, importe: { tipo: 'euros', req: true },
    vence: { tipo: 'fecha', req: true }, pagado_el: { tipo: 'fecha' }, metodo: { tipo: 'texto', max: 40 }, notas: { tipo: 'texto', max: 500 }
  });
  if (!db.uno('SELECT 1 FROM contratos WHERE id = ?', d.contrato_id)) throw new ErrorHttp(404, 'Contrato no encontrado.');
  if (db.uno('SELECT 1 FROM pagos WHERE contrato_id = ? AND periodo = ? AND concepto = ?', d.contrato_id, d.periodo, d.concepto)) throw new ErrorHttp(409, 'Ya existe ese recibo para ese mes.');
  const r = db.ejecutar('INSERT INTO pagos (contrato_id, periodo, concepto, importe, vence, pagado_el, cobrado, metodo, notas) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    d.contrato_id, d.periodo, d.concepto, d.importe, d.vence, d.pagado_el ?? null, d.pagado_el ? d.importe : 0, d.metodo ?? null, d.notas ?? null);
  registrar(peticion, 'pago.crear', { entidad: 'pago', id: Number(r.lastInsertRowid) });
  return { id: Number(r.lastInsertRowid) };
});

ruta('POST', '/api/pagos/generar', { permiso: 'pagos.editar' }, ({ peticion, cuerpo }) => {
  const { periodo } = validar(cuerpo, { periodo: { tipo: 'periodo', req: true } });
  const n = cobros.generarRecibos(periodo);
  registrar(peticion, 'pagos.generar', { detalle: { periodo, creados: n } });
  return { creados: n };
});

// ---------- Gastos ----------
const REGLAS_GASTO = {
  inmueble_id: { tipo: 'id', req: true, etiqueta: 'Inmueble' },
  categoria: { tipo: 'enum', req: true, valores: Object.keys(costes.CATEGORIAS), etiqueta: 'Categoría' },
  fecha: { tipo: 'fecha', req: true, etiqueta: 'Fecha' }, periodo: { tipo: 'periodo' },
  importe: { tipo: 'euros', req: true, etiqueta: 'Importe' },
  proveedor: { tipo: 'texto', max: 120 }, descripcion: { tipo: 'texto', max: 500 }
};

ruta('GET', '/api/gastos', { permiso: 'gastos.ver' }, ({ query }) => {
  costes.generarRecurrentes();
  const actual = costes.periodoActual();
  const desde = per(query.get('desde'), costes.sumarMes(actual, -2)), hasta = per(query.get('hasta'), actual);
  const cond = ['g.periodo BETWEEN ? AND ?'], params = [desde, hasta];
  const inm = filtroId(query.get('inmueble'));
  if (inm) { cond.push('g.inmueble_id = ?'); params.push(inm); }
  const cat = query.get('categoria');
  if (cat && costes.CATEGORIAS[cat]) { cond.push('g.categoria = ?'); params.push(cat); }
  if (query.get('grupo') === 'suministros') cond.push("g.categoria IN ('electricidad','agua','gas','internet')");
  const gastos = db.todos('SELECT g.*, i.codigo AS inmueble FROM gastos g JOIN inmuebles i ON i.id = g.inmueble_id WHERE ' + cond.join(' AND ') + ' ORDER BY g.fecha DESC LIMIT 3000', ...params);
  // Los mantenimientos también aparecen (son gastos automáticos)
  const mCond = ["m.estado <> 'cancelado'", 'substr(m.fecha,1,7) BETWEEN ? AND ?'], mp = [desde, hasta];
  if (inm) { mCond.push('m.inmueble_id = ?'); mp.push(inm); }
  if (cat && costes.CATEGORIAS[cat]) { mCond.push('m.categoria = ?'); mp.push(cat); }
  const mant = query.get('grupo') === 'suministros' || (cat && !['mantenimiento', 'reparaciones'].includes(cat)) ? [] :
    db.todos("SELECT m.id, m.inmueble_id, m.categoria, m.fecha, substr(m.fecha,1,7) AS periodo, m.coste AS importe, m.proveedor, m.descripcion, i.codigo AS inmueble, 'mantenimiento' AS origen FROM mantenimientos m JOIN inmuebles i ON i.id = m.inmueble_id WHERE " + mCond.join(' AND ') + ' AND m.coste > 0', ...mp);
  const lista = [...gastos.map((g) => ({ ...g, origen: g.recurrente_id ? 'fijo' : 'gasto' })), ...mant].sort((a, b) => b.fecha.localeCompare(a.fecha));
  return { desde, hasta, total: lista.reduce((s, g) => s + g.importe, 0), gastos: lista, categorias: costes.CATEGORIAS };
});

ruta('POST', '/api/gastos', { permiso: 'gastos.editar' }, ({ peticion, cuerpo, usuario }) => {
  const d = validar(cuerpo, REGLAS_GASTO);
  if (!db.uno('SELECT 1 FROM inmuebles WHERE id = ?', d.inmueble_id)) throw new ErrorHttp(404, 'Inmueble no encontrado.');
  const r = db.ejecutar('INSERT INTO gastos (inmueble_id, categoria, fecha, periodo, importe, proveedor, descripcion, creado_por) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    d.inmueble_id, d.categoria, d.fecha, d.periodo || d.fecha.slice(0, 7), d.importe, d.proveedor ?? null, d.descripcion ?? null, usuario.id);
  registrar(peticion, 'gasto.crear', { entidad: 'gasto', id: Number(r.lastInsertRowid), detalle: { categoria: d.categoria, importe: d.importe } });
  return { id: Number(r.lastInsertRowid) };
});

ruta('PUT', '/api/gastos/:id', { permiso: 'gastos.editar' }, ({ peticion, params, cuerpo }) => {
  if (!db.uno('SELECT 1 FROM gastos WHERE id = ?', params.id)) throw new ErrorHttp(404, 'Gasto no encontrado.');
  const d = validar(cuerpo, REGLAS_GASTO, { parcial: true });
  const campos = Object.keys(d);
  if (campos.length) db.ejecutar('UPDATE gastos SET ' + campos.map((c) => c + ' = ?').join(', ') + ' WHERE id = ?', ...campos.map((c) => d[c]), params.id);
  registrar(peticion, 'gasto.editar', { entidad: 'gasto', id: params.id, detalle: d });
  return { ok: true };
});

ruta('DELETE', '/api/gastos/:id', { permiso: 'gastos.editar' }, ({ peticion, params }) => {
  const g = db.uno('SELECT * FROM gastos WHERE id = ?', params.id);
  if (!g) throw new ErrorHttp(404, 'Gasto no encontrado.');
  db.ejecutar('DELETE FROM gastos WHERE id = ?', params.id);
  registrar(peticion, 'gasto.borrar', { entidad: 'gasto', id: params.id, detalle: g });
  return { ok: true };
});

// ---------- Gastos fijos mensuales ----------
ruta('POST', '/api/recurrentes', { permiso: 'gastos.editar' }, ({ peticion, cuerpo }) => {
  const d = validar(cuerpo, {
    inmueble_id: { tipo: 'id', req: true }, categoria: { tipo: 'enum', req: true, valores: Object.keys(costes.CATEGORIAS) },
    importe: { tipo: 'euros', req: true }, dia: { tipo: 'entero', min: 1, max: 28 }, desde: { tipo: 'periodo', req: true },
    hasta: { tipo: 'periodo' }, proveedor: { tipo: 'texto', max: 120 }, descripcion: { tipo: 'texto', max: 200 }
  });
  const r = db.ejecutar('INSERT INTO gastos_recurrentes (inmueble_id, categoria, importe, dia, desde, hasta, proveedor, descripcion) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    d.inmueble_id, d.categoria, d.importe, d.dia ?? 1, d.desde, d.hasta ?? null, d.proveedor ?? null, d.descripcion ?? null);
  costes.generarRecurrentes();
  registrar(peticion, 'gasto_fijo.crear', { entidad: 'gasto_recurrente', id: Number(r.lastInsertRowid) });
  return { id: Number(r.lastInsertRowid) };
});

ruta('PUT', '/api/recurrentes/:id', { permiso: 'gastos.editar' }, ({ peticion, params, cuerpo }) => {
  if (!db.uno('SELECT 1 FROM gastos_recurrentes WHERE id = ?', params.id)) throw new ErrorHttp(404, 'Gasto fijo no encontrado.');
  const d = validar(cuerpo, { importe: { tipo: 'euros' }, hasta: { tipo: 'periodo' }, activo: { tipo: 'bool' }, proveedor: { tipo: 'texto', max: 120 } }, { parcial: true });
  if (d.activo !== undefined) d.activo = d.activo ? 1 : 0;
  const campos = Object.keys(d);
  if (campos.length) db.ejecutar('UPDATE gastos_recurrentes SET ' + campos.map((c) => c + ' = ?').join(', ') + ' WHERE id = ?', ...campos.map((c) => d[c]), params.id);
  registrar(peticion, 'gasto_fijo.editar', { entidad: 'gasto_recurrente', id: params.id, detalle: d });
  return { ok: true };
});

// ---------- Costes reales por inmueble ----------
ruta('GET', '/api/costes', { permiso: 'gastos.ver' }, ({ query }) => {
  costes.generarRecurrentes();
  const actual = costes.periodoActual();
  const desde = per(query.get('desde'), costes.sumarMes(actual, -5)), hasta = per(query.get('hasta'), actual);
  if (desde > hasta) throw new ErrorHttp(400, 'El periodo no es válido.');
  const inm = filtroId(query.get('inmueble'));
  const r = costes.resumen(desde, hasta, inm);
  const inmuebles = db.todos('SELECT id, codigo, nombre FROM inmuebles WHERE activo = 1 ORDER BY codigo');
  // Tabla: coste por inmueble y categoría en el periodo
  const filas = db.todos(
    'SELECT inmueble_id, categoria, SUM(importe) AS importe FROM (' +
    'SELECT inmueble_id, categoria, importe FROM gastos WHERE periodo BETWEEN ? AND ? UNION ALL ' +
    "SELECT inmueble_id, categoria, coste FROM mantenimientos WHERE estado <> 'cancelado' AND substr(fecha,1,7) BETWEEN ? AND ?) GROUP BY inmueble_id, categoria",
    desde, hasta, desde, hasta);
  const tabla = inmuebles.map((i) => {
    const cats = {}; let total = 0;
    for (const f of filas) if (f.inmueble_id === i.id) { cats[f.categoria] = f.importe; total += f.importe; }
    return { ...i, categorias: cats, total, mediaMensual: Math.round(total / r.meses) };
  }).sort((a, b) => b.total - a.total);
  return { ...r, tabla, categorias: costes.CATEGORIAS };
});

// ---------- Coste real por inmueble agrupado por periodos ----------
// agrupar = mes | trimestre | semestre | anio. Devuelve la evolución de los
// últimos periodos, el periodo elegido con su desglose y la comparación con
// el periodo anterior y con el mismo periodo del año anterior.
const AGRUPAR = { mes: [1, 12], trimestre: [3, 8], semestre: [6, 6], anio: [12, 4] }; // [meses por periodo, cuántos mostrar]
const GRUPOS_COSTE = { alquiler: ['alquiler'], suministros: ['electricidad', 'agua', 'gas', 'internet'], limpieza: ['limpieza'], mantenimiento: ['mantenimiento', 'reparaciones'], otros: ['impuestos', 'seguros', 'comisiones', 'otros'] };
const grupoDe = (cat) => Object.keys(GRUPOS_COSTE).find((g) => GRUPOS_COSTE[g].includes(cat)) || 'otros';

function periodoDe(mes, agrupar) {
  const [a, m] = mes.split('-').map(Number);
  if (agrupar === 'mes') return { clave: mes, desde: mes, hasta: mes };
  const tam = AGRUPAR[agrupar][0];
  const n = Math.floor((m - 1) / tam);
  const desde = a + '-' + String(n * tam + 1).padStart(2, '0');
  const clave = agrupar === 'anio' ? String(a) : agrupar === 'trimestre' ? a + '-T' + (n + 1) : a + '-S' + (n + 1);
  return { clave, desde, hasta: costes.sumarMes(desde, tam - 1) };
}

ruta('GET', '/api/costes/periodos', { permiso: 'gastos.ver' }, ({ query }) => {
  costes.generarRecurrentes();
  const agrupar = AGRUPAR[query.get('agrupar')] ? query.get('agrupar') : 'mes';
  const [tam, cuantos] = AGRUPAR[agrupar];
  const inm = filtroId(query.get('inmueble'));
  const actual = costes.periodoActual();
  // Lista de periodos (del más antiguo al actual)
  const lista = [];
  let p = periodoDe(actual, agrupar);
  for (let k = 0; k < cuantos + (agrupar === 'anio' ? 1 : 4); k++) { lista.unshift(p); p = periodoDe(costes.sumarMes(p.desde, -1), agrupar); }
  const filasCoste = costes.filas(lista[0].desde, actual, inm);
  const inmuebles = db.todos('SELECT i.id, i.codigo, i.nombre, (SELECT COUNT(*) FROM habitaciones h WHERE h.inmueble_id = i.id AND h.activo = 1) AS habitaciones FROM inmuebles i WHERE i.activo = 1' + (inm ? ' AND i.id = ?' : '') + ' ORDER BY i.codigo', ...(inm ? [inm] : []));
  const habs = inmuebles.reduce((s, i) => s + i.habitaciones, 0) || 1;
  const calc = (per) => {
    const hasta = per.hasta > actual ? actual : per.hasta;
    const r = { ...per, completo: per.hasta < actual, meses: costes.periodos(per.desde, hasta).length, total: 0, grupos: Object.fromEntries(Object.keys(GRUPOS_COSTE).map((g) => [g, 0])), categorias: {}, porInmueble: {} };
    for (const f of filasCoste) {
      if (f.periodo < per.desde || f.periodo > hasta) continue;
      r.total += f.importe; r.grupos[grupoDe(f.categoria)] += f.importe;
      r.categorias[f.categoria] = (r.categorias[f.categoria] || 0) + f.importe;
      const x = r.porInmueble[f.inmueble_id] || (r.porInmueble[f.inmueble_id] = { total: 0, grupos: Object.fromEntries(Object.keys(GRUPOS_COSTE).map((g) => [g, 0])) });
      x.total += f.importe; x.grupos[grupoDe(f.categoria)] += f.importe;
    }
    r.mediaMensual = r.meses ? Math.round(r.total / r.meses) : 0;
    r.porHabitacionMes = r.meses ? Math.round(r.total / r.meses / habs) : 0;
    return r;
  };
  const todos = lista.map(calc);
  const evolucion = todos.slice(-cuantos);
  // Periodo elegido: el pedido, o el último completo
  const pedido = String(query.get('periodo') || '');
  let idx = todos.findIndex((x) => x.clave === pedido);
  if (idx < 0) { idx = todos.length - 1; if (!todos[idx].completo && todos.length > 1) idx--; }
  const sel = todos[idx];
  const anterior = todos[idx - 1] || null;
  const claveAnioAnt = agrupar === 'anio' ? String(Number(sel.clave) - 1) : (Number(sel.clave.slice(0, 4)) - 1) + sel.clave.slice(4);
  const anioAnterior = agrupar === 'anio' ? null : todos.find((x) => x.clave === claveAnioAnt) || null;
  const delta = (a, b) => (b && b.total ? Math.round(((a.total - b.total) / b.total) * 1000) / 10 : null);
  const tabla = inmuebles.map((i) => {
    const x = sel.porInmueble[i.id] || { total: 0, grupos: Object.fromEntries(Object.keys(GRUPOS_COSTE).map((g) => [g, 0])) };
    const prev = anterior?.porInmueble[i.id]?.total || 0;
    return { ...i, total: x.total, grupos: x.grupos, anterior: prev, delta: prev ? Math.round(((x.total - prev) / prev) * 1000) / 10 : null,
      porHabitacionMes: sel.meses && i.habitaciones ? Math.round(x.total / sel.meses / i.habitaciones) : 0 };
  }).sort((a, b) => b.total - a.total);
  const limpiar = (x) => x && ({ clave: x.clave, desde: x.desde, hasta: x.hasta, completo: x.completo, meses: x.meses, total: x.total, grupos: x.grupos, categorias: x.categorias, mediaMensual: x.mediaMensual, porHabitacionMes: x.porHabitacionMes });
  return {
    agrupar, inmueble: inm, habitaciones: habs, categorias: costes.CATEGORIAS, grupos: Object.keys(GRUPOS_COSTE),
    periodos: todos.slice(-cuantos).map((x) => ({ clave: x.clave, desde: x.desde, hasta: x.hasta, completo: x.completo })).reverse(),
    seleccionado: limpiar(sel), anterior: limpiar(anterior), anioAnterior: limpiar(anioAnterior),
    deltaAnterior: delta(sel, anterior), deltaAnio: delta(sel, anioAnterior),
    evolucion: evolucion.map((x) => ({ clave: x.clave, desde: x.desde, completo: x.completo, total: x.total, grupos: x.grupos, mediaMensual: x.mediaMensual })),
    tabla
  };
});
