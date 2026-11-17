/* ==========================================================================
   rutas/panel.js — PANEL PRINCIPAL (Dashboard)
   Lo que hay que ver nada más entrar: habitaciones, próximas salidas
   (agrupadas por urgencia), alertas y, si el rol lo permite, pagos y gastos.
   Todas las cifras salen de los mismos datos que las fichas de detalle.
   ========================================================================== */
'use strict';
const db = require('../db');
const { ruta } = require('../http');
const { tiene } = require('../seguridad/permisos');
const ocup = require('../servicios/ocupacion');
const costes = require('../servicios/costes');
const { desglose } = require('../servicios/cobros');

const eur = (c) => (c / 100).toLocaleString('es-ES', { maximumFractionDigits: 0 }) + ' €';

/* Facturas de suministros más altas de lo normal: compara la última factura de
   cada tipo con la media de las 6 anteriores del mismo piso. */
function suministrosAnomalos() {
  const filas = db.todos(
    "SELECT g.id, g.inmueble_id, i.codigo, g.categoria, g.periodo, g.importe FROM gastos g JOIN inmuebles i ON i.id = g.inmueble_id " +
    "WHERE g.categoria IN ('electricidad','agua','gas') AND i.activo = 1 AND g.periodo >= ? ORDER BY g.inmueble_id, g.categoria, g.periodo DESC",
    costes.sumarMes(costes.periodoActual(), -14));
  const grupos = new Map();
  for (const f of filas) { const k = f.inmueble_id + '|' + f.categoria; if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(f); }
  const out = [];
  for (const lista of grupos.values()) {
    const [ultima, ...previas] = lista;
    if (previas.length < 3 || ultima.periodo < costes.sumarMes(costes.periodoActual(), -1)) continue;
    const media = previas.slice(0, 6).reduce((s, f) => s + f.importe, 0) / Math.min(previas.length, 6);
    if (ultima.importe > media * 1.35 && ultima.importe - media > 3000) out.push({ ...ultima, media: Math.round(media), subida: Math.round((ultima.importe / media - 1) * 100) });
  }
  return out.sort((a, b) => b.subida - a.subida);
}

