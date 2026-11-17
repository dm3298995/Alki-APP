/* ==========================================================================
   rutas/rentabilidad.js — BENEFICIO REAL DE CADA PISO
   Para cada piso y periodo:
     Ingresos      = recibos emitidos a los inquilinos (renta + servicios)
   − Costes del piso = alquiler, suministros, limpieza, mantenimientos,
                       reparaciones, impuestos y tasas, seguros, comisiones…
   − Gastos generales = gastos de la empresa (gestoría, software, oficina…)
                       repartidos según las habitaciones de cada piso
   = Beneficio antes de impuestos
   − Impuesto sobre beneficios estimado (tipo configurable)
   = Beneficio neto estimado
   También: registro rápido de gastos de un mes (lote) e importación por CSV.
   ========================================================================== */
'use strict';
const db = require('../db');
const { ruta, ErrorHttp } = require('../http');
const { validar, PERIODO, FECHA } = require('../seguridad/validar');
const { registrar } = require('../servicios/auditoria');
const costes = require('../servicios/costes');
const { cobradoDe } = require('../servicios/cobros');
const { parsearCSV } = require('../integraciones/csv-homming');

const ajustes = () => ({
  tipoImpuesto: db.ajuste('tipo_impuesto_beneficios', 23),        // % (Impuesto sobre Sociedades, pyme)
  gastosGeneralesMes: db.ajuste('gastos_generales_mes', 0),       // céntimos al mes, toda la empresa
  detalleGenerales: db.ajuste('gastos_generales_detalle', '')
});

