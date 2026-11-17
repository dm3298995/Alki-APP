/* ==========================================================================
   ui.js — PIEZAS DE INTERFAZ REUTILIZABLES
   --------------------------------------------------------------------------
   Funciones pequeñas que usan todas las pantallas: formatear euros y fechas,
   iconos, etiquetas de estado, ventanas modales, avisos (toast), el plano de
   la vivienda, etc. Así no repetimos el mismo código en cada vista.
   ========================================================================== */
window.Alki = window.Alki || {};

// Logo oficial de ALKI (la «a» azul), vectorizado del archivo original
Alki.logoSimbolo = '<svg class="logo__simbolo" viewBox="0 0 387 359" aria-hidden="true"><path fill="#91B6FF" fill-rule="evenodd" d="M40.8 53.2 L29.0 68.2 L21.0 81.0 L13.0 97.2 L9.2 107.0 L6.2 116.5 L2.0 136.0 L1.0 143.8 L0.8 150.5 L0.0 152.5 L0.0 170.2 L0.8 172.5 L1.0 179.2 L2.0 186.8 L5.0 201.8 L10.0 218.0 L16.0 232.2 L23.2 245.8 L28.0 253.2 L34.0 261.5 L43.5 272.5 L50.2 283.2 L56.2 291.5 L66.0 303.0 L78.5 315.2 L92.5 326.5 L100.2 331.8 L112.2 338.8 L124.8 344.8 L135.0 348.8 L136.0 348.8 L144.5 351.8 L161.8 355.8 L177.2 357.8 L205.0 357.8 L220.5 355.8 L237.8 351.8 L255.5 345.5 L266.0 340.8 L274.0 336.5 L289.2 326.8 L304.2 314.8 L317.8 301.2 L328.5 288.0 L334.8 279.0 L338.8 272.0 L339.8 271.2 L343.0 295.5 L343.0 298.2 L344.0 303.5 L344.0 306.2 L345.0 311.5 L345.0 314.2 L346.0 319.5 L346.0 322.2 L347.0 327.5 L347.0 330.2 L348.0 335.5 L348.0 338.2 L349.0 343.5 L349.0 346.2 L350.0 351.5 L350.0 354.2 L350.8 357.0 L385.2 357.2 L385.8 356.8 L383.8 338.5 L381.8 325.5 L381.8 322.8 L380.8 317.5 L380.8 314.8 L377.8 293.8 L377.8 291.0 L374.8 270.0 L374.8 267.2 L371.8 246.2 L371.8 243.5 L368.8 222.5 L368.8 219.8 L365.8 198.8 L365.8 196.0 L363.8 183.0 L363.8 180.2 L362.8 174.5 L362.8 168.2 L361.8 158.2 L359.5 145.0 L356.8 133.5 L351.5 117.5 L346.8 106.2 L341.5 95.8 L334.5 84.0 L327.5 74.0 L320.5 65.2 L315.8 60.0 L301.2 46.0 L287.2 35.2 L271.0 25.2 L254.0 17.2 L238.8 12.0 L227.2 9.0 L218.0 7.2 L208.8 6.0 L196.2 5.2 L187.2 3.0 L176.0 1.2 L167.5 0.8 L165.0 0.0 L149.5 0.0 L147.2 0.8 L140.5 1.0 L133.0 2.0 L117.8 5.2 L103.0 10.0 L91.2 15.0 L78.2 22.0 L63.5 32.0 L49.2 44.2Z M301.5 94.5 L308.0 103.8 L312.8 111.8 L317.8 121.8 L321.0 129.5 L325.0 141.5 L325.0 142.8 L327.0 149.5 L329.0 160.0 L330.0 168.5 L330.5 180.8 L330.0 195.0 L327.0 214.0 L324.0 225.2 L319.8 237.0 L311.0 254.8 L307.0 261.2 L299.0 272.2 L293.0 279.2 L283.2 289.0 L276.5 294.8 L268.0 301.0 L260.5 305.8 L248.8 312.0 L237.2 316.8 L227.0 320.0 L218.5 322.0 L208.0 323.8 L194.5 324.8 L187.8 324.8 L176.2 324.0 L169.8 322.8 L169.5 322.2 L170.8 321.8 L177.0 321.5 L192.2 318.8 L210.0 313.5 L225.8 306.8 L241.5 297.8 L255.5 287.5 L269.8 274.2 L281.5 260.5 L288.5 250.5 L293.5 242.2 L301.8 225.5 L305.8 215.0 L308.8 205.2 L312.8 186.5 L314.5 168.0 L314.5 155.0 L313.8 144.2 L311.8 130.5 L309.5 120.5 L306.8 111.0 L303.5 101.8 L300.8 95.8 L300.8 94.8Z M238.2 47.0 L249.5 51.8 L259.0 56.8 L268.5 62.8 L278.5 70.5 L283.8 78.2 L289.0 87.2 L295.0 99.8 L299.8 112.2 L303.0 123.5 L306.0 139.0 L307.0 147.8 L307.5 163.2 L307.0 175.2 L305.0 190.0 L302.0 203.2 L297.0 218.2 L292.8 228.2 L286.0 241.0 L277.8 253.5 L270.0 263.2 L265.0 268.8 L253.5 279.8 L240.5 289.8 L232.2 295.0 L221.0 301.0 L209.5 306.0 L198.2 309.8 L184.8 313.0 L172.5 314.8 L165.0 315.2 L149.8 315.2 L138.0 314.0 L127.0 308.8 L116.8 302.8 L107.2 296.0 L96.5 286.8 L85.0 274.5 L77.8 265.0 L70.0 252.8 L63.8 240.2 L60.0 230.8 L55.8 216.5 L53.0 202.2 L51.8 189.2 L51.8 173.8 L52.8 162.8 L55.8 146.8 L60.8 130.5 L66.8 116.8 L73.0 105.5 L79.8 95.5 L89.0 84.2 L98.5 74.8 L110.8 64.8 L121.0 58.0 L134.8 50.8 L146.8 46.0 L157.5 42.8 L171.5 40.0 L184.2 38.8 L198.2 38.8 L209.0 39.8 L224.5 42.8Z M157.5 7.8 L158.0 8.2 L157.5 8.8 L150.5 10.0 L140.0 13.0 L121.8 20.0 L107.5 27.2 L92.0 37.2 L77.5 49.0 L64.2 62.2 L52.2 77.2 L43.0 91.5 L34.0 109.2 L27.0 128.0 L24.0 138.8 L24.0 140.2 L22.0 148.0 L20.0 161.5 L19.0 174.8 L19.0 188.5 L20.0 202.0 L23.0 220.2 L26.0 232.0 L27.8 236.8 L27.8 237.8 L27.2 238.0 L26.8 236.8 L26.0 236.2 L19.0 221.5 L14.8 210.0 L11.8 199.5 L9.8 190.2 L7.8 175.8 L7.2 157.0 L7.8 147.0 L8.8 138.5 L12.8 119.5 L16.0 109.2 L19.8 99.5 L27.8 83.5 L38.8 67.0 L45.0 59.2 L51.8 52.0 L58.2 45.8 L66.2 39.0 L76.2 31.8 L82.2 28.0 L98.2 19.8 L110.5 15.0 L117.8 12.8 L119.0 12.8 L125.8 10.8 L137.0 8.8 L146.0 7.8Z"/></svg>';
Alki.marca = Alki.logoSimbolo + '<span class="logo__texto">Alki<span>Rentals</span></span>';

