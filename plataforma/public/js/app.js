/* ==========================================================================
   app.js — ARRANQUE, NAVEGACIÓN Y SESIÓN
   · Rutas con # (p. ej. #/inmuebles/3) → no recarga la página.
   · El menú solo muestra lo que el rol puede ver (el servidor, además,
     lo comprueba siempre).
   · Cierre automático por inactividad: aviso 2 minutos antes y salida.
   ========================================================================== */
import { html, montar, $, icono, aviso } from './ui.js';
import { get, post, configurar } from './api.js';
import { activarGraficos } from './graficos.js';
import { sesion } from './sesion.js';
import { vistaFacturas } from './vistas/facturas.js';
import * as acceso from './vistas/acceso.js';
import { vistaPanel } from './vistas/panel.js';
import { vistaInmuebles, vistaInmueble } from './vistas/inmuebles.js';
import { vistaHabitaciones, vistaHabitacion } from './vistas/habitaciones.js';
import { vistaPagos } from './vistas/pagos.js';
import { vistaIngresos } from './vistas/ingresos.js';
import { vistaIncidencias } from './vistas/incidencias.js';
import { vistaContratos, vistaContrato } from './vistas/contratos.js';
import { vistaGastos } from './vistas/gastos.js';
import { vistaRentabilidad } from './vistas/rentabilidad.js';
import { vistaMantenimientos } from './vistas/mantenimientos.js';
import { vistaEstadisticas } from './vistas/estadisticas.js';
import { vistaAdmin, vistaCuenta } from './vistas/admin.js';

const app = $('#app');
const ctx = { usuario: null, permisos: [], puede: (p) => ctx.permisos.includes(p) };

const MENU = [
  ['', 'Panel', 'panel', 'panel.ver'],
  ['incidencias', 'Incidencias', 'incidencias', 'incidencias.ver'],
  ['inmuebles', 'Inmuebles', 'inmuebles', 'inmuebles.ver'],
  ['habitaciones', 'Habitaciones', 'habitaciones', 'habitaciones.ver'],
  ['contratos', 'Contratos', 'contratos', 'contratos.ver'],
  ['ingresos', 'Ingresos', 'ingresos', 'ingresos.ver'],
  ['pagos', 'Pagos', 'pagos', 'pagos.ver'],
  ['gastos', 'Gastos y costes', 'gastos', 'gastos.ver'],
  ['facturas', 'Facturas', 'facturas', 'facturas.ver'],
  ['rentabilidad', 'Beneficios', 'rentabilidad', 'rentabilidad.ver'],
  ['mantenimientos', 'Mantenimientos', 'mantenimientos', 'mantenimientos.ver'],
  ['estadisticas', 'Estadísticas', 'estadisticas', 'estadisticas.ver'],
  ['admin', 'Configuración', 'admin', ['admin.usuarios', 'admin.integraciones', 'admin.importar', 'admin.auditoria']]
];

const RUTAS = [
  [/^$/, vistaPanel], [/^inmuebles$/, vistaInmuebles], [/^inmuebles\/(\d+)$/, vistaInmueble],
  [/^habitaciones$/, vistaHabitaciones], [/^habitaciones\/(\d+)$/, vistaHabitacion],
  [/^contratos$/, vistaContratos], [/^contratos\/(\d+)$/, vistaContrato],
  [/^incidencias$/, vistaIncidencias], [/^pagos$/, vistaPagos], [/^ingresos$/, vistaIngresos], [/^gastos$/, vistaGastos], [/^facturas$/, vistaFacturas], [/^rentabilidad$/, vistaRentabilidad], [/^mantenimientos$/, vistaMantenimientos],
  [/^estadisticas$/, vistaEstadisticas], [/^admin(?:\/([a-z]+))?$/, vistaAdmin], [/^cuenta$/, vistaCuenta]
];

// Permiso necesario para abrir cada pestaña (se comprueba antes de pedir datos)
const PERMISO_RUTA = Object.fromEntries(MENU.filter((m) => m[0]).map((m) => [m[0], m[3]]).concat([['cuenta', null]]));

function leerHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [ruta, q = ''] = h.split('?');
  return { ruta: ruta.replace(/\/$/, ''), query: new URLSearchParams(q) };
}

function pintarMarco() {
  const u = ctx.usuario;
  const puedeVer = (p) => (Array.isArray(p) ? p.some(ctx.puede) : ctx.puede(p));
  montar(app, html`<div class="marco">
    <aside class="lateral" aria-label="Menú principal">
      <a class="marca" href="#/"><img src="icon.svg" alt=""><div><strong>ALKI</strong><span>Gestión interna</span></div></a>
      <nav class="menu">${MENU.filter((m) => puedeVer(m[3])).map(([r, t, i]) => html`<a href="#/${r}" data-ruta="${r}">${icono(i)}${t}</a>`)}</nav>
      <div class="usuario-lateral"><b>${u.nombre}</b>${u.rolNombre} · ${u.email}
        <div class="acciones"><a href="#/cuenta">Mi cuenta</a><button type="button" id="salir">Cerrar sesión</button></div></div>
    </aside>
    <div class="principal">
      <div class="barra-movil"><button type="button" id="abrir-menu" aria-label="Abrir menú">${icono('menu')}</button><a class="marca" href="#/"><img src="icon.svg" alt=""><strong>ALKI</strong></a><span></span></div>
      <main class="contenido" id="contenido" tabindex="-1"></main>
    </div>
  </div>`);
  $('#salir').onclick = () => salir();
  actualizarInsignia();
  $('#abrir-menu').onclick = () => $('.marco').classList.toggle('menu-abierto');
  $('.lateral').addEventListener('click', (e) => { if (e.target.closest('a')) $('.marco').classList.remove('menu-abierto'); });
}

let navegando = 0;
async function navegar() {
  const { ruta, query } = leerHash();
  // Rutas públicas (sin sesión)
  if (ruta === 'nueva-clave') return acceso.nuevaClave(app, query);
  if (ruta === 'recuperar') return acceso.recuperar(app);
  if (!ctx.usuario) return iniciar();

  // Sin acceso al panel: se abre la primera pestaña que sí pueda ver
  if (ruta === '' && !ctx.puede('panel.ver')) {
    const primera = MENU.find((m) => (Array.isArray(m[3]) ? m[3].some(ctx.puede) : ctx.puede(m[3])));
    if (primera && primera[0]) { location.hash = '#/' + primera[0]; return; }
  }
  if (!$('#contenido')) pintarMarco();
  const raiz = ruta.split('/')[0];
  for (const a of document.querySelectorAll('.menu a')) {
    if (a.dataset.ruta === raiz) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  }

  const destino = RUTAS.find(([re]) => re.test(ruta));
  const cont = $('#contenido');
  const n = ++navegando;
  if (!destino) return montar(cont, html`<div class="vacio"><h1>Página no encontrada</h1><p><a href="#/">Volver al panel</a></p></div>`);
  // Pestaña bloqueada: aunque se escriba la dirección a mano, no se carga nada
  const necesario = PERMISO_RUTA[raiz];
  if (necesario && !(Array.isArray(necesario) ? necesario.some(ctx.puede) : ctx.puede(necesario))) {
    return montar(cont, html`<div class="tarjeta bloqueado"><h1>Sin acceso</h1><p>No tienes permiso para ver este apartado. Si lo necesitas, pídeselo al administrador de la plataforma.</p><p><a class="boton" href="#/">Volver al inicio</a></p></div>`);
  }
  montar(cont, html`<div class="cargando">Cargando…</div>`);
  try {
    const params = ruta.match(destino[0]).slice(1);
    const nodo = document.createElement('div');
    await destino[1](nodo, { params, query, ctx, recargar: navegar });
    if (n !== navegando) return; // el usuario ya ha cambiado de página
    // Antetítulo de la marca (mayúsculas con punto celeste) encima del título de la pantalla
    const h1 = nodo.querySelector('.cabecera h1');
    const apartado = MENU.find((m) => m[0] === raiz);
    if (h1 && !nodo.querySelector('.antetitulo')) {
      const ante = document.createElement('p');
      ante.className = 'antetitulo';
      ante.textContent = 'ALKI Gestión · ' + (apartado ? apartado[1] : 'Mi cuenta');
      h1.before(ante);
    }
    cont.replaceChildren(nodo);
    if (raiz === 'incidencias' || raiz === '') actualizarInsignia();
    window.scrollTo(0, 0);
    cont.focus({ preventScroll: true });
  } catch (e) {
    if (n === navegando && ctx.usuario) montar(cont, html`<div class="tarjeta"><h2>No se ha podido cargar</h2><p class="suave">${e.message}</p><button class="boton" id="reintentar">Reintentar</button></div>`);
    $('#reintentar')?.addEventListener('click', navegar);
  }
}

