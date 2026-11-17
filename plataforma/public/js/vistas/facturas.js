/* ==========================================================================
   vistas/facturas.js — FACTURAS DE GASTOS Y MANTENIMIENTOS
   Todas las facturas adjuntadas en la plataforma, en un solo sitio, con
   filtro por piso y fechas. Solo para quien tiene el permiso «Facturas».
   ========================================================================== */
import { html, montar, $, euros, fecha, CATEGORIAS } from '../ui.js';
import { get } from '../api.js';

const hace = (d) => new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);
const filtros = { desde: hace(365), hasta: new Date().toISOString().slice(0, 10), inmueble: '' };

export async function vistaFacturas(el) {
  const c = await get('/api/catalogo');
  montar(el, html`<div class="cabecera"><div><h1>Facturas</h1><p>Facturas adjuntas a gastos y mantenimientos</p></div></div>
    <div class="filtros"><label>Desde <input type="date" id="f-desde" value="${filtros.desde}"></label><label>Hasta <input type="date" id="f-hasta" value="${filtros.hasta}"></label>
      <select id="f-inm" aria-label="Inmueble"><option value="">Todos los pisos</option>${c.inmuebles.map((i) => html`<option value="${i.id}"${String(i.id) === filtros.inmueble ? html` selected` : ''}>${i.codigo}</option>`)}</select>
      <input type="search" id="f-q" placeholder="Proveedor o concepto…"></div>
    <div id="cuerpo"></div>`);
  const pintar = async () => {
    const q = new URLSearchParams({ desde: filtros.desde, hasta: filtros.hasta }); if (filtros.inmueble) q.set('inmueble', filtros.inmueble);
    const d = await get('/api/facturas?' + q);
    montar($('#cuerpo', el), html`<div class="cifras"><div class="cifra"><span class="etq">Facturas</span><span class="valor">${d.n}</span><span class="sub">${fecha(filtros.desde)} – ${fecha(filtros.hasta)}</span></div>
      <div class="cifra"><span class="etq">Importe facturado</span><span class="valor">${euros(d.total)}</span><span class="sub">IVA incluido</span></div></div>
      <section class="tarjeta mt"><div class="tabla-env"><table><thead><tr><th>Fecha</th><th>Piso</th><th>Proveedor</th><th>Concepto</th><th>Tipo</th><th class="der">Importe</th><th></th></tr></thead>
        <tbody id="filas">${d.facturas.map((f) => html`<tr data-texto="${[f.proveedor, f.concepto, f.nombre, f.inmueble].join(' ').toLowerCase()}"><td class="num">${fecha(f.fecha)}</td><td><b>${f.inmueble || '—'}</b></td><td>${f.proveedor || '—'}</td>
          <td>${f.concepto || '—'}<span class="sec">${f.nombre}</span></td><td>${CATEGORIAS[f.categoria] || f.categoria || '—'}</td><td class="der num">${f.importe != null ? euros(f.importe, true) : '—'}</td>
          <td class="der"><a class="boton mini" href="/api/documentos/${f.id}">Descargar</a></td></tr>`)}</tbody></table></div>
        ${d.facturas.length ? '' : html`<p class="vacio">No hay facturas en este periodo.</p>`}</section>`);
    $('#f-q', el).oninput = (e) => { const t = e.target.value.trim().toLowerCase(); for (const tr of el.querySelectorAll('#filas tr')) tr.classList.toggle('oculto', !!t && !tr.dataset.texto.includes(t)); };
  };
  $('#f-desde', el).onchange = (e) => { filtros.desde = e.target.value || filtros.desde; pintar(); };
  $('#f-hasta', el).onchange = (e) => { filtros.hasta = e.target.value || filtros.hasta; pintar(); };
  $('#f-inm', el).onchange = (e) => { filtros.inmueble = e.target.value; pintar(); };
  await pintar();
}
