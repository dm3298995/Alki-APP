/* ==========================================================================
   http.js — SERVIDOR WEB: RUTAS, CABECERAS DE SEGURIDAD Y ARCHIVOS
   Sin librerías externas (menos dependencias = menos vulnerabilidades).
   Cada petición a /api pasa por este orden:
     1. Cabeceras de seguridad   2. Sesión   3. CSRF (si modifica datos)
     4. Permiso de la ruta       5. Validación de datos (en cada ruta)
   ========================================================================== */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const config = require('./config');
const sesiones = require('./seguridad/sesiones');
const { tiene } = require('./seguridad/permisos');
const { igualSeguro } = require('./seguridad/cifrado');
const { limitar } = require('./seguridad/limites');

const PUBLICO = path.join(config.RAIZ, 'public');
const rutas = [];

/* Registrar una ruta. opciones:
   - publica: no requiere sesión (login, recuperación...)
   - fase: fase de sesión necesaria (por defecto 'completa')
   - permiso: permiso de rol necesario
   - crudo: el cuerpo se entrega como Buffer (subida de archivos)
   - maxBytes: tamaño máximo del cuerpo */
function ruta(metodo, patron, opciones, manejador) {
  if (typeof opciones === 'function') { manejador = opciones; opciones = {}; }
  const nombres = [];
  const re = new RegExp('^' + patron.replace(/:([a-z]+)/g, (_, n) => { nombres.push(n); return '(\\d+)'; }) + '$');
  rutas.push({ metodo, re, nombres, opciones, manejador });
}

class ErrorHttp extends Error {
  constructor(estado, msg) { super(msg); this.estado = estado; }
}

function cabecerasSeguridad(res) {
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; " +
    "object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  if (config.produccion) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
}

function json(res, estado, datos) {
  const cuerpo = JSON.stringify(datos);
  res.writeHead(estado, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(cuerpo);
}

function leerCuerpo(peticion, maxBytes) {
  return new Promise((resolver, rechazar) => {
    const trozos = []; let total = 0;
    peticion.on('data', (t) => {
      total += t.length;
      if (total > maxBytes) { rechazar(new ErrorHttp(413, 'El archivo o los datos son demasiado grandes.')); peticion.destroy(); return; }
      trozos.push(t);
    });
    peticion.on('end', () => resolver(Buffer.concat(trozos)));
    peticion.on('error', rechazar);
  });
}

// Comprueba que la petición viene de nuestra propia web (defensa CSRF adicional)
function origenValido(peticion) {
  const origen = peticion.headers.origin;
  if (!origen) return true; // peticiones del mismo origen sin cabecera Origin (algunos navegadores en GET)
  if (config.origen) return origen === config.origen;
  return origen === 'http://' + peticion.headers.host || origen === 'https://' + peticion.headers.host;
}

const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json', '.webmanifest': 'application/manifest+json'
};

const APARTADOS = { panel: 'Panel', incidencias: 'Incidencias', inmuebles: 'Inmuebles', habitaciones: 'Habitaciones', contratos: 'Contratos', pagos: 'Pagos',
  ingresos: 'Ingresos', gastos: 'Gastos y costes', costes: 'Gastos y costes', facturas: 'Facturas', rentabilidad: 'Beneficios', mantenimientos: 'Mantenimientos', estadisticas: 'Estadísticas', admin: 'Configuración' };
function contarApartado(usuarioId, ruta) {
  const partes = ruta.split('/'); // ['', 'api', 'pagos', ...]
  const apartado = APARTADOS[partes[2]];
  // Solo pantallas principales: /api/x o /api/x/123 (no contadores ni resúmenes auxiliares)
  if (!apartado || partes.length > 4 || (partes[3] && !/^\d+$/.test(partes[3]) && partes[2] !== 'admin')) return;
  try {
    require('./db').ejecutar('INSERT INTO uso_apartados (usuario_id, fecha, apartado, n) VALUES (?, date(\'now\'), ?, 1) ON CONFLICT(usuario_id, fecha, apartado) DO UPDATE SET n = n + 1', usuarioId, apartado);
  } catch { /* no es crítico */ }
}

function servirEstatico(peticion, res) {
  let rel = decodeURIComponent(new URL(peticion.url, 'http://x').pathname);
  if (rel === '/') rel = '/index.html';
  const archivo = path.normalize(path.join(PUBLICO, rel));
  // Evita salir de la carpeta pública (../../etc/passwd)
  if (!archivo.startsWith(PUBLICO + path.sep)) { res.writeHead(403); return res.end(); }
  fs.stat(archivo, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('No encontrado'); }
    const ext = path.extname(archivo);
    res.writeHead(200, {
      'Content-Type': TIPOS[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600'
    });
    fs.createReadStream(archivo).pipe(res);
  });
}

