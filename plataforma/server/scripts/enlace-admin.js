/* ==========================================================================
   scripts/enlace-admin.js — NUEVO ENLACE PARA FIJAR LA CONTRASEÑA
   Uso:  npm run enlace-admin [correo]
   Crea el usuario administrador si no existe y muestra un enlace de un solo uso
   (válido 72 horas) para elegir contraseña. Sirve también si se olvida la
   contraseña y el correo SMTP aún no está configurado.
   ========================================================================== */
'use strict';
process.removeAllListeners('warning');
const config = require('../config');
const db = require('../db');
const { tokenAleatorio, sha256 } = require('../seguridad/cifrado');

const email = (process.argv[2] || config.adminInicial).toLowerCase();
let u = db.uno('SELECT id FROM usuarios WHERE email = ?', email);
if (!u) {
  db.ejecutar("INSERT INTO usuarios (email, nombre, rol) VALUES (?, ?, 'admin')", email, email.split('@')[0]);
  u = db.uno('SELECT id FROM usuarios WHERE email = ?', email);
  console.log('Usuario administrador creado: ' + email);
}
const token = tokenAleatorio(32);
db.ejecutar('INSERT INTO recuperaciones (token_hash, usuario_id, caduca) VALUES (?, ?, ?)', sha256(token), u.id, Date.now() + 72 * 3600 * 1000);
console.log('Enlace (válido 72 h, un solo uso):\n' + (config.origen || 'http://localhost:' + config.puerto) + '/#/nueva-clave?token=' + encodeURIComponent(token));
