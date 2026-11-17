/* ==========================================================================
   config.js — CONFIGURACIÓN DE LA PLATAFORMA
   Lee el archivo .env (variables de entorno) y da valores por defecto seguros.
   Las claves y contraseñas viven SOLO aquí, en el servidor: nunca llegan al
   navegador.
   ========================================================================== */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const RAIZ = path.join(__dirname, '..');

// Carga .env sin librerías: líneas CLAVE=valor, ignorando comentarios.
function cargarEnv(archivo) {
  if (!fs.existsSync(archivo)) return;
  for (const linea of fs.readFileSync(archivo, 'utf8').split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]] !== undefined) continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
cargarEnv(path.join(RAIZ, '.env'));

const env = process.env;
const DATA = path.resolve(RAIZ, env.DATA_DIR || 'data');
fs.mkdirSync(DATA, { recursive: true, mode: 0o700 });

// Clave maestra para cifrar datos sensibles (secretos MFA, tokens de APIs).
// Si no está en .env se genera una y se guarda en data/secret.key (solo lectura del dueño).
function claveMaestra() {
  if (env.APP_SECRET && /^[0-9a-f]{64}$/i.test(env.APP_SECRET)) return Buffer.from(env.APP_SECRET, 'hex');
  // Cualquier otra clave larga (p. ej. la que genera Render) se convierte en 32 bytes
  if (env.APP_SECRET && env.APP_SECRET.length >= 32) return crypto.createHash('sha256').update(env.APP_SECRET).digest();
  const archivo = path.join(DATA, 'secret.key');
  if (!fs.existsSync(archivo)) {
    fs.writeFileSync(archivo, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
    console.warn('[config] APP_SECRET no definido: se ha generado data/secret.key. Haz copia de seguridad de este archivo.');
  }
  return Buffer.from(fs.readFileSync(archivo, 'utf8').trim(), 'hex');
}

const produccion = env.NODE_ENV === 'production';

module.exports = {
  RAIZ,
  DATA,
  produccion,
  puerto: Number(env.PORT || 3000),
  host: env.HOST || '127.0.0.1',            // por defecto solo escucha en local (detrás de Nginx)
  origen: env.APP_ORIGIN || env.RENDER_EXTERNAL_URL || '', // p. ej. https://gestion.alki.casa (en Render se rellena solo). Se usa en enlaces y en la comprobación CSRF
  detrasDeProxy: env.TRUST_PROXY === '1',   // true si Nginx/Caddy hace de proxy con HTTPS
  claveMaestra: claveMaestra(),
  adminInicial: (env.ADMIN_EMAIL || 'daniel@alki.casa').toLowerCase(),
  sesion: {
    inactividadMin: Number(env.SESSION_IDLE_MIN || 30),   // cierre automático por inactividad
    maxHoras: Number(env.SESSION_MAX_HOURS || 12)          // duración máxima de una sesión
  },
  smtp: {
    host: env.SMTP_HOST || '',
    puerto: Number(env.SMTP_PORT || 465),
    usuario: env.SMTP_USER || '',
    clave: env.SMTP_PASS || '',
    remitente: env.SMTP_FROM || 'ALKI Gestión <no-responder@alki.casa>'
  },
  copias: {
    cadaHoras: Number(env.BACKUP_EVERY_HOURS || 24),
    conservar: Number(env.BACKUP_KEEP || 30)
  },
  subidas: { maxMB: Number(env.UPLOAD_MAX_MB || 10) }
};
