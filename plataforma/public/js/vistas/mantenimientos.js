/* ==========================================================================
   vistas/mantenimientos.js — MANTENIMIENTOS Y REPARACIONES
   Cada trabajo: inmueble, habitación o zona común, descripción, categoría,
   fecha, coste, proveedor, estado y facturas adjuntas. El coste se suma solo
   a los gastos del inmueble.
   ========================================================================== */
import { html, montar, $, euros, fecha, chipMant, pestanas, formulario, aviso, hoy, icono } from '../ui.js';
import { get, post, put, subir } from '../api.js';
import { barrasH } from '../graficos.js';
import { puede } from '../sesion.js';

async function datos() {
  const catalogo = await get('/api/catalogo'); // siempre al día (inmuebles nuevos)
  return { catalogo, tipos: catalogo.tipos };
}
const ESTADOS = [['pendiente', 'Pendiente'], ['en_curso', 'En curso'], ['terminado', 'Terminado'], ['cancelado', 'Cancelado']];
const ZONAS = ['Cocina', 'Baño', 'Salón', 'Entrada', 'Terraza', 'Fachada / comunidad', 'Otra'];

function camposMant(c, t, m = {}, verCoste = true) {
  const inm = c.inmuebles.find((i) => i.id === Number(m.inmueble_id));
  return [
    { nombre: 'inmueble_id', etiqueta: 'Inmueble', tipo: 'select', req: true, valor: m.inmueble_id, opciones: c.inmuebles.map((i) => [i.id, i.codigo + ' · ' + i.nombre]) },
    { nombre: 'habitacion_id', etiqueta: 'Habitación', tipo: 'select', vacio: 'Zona común / todo el piso', valor: m.habitacion_id, opciones: (inm?.habitaciones || []).map((h) => [h.id, h.codigo]) },
    { nombre: 'zona', etiqueta: 'Zona común (si aplica)', tipo: 'select', vacio: '—', valor: m.zona, opciones: ZONAS.map((z) => [z, z]) },
    { nombre: 'tipo', etiqueta: 'Tipo de trabajo', tipo: 'select', req: true, valor: m.tipo, opciones: Object.entries(t) },
    { nombre: 'categoria', etiqueta: 'Categoría de gasto', tipo: 'select', vacio: false, valor: m.categoria || 'reparaciones', opciones: [['reparaciones', 'Reparación (algo roto)'], ['mantenimiento', 'Mantenimiento (preventivo / periódico)']] },
    { nombre: 'estado', etiqueta: 'Estado', tipo: 'select', vacio: false, valor: m.estado || 'pendiente', opciones: ESTADOS },
    { nombre: 'descripcion', etiqueta: 'Descripción del trabajo', tipo: 'textarea', req: true, valor: m.descripcion },
    { nombre: 'fecha', etiqueta: 'Fecha', tipo: 'date', req: true, valor: m.fecha || hoy() },
    ...(verCoste ? [{ nombre: 'coste', etiqueta: 'Coste (€)', tipo: 'number', paso: '0.01', min: 0, valor: m.coste != null ? m.coste / 100 : '' }] : []),
    { nombre: 'proveedor', etiqueta: 'Proveedor o responsable', valor: m.proveedor },
    ...(puede('facturas.ver') ? [{ nombre: 'factura', etiqueta: 'Adjuntar factura o foto (PDF, JPG, PNG)', tipo: 'file', ancho: true }] : [])
  ];
}

// Cambiar de inmueble recarga la lista de habitaciones del formulario
function alCambiarInmueble(c) {
  return (e, form) => {
    if (e.target.name !== 'inmueble_id') return;
    const inm = c.inmuebles.find((i) => String(i.id) === e.target.value);
    const sel = form.elements.habitacion_id;
    sel.replaceChildren(new Option('Zona común / todo el piso', ''), ...(inm?.habitaciones || []).map((h) => new Option(h.codigo, h.id)));
  };
}

async function guardar(id, d) {
  const { factura, ...x } = d;
  const r = id ? (await put('/api/mantenimientos/' + id, x), { id }) : await post('/api/mantenimientos', x);
  if (factura) await subir('/api/documentos?entidad=mantenimiento&id=' + r.id + '&nombre=' + encodeURIComponent(factura.name), factura);
}

export async function nuevoMantenimiento({ inmuebleId, habitacionId } = {}, alGuardar, verCoste = true) {
  const { catalogo: c, tipos: t } = await datos();
  formulario({ titulo: 'Registrar mantenimiento', campos: camposMant(c, t, { inmueble_id: inmuebleId, habitacion_id: habitacionId }, verCoste), alCambiar: alCambiarInmueble(c),
    enviar: async (d) => { await guardar(null, d); aviso('Mantenimiento registrado'); alGuardar?.(); } });
}

