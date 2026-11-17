/* ==========================================================================
   ui.js — PIEZAS DE INTERFAZ REUTILIZABLES
   · html`...`: plantillas que ESCAPAN automáticamente todo dato insertado
     (protección contra XSS). Solo lo marcado con crudo() se inserta tal cual.
   · Formatos (euros, fechas), chips de estado, diálogos con formulario,
     avisos flotantes y selector de periodo.
   ========================================================================== */

class Crudo { constructor(s) { this.s = s; } toString() { return this.s; } }
export const crudo = (s) => new Crudo(String(s));

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };
export const esc = (s) => String(s).replace(/[&<>"'`]/g, (c) => ESC[c]);

function pintar(v) {
  if (v instanceof Crudo) return v.s;
  if (Array.isArray(v)) return v.map(pintar).join('');
  if (v === null || v === undefined || v === false) return '';
  return esc(v);
}
export function html(partes, ...valores) {
  let s = partes[0];
  valores.forEach((v, i) => { s += pintar(v) + partes[i + 1]; });
  return new Crudo(s);
}

// Inserta HTML y aplica anchos de barras (data-ancho) sin usar estilos en línea (CSP)
export function montar(el, contenido) {
  el.innerHTML = pintar(contenido);
  aplicarAnchos(el);
  return el;
}
export function aplicarAnchos(el) {
  for (const n of el.querySelectorAll('[data-ancho]')) n.style.width = Math.max(0, Math.min(100, Number(n.dataset.ancho))) + '%';
  for (const n of el.querySelectorAll('[data-flex]')) n.style.flex = n.dataset.flex + ' 1 0';
}
export const $ = (sel, raiz = document) => raiz.querySelector(sel);
export const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

// ---------- Formatos ----------
const fmtEuros = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const fmtEuros2 = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
export const euros = (cent, decimales = false) => (cent == null ? '—' : (decimales ? fmtEuros2 : fmtEuros).format(cent / 100));
export const eurosCompacto = (cent) => {
  const e = cent / 100;
  return Math.abs(e) >= 1000 ? (Math.round(e / 100) / 10).toLocaleString('es-ES') + ' k€' : Math.round(e).toLocaleString('es-ES') + ' €';
};
export const fecha = (iso) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—');
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MESES_L = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const mesCorto = (p) => MESES[Number(p.slice(5, 7)) - 1] + (p.slice(5, 7) === '01' ? ' ' + p.slice(2, 4) : '');
export const mesLargo = (p) => MESES_L[Number(p.slice(5, 7)) - 1] + ' ' + p.slice(0, 4);
export const fechaHora = (s) => (s ? new Date(s.replace(' ', 'T') + 'Z').toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }) : '—');
export const hoy = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
export const periodoHoy = () => hoy().slice(0, 7);
export function sumarMes(p, n) { const [a, m] = p.split('-').map(Number); return new Date(Date.UTC(a, m - 1 + n, 1)).toISOString().slice(0, 7); }
export const pct = (n) => (Math.round(n * 10) / 10).toLocaleString('es-ES') + ' %';

