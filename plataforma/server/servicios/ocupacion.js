/* ==========================================================================
   ocupacion.js — ESTADO DE CADA HABITACIÓN
   El estado NO se escribe a mano: se calcula a partir de los contratos, así
   siempre está actualizado.
     · mantenimiento / no_disponible → bloqueada manualmente
     · ocupada        → tiene un contrato en vigor
     · por_liberar    → ocupada, pero el contrato acaba en ≤ N días (aviso)
     · reservada      → libre hoy, con un contrato que empieza más adelante
     · disponible     → ni contrato en vigor ni reserva
   ========================================================================== */
'use strict';
const db = require('../db');

const hoyISO = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
const diasEntre = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
const diasAviso = () => db.ajuste('dias_aviso_salida', 60);

/* Devuelve las habitaciones con su estado y contratos actual / siguiente.
   opciones: { inmuebleId, habitacionId, fecha, conInquilino } */
function habitaciones({ inmuebleId = null, habitacionId = null, fecha = hoyISO(), conInquilino = true } = {}) {
  const filtro = [], params = [];
  if (inmuebleId) { filtro.push('h.inmueble_id = ?'); params.push(inmuebleId); }
  if (habitacionId) { filtro.push('h.id = ?'); params.push(habitacionId); }
  const habs = db.todos(
    'SELECT h.*, i.codigo AS inmueble_codigo, i.nombre AS inmueble_nombre FROM habitaciones h JOIN inmuebles i ON i.id = h.inmueble_id ' +
    'WHERE h.activo = 1 AND i.activo = 1 ' + (filtro.length ? 'AND ' + filtro.join(' AND ') : '') + ' ORDER BY i.codigo, h.codigo', ...params);
  if (!habs.length) return [];

  const ids = habs.map((h) => h.id);
  const contratos = db.todos(
    "SELECT c.id, c.codigo, c.habitacion_id, c.estado, c.inicio, c.fin, c.renta, c.servicios, c.renovacion, c.renovacion_de, q.nombre AS inquilino FROM contratos c " +
    "LEFT JOIN inquilinos q ON q.id = c.inquilino_id WHERE c.estado IN ('activo','reservado') AND c.habitacion_id IN (" + ids.map(() => '?').join(',') + ') ORDER BY c.inicio',
    ...ids);
  const porHab = new Map();
  for (const c of contratos) { if (!porHab.has(c.habitacion_id)) porHab.set(c.habitacion_id, []); porHab.get(c.habitacion_id).push(c); }

  const aviso = diasAviso();
  return habs.map((h) => {
    const lista = porHab.get(h.id) || [];
    // En vigor: empezó y no ha terminado. Un contrato "activo" con fecha de fin
    // pasada se sigue considerando en vigor (se avisa como "fin vencido").
    const actual = lista.filter((c) => c.estado === 'activo' && c.inicio <= fecha).pop() || null;
    const siguiente = lista.find((c) => c.inicio > fecha && c !== actual) || null;
    let estado;
    if (h.bloqueo) estado = h.bloqueo;
    else if (actual) estado = actual.fin && diasEntre(fecha, actual.fin) <= aviso ? 'por_liberar' : 'ocupada';
    else if (siguiente) estado = 'reservada';
    else estado = 'disponible';
    const ver = (c) => c && { id: c.id, codigo: c.codigo, inicio: c.inicio, fin: c.fin, renta: c.renta, servicios: c.servicios, renovacion: c.renovacion, esRenovacion: !!c.renovacion_de,
      inquilino: conInquilino ? c.inquilino : undefined,
      diasRestantes: c.fin ? diasEntre(fecha, c.fin) : null };
    return {
      id: h.id, codigo: h.codigo, nombre: h.nombre, precio: h.precio, bloqueo: h.bloqueo, tipo: h.tipo, m2: h.m2, caracteristicas: h.caracteristicas,
      inmueble: { id: h.inmueble_id, codigo: h.inmueble_codigo, nombre: h.inmueble_nombre },
      estado, actual: ver(actual), siguiente: ver(siguiente)
    };
  });
}

function resumen(lista) {
  const r = { total: lista.length, ocupadas: 0, disponibles: 0, reservadas: 0, porLiberar: 0, bloqueadas: 0 };
  for (const h of lista) {
    if (h.estado === 'ocupada') r.ocupadas++;
    else if (h.estado === 'por_liberar') { r.ocupadas++; r.porLiberar++; }
    else if (h.estado === 'reservada') r.reservadas++;
    else if (h.estado === 'disponible') r.disponibles++;
    else r.bloqueadas++;
  }
  r.ocupacion = r.total ? Math.round((r.ocupadas / r.total) * 1000) / 10 : 0;
  return r;
}

// Próximas salidas: habitaciones ocupadas ordenadas por fecha de fin
function proximasSalidas(lista, limite = 200) {
  return lista.filter((h) => h.actual && h.actual.fin)
    .sort((a, b) => a.actual.fin.localeCompare(b.actual.fin))
    .slice(0, limite)
    .map((h) => ({
      habitacionId: h.id, habitacion: h.codigo, tipo: h.tipo, inmueble: h.inmueble, inquilino: h.actual.inquilino, renta: h.actual.renta, renovacion: h.actual.renovacion, contrato: h.actual.codigo,
      fin: h.actual.fin, diasRestantes: h.actual.diasRestantes, estado: h.estado,
      contratoId: h.actual.id, siguiente: h.siguiente ? { inicio: h.siguiente.inicio, inquilino: h.siguiente.inquilino, esRenovacion: h.siguiente.esRenovacion } : null
    }));
}

module.exports = { habitaciones, resumen, proximasSalidas, hoyISO, diasEntre, diasAviso };

/* Estado de pagos de cada contrato: 'al_dia' | 'pendiente' | 'parcial' | 'atrasado'
   (el peor de sus recibos sin cobrar del todo). */
function estadoPagosContratos(ids, hoy = hoyISO()) {
  const out = new Map();
  if (!ids.length) return out;
  const filas = db.todos('SELECT contrato_id, vence, cobrado, importe FROM pagos WHERE pagado_el IS NULL AND contrato_id IN (' + ids.map(() => '?').join(',') + ')', ...ids);
  const peso = { al_dia: 0, pendiente: 1, parcial: 2, atrasado: 3 };
  for (const p of filas) {
    const e = p.cobrado > 0 ? (p.vence < hoy ? 'atrasado' : 'parcial') : p.vence < hoy ? 'atrasado' : 'pendiente';
    const prev = out.get(p.contrato_id) || { estado: 'al_dia', debe: 0 };
    out.set(p.contrato_id, { estado: peso[e] > peso[prev.estado] ? e : prev.estado, debe: prev.debe + (p.vence < hoy ? p.importe - p.cobrado : 0) });
  }
  return out;
}
module.exports.estadoPagosContratos = estadoPagosContratos;
