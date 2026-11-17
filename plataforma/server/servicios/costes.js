/* ==========================================================================
   costes.js — COSTE REAL DE CADA INMUEBLE
   Coste de un piso en un mes = gastos registrados (alquiler, suministros,
   limpieza, otros...) + coste de sus mantenimientos y reparaciones.
   Los mantenimientos se suman AUTOMÁTICAMENTE: no hay que apuntarlos dos veces.
   Los gastos fijos (recurrentes) se generan solos cada mes.
   ========================================================================== */
'use strict';
const db = require('../db');

const CATEGORIAS = {
  alquiler: 'Alquiler del inmueble', electricidad: 'Electricidad', agua: 'Agua', gas: 'Gas',
  internet: 'Internet / WiFi', limpieza: 'Limpieza', mantenimiento: 'Mantenimiento',
  reparaciones: 'Reparaciones', impuestos: 'Impuestos y tasas', seguros: 'Seguros', comisiones: 'Comisiones y captación', otros: 'Otros gastos'
};
const SUMINISTROS = ['electricidad', 'agua', 'gas', 'internet'];

const periodoActual = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' }).slice(0, 7);
function sumarMes(p, n) {
  const [a, m] = p.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}
function periodos(desde, hasta) {
  const out = [];
  for (let p = desde; p <= hasta && out.length < 240; p = sumarMes(p, 1)) out.push(p);
  return out;
}

// Crea los gastos de cada mes a partir de las plantillas de gastos fijos
function generarRecurrentes(hasta = periodoActual()) {
  const plantillas = db.todos('SELECT * FROM gastos_recurrentes WHERE activo = 1');
  let creados = 0;
  db.transaccion(() => {
    for (const g of plantillas) {
      const fin = g.hasta && g.hasta < hasta ? g.hasta : hasta;
      for (const p of periodos(g.desde, fin)) {
        const existe = db.uno('SELECT 1 FROM gastos WHERE recurrente_id = ? AND periodo = ?', g.id, p);
        if (existe) continue;
        const dia = String(Math.min(g.dia, 28)).padStart(2, '0');
        db.ejecutar('INSERT INTO gastos (inmueble_id, categoria, fecha, periodo, importe, proveedor, descripcion, recurrente_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          g.inmueble_id, g.categoria, p + '-' + dia, p, g.importe, g.proveedor, g.descripcion || 'Gasto fijo mensual', g.id);
        creados++;
      }
    }
  });
  return creados;
}

/* Filas { inmueble_id, periodo, categoria, importe } entre dos meses.
   Une los gastos y los mantenimientos no cancelados. */
function filas(desde, hasta, inmuebleId = null) {
  const extra = inmuebleId ? ' AND inmueble_id = ?' : '';
  const p = inmuebleId ? [desde, hasta, inmuebleId] : [desde, hasta];
  return db.todos(
    'SELECT inmueble_id, periodo, categoria, SUM(importe) AS importe FROM (' +
    '  SELECT inmueble_id, periodo, categoria, importe FROM gastos WHERE periodo BETWEEN ? AND ?' + extra +
    '  UNION ALL' +
    "  SELECT inmueble_id, substr(fecha, 1, 7), categoria, coste FROM mantenimientos WHERE estado <> 'cancelado' AND substr(fecha, 1, 7) BETWEEN ? AND ?" + extra +
    ') GROUP BY inmueble_id, periodo, categoria', ...p, ...p);
}

// Resumen de costes de un inmueble (o de todos) en un rango de meses
function resumen(desde, hasta, inmuebleId = null) {
  const datos = filas(desde, hasta, inmuebleId);
  const meses = periodos(desde, hasta);
  const porMes = Object.fromEntries(meses.map((m) => [m, 0]));
  const porCategoria = Object.fromEntries(Object.keys(CATEGORIAS).map((c) => [c, 0]));
  const porMesCategoria = Object.fromEntries(meses.map((m) => [m, {}]));
  const porInmueble = {};
  let total = 0;
  for (const f of datos) {
    porMes[f.periodo] = (porMes[f.periodo] || 0) + f.importe;
    porCategoria[f.categoria] = (porCategoria[f.categoria] || 0) + f.importe;
    if (porMesCategoria[f.periodo]) porMesCategoria[f.periodo][f.categoria] = (porMesCategoria[f.periodo][f.categoria] || 0) + f.importe;
    porInmueble[f.inmueble_id] = (porInmueble[f.inmueble_id] || 0) + f.importe;
    total += f.importe;
  }
  const suministros = SUMINISTROS.reduce((s, c) => s + (porCategoria[c] || 0), 0);
  return {
    desde, hasta, total, meses: meses.length,
    mediaMensual: meses.length ? Math.round(total / meses.length) : 0,
    suministros,
    mantenimiento: (porCategoria.mantenimiento || 0) + (porCategoria.reparaciones || 0),
    porMes: meses.map((m) => ({ periodo: m, importe: porMes[m] || 0 })),
    porCategoria: Object.entries(porCategoria).map(([c, v]) => ({ categoria: c, nombre: CATEGORIAS[c], importe: v })),
    porMesCategoria: meses.map((m) => ({ periodo: m, ...porMesCategoria[m] })),
    porInmueble
  };
}

module.exports = { CATEGORIAS, SUMINISTROS, generarRecurrentes, resumen, periodos, periodoActual, sumarMes, filas };