ruta('GET', '/api/rentabilidad', { permiso: 'rentabilidad.ver' }, ({ query }) => {
  costes.generarRecurrentes();
  const actual = costes.periodoActual();
  const desde = PERIODO.test(query.get('desde') || '') ? query.get('desde') : costes.sumarMes(actual, -11);
  const hasta = PERIODO.test(query.get('hasta') || '') ? query.get('hasta') : actual;
  if (desde > hasta) throw new ErrorHttp(400, 'El periodo no es válido.');
  const meses = costes.periodos(desde, hasta);
  if (meses.length > 60) throw new ErrorHttp(400, 'El periodo máximo es de 5 años.');
  const aj = ajustes();

  const inmuebles = db.todos('SELECT i.id, i.codigo, i.nombre, i.barrio, (SELECT COUNT(*) FROM habitaciones h WHERE h.inmueble_id = i.id AND h.activo = 1) AS habitaciones FROM inmuebles i WHERE i.activo = 1 ORDER BY i.codigo');
  const totalHabs = inmuebles.reduce((s, i) => s + i.habitaciones, 0) || 1;

  // Ingresos por piso y mes (lo emitido) y lo cobrado
  const ing = db.todos('SELECT c.inmueble_id, p.periodo, p.importe, p.cobrado, p.pagado_el FROM pagos p JOIN contratos c ON c.id = p.contrato_id WHERE p.periodo BETWEEN ? AND ?', desde, hasta);
  const ingresos = new Map();
  for (const p of ing) {
    const k = p.inmueble_id + '|' + p.periodo;
    const x = ingresos.get(k) || { emitido: 0, cobrado: 0 };
    x.emitido += p.importe; x.cobrado += cobradoDe(p);
    ingresos.set(k, x);
  }
  // Ingresos manuales (penalizaciones, cargos, reembolsos…): del piso o de la empresa
  const manualEmpresa = new Map();
  for (const g of db.todos('SELECT inmueble_id, periodo, SUM(importe) AS importe FROM ingresos WHERE periodo BETWEEN ? AND ? GROUP BY inmueble_id, periodo', desde, hasta)) {
    if (!g.inmueble_id) { manualEmpresa.set(g.periodo, g.importe); continue; }
    const k = g.inmueble_id + '|' + g.periodo;
    const x = ingresos.get(k) || { emitido: 0, cobrado: 0 };
    x.emitido += g.importe; x.cobrado += g.importe; x.manual = (x.manual || 0) + g.importe;
    ingresos.set(k, x);
  }
  // Costes por piso, mes y categoría (gastos + mantenimientos)
  const filas = db.todos(
    'SELECT inmueble_id, periodo, categoria, SUM(importe) AS importe FROM (' +
    '  SELECT inmueble_id, periodo, categoria, importe FROM gastos WHERE periodo BETWEEN ? AND ?' +
    '  UNION ALL' +
    "  SELECT inmueble_id, substr(fecha, 1, 7), categoria, coste FROM mantenimientos WHERE estado <> 'cancelado' AND substr(fecha, 1, 7) BETWEEN ? AND ?" +
    ') GROUP BY inmueble_id, periodo, categoria', desde, hasta, desde, hasta);
  const coste = new Map();
  for (const f of filas) {
    const k = f.inmueble_id + '|' + f.periodo;
    const x = coste.get(k) || {};
    x[f.categoria] = (x[f.categoria] || 0) + f.importe;
    coste.set(k, x);
  }
  // Ocupación media del periodo (para la calculadora)
  const contratos = db.todos("SELECT inmueble_id, habitacion_id, inicio, fin FROM contratos WHERE habitacion_id IS NOT NULL AND estado <> 'reservado'");

  const GRUPOS = { alquiler: ['alquiler'], suministros: ['electricidad', 'agua', 'gas', 'internet'], limpieza: ['limpieza'], mantenimiento: ['mantenimiento', 'reparaciones'],
    impuestos: ['impuestos'], seguros: ['seguros'], otros: ['comisiones', 'otros'] };

  const porPiso = inmuebles.map((i) => {
    const r = { ...i, ingresos: 0, cobrado: 0, otrosIngresos: 0, categorias: {}, grupos: Object.fromEntries(Object.keys(GRUPOS).map((g) => [g, 0])), costes: 0, porMes: [] };
    const parteGenerales = Math.round(aj.gastosGeneralesMes * (i.habitaciones / totalHabs));
    let mesesActivo = 0;
    for (const m of meses) {
      const ii = ingresos.get(i.id + '|' + m) || { emitido: 0, cobrado: 0 };
      const cc = coste.get(i.id + '|' + m) || {};
      const totalC = Object.values(cc).reduce((s, v) => s + v, 0);
      const activo = ii.emitido > 0 || totalC > 0;
      if (activo) mesesActivo++;
      const gen = activo ? parteGenerales : 0;
      r.ingresos += ii.emitido; r.cobrado += ii.cobrado; r.otrosIngresos += ii.manual || 0; r.costes += totalC;
      for (const [cat, v] of Object.entries(cc)) r.categorias[cat] = (r.categorias[cat] || 0) + v;
      r.porMes.push({ periodo: m, ingresos: ii.emitido, costes: totalC + gen, beneficio: ii.emitido - totalC - gen });
    }
    for (const [g, cats] of Object.entries(GRUPOS)) r.grupos[g] = cats.reduce((s, c) => s + (r.categorias[c] || 0), 0);
    r.generales = parteGenerales * mesesActivo;
    r.mesesActivo = mesesActivo;
    r.beneficio = r.ingresos - r.costes - r.generales;
    r.impuesto = Math.max(0, Math.round(r.beneficio * aj.tipoImpuesto / 100));
    r.neto = r.beneficio - r.impuesto;
    r.margen = r.ingresos ? Math.round((r.beneficio / r.ingresos) * 1000) / 10 : null;
    r.porHabitacionMes = mesesActivo && i.habitaciones ? Math.round(r.beneficio / mesesActivo / i.habitaciones) : 0;
    // Medias mensuales para la calculadora
    const md = (v) => (mesesActivo ? Math.round(v / mesesActivo) : 0);
    const habsIds = new Set(contratos.filter((c) => c.inmueble_id === i.id).map((c) => c.habitacion_id));
    let ocupadas = 0, huecos = 0;
    for (const m of meses) {
      const dia = m + '-15';
      for (const h of habsIds) { huecos++; if (contratos.some((c) => c.habitacion_id === h && c.inicio <= dia && (!c.fin || c.fin >= dia))) ocupadas++; }
    }
    const rentaMedia = db.uno("SELECT AVG(renta + servicios) AS r FROM contratos WHERE inmueble_id = ? AND estado = 'activo'", i.id).r || 0;
    r.calculadora = {
      habitaciones: i.habitaciones, precioMedio: Math.round(rentaMedia), ocupacion: huecos ? Math.round((ocupadas / huecos) * 100) : 0,
      alquiler: md(r.grupos.alquiler), suministros: md(r.grupos.suministros), limpieza: md(r.grupos.limpieza), mantenimiento: md(r.grupos.mantenimiento),
      impuestos: md(r.grupos.impuestos), seguros: md(r.grupos.seguros), otros: md(r.grupos.otros)
    };
    delete r.categorias;
    return r;
  });

  const total = porPiso.reduce((t, p) => {
    for (const k of ['ingresos', 'cobrado', 'costes', 'generales', 'beneficio', 'impuesto', 'neto']) t[k] += p[k];
    for (const g of Object.keys(GRUPOS)) t.grupos[g] += p.grupos[g];
    return t;
  }, { ingresos: 0, cobrado: 0, costes: 0, generales: 0, beneficio: 0, impuesto: 0, neto: 0, grupos: Object.fromEntries(Object.keys(GRUPOS).map((g) => [g, 0])) });
  // Ingresos manuales sin piso: son de la empresa (suman al total, no a un piso)
  total.otrosIngresosEmpresa = meses.reduce((s, m) => s + (manualEmpresa.get(m) || 0), 0);
  total.otrosIngresos = porPiso.reduce((s, p) => s + p.otrosIngresos, 0) + total.otrosIngresosEmpresa;
  total.ingresos += total.otrosIngresosEmpresa; total.cobrado += total.otrosIngresosEmpresa; total.beneficio += total.otrosIngresosEmpresa;
  // El impuesto real se paga por el beneficio de toda la empresa (los pisos con pérdidas lo compensan)
  total.impuestoEmpresa = Math.max(0, Math.round(total.beneficio * aj.tipoImpuesto / 100));
  total.netoEmpresa = total.beneficio - total.impuestoEmpresa;
  total.margen = total.ingresos ? Math.round((total.beneficio / total.ingresos) * 1000) / 10 : null;
  const porMes = meses.map((m, k) => ({ periodo: m, ingresos: porPiso.reduce((s, p) => s + p.porMes[k].ingresos, 0) + (manualEmpresa.get(m) || 0), costes: porPiso.reduce((s, p) => s + p.porMes[k].costes, 0) }))
    .map((x) => ({ ...x, beneficio: x.ingresos - x.costes }));

  return { desde, hasta, meses: meses.length, ajustes: aj, total, porMes, pisos: porPiso.sort((a, b) => b.beneficio - a.beneficio) };
});

