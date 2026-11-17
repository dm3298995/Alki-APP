/* ==========================================================================
   vistas/gastos.js — COSTE REAL POR INMUEBLE, GASTOS Y SUMINISTROS
   Pestañas:
   · Coste por inmueble: cuánto cuesta de verdad mantener cada piso.
   · Todos los gastos: el detalle, con alta y borrado.
   · Suministros: luz, agua, gas e internet.
   Los mantenimientos aparecen automáticamente como gasto.
   ========================================================================== */
import { html, montar, $, euros, eurosCompacto, fecha, pestanas, formulario, aviso, confirmar, mesLargo, hoy, periodoHoy, selectorPeriodo, nuevoPeriodo, textoPeriodo, icono } from '../ui.js';
import { api, get, post, del, subir } from '../api.js';
import { barras, barrasH, tarjeta } from '../graficos.js';
import { activarFilas } from './panel.js';
import { puede } from '../sesion.js';

const estadoPeriodo = nuevoPeriodo('m6');
let catalogo = null;
async function cat() { return catalogo || (catalogo = await get('/api/catalogo')); }

export async function nuevoGasto({ inmuebleId } = {}, alGuardar) {
  const c = await cat();
  formulario({
    titulo: 'Registrar gasto', descripcion: 'Facturas de suministros, limpieza, reparaciones… Los mantenimientos se registran en su apartado y se suman solos.',
    campos: [
      { nombre: 'inmueble_id', etiqueta: 'Inmueble', tipo: 'select', req: true, valor: inmuebleId, opciones: c.inmuebles.map((i) => [i.id, i.codigo + ' · ' + i.nombre]) },
      { nombre: 'categoria', etiqueta: 'Categoría', tipo: 'select', req: true, opciones: Object.entries(c.categorias) },
      { nombre: 'importe', etiqueta: 'Importe (€)', tipo: 'number', paso: '0.01', min: 0, req: true },
      { nombre: 'fecha', etiqueta: 'Fecha de la factura', tipo: 'date', req: true, valor: hoy() },
      { nombre: 'periodo', etiqueta: 'Mes al que corresponde', tipo: 'month', valor: periodoHoy(), ayuda: 'Ej.: la luz de octubre que llega en noviembre.' },
      { nombre: 'proveedor', etiqueta: 'Proveedor' },
      { nombre: 'descripcion', etiqueta: 'Descripción', tipo: 'textarea' },
      ...(puede('facturas.ver') ? [{ nombre: 'factura', etiqueta: 'Factura (PDF o foto, opcional)', tipo: 'file', ancho: true }] : [])
    ],
    enviar: async (d) => {
      const { factura, ...datos } = d;
      const r = await post('/api/gastos', datos);
      if (factura) await subir('/api/documentos?entidad=gasto&id=' + r.id + '&nombre=' + encodeURIComponent(factura.name), factura);
      aviso('Gasto registrado'); alGuardar?.();
    }
  });
}

export async function nuevoGastoFijo(inmuebleId, alGuardar) {
  const c = await cat();
  formulario({
    titulo: 'Nuevo gasto fijo mensual', descripcion: 'Se apuntará solo cada mes desde la fecha indicada (alquiler al propietario, internet, limpieza, seguro…).',
    campos: [
      { nombre: 'categoria', etiqueta: 'Categoría', tipo: 'select', req: true, opciones: Object.entries(c.categorias) },
      { nombre: 'importe', etiqueta: 'Importe mensual (€)', tipo: 'number', paso: '0.01', min: 0, req: true },
      { nombre: 'desde', etiqueta: 'Desde', tipo: 'month', req: true, valor: periodoHoy() }, { nombre: 'hasta', etiqueta: 'Hasta (opcional)', tipo: 'month' },
      { nombre: 'dia', etiqueta: 'Día de cargo', tipo: 'number', min: 1, valor: 1 }, { nombre: 'proveedor', etiqueta: 'Proveedor' }
    ],
    enviar: async (d) => { await post('/api/recurrentes', { ...d, inmueble_id: inmuebleId, dia: d.dia ? Number(d.dia) : 1 }); aviso('Gasto fijo creado'); alGuardar?.(); }
  });
}

