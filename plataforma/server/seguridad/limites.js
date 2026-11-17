/* ==========================================================================
   limites.js — PROTECCIÓN CONTRA FUERZA BRUTA
   Cuenta los intentos por IP en una ventana de tiempo. Si alguien prueba
   muchas contraseñas, se le bloquea temporalmente. (El bloqueo por CUENTA
   está en rutas/auth.js y se guarda en la base de datos.)
   ========================================================================== */
'use strict';

const cubos = new Map(); // clave → { n, desde }

function limitar(clave, max, ventanaMs) {
  const ahora = Date.now();
  let c = cubos.get(clave);
  if (!c || ahora - c.desde > ventanaMs) { c = { n: 0, desde: ahora }; cubos.set(clave, c); }
  c.n++;
  return { permitido: c.n <= max, esperarSeg: Math.ceil((c.desde + ventanaMs - ahora) / 1000) };
}

function reiniciar(clave) { cubos.delete(clave); }

// Limpieza periódica para que la memoria no crezca
setInterval(() => {
  const ahora = Date.now();
  for (const [k, c] of cubos) if (ahora - c.desde > 60 * 60 * 1000) cubos.delete(k);
}, 10 * 60 * 1000).unref();

module.exports = { limitar, reiniciar };
