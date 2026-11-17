/* ==========================================================================
   rutas/estadisticas.js — DATOS PARA LOS GRÁFICOS
   Recibe un periodo (desde / hasta, en meses) y devuelve series mensuales
   de ocupación, entradas y salidas, pagos y gastos.
   ========================================================================== */
'use strict';
const db = require('../db');
const { ruta, ErrorHttp } = require('../http');
const { tiene } = require('../seguridad/permisos');
const { PERIODO } = require('../seguridad/validar');
const ocup = require('../servicios/ocupacion');
const costes = require('../servicios/costes');
const { ultimoDia, desglose } = require('../servicios/cobros');

ruta('GET', '/api/estadisticas', { permiso: 'estadisticas.ver' }, ({ query, usuario }) => {
  const actual = costes.periodoActual();
  const desde = PERIODO.test(query.get('desde') || '') ? query.get('desde') : costes.sumarMes(actual, -5);
  const hasta = PERIODO.test(query.get('hasta') || '') ? query.get('hasta') : actual;
  if (desde > hasta) throw new ErrorHttp(400, 'El periodo no es válido.');
  const meses = costes.periodos(desde, hasta);
  if (meses.length > 60) throw new ErrorHttp(400, 'El periodo máximo es de 5 años.');
  const hoy = ocup.hoyISO();

  // ---------- Habitaciones ----------
  // Habitaciones en cartera cada mes: un piso cuenta desde que entró en ALKI
  // (su fecha de alta o su primer contrato, lo que sea antes)
  const habsCartera = db.todos(
    "SELECT h.id, MIN(i.creado, COALESCE((SELECT MIN(c.inicio) FROM contratos c WHERE c.inmueble_id = i.id), '9999')) AS alta FROM habitaciones h " +
    'JOIN inmuebles i ON i.id = h.inmueble_id WHERE h.activo = 1 AND i.activo = 1');
  const contratos = db.todos("SELECT habitacion_id, inicio, fin, estado FROM contratos WHERE habitacion_id IS NOT NULL AND estado <> 'reservado'");
  const ocupacion = meses.map((m) => {
    // Foto a fin de mes (o a hoy si es el mes en curso)
    const dia = m === actual ? hoy : ultimoDia(m) < hoy ? ultimoDia(m) : hoy;
    const enCartera = new Set(habsCartera.filter((h) => String(h.alta).slice(0, 10) <= dia).map((h) => h.id));
    const total = enCartera.size;
    const ocupadas = new Set(contratos.filter((c) => enCartera.has(c.habitacion_id) && c.inicio <= dia && (!c.fin || c.fin >= dia)).map((c) => c.habitacion_id)).size;
    return { periodo: m, ocupadas, total, libres: total - ocupadas, porcentaje: total ? Math.round((Math.min(ocupadas, total) / total) * 1000) / 10 : 0 };
  });
  const movimientos = meses.map((m) => ({
    periodo: m,
    entradas: contratos.filter((c) => c.inicio.slice(0, 7) === m).length,
    salidas: contratos.filter((c) => c.fin && c.fin.slice(0, 7) === m && c.fin <= hoy && c.estado !== 'activo').length
  }));
  const habs = ocup.habitaciones({ conInquilino: false });
  const resumen = ocup.resumen(habs);
  const porInmueble = {};
  for (const h of habs) {
    const k = h.inmueble.codigo;
    porInmueble[k] = porInmueble[k] || { codigo: k, id: h.inmueble.id, disponibles: 0, total: 0, ocupadas: 0 };
    porInmueble[k].total++;
    if (h.estado === 'disponible') porInmueble[k].disponibles++;
    if (h.estado === 'ocupada' || h.estado === 'por_liberar') porInmueble[k].ocupadas++;
  }
  // Próximas desocupaciones: cuántas habitaciones quedan libres en cada uno de los próximos 6 meses
  const futuras = costes.periodos(actual, costes.sumarMes(actual, 5)).map((m) => ({
    periodo: m, habitaciones: habs.filter((h) => h.actual?.fin && h.actual.fin.slice(0, 7) === m && !h.siguiente).length
  }));

  const salida = { desde, hasta, habitaciones: { resumen, ocupacion, movimientos, porInmueble: Object.values(porInmueble).sort((a, b) => b.disponibles - a.disponibles), futuras } };

  if (tiene(usuario, 'ingresos.ver')) {
    const m = new Map(db.todos('SELECT periodo, SUM(importe) AS s FROM ingresos WHERE periodo BETWEEN ? AND ? GROUP BY periodo', desde, hasta).map((x) => [x.periodo, x.s]));
    salida.otrosIngresos = { porMes: meses.map((p) => ({ periodo: p, importe: m.get(p) || 0 })), total: [...m.values()].reduce((s, v) => s + v, 0) };
  }
  if (tiene(usuario, 'pagos.ver')) {
    // ---------- Pagos ----------
    const pagos = db.todos('SELECT periodo, importe, vence, pagado_el, cobrado FROM pagos WHERE periodo BETWEEN ? AND ?', desde, hasta);
    const porMes = Object.fromEntries(meses.map((m) => [m, { periodo: m, pagado: 0, pendiente: 0, vencido: 0 }]));
    let tarde = 0, vencidos = 0, parciales = 0;
    for (const p of pagos) {
      const x = desglose(p, hoy);
      porMes[p.periodo].pagado += x.cobrado;
      if (x.falta) porMes[p.periodo][x.atrasado ? 'vencido' : 'pendiente'] += x.falta;
      if (x.atrasado) vencidos++;
      if (x.estado === 'parcial') parciales++;
      if (x.conRetraso) tarde++;
    }
    const tot = Object.values(porMes).reduce((t, m) => ({ pagado: t.pagado + m.pagado, pendiente: t.pendiente + m.pendiente, vencido: t.vencido + m.vencido }), { pagado: 0, pendiente: 0, vencido: 0 });
    salida.pagos = { porMes: Object.values(porMes), totales: tot, incidencias: { vencidos, parciales, pagadosConRetraso: tarde, recibos: pagos.length } };

    // ---------- Gastos ----------
    costes.generarRecurrentes();
    const g = costes.resumen(desde, hasta);
    const inm = db.todos('SELECT id, codigo FROM inmuebles');
    salida.gastos = {
      total: g.total, mediaMensual: g.mediaMensual, porMes: g.porMes, porCategoria: g.porCategoria.filter((c) => c.importe > 0).sort((a, b) => b.importe - a.importe),
      porInmueble: inm.map((i) => ({ codigo: i.codigo, id: i.id, importe: g.porInmueble[i.id] || 0 })).filter((x) => x.importe > 0).sort((a, b) => b.importe - a.importe)
    };
  }
  return salida;
});