export async function vistaGastos(el, { query, ctx, recargar }) {
  const vista = ['lista', 'suministros', 'mes'].includes(query.get('vista')) ? query.get('vista') : 'costes';
  const editar = ctx.puede('gastos.editar');
  montar(el, html`
    <div class="cabecera"><div><h1>Gastos y costes</h1><p>Cuánto cuesta realmente mantener cada piso</p></div>
      <div class="acciones">${editar ? html`<button class="boton primario" id="nuevo">${icono('mas')}Registrar gasto</button>` : ''}</div></div>
    ${pestanas([['costes', 'Coste por inmueble', null, '#/gastos'], ['lista', 'Todos los gastos', null, '#/gastos?vista=lista'], ['suministros', 'Suministros', null, '#/gastos?vista=suministros'], ...(editar ? [['mes', 'Subir gastos del mes', null, '#/gastos?vista=mes']] : []), ['mant', 'Mantenimientos y reparaciones', null, '#/mantenimientos']], vista)}
    <div id="periodo"></div><div id="cuerpo"></div>`);
  if (vista === 'mes') { await pintarMes($('#cuerpo', el)); return; }
  const pintar = () => (vista === 'costes' ? pintarCostes($('#cuerpo', el)) : pintarLista($('#cuerpo', el), vista, editar));
  if (vista !== 'costes') $('#periodo', el).append(selectorPeriodo(estadoPeriodo, pintar));
  $('#nuevo', el)?.addEventListener('click', () => nuevoGasto({}, pintar));
  await pintar();
  activarFilas(el);
}

// ---------- Coste real por inmueble, por periodos ----------
// Mensual, trimestral, semestral o anual: evolución, desglose y comparación
const estadoCostes = { agrupar: 'mes', periodo: '', inmueble: '' };
const AGRUPAR = [['mes', 'Mensual'], ['trimestre', 'Trimestral'], ['semestre', 'Semestral'], ['anio', 'Anual']];
const GRUPOS = { alquiler: ['Alquiler', '--serie-1', 'Alquiler'], suministros: ['Suministros', '--serie-2', 'Suministros'], limpieza: ['Limpieza', '--serie-3', 'Limpieza'], mantenimiento: ['Mantenimiento y reparaciones', '--serie-4', 'Manten.'], otros: ['Impuestos, seguros y otros', '--serie-5', 'Otros'] };
function nombrePeriodo(clave, agrupar, largo = false) {
  if (agrupar === 'anio') return clave;
  if (agrupar === 'mes') return largo ? mesLargo(clave) : mesLargo(clave).replace(/^(\w{3})\w*/, '$1');
  const [a, x] = clave.split('-');
  return agrupar === 'trimestre' ? (largo ? x[1] + 'º trimestre ' + a : x[1] + 'T ' + a.slice(2)) : (largo ? x[1] + 'º semestre ' + a : x[1] + 'S ' + a.slice(2));
}
const variacion = (v, texto) => (v == null ? html`<span class="sub">${texto}: sin datos</span>` : html`<span class="sub"><span class="${v > 0 ? 'sube' : 'baja'}">${v > 0 ? '▲' : '▼'} ${Math.abs(v).toLocaleString('es-ES')} %</span> ${texto}</span>`);