ruta('PUT', '/api/rentabilidad/ajustes', { permiso: 'rentabilidad.editar' }, ({ peticion, cuerpo }) => {
  const d = validar(cuerpo, { tipoImpuesto: { tipo: 'entero', min: 0, max: 50, etiqueta: 'Tipo del impuesto' }, gastosGeneralesMes: { tipo: 'euros', etiqueta: 'Gastos generales' },
    detalleGenerales: { tipo: 'texto', max: 500 } }, { parcial: true });
  if (d.tipoImpuesto !== undefined) db.guardarAjuste('tipo_impuesto_beneficios', d.tipoImpuesto);
  if (d.gastosGeneralesMes !== undefined) db.guardarAjuste('gastos_generales_mes', d.gastosGeneralesMes ?? 0);
  if (d.detalleGenerales !== undefined) db.guardarAjuste('gastos_generales_detalle', d.detalleGenerales || '');
  registrar(peticion, 'rentabilidad.ajustes', { detalle: d });
  return { ok: true, ajustes: ajustes() };
});

// ---------- Registro rápido de gastos de un mes (varios pisos a la vez) ----------
ruta('GET', '/api/gastos/mes', { permiso: 'gastos.ver' }, ({ query }) => {
  const periodo = PERIODO.test(query.get('periodo') || '') ? query.get('periodo') : costes.periodoActual();
  const anterior = costes.sumarMes(periodo, -1);
  const inm = db.todos('SELECT id, codigo, nombre FROM inmuebles WHERE activo = 1 ORDER BY codigo');
  const suma = (p) => {
    const m = new Map();
    for (const f of db.todos('SELECT inmueble_id, categoria, SUM(importe) AS importe, COUNT(*) AS n FROM gastos WHERE periodo = ? GROUP BY inmueble_id, categoria', p)) m.set(f.inmueble_id + '|' + f.categoria, f);
    return m;
  };
  const este = suma(periodo), prev = suma(anterior);
  return { periodo, anterior, pisos: inm.map((i) => ({ ...i,
    actual: Object.fromEntries(Object.keys(costes.CATEGORIAS).map((c) => [c, este.get(i.id + '|' + c)?.importe || 0])),
    previo: Object.fromEntries(Object.keys(costes.CATEGORIAS).map((c) => [c, prev.get(i.id + '|' + c)?.importe || 0])) })) };
});