Alki.ui = (function () {
  /* ---------- Seguridad: escapar texto que escribe el usuario ----------
     Evita que alguien meta código HTML/JS en una incidencia o mensaje. */
  function esc(texto) {
    return String(texto === null || texto === undefined ? '' : texto)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* ---------- Formatos ---------- */
  // 1200 → "1.200 €" (agrupamos a mano porque en español los números de 4 cifras no llevan punto por defecto)
  function euro(n) {
    const valor = Math.round(n || 0);
    const texto = String(Math.abs(valor)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return (valor < 0 ? '−' : '') + texto + ' €';
  }

  const aFecha = (iso) => new Date(iso + 'T00:00:00');
  function fecha(iso, larga) {
    if (!iso) return '';
    const op = larga ? { day: 'numeric', month: 'long', year: 'numeric' } : { day: 'numeric', month: 'short' };
    const d = aFecha(iso);
    // Si no es de este año, mostramos también el año en la versión corta
    if (!larga && d.getFullYear() !== new Date().getFullYear()) op.year = 'numeric';
    return d.toLocaleDateString('es-ES', op).replace('.', '');
  }
  function mes(periodo) {
    const d = aFecha(periodo + '-01');
    const t = d.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }).replace(' de ', ' ');
    return t.charAt(0).toUpperCase() + t.slice(1);
  }
  // Días entre hoy y una fecha (negativo si ya pasó)
  function diasHasta(iso) {
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    return Math.round((aFecha(iso) - hoy) / 86400000);
  }
  function relativo(iso) {
    const d = diasHasta(iso);
    if (d === 0) return 'hoy';
    if (d === -1) return 'ayer';
    if (d === 1) return 'mañana';
    if (d < 0 && d > -30) return 'hace ' + -d + ' días';
    if (d > 1 && d < 30) return 'en ' + d + ' días';
    return fecha(iso);
  }
  const primerNombre = (nombre) => String(nombre).split(' ')[0];

  /* ---------- Iconos (SVG en línea, trazo de 1.75) ---------- */
  const trazos = {
    inicio: '<path d="M3 11l9-8 9 8M5 9.5V20h5v-6h4v6h5V9.5"/>',
    pagos: '<path d="M17.5 6.5a7 7 0 1 0 0 11M4 10h9M4 14h9"/>',
    incidencias: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/>',
    documentos: '<path d="M14 3H6v18h12V7zM14 3v4h4M9 12h6M9 16h6"/>',
    llave: '<circle cx="15" cy="9" r="4.5"/><path d="M11.8 12.2L4 20M7 17l2 2M4.8 19.2l1.6 1.6"/>',
    regalo: '<path d="M3 8h18v4H3zM5 12v9h14v-9M12 8v13M12 8C10 4 6 4 6 6.5S9 8 12 8zm0 0c2-4 6-4 6-1.5S15 8 12 8z"/>',
    usuario: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4.5-6 8-6s7 2 8 6"/>',
    chat: '<path d="M4 5h16v11H9l-5 4z"/>',
    panel: '<path d="M5 20V11M11 20V5M17 20v-7M3 20h18"/>',
    edificio: '<path d="M4 21V5l8-2v18M12 7l8 2v12M7 8h2M7 12h2M7 16h2M15 12h2M15 16h2M2 21h20"/>',
    personas: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.5-5.5 6.5-5.5s5.7 2 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5c2 .6 3.2 2.6 3.5 5.5"/>',
    mas: '<path d="M12 5v14M5 12h14"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
    cerrar: '<path d="M6 6l12 12M18 6L6 18"/>',
    flecha: '<path d="M9 6l6 6-6 6"/>',
    atras: '<path d="M15 6l-6 6 6 6"/>',
    salir: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>',
    campana: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0"/>',
    descargar: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
    subir: '<path d="M12 16V5M7 10l5-5 5 5M5 20h14"/>',
    copiar: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/>',
    wifi: '<path d="M2 9a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0"/><circle cx="12" cy="19.5" r="1"/>',
    calendario: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    telefono: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
    camara: '<path d="M3 8h4l2-3h6l2 3h4v12H3z"/><circle cx="12" cy="13.5" r="3.5"/>',
    imprimir: '<path d="M7 9V3h10v6M7 17H4v-8h16v8h-3M7 14h10v7H7z"/>',
    ojo: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    correo: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
    rodillo: '<rect x="4" y="3" width="14" height="6" rx="1"/><path d="M18 6h2v5h-8v3M11 14h2v7h-2z"/>',
    papelera: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    enviar: '<path d="M4 12l16-8-6 16-3-7z"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    calculadora: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8.5 11h.01M12 11h.01M15.5 11h.01M8.5 14.5h.01M12 14.5h.01M15.5 14.5v3.5M8.5 18h.01M12 18h.01"/>',
    corazon: '<path d="M12 20s-7.5-4.6-9-9.3C2 7.4 4.2 4.5 7.4 4.5c2 0 3.6 1.1 4.6 2.7 1-1.6 2.6-2.7 4.6-2.7 3.2 0 5.4 2.9 4.4 6.2-1.5 4.7-9 9.3-9 9.3z"/>',
    comentario: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9.5h8M8 12.5h5"/>'
  };
  function icono(nombre, clase) {
    return '<svg class="icono ' + (clase || '') + '" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">' + (trazos[nombre] || '') + '</svg>';
  }

  /* ---------- Etiquetas de estado (badges) ---------- */
  const estados = {
    pago: { pagado: ['Pagado', 'ok'], revision: ['En revisión', 'info'], vencido: ['Vencido', 'mal'], pendiente: ['Pendiente', 'aviso'] },
    incidencia: { abierta: ['Abierta', 'aviso'], en_curso: ['En curso', 'info'], resuelta: ['Resuelta', 'ok'] },
    prioridad: { baja: ['Baja', 'neutro'], media: ['Media', 'info'], alta: ['Alta', 'aviso'], urgente: ['Urgente', 'mal'] },
    habitacion: { ocupada: ['Ocupada', 'ok'], libre: ['Libre', 'aviso'], reforma: ['En reforma', 'info'] },
    vivienda: { bueno: ['Buen estado', 'ok'], atencion: ['Requiere atención', 'aviso'], reforma: ['En reforma', 'info'], null: ['Sin revisar', 'neutro'] },
    solvencia: { up_to_date: ['Al día', 'ok'], pending: ['Mes en curso', 'aviso'], overdue: ['Con deuda', 'mal'] },
    confirmacion: { ok: ['Confirmados', 'ok'], revisar: ['A revisar', 'mal'], pendiente: ['Sin confirmar', 'neutro'] },
    referido: { interesado: ['Interesado', 'neutro'], firmado: ['Ha firmado', 'info'], cumple: ['Cumple 6 meses', 'aviso'], pagado: ['30 € pagados', 'ok'] },
    reforma: { en_curso: ['En curso', 'info'], completada: ['Completada', 'ok'] },
    solicitud: { nueva: ['Nueva', 'aviso'], atendida: ['Atendida', 'ok'] },
    ingreso: { true: ['Recibido', 'ok'], false: ['Programado', 'neutro'] }
  };
  function etiqueta(tipo, valor) {
    const e = (estados[tipo] || {})[valor] || [valor, 'neutro'];
    return '<span class="etiqueta etiqueta--' + e[1] + '">' + esc(e[0]) + '</span>';
  }

  /* ---------- Bloques de página ---------- */
  // Cabecera de pantalla con botón de volver opcional
  function cabecera(titulo, opciones) {
    const o = opciones || {};
    return '<header class="cabecera">' +
      (o.volver ? '<a class="volver" href="#' + o.volver + '">' + icono('atras') + '<span>' + esc(o.volverTexto || 'Volver') + '</span></a>' : '') +
      '<div class="cabecera__fila"><div><h1>' + esc(titulo) + '</h1>' +
      (o.subtitulo ? '<p class="cabecera__sub">' + o.subtitulo + '</p>' : '') + '</div>' +
      (o.accion || '') + '</div></header>';
  }
  function vacio(texto, accion) {
    return '<div class="vacio"><p>' + esc(texto) + '</p>' + (accion || '') + '</div>';
  }

  /* ---------- Plano de la vivienda ----------
     Dibuja la distribución con CSS Grid. Cada habitación se colorea según
     su estado. Con nombres:true (solo ALKI) muestra quién vive en cada una. */
  function plano(v, opciones) {
    const o = opciones || {};
    const S = Alki.store;
    const filas = v.plano;
    const columnas = filas[0].split(' ').length;
    const areas = filas.map((f) => "'" + f + "'").join(' ');
    const nombres = [];
    filas.join(' ').split(' ').forEach((a) => { if (!nombres.includes(a)) nombres.push(a); });

    const conteo = { ocupada: 0, libre: 0, reforma: 0 };
    let celdas = '';
    nombres.forEach(function (area) {
      if (area === '.') return;
      if (!Alki.constantes.zonas[area]) {
        const h = S.habitacionesDe(v.id).find((x) => (x.area || x.codigo.toLowerCase()) === area);
        if (!h) return;
        const estado = S.estadoHabitacion(h);
        conteo[estado]++;
        let detalle = estados.habitacion[estado][0];
        if (o.nombres && estado === 'ocupada') detalle = primerNombre(S.inquilinoDeHabitacion(h.id).nombre) + (S.contratosDeHabitacion(h.id).length > 1 ? ' (+1)' : '');
        const destacada = o.resaltar === h.id ? ' plano__hab--tuya' : '';
        celdas += '<div class="plano__hab plano__hab--' + estado + destacada + '" style="grid-area:' + area + '">' +
          '<strong>' + h.codigo + '</strong>' + (o.mini ? '' : '<span>' + esc(detalle) + '</span>') + '</div>';
      } else {
        celdas += '<div class="plano__zona" style="grid-area:' + area + '"><span>' + esc(Alki.constantes.zonas[area] || area) + '</span></div>';
      }
    });
    const resumen = 'Plano de ' + v.alias + ': ' + conteo.ocupada + ' habitaciones ocupadas, ' + conteo.libre + ' libres y ' + conteo.reforma + ' en reforma.';
    return '<div class="plano' + (o.mini ? ' plano--mini' : '') + '" role="img" aria-label="' + esc(resumen) + '" ' +
      'style="grid-template-areas:' + areas + ';grid-template-columns:repeat(' + columnas + ',1fr)">' + celdas + '</div>';
  }
  function leyendaPlano() {
    return '<ul class="leyenda"><li><i class="leyenda__m leyenda__m--ocupada"></i>Ocupada</li>' +
      '<li><i class="leyenda__m leyenda__m--libre"></i>Libre</li><li><i class="leyenda__m leyenda__m--reforma"></i>En reforma</li></ul>';
  }

  /* ---------- Ventana modal ---------- */
  let ultimoFoco = null;
  function abrirModal(titulo, html, opciones) {
    const o = opciones || {};
    cerrarModal();
    ultimoFoco = document.activeElement;
    const raiz = document.getElementById('modal-root');
    raiz.innerHTML = '<div class="modal-fondo" data-cerrar-modal>' +
      '<div class="modal' + (o.ancho ? ' modal--ancho' : '') + '" role="dialog" aria-modal="true" aria-labelledby="modal-titulo">' +
      '<div class="modal__cab"><h2 id="modal-titulo">' + esc(titulo) + '</h2>' +
      '<button class="boton-icono" type="button" data-cerrar-modal aria-label="Cerrar">' + icono('cerrar') + '</button></div>' +
      '<div class="modal__cuerpo">' + html + '</div></div></div>';
    document.body.classList.add('con-modal');
    const modal = raiz.querySelector('.modal');
    raiz.querySelectorAll('[data-cerrar-modal]').forEach(function (el) {
      el.addEventListener('click', function (e) { if (e.target === el || el.tagName === 'BUTTON') cerrarModal(); });
    });
    const primero = modal.querySelector('input, select, textarea') || modal.querySelector('.modal__cab button');
    if (primero) primero.focus();
    if (o.alMontar) o.alMontar(modal);
    fotos.pintar(modal);
    return modal;
  }
  function cerrarModal() {
    const raiz = document.getElementById('modal-root');
    if (!raiz || !raiz.innerHTML) return;
    raiz.innerHTML = '';
    document.body.classList.remove('con-modal');
    if (ultimoFoco && document.body.contains(ultimoFoco)) ultimoFoco.focus();
  }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') cerrarModal(); });

  /* ---------- Aviso flotante (toast) ---------- */
  let temporizador = null;
  function toast(texto) {
    const t = document.getElementById('toast');
    t.textContent = texto;
    t.classList.add('toast--visible');
    clearTimeout(temporizador);
    temporizador = setTimeout(() => t.classList.remove('toast--visible'), 2800);
  }

  /* ---------- Archivos: leer imagen o PDF como dataURL ----------
     Las fotos se reducen a 1400 px para que quepan en el navegador. */
  function leerArchivo(archivo) {
    return new Promise(function (resolver, rechazar) {
      const lector = new FileReader();
      lector.onerror = () => rechazar(new Error('No se pudo leer el archivo.'));
      if (archivo.type.indexOf('image/') === 0) {
        lector.onload = function () {
          const img = new Image();
          img.onload = function () {
            const max = 1280;
            const escala = Math.min(1, max / Math.max(img.width, img.height));
            const lienzo = document.createElement('canvas');
            lienzo.width = Math.round(img.width * escala);
            lienzo.height = Math.round(img.height * escala);
            lienzo.getContext('2d').drawImage(img, 0, 0, lienzo.width, lienzo.height);
            resolver(lienzo.toDataURL('image/jpeg', 0.78));
          };
          img.onerror = () => rechazar(new Error('La imagen no es válida.'));
          img.src = lector.result;
        };
      } else {
        if (archivo.size > 1.5 * 1024 * 1024) return rechazar(new Error('El archivo pesa más de 1,5 MB. Prueba con uno más ligero.'));
        lector.onload = () => resolver(lector.result);
      }
      lector.readAsDataURL(archivo);
    });
  }
  // Convierte un dataURL en un enlace temporal que el navegador puede abrir
  function enlaceDesdeDataUrl(dataUrl) {
    const partes = dataUrl.split(',');
    const tipo = partes[0].match(/:(.*?);/)[1];
    const binario = atob(partes[1]);
    const bytes = new Uint8Array(binario.length);
    for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
    return URL.createObjectURL(new Blob([bytes], { type: tipo }));
  }

  /* ---------- Fotos (incidencias y ALKI Social) ----------
     Las fotos ocupan mucho, así que se guardan en IndexedDB (la "base de
     datos grande" del navegador) y en los datos solo queda su identificador.
     Si el navegador no deja usar IndexedDB, la foto se guarda tal cual. */
  const fotos = (function () {
    let base = null;
    const cache = {};
    function abrir() {
      if (base) return base;
      base = new Promise(function (ok, mal) {
        try {
          const peticion = indexedDB.open('alki-fotos', 1);
          peticion.onupgradeneeded = () => peticion.result.createObjectStore('fotos');
          peticion.onsuccess = () => ok(peticion.result);
          peticion.onerror = () => mal(peticion.error);
        } catch (e) { mal(e); }
      });
      return base;
    }
    function guardar(dataUrl) {
      const id = 'foto-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
      return abrir().then((bd) => new Promise(function (ok, mal) {
        const tx = bd.transaction('fotos', 'readwrite');
        tx.objectStore('fotos').put(dataUrl, id);
        tx.oncomplete = () => { cache[id] = dataUrl; ok(id); };
        tx.onerror = () => mal(tx.error);
      })).catch(() => dataUrl); // sin IndexedDB: se usa la foto directamente
    }
    function cargar(id) {
      if (!id) return Promise.resolve(null);
      if (id.indexOf('data:') === 0) return Promise.resolve(id);
      if (cache[id]) return Promise.resolve(cache[id]);
      return abrir().then((bd) => new Promise(function (ok) {
        const r = bd.transaction('fotos').objectStore('fotos').get(id);
        r.onsuccess = () => { cache[id] = r.result || null; ok(r.result || null); };
        r.onerror = () => ok(null);
      })).catch(() => null);
    }
    // Rellena todas las <img data-foto="id"> de un trozo de página
    function pintar(raiz) {
      raiz.querySelectorAll('img[data-foto]').forEach(function (img) {
        cargar(img.dataset.foto).then(function (url) {
          if (url) img.src = url; else img.alt = 'Foto no disponible en este dispositivo';
        });
      });
    }
    return { guardar, cargar, pintar };
  })();

  // Miniaturas que se amplían al pulsar
  function galeria(ids) {
    if (!ids || !ids.length) return '';
    return '<div class="galeria">' + ids.map((id, n) =>
      '<button type="button" data-ampliar="' + esc(id) + '" aria-label="Ampliar foto ' + (n + 1) + '"><img data-foto="' + esc(id) + '" alt="Foto ' + (n + 1) + '"></button>').join('') + '</div>';
  }
  document.addEventListener('click', function (e) {
    const b = e.target.closest('[data-ampliar]');
    if (!b) return;
    const m = abrirModal('Foto', '<img class="foto-grande" data-foto="' + esc(b.dataset.ampliar) + '" alt="Foto ampliada">', { ancho: true });
    fotos.pintar(m);
  });

  /* Selector de varias fotos con vista previa y botón de quitar.
     selectorFotos() devuelve el HTML y montarSelectorFotos() lo hace funcionar;
     esta última devuelve una función que da las fotos elegidas (dataURL). */
  function selectorFotos(max) {
    return '<div class="fotos-selector" data-max="' + (max || 6) + '">' +
      '<label class="foto-anadir">' + icono('camara') + '<span>Añadir fotos</span>' +
      '<input class="oculto" type="file" accept="image/*" multiple></label></div>';
  }
  function montarSelectorFotos(raiz) {
    const caja = raiz.querySelector('.fotos-selector');
    if (!caja) return () => [];
    const max = Number(caja.dataset.max);
    const elegidas = [];
    const input = caja.querySelector('input');
    const boton = caja.querySelector('.foto-anadir');
    function pintarSel() {
      caja.querySelectorAll('.foto-mini').forEach((x) => x.remove());
      elegidas.forEach(function (url, n) {
        const d = document.createElement('div');
        d.className = 'foto-mini';
        d.innerHTML = '<img alt="Foto ' + (n + 1) + '"><button class="foto-mini__quitar" type="button" aria-label="Quitar foto ' + (n + 1) + '">' + icono('cerrar') + '</button>';
        d.querySelector('img').src = url;
        d.querySelector('button').addEventListener('click', () => { elegidas.splice(n, 1); pintarSel(); });
        caja.insertBefore(d, boton);
      });
      boton.hidden = elegidas.length >= max;
    }
    input.addEventListener('change', function () {
      const archivos = Array.from(input.files).slice(0, max - elegidas.length);
      Promise.all(archivos.map((f) => leerArchivo(f).catch(() => null))).then(function (urls) {
        urls.filter(Boolean).forEach((u) => elegidas.push(u));
        input.value = '';
        pintarSel();
      });
    });
    return () => elegidas.slice();
  }
  // Guarda una lista de fotos y devuelve sus identificadores
  const guardarFotos = (urls) => Promise.all((urls || []).map(fotos.guardar));

  // "hace 5 min", "hace 2 h", "ayer"… para fechas con hora (ISO completo)
  function haceTiempo(iso) {
    if (!iso) return '';
    if (iso.length <= 10) return relativo(iso);
    const s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 60) return 'ahora';
    if (s < 3600) return 'hace ' + Math.floor(s / 60) + ' min';
    if (s < 86400) return 'hace ' + Math.floor(s / 3600) + ' h';
    return relativo(iso.slice(0, 10));
  }

  // Lee los campos de un formulario como objeto { nombre: valor }
  function datosFormulario(form) {
    const datos = {};
    new FormData(form).forEach((valor, clave) => { datos[clave] = typeof valor === 'string' ? valor.trim() : valor; });
    return datos;
  }

  return {
    esc, euro, fecha, mes, diasHasta, relativo, primerNombre, icono, etiqueta, cabecera, vacio,
    plano, leyendaPlano, abrirModal, cerrarModal, toast, leerArchivo, enlaceDesdeDataUrl, datosFormulario,
    fotos, galeria, selectorFotos, montarSelectorFotos, guardarFotos, haceTiempo
  };
})();