async function pintarCostes(cont) {
  const c = await cat();
  const q = new URLSearchParams({ agrupar: estadoCostes.agrupar });
  if (estadoCostes.periodo) q.set('periodo', estadoCostes.periodo);
  if (estadoCostes.inmueble) q.set('inmueble', estadoCostes.inmueble);
  const d = await get('/api/costes/periodos?' + q);
  const s = d.seleccionado, a = d.anterior, y = d.anioAnterior;
  const eje = (v, t) => (t ? euros(v) : eurosCompacto(v));
  const piso = d.inmueble ? c.inmuebles.find((i) => i.id === d.inmueble) : null;
  const np = (x, largo) => nombrePeriodo(x.clave, d.agrupar, largo);
  const cats = Object.keys(d.categorias).filter((k) => s.categorias[k] || a?.categorias[k] || y?.categorias[k]);
  montar(cont, html`
    <div class="filtros">
      <div class="segmentos" role="group" aria-label="Agrupar por">${AGRUPAR.map(([k, t]) => html`<button type="button" data-agrupar="${k}" aria-pressed="${d.agrupar === k}">${t}</button>`)}</div>
      <label>Periodo <select id="c-periodo">${d.periodos.map((p) => html`<option value="${p.clave}"${p.clave === s.clave ? html` selected` : ''}>${nombrePeriodo(p.clave, d.agrupar, true)}${p.completo ? '' : ' (en curso)'}</option>`)}</select></label>
      <label>Inmueble <select id="c-inm"><option value="">Todos los pisos</option>${c.inmuebles.map((i) => html`<option value="${i.id}"${i.id === d.inmueble ? html` selected` : ''}>${i.codigo}</option>`)}</select></label>
    </div>
    <div class="cifras">
      <div class="cifra destacada"><span class="etq">Coste total · ${np(s, true)}</span><span class="valor">${euros(s.total)}</span><span class="sub">${piso ? piso.codigo : 'todos los pisos'}${s.completo ? '' : ' · periodo en curso'}</span></div>
      <div class="cifra"><span class="etq">Frente al periodo anterior</span><span class="valor">${a ? euros(a.total) : '—'}</span>${variacion(d.deltaAnterior, a ? 'vs ' + np(a) : 'anterior')}</div>
      ${d.agrupar !== 'anio' ? html`<div class="cifra"><span class="etq">Mismo periodo del año anterior</span><span class="valor">${y ? euros(y.total) : '—'}</span>${variacion(d.deltaAnio, y ? 'vs ' + np(y) : 'año anterior')}</div>` : ''}
      <div class="cifra"><span class="etq">Media mensual</span><span class="valor">${euros(s.mediaMensual)}</span><span class="sub">${s.meses} mes${s.meses === 1 ? '' : 'es'} con datos</span></div>
      <div class="cifra"><span class="etq">Por habitación y mes</span><span class="valor">${euros(s.porHabitacionMes)}</span><span class="sub">${d.habitaciones} habitaciones</span></div>
    </div>
    <div class="rejilla r-2 mt">
      ${tarjeta({ titulo: 'Evolución del coste', sub: (piso ? piso.codigo + ' · ' : 'Todos los pisos · ') + AGRUPAR.find((x) => x[0] === d.agrupar)[1].toLowerCase() + ' · por tipo de coste', series: Object.values(GRUPOS).map(([n, col]) => ({ nombre: n, color: col })),
        grafico: barras({ etiquetas: d.evolucion.map((e) => e.clave), nombresX: d.evolucion.map((e) => nombrePeriodo(e.clave, d.agrupar) + (e.completo ? '' : '*')), series: Object.entries(GRUPOS).map(([g, [n, col]]) => ({ nombre: n, color: col, valores: d.evolucion.map((e) => e.grupos[g]) })), formato: eje }),
        tabla: { cabeceras: ['Periodo', ...Object.values(GRUPOS).map((x) => x[0]), 'Total'], filas: d.evolucion.map((e) => [nombrePeriodo(e.clave, d.agrupar, true) + (e.completo ? '' : ' (en curso)'), ...Object.keys(GRUPOS).map((g) => euros(e.grupos[g])), euros(e.total)]) },
        extra: d.evolucion.some((e) => !e.completo) ? html`<p class="pequeno suave">* Periodo en curso: aún faltan facturas por llegar.</p>` : '' })}
      <section class="tarjeta"><header><div><h2>Desglose de ${np(s, true)}</h2><p>${a ? 'Comparado con ' + np(a, true) : ''}</p></div></header>
        <div class="tabla-env"><table><thead><tr><th>Coste</th><th class="der">${np(s)}</th><th class="der">${a ? np(a) : 'Anterior'}</th><th class="der">Cambio</th></tr></thead>
          <tbody>${cats.sort((x, z) => (s.categorias[z] || 0) - (s.categorias[x] || 0)).map((k) => { const v = s.categorias[k] || 0, w = a?.categorias[k] || 0; const dif = w ? Math.round(((v - w) / w) * 100) : null;
            return html`<tr><td>${d.categorias[k]}<div class="pista-mini"><i data-ancho="${s.total ? (v / s.total) * 100 : 0}"></i></div></td><td class="der num">${euros(v)}</td><td class="der num suave">${euros(w)}</td>
              <td class="der num">${dif == null ? html`<span class="suave">—</span>` : html`<span class="${dif > 0 ? 'sube' : dif < 0 ? 'baja' : ''}">${dif > 0 ? '+' : ''}${dif} %</span>`}</td></tr>`; })}</tbody>
          <tfoot><tr><td>Total</td><td class="der num">${euros(s.total)}</td><td class="der num">${euros(a?.total || 0)}</td><td class="der num">${d.deltaAnterior == null ? '—' : (d.deltaAnterior > 0 ? '+' : '') + d.deltaAnterior.toLocaleString('es-ES') + ' %'}</td></tr></tfoot></table></div>
      </section>
    </div>
    ${!piso ? html`<section class="tarjeta mt">
      <header><div><h2>Coste real por inmueble · ${np(s, true)}</h2><p>De mayor a menor · pulsa un piso para ver solo sus costes</p></div></header>
      <div class="tabla-env"><table>
        <thead><tr><th>Inmueble</th>${Object.values(GRUPOS).map(([n, , corto]) => html`<th class="der ocultar-movil" title="${n}">${corto}</th>`)}<th class="der">Total</th><th class="der">${a ? np(a) : 'Anterior'}</th><th class="der">Cambio</th><th class="der">€/hab/mes</th></tr></thead>
        <tbody>${d.tabla.map((f) => html`<tr class="clic" data-piso="${f.id}" title="${f.nombre}"><td><b>${f.codigo}</b></td>
          ${Object.keys(GRUPOS).map((g) => html`<td class="der num ocultar-movil">${f.grupos[g] ? euros(f.grupos[g]) : html`<span class="suave">—</span>`}</td>`)}
          <td class="der num"><b>${euros(f.total)}</b></td><td class="der num suave">${euros(f.anterior)}</td>
          <td class="der num">${f.delta == null ? html`<span class="suave">—</span>` : html`<span class="${f.delta > 0 ? 'sube' : f.delta < 0 ? 'baja' : ''}">${f.delta > 0 ? '+' : ''}${f.delta.toLocaleString('es-ES')} %</span>`}</td>
          <td class="der num">${euros(f.porHabitacionMes)}</td></tr>`)}</tbody>
        <tfoot><tr><td>Total</td>${Object.keys(GRUPOS).map((g) => html`<td class="der num ocultar-movil">${euros(s.grupos[g])}</td>`)}<td class="der num">${euros(s.total)}</td><td class="der num">${euros(a?.total || 0)}</td><td></td><td class="der num">${euros(s.porHabitacionMes)}</td></tr></tfoot>
      </table></div></section>` : html`<p class="mt"><a href="#/inmuebles/${piso.id}">Ver la ficha de ${piso.codigo} →</a> · <button class="enlace" id="c-todos">Ver todos los pisos</button></p>`}`);
  const recargar = () => pintarCostes(cont);
  cont.querySelectorAll('[data-agrupar]').forEach((b) => { b.onclick = () => { estadoCostes.agrupar = b.dataset.agrupar; estadoCostes.periodo = ''; recargar(); }; });
  $('#c-periodo', cont).onchange = (e) => { estadoCostes.periodo = e.target.value; recargar(); };
  $('#c-inm', cont).onchange = (e) => { estadoCostes.inmueble = e.target.value; recargar(); };
  $('#c-todos', cont)?.addEventListener('click', () => { estadoCostes.inmueble = ''; recargar(); });
  cont.onclick = (e) => { const tr = e.target.closest('tr[data-piso]'); if (tr) { estadoCostes.inmueble = tr.dataset.piso; recargar(); window.scrollTo({ top: 0, behavior: 'smooth' }); } };
}