ruta('GET', '/api/panel', { permiso: 'panel.ver' }, ({ usuario }) => {
  const verInq = tiene(usuario, 'inquilinos.ver');
  const verFin = tiene(usuario, 'pagos.ver');
  const verGastos = tiene(usuario, 'gastos.ver');
  const hoy = ocup.hoyISO();
  const habs = ocup.habitaciones({ conInquilino: verInq });
  const r = ocup.resumen(habs);
  const aviso = ocup.diasAviso();
  const pagosContrato = verFin ? ocup.estadoPagosContratos(habs.filter((h) => h.actual).map((h) => h.actual.id), hoy) : new Map();
  const salidas = ocup.proximasSalidas(habs).filter((s) => s.diasRestantes <= aviso)
    .map((s) => ({ ...s, pagos: verFin ? (pagosContrato.get(s.contratoId)?.estado || 'al_dia') : undefined }));

  // Resumen por inmueble (para la tabla de ocupación)
  const porInmueble = new Map();
  for (const h of habs) {
    const k = h.inmueble.id;
    if (!porInmueble.has(k)) porInmueble.set(k, { ...h.inmueble, total: 0, ocupadas: 0, disponibles: 0, reservadas: 0, porLiberar: 0, bloqueadas: 0 });
    const f = porInmueble.get(k);
    f.total++;
    if (h.estado === 'ocupada' || h.estado === 'por_liberar') f.ocupadas++;
    if (h.estado === 'por_liberar') f.porLiberar++;
    if (h.estado === 'disponible') f.disponibles++;
    if (h.estado === 'reservada') f.reservadas++;
    if (h.estado === 'mantenimiento' || h.estado === 'no_disponible') f.bloqueadas++;
  }

  // ---------- Alertas (de más a menos urgente) ----------
  const alertas = [];
  const en = (max, min = -9999) => salidas.filter((s) => s.diasRestantes <= max && s.diasRestantes > min && !s.siguiente && s.renovacion !== 'solicitada' && s.renovacion !== 'en_negociacion');
  const u15 = en(15), u30 = en(30, 15);
  if (u15.length) alertas.push({ nivel: 'critico', tipo: 'salidas', texto: u15.length + ' habitación(es) quedan libres en menos de 15 días sin nueva reserva' + (u15.length <= 3 ? ': ' + u15.map((s) => s.inmueble.codigo + '-' + s.habitacion).join(', ') : ''), enlace: '#/habitaciones?estado=por_liberar' });
  const renov = salidas.filter((s) => s.renovacion === 'solicitada' || s.renovacion === 'en_negociacion');
  if (renov.length) alertas.push({ nivel: 'serio', tipo: 'renovacion', texto: renov.length + ' contrato(s) pendientes de renovación: ' + renov.slice(0, 3).map((s) => s.inmueble.codigo + '-' + s.habitacion + ' (vence ' + s.fin.split('-').reverse().slice(0, 2).join('/') + ')').join(', '), enlace: '#/contratos?vista=renovacion' });
  if (u30.length) alertas.push({ nivel: 'serio', tipo: 'salidas', texto: u30.length + ' habitación(es) quedan libres en 15–30 días sin nueva reserva', enlace: '#/habitaciones?estado=por_liberar' });
  const vencidosSinRenovar = habs.filter((h) => h.actual && h.actual.fin && h.actual.diasRestantes < 0);
  if (vencidosSinRenovar.length) alertas.push({ nivel: 'serio', tipo: 'contratos', texto: vencidosSinRenovar.length + ' contrato(s) con fecha de fin pasada siguen activos', enlace: '#/habitaciones?estado=por_liberar' });
  if (r.disponibles) alertas.push({ nivel: 'aviso', tipo: 'disponibles', texto: r.disponibles + ' habitación(es) disponibles sin reserva', enlace: '#/habitaciones?estado=disponible' });
  const proxEntradas = habs.filter((h) => h.siguiente && ocup.diasEntre(hoy, h.siguiente.inicio) <= 7);
  if (proxEntradas.length) alertas.push({ nivel: 'info', tipo: 'entradas', texto: proxEntradas.length + ' entrada(s) de nuevos inquilinos esta semana: preparar llaves e inventario', enlace: '#/contratos?vista=proximos' });
  const mant = db.uno("SELECT COUNT(*) AS n, SUM(estado = 'pendiente') AS p, SUM(julianday(?) - julianday(fecha) > 7 AND estado = 'pendiente') AS viejos FROM mantenimientos WHERE estado IN ('pendiente','en_curso')", hoy);
  if (mant.n) alertas.push({ nivel: mant.viejos ? 'aviso' : 'info', tipo: 'mantenimientos', texto: mant.n + ' mantenimiento(s) abiertos (' + mant.p + ' pendientes' + (mant.viejos ? ', ' + mant.viejos + ' desde hace más de una semana' : '') + ')', enlace: '#/mantenimientos?estado=abiertos' });

  let pagos = null, gastos = null;
  if (verFin) {
    const periodo = costes.periodoActual();
    const lista = db.todos('SELECT importe, vence, pagado_el, cobrado FROM pagos WHERE periodo = ?', periodo);
    pagos = { periodo, cobrado: 0, pendiente: 0, vencido: 0, recibos: lista.length, nPendientes: 0, esperado: 0 };
    for (const p of lista) {
      const x = desglose(p, hoy);
      pagos.esperado += p.importe;
      pagos.cobrado += x.cobrado;
      if (x.falta) { pagos[x.atrasado ? 'vencido' : 'pendiente'] += x.falta; pagos.nPendientes++; }
    }
    const abiertos = db.todos('SELECT importe, vence, pagado_el, cobrado FROM pagos WHERE pagado_el IS NULL AND vence < ?', hoy);
    pagos.vencidosTotal = abiertos.reduce((t, p) => t + desglose(p, hoy).falta, 0);
    pagos.nVencidos = abiertos.length;
    pagos.nParciales = db.uno('SELECT COUNT(*) AS n FROM pagos WHERE pagado_el IS NULL AND cobrado > 0').n;
    if (pagos.nVencidos) alertas.unshift({ nivel: 'critico', tipo: 'pagos', texto: pagos.nVencidos + ' recibo(s) atrasados por ' + eur(pagos.vencidosTotal) + (pagos.nParciales ? ' (' + pagos.nParciales + ' con pago parcial)' : ''), enlace: '#/pagos?estado=vencido' });

  }
  if (verGastos) {
    const periodo = costes.periodoActual();
    const anterior = costes.sumarMes(periodo, -1);
    const este = costes.resumen(periodo, periodo);
    const previo = costes.resumen(anterior, anterior);
    gastos = { periodo, total: este.total, suministros: este.suministros, mantenimiento: este.mantenimiento, anterior: previo.total, anteriorPeriodo: anterior };
    for (const f of porInmueble.values()) f.gastoMes = este.porInmueble[f.id] || 0;

    const NOMBRE = { electricidad: 'luz', agua: 'agua', gas: 'gas' };
    for (const a of suministrosAnomalos().slice(0, 2)) {
      alertas.push({ nivel: 'aviso', tipo: 'suministros', texto: 'Factura de ' + NOMBRE[a.categoria] + ' de ' + a.codigo + ' un ' + a.subida + ' % más alta de lo habitual (' + eur(a.importe) + ' frente a ' + eur(a.media) + ' de media)', enlace: '#/inmuebles/' + a.inmueble_id });
    }
  }

  // Ingresos registrados a mano este mes
  let ingresosMes = null;
  if (tiene(usuario, 'ingresos.ver')) {
    const g = db.uno('SELECT COUNT(*) AS n, COALESCE(SUM(importe), 0) AS total FROM ingresos WHERE periodo = ?', costes.periodoActual());
    ingresosMes = { n: g.n, total: g.total };
  }

  // Incidencias del equipo
  let incidencias = null;
  if (tiene(usuario, 'incidencias.ver')) {
    const r2 = db.uno("SELECT COUNT(*) AS n, SUM(prioridad = 'urgente') AS urgentes, SUM(asignado_a IS NULL) AS sinAsignar, SUM(asignado_a = ?) AS mias FROM incidencias WHERE estado <> 'resuelta'", usuario.id);
    incidencias = { ...r2, lista: db.todos(
      "SELECT n.id, n.codigo, n.titulo, n.prioridad, n.estado, n.creado, i.codigo AS inmueble, h.codigo AS habitacion, u.nombre AS asignado FROM incidencias n JOIN inmuebles i ON i.id = n.inmueble_id " +
      "LEFT JOIN habitaciones h ON h.id = n.habitacion_id LEFT JOIN usuarios u ON u.id = n.asignado_a WHERE n.estado <> 'resuelta' " +
      "ORDER BY n.asignado_a = ? DESC, CASE n.prioridad WHEN 'urgente' THEN 0 WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END, n.creado LIMIT 6", usuario.id) };
    if (r2.urgentes) alertas.unshift({ nivel: 'critico', tipo: 'incidencias', texto: r2.urgentes + ' incidencia(s) urgentes abiertas', enlace: '#/incidencias' });
    if (r2.sinAsignar) alertas.push({ nivel: 'aviso', tipo: 'incidencias', texto: r2.sinAsignar + ' incidencia(s) nuevas sin asignar a nadie', enlace: '#/incidencias?filtro=sin' });
  }

  const integ = db.todos("SELECT nombre FROM integraciones WHERE activa = 1 AND ultimo_estado = 'error'");
  for (const i of integ) alertas.push({ nivel: 'serio', tipo: 'integracion', texto: 'La sincronización con ' + i.nombre + ' está fallando. Los datos pueden no estar al día.', enlace: '#/admin/integraciones' });

  return {
    hoy, diasAviso: aviso, habitaciones: r, proximasSalidas: salidas,
    grupos: { u15: salidas.filter((s) => s.diasRestantes <= 15).length, u30: salidas.filter((s) => s.diasRestantes > 15 && s.diasRestantes <= 30).length, u60: salidas.filter((s) => s.diasRestantes > 30).length },
    alertas, pagos, gastos, incidencias, ingresosMes,
    inmuebles: [...porInmueble.values()].sort((a, b) => b.disponibles - a.disponibles || b.porLiberar - a.porLiberar || a.codigo.localeCompare(b.codigo))
  };
});
