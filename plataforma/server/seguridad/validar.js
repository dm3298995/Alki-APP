/* ==========================================================================
   validar.js — VALIDACIÓN DE TODAS LAS ENTRADAS
   Cada ruta describe qué campos acepta y de qué tipo. Lo que no está en la
   lista se descarta; lo que no cumple, se rechaza con un mensaje claro.
   ========================================================================== */
'use strict';

class ErrorValidacion extends Error {
  constructor(msg) { super(msg); this.estado = 400; }
}

const FECHA = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const PERIODO = /^\d{4}-(0[1-9]|1[0-2])$/;
const EMAIL = /^[^\s@<>()"',;:]{1,64}@[^\s@<>()"',;:]{1,190}\.[a-z]{2,}$/i;

/* Reglas: { campo: { tipo, req, max, min, valores } }
   tipos: texto, entero, euros (→ céntimos), fecha, periodo, email, bool, id, enum */
function validar(cuerpo, reglas, { parcial = false } = {}) {
  if (!cuerpo || typeof cuerpo !== 'object' || Array.isArray(cuerpo)) throw new ErrorValidacion('Datos no válidos.');
  const out = {};
  for (const [campo, r] of Object.entries(reglas)) {
    let v = cuerpo[campo];
    const etiqueta = r.etiqueta || campo;
    if (v === undefined || v === null || v === '') {
      if (r.req && !parcial) throw new ErrorValidacion('Falta el campo «' + etiqueta + '».');
      if (v !== undefined && !r.req) out[campo] = null;
      continue;
    }
    switch (r.tipo) {
      case 'texto':
        if (typeof v !== 'string' && typeof v !== 'number') throw new ErrorValidacion('«' + etiqueta + '» no es válido.');
        v = String(v).trim().replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
        if (v.length > (r.max || 500)) throw new ErrorValidacion('«' + etiqueta + '» es demasiado largo.');
        if (!v && r.req && !parcial) throw new ErrorValidacion('Falta el campo «' + etiqueta + '».');
        break;
      case 'entero': case 'id':
        v = Number(v);
        if (!Number.isInteger(v)) throw new ErrorValidacion('«' + etiqueta + '» debe ser un número entero.');
        if (r.tipo === 'id' && v <= 0) throw new ErrorValidacion('«' + etiqueta + '» no es válido.');
        if (r.min !== undefined && v < r.min) throw new ErrorValidacion('«' + etiqueta + '» es demasiado pequeño.');
        if (r.max !== undefined && v > r.max) throw new ErrorValidacion('«' + etiqueta + '» es demasiado grande.');
        break;
      case 'euros': {
        const n = typeof v === 'number' ? v : Number(String(v).replace(/\s|€/g, '').replace(',', '.'));
        if (!Number.isFinite(n) || n < 0 || n > 10_000_000) throw new ErrorValidacion('«' + etiqueta + '» no es un importe válido.');
        v = Math.round(n * 100);
        break;
      }
      case 'fecha':
        if (typeof v !== 'string' || !FECHA.test(v)) throw new ErrorValidacion('«' + etiqueta + '» debe ser una fecha (AAAA-MM-DD).');
        break;
      case 'periodo':
        if (typeof v !== 'string' || !PERIODO.test(v)) throw new ErrorValidacion('«' + etiqueta + '» debe ser un mes (AAAA-MM).');
        break;
      case 'email':
        if (typeof v !== 'string' || !EMAIL.test(v.trim())) throw new ErrorValidacion('El correo no es válido.');
        v = v.trim().toLowerCase();
        break;
      case 'bool':
        v = v === true || v === 1 || v === '1' || v === 'true';
        break;
      case 'enum':
        if (!r.valores.includes(v)) throw new ErrorValidacion('«' + etiqueta + '» no es válido.');
        break;
      default:
        throw new Error('Tipo de regla desconocido: ' + r.tipo);
    }
    out[campo] = v;
  }
  return out;
}

// Para filtros de la URL (?desde=...&hasta=...)
function filtroFecha(v) { return v && FECHA.test(v) ? v : null; }
function filtroId(v) { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; }

module.exports = { validar, ErrorValidacion, filtroFecha, filtroId, FECHA, PERIODO };