// ---------- Estados ----------
export const ESTADOS_HAB = {
  ocupada: ['Ocupada', 'info'], por_liberar: ['Se libera pronto', 'serio'], reservada: ['Reservada', 'neutro'],
  disponible: ['Disponible', 'ok'], mantenimiento: ['En mantenimiento', 'aviso'], no_disponible: ['No disponible', 'neutro']
};
export const chipHab = (e) => html`<span class="chip ${ESTADOS_HAB[e]?.[1] || ''}">${ESTADOS_HAB[e]?.[0] || e}</span>`;
const ESTADOS_PAGO = { pagado: ['Cobrado', 'ok'], pendiente: ['Pendiente', 'aviso'], parcial: ['Pago parcial', 'serio'], vencido: ['Atrasado', 'critico'] };
export const chipPago = (e) => html`<span class="chip ${ESTADOS_PAGO[e][1]}">${ESTADOS_PAGO[e][0]}</span>`;
// Estado de pagos de un contrato (el peor de sus recibos abiertos)
const PAGOS_CONTRATO = { al_dia: ['Al día', 'ok'], pendiente: ['Mes en curso', 'neutro'], parcial: ['Pago parcial', 'serio'], atrasado: ['Atrasado', 'critico'] };
export const chipPagos = (e) => (e ? html`<span class="chip ${PAGOS_CONTRATO[e][1]}">${PAGOS_CONTRATO[e][0]}</span>` : '');
const RENOVACION = { solicitada: ['Quiere renovar', 'info'], en_negociacion: ['Renovación en negociación', 'info'], no_renueva: ['No renueva', 'serio'] };
export const chipRenovacion = (e) => (e ? html`<span class="chip ${RENOVACION[e][1]}">${RENOVACION[e][0]}</span>` : '');
export const TIPOS_HAB = { estandar: 'Estándar', grande: 'Grande', doble: 'Doble (pareja)', suite: 'Suite con baño' };
const ESTADOS_MANT = { pendiente: ['Pendiente', 'aviso'], en_curso: ['En curso', 'info'], terminado: ['Terminado', 'ok'], cancelado: ['Cancelado', 'neutro'] };
export const chipMant = (e) => html`<span class="chip ${ESTADOS_MANT[e][1]}">${ESTADOS_MANT[e][0]}</span>`;
const ESTADOS_CONTRATO = { activo: ['En vigor', 'info'], reservado: ['Reservado', 'neutro'], finalizado: ['Finalizado', 'neutro'], rescindido: ['Rescindido', 'serio'] };
export const chipContrato = (e) => html`<span class="chip ${ESTADOS_CONTRATO[e]?.[1]}">${ESTADOS_CONTRATO[e]?.[0] || e}</span>`;

// Días restantes con color según urgencia (siempre con texto)
export function chipDias(d) {
  if (d == null) return html`<span class="suave">Sin fecha</span>`;
  if (d < 0) return html`<span class="chip critico">Vencido hace ${-d} d</span>`;
  const nivel = d <= 15 ? 'critico' : d <= 30 ? 'serio' : d <= 60 ? 'aviso' : 'neutro';
  return html`<span class="chip ${nivel}">${d === 0 ? 'Hoy' : d === 1 ? 'Mañana' : d + ' días'}</span>`;
}

// ---------- Iconos (trazos simples) ----------
const ICONOS = {
  panel: '<path d="M3 13h8V3H3zM13 21h8v-8h-8zM13 3v6h8V3zM3 21h8v-4H3z"/>',
  inmuebles: '<path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6M9 10h.01M15 10h.01"/>',
  habitaciones: '<path d="M3 20V8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v12M3 14h18M7 10h4"/>',
  incidencias: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  rentabilidad: '<path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/>',
  contratos: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
  ingresos: '<path d="M12 19V5M5 12l7-7 7 7"/><path d="M4 21h16"/>',
  facturas: '<path d="M6 2h12v20l-3-2-3 2-3-2-3 2z"/><path d="M9 7h6M9 11h6M9 15h4"/>',
  pagos: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>',
  gastos: '<path d="M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  mantenimientos: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/>',
  estadisticas: '<path d="M3 3v18h18M7 15l4-4 3 3 5-6"/>',
  admin: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  alerta: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  mas: '<path d="M12 5v14M5 12h14"/>',
  menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
  flecha: '<path d="M9 18l6-6-6-6"/>',
  descarga: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>'
};
export const icono = (n) => crudo('<svg viewBox="0 0 24 24" aria-hidden="true">' + ICONOS[n] + '</svg>');

// ---------- Avisos flotantes ----------
export function aviso(texto, tipo = '') {
  const t = document.createElement('div');
  t.className = 'toast ' + tipo; t.textContent = texto; t.setAttribute('role', tipo === 'error' ? 'alert' : 'status');
  $('#avisos').append(t);
  setTimeout(() => t.remove(), tipo === 'error' ? 6000 : 3500);
}

