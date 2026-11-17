/* ==========================================================================
   totp.js — AUTENTICACIÓN MULTIFACTOR (códigos de 6 dígitos)
   Estándar TOTP (RFC 6238), compatible con Google Authenticator, Microsoft
   Authenticator, 1Password, Authy...
   ========================================================================== */
'use strict';
const crypto = require('node:crypto');

const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32(buf) {
  let bits = '', out = '';
  for (const b of buf) bits += b.toString(2).padStart(8, '0');
  for (let i = 0; i < bits.length; i += 5) out += ALFABETO[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)];
  return out;
}
function desdeBase32(txt) {
  let bits = '';
  for (const c of txt.replace(/=+$/, '').toUpperCase()) {
    const v = ALFABETO.indexOf(c);
    if (v < 0) throw new Error('base32 no válido');
    bits += v.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

const nuevoSecreto = () => base32(crypto.randomBytes(20));

function codigo(secreto, paso) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(paso));
  const h = crypto.createHmac('sha1', desdeBase32(secreto)).update(msg).digest();
  const o = h[h.length - 1] & 0x0f;
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1e6).padStart(6, '0');
}

/* Comprueba un código admitiendo ±30 s de desfase del reloj.
   Devuelve el "paso" usado (para impedir reutilizarlo) o 0 si no vale. */
function verificar(secreto, entrada, ultimoPaso = 0) {
  const limpio = String(entrada || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(limpio)) return 0;
  const ahora = Math.floor(Date.now() / 30000);
  for (const d of [0, -1, 1]) {
    const paso = ahora + d;
    if (paso <= ultimoPaso) continue;
    const esperado = codigo(secreto, paso);
    if (crypto.timingSafeEqual(Buffer.from(esperado), Buffer.from(limpio))) return paso;
  }
  return 0;
}

const uri = (secreto, email) =>
  'otpauth://totp/' + encodeURIComponent('ALKI Gestión:' + email) + '?secret=' + secreto + '&issuer=' + encodeURIComponent('ALKI Gestión') + '&algorithm=SHA1&digits=6&period=30';

module.exports = { nuevoSecreto, verificar, uri, codigo };
