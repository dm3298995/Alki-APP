/* ==========================================================================
   panel/app.js — NAVEGACIÓN DE ALKI PANEL
   --------------------------------------------------------------------------
   Igual que la app de inquilinos (rutas con #), pero:
     · solo entra el equipo (sesión propia, separada de la de inquilinos)
     · cada ruta pertenece a una sección y se comprueba el permiso
     · con permiso «Solo ver» la pantalla se muestra en modo lectura
   ========================================================================== */
window.Alki = window.Alki || {};

Alki.app = (function () {
  const S = Alki.store, U = Alki.ui, E = Alki.panel.equipo, P = Alki.panel.vistas, C = Alki.panel.costes;
  const A = Alki.vistas.admin;
  const q0 = (f) => (p, s, q) => f(p, s, q || {});

  /* [patrón, sección, vista] */
  const rutas = [
    ['/login', null, P.login],
    ['/admin', 'resumen', P.resumen],
    ['/admin/incidencias', 'incidencias', P.tablero],
    ['/admin/incidencias/:id', 'incidencias', P.incidencia],
    ['/admin/viviendas', 'viviendas', q0(A.viviendas)],
    ['/admin/viviendas/:id', 'viviendas', q0(A.vivienda)],
    ['/admin/costes', 'costes', C.resumen],
    ['/admin/costes/:id', 'costes', C.vivienda],
    ['/admin/cobros', 'cobros', q0(A.cobros)],
    ['/admin/personas', 'personas', q0(A.personas)],
    ['/admin/mensajes', 'comunicacion', P.mensajes],
    ['/admin/social', 'comunicacion', P.social],
    ['/admin/datos', 'datos', P.datos],
    ['/admin/equipo', 'equipo', P.equipo],
    ['/admin/actividad', 'actividad', P.actividad],
    ['/perfil', '*', P.perfil]
  ];

  function encajar(patron, ruta) {
    const a = patron.split('/'), b = ruta.split('/');
    if (a.length !== b.length) return null;
    const params = {};
    for (let n = 0; n < a.length; n++) {
      if (a[n].charAt(0) === ':') params[a[n].slice(1)] = decodeURIComponent(b[n]);
      else if (a[n] !== b[n]) return null;
    }
    return params;
  }
  // Primera sección a la que tiene acceso una persona
  function inicio(ses) {
    const s = E.secciones.find((x) => E.permiso(ses, x[0]) !== 'no');
    return s ? s[3] : '/perfil';
  }

  function shell(ses, activa, html) {
    const iniciales = ses.nombre.replace(/\(.*?\)/g, '').trim().split(/\s+/).slice(0, 2).map((x) => x.charAt(0)).join('').toUpperCase(); // sin «(encargado)»
    const nav = E.secciones.filter((s) => E.permiso(ses, s[0]) !== 'no').map((s) =>
      '<a href="#' + s[3] + '"' + (s[0] === activa ? ' aria-current="page"' : '') + ' title="' + s[1] + '">' + U.icono(s[2]) + '<span>' + (s[5] || s[1]) + '</span></a>').join('');
    return '<div class="pa">' +
      '<header class="pa__cabecera"><a class="pa__logo" href="#/admin">' + Alki.logoSimbolo + '<span>Alki<b>Panel</b></span></a>' +
      '<nav class="pa__nav" aria-label="Secciones">' + nav + '</nav>' +
      '<a class="pa__usuario" href="#/perfil"' + (activa === '*' ? ' aria-current="page"' : '') + '><span class="avatar">' + U.esc(iniciales) + '</span><span class="pa__nombre">' + U.esc(U.primerNombre(ses.nombre)) + '</span></a></header>' +
      '<main class="pa__main" id="principal"><div class="pa__pagina">' + html + '</div></main></div>';
  }

  // Modo «Solo ver»: se desactiva todo lo que cambia datos
  function soloLectura(raiz) {
    const pagina = raiz.querySelector('.pa__pagina');
    const aviso = document.createElement('div');
    aviso.className = 'banda';
    aviso.innerHTML = U.icono('ojo') + '<span><strong>Solo lectura.</strong> Puedes consultar esta sección, pero no cambiar nada.</span>';
    const cab = pagina.querySelector('.cabecera');
    if (cab) cab.after(aviso); else pagina.prepend(aviso);
    pagina.querySelectorAll('form input, form select, form textarea, form button, .fotos-selector input').forEach((x) => { x.disabled = true; });
    pagina.querySelectorAll('[data-cobrar], [data-reforma], [data-solicitud], [data-nuevo-gasto], [data-editar], [data-borrar-gasto], [data-borrar], [data-borrar-com], [data-like], #importar, #nuevo-aviso, #nueva-inc, #importar-gastos, #exportar, #restaurar, #publicar-aviso, #solucionado, #asignar')
      .forEach((x) => { x.disabled = true; if (x.tagName === 'A') x.removeAttribute('href'); });
  }

  let rutaActual = null;
  function hashDelNavegador() { try { return decodeURIComponent(location.hash.slice(1)); } catch (e) { return ''; } }

  function render(mantenerScroll) {
    const hash = rutaActual || hashDelNavegador() || '/';
    const partes = hash.split('?');
    const ruta = partes[0].replace(/\/$/, '') || '/';
    const query = {};
    new URLSearchParams(partes[1] || '').forEach((v, k) => { query[k] = v; });
    const ses = E.sesion();

    let r = null, params = null;
    for (const x of rutas) { params = encajar(x[0], ruta); if (params) { r = x; break; } }
    if (!r) return ir(ses ? inicio(ses) : '/login');
    const seccion = r[1];
    if (seccion && !ses) return ir('/login');
    if (!seccion && ses) return ir(inicio(ses));
    const nivel = seccion === '*' ? 'editar' : seccion ? E.permiso(ses, seccion) : 'editar';
    if (nivel === 'no') { if (ruta !== inicio(ses)) U.toast('No tienes acceso a esa sección'); return ir(inicio(ses)); }

    U.cerrarModal();
    const scroll = window.scrollY;
    const vista = r[2](params, ses, query);
    const app = document.getElementById('app');
    app.innerHTML = seccion ? shell(ses, seccion, vista.html) : vista.html;
    document.title = (vista.titulo ? vista.titulo + ' | ' : '') + 'ALKI Panel';
    // Antetítulo de la marca (mayúsculas con punto celeste) encima del título de cada pantalla
    const sec = seccion && seccion !== '*' ? E.secciones.find((x) => x[0] === seccion) : null;
    const cab = app.querySelector('.pa__pagina .cabecera__fila > div');
    if (sec && cab && !app.querySelector('.pa__pagina .antetitulo')) {
      const ante = document.createElement('p');
      ante.className = 'antetitulo';
      ante.textContent = 'ALKI Panel · ' + sec[1];
      cab.prepend(ante);
    }
    if (vista.montar) vista.montar(app);
    if (nivel === 'ver') soloLectura(app);
    U.fotos.pintar(app);
    const activo = app.querySelector('.pa__nav [aria-current]');
    if (activo && activo.scrollIntoView) activo.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    if (mantenerScroll) window.scrollTo(0, scroll);
    else {
      window.scrollTo(0, 0);
      const h1 = app.querySelector('h1');
      if (h1) { h1.setAttribute('tabindex', '-1'); h1.focus({ preventScroll: true }); }
    }
  }

  function ir(ruta) {
    rutaActual = ruta;
    try { if (hashDelNavegador() !== ruta) history.pushState(null, '', '#' + ruta); } catch (e) { /* vista previa */ }
    render();
  }

  document.addEventListener('click', function (e) {
    const a = e.target.closest('a[href^="#/"]');
    if (a && !e.ctrlKey && !e.metaKey) { e.preventDefault(); ir(a.getAttribute('href').slice(1)); return; }
    const d = e.target.closest('[data-doc]');
    if (d) { const p = d.dataset.doc.split(':'); Alki.docs.abrir(p[0], p[1]); }
  });
  window.addEventListener('hashchange', () => { rutaActual = hashDelNavegador(); render(); });
  window.addEventListener('popstate', () => { rutaActual = hashDelNavegador(); render(); });
  document.addEventListener('DOMContentLoaded', function () {
    E.asegurar();
    E.instalarRegistro();
    const inv = E.aplicarInvitacion();
    if (inv && inv.miembro) {
      // Si había otra sesión abierta en este navegador, se cierra para que entre la persona invitada
      const actual = E.sesion();
      if (!actual || actual.miembroId !== inv.miembro.id) E.salir();
      Alki.invitado = inv.miembro.email;
      rutaActual = '/login';
    }
    // Con Firebase: primero se comprueba si ya había una sesión abierta en este móvil
    if (Alki.nube && Alki.nube.activa) {
      document.getElementById('app').innerHTML = '<div class="entrada"><div class="entrada__caja"><div class="entrada__logo logo logo--grande">' + Alki.logoSimbolo + '<span class="logo__texto">Alki<span>Panel</span></span></div><p class="entrada__texto" style="text-align:center">Conectando…</p></div></div>';
      Alki.nube.iniciar().then(() => { rutaActual = '/login'; render(); }).catch(function (e) {
        console.error(e);
        document.querySelector('#app .entrada__texto').textContent = 'No se ha podido conectar con el servidor. Revisa tu conexión y recarga la página.';
      });
      return;
    }
    render();
    if (inv && inv.miembro) U.toast('Bienvenido/a, ' + U.primerNombre(inv.miembro.nombre) + '. Crea tu contraseña para entrar.');
    if (inv && inv.error) U.toast(inv.error);
  });

  return { ir, inicioDe: () => inicio(E.sesion()), refrescar: () => render(true) };
})();