/* ---------- Diálogo con formulario ----------
   campos: [{ nombre, etiqueta, tipo: text|email|number|date|month|select|textarea|checkbox|file|password, opciones: [[valor, texto]], valor, req, ayuda, ancho }]
   enviar(datos, form) → si lanza error, se muestra en el diálogo */
export function formulario({ titulo, descripcion, campos, boton = 'Guardar', enviar, alCambiar }) {
  const d = document.createElement('dialog');
  const campoHTML = (c) => {
    const id = 'f-' + c.nombre;
    const req = c.req ? crudo(' required') : '';
    let control;
    if (c.tipo === 'select') control = html`<select id="${id}" name="${c.nombre}"${req}>${c.vacio !== false ? html`<option value="">${c.vacio || '—'}</option>` : ''}${(c.opciones || []).map(([v, t]) => html`<option value="${v}"${String(v) === String(c.valor ?? '') ? crudo(' selected') : ''}>${t}</option>`)}</select>`;
    else if (c.tipo === 'textarea') control = html`<textarea id="${id}" name="${c.nombre}"${req} maxlength="${c.max || 1000}">${c.valor ?? ''}</textarea>`;
    else if (c.tipo === 'checkbox') return html`<label class="casilla ${c.ancho ? 'ancho' : ''}"><input type="checkbox" name="${c.nombre}"${c.valor ? crudo(' checked') : ''}> ${c.etiqueta}</label>`;
    else if (c.tipo === 'file') control = html`<input id="${id}" type="file" name="${c.nombre}" accept="${c.accept || '.pdf,.jpg,.jpeg,.png,.webp'}">`;
    else control = html`<input id="${id}" type="${c.tipo || 'text'}" name="${c.nombre}" value="${c.valor ?? ''}"${req}${c.paso ? html` step="${c.paso}"` : ''}${c.min !== undefined ? html` min="${c.min}"` : ''}${c.placeholder ? html` placeholder="${c.placeholder}"` : ''} autocomplete="${c.autocompletar || 'off'}">`;
    return html`<label class="campo ${c.ancho || c.tipo === 'textarea' ? 'ancho' : ''}" for="${id}"><span>${c.etiqueta}${c.req ? ' *' : ''}</span>${control}${c.ayuda ? html`<small>${c.ayuda}</small>` : ''}</label>`;
  };
  montar(d, html`<form method="dialog" novalidate>
    <header><h2>${titulo}</h2><button type="button" class="cerrar" aria-label="Cerrar">×</button></header>
    <div class="d-cuerpo">${descripcion ? html`<p class="suave">${descripcion}</p>` : ''}<div class="error-form oculto" role="alert"></div><div class="form">${campos.map(campoHTML)}</div></div>
    <footer><button type="button" class="boton" data-cancelar>Cancelar</button><button type="submit" class="boton primario">${boton}</button></footer>
  </form>`);
  document.body.append(d);
  const form = $('form', d), err = $('.error-form', d);
  const cerrar = () => { d.close(); d.remove(); };
  $('.cerrar', d).onclick = cerrar; $('[data-cancelar]', d).onclick = cerrar;
  d.addEventListener('cancel', (e) => { e.preventDefault(); cerrar(); });
  if (alCambiar) form.addEventListener('change', (e) => alCambiar(e, form));
  form.onsubmit = async (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    const datos = {};
    for (const c of campos) {
      const el = form.elements[c.nombre];
      if (!el) continue;
      if (c.tipo === 'checkbox') datos[c.nombre] = el.checked;
      else if (c.tipo === 'file') datos[c.nombre] = el.files[0] || null;
      else datos[c.nombre] = el.value.trim() === '' ? null : el.value.trim();
    }
    const btn = $('[type=submit]', d); btn.disabled = true; err.classList.add('oculto');
    try { await enviar(datos, form); cerrar(); }
    catch (ex) { err.textContent = ex.message; err.classList.remove('oculto'); btn.disabled = false; }
  };
  d.showModal();
  $('input, select, textarea', d)?.focus();
  return d;
}

