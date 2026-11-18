/* ==========================================================================
   sw.js — SERVICE WORKER (parte de la PWA)
   Guarda una copia de los archivos de la app para que se pueda abrir sin
   conexión. Solo se activa cuando la app se sirve por http/https
   (por ejemplo en GitHub Pages o Netlify), no al abrir el archivo a mano.
   ========================================================================== */
const CACHE = 'alki-app-v12';
const ARCHIVOS = [
  './', './index.html', './manifest.json', './css/styles.css',
  './js/config.js', './js/medicion.js', './js/data.js', './js/store.js', './js/ui.js', './js/app.js',
  './js/views/legal.js', './js/views/comunes.js', './js/views/login.js', './js/views/inquilino.js',
  './js/views/propietario.js', './js/views/admin.js', './js/views/social.js', './js/demo-csv.js',
  './panel.html', './css/panel.css', './css/marca.css', './assets/fonts/jakarta.woff2', './assets/fonts/inter.woff2', './js/panel/equipo.js', './js/panel/costes.js', './js/panel/vistas.js', './js/panel/app.js', './js/nube.js',
  './assets/icon.svg', './assets/icon-180.png', './assets/icon-192.png', './assets/icon-512.png',
  './assets/fonts/bricolage.woff2', './assets/fonts/figtree.woff2', './reparar.html'
];

// Al instalar: guardar los archivos (si alguno falla, la app funciona igual con internet)
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(ARCHIVOS.map((a) => c.add(a).catch(() => null)))).then(() => self.skipWaiting()));
});

// Al activar: borrar copias antiguas y tomar el control enseguida
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((claves) => Promise.all(claves.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// Al pedir un archivo: primero la red y, si no hay conexión, la copia guardada.
// Nunca se guardan ni se devuelven respuestas redirigidas o con error (Safari las rechaza
// y la página no abriría).
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.endsWith('/reparar.html')) return; // la página de reparación siempre va directa
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        if (r.ok && !r.redirected && r.type === 'basic') { const copia = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copia)); }
        return r;
      })
      .catch(() => caches.match(e.request).then((m) => {
        if (m && !m.redirected) return m;
        if (e.request.mode === 'navigate') return caches.match('./index.html').then((i) => i || Response.error());
        return Response.error();
      }))
  );
});
