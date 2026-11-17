/* ==========================================================================
   vistas/incidencias.js — TABLERO DE INCIDENCIAS DEL EQUIPO
   · Tablero por columnas (Nueva → En curso → Esperando → Resuelta). Se puede
     arrastrar una tarjeta de una columna a otra (en el móvil, con el botón).
   · Filtros: todas, mías, sin asignar, urgentes, por piso y búsqueda.
   · Ficha: datos, historial de cambios, comentarios del equipo, fotos y coste.
   ========================================================================== */
import { html, montar, $, $$, euros, fecha, fechaHora, formulario, aviso, hoy, icono } from '../ui.js';
import { get, post, put, subir } from '../api.js';

const COLUMNAS = ['nueva', 'en_curso', 'esperando', 'resuelta'];
const C_PRIORIDAD = { urgente: 'critico', alta: 'serio', media: 'aviso', baja: 'neutro' };
const ZONAS = ['Cocina', 'Baño', 'Salón', 'Entrada', 'Galería', 'Pasillo', 'Terraza', 'Fachada / comunidad'];
const iniciales = (n) => (n ? n.split(' ').map((x) => x[0]).slice(0, 2).join('').toUpperCase() : '?');
const diasDesde = (f) => Math.max(0, Math.round((Date.now() - Date.parse(f.replace(' ', 'T') + 'Z')) / 86400000));

