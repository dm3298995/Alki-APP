/* ==========================================================================
   vistas/habitaciones.js — TODAS LAS HABITACIONES Y FICHA DE CADA UNA
   Pestañas: todas · disponibles · ocupadas · próximas a desocuparse · reservadas
   ========================================================================== */
import { html, montar, $, TIPOS_HAB, chipPagos, chipRenovacion, euros, fecha, chipHab, chipDias, chipPago, chipMant, chipContrato, pestanas, formulario, aviso, mesLargo, hoy } from '../ui.js';
import { get, post, put } from '../api.js';
import { activarFilas } from './panel.js';
import { nuevoMantenimiento } from './mantenimientos.js';

const FILTROS = {
  todas: ['Todas', () => true],
  disponible: ['Disponibles', (h) => h.estado === 'disponible'],
  ocupada: ['Ocupadas', (h) => h.estado === 'ocupada' || h.estado === 'por_liberar'],
  por_liberar: ['Próximas a desocuparse', (h) => h.estado === 'por_liberar'],
  reservada: ['Reservadas', (h) => h.estado === 'reservada'],
  bloqueada: ['En mantenimiento', (h) => h.estado === 'mantenimiento' || h.estado === 'no_disponible']
};

export async function vistaHabitaciones(el, { query, ctx }) {
  const filtro = FILTROS[query.get('estado')] ? query.get('estado') : 'todas';
  const inmueble = query.get('inmueble') || '';
  const d = await get('/api/habitaciones');
  const verInq = ctx.puede('inquilinos.ver');
  let lista = d.habitaciones.filter(FILTROS[filtro][1]);
  if (inmueble) lista = lista.filter((h) => String(h.inmueble.id) === inmueble);
  // En "próximas a desocuparse" y "ocupadas", orden por fecha de fin
  if (filtro === 'por_liberar' || filtro === 'ocupada') lista.sort((a, b) => (a.actual?.fin || '9').localeCompare(b.actual?.fin || '9'));
  const inmuebles = [...new Map(d.habitaciones.map((h) => [h.inmueble.id, h.inmueble])).values()];
  const url = (e) => '#/habitaciones?estado=' + e + (inmueble ? '&inmueble=' + inmueble : '');
  const base = inmueble ? d.habitaciones.filter((h) => String(h.inmueble.id) === inmueble) : d.habitaciones;

  montar(el, html`
    <div class="cabecera"><div><h1>Habitaciones</h1><p>${d.resumen.total} habitaciones · ${d.resumen.disponibles} disponibles · ${d.resumen.porLiberar} se liberan pronto</p></div></div>
    ${pestanas(Object.entries(FILTROS).map(([k, [t, f]]) => [k, t, base.filter(f).length, url(k)]), filtro)}
    <div class="filtros">
      <label>Inmueble <select id="f-inm"><option value="">Todos</option>${inmuebles.map((i) => html`<option value="${i.id}"${String(i.id) === inmueble ? html` selected` : ''}>${i.codigo}</option>`)}</select></label>
      <label><input type="search" id="buscar" placeholder="Buscar inmueble, habitación${verInq ? ' o inquilino' : ''}…"></label>
    </div>
    <section class="tarjeta"><div class="tabla-env"><table>
      <thead><tr><th>Inmueble</th><th>Hab.</th><th class="ocultar-movil">Tipo</th><th>Estado</th>${verInq ? html`<th>Inquilino</th>` : ''}<th>Inicio</th><th>Fin</th><th>Quedan</th>${ctx.puede('pagos.ver') ? html`<th>Pagos</th>` : ''}<th class="der">Precio</th></tr></thead>
      <tbody id="filas">${lista.map((h) => html`<tr class="clic" data-ir="#/habitaciones/${h.id}" data-texto="${[h.inmueble.codigo, h.inmueble.nombre, h.codigo, verInq ? h.actual?.inquilino : ''].join(' ').toLowerCase()}">
        <td><b>${h.inmueble.codigo}</b></td><td>${h.codigo}</td><td class="ocultar-movil">${TIPOS_HAB[h.tipo] || '—'}${h.m2 ? html`<span class="sec">${h.m2} m²</span>` : ''}</td><td>${chipHab(h.estado)}${h.actual?.renovacion ? html`<span class="sec">${chipRenovacion(h.actual.renovacion)}</span>` : ''}${h.siguiente && h.estado !== 'reservada' ? html`<span class="sec">Reservada desde ${fecha(h.siguiente.inicio)}</span>` : ''}</td>
        ${verInq ? html`<td>${h.actual?.inquilino || (h.siguiente?.inquilino ? html`<span class="suave">${h.siguiente.inquilino} (entra)</span>` : '—')}</td>` : ''}
        <td class="num">${h.actual ? fecha(h.actual.inicio) : h.siguiente ? fecha(h.siguiente.inicio) : '—'}</td>
        <td class="num">${h.actual ? fecha(h.actual.fin) : h.siguiente ? fecha(h.siguiente.fin) : '—'}</td>
        <td>${h.actual ? chipDias(h.actual.diasRestantes) : ''}</td>
        ${ctx.puede('pagos.ver') ? html`<td>${h.actual ? chipPagos(h.actual.pagos) : ''}</td>` : ''}
        <td class="der num">${euros(h.actual?.renta ?? h.siguiente?.renta ?? h.precio)}<span class="sec">${h.actual || h.siguiente ? '+ ' + euros(h.actual?.servicios ?? h.siguiente?.servicios) + ' serv.' : 'publicado'}</span></td></tr>`)}</tbody>
    </table></div>${lista.length ? '' : html`<p class="vacio">No hay habitaciones con este filtro.</p>`}</section>`);

  activarFilas(el);
  $('#f-inm', el).onchange = (e) => { location.hash = '#/habitaciones?estado=' + filtro + (e.target.value ? '&inmueble=' + e.target.value : ''); };
  $('#buscar', el).oninput = (e) => {
    const q = e.target.value.trim().toLowerCase();
    for (const f of el.querySelectorAll('#filas tr')) f.classList.toggle('oculto', !!q && !f.dataset.texto.includes(q));
  };
}

