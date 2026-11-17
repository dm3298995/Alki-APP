/* ==========================================================================
   vistas/ingresos.js — REGISTRO E HISTORIAL DE INGRESOS
   · «Nuevo ingreso»: dinero que entra fuera de los recibos (penalizaciones,
     cargos por daños, reembolsos del seguro, estancias cortas…).
   · Historial filtrable por fechas, piso, persona y concepto. Si tienes acceso
     a Cobros, también incluye los cobros de recibos (todo lo que entra).
   ========================================================================== */
import { html, montar, $, euros, fecha, formulario, aviso, confirmar, hoy, icono } from '../ui.js';
import { get, post, put, del } from '../api.js';
import { activarFilas } from './panel.js';

const hace = (d) => new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);
const RANGOS = { mes: ['Este mes', () => [hoy().slice(0, 8) + '01', hoy()]], m3: ['Últimos 3 meses', () => [hace(90), hoy()]], anio: ['Este año', () => [hoy().slice(0, 4) + '-01-01', hoy()]], m12: ['12 meses', () => [hace(365), hoy()]] };
const filtros = { rango: 'm3', desde: hace(90), hasta: hoy(), inmueble: '', q: '', origen: 'todos' };

let catalogo = null;
const cat = async () => catalogo || (catalogo = await get('/api/catalogo'));

export async function formularioIngreso(ingreso, { tipos, metodos }, alGuardar) {
  const c = await cat();
  const inmSel = c.inmuebles.find((i) => i.id === ingreso?.inmueble_id);
  formulario({
    titulo: ingreso ? 'Editar ingreso' : 'Nuevo ingreso', descripcion: 'Se sumará a los ingresos y al beneficio del piso (o de la empresa si no eliges piso).',
    campos: [
      { nombre: 'fecha', etiqueta: 'Fecha del ingreso', tipo: 'date', req: true, valor: ingreso?.fecha || hoy() },
      { nombre: 'importe', etiqueta: 'Importe (€)', tipo: 'number', paso: '0.01', min: 0, req: true, valor: ingreso ? (ingreso.importe / 100).toFixed(2) : '' },
      { nombre: 'pagador', etiqueta: 'Quién paga (persona o entidad)', req: true, valor: ingreso?.pagador, ancho: true, placeholder: 'Ej.: Laura Gómez, Seguros Turia Hogar…' },
      { nombre: 'concepto', etiqueta: 'Concepto', req: true, valor: ingreso?.concepto, ancho: true, placeholder: 'Ej.: Penalización por salida anticipada de H3' },
      { nombre: 'tipo', etiqueta: 'Tipo de ingreso', tipo: 'select', vacio: false, valor: ingreso?.tipo || 'otros', opciones: Object.entries(tipos) },
      { nombre: 'metodo', etiqueta: 'Método de pago', tipo: 'select', req: true, valor: ingreso?.metodo || 'Transferencia', opciones: metodos.map((m) => [m, m]), vacio: false },
      { nombre: 'inmueble_id', etiqueta: 'Inmueble (si corresponde)', tipo: 'select', vacio: 'Ninguno (ingreso de la empresa)', valor: ingreso?.inmueble_id, opciones: c.inmuebles.map((i) => [i.id, i.codigo + ' · ' + i.nombre]) },
      { nombre: 'habitacion_id', etiqueta: 'Habitación (si corresponde)', tipo: 'select', vacio: 'Ninguna / todo el piso', valor: ingreso?.habitacion_id, opciones: (inmSel?.habitaciones || []).map((h) => [h.id, h.codigo]) },
      { nombre: 'observaciones', etiqueta: 'Observaciones', tipo: 'textarea', valor: ingreso?.observaciones }
    ],
    alCambiar: (e, form) => {
      if (e.target.name !== 'inmueble_id') return;
      const i = c.inmuebles.find((x) => String(x.id) === e.target.value);
      form.elements.habitacion_id.replaceChildren(new Option('Ninguna / todo el piso', ''), ...(i?.habitaciones || []).map((h) => new Option(h.codigo, h.id)));
    },
    enviar: async (x) => {
      const datos = { ...x, inmueble_id: x.inmueble_id ? Number(x.inmueble_id) : null, habitacion_id: x.habitacion_id ? Number(x.habitacion_id) : null };
      if (ingreso) await put('/api/ingresos/' + ingreso.id, datos); else await post('/api/ingresos', datos);
      aviso(ingreso ? 'Ingreso actualizado' : 'Ingreso registrado'); alGuardar?.();
    }
  });
}

