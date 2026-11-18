/* ==========================================================================
   app.js — ARRANQUE Y NAVEGACIÓN (router)
   --------------------------------------------------------------------------
   La app es una "SPA" (Single Page Application): solo hay un index.html y
   las pantallas cambian según lo que hay después de la # en la dirección.
     #/inquilino/pagos  →  pantalla de pagos del inquilino
   Este archivo:
     1. Define qué rutas existen y qué rol puede verlas.
     2. Dibuja la estructura común (menú lateral, barra inferior).
     3. Pinta la pantalla que toca cada vez que cambia la dirección.
   ========================================================================== */
window.Alki = window.Alki || {};


Alki.app = (function () {
  const S = Alki.store, U = Alki.ui, V = Alki.vistas;

  /* ---------- Menús de cada rol ----------
     Quinto valor: 'lateral' = solo en el menú de escritorio; 'movil' = solo en la barra de abajo.
     En el móvil, lo que no cabe abajo está en «Más». */
  const menus = {
    inquilino: [
      ['inicio', '/inquilino', 'Inicio', 'inicio'], ['pagos', '/inquilino/pagos', 'Pagos', 'pagos'],
      ['incidencias', '/inquilino/incidencias', 'Incidencias', 'incidencias'], ['social', '/inquilino/social', 'Social', 'personas'],
      ['documentos', '/inquilino/documentos', 'Documentos', 'documentos', 'lateral'], ['casa', '/inquilino/casa', 'Mi casa', 'llave', 'lateral'],
      ['embajadores', '/inquilino/embajadores', 'Embajadores', 'regalo', 'lateral'], ['mas', '/mas', 'Más', 'menu', 'movil']
    ],
    propietario: [
      ['inicio', '/propietario', 'Mis viviendas', 'edificio'], ['pagos', '/propietario/pagos', 'Ingresos', 'pagos'],
      ['documentos', '/propietario/documentos', 'Documentos', 'documentos'], ['mensajes', '/propietario/mensajes', 'Mensajes', 'chat'],
      ['mas', '/mas', 'Más', 'menu', 'movil']
    ],
    admin: [
      ['panel', '/admin', 'Panel', 'panel'], ['viviendas', '/admin/viviendas', 'Viviendas', 'edificio'],
      ['incidencias', '/admin/incidencias', 'Incidencias', 'incidencias'], ['cobros', '/admin/cobros', 'Cobros', 'pagos'],
      ['personas', '/admin/personas', 'Personas', 'personas', 'lateral'], ['social', '/admin/social', 'Social', 'chat', 'lateral'],
      ['mensajes', '/admin/mensajes', 'Mensajes', 'correo', 'lateral'], ['mas', '/mas', 'Más', 'menu', 'movil']
    ]
  };
  Alki.menus = menus;

  /* ---------- Rutas: [patrón, rol, función de la vista, menú activo] ---------- */
  const rutas = [
    ['/login', null, V.login],
    ['/inquilino/confirmar', 'inquilino', V.inq.confirmar, 'inicio', 'sinMenu'],
    ['/inquilino', 'inquilino', V.inq.inicio, 'inicio'],
    ['/inquilino/pagos', 'inquilino', V.inq.pagos, 'pagos'],
    ['/inquilino/incidencias', 'inquilino', V.inq.incidencias, 'incidencias'],
    ['/inquilino/incidencias/nueva', 'inquilino', V.inq.nuevaIncidencia, 'incidencias'],
    ['/inquilino/incidencias/:id', 'inquilino', V.inq.incidencia, 'incidencias'],
    ['/inquilino/documentos', 'inquilino', V.inq.documentos, 'documentos'],
    ['/inquilino/casa', 'inquilino', V.inq.casa, 'casa'],
    ['/inquilino/embajadores', 'inquilino', V.inq.embajadores, 'embajadores'],
    ['/inquilino/social', 'inquilino', V.social, 'social'],
    ['/admin/social', 'admin', V.social, 'social'],
    ['/mas', '*', V.mas, 'mas'],
    ['/propietario', 'propietario', V.prop.inicio, 'inicio'],
    ['/propietario/vivienda/:id', 'propietario', V.prop.vivienda, 'inicio'],
    ['/propietario/pagos', 'propietario', V.prop.pagos, 'pagos'],
    ['/propietario/documentos', 'propietario', V.prop.documentos, 'documentos'],
    ['/propietario/mensajes', 'propietario', V.prop.mensajes, 'mensajes'],
    ['/admin', 'admin', V.admin.panel, 'panel'],
    ['/admin/viviendas', 'admin', V.admin.viviendas, 'viviendas'],
    ['/admin/viviendas/:id', 'admin', V.admin.vivienda, 'viviendas'],
    ['/admin/incidencias', 'admin', V.admin.incidencias, 'incidencias'],
    ['/admin/incidencias/:id', 'admin', V.admin.incidencia, 'incidencias'],
    ['/admin/cobros', 'admin', V.admin.cobros, 'cobros'],
    ['/admin/personas', 'admin', V.admin.personas, 'personas'],
    ['/admin/mensajes', 'admin', V.admin.mensajes, 'mensajes'],
    ['/perfil', '*', V.perfil, 'perfil']
  ];

  const inicioDe = (rol) => ({ inquilino: '/inquilino', propietario: '/propietario', admin: '/admin' }[rol] || '/login');

  // Compara la dirección con un patrón y extrae los parámetros (:id)
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

  /* ---------- Estructura común (shell) ---------- */
  function iniciales(nombre) {
    return nombre.split(' ').slice(0, 2).map((x) => x.charAt(0)).join('').toUpperCase();
  }
  function shell(ses, activo, contenido) {
    const items = menus[ses.rol];
    // Las secciones que viven dentro de «Más» marcan «Más» como activo en el móvil
    const enMas = items.some((it) => it[0] === activo && it[4] === 'lateral') || activo === 'perfil';
    const enlace = (it) => '<a href="#' + it[1] + '"' + (it[0] === activo || (it[0] === 'mas' && enMas) ? ' aria-current="page"' : '') + '>' + U.icono(it[3]) + '<span>' + it[2] + '</span></a>';
    const rolTexto = { inquilino: 'Inquilino', propietario: 'Propietario', admin: 'Equipo ALKI' }[ses.rol];
    return '<div class="shell">' +
      '<aside class="lateral"><a class="logo" href="#' + inicioDe(ses.rol) + '">' + Alki.marca + '</a>' +
        '<nav aria-label="Menú principal">' + items.filter((it) => it[4] !== 'movil').map(enlace).join('') + '</nav>' +
        '<a class="lateral__usuario" href="#/perfil"' + (activo === 'perfil' ? ' aria-current="page"' : '') + '><span class="avatar">' + iniciales(ses.nombre) + '</span>' +
        '<span>' + U.esc(ses.nombre) + '<small>' + rolTexto + '</small></span></a></aside>' +
      '<header class="barra-superior"><a class="logo" href="#' + inicioDe(ses.rol) + '">' + Alki.marca + '</a>' +
        '<a class="avatar" href="#/perfil" aria-label="Tu perfil">' + iniciales(ses.nombre) + '</a></header>' +
      '<main class="principal" id="principal"><div class="pagina">' + contenido + '</div></main>' +
      '<nav class="pestanas" aria-label="Menú principal">' + items.filter((it) => it[4] !== 'lateral').map(enlace).join('') + '</nav>' +
      '</div>';
  }

  /* ---------- Pintar la pantalla actual ---------- */
  /* La ruta actual se guarda en memoria. Así la app funciona aunque el
     navegador o una vista previa bloqueen los enlaces con # (y el botón
     «atrás» sigue funcionando cuando se puede usar el historial). */
  let rutaActual = null;
  function hashDelNavegador() { try { return decodeURIComponent(location.hash.slice(1)); } catch (e) { return ''; } }

  function render(mantenerScroll) {
    const hash = rutaActual || hashDelNavegador() || '/';
    const partes = hash.split('?');
    const ruta = partes[0].replace(/\/$/, '') || '/';
    const query = {};
    new URLSearchParams(partes[1] || '').forEach((v, k) => { query[k] = v; });
    const ses = S.sesion();

    let encontrada = null, params = null;
    for (const r of rutas) {
      params = encajar(r[0], ruta);
      if (params) { encontrada = r; break; }
    }
    // Redirecciones: sin sesión → login; ruta de otro rol → su inicio
    if (!encontrada) return ir(ses ? inicioDe(ses.rol) : '/login');
    const rol = encontrada[1];
    if (rol && !ses) return ir('/login');
    if (!rol && ses) return ir(inicioDe(ses.rol));
    if (rol && rol !== '*' && rol !== ses.rol) return ir(inicioDe(ses.rol));
    // Un inquilino que aún no ha confirmado los datos de su alquiler, primero los confirma
    if (ses && S.necesitaConfirmar(ses) && ruta !== '/inquilino/confirmar') return ir('/inquilino/confirmar');

    U.cerrarModal();
    const scroll = window.scrollY;
    const vista = encontrada[2](params, ses, query);
    const app = document.getElementById('app');
    app.innerHTML = rol && encontrada[4] !== 'sinMenu' ? shell(ses, encontrada[3], vista.html) : vista.html;
    document.title = (vista.titulo ? vista.titulo + ' | ' : '') + 'ALKI Rentals';
    if (vista.montar) vista.montar(app);
    U.fotos.pintar(app);
    avisoInstalar(app);

    if (mantenerScroll) {
      window.scrollTo(0, scroll);
    } else {
      window.scrollTo(0, 0);
      // Accesibilidad: lleva el foco al título de la nueva pantalla
      const h1 = app.querySelector('h1');
      if (h1) { h1.setAttribute('tabindex', '-1'); h1.focus({ preventScroll: true }); }
    }
  }

  /* ---------- Aviso «Instala ALKI en tu iPhone» ----------
     Solo en iPhone/iPad, en Safari y si aún no está instalada. */
  function avisoInstalar(app) {
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const instalada = window.navigator.standalone === true || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
    let cerrado = false;
    try { cerrado = localStorage.getItem('alki-aviso-instalar') === 'no'; } catch (e) { /* nada */ }
    if (!ios || instalada || cerrado || location.protocol.indexOf('http') !== 0) return;
    const destino = app.querySelector('.entrada__caja, .pagina');
    if (!destino) return;
    const aviso = document.createElement('div');
    aviso.className = 'instalar';
    aviso.innerHTML = '<img src="assets/icon-180.png" alt="" width="44" height="44"><div><strong>Instala ALKI en tu iPhone</strong>' +
      '<p>Pulsa <span class="instalar__icono" aria-label="Compartir">' + U.icono('subir') + '</span> en Safari y elige <strong>Añadir a pantalla de inicio</strong>.</p></div>' +
      '<button class="boton-icono" type="button" aria-label="Cerrar aviso">' + U.icono('cerrar') + '</button>';
    aviso.querySelector('button').addEventListener('click', function () {
      try { localStorage.setItem('alki-aviso-instalar', 'no'); } catch (e) { /* nada */ }
      aviso.remove();
    });
    destino.prepend(aviso);
  }

  function ir(ruta) {
    rutaActual = ruta;
    try { if (hashDelNavegador() !== ruta) history.pushState(null, '', '#' + ruta); } catch (e) { /* vista previa sin historial */ }
    render();
  }

  // Cualquier enlace interno (#/...) se maneja aquí, sin recargar nada
  document.addEventListener('click', function (e) {
    const a = e.target.closest('a[href^="#/"]');
    if (!a || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    ir(a.getAttribute('href').slice(1));
  });

  // Abre documentos desde cualquier botón con data-doc="tipo:id"
  document.addEventListener('click', function (e) {
    const b = e.target.closest('[data-doc]');
    if (!b) return;
    const partes = b.dataset.doc.split(':');
    Alki.docs.abrir(partes[0], partes[1]);
  });

  window.addEventListener('hashchange', () => { rutaActual = hashDelNavegador(); render(); });
  window.addEventListener('popstate', () => { rutaActual = hashDelNavegador(); render(); });
  document.addEventListener('DOMContentLoaded', function () {
    // Con Firebase: primero se recupera la cuenta abierta en este móvil y se descargan sus datos
    const N = Alki.nube;
    if (N && N.activa) {
      N.usarPortal();
      document.getElementById('app').innerHTML = '<div class="entrada"><div class="entrada__caja"><div class="entrada__logo logo logo--grande">' + Alki.marca + '</div><p class="entrada__texto" style="text-align:center">Conectando…</p></div></div>';
      N.iniciar().then(function (u) {
        if (!u || !u.emailVerified) { rutaActual = '/login'; return render(); }
        return N.perfilAcceso().then(function (acc) {
          if (!acc) { rutaActual = '/login'; return render(); }
          return N.conectarPortal({ alCambiar: () => render(true) }).then(function () {
            // Si ya había entrado antes con este correo, va directo a su inicio
            const s = S.sesion();
            if (!s || String(s.email || '').toLowerCase() !== u.email.toLowerCase()) rutaActual = '/login';
            render();
          });
        });
      }).catch(function (e) {
        console.error(e);
        const t = document.querySelector('#app .entrada__texto');
        if (t) t.textContent = 'No se ha podido conectar. Revisa tu conexión y vuelve a abrir la app.';
      });
      return;
    }
    render();
  });

  // PWA: permite instalar la app y usarla sin conexión (solo funciona en http/https)
  if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () { /* no es imprescindible */ });
    });
  }

  return { ir, inicioDe, refrescar: () => render(true) };
})();
