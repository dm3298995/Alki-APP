/* ==========================================================================
   integraciones/csv-homming.js — IMPORTAR EL CSV DE CONTRATOS DE HOMMING
   Funciona YA, sin API: en Homming se exporta el listado de contratos
   (columnas: Nombre del contrato; Inmueble; Inquilinos; Tipo; Estado;
   Fecha de inicio; Fecha de fin; Importe de renta; Fianza) y se sube aquí.
   Cómo se interpreta:
     Inmueble  "025. Albocácer 20 P16 (Alb20) - Antonio"
                nº   dirección         código  propietario
     Contrato  "Alb20-H1"  → habitación H1
   Se puede importar las veces que haga falta: no duplica nada.
   ========================================================================== */
'use strict';
const crypto = require('node:crypto');
const db = require('../db');
const almacen = require('./almacen');

const ORIGEN = 'homming_csv';

function parsearCSV(texto) {
  texto = texto.replace(/^﻿/, '');
  const primera = texto.split(/\r?\n/)[0];
  const sep = (primera.match(/;/g) || []).length >= (primera.match(/,/g) || []).length ? ';' : ',';
  const filas = []; let fila = [], campo = '', comillas = false;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (comillas) {
      if (ch === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
      else if (ch === '"') comillas = false;
      else campo += ch;
    } else if (ch === '"') comillas = true;
    else if (ch === sep) { fila.push(campo); campo = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && texto[i + 1] === '\n') i++;
      fila.push(campo); campo = '';
      if (fila.some((c) => c.trim())) filas.push(fila);
      fila = [];
    } else campo += ch;
  }
  fila.push(campo); if (fila.some((c) => c.trim())) filas.push(fila);
  return filas;
}

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
const limpiar = (s) => String(s || '').replace(/\s+/g, ' ').trim();
function fecha(s) {
  const m = String(s || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0') : null;
}
function centimos(s) {
  const t = String(s || '').replace(/[^\d,.-]/g, '');
  if (!t) return 0;
  const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

const ESTADOS = { active: 'activo', activo: 'activo', expired: 'finalizado', finalizado: 'finalizado', rescinded: 'rescindido', rescindido: 'rescindido', reserved: 'reservado', reservado: 'reservado' };
const TIPOS = { rooms: 'habitacion', temporary: 'temporal', common: 'vivienda', office: 'otro' };

function importar(texto) {
  const filas = parsearCSV(texto);
  if (filas.length < 2) throw Object.assign(new Error('El archivo está vacío o no tiene el formato esperado.'), { estado: 400 });
  const cab = filas[0].map(norm);
  const col = (...nombres) => cab.findIndex((c) => nombres.some((n) => c === n || c.startsWith(n)));
  const ix = {
    nombre: col('nombredelcontrato', 'contrato'), inmueble: col('inmueble'), inquilinos: col('inquilinos', 'inquilino'),
    tipo: col('tipo'), estado: col('estado'), inicio: col('fechadeinicio', 'inicio'), fin: col('fechadefin', 'fin'),
    renta: col('importederenta', 'renta'), fianza: col('fianza')
  };
  const faltan = ['nombre', 'inmueble', 'estado', 'inicio'].filter((k) => ix[k] < 0);
  if (faltan.length) throw Object.assign(new Error('Faltan columnas en el CSV: ' + faltan.join(', ') + '. ¿Es el export de contratos de Homming?'), { estado: 400 });

  const res = { filas: filas.length - 1, inmueblesNuevos: 0, habitacionesNuevas: 0, contratosNuevos: 0, contratosActualizados: 0, omitidas: 0, avisos: [] };
  const aviso = (t) => { if (res.avisos.length < 50) res.avisos.push(t); };

  db.transaccion(() => {
    filas.slice(1).forEach((f, n) => {
      const v = (k) => (ix[k] >= 0 ? limpiar(f[ix[k]]) : '');
      // Admite también el código antes del piso: "017. Reina 21 (Rei21) P1A - Israel"
      const inm = v('inmueble').match(/^(\d+)\.?\s+(.*)\(([^()]+)\)\s*([^-()]*?)\s*-\s*(.+)$/); // el código es el ÚLTIMO paréntesis
      if (!inm) { res.omitidas++; aviso('Fila ' + (n + 2) + ': inmueble «' + v('inmueble') + '» sin el formato «Nº. Dirección (CÓDIGO) - Propietario»; se omite.'); return; }
      const [, numero, dir1, codigoRaw, dir2, propietario] = inm;
      const direccion = limpiar(dir1 + ' ' + dir2);
      const codigo = codigoRaw.replace(/\s+/g, '');
      const inicio = fecha(v('inicio'));
      if (!inicio) { res.omitidas++; aviso('Fila ' + (n + 2) + ': sin fecha de inicio; se omite.'); return; }
      const estado = ESTADOS[v('estado').toLowerCase()] || 'finalizado';
      const tipo = TIPOS[v('tipo').toLowerCase()] || 'habitacion';

      const i = almacen.inmueble({ codigo, nombre: numero.padStart(3, '0') + ' · ' + direccion, direccion, propietario, origen: ORIGEN });
      if (i.nuevo) res.inmueblesNuevos++;

      // Habitación: lo que va detrás del guion en el nombre del contrato (H1, P2...)
      const nombre = v('nombre');
      const suf = nombre.includes('-') ? nombre.split('-').pop().trim().toUpperCase() : '';
      let habitacionId = null;
      if (/^[HP]\d{1,2}$/.test(suf)) {
        const h = almacen.habitacion(i.id, suf, { precio: estado === 'activo' ? centimos(v('renta')) : null, origen: ORIGEN });
        if (h.nuevo) res.habitacionesNuevas++;
        habitacionId = h.id;
      } else if (tipo === 'habitacion' && estado === 'activo') aviso('«' + nombre + '» (' + codigo + '): no indica la habitación (p. ej. ' + codigo + '-H1).');

      const nombreInq = v('inquilinos') || 'Sin nombre';
      const q = almacen.inquilino({ nombre: nombreInq, origen: ORIGEN });
      const fin = fecha(v('fin'));
      const ext = crypto.createHash('sha1').update([nombre, codigo, nombreInq, inicio].join('|')).digest('hex').slice(0, 20);
      const c = almacen.contrato({ nombre, inmueble_id: i.id, habitacion_id: habitacionId, inquilino_id: q, tipo, estado, inicio, fin,
        renta: centimos(v('renta')), fianza: centimos(v('fianza')), external_id: ext, origen: ORIGEN });
      if (c.nuevo) res.contratosNuevos++; else res.contratosActualizados++;
    });
  });

  // Avisos de coherencia (no bloquean la importación)
  const dobles = db.todos(
    "SELECT h.codigo, i.codigo AS inm, COUNT(*) AS n FROM contratos c JOIN habitaciones h ON h.id = c.habitacion_id JOIN inmuebles i ON i.id = c.inmueble_id " +
    "WHERE c.estado = 'activo' AND c.inicio <= date('now') GROUP BY c.habitacion_id HAVING n > 1");
  for (const d of dobles) aviso(d.inm + '-' + d.codigo + ' tiene ' + d.n + ' contratos activos a la vez. Revisa en Homming si alguno debería estar finalizado.');
  return res;
}

module.exports = { importar, parsearCSV };