export async function vistaIngresos(el, { ctx }) {
  const editar = ctx.puede('ingresos.editar');
  const c = await cat();
  let d;
  montar(el, html`
    <div class="cabecera"><div><h1>Ingresos</h1><p>Todo lo que entra en ALKI: ingresos registrados a mano${ctx.puede('pagos.ver') ? ' y cobros de recibos' : ''}</p></div>
      <div class="acciones">${editar ? html`<button class="boton primario" id="nuevo">${icono('mas')}Nuevo ingreso</button>` : ''}</div></div>
    <div class="filtros">
      <div class="segmentos" role="group" aria-label="Fechas">${Object.entries(RANGOS).map(([k, [t]]) => html`<button type="button" data-r="${k}" aria-pressed="${filtros.rango === k}">${t}</button>`)}</div>
      <label>Desde <input type="date" id="f-desde" value="${filtros.desde}"></label><label>Hasta <input type="date" id="f-hasta" value="${filtros.hasta}"></label>
      <select id="f-inm" aria-label="Inmueble"><option value="">Todos los pisos</option>${c.inmuebles.map((i) => html`<option value="${i.id}"${String(i.id) === filtros.inmueble ? html` selected` : ''}>${i.codigo}</option>`)}</select>
      <input type="search" id="f-q" value="${filtros.q}" placeholder="Persona o concepto…">
      ${ctx.puede('pagos.ver') ? html`<div class="segmentos" role="group" aria-label="Origen">${[['todos', 'Todo'], ['manual', 'Registrados a mano'], ['recibos', 'Cobros de recibos']].map(([k, t]) => html`<button type="button" data-o="${k}" aria-pressed="${filtros.origen === k}">${t}</button>`)}</div>` : ''}
    </div>
    <div id="cuerpo"></div>`);

  const pintar = async () => {
    const q = new URLSearchParams({ desde: filtros.desde, hasta: filtros.hasta, origen: filtros.origen });
    if (filtros.inmueble) q.set('inmueble', filtros.inmueble);
    if (filtros.q) q.set('q', filtros.q);
    d = await get('/api/ingresos?' + q);
    montar($('#cuerpo', el), html`
      <div class="cifras">
        <div class="cifra"><span class="etq">Total ingresado</span><span class="valor">${euros(d.total)}</span><span class="sub">${fecha(d.desde)} – ${fecha(d.hasta)} · ${d.totalFilas} movimientos</span></div>
        <div class="cifra"><span class="etq">Registrados a mano</span><span class="valor">${euros(d.manual)}</span><span class="sub">penalizaciones, cargos, reembolsos…</span></div>
        ${d.verCobros ? html`<div class="cifra"><span class="etq">Cobros de recibos</span><span class="valor">${euros(d.recibos)}</span><span class="sub">renta y servicios</span></div>` : ''}
        ${d.porTipo.filter((t) => !['Renta', 'Servicios'].includes(t.tipo)).slice(0, 2).map((t) => html`<div class="cifra"><span class="etq">${t.tipo}</span><span class="valor">${euros(t.importe)}</span></div>`)}
      </div>
      <section class="tarjeta mt"><header><div><h2>Historial de ingresos</h2><p>${d.totalFilas > d.ingresos.length ? 'Se muestran los ' + d.ingresos.length + ' más recientes de ' + d.totalFilas : d.totalFilas + ' movimientos'}</p></div></header>
        <div class="tabla-env"><table>
          <thead><tr><th>Fecha</th><th>Quién paga</th><th>Concepto</th><th>Piso · hab.</th><th>Método</th><th class="der">Importe</th>${editar ? html`<th></th>` : ''}</tr></thead>
          <tbody>${d.ingresos.map((x) => html`<tr ${x.inmueble_id ? html`class="clic" data-ir="#/inmuebles/${x.inmueble_id}"` : ''}>
            <td class="num">${fecha(x.fecha)}</td><td><b>${x.pagador}</b>${x.contrato ? html`<span class="sec">${x.contrato}</span>` : ''}</td>
            <td>${x.concepto}<span class="sec">${x.origen === 'manual' ? html`<span class="chip info">${x.tipoNombre}</span>${x.observaciones ? ' ' + x.observaciones : ''}${x.registrado_por ? ' · registrado por ' + x.registrado_por : ''}` : html`<span class="chip">Cobro de recibo</span>`}</span></td>
            <td>${x.inmueble || html`<span class="suave">Empresa</span>`}${x.habitacion ? ' · ' + x.habitacion : ''}</td><td>${x.metodo || '—'}</td>
            <td class="der num"><b>${euros(x.importe, true)}</b></td>
            ${editar ? html`<td class="der">${x.origen === 'manual' ? html`<button class="enlace pequeno" data-editar="${x.id}">Editar</button> <button class="enlace pequeno peligro" data-borrar="${x.id}">Borrar</button>` : ''}</td>` : ''}</tr>`)}</tbody>
          <tfoot><tr><td colspan="5">Total del periodo</td><td class="der num">${euros(d.total, true)}</td>${editar ? html`<td></td>` : ''}</tr></tfoot>
        </table></div>${d.ingresos.length ? '' : html`<p class="vacio">No hay ingresos con estos filtros.</p>`}
      </section>`);
  };
  await pintar();
  activarFilas(el);

  el.addEventListener('click', async (e) => {
    const r = e.target.closest('[data-r]');
    if (r) { filtros.rango = r.dataset.r; [filtros.desde, filtros.hasta] = RANGOS[r.dataset.r][1](); $('#f-desde', el).value = filtros.desde; $('#f-hasta', el).value = filtros.hasta; el.querySelectorAll('[data-r]').forEach((b) => b.setAttribute('aria-pressed', String(b === r))); return pintar(); }
    const o = e.target.closest('[data-o]');
    if (o) { filtros.origen = o.dataset.o; el.querySelectorAll('[data-o]').forEach((b) => b.setAttribute('aria-pressed', String(b === o))); return pintar(); }
    const ed = e.target.closest('[data-editar]');
    if (ed) return formularioIngreso(d.ingresos.find((x) => x.origen === 'manual' && String(x.id) === ed.dataset.editar), d, pintar);
    const b = e.target.closest('[data-borrar]');
    if (b && (await confirmar('¿Borrar este ingreso? Dejará de contar en los ingresos y beneficios. Queda registrado en la auditoría.', 'Borrar'))) { await del('/api/ingresos/' + b.dataset.borrar); aviso('Ingreso borrado'); pintar(); }
  });
  const cambiarFecha = () => { filtros.rango = ''; filtros.desde = $('#f-desde', el).value || filtros.desde; filtros.hasta = $('#f-hasta', el).value || filtros.hasta; el.querySelectorAll('[data-r]').forEach((x) => x.setAttribute('aria-pressed', 'false')); pintar(); };
  $('#f-desde', el).onchange = cambiarFecha; $('#f-hasta', el).onchange = cambiarFecha;
  $('#f-inm', el).onchange = (e) => { filtros.inmueble = e.target.value; pintar(); };
  let t; $('#f-q', el).oninput = (e) => { clearTimeout(t); t = setTimeout(() => { filtros.q = e.target.value.trim(); pintar(); }, 300); };
  $('#nuevo', el)?.addEventListener('click', () => formularioIngreso(null, d, pintar));
}