export async function vistaIncidencias(el, { query, ctx, recargar }) {
  let filtro = ['mias', 'sin', 'urgentes'].includes(query.get('filtro')) ? query.get('filtro') : 'todas';
  let inmueble = query.get('inmueble') || '', texto = '', vista = 'tablero';
  const editar = ctx.puede('incidencias.editar');
  const [d, catalogo] = await Promise.all([get('/api/incidencias'), get('/api/catalogo')]);
  const r = d.resumen;

  montar(el, html`
    <div class="cabecera"><div><h1>Incidencias</h1><p>Tablero compartido del equipo · ${r.n || 0} abiertas${r.diasMedios != null ? ' · se resuelven en ' + String(r.diasMedios).replace('.', ',') + ' días de media' : ''}</p></div>
      <div class="acciones">${editar ? html`<button class="boton primario" id="nueva">${icono('mas')}Nueva incidencia</button>` : ''}</div></div>
    <div class="cifras">
      <button class="cifra boton-cifra" data-f="mias"><span class="etq">Asignadas a mí</span><span class="valor">${r.mias || 0}</span><span class="sub">abiertas</span></button>
      <button class="cifra boton-cifra" data-f="sin"><span class="etq">Sin asignar</span><span class="valor">${r.sinAsignar || 0}</span><span class="sub">nadie se ha hecho cargo</span></button>
      <button class="cifra boton-cifra ${r.urgentes ? 'destacada' : ''}" data-f="urgentes"><span class="etq">Urgentes</span><span class="valor">${r.urgentes || 0}</span><span class="sub">abiertas</span></button>
      <button class="cifra boton-cifra" data-f="todas"><span class="etq">Abiertas en total</span><span class="valor">${r.n || 0}</span><span class="sub">de todo el equipo</span></button>
    </div>
    <div class="filtros mt">
      <div class="segmentos" role="group" aria-label="Filtro">${[['todas', 'Todas'], ['mias', 'Mías'], ['sin', 'Sin asignar'], ['urgentes', 'Urgentes']].map(([k, t]) => html`<button type="button" data-f="${k}" aria-pressed="${filtro === k}">${t}</button>`)}</div>
      <select id="f-inm" aria-label="Piso"><option value="">Todos los pisos</option>${catalogo.inmuebles.map((i) => html`<option value="${i.id}"${String(i.id) === inmueble ? html` selected` : ''}>${i.codigo}</option>`)}</select>
      <input type="search" id="buscar" placeholder="Buscar título, piso, código…">
      <div class="segmentos" role="group" aria-label="Vista"><button type="button" data-v="tablero" aria-pressed="true">Tablero</button><button type="button" data-v="lista" aria-pressed="false">Lista</button></div>
    </div>
    <div id="contenedor"></div>`);

  const visibles = () => d.incidencias.filter((n) =>
    (filtro !== 'mias' || n.asignado_a === ctx.usuario.id) && (filtro !== 'sin' || !n.asignado_a) && (filtro !== 'urgentes' || n.prioridad === 'urgente') &&
    (!inmueble || String(n.inmueble_id) === inmueble) &&
    (!texto || [n.codigo, n.titulo, n.inmueble, n.habitacion, n.asignado, n.descripcion].join(' ').toLowerCase().includes(texto)));

  const tarjeta = (n) => html`<article class="inc ${n.estado === 'resuelta' ? 'resuelta' : ''}" data-id="${n.id}" draggable="${editar}" tabindex="0" aria-label="${n.codigo} ${n.titulo}">
    <div class="fila-c"><span class="pequeno suave">${n.codigo}</span><span class="chip ${C_PRIORIDAD[n.prioridad]}">${d.prioridades[n.prioridad]}</span></div>
    <b>${n.titulo}</b>
    <span class="pequeno">${n.inmueble}${n.habitacion ? ' · ' + n.habitacion : n.zona ? ' · ' + n.zona : ''} · ${d.categorias[n.categoria]}</span>
    <div class="fila-c"><span class="persona" title="${n.asignado || 'Sin asignar'}">${n.asignado ? html`<i>${iniciales(n.asignado)}</i>${n.asignado.split(' ')[0]}` : html`<i class="vacia">?</i><span class="suave">Sin asignar</span>`}</span>
      <span class="pequeno suave">${n.comentarios ? '💬 ' + n.comentarios + ' ' : ''}${n.adjuntos ? '📎 ' + n.adjuntos + ' ' : ''}${n.estado === 'resuelta' ? '✓' : diasDesde(n.creado) + ' d'}</span></div>
    ${n.fecha_limite && n.estado !== 'resuelta' && n.fecha_limite < hoy() ? html`<span class="chip critico">Fuera de plazo (${fecha(n.fecha_limite)})</span>` : ''}
  </article>`;

  const pintar = () => {
    const lista = visibles();
    const cont = $('#contenedor', el);
    if (vista === 'tablero') {
      montar(cont, html`<div class="tablero">${COLUMNAS.map((c) => { const items = lista.filter((n) => n.estado === c); return html`<section class="columna" data-col="${c}">
        <header><h2>${d.estados[c].split(' (')[0]}</h2><span class="cuenta">${items.length}</span></header>
        ${c === 'resuelta' ? html`<p class="pequeno suave">Últimos 30 días</p>` : ''}
        <div class="tarjetas">${(c === 'resuelta' ? items.slice(0, 8) : items).map(tarjeta)}${items.length ? '' : html`<p class="vacio pequeno">${c === 'nueva' ? 'Nada nuevo' : 'Vacío'}</p>`}
          ${c === 'resuelta' && items.length > 8 ? html`<button type="button" class="enlace pequeno" data-v="lista">Ver las ${items.length} resueltas en la lista</button>` : ''}</div></section>`; })}</div>`);
    } else {
      montar(cont, html`<section class="tarjeta"><div class="tabla-env"><table><thead><tr><th>Código</th><th>Incidencia</th><th>Piso</th><th>Prioridad</th><th>Estado</th><th>Asignada a</th><th>Abierta</th></tr></thead>
        <tbody>${lista.map((n) => html`<tr class="clic" data-id="${n.id}"><td>${n.codigo}</td><td><b>${n.titulo}</b><span class="sec">${d.categorias[n.categoria]}${n.reportado_por ? ' · ' + n.reportado_por : ''}</span></td>
          <td>${n.inmueble}${n.habitacion ? ' · ' + n.habitacion : ''}</td><td><span class="chip ${C_PRIORIDAD[n.prioridad]}">${d.prioridades[n.prioridad]}</span></td>
          <td>${d.estados[n.estado].split(' (')[0]}</td><td>${n.asignado || html`<span class="suave">Sin asignar</span>`}</td><td class="num">${fecha(n.creado)}</td></tr>`)}</tbody></table></div>
        ${lista.length ? '' : html`<p class="vacio">No hay incidencias con este filtro.</p>`}</section>`);
    }
    // Arrastrar tarjetas entre columnas
    if (vista === 'tablero' && editar) {
      for (const t of $$('.inc', cont)) t.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', t.dataset.id); t.classList.add('arrastrando'); });
      for (const t of $$('.inc', cont)) t.addEventListener('dragend', () => t.classList.remove('arrastrando'));
      for (const col of $$('.columna', cont)) {
        col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('soltar'); });
        col.addEventListener('dragleave', () => col.classList.remove('soltar'));
        col.addEventListener('drop', async (e) => {
          e.preventDefault(); col.classList.remove('soltar');
          const n = d.incidencias.find((x) => String(x.id) === e.dataTransfer.getData('text/plain'));
          if (!n || n.estado === col.dataset.col) return;
          try { await put('/api/incidencias/' + n.id, { estado: col.dataset.col }); n.estado = col.dataset.col; aviso(n.codigo + ' → ' + d.estados[n.estado].split(' (')[0]); pintar(); }
          catch (ex) { aviso(ex.message, 'error'); }
        });
      }
    }
  };
  pintar();

  el.addEventListener('click', (e) => {
    const f = e.target.closest('[data-f]'); if (f) { filtro = f.dataset.f; $$('.segmentos [data-f]', el).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.f === filtro))); pintar(); return; }
    const v = e.target.closest('[data-v]'); if (v) { vista = v.dataset.v; $$('[data-v]', el).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === vista))); pintar(); return; }
    const t = e.target.closest('[data-id]'); if (t) abrirIncidencia(Number(t.dataset.id), { d, catalogo, ctx, recargar });
  });
  el.addEventListener('keydown', (e) => { const t = e.target.closest('.inc'); if (t && e.key === 'Enter') abrirIncidencia(Number(t.dataset.id), { d, catalogo, ctx, recargar }); });
  $('#f-inm', el).onchange = (e) => { inmueble = e.target.value; pintar(); };
  $('#buscar', el).oninput = (e) => { texto = e.target.value.trim().toLowerCase(); pintar(); };
  $('#nueva', el)?.addEventListener('click', () => nuevaIncidencia({ catalogo, d, ctx }, recargar));
  if (query.get('abrir')) abrirIncidencia(Number(query.get('abrir')), { d, catalogo, ctx, recargar });
}

