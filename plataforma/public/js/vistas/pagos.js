/* ==========================================================================
   vistas/pagos.js — PAGOS RECIBIDOS, PENDIENTES, PARCIALES Y ATRASADOS
   ========================================================================== */
import { html, montar, $, euros, fecha, chipPago, pestanas, formulario, aviso, mesLargo, hoy, periodoHoy, selectorPeriodo, nuevoPeriodo, textoPeriodo } from '../ui.js';
import { get, post, put } from '../api.js';

const estadoPeriodo = nuevoPeriodo('m3');

export async function vistaPagos(el, { query, ctx, recargar }) {
  const filtro = ['pagado', 'pendiente', 'parcial', 'vencido'].includes(query.get('estado')) ? query.get('estado') : '';
  const verInq = ctx.puede('inquilinos.ver'), editar = ctx.puede('pagos.editar');
  let lista = [];
  const seleccion = new Set();
  const METODOS = [['Transferencia', 'Transferencia'], ['Bizum', 'Bizum'], ['Domiciliación', 'Domiciliación'], ['Efectivo', 'Efectivo'], ['Otro', 'Otro']];

  const pintar = async () => {
    const q = new URLSearchParams({ desde: estadoPeriodo.desde, hasta: estadoPeriodo.hasta });
    if (filtro) q.set('estado', filtro);
    const [d, todos] = await Promise.all([get('/api/pagos?' + q), filtro ? get('/api/pagos?desde=' + estadoPeriodo.desde + '&hasta=' + estadoPeriodo.hasta) : null]);
    const t = (todos || d).totales;
    lista = d.pagos;
    seleccion.clear();
    const vencidos = await get('/api/pagos/vencidos/resumen');
    const cont = $('#pagos-cuerpo', el);
    const titulo = { vencido: 'Recibos atrasados (todos los meses)', parcial: 'Pagos parciales (todos los meses)', pagado: 'Recibos cobrados', pendiente: 'Recibos pendientes en plazo' }[filtro] || 'Recibos';
    montar(cont, html`
      ${vencidos.recibos ? html`<div class="banda-vencidos">
        <div><b>${vencidos.recibos} recibo${vencidos.recibos === 1 ? '' : 's'} vencido${vencidos.recibos === 1 ? '' : 's'}</b> sin cobrar del todo · <b>${euros(vencidos.pendiente, true)}</b> pendientes${vencidos.parciales ? ' (' + vencidos.parciales + ' con pago parcial)' : ''}</div>
        <div class="filtros">${filtro !== 'vencido' ? html`<a class="boton mini" href="#/pagos?estado=vencido">Ver vencidos</a>` : ''}${editar ? html`<button class="boton mini primario" id="todos-vencidos">Marcar todos los recibos vencidos como pagados</button>` : ''}</div>
      </div>` : ''}
      <div class="cifras">
        <a class="cifra" href="#/pagos?estado=pagado"><span class="etq"><span class="punto p-disponible"></span>Cobrado</span><span class="valor">${euros(t.pagado)}</span><span class="sub">${textoPeriodo(estadoPeriodo)}</span></a>
        <a class="cifra" href="#/pagos?estado=pendiente"><span class="etq"><span class="punto p-reservada"></span>Pendiente (en plazo)</span><span class="valor">${euros(t.pendiente)}</span><span class="sub">aún no ha vencido</span></a>
        <a class="cifra ${t.vencido ? 'destacada' : ''}" href="#/pagos?estado=vencido"><span class="etq"><span class="punto p-por_liberar"></span>Atrasado</span><span class="valor">${euros(t.vencido)}</span><span class="sub">${t.nVencido} recibos con la fecha pasada</span></a>
        <a class="cifra" href="#/pagos?estado=parcial"><span class="etq">Pagos parciales</span><span class="valor">${t.nParcial}</span><span class="sub">recibos cobrados en parte</span></a>
      </div>
      <section class="tarjeta mt">
        <header><div><h2>${titulo}</h2><p>${d.pagos.length} recibos · ${euros(d.pagos.reduce((s, p) => s + p.importe, 0))}</p></div>
          <input type="search" id="buscar" placeholder="Buscar inmueble, habitación${verInq ? ', inquilino' : ''}…"></header>
        <div class="tabla-env"><table>
          <thead><tr>${editar ? html`<th class="col-sel"><input type="checkbox" id="sel-todos" aria-label="Seleccionar todos los recibos sin cobrar de la lista"></th>` : ''}<th>Mes</th><th>Inmueble · hab.</th>${verInq ? html`<th>Inquilino</th>` : ''}<th>Concepto</th><th class="der">Importe</th><th>Vence</th><th>Estado</th><th>Cobrado</th>${editar ? html`<th></th>` : ''}</tr></thead>
          <tbody id="filas">${d.pagos.map((p) => html`<tr data-texto="${[p.inmueble, p.habitacion, verInq ? p.inquilino : '', p.concepto, p.contrato].join(' ').toLowerCase()}">
            ${editar ? html`<td class="col-sel">${p.estado !== 'pagado' ? html`<input type="checkbox" data-sel="${p.id}" aria-label="Seleccionar recibo ${p.inmueble} ${p.habitacion || ''} ${mesLargo(p.periodo)}">` : ''}</td>` : ''}
            <td>${mesLargo(p.periodo)}</td><td><a href="#/habitaciones/${p.habitacion_id}"><b>${p.inmueble}</b> ${p.habitacion || ''}</a>${p.contrato ? html`<span class="sec">${p.contrato}</span>` : ''}</td>${verInq ? html`<td>${p.inquilino || '—'}</td>` : ''}
            <td>${p.concepto}${p.notas ? html`<span class="sec">${p.notas}</span>` : ''}</td><td class="der num">${euros(p.importe, true)}${p.estado === 'parcial' ? html`<span class="sec">faltan ${euros(p.falta, true)}</span>` : ''}</td>
            <td class="num">${fecha(p.vence)}</td><td>${chipPago(p.estado)}${p.estado === 'parcial' && p.atrasado ? html`<span class="sec">fecha pasada</span>` : ''}</td>
            <td class="num">${p.pagado_el ? html`${fecha(p.pagado_el)}<span class="sec">${p.metodo || ''}${p.conRetraso ? ' · con retraso' : ''}</span>` : p.cobrado ? euros(p.cobrado, true) : '—'}</td>
            ${editar ? html`<td class="der">${p.estado !== 'pagado' ? html`<button class="boton mini" data-cobrar="${p.id}">Registrar cobro</button>` : html`<button class="enlace pequeno" data-deshacer="${p.id}">Deshacer</button>`}</td>` : ''}</tr>`)}</tbody>
        </table></div>${d.pagos.length ? '' : html`<p class="vacio">No hay recibos con este filtro.</p>`}
      </section>
      ${editar ? html`<div class="barra-seleccion oculto" id="barra-sel" role="region" aria-label="Recibos seleccionados"><span id="sel-texto"></span>
        <button class="boton primario" id="cobrar-sel">Marcar como pagados</button><button class="boton" id="quitar-sel">Quitar selección</button></div>` : ''}`);
    const actualizarBarra = () => {
      const barra = $('#barra-sel', cont); if (!barra) return;
      const elegidos = lista.filter((p) => seleccion.has(p.id));
      barra.classList.toggle('oculto', !elegidos.length);
      $('#sel-texto', cont).textContent = elegidos.length + ' recibo' + (elegidos.length === 1 ? '' : 's') + ' seleccionado' + (elegidos.length === 1 ? '' : 's') + ' · ' + euros(elegidos.reduce((s, p) => s + p.falta, 0), true) + ' pendientes';
    };
    cont.onchange = (e) => {
      if (e.target.id === 'sel-todos') {
        for (const c of cont.querySelectorAll('[data-sel]')) { if (c.closest('tr').classList.contains('oculto')) continue; c.checked = e.target.checked; if (c.checked) seleccion.add(Number(c.dataset.sel)); else seleccion.delete(Number(c.dataset.sel)); }
      } else if (e.target.dataset.sel) { if (e.target.checked) seleccion.add(Number(e.target.dataset.sel)); else seleccion.delete(Number(e.target.dataset.sel)); }
      actualizarBarra();
    };
    $('#quitar-sel', cont)?.addEventListener('click', () => { seleccion.clear(); for (const c of cont.querySelectorAll('[data-sel], #sel-todos')) c.checked = false; actualizarBarra(); });
    $('#cobrar-sel', cont)?.addEventListener('click', () => {
      const elegidos = lista.filter((p) => seleccion.has(p.id));
      confirmarCobro({ n: elegidos.length, importe: elegidos.reduce((s, p) => s + p.falta, 0), datos: { ids: elegidos.map((p) => p.id) } });
    });
    $('#todos-vencidos', cont)?.addEventListener('click', () => confirmarCobro({ n: vencidos.recibos, importe: vencidos.pendiente, datos: { todosVencidos: true }, todos: true }));
    $('#buscar', cont).oninput = (e) => { const q2 = e.target.value.trim().toLowerCase(); for (const f of cont.querySelectorAll('#filas tr')) f.classList.toggle('oculto', !!q2 && !f.dataset.texto.includes(q2)); };
  };

  // Ventana de confirmación del cobro masivo
  const confirmarCobro = ({ n, importe, datos, todos }) => formulario({
    titulo: todos ? 'Marcar todos los vencidos como pagados' : 'Marcar ' + n + ' recibo' + (n === 1 ? '' : 's') + ' como pagado' + (n === 1 ? '' : 's'),
    descripcion: 'Vas a marcar como cobrados ' + n + ' recibo' + (n === 1 ? '' : 's') + (todos ? ' vencidos' : '') + ' por un total de ' + euros(importe, true) + '. Se actualizarán su estado, la fecha de cobro y los indicadores (panel, cobros, rentabilidad y estadísticas). Revisa que de verdad se han cobrado: quedará registrado en la auditoría.',
    campos: [{ nombre: 'pagado_el', etiqueta: 'Fecha de cobro', tipo: 'date', req: true, valor: hoy() },
      { nombre: 'metodo', etiqueta: 'Método', tipo: 'select', vacio: 'Mantener el de cada recibo', opciones: METODOS },
      { nombre: 'seguro', etiqueta: 'Confirmo que estos recibos están cobrados', tipo: 'checkbox', ancho: true }],
    boton: 'Sí, marcar como pagados',
    enviar: async (x) => {
      if (!x.seguro) throw new Error('Marca la casilla de confirmación para continuar.');
      const r = await post('/api/pagos/cobrar-lote', { ...datos, pagado_el: x.pagado_el, metodo: x.metodo });
      aviso(r.cobrados + ' recibos marcados como pagados (' + euros(r.importe, true) + ')');
      pintar();
    }
  });

  montar(el, html`
    <div class="cabecera"><div><h1>Pagos</h1><p>Recibos de renta y servicios de los inquilinos</p></div>
      <div class="acciones">${editar ? html`<button class="boton" id="generar">Generar recibos de un mes</button>` : ''}</div></div>
    ${pestanas([['', 'Todos', null, '#/pagos'], ['pagado', 'Recibidos', null, '#/pagos?estado=pagado'], ['pendiente', 'Pendientes', null, '#/pagos?estado=pendiente'], ['parcial', 'Parciales', null, '#/pagos?estado=parcial'], ['vencido', 'Atrasados', null, '#/pagos?estado=vencido']], filtro)}
    <div id="periodo"></div><div id="pagos-cuerpo"></div>`);
  $('#periodo', el).append(selectorPeriodo(estadoPeriodo, () => pintar()));
  await pintar();

  el.addEventListener('click', async (e) => {
    const c = e.target.closest('[data-cobrar]'), u = e.target.closest('[data-deshacer]');
    if (c) {
      const p = lista.find((x) => String(x.id) === c.dataset.cobrar);
      formulario({
        titulo: 'Registrar cobro', descripcion: (p.inmueble + ' ' + (p.habitacion || '')) + ' · ' + mesLargo(p.periodo) + ' · ' + p.concepto + ': ' + euros(p.importe, true) + (p.cobrado ? ' (ya cobrado ' + euros(p.cobrado, true) + ')' : ''),
        campos: [{ nombre: 'cobrado', etiqueta: 'Importe cobrado en total (€)', tipo: 'number', paso: '0.01', min: 0, req: true, valor: (p.importe / 100).toFixed(2), ayuda: 'Si es menos que el recibo, quedará como pago parcial.' },
          { nombre: 'pagado_el', etiqueta: 'Fecha de cobro', tipo: 'date', req: true, valor: hoy() },
          { nombre: 'metodo', etiqueta: 'Método', tipo: 'select', vacio: false, opciones: METODOS },
          { nombre: 'notas', etiqueta: 'Notas', tipo: 'textarea', valor: p.notas }],
        boton: 'Guardar cobro', enviar: async (x) => { await put('/api/pagos/' + p.id, x); aviso('Cobro registrado'); pintar(); }
      });
    }
    if (u) { await put('/api/pagos/' + u.dataset.deshacer, { pagado_el: null, metodo: null }); aviso('Cobro deshecho'); pintar(); }
  });
  $('#generar', el)?.addEventListener('click', () => formulario({
    titulo: 'Generar recibos', descripcion: 'Crea los recibos de renta y servicios de todos los contratos en vigor ese mes. No duplica los que ya existen. (Se hace solo cada mes.)',
    campos: [{ nombre: 'periodo', etiqueta: 'Mes', tipo: 'month', req: true, valor: periodoHoy() }], boton: 'Generar',
    enviar: async (x) => { const r = await post('/api/pagos/generar', x); aviso(r.creados + ' recibos creados'); recargar(); }
  }));
}