ruta('POST', '/api/gastos/lote', { permiso: 'gastos.editar', maxBytes: 512 * 1024 }, ({ peticion, cuerpo, usuario }) => {
  const { periodo, fecha } = validar(cuerpo, { periodo: { tipo: 'periodo', req: true, etiqueta: 'Mes' }, fecha: { tipo: 'fecha', req: true, etiqueta: 'Fecha' } });
  if (!Array.isArray(cuerpo.filas) || !cuerpo.filas.length || cuerpo.filas.length > 600) throw new ErrorHttp(400, 'No hay gastos que guardar.');
  const filas = cuerpo.filas.map((f, n) => {
    try {
      return validar(f, { inmueble_id: { tipo: 'id', req: true }, categoria: { tipo: 'enum', req: true, valores: Object.keys(costes.CATEGORIAS) },
        importe: { tipo: 'euros', req: true }, proveedor: { tipo: 'texto', max: 120 }, descripcion: { tipo: 'texto', max: 300 } });
    } catch (e) { throw new ErrorHttp(400, 'Fila ' + (n + 1) + ': ' + e.message); }
  }).filter((f) => f.importe > 0);
  const ids = new Set(db.todos('SELECT id FROM inmuebles').map((i) => i.id));
  if (filas.some((f) => !ids.has(f.inmueble_id))) throw new ErrorHttp(400, 'Hay un piso que no existe.');
  db.transaccion(() => {
    for (const f of filas) db.ejecutar('INSERT INTO gastos (inmueble_id, categoria, fecha, periodo, importe, proveedor, descripcion, creado_por) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      f.inmueble_id, f.categoria, fecha, periodo, f.importe, f.proveedor ?? null, f.descripcion ?? 'Registro mensual de ' + periodo, usuario.id);
  });
  registrar(peticion, 'gastos.lote', { detalle: { periodo, apuntes: filas.length, total: filas.reduce((s, f) => s + f.importe, 0) } });
  return { creados: filas.length };
});

// ---------- Importar gastos desde CSV (facturas de luz, agua, etc.) ----------
// Columnas: piso (código) ; categoría ; fecha ; importe ; proveedor ; descripción ; mes (opcional)
const ALIAS_CAT = { luz: 'electricidad', electricidad: 'electricidad', agua: 'agua', gas: 'gas', internet: 'internet', wifi: 'internet', fibra: 'internet', limpieza: 'limpieza',
  alquiler: 'alquiler', renta: 'alquiler', mantenimiento: 'mantenimiento', reparacion: 'reparaciones', reparaciones: 'reparaciones', impuestos: 'impuestos', impuesto: 'impuestos',
  tasa: 'impuestos', tasas: 'impuestos', ibi: 'impuestos', basura: 'impuestos', seguro: 'seguros', seguros: 'seguros', comision: 'comisiones', comisiones: 'comisiones', otros: 'otros', otro: 'otros' };
ruta('POST', '/api/gastos/importar', { permiso: 'gastos.editar', crudo: true, maxBytes: 5 * 1024 * 1024 }, ({ peticion, cuerpo, query, usuario }) => {
  let texto = cuerpo.toString('utf8');
  if (texto.includes('�')) texto = cuerpo.toString('latin1');
  const filas = parsearCSV(texto);
  if (filas.length < 2) throw new ErrorHttp(400, 'El archivo está vacío.');
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const cab = filas[0].map(norm);
  const col = (...n) => cab.findIndex((c) => n.some((x) => c.startsWith(x)));
  const ix = { piso: col('piso', 'inmueble', 'codigo'), cat: col('categ', 'tipo', 'concepto'), fecha: col('fecha'), importe: col('importe', 'total', 'cantidad'), prov: col('proveedor', 'empresa'), desc: col('descrip', 'detalle'), mes: col('mes', 'periodo') };
  if (ix.piso < 0 || ix.cat < 0 || ix.importe < 0) throw new ErrorHttp(400, 'Faltan columnas. Necesito al menos: piso, categoría e importe.');
  const pisos = new Map(db.todos('SELECT id, codigo FROM inmuebles').map((i) => [norm(i.codigo), i.id]));
  const ok = [], errores = [];
  filas.slice(1).forEach((f, n) => {
    const v = (k) => (ix[k] >= 0 ? String(f[ix[k]] || '').trim() : '');
    const id = pisos.get(norm(v('piso')));
    const cat = ALIAS_CAT[norm(v('cat')).replace(/[^a-z]/g, '')];
    const imp = Number(v('importe').replace(/[€\s]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'));
    let fecha = v('fecha');
    const m = fecha.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) fecha = m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
    if (!fecha) fecha = new Date().toISOString().slice(0, 10);
    const mes = PERIODO.test(v('mes')) ? v('mes') : fecha.slice(0, 7);
    if (!id) return errores.push('Fila ' + (n + 2) + ': no encuentro el piso «' + v('piso') + '».');
    if (!cat) return errores.push('Fila ' + (n + 2) + ': categoría «' + v('cat') + '» no reconocida.');
    if (!Number.isFinite(imp) || imp <= 0 || imp > 100000) return errores.push('Fila ' + (n + 2) + ': importe no válido.');
    if (!FECHA.test(fecha)) return errores.push('Fila ' + (n + 2) + ': fecha no válida (usa dd/mm/aaaa).');
    ok.push([id, cat, fecha, mes, Math.round(imp * 100), v('prov').slice(0, 120) || null, v('desc').slice(0, 300) || null]);
  });
  if (query.get('probar') !== '1' && ok.length) db.transaccion(() => { for (const r of ok) db.ejecutar('INSERT INTO gastos (inmueble_id, categoria, fecha, periodo, importe, proveedor, descripcion, creado_por) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', ...r, usuario.id); });
  if (query.get('probar') !== '1') registrar(peticion, 'gastos.importar', { detalle: { importados: ok.length, errores: errores.length } });
  return { validos: ok.length, total: ok.reduce((s, r) => s + r[4], 0), errores: errores.slice(0, 50), nErrores: errores.length, probado: query.get('probar') === '1' };
});