export async function nuevaIncidencia({ catalogo, d, ctx, inmuebleId, habitacionId }, alGuardar) {
  if (!d) d = await get('/api/incidencias');
  if (!catalogo) catalogo = await get('/api/catalogo');
  const inm = catalogo.inmuebles.find((i) => i.id === Number(inmuebleId));
  formulario({
    titulo: 'Nueva incidencia', descripcion: 'La verá todo el equipo con acceso a Incidencias.',
    campos: [
      { nombre: 'titulo', etiqueta: 'Qué pasa', req: true, ancho: true, placeholder: 'Ej.: No sale agua caliente en el baño' },
      { nombre: 'inmueble_id', etiqueta: 'Piso', tipo: 'select', req: true, valor: inmuebleId, opciones: catalogo.inmuebles.map((i) => [i.id, i.codigo + ' · ' + i.nombre]) },
      { nombre: 'habitacion_id', etiqueta: 'Habitación', tipo: 'select', vacio: 'Zona común / todo el piso', valor: habitacionId, opciones: (inm?.habitaciones || []).map((h) => [h.id, h.codigo]) },
      { nombre: 'zona', etiqueta: 'Zona común', tipo: 'select', vacio: '—', opciones: ZONAS.map((z) => [z, z]) },
      { nombre: 'categoria', etiqueta: 'Categoría', tipo: 'select', req: true, opciones: Object.entries(d.categorias) },
      { nombre: 'prioridad', etiqueta: 'Prioridad', tipo: 'select', vacio: false, valor: 'media', opciones: Object.entries(d.prioridades) },
      { nombre: 'asignado_a', etiqueta: 'Asignar a', tipo: 'select', vacio: 'Sin asignar', valor: '', opciones: d.equipo.map((u) => [u.id, u.nombre + (u.id === ctx.usuario.id ? ' (yo)' : '')]) },
      { nombre: 'origen', etiqueta: 'Quién avisa', tipo: 'select', vacio: false, valor: 'inquilino', opciones: Object.entries(d.origenes) },
      { nombre: 'reportado_por', etiqueta: 'Detalle de quién avisa', placeholder: 'Ej.: inquilina de H3, por WhatsApp' },
      { nombre: 'fecha_limite', etiqueta: 'Resolver antes de', tipo: 'date' },
      { nombre: 'descripcion', etiqueta: 'Descripción', tipo: 'textarea' },
      { nombre: 'foto', etiqueta: 'Foto (opcional)', tipo: 'file', accept: '.jpg,.jpeg,.png,.webp,.pdf', ancho: true }
    ],
    alCambiar: (e, form) => {
      if (e.target.name !== 'inmueble_id') return;
      const i = catalogo.inmuebles.find((x) => String(x.id) === e.target.value);
      form.elements.habitacion_id.replaceChildren(new Option('Zona común / todo el piso', ''), ...(i?.habitaciones || []).map((h) => new Option(h.codigo, h.id)));
    },
    enviar: async (x) => {
      const { foto, ...datos } = x;
      const r = await post('/api/incidencias', datos);
      if (foto) await subir('/api/documentos?entidad=incidencia&id=' + r.id + '&nombre=' + encodeURIComponent(foto.name), foto);
      aviso('Incidencia creada'); alGuardar?.();
    }
  });
}

