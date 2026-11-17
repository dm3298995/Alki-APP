/* ==========================================================================
   cobros.js — RECIBOS DE LOS INQUILINOS
   · Cada mes se genera el recibo de renta (y servicios, si los hay) de los
     contratos en vigor. Así se sabe qué está pagado, pendiente o vencido.
   · Estado de un recibo:  pagado (tiene fecha de pago) · vencido (pasó la
     fecha límite sin pagar) · pendiente (aún dentro de plazo).
   ========================================================================== */
'use strict';
const db = require('../db');
const { hoyISO } = require('./ocupacion');
const { periodoActual } = require('./costes');

/* Estado de un recibo:
   pagado    → cobrado del todo (pagado_el)
   parcial   → se ha cobrado una parte
   vencido   → (atrasado) pasó la fecha límite sin cobrar nada
   pendiente → aún dentro de plazo */
const cobradoDe = (p) => (p.pagado_el ? p.importe : Math.min(p.cobrado || 0, p.importe));
function estadoPago(p, hoy = hoyISO()) {
  if (p.pagado_el) return 'pagado';
  if ((p.cobrado || 0) > 0) return 'parcial';
  return p.vence < hoy ? 'vencido' : 'pendiente';
}
// Reparte el importe de un recibo: cuánto está cobrado y cuánto falta (en plazo o atrasado)
function desglose(p, hoy = hoyISO()) {
  const cobrado = cobradoDe(p), falta = p.importe - cobrado;
  return { estado: estadoPago(p, hoy), cobrado, falta, atrasado: falta > 0 && p.vence < hoy, conRetraso: !!p.pagado_el && p.pagado_el > p.vence };
}

function ultimoDia(periodo) {
  const [a, m] = periodo.split('-').map(Number);
  return periodo + '-' + String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, '0');
}

function generarRecibos(periodo = periodoActual()) {
  const diaVence = String(db.ajuste('dia_vencimiento', 5)).padStart(2, '0');
  const contratos = db.todos(
    "SELECT id, renta, servicios FROM contratos WHERE estado = 'activo' AND inicio <= ? AND (fin IS NULL OR fin >= ?) AND renta > 0",
    ultimoDia(periodo), periodo + '-01');
  let creados = 0;
  db.transaccion(() => {
    for (const c of contratos) {
      for (const [concepto, importe] of [['renta', c.renta], ['servicios', c.servicios]]) {
        if (!importe) continue;
        const r = db.ejecutar('INSERT OR IGNORE INTO pagos (contrato_id, periodo, concepto, importe, vence, origen) VALUES (?, ?, ?, ?, ?, ?)',
          c.id, periodo, concepto, importe, periodo + '-' + diaVence, 'auto');
        creados += Number(r.changes);
      }
    }
  });
  return creados;
}

module.exports = { estadoPago, desglose, cobradoDe, generarRecibos, ultimoDia };
