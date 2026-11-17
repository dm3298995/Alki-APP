/* ==========================================================================
   copias.js — COPIAS DE SEGURIDAD AUTOMÁTICAS
   Cada X horas se hace una copia completa y consistente de la base de datos
   (VACUUM INTO) en data/copias/. Se conservan las últimas N.
   IMPORTANTE: copia también esa carpeta FUERA del servidor (ver README).
   ========================================================================== */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const db = require('../db');
const config = require('../config');

const CARPETA = path.join(config.DATA, 'copias');
fs.mkdirSync(CARPETA, { recursive: true, mode: 0o700 });

function crear() {
  const sello = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
  const destino = path.join(CARPETA, 'alki-' + sello + '.db');
  if (fs.existsSync(destino)) fs.unlinkSync(destino);
  db.raw.exec("VACUUM INTO '" + destino.replace(/'/g, "''") + "'");
  fs.chmodSync(destino, 0o600);
  // Borrar las más antiguas
  const todas = listar();
  for (const c of todas.slice(config.copias.conservar)) fs.unlinkSync(path.join(CARPETA, c.archivo));
  return path.basename(destino);
}

function listar() {
  return fs.readdirSync(CARPETA).filter((f) => /^alki-.*\.db$/.test(f)).sort().reverse()
    .map((f) => ({ archivo: f, bytes: fs.statSync(path.join(CARPETA, f)).size }));
}

function programar() {
  const ms = config.copias.cadaHoras * 3600 * 1000;
  const ultima = listar()[0];
  const edad = ultima ? Date.now() - fs.statSync(path.join(CARPETA, ultima.archivo)).mtimeMs : Infinity;
  const hacer = () => { try { console.log('[copias] creada ' + crear()); } catch (e) { console.error('[copias] error:', e.message); } };
  if (edad > ms) hacer();
  setInterval(hacer, ms).unref();
}

module.exports = { crear, listar, programar, CARPETA };
