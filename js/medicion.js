/* ==========================================================================
   medicion.js — VERSIÓN DE PRUEBA, OPINIONES Y ESTADÍSTICAS DE USO
   · Franja «Versión de prueba» con el botón «Tu opinión».
   · Estadísticas (Google Analytics 4, Umami o Cloudflare) según config.js.
     Con Google Analytics se pide permiso antes (aviso de cookies, como exige
     la ley en España); si la persona lo rechaza, no se mide nada.
   · Cada pantalla de la app cuenta como una página vista, así se ve qué
     pantallas se usan más y cuánto tiempo pasan en ellas.
   ========================================================================== */
(function () {
  const cfg = (window.Alki && Alki.config) || {};
  const an = cfg.analitica || {};
  const zona = document.body.classList.contains('cuerpo-panel') ? 'panel' : 'app';
  const CLAVE = 'alki_consentimiento_estadisticas';
  const leer = () => { try { return localStorage.getItem(CLAVE); } catch (e) { return null; } };
  const guardar = (v) => { try { localStorage.setItem(CLAVE, v); } catch (e) { /* modo privado */ } };
  const el = (tag, attrs, texto) => { const n = document.createElement(tag); Object.assign(n, attrs || {}); if (texto) n.textContent = texto; return n; };

  // ---------- Estadísticas ----------
  let cargado = false;
  function cargarScript(src, extra) { const s = el('script', Object.assign({ async: true, src }, extra || {})); document.head.appendChild(s); return s; }
  function pantalla() {
    const h = decodeURIComponent(location.hash.replace(/^#\/?/, '')).split('?')[0];
    // No se envían identificadores: los números de la dirección se sustituyen por ":id"
    return '/' + zona + '/' + (h.replace(/\/[0-9a-z-]{6,}$/i, '/:id').replace(/\/\d+/g, '/:id') || 'inicio');
  }
  function vista() {
    if (!cargado) return;
    const ruta = pantalla();
    if (an.proveedor === 'ga4' && window.gtag) gtag('event', 'page_view', { page_path: ruta, page_location: location.origin + location.pathname + '#' + ruta.slice(zona.length + 1), page_title: document.title });
    if (an.proveedor === 'umami' && window.umami) umami.track((p) => ({ ...p, url: ruta, title: document.title }));
  }
  function activar() {
    if (cargado || !an.id) return;
    cargado = true;
    if (an.proveedor === 'ga4') {
      window.dataLayer = window.dataLayer || [];
      window.gtag = function () { dataLayer.push(arguments); };
      gtag('consent', 'default', { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'granted' });
      gtag('js', new Date());
      // Sin publicidad ni señales de Google; IP anonimizada por defecto en GA4
      gtag('config', an.id, { send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false });
      cargarScript('https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(an.id));
    } else if (an.proveedor === 'umami') {
      const u = cargarScript('https://cloud.umami.is/script.js', { defer: true });
      u.setAttribute('data-website-id', an.id);
      u.setAttribute('data-auto-track', 'false'); // las pantallas las avisa vista()
    } else if (an.proveedor === 'cloudflare') {
      cargarScript('https://static.cloudflareinsights.com/beacon.min.js', { defer: true }).setAttribute('data-cf-beacon', JSON.stringify({ token: an.id, spa: true }));
    }
    setTimeout(vista, 800);
  }
  window.addEventListener('hashchange', () => setTimeout(vista, 50));
  // Acciones importantes (para saber qué se usa): Alki.medir('incidencia_creada')
  window.Alki = window.Alki || {};
  Alki.medir = function (evento, datos) {
    if (!cargado) return;
    if (an.proveedor === 'ga4' && window.gtag) gtag('event', evento, Object.assign({ zona }, datos || {}));
    if (an.proveedor === 'umami' && window.umami) umami.track(evento, datos || {});
  };

  // ---------- Aviso de cookies (solo Google Analytics) ----------
  function avisoCookies() {
    const caja = el('div', { className: 'aviso-cookies', role: 'dialog', ariaLabel: 'Estadísticas de uso' });
    caja.append(el('p', {}, 'Esta versión de prueba usa Google Analytics para saber qué pantallas se usan y cuánto tiempo. No se usan para publicidad ni se guardan tus datos de la app. ¿Nos dejas medirlo?'));
    const botones = el('div', { className: 'aviso-cookies__botones' });
    const no = el('button', { type: 'button', className: 'boton boton--sec' }, 'No, gracias');
    const si = el('button', { type: 'button', className: 'boton' }, 'Aceptar');
    no.onclick = () => { guardar('no'); caja.remove(); };
    si.onclick = () => { guardar('si'); caja.remove(); activar(); };
    botones.append(no, si); caja.append(botones);
    document.body.appendChild(caja);
  }
  if (an.id) {
    if (an.proveedor === 'ga4') { const c = leer(); if (c === 'si') activar(); else if (c !== 'no') avisoCookies(); }
    else activar(); // Umami y Cloudflare no usan cookies
  }

  // ---------- Franja de versión de prueba y opiniones ----------
  if (cfg.modoPrueba) {
    const franja = el('div', { className: 'franja-prueba' });
    franja.append(el('span', {}, zona === 'panel' ? 'Panel de demostración · datos ficticios' : 'Versión de prueba · datos ficticios'));
    const b = el('button', { type: 'button' }, 'Tu opinión');
    b.onclick = abrirOpinion;
    franja.append(b);
    if (an.proveedor === 'ga4' && an.id) {
      const c = el('button', { type: 'button', className: 'franja-prueba__sec' }, 'Cookies');
      c.onclick = () => { guardar(''); location.reload(); };
      franja.append(c);
    }
    document.body.appendChild(franja);
    document.body.classList.add('con-franja-prueba');
  }

  function abrirOpinion() {
    Alki.medir('opinion_abierta', { pantalla: pantalla() });
    if (cfg.opinionUrl) { window.open(cfg.opinionUrl, '_blank', 'noopener'); return; }
    const fondo = el('div', { className: 'opinion-fondo' });
    const caja = el('form', { className: 'opinion' });
    caja.append(el('h2', {}, '¿Qué te parece la app?'));
    caja.append(el('p', {}, 'Tu opinión nos ayuda a mejorarla antes de lanzarla.'));
    const estrellas = el('div', { className: 'opinion__estrellas', role: 'radiogroup', ariaLabel: 'Puntuación' });
    let nota = 0;
    for (let i = 1; i <= 5; i++) {
      const s = el('button', { type: 'button', ariaLabel: i + ' de 5' }, '★');
      s.onclick = () => { nota = i; [...estrellas.children].forEach((x, k) => x.classList.toggle('activa', k < i)); };
      estrellas.append(s);
    }
    caja.append(estrellas);
    const quien = el('select', {});
    for (const t of ['Soy inquilino/a', 'Soy propietario/a', 'Trabajo en ALKI', 'Otro']) quien.append(el('option', { value: t }, t));
    caja.append(quien);
    const texto = el('textarea', { placeholder: '¿Qué te ha gustado? ¿Qué cambiarías? ¿Algo no funciona?', rows: 5 });
    caja.append(texto);
    const fila = el('div', { className: 'opinion__botones' });
    const cancelar = el('button', { type: 'button', className: 'boton boton--sec' }, 'Cancelar');
    const enviar = el('button', { type: 'submit', className: 'boton' }, 'Enviar por correo');
    cancelar.onclick = () => fondo.remove();
    fila.append(cancelar, enviar); caja.append(fila);
    caja.onsubmit = (e) => {
      e.preventDefault();
      Alki.medir('opinion_enviada', { nota });
      const cuerpo = 'Puntuación: ' + (nota || '-') + '/5\n' + quien.value + '\nPantalla: ' + pantalla() + '\nDispositivo: ' + navigator.userAgent + '\n\n' + texto.value;
      location.href = 'mailto:' + (cfg.opinionCorreo || '') + '?subject=' + encodeURIComponent('Opinión sobre la app ALKI (' + zona + ')') + '&body=' + encodeURIComponent(cuerpo);
      fondo.remove();
    };
    fondo.onclick = (e) => { if (e.target === fondo) fondo.remove(); };
    fondo.append(caja); document.body.appendChild(fondo);
    texto.focus();
  }
})();