export function confirmar(texto, boton = 'Confirmar') {
  return new Promise((ok) => {
    formulario({ titulo: 'Confirmar', descripcion: texto, campos: [], boton, enviar: async () => ok(true) })
      .addEventListener('close', () => ok(false));
  });
}

/* ---------- Selector de periodo ----------
   Devuelve { desde, hasta } en meses (AAAA-MM). Opciones del enunciado:
   este mes, últimos 3, últimos 6, este año y personalizado. */
export const PERIODOS = {
  mes: ['Este mes', () => [periodoHoy(), periodoHoy()]],
  m3: ['Últimos 3 meses', () => [sumarMes(periodoHoy(), -2), periodoHoy()]],
  m6: ['Últimos 6 meses', () => [sumarMes(periodoHoy(), -5), periodoHoy()]],
  anio: ['Este año', () => [periodoHoy().slice(0, 4) + '-01', periodoHoy()]],
  m12: ['12 meses', () => [sumarMes(periodoHoy(), -11), periodoHoy()]]
};
export function selectorPeriodo(estado, alCambiar) {
  const wrap = document.createElement('div');
  wrap.className = 'filtros';
  const pintarSel = () => montar(wrap, html`<div class="segmentos" role="group" aria-label="Periodo">${Object.entries(PERIODOS).map(([k, [t]]) => html`<button type="button" data-p="${k}" aria-pressed="${estado.clave === k}">${t}</button>`)}<button type="button" data-p="custom" aria-pressed="${estado.clave === 'custom'}">Personalizado</button></div>
    <span class="${estado.clave === 'custom' ? '' : 'oculto'}"><label>Desde <input type="month" data-desde value="${estado.desde}" max="${periodoHoy()}"></label> <label>Hasta <input type="month" data-hasta value="${estado.hasta}"></label></span>`);
  pintarSel();
  wrap.addEventListener('click', (e) => {
    const b = e.target.closest('[data-p]'); if (!b) return;
    estado.clave = b.dataset.p;
    if (PERIODOS[estado.clave]) [estado.desde, estado.hasta] = PERIODOS[estado.clave][1]();
    pintarSel(); alCambiar(estado);
  });
  wrap.addEventListener('change', (e) => {
    if (e.target.matches('[data-desde]')) estado.desde = e.target.value || estado.desde;
    if (e.target.matches('[data-hasta]')) estado.hasta = e.target.value || estado.hasta;
    if (estado.desde > estado.hasta) [estado.desde, estado.hasta] = [estado.hasta, estado.desde];
    alCambiar(estado);
  });
  return wrap;
}
export const nuevoPeriodo = (clave = 'm6') => { const [desde, hasta] = PERIODOS[clave][1](); return { clave, desde, hasta }; };
export const textoPeriodo = (e) => (e.desde === e.hasta ? mesLargo(e.desde) : mesLargo(e.desde) + ' – ' + mesLargo(e.hasta));

// Pestañas simples (con contador opcional)
export const pestanas = (lista, activa) => html`<nav class="pestanas" aria-label="Filtro">${lista.map(([k, t, n, href]) => html`<a href="${href}" aria-current="${k === activa}">${t}${n !== undefined && n !== null ? html`<span class="cuenta">${n}</span>` : ''}</a>`)}</nav>`;

export const CATEGORIAS = { alquiler: 'Alquiler del inmueble', electricidad: 'Electricidad', agua: 'Agua', gas: 'Gas', internet: 'Internet / WiFi', limpieza: 'Limpieza', mantenimiento: 'Mantenimiento', reparaciones: 'Reparaciones', impuestos: 'Impuestos y tasas', seguros: 'Seguros', comisiones: 'Comisiones y captación', otros: 'Otros gastos' };
