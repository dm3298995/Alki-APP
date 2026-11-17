/* ==========================================================================
   sw.js — SERVICE WORKER (parte de la PWA)
   Guarda una copia de los archivos de la app para que se pueda abrir sin
   conexión. Solo se activa cuando la app se sirve por http/https
   (por ejemplo en GitHub Pages o Netlify), no al abrir el archivo a mano.
   ========================================================================== */
const CACHE = 'alki-app-v7';
const ARCHIVOS = [
  './', './index.html', './manifest.json', './css/styles.css',
  './js/config.js', './js/medicion.js', './js/data.js', './js/store.js', './js/ui.js', './js/app.js',
  './js/views/legal.js', './js/views/comunes.js', './js/views/login.js', './js/views/inquilino.js',
  './js/views/propietario.js', './js/views/admin.js', './js/views/social.js', './js/demo-csv.js',
  './panel.html', './css/panel.css', './js/panel/equipo.js', './js/panel/costes.js', './js/panel/vistas.js', './js/panel/app.js',
  './assets/icon.svg', './assets/icon-180.png', './assets/icon-192.png', './assets/icon-512.png',
  './assets/fonts/bricolage.woff2', './assets/fonts/figtree.woff2'
];

// Al instalar: guardar todos los archivos
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

// Al activar: borrar copias antiguas
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((claves) => Promise.all(claves.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// Al pedir un archivo: primero la red y, si no hay conexión, la copia guardada
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  // Solo los archivos de la propia app (las estadísticas externas no se guardan)
  if (new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((r) => { const copia = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copia)); return r; })
      .catch(() => caches.match(e.request))
  );
});
