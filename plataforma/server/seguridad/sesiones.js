/* ==========================================================================
   sesiones.js — GESTIÓN SEGURA DE SESIONES
   · El navegador recibe un token aleatorio en una cookie HttpOnly (JavaScript
     no puede leerla, así un ataque XSS no la roba), Secure (solo por HTTPS) y
     SameSite=Strict (no se envía desde otras webs → protege contra CSRF).
   · En la base de datos solo se guarda el hash del token.
   · Caduca tras X minutos sin actividad y, en cualquier caso, tras X horas.
   · Fases: 'mfa' (contraseña correcta, falta el código), 'mfa_alta' (debe
     configurar el MFA), 'completa' (acceso total según su rol).
   ========================================================================== */
'use strict';
const db = require('../db');
const config = require('../config');
const { tokenAleatorio, sha256 } = require('./cifrado');

const seguro = config.produccion || config.origen.startsWith('https://');
const NOMBRE = seguro ? '__Host-alki_sesion' : 'alki_sesion';

function cookie(valor, maxAgeSeg) {
  return [NOMBRE + '=' + valor, 'Path=/', 'HttpOnly', 'SameSite=Strict', seguro ? 'Secure' : '', 'Max-Age=' + maxAgeSeg]
    .filter(Boolean).join('; ');
}

function crear(res, peticion, usuarioId, fase) {
  const token = tokenAleatorio(32);
  const ahora = Date.now();
  db.ejecutar('INSERT INTO sesiones (id_hash, usuario_id, fase, csrf, creada, ultima_actividad, ip, agente) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    sha256(token), usuarioId, fase, tokenAleatorio(24), ahora, ahora, peticion.ip, String(peticion.headers['user-agent'] || '').slice(0, 200));
  res.setHeader('Set-Cookie', cookie(token, config.sesion.maxHoras * 3600));
  return token;
}

function leerToken(peticion) {
  const h = peticion.headers.cookie || '';
  for (const parte of h.split(';')) {
    const [k, ...v] = parte.trim().split('=');
    if (k === NOMBRE) return v.join('=');
  }
  return null;
}

// Guarda la sesión que termina en el historial de uso (para «Uso de la plataforma»)
function archivar(s, motivo) {
  if (!s || s.fase !== 'completa') return;
  try { db.ejecutar('INSERT INTO uso_sesiones (usuario_id, inicio, fin, motivo) VALUES (?, ?, ?, ?)', s.usuario_id, s.creada, s.ultima_actividad, motivo); } catch { /* no es crítico */ }
}

// Devuelve { sesion, usuario } o null si no hay sesión válida.
function leer(peticion) {
  const token = leerToken(peticion);
  if (!token || token.length > 100) return null;
  const idHash = sha256(token);
  const s = db.uno('SELECT * FROM sesiones WHERE id_hash = ?', idHash);
  if (!s) return null;
  const ahora = Date.now();
  const inactiva = ahora - s.ultima_actividad > config.sesion.inactividadMin * 60 * 1000;
  const vieja = ahora - s.creada > config.sesion.maxHoras * 3600 * 1000;
  // Las fases intermedias (pendiente de MFA) solo duran 10 minutos
  const intermediaCaducada = s.fase !== 'completa' && ahora - s.creada > 10 * 60 * 1000;
  if (inactiva || vieja || intermediaCaducada) { archivar(s, inactiva ? 'inactividad' : 'caducada'); db.ejecutar('DELETE FROM sesiones WHERE id_hash = ?', idHash); return null; }
  const u = db.uno('SELECT id, email, nombre, rol, permisos, mfa_activo, activo FROM usuarios WHERE id = ?', s.usuario_id);
  if (!u || !u.activo) { db.ejecutar('DELETE FROM sesiones WHERE id_hash = ?', idHash); return null; }
  return { sesion: s, usuario: u };
}

function tocar(idHash) {
  db.ejecutar('UPDATE sesiones SET ultima_actividad = ? WHERE id_hash = ?', Date.now(), idHash);
}

function cambiarFase(idHash, fase) {
  db.ejecutar('UPDATE sesiones SET fase = ?, ultima_actividad = ? WHERE id_hash = ?', fase, Date.now(), idHash);
}

function cerrar(res, idHash) {
  if (idHash) { archivar(db.uno('SELECT * FROM sesiones WHERE id_hash = ?', idHash), 'salida'); db.ejecutar('DELETE FROM sesiones WHERE id_hash = ?', idHash); }
  res.setHeader('Set-Cookie', cookie('', 0));
}

// Cierra TODAS las sesiones de un usuario (al cambiar la contraseña, desactivarlo...)
function cerrarTodas(usuarioId, exceptoHash = null) {
  db.ejecutar('DELETE FROM sesiones WHERE usuario_id = ? AND id_hash IS NOT ?', usuarioId, exceptoHash);
}

// Limpieza de sesiones caducadas cada 15 minutos
setInterval(() => {
  const limite = Date.now() - config.sesion.inactividadMin * 60 * 1000;
  for (const s of db.todos('SELECT * FROM sesiones WHERE ultima_actividad < ?', limite)) archivar(s, 'inactividad');
  db.ejecutar('DELETE FROM sesiones WHERE ultima_actividad < ?', limite);
  db.ejecutar('DELETE FROM recuperaciones WHERE caduca < ? OR usado = 1', Date.now());
}, 15 * 60 * 1000).unref();

module.exports = { crear, leer, tocar, cambiarFase, cerrar, cerrarTodas };
