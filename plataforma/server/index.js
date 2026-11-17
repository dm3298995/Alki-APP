/* ==========================================================================
   index.js — ARRANQUE DE LA PLATAFORMA
   Ejecutar:  node server/index.js   (o  npm start)
   ========================================================================== */
'use strict';
process.removeAllListeners('warning'); // oculta el aviso "SQLite is experimental"
const http = require('node:http');
const config = require('./config');

// Publicación de prueba (Render): si DEMO_AL_INICIAR=1 y la base de datos está
// vacía, se cargan los datos ficticios de la demo antes de arrancar.
if (process.env.DEMO_AL_INICIAR === '1') {
  try {
    require('node:child_process').execFileSync(process.execPath, [require('node:path').join(__dirname, 'scripts', 'demo.js')],
      { env: { ...process.env, NODE_ENV: 'development' }, stdio: 'inherit' });
  } catch { console.log('[demo] La base de datos ya tiene datos: no se carga la demo.'); }
}
const db = require('./db');
const { manejar } = require('./http');

// Rutas de la API
require('./rutas/auth');
require('./rutas/panel');
require('./rutas/inmuebles');
require('./rutas/contratos');
require('./rutas/finanzas');
require('./rutas/mantenimientos');
require('./rutas/incidencias');
require('./rutas/rentabilidad');
require('./rutas/ingresos');
require('./rutas/estadisticas');
require('./rutas/admin');

const costes = require('./servicios/costes');
const cobros = require('./servicios/cobros');
const copias = require('./servicios/copias');
const integraciones = require('./integraciones');
const { crearEnlaceClave } = require('./rutas/auth');

// Primer arranque: crea el administrador principal. Si todavía no ha elegido
// contraseña, en CADA arranque se muestra un enlace nuevo para hacerlo.
if (!db.uno("SELECT 1 FROM usuarios WHERE rol = 'admin' LIMIT 1")) {
  db.ejecutar("INSERT OR IGNORE INTO usuarios (email, nombre, rol) VALUES (?, 'Daniel', 'admin')", config.adminInicial);
}
const base = config.origen || 'http://localhost:' + config.puerto;
const sinClave = db.todos("SELECT id, email FROM usuarios WHERE rol = 'admin' AND activo = 1 AND hash_clave IS NULL");
console.log('\n================================================================');
console.log(' ALKI Gestión · abre en el navegador:  ' + base);
for (const u of sinClave) {
  console.log('\n Administrador ' + u.email + ' sin contraseña todavía. Elige la tuya aquí (válido 72 h):');
  console.log(' ' + base + '/#/nueva-clave?token=' + encodeURIComponent(crearEnlaceClave(u.id, 72 * 60)));
}
if (!sinClave.length) console.log(' ¿Olvidaste la contraseña?  npm run enlace-admin');
if (db.uno("SELECT 1 FROM usuarios WHERE email = 'gestion@demo.alki'")) console.log(' Demo: también puedes entrar con  gestion@demo.alki  /  ' + (process.env.DEMO_CLAVE ? 'la contraseña de la variable DEMO_CLAVE' : 'Demo-ALKI-2026!'));
console.log('================================================================\n');

// Tareas periódicas: gastos fijos y recibos del mes (cada 6 horas), copias, integraciones
function tareasDiarias() {
  try {
    const g = costes.generarRecurrentes();
    const r = db.ajuste('recibos_automaticos', true) ? cobros.generarRecibos() : 0;
    if (g || r) console.log('[tareas] gastos fijos creados: ' + g + ' · recibos creados: ' + r);
  } catch (e) { console.error('[tareas] error:', e.message); }
}
tareasDiarias();
setInterval(tareasDiarias, 6 * 3600 * 1000).unref();
copias.programar();
integraciones.programar();

const servidor = http.createServer((req, res) => {
  manejar(req, res).catch((e) => { console.error(e); if (!res.headersSent) { res.writeHead(500); res.end(); } });
});
servidor.headersTimeout = 20000;
servidor.requestTimeout = 60000;
servidor.listen(config.puerto, config.host, () => {
  console.log('ALKI Gestión en http://' + config.host + ':' + config.puerto + (config.produccion ? ' (producción)' : ' (desarrollo)'));
});

// Cierre ordenado
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => { servidor.close(); db.raw.close(); process.exit(0); });