async function pintarLista(cont, vista, editar) {
  const c = await cat();
  const q = new URLSearchParams({ desde: estadoPeriodo.desde, hasta: estadoPeriodo.hasta });
  if (vista === 'suministros') q.set('grupo', 'suministros');
  const sel = cont.dataset;
  if (sel.inm) q.set('inmueble', sel.inm);
  if (sel.cat && vista !== 'suministros') q.set('categoria', sel.cat);
  const d = await get('/api/gastos?' + q);
  // Suministros: resumen por tipo y por piso
  const porTipo = {};
  if (vista === 'suministros') for (const g of d.gastos) porTipo[g.categoria] = (porTipo[g.categoria] || 0) + g.importe;
  montar(cont, html`
    ${vista === 'suministros' ? html`<div class="cifras">${['electricidad', 'agua', 'gas', 'internet'].map((k) => html`<div class="cifra"><span class="etq">${d.categorias[k]}</span><span class="valor">${euros(porTipo[k] || 0)}</span><span class="sub">${textoPeriodo(estadoPeriodo)}</span></div>`)}</div>` : ''}
    <section class="tarjeta mt">
      <header><div><h2>${vista === 'suministros' ? 'Facturas de suministros' : 'Gastos'}</h2><p>${d.gastos.length} apuntes · ${euros(d.total)}</p></div>
        <div class="filtros">
          <select id="f-inm" aria-label="Inmueble"><option value="">Todos los inmuebles</option>${c.inmuebles.map((i) => html`<option value="${i.id}"${String(i.id) === sel.inm ? html` selected` : ''}>${i.codigo}</option>`)}</select>
          ${vista === 'suministros' ? '' : html`<select id="f-cat" aria-label="Categoría"><option value="">Todas las categorías</option>${Object.entries(c.categorias).map(([k, t]) => html`<option value="${k}"${k === sel.cat ? html` selected` : ''}>${t}</option>`)}</select>`}
        </div></header>
      <div class="tabla-env"><table>
        <thead><tr><th>Fecha</th><th>Mes</th><th>Inmueble</th><th>Categoría</th><th>Proveedor / descripción</th><th class="der">Importe</th><th></th></tr></thead>
        <tbody>${d.gastos.map((g) => html`<tr><td class="num">${fecha(g.fecha)}</td><td>${mesLargo(g.periodo)}</td><td><a href="#/inmuebles/${g.inmueble_id}"><b>${g.inmueble}</b></a></td>
          <td>${d.categorias[g.categoria]}${g.origen === 'fijo' ? html` <span class="chip">Fijo</span>` : g.origen === 'mantenimiento' ? html` <span class="chip info">Mantenimiento</span>` : ''}</td>
          <td>${g.proveedor || '—'}${g.descripcion ? html`<span class="sec">${g.descripcion}</span>` : ''}</td><td class="der num">${euros(g.importe, true)}</td>
          <td class="der">${editar && g.origen === 'gasto' ? html`<button class="enlace pequeno peligro" data-borrar="${g.id}">Borrar</button>` : ''}</td></tr>`)}</tbody>
      </table></div>${d.gastos.length ? '' : html`<p class="vacio">No hay gastos en este periodo.</p>`}
    </section>`);
  $('#f-inm', cont).onchange = (e) => { cont.dataset.inm = e.target.value; pintarLista(cont, vista, editar); };
  const fc = $('#f-cat', cont); if (fc) fc.onchange = (e) => { cont.dataset.cat = e.target.value; pintarLista(cont, vista, editar); };
  cont.onclick = async (e) => {
    const b = e.target.closest('[data-borrar]'); if (!b) return;
    if (!(await confirmar('¿Borrar este gasto? Quedará registrado en la auditoría.', 'Borrar'))) return;
    await del('/api/gastos/' + b.dataset.borrar); aviso('Gasto borrado'); pintarLista(cont, vista, editar);
  };
}