export async function vistaHabitacion(el, { params, ctx, recargar }) {
  const d = await get('/api/habitaciones/' + params[0]);
  const h = d.habitacion;
  const verInq = ctx.puede('inquilinos.ver'), editar = ctx.puede('habitaciones.editar'), editarContrato = ctx.puede('contratos.editar');
  const a = h.actual, s = h.siguiente;

  montar(el, html`
    <a class="miga" href="#/inmuebles/${h.inmueble.id}">← ${h.inmueble.codigo} · ${h.inmueble.nombre}</a>
    <div class="cabecera"><div><h1>${h.inmueble.codigo} · Habitación ${h.codigo}</h1><p>${chipHab(h.estado)} ${TIPOS_HAB[h.tipo] || ''}${h.m2 ? ' · ' + h.m2 + ' m²' : ''} · precio publicado ${euros(h.precio)}/mes</p>${h.caracteristicas ? html`<div class="filtros mt">${h.caracteristicas.split(',').map((c) => html`<span class="chip">${c.trim()}</span>`)}</div>` : ''}</div>
      <div class="acciones">
        ${ctx.puede('mantenimientos.editar') ? html`<button class="boton" id="n-mant">Registrar mantenimiento</button>` : ''}
        ${editar ? html`<button class="boton" id="bloqueo">${h.bloqueo ? 'Quitar bloqueo' : 'Bloquear (mantenimiento)'}</button><button class="boton" id="editar-h">Editar</button>` : ''}
        ${editarContrato ? html`<button class="boton primario" id="n-contrato">Nuevo contrato</button>` : ''}
      </div></div>

    <div class="rejilla r-2">
      <section class="tarjeta"><header><h2>Contrato actual</h2>${a && editarContrato ? html`<button class="boton mini" data-editar="${a.id}">Editar / finalizar</button>` : ''}</header>
        ${a ? html`<dl class="ficha">
          ${verInq ? html`<dt>Inquilino</dt><dd>${a.inquilino}</dd>` : ''}
          <dt>Inicio</dt><dd>${fecha(a.inicio)}</dd><dt>Fin</dt><dd>${fecha(a.fin)} ${chipDias(a.diasRestantes)}</dd>
          <dt>Renta</dt><dd>${euros(a.renta)}/mes${a.servicios ? html` + ${euros(a.servicios)} servicios` : ''}</dd>
          ${a.codigo ? html`<dt>Contrato</dt><dd><a href="#/contratos/${a.id}">${a.codigo}</a>${a.esRenovacion ? ' · renovación' : ''}</dd>` : ''}
          ${a.renovacion ? html`<dt>Renovación</dt><dd>${chipRenovacion(a.renovacion)}</dd>` : ''}</dl>`
          : html`<p class="suave">Sin contrato en vigor.${h.precio ? ' Precio de referencia: ' + euros(h.precio) + '/mes.' : ''}</p>`}
      </section>
      <section class="tarjeta"><header><h2>Siguiente contrato</h2></header>
        ${s ? html`<dl class="ficha">${verInq ? html`<dt>Inquilino</dt><dd>${s.inquilino}</dd>` : ''}<dt>Entrada</dt><dd>${fecha(s.inicio)}</dd><dt>Fin</dt><dd>${fecha(s.fin)}</dd><dt>Renta</dt><dd>${euros(s.renta)}/mes</dd></dl>`
          : html`<p class="suave">${a ? 'Todavía no hay nadie reservado para cuando quede libre.' : 'No hay reservas.'}</p>`}
      </section>
    </div>

    <section class="tarjeta mt"><header><h2>Historial de contratos</h2></header>
      ${d.contratos.length ? html`<div class="tabla-env"><table><thead><tr>${verInq ? html`<th>Inquilino</th>` : ''}<th>Estado</th><th>Inicio</th><th>Fin</th><th class="der">Renta</th><th class="der">Fianza</th><th class="ocultar-movil">Origen</th><th></th></tr></thead>
        <tbody>${d.contratos.map((c) => html`<tr>${verInq ? html`<td>${c.inquilino || '—'}${c.email ? html`<span class="sec">${c.email}${c.telefono ? ' · ' + c.telefono : ''}</span>` : ''}</td>` : ''}
          <td>${chipContrato(c.estado)}${c.codigo ? html`<span class="sec"><a href="#/contratos/${c.id}">${c.codigo}</a></span>` : ''}</td><td class="num">${fecha(c.inicio)}</td><td class="num">${fecha(c.fin)}</td><td class="der num">${euros(c.renta)}</td><td class="der num">${euros(c.fianza)}</td>
          <td class="ocultar-movil suave pequeno">${c.origen === 'homming_csv' || c.origen === 'homming' ? 'Homming' : c.origen === 'demo' ? 'Demo' : 'Manual'}</td>
          <td class="der">${editarContrato ? html`<button class="enlace pequeno" data-editar="${c.id}">Editar</button>` : ''}</td></tr>`)}</tbody></table></div>`
        : html`<p class="suave">Sin contratos.</p>`}
    </section>

    ${d.pagos ? html`<section class="tarjeta mt"><header><div><h2>Historial de pagos</h2><p>Recibos de todos los contratos de esta habitación</p></div></header>
      ${d.pagos.length ? html`<div class="tabla-env"><table><thead><tr><th>Mes</th><th>Concepto</th>${verInq ? html`<th>Inquilino</th>` : ''}<th class="der">Importe</th><th>Vence</th><th>Estado</th><th>Cobrado el</th></tr></thead>
        <tbody>${d.pagos.map((p) => html`<tr><td>${mesLargo(p.periodo)}</td><td>${p.concepto}</td>${verInq ? html`<td>${p.inquilino || '—'}</td>` : ''}<td class="der num">${euros(p.importe, true)}${p.estado === 'parcial' ? html`<span class="sec">cobrado ${euros(p.cobrado, true)}</span>` : ''}</td><td class="num">${fecha(p.vence)}</td><td>${chipPago(p.estado)}</td><td class="num">${fecha(p.pagado_el)}</td></tr>`)}</tbody></table></div>`
        : html`<p class="suave">Sin recibos.</p>`}</section>` : ''}

    <section class="tarjeta mt"><header><h2>Incidencias y mantenimientos</h2></header>
      ${d.mantenimientos.length ? html`<div class="tabla-env"><table><thead><tr><th>Fecha</th><th>Trabajo</th><th>Proveedor</th><th>Estado</th>${d.pagos ? html`<th class="der">Coste</th>` : ''}</tr></thead>
        <tbody>${d.mantenimientos.map((m) => html`<tr><td class="num">${fecha(m.fecha)}</td><td>${m.descripcion}</td><td>${m.proveedor || '—'}</td><td>${chipMant(m.estado)}</td>${d.pagos ? html`<td class="der num">${euros(m.coste)}</td>` : ''}</tr>`)}</tbody></table></div>`
        : html`<p class="suave">Sin mantenimientos en esta habitación.</p>`}</section>`);

  $('#n-mant', el)?.addEventListener('click', () => nuevoMantenimiento({ inmuebleId: h.inmueble.id, habitacionId: h.id }, recargar));
  $('#bloqueo', el)?.addEventListener('click', async () => { await put('/api/habitaciones/' + h.id, { bloqueo: h.bloqueo ? null : 'mantenimiento' }); aviso('Estado actualizado'); recargar(); });
  $('#editar-h', el)?.addEventListener('click', () => formulario({
    titulo: 'Editar habitación', campos: [{ nombre: 'codigo', etiqueta: 'Código', req: true, valor: h.codigo }, { nombre: 'nombre', etiqueta: 'Nombre', valor: h.nombre },
      { nombre: 'precio', etiqueta: 'Precio de referencia (€/mes)', tipo: 'number', paso: '0.01', valor: h.precio / 100 },
      { nombre: 'activo', etiqueta: 'Habitación activa', tipo: 'checkbox', valor: true, ancho: true }],
    enviar: async (x) => { await put('/api/habitaciones/' + h.id, x); aviso('Habitación guardada'); recargar(); }
  }));
  $('#n-contrato', el)?.addEventListener('click', () => formulario({
    titulo: 'Nuevo contrato · ' + h.inmueble.codigo + ' ' + h.codigo,
    descripcion: 'Si gestionáis los contratos en Homming, es mejor crearlo allí y sincronizar/importar.',
    campos: [
      { nombre: 'inquilino', etiqueta: 'Inquilino', req: true, ancho: true }, { nombre: 'email', etiqueta: 'Correo', tipo: 'email' }, { nombre: 'telefono', etiqueta: 'Teléfono' },
      { nombre: 'inicio', etiqueta: 'Inicio', tipo: 'date', req: true, valor: a?.fin && a.fin >= hoy() ? a.fin : hoy() }, { nombre: 'fin', etiqueta: 'Fin', tipo: 'date' },
      { nombre: 'renta', etiqueta: 'Renta (€/mes)', tipo: 'number', paso: '0.01', req: true, valor: h.precio / 100 || '' }, { nombre: 'servicios', etiqueta: 'Servicios (€/mes)', tipo: 'number', paso: '0.01', valor: 50 },
      { nombre: 'fianza', etiqueta: 'Fianza (€)', tipo: 'number', paso: '0.01' },
      { nombre: 'estado', etiqueta: 'Estado', tipo: 'select', vacio: false, opciones: [['activo', 'En vigor'], ['reservado', 'Reservado (aún no ha entrado)']], valor: 'activo' }
    ],
    enviar: async (x) => { await post('/api/contratos', { ...x, habitacion_id: h.id }); aviso('Contrato creado'); recargar(); }
  }));
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-editar]'); if (!b) return;
    const c = d.contratos.find((x) => String(x.id) === b.dataset.editar);
    formulario({
      titulo: 'Editar contrato', descripcion: 'Para registrar una salida anticipada, elige «Rescindido» y pon la fecha real de salida como fin.',
      campos: [
        { nombre: 'estado', etiqueta: 'Estado', tipo: 'select', vacio: false, valor: c.estado, opciones: [['activo', 'En vigor'], ['reservado', 'Reservado'], ['finalizado', 'Finalizado'], ['rescindido', 'Rescindido (salida anticipada)']] },
        { nombre: 'inicio', etiqueta: 'Inicio', tipo: 'date', req: true, valor: c.inicio }, { nombre: 'fin', etiqueta: 'Fin', tipo: 'date', valor: c.fin },
        { nombre: 'renta', etiqueta: 'Renta (€/mes)', tipo: 'number', paso: '0.01', valor: c.renta / 100 }, { nombre: 'servicios', etiqueta: 'Servicios (€/mes)', tipo: 'number', paso: '0.01', valor: c.servicios / 100 },
        { nombre: 'fianza', etiqueta: 'Fianza (€)', tipo: 'number', paso: '0.01', valor: c.fianza / 100 },
        { nombre: 'renovacion', etiqueta: '¿Renueva?', tipo: 'select', vacio: 'Sin respuesta', valor: c.renovacion, opciones: [['solicitada', 'Quiere renovar'], ['en_negociacion', 'En negociación'], ['no_renueva', 'No renueva']] }
      ],
      enviar: async (x) => { await put('/api/contratos/' + c.id, x); aviso('Contrato actualizado'); recargar(); }
    });
  });
}