// Número de incidencias abiertas asignadas a mí, junto a «Incidencias» en el menú
async function actualizarInsignia() {
  if (!ctx.puede('incidencias.ver')) return;
  try {
    const { abiertas } = await get('/api/incidencias/mias/contador');
    const a = document.querySelector('.menu a[data-ruta="incidencias"]');
    if (!a) return;
    a.querySelector('.insignia')?.remove();
    if (abiertas) { const b = document.createElement('span'); b.className = 'insignia'; b.textContent = abiertas; b.title = abiertas + ' asignadas a ti'; a.append(b); }
  } catch { /* sin conexión: se reintenta luego */ }
}
setInterval(() => { if (ctx.usuario) actualizarInsignia(); }, 120000);

async function iniciar() {
  let yo = null;
  try { yo = await get('/api/auth/yo'); } catch { /* sin sesión */ }
  if (!yo || yo.fase !== 'completa') {
    ctx.usuario = null;
    return acceso.entrar(app, yo, async () => { await iniciar(); });
  }
  ctx.usuario = yo.usuario; ctx.permisos = yo.permisos; sesion.permisos = yo.permisos;
  configurar({ csrf: yo.csrf });
  vigilarInactividad(yo.inactividadMin);
  pintarMarco();
  navegar();
}

async function salir(motivo) {
  try { await post('/api/auth/salir'); } catch { /* ya cerrada */ }
  ctx.usuario = null;
  detenerVigilancia();
  if (motivo) sessionStorage.setItem('alki_motivo', motivo);
  location.hash = '#/';
  location.reload();
}

// ---------- Cierre automático por inactividad ----------
let ultimaActividad = Date.now(), ultimoAviso = 0, temporizador = null, ultimoPing = Date.now();
function vigilarInactividad(minutos) {
  detenerVigilancia();
  const limite = minutos * 60 * 1000;
  const marcar = () => { ultimaActividad = Date.now(); };
  for (const ev of ['pointerdown', 'keydown', 'scroll', 'touchstart']) addEventListener(ev, marcar, { passive: true });
  temporizador = setInterval(async () => {
    const inactivo = Date.now() - ultimaActividad;
    if (inactivo >= limite) return salir('Se ha cerrado la sesión por inactividad.');
    if (inactivo >= limite - 2 * 60 * 1000 && !ultimoAviso) {
      ultimoAviso = Date.now();
      aviso('Tu sesión se cerrará en 2 minutos por inactividad. Mueve el ratón o pulsa una tecla para seguir.');
    }
    if (inactivo < limite - 2 * 60 * 1000) ultimoAviso = 0;
    // Si el usuario está trabajando, se renueva la sesión en el servidor cada 5 minutos
    if (Date.now() - ultimoPing > 5 * 60 * 1000 && inactivo < 5 * 60 * 1000) {
      ultimoPing = Date.now();
      try { await post('/api/auth/activo'); } catch { /* si caducó, el 401 lleva al acceso */ }
    }
  }, 15 * 1000);
}
function detenerVigilancia() { if (temporizador) clearInterval(temporizador); temporizador = null; }

configurar({ alCaducar: (msg) => { if (ctx.usuario) { ctx.usuario = null; detenerVigilancia(); sessionStorage.setItem('alki_motivo', msg || 'Tu sesión ha caducado.'); location.reload(); } } });
activarGraficos();
addEventListener('hashchange', navegar);
const { ruta } = leerHash();
if (ruta === 'nueva-clave' || ruta === 'recuperar') navegar(); else iniciar();
