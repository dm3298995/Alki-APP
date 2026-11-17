/* ==========================================================================
   cifrado.js — CONTRASEÑAS, CIFRADO Y TOKENS
   · Contraseñas: scrypt (función de hash lenta y con mucha memoria,
     recomendada por OWASP). Cada contraseña lleva su propia "sal" aleatoria.
   · Datos sensibles (secretos MFA, tokens de APIs): AES-256-GCM, que cifra y
     además detecta si alguien ha manipulado el dato.
   · Tokens de sesión y de recuperación: aleatorios de 256 bits; en la base de
     datos solo se guarda su hash SHA-256.
   ========================================================================== */
'use strict';
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const config = require('../config');

const scrypt = promisify(crypto.scrypt);
// Parámetros OWASP para scrypt: N=2^17, r=8, p=1 (≈128 MB de memoria por hash)
const N = 2 ** 17, R = 8, P = 1, LARGO = 64;
const MAXMEM = 256 * 1024 * 1024;

async function hashClave(clave) {
  const sal = crypto.randomBytes(16);
  const h = await scrypt(clave.normalize('NFKC'), sal, LARGO, { N, r: R, p: P, maxmem: MAXMEM });
  return ['scrypt', N, R, P, sal.toString('base64'), h.toString('base64')].join('$');
}

async function verificarClave(clave, guardado) {
  if (!guardado) {
    // Aunque el usuario no exista, se calcula un hash para que el tiempo de
    // respuesta sea el mismo (así no se puede adivinar qué correos existen).
    await scrypt('x', 'sal-falsa-constante', LARGO, { N, r: R, p: P, maxmem: MAXMEM });
    return false;
  }
  const [alg, n, r, p, sal, h] = guardado.split('$');
  if (alg !== 'scrypt') return false;
  const esperado = Buffer.from(h, 'base64');
  const calculado = await scrypt(clave.normalize('NFKC'), Buffer.from(sal, 'base64'), esperado.length,
    { N: Number(n), r: Number(r), p: Number(p), maxmem: MAXMEM });
  return crypto.timingSafeEqual(esperado, calculado);
}

// Política de contraseñas: largas (frase de paso) y no triviales.
const COMUNES = ['123456789012', 'contraseña123', 'password1234', 'qwertyuiopas', 'alkirentals1', 'alquiler1234'];
function validarClave(clave, email) {
  if (typeof clave !== 'string' || clave.length < 12) return 'La contraseña debe tener al menos 12 caracteres.';
  if (clave.length > 200) return 'La contraseña es demasiado larga.';
  const bajo = clave.toLowerCase();
  if (email && bajo.includes(email.split('@')[0].toLowerCase())) return 'La contraseña no puede contener tu correo.';
  if (COMUNES.some((c) => bajo.includes(c))) return 'Esa contraseña es demasiado común.';
  if (new Set(clave).size < 6) return 'Usa una contraseña más variada.';
  return null;
}

function cifrar(texto) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', config.claveMaestra, iv);
  const datos = Buffer.concat([c.update(String(texto), 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), datos].map((b) => b.toString('base64')).join('.');
}

function descifrar(paquete) {
  if (!paquete) return null;
  const [iv, tag, datos] = paquete.split('.').map((s) => Buffer.from(s, 'base64'));
  const d = crypto.createDecipheriv('aes-256-gcm', config.claveMaestra, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(datos), d.final()]).toString('utf8');
}

const tokenAleatorio = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
const sha256 = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
function igualSeguro(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

module.exports = { hashClave, verificarClave, validarClave, cifrar, descifrar, tokenAleatorio, sha256, igualSeguro };