// ---------- Subir los gastos de un mes de todos los pisos de una vez ----------
const COLUMNAS_MES = ['electricidad', 'agua', 'gas', 'internet', 'limpieza', 'impuestos', 'seguros', 'otros'];
async function pintarMes(cont, periodo = periodoHoy()) {
  const d = await get('/api/gastos/mes?periodo=' + periodo);
  const nombres = { electricidad: 'Luz', agua: 'Agua', gas: 'Gas', internet: 'Internet', limpieza: 'Limpieza', impuestos: 'Impuestos / tasas', seguros: 'Seguros', otros: 'Otros' };
  const e = (c) => (c ? (c / 100).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '');
  montar(cont, html`
    <section class="tarjeta"><header><div><h2>Subir los gastos del mes</h2><p>Escribe los importes de las facturas de cada piso (IVA incluido) y pulsa Guardar. En gris, lo que costó el mes anterior; debajo, lo que ya está registrado este mes.</p></div>
      <label class="filtros">Mes <input type="month" id="mes" value="${d.periodo}" max="${periodoHoy()}"></label></header>
      <form id="f-mes"><div class="tabla-env"><table class="tabla-mes"><thead><tr><th>Piso</th>${COLUMNAS_MES.map((c) => html`<th class="der">${nombres[c]}</th>`)}<th class="der">Total</th></tr></thead>
        <tbody>${d.pisos.map((p) => html`<tr data-p="${p.id}"><td><b>${p.codigo}</b></td>${COLUMNAS_MES.map((c) => html`<td><input inputmode="decimal" name="${p.id}|${c}" placeholder="${e(p.previo[c])}" aria-label="${p.codigo} ${nombres[c]}">${p.actual[c] ? html`<span class="sec">ya: ${e(p.actual[c])}</span>` : ''}</td>`)}<td class="der num" data-total>—</td></tr>`)}</tbody>
        <tfoot><tr><td>Total</td>${COLUMNAS_MES.map((c) => html`<td class="der num" data-tc="${c}">—</td>`)}<td class="der num" data-tt>—</td></tr></tfoot></table></div>
        <div class="filtros mt"><label>Fecha de las facturas <input type="date" name="fecha" value="${d.periodo === periodoHoy() ? hoy() : d.periodo + '-28'}"></label>
          <label>Proveedor (opcional) <input type="text" name="proveedor" placeholder="Ej.: varias compañías"></label>
          <button class="boton primario" type="submit">Guardar gastos del mes</button></div>
        <div id="res-mes"></div></form>
    </section>
    <section class="tarjeta mt"><header><div><h2>Importar facturas desde un archivo (CSV / Excel)</h2><p>Para subir muchas facturas a la vez. Guarda tu Excel como CSV con estas columnas: <b>piso; categoría; fecha; importe; proveedor; descripción</b>.</p></div>
      <button class="boton mini" id="plantilla">Descargar plantilla</button></header>
      <div class="filtros"><input type="file" id="csv" accept=".csv,text/csv"><button class="boton" id="probar">Comprobar</button><button class="boton primario oculto" id="importar">Importar</button></div>
      <p class="pequeno suave">Categorías: luz, agua, gas, internet, limpieza, alquiler, mantenimiento, reparaciones, impuestos, seguros, comisiones, otros. El piso es su código (p. ej. ${d.pisos[0]?.codigo || 'Aza14'}).</p>
      <div id="res-csv"></div></section>`);
  const f = $('#f-mes', cont);
  const num = (v) => { const n = Number(String(v).replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) && n > 0 ? n : 0; };
  const totales = () => {
    let tt = 0; const tc = Object.fromEntries(COLUMNAS_MES.map((c) => [c, 0]));
    for (const tr of cont.querySelectorAll('tr[data-p]')) {
      let t = 0; for (const c of COLUMNAS_MES) { const v = num(f.elements[tr.dataset.p + '|' + c].value); t += v; tc[c] += v; }
      tr.querySelector('[data-total]').textContent = t ? euros(Math.round(t * 100), true) : '—'; tt += t;
    }
    for (const c of COLUMNAS_MES) cont.querySelector(`[data-tc="${c}"]`).textContent = tc[c] ? euros(Math.round(tc[c] * 100)) : '—';
    cont.querySelector('[data-tt]').textContent = tt ? euros(Math.round(tt * 100), true) : '—';
  };
  f.addEventListener('input', totales);
  $('#mes', cont).onchange = (ev) => pintarMes(cont, ev.target.value || periodoHoy());
  f.onsubmit = async (ev) => {
    ev.preventDefault();
    const filas = [];
    for (const tr of cont.querySelectorAll('tr[data-p]')) for (const c of COLUMNAS_MES) {
      const v = num(f.elements[tr.dataset.p + '|' + c].value);
      if (v) filas.push({ inmueble_id: Number(tr.dataset.p), categoria: c, importe: v, proveedor: f.proveedor.value || null });
    }
    if (!filas.length) return aviso('No has escrito ningún importe', 'error');
    try { const r = await post('/api/gastos/lote', { periodo: $('#mes', cont).value, fecha: f.fecha.value, filas }); aviso(r.creados + ' gastos guardados'); pintarMes(cont, $('#mes', cont).value); }
    catch (ex) { montar($('#res-mes', cont), html`<div class="error-form mt">${ex.message}</div>`); }
  };
  $('#plantilla', cont).onclick = () => {
    const filas = ['piso;categoría;fecha;importe;proveedor;descripción', ...d.pisos.slice(0, 3).flatMap((p) => [p.codigo + ';luz;' + hoy().split('-').reverse().join('/') + ';84,37;Compañía de luz;Factura de luz', p.codigo + ';agua;' + hoy().split('-').reverse().join('/') + ';41,20;Compañía de agua;Factura bimestral'])];
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + filas.join('\n')], { type: 'text/csv' })); a.download = 'plantilla-gastos-alki.csv'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const enviarCSV = async (probar) => {
    const archivo = $('#csv', cont).files[0];
    if (!archivo) return aviso('Elige un archivo CSV', 'error');
    try {
      const r = await api('/api/gastos/importar' + (probar ? '?probar=1' : ''), { metodo: 'POST', crudo: archivo, tipo: 'text/csv' });
      montar($('#res-csv', cont), html`<div class="${r.nErrores ? 'aviso-demo' : 'exito-form'} mt">${probar ? 'Comprobado: ' : 'Importado: '}${r.validos} facturas válidas por ${euros(r.total, true)}${r.nErrores ? ' · ' + r.nErrores + ' filas con errores (no se importan)' : ''}.</div>
        ${r.errores.length ? html`<ul class="pequeno">${r.errores.map((x) => html`<li>${x}</li>`)}</ul>` : ''}`);
      $('#importar', cont).classList.toggle('oculto', !probar || !r.validos);
      if (!probar) aviso(r.validos + ' facturas importadas');
    } catch (ex) { montar($('#res-csv', cont), html`<div class="error-form mt">${ex.message}</div>`); }
  };
  $('#probar', cont).onclick = () => enviarCSV(true);
  $('#importar', cont).onclick = () => enviarCSV(false);
}