async function manejar(peticion, res) {
  // IP real del cliente (si hay un proxy de confianza delante, usa su cabecera)
  peticion.ip = (config.detrasDeProxy && String(peticion.headers['x-forwarded-for'] || '').split(',')[0].trim()) || peticion.socket.remoteAddress;
  cabecerasSeguridad(res);
  const url = new URL(peticion.url, 'http://x');

  if (!url.pathname.startsWith('/api/')) {
    if (peticion.method !== 'GET' && peticion.method !== 'HEAD') { res.writeHead(405); return res.end(); }
    return servirEstatico(peticion, res);
  }

  try {
    // Límite general de peticiones por IP (frena abusos y escaneos automáticos)
    if (!limitar('api:' + peticion.ip, 600, 60 * 1000).permitido) throw new ErrorHttp(429, 'Demasiadas peticiones. Espera un momento.');

    let encontrada = null, params = {};
    for (const r of rutas) {
      const m = url.pathname.match(r.re);
      if (!m) continue;
      if (r.metodo !== peticion.method) { encontrada = encontrada || 'metodo'; continue; }
      encontrada = r;
      r.nombres.forEach((n, i) => { params[n] = Number(m[i + 1]); });
      break;
    }
    if (!encontrada) throw new ErrorHttp(404, 'Ruta no encontrada.');
    if (encontrada === 'metodo') throw new ErrorHttp(405, 'Método no permitido.');
    const { opciones, manejador } = encontrada;

    // Sesión
    const s = sesiones.leer(peticion);
    peticion.sesion = s?.sesion || null;
    peticion.usuario = s?.usuario || null;
    if (!opciones.publica) {
      if (!s) throw new ErrorHttp(401, 'Tu sesión ha caducado. Vuelve a entrar.');
      const fase = opciones.fase || 'completa';
      const fases = Array.isArray(fase) ? fase : [fase];
      if (!fases.includes(s.sesion.fase)) throw new ErrorHttp(401, 'Completa el acceso con tu código de verificación.');
      if (opciones.permiso && !tiene(s.usuario, opciones.permiso)) throw new ErrorHttp(403, 'No tienes permiso para esta acción.');
    }

    // CSRF: toda petición que modifica datos debe llevar el token de la sesión
    if (peticion.method !== 'GET' && !opciones.sinCsrf) {
      if (!origenValido(peticion)) throw new ErrorHttp(403, 'Origen no permitido.');
      if (s && !igualSeguro(peticion.headers['x-csrf-token'] || '', s.sesion.csrf)) throw new ErrorHttp(403, 'Token de seguridad no válido. Recarga la página.');
    }

    // Cuerpo
    let cuerpo = null;
    if (peticion.method === 'POST' || peticion.method === 'PUT' || peticion.method === 'DELETE') {
      const buf = await leerCuerpo(peticion, opciones.maxBytes || 1024 * 1024);
      if (opciones.crudo) cuerpo = buf;
      else if (buf.length) {
        if (!String(peticion.headers['content-type'] || '').includes('application/json')) throw new ErrorHttp(415, 'Formato no admitido.');
        try { cuerpo = JSON.parse(buf.toString('utf8')); } catch { throw new ErrorHttp(400, 'JSON no válido.'); }
      } else cuerpo = {};
    }

    // Una petición real del usuario renueva la inactividad
    if (s && !opciones.noRenueva) sesiones.tocar(s.sesion.id_hash);
    // Estadística interna: qué apartados abre cada persona (una por pantalla abierta)
    if (s && peticion.method === 'GET' && s.sesion.fase === 'completa') contarApartado(s.usuario.id, url.pathname);

    const resultado = await manejador({ peticion, res, params, query: url.searchParams, cuerpo, usuario: peticion.usuario, sesion: peticion.sesion });
    if (resultado === undefined) return; // la ruta ya respondió (descargas)
    json(res, 200, resultado);
  } catch (e) {
    const estado = e.estado || 500;
    if (estado >= 500) console.error('[error]', peticion.method, url.pathname, e);
    if (!res.headersSent) json(res, estado, { error: estado >= 500 ? 'Error interno. Se ha registrado para revisarlo.' : e.message, ...(e.extra || {}) });
    else res.end();
  }
}

module.exports = { ruta, manejar, ErrorHttp, json };
