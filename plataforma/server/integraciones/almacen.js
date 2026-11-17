/* ==========================================================================
   integraciones/almacen.js — GUARDAR DATOS EXTERNOS SIN DUPLICAR
   Lo usan todas las fuentes (CSV de Homming, API de Homming, servidor propio).
   "Upsert": si el registro ya existe (mismo código o mismo external_id) se
   actualiza; si no, se crea. Los datos creados a mano en la plataforma
   (gastos, mantenimientos, recibos cobrados) nunca se borran al sincronizar.
   ========================================================================== */
'use strict';
const db = require('../db');

function inmueble({ codigo, nombre, direccion = null, propietario = null, barrio = null, external_id = null, origen }) {
  const f = (external_id && db.uno('SELECT id FROM inmuebles WHERE origen = ? AND external_id = ?', origen, String(external_id)))
    || db.uno('SELECT id FROM inmuebles WHERE codigo = ?', codigo);
  if (f) {
    db.ejecutar("UPDATE inmuebles SET nombre = COALESCE(?, nombre), direccion = COALESCE(?, direccion), propietario = COALESCE(?, propietario), barrio = COALESCE(?, barrio), external_id = COALESCE(?, external_id), actualizado = datetime('now') WHERE id = ?",
      nombre, direccion, propietario, barrio, external_id == null ? null : String(external_id), f.id);
    return { id: f.id, nuevo: false };
  }
  const r = db.ejecutar('INSERT INTO inmuebles (codigo, nombre, direccion, propietario, barrio, external_id, origen) VALUES (?, ?, ?, ?, ?, ?, ?)',
    codigo, nombre || codigo, direccion, propietario, barrio, external_id == null ? null : String(external_id), origen);
  return { id: Number(r.lastInsertRowid), nuevo: true };
}

function habitacion(inmuebleId, codigo, { precio = null, external_id = null, origen }) {
  const f = (external_id && db.uno('SELECT id FROM habitaciones WHERE origen = ? AND external_id = ?', origen, String(external_id)))
    || db.uno('SELECT id FROM habitaciones WHERE inmueble_id = ? AND codigo = ? COLLATE NOCASE', inmuebleId, codigo);
  if (f) {
    if (precio != null) db.ejecutar('UPDATE habitaciones SET precio = ? WHERE id = ?', precio, f.id);
    return { id: f.id, nuevo: false };
  }
  const r = db.ejecutar('INSERT INTO habitaciones (inmueble_id, codigo, precio, external_id, origen) VALUES (?, ?, ?, ?, ?)',
    inmuebleId, codigo, precio ?? 0, external_id == null ? null : String(external_id), origen);
  return { id: Number(r.lastInsertRowid), nuevo: true };
}

function inquilino({ nombre, email = null, telefono = null, external_id = null, origen }) {
  const f = (external_id && db.uno('SELECT id FROM inquilinos WHERE origen = ? AND external_id = ?', origen, String(external_id)))
    || db.uno('SELECT id FROM inquilinos WHERE nombre = ? COLLATE NOCASE', nombre);
  if (f) {
    db.ejecutar('UPDATE inquilinos SET email = COALESCE(?, email), telefono = COALESCE(?, telefono) WHERE id = ?', email, telefono, f.id);
    return f.id;
  }
  return Number(db.ejecutar('INSERT INTO inquilinos (nombre, email, telefono, external_id, origen) VALUES (?, ?, ?, ?, ?)',
    nombre, email, telefono, external_id == null ? null : String(external_id), origen).lastInsertRowid);
}

function contrato(c) {
  const f = db.uno('SELECT id FROM contratos WHERE origen = ? AND external_id = ?', c.origen, String(c.external_id));
  if (f) {
    db.ejecutar("UPDATE contratos SET nombre = ?, inmueble_id = ?, habitacion_id = ?, inquilino_id = ?, tipo = ?, estado = ?, inicio = ?, fin = ?, renta = ?, fianza = ?, actualizado = datetime('now') WHERE id = ?",
      c.nombre, c.inmueble_id, c.habitacion_id, c.inquilino_id, c.tipo, c.estado, c.inicio, c.fin, c.renta, c.fianza, f.id);
    return { id: f.id, nuevo: false };
  }
  const r = db.ejecutar('INSERT INTO contratos (nombre, inmueble_id, habitacion_id, inquilino_id, tipo, estado, inicio, fin, renta, servicios, fianza, external_id, origen) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    c.nombre, c.inmueble_id, c.habitacion_id, c.inquilino_id, c.tipo, c.estado, c.inicio, c.fin, c.renta, c.servicios || 0, c.fianza, String(c.external_id), c.origen);
  return { id: Number(r.lastInsertRowid), nuevo: true };
}

function pago(p) {
  const f = db.uno('SELECT id, pagado_el FROM pagos WHERE contrato_id = ? AND periodo = ? AND concepto = ?', p.contrato_id, p.periodo, p.concepto);
  if (f) {
    // Un cobro marcado en la plataforma no se "descobra" por una sincronización
    db.ejecutar('UPDATE pagos SET importe = ?, vence = ?, pagado_el = COALESCE(?, pagado_el), external_id = COALESCE(?, external_id) WHERE id = ?',
      p.importe, p.vence, p.pagado_el, p.external_id == null ? null : String(p.external_id), f.id);
    return f.id;
  }
  return Number(db.ejecutar('INSERT INTO pagos (contrato_id, periodo, concepto, importe, vence, pagado_el, external_id, origen) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    p.contrato_id, p.periodo, p.concepto, p.importe, p.vence, p.pagado_el, p.external_id == null ? null : String(p.external_id), p.origen).lastInsertRowid);
}

module.exports = { inmueble, habitacion, inquilino, contrato, pago };
