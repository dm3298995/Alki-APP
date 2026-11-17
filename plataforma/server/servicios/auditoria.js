/* ==========================================================================
   auditoria.js — REGISTRO DE ACTIVIDAD
   Guarda quién hizo qué, cuándo y desde dónde: accesos, intentos fallidos,
   cambios en datos, importaciones, descargas de documentos...
   Nunca se guardan contraseñas, tokens ni códigos.
   ========================================================================== */
'use strict';
const db = require('../db');

function registrar(peticion, accion, { entidad = null, id = null, detalle = null, usuarioId } = {}) {
  try {
    db.ejecutar('INSERT INTO auditoria (usuario_id, accion, entidad, entidad_id, ip, detalle) VALUES (?, ?, ?, ?, ?, ?)',
      usuarioId ?? peticion?.usuario?.id ?? null, accion, entidad, id, peticion?.ip ?? null,
      detalle == null ? null : (typeof detalle === 'string' ? detalle : JSON.stringify(detalle)).slice(0, 2000));
  } catch (e) {
    console.error('[auditoria] no se pudo registrar:', e.message);
  }
}

module.exports = { registrar };