export async function vistaMantenimientos(el, { query, ctx, recargar }) {
  const estado = query.get('estado') === 'todos' ? 'todos' : query.get('estado') || 'abiertos';
  const inmueble = query.get('inmueble') || '';
  const q = new URLSearchParams(); if (estado !== 'todos') q.set('estado', estado); if (inmueble) q.set('inmueble', inmueble);
  const d = await get('/api/mantenimientos?' + q);
  const verFin = ctx.puede('gastos.ver'), editar = ctx.puede('mantenimientos.editar');
  const total = d.mantenimientos.reduce((s, m) => s + (m.coste || 0), 0);
  const u = (e) => '#/mantenimientos?estado=' + e + (inmueble ? '&inmueble=' + inmueble : '');
  const { catalogo: c } = await datos();

  montar(el, html`
    <div class="cabecera"><div><h1>Mantenimientos</h1><p>Reparaciones y mantenimientos de los pisos. Su coste se suma solo a los gastos.</p></div>
      <div class="acciones">${editar ? html`<button class="boton primario" id="nuevo">${icono('mas')}Registrar mantenimiento</button>` : ''}</div></div>
    ${pestanas([['abiertos', 'Abiertos', null, u('abiertos')], ['terminado', 'Terminados', null, u('terminado')], ['todos', 'Historial completo', null, u('todos')]], estado)}
    <div class="filtros"><label>Inmueble <select id="f-inm"><option value="">Todos</option>${c.inmuebles.map((i) => html`<option value="${i.id}"${String(i.id) === inmueble ? html` selected` : ''}>${i.codigo}</option>`)}</select></label></div>
    <div class="rejilla r-2-1">
      <section class="tarjeta"><header><div><h2>${d.mantenimientos.length} trabajos</h2>${verFin ? html`<p>Coste: ${euros(total)}</p>` : ''}</div></header>
        <div class="tabla-env"><table>
          <thead><tr><th>Fecha</th><th>Inmueble</th><th>Dónde</th><th>Trabajo</th><th>Proveedor</th><th>Estado</th>${verFin ? html`<th class="der">Coste</th>` : ''}</tr></thead>
          <tbody>${d.mantenimientos.map((m) => html`<tr class="${editar ? 'clic' : ''}" data-mant="${m.id}"><td class="num">${fecha(m.fecha)}</td><td><b>${m.inmueble}</b></td><td>${m.habitacion || m.zona || 'Zona común'}</td>
            <td>${m.descripcion}<span class="sec">${d.tipos[m.tipo] || m.tipo} · ${m.categoria === 'reparaciones' ? 'Reparación' : 'Mantenimiento'}${m.documentos ? ' · 📎 ' + m.documentos : ''}</span></td>
            <td>${m.proveedor || '—'}</td><td>${chipMant(m.estado)}</td>${verFin ? html`<td class="der num">${euros(m.coste)}</td>` : ''}</tr>`)}</tbody>
        </table></div>${d.mantenimientos.length ? '' : html`<p class="vacio">No hay mantenimientos con este filtro.</p>`}
      </section>
      <div class="pila">
        <section class="tarjeta"><header><div><h2>Pisos con más incidencias</h2><p>Últimos 12 meses</p></div></header>
          ${barrasH(d.ranking.map((r) => ({ etiqueta: r.codigo, valor: r.n, enlace: '#/inmuebles/' + r.id, detalle: verFin ? euros(r.coste) : '' })), (v) => v + (v === 1 ? ' trabajo' : ' trabajos'))}</section>
        ${d.rankingHab.length ? html`<section class="tarjeta"><header><div><h2>Habitaciones que se repiten</h2><p>Más de un trabajo en 12 meses</p></div></header>
          <table><tbody>${d.rankingHab.map((r) => html`<tr class="clic" data-ir="#/habitaciones/${r.id}"><td><b>${r.inmueble}</b> ${r.codigo}</td><td class="der num">${r.n} trabajos</td>${verFin ? html`<td class="der num">${euros(r.coste)}</td>` : ''}</tr>`)}</tbody></table></section>` : ''}
      </div>
    </div>`);

  $('#f-inm', el).onchange = (e) => { location.hash = '#/mantenimientos?estado=' + estado + (e.target.value ? '&inmueble=' + e.target.value : ''); };
  $('#nuevo', el)?.addEventListener('click', () => nuevoMantenimiento({ inmuebleId: inmueble }, recargar, verFin));
  el.addEventListener('click', async (e) => {
    const ir = e.target.closest('[data-ir]'); if (ir) { location.hash = ir.dataset.ir; return; }
    const f = e.target.closest('[data-mant]'); if (!f || !editar) return;
    const det = await get('/api/mantenimientos/' + f.dataset.mant);
    const m = det.mantenimiento;
    const dlg = formulario({ titulo: 'Mantenimiento · ' + m.inmueble, campos: camposMant(c, d.tipos, m, verFin), alCambiar: alCambiarInmueble(c),
      enviar: async (x) => { await guardar(m.id, x); aviso('Mantenimiento actualizado'); recargar(); } });
    if (det.documentos.length) {
      const lista = document.createElement('div');
      montar(lista, html`<div class="ancho"><span class="pequeno suave">Documentos adjuntos</span><ul>${det.documentos.map((doc) => html`<li><a href="/api/documentos/${doc.id}">${doc.nombre}</a> <span class="suave pequeno">(${Math.round(doc.bytes / 1024)} KB)</span></li>`)}</ul></div>`);
      $('.form', dlg).append(lista.firstElementChild);
    }
  });
}