async function abrirIncidencia(id, { d, ctx, recargar }) {
  const editar = ctx.puede('incidencias.editar');
  const det = await get('/api/incidencias/' + id);
  const n = det.incidencia;
  const dlg = document.createElement('dialog');
  dlg.className = 'ancho-doc';
  montar(dlg, html`<div class="d-cab"><div><span class="pequeno suave">${n.codigo} · abierta el ${fechaHora(n.creado)} por ${n.creador || '—'}</span><h2>${n.titulo}</h2></div><button type="button" class="cerrar" aria-label="Cerrar">×</button></div>
    <div class="d-cuerpo"><div class="rejilla r-2-1">
      <div class="pila">
        <dl class="ficha">
          <dt>Piso</dt><dd><a href="#/inmuebles/${n.inmueble_id}">${n.inmueble} · ${n.inmueble_nombre}</a></dd>
          <dt>Dónde</dt><dd>${n.habitacion ? html`<a href="#/habitaciones/${n.habitacion_id}">Habitación ${n.habitacion}</a>` : n.zona || 'Zona común'}</dd>
          <dt>Categoría</dt><dd>${d.categorias[n.categoria]}</dd>
          <dt>Avisa</dt><dd>${d.origenes[n.origen] || n.origen}${n.reportado_por ? ' · ' + n.reportado_por : ''}</dd>
          ${n.fecha_limite ? html`<dt>Resolver antes de</dt><dd>${fecha(n.fecha_limite)}</dd>` : ''}
          ${n.resuelta_el ? html`<dt>Resuelta</dt><dd>${fechaHora(n.resuelta_el)}</dd>` : ''}
          ${n.mantenimiento_id ? html`<dt>Coste</dt><dd>${n.coste ? euros(n.coste, true) + ' · cuenta en los gastos del piso · ' : 'Aún sin factura · '}<a href="#/mantenimientos">ver mantenimiento</a></dd>` : ''}
        </dl>
        ${n.descripcion ? html`<p>${n.descripcion}</p>` : ''}
        ${det.adjuntos.length ? html`<div><span class="pequeno suave">Adjuntos</span><ul>${det.adjuntos.map((a) => html`<li><a href="/api/documentos/${a.id}">${a.nombre}</a></li>`)}</ul></div>` : ''}
        <h3>Historial y comentarios</h3>
        <ul class="hilo">${det.eventos.map((e) => html`<li class="${e.tipo}"><span class="persona"><i>${iniciales(e.usuario)}</i></span><div><b>${e.usuario || 'Sistema'}</b> <span class="pequeno suave">${fechaHora(e.creado)}</span><p>${e.texto}</p></div></li>`)}</ul>
        ${editar ? html`<form id="f-com" class="pila"><textarea name="texto" placeholder="Escribe un comentario para el equipo…" required maxlength="2000"></textarea><div class="filtros"><button class="boton primario" type="submit">Comentar</button><label class="pequeno">Adjuntar foto <input type="file" id="adj" accept=".jpg,.jpeg,.png,.webp,.pdf"></label></div></form>` : ''}
      </div>
      <aside class="pila">
        ${editar ? html`<form id="f-est" class="pila tarjeta">
          <label class="campo"><span>Estado</span><select name="estado">${Object.entries(d.estados).map(([k, t]) => html`<option value="${k}"${k === n.estado ? html` selected` : ''}>${t}</option>`)}</select></label>
          <label class="campo"><span>Asignada a</span><select name="asignado_a"><option value="">Sin asignar</option>${d.equipo.map((u) => html`<option value="${u.id}"${u.id === n.asignado_a ? html` selected` : ''}>${u.nombre}</option>`)}</select></label>
          <label class="campo"><span>Prioridad</span><select name="prioridad">${Object.entries(d.prioridades).map(([k, t]) => html`<option value="${k}"${k === n.prioridad ? html` selected` : ''}>${t}</option>`)}</select></label>
          <label class="campo"><span>Resolver antes de</span><input type="date" name="fecha_limite" value="${n.fecha_limite || ''}"></label>
          <button class="boton primario" type="submit">Guardar cambios</button>
          ${n.asignado_a !== ctx.usuario.id ? html`<button class="boton" type="button" id="mia">Me la quedo yo</button>` : ''}
        </form>` : html`<div class="tarjeta"><dl class="ficha"><dt>Estado</dt><dd>${d.estados[n.estado]}</dd><dt>Asignada</dt><dd>${n.asignado || 'Sin asignar'}</dd><dt>Prioridad</dt><dd>${d.prioridades[n.prioridad]}</dd></dl></div>`}
        ${editar && ctx.puede('mantenimientos.editar') ? html`<button class="boton" type="button" id="coste">${n.mantenimiento_id ? 'Cambiar coste' : 'Registrar coste (factura)'}</button>` : ''}
      </aside>
    </div></div>`);
  document.body.append(dlg);
  const cerrar = () => { dlg.close(); dlg.remove(); };
  $('.cerrar', dlg).onclick = cerrar;
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); cerrar(); });
  dlg.addEventListener('click', (e) => { if (e.target.closest('a[href^="#/"]')) cerrar(); });
  const volver = () => { cerrar(); recargar(); };
  $('#f-est', dlg)?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    try { await put('/api/incidencias/' + n.id, { estado: f.estado.value, asignado_a: f.asignado_a.value ? Number(f.asignado_a.value) : null, prioridad: f.prioridad.value, fecha_limite: f.fecha_limite.value || null }); aviso('Incidencia actualizada'); volver(); }
    catch (ex) { aviso(ex.message, 'error'); }
  });
  $('#mia', dlg)?.addEventListener('click', async () => { await put('/api/incidencias/' + n.id, { asignado_a: ctx.usuario.id }); aviso('Ahora la tienes tú'); volver(); });
  $('#f-com', dlg)?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await post('/api/incidencias/' + n.id + '/comentarios', { texto: e.target.texto.value });
      const a = $('#adj', dlg).files[0];
      if (a) await subir('/api/documentos?entidad=incidencia&id=' + n.id + '&nombre=' + encodeURIComponent(a.name), a);
      aviso('Comentario añadido'); cerrar(); abrirIncidencia(n.id, { d, ctx, recargar });
    } catch (ex) { aviso(ex.message, 'error'); }
  });
  $('#coste', dlg)?.addEventListener('click', () => formulario({
    titulo: 'Coste de ' + n.codigo, descripcion: 'Se guarda como mantenimiento del piso ' + n.inmueble + ' y se suma a sus gastos y a su rentabilidad.',
    campos: [{ nombre: 'coste', etiqueta: 'Importe (€, IVA incluido)', tipo: 'number', paso: '0.01', min: 0, req: true, valor: n.coste != null ? (n.coste / 100).toFixed(2) : '' },
      { nombre: 'proveedor', etiqueta: 'Proveedor' }, { nombre: 'fecha', etiqueta: 'Fecha de la factura', tipo: 'date', req: true, valor: hoy() },
      { nombre: 'categoria', etiqueta: 'Tipo de gasto', tipo: 'select', vacio: false, opciones: [['reparaciones', 'Reparación'], ['mantenimiento', 'Mantenimiento']] }],
    enviar: async (x) => { await post('/api/incidencias/' + n.id + '/coste', x); aviso('Coste registrado'); volver(); }
  }));
  dlg.showModal();
}
