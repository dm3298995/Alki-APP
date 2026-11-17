/* ==========================================================================
   vistas/contratos.js — CONTRATOS: HISTORIAL, RENOVACIONES Y DOCUMENTOS
   · Lista con pestañas (activos, por finalizar, pendientes de renovación,
     próximos inicios, renovados, finalizados).
   · Ficha del contrato con línea de tiempo de la habitación y un DOCUMENTO
     DE EJEMPLO generado con los datos (sin validez legal).
   ========================================================================== */
import { html, montar, $, euros, fecha, chipContrato, chipDias, chipRenovacion, chipPago, pestanas, formulario, aviso, mesLargo, TIPOS_HAB } from '../ui.js';
import { get, post } from '../api.js';
import { activarFilas } from './panel.js';

const VISTAS = [
  ['activos', 'En vigor'], ['por_finalizar', 'Terminan en ≤ 60 días'], ['renovacion', 'Pendientes de renovación'],
  ['proximos', 'Próximos inicios'], ['renovados', 'Renovaciones'], ['finalizados', 'Finalizados'], ['todos', 'Todos']
];

export async function vistaContratos(el, { query, ctx }) {
  const vista = VISTAS.some(([k]) => k === query.get('vista')) ? query.get('vista') : 'activos';
  const d = await get('/api/contratos?vista=' + vista);
  const verInq = ctx.puede('inquilinos.ver');
  const anios = Object.entries(d.porAnio).sort();
  montar(el, html`
    <div class="cabecera"><div><h1>Contratos</h1><p>${d.cuentas.todos} contratos desde ${anios[0]?.[0] || '—'} · ${anios.map(([a, n]) => a + ': ' + n).join(' · ')}</p></div></div>
    ${pestanas(VISTAS.map(([k, t]) => [k, t, d.cuentas[k], '#/contratos?vista=' + k]), vista)}
    <section class="tarjeta"><header><div><h2>${VISTAS.find(([k]) => k === vista)[1]}</h2><p>${d.total} contratos${d.total > d.contratos.length ? ' (se muestran los ' + d.contratos.length + ' más recientes)' : ''}</p></div>
      <input type="search" id="buscar" placeholder="Buscar código, piso${verInq ? ' o inquilino' : ''}…"></header>
      <div class="tabla-env"><table>
        <thead><tr><th>Contrato</th><th>Inmueble · hab.</th>${verInq ? html`<th>Inquilino</th>` : ''}<th>Inicio</th><th>Fin</th><th class="der">Duración</th><th class="der">Renta</th><th class="der ocultar-movil">Fianza</th><th>Estado</th></tr></thead>
        <tbody id="filas">${d.contratos.map((c) => html`<tr class="clic" data-ir="#/contratos/${c.id}" data-texto="${[c.codigo, c.inmueble, c.habitacion, verInq ? c.inquilino : ''].join(' ').toLowerCase()}">
          <td><b>${c.codigo || '—'}</b>${c.esRenovacion ? html`<span class="sec">Renovación</span>` : ''}</td><td>${c.inmueble} · ${c.habitacion || 'piso completo'}</td>${verInq ? html`<td>${c.inquilino || '—'}</td>` : ''}
          <td class="num">${fecha(c.inicio)}</td><td class="num">${fecha(c.fin)}</td><td class="der num">${c.duracion ? c.duracion + ' meses' : '—'}</td>
          <td class="der num">${euros(c.renta)}</td><td class="der num ocultar-movil">${euros(c.fianza)}</td>
          <td>${estadoContrato(c)}</td></tr>`)}</tbody>
      </table></div>${d.contratos.length ? '' : html`<p class="vacio">No hay contratos en esta vista.</p>`}
    </section>`);
  activarFilas(el);
  $('#buscar', el).oninput = (e) => { const q = e.target.value.trim().toLowerCase(); for (const f of el.querySelectorAll('#filas tr')) f.classList.toggle('oculto', !!q && !f.dataset.texto.includes(q)); };
}

function estadoContrato(c) {
  const hoy = new Date().toISOString().slice(0, 10);
  if ((c.estado === 'activo' || c.estado === 'reservado') && c.inicio > hoy) return html`<span class="chip info">Empieza ${fecha(c.inicio)}</span>`;
  if (c.estado === 'activo' && c.diasRestantes != null && c.diasRestantes <= 60) return html`${chipDias(c.diasRestantes)}${c.renovacion ? html`<span class="sec">${chipRenovacion(c.renovacion)}</span>` : ''}`;
  if (c.renovado && c.estado !== 'activo') return html`<span class="chip ok">Renovado</span>`;
  return chipContrato(c.estado);
}

export async function vistaContrato(el, { params, ctx, recargar }) {
  const d = await get('/api/contratos/' + params[0]);
  const c = d.contrato;
  const verInq = ctx.puede('inquilinos.ver');
  const editar = ctx.puede('contratos.editar');
  const renovable = c.estado === 'activo' && d.cadena[d.cadena.length - 1] === c.id && c.fin;
  montar(el, html`
    <a class="miga" href="#/contratos">← Contratos</a>
    <div class="cabecera"><div><h1>Contrato ${c.codigo || '#' + c.id}</h1><p>${c.inmueble} · Habitación ${c.habitacion || '—'} · ${estadoContrato({ ...c, renovado: d.cadena.indexOf(c.id) < d.cadena.length - 1 })}</p></div>
      <div class="acciones"><button class="boton" id="ver-doc">Ver documento</button>${editar && renovable ? html`<button class="boton primario" id="renovar">Renovar contrato</button>` : ''}</div></div>
    <div class="rejilla r-2">
      <section class="tarjeta"><header><h2>Ficha del contrato</h2></header>
        <dl class="ficha">
          <dt>Identificador</dt><dd>${c.codigo || '—'}</dd><dt>Inmueble</dt><dd><a href="#/inmuebles/${c.inmueble_id}">${c.inmueble} · ${c.inmueble_nombre}</a></dd>
          <dt>Habitación</dt><dd>${c.habitacion_id ? html`<a href="#/habitaciones/${c.habitacion_id}">${c.habitacion}</a> · ${TIPOS_HAB[c.habitacion_tipo] || ''}${c.habitacion_m2 ? ' · ' + c.habitacion_m2 + ' m²' : ''}` : '—'}</dd>
          ${verInq ? html`<dt>Inquilino</dt><dd>${c.inquilino || '—'}${c.email ? html`<span class="sec">${c.email} · ${c.telefono || ''}</span>` : ''}</dd>` : ''}
          <dt>Firmado</dt><dd>${fecha(c.firmado)}</dd><dt>Inicio</dt><dd>${fecha(c.inicio)}</dd><dt>Fin</dt><dd>${fecha(c.fin)}${c.diasRestantes != null && c.diasRestantes >= 0 && c.estado === 'activo' ? html` · ${chipDias(c.diasRestantes)}` : ''}</dd>
          <dt>Duración</dt><dd>${c.duracion ? c.duracion + ' meses' : '—'}</dd>
          <dt>Renta</dt><dd>${euros(c.renta)}/mes + ${euros(c.servicios)} de servicios</dd><dt>Fianza</dt><dd>${euros(c.fianza)}</dd>
          <dt>Estado</dt><dd>${chipContrato(c.estado)}${c.renovacion ? html` ${chipRenovacion(c.renovacion)}` : ''}${c.renovacion_de ? html`<span class="sec">Es la renovación de un contrato anterior</span>` : ''}</dd>
        </dl>
      </section>
      <section class="tarjeta"><header><div><h2>Línea de tiempo de la habitación</h2><p>Todos sus contratos. En azul, las renovaciones de este inquilino.</p></div></header>
        <ul class="linea-tiempo">${d.linea.slice().reverse().map((x) => html`<li class="${x.enCadena ? 'cadena' : ''} ${x.actual ? 'actual' : ''}">
          <a href="#/contratos/${x.id}"><b>${x.codigo || '#' + x.id}</b></a> ${x.renovacion_de ? html`<span class="chip ok">Renovación</span>` : ''} ${chipContrato(x.estado)}
          <span class="sec">${fecha(x.inicio)} → ${fecha(x.fin)} · ${x.duracion || '—'} meses · ${euros(x.renta)}/mes${verInq && x.inquilino ? ' · ' + x.inquilino : ''}</span></li>`)}</ul>
      </section>
    </div>
    ${d.pagos ? html`<section class="tarjeta mt"><header><div><h2>Pagos de este contrato</h2><p>${d.pagos.recibos} recibos · ${d.pagos.conRetraso} pagados con retraso</p></div></header>
      <div class="cifras"><div class="cifra"><span class="etq">Cobrado</span><span class="valor">${euros(d.pagos.cobrado)}</span></div>
        <div class="cifra"><span class="etq">Pendiente</span><span class="valor">${euros(d.pagos.pendiente)}</span></div>
        <div class="cifra ${d.pagos.atrasado ? 'destacada' : ''}"><span class="etq">Atrasado</span><span class="valor">${euros(d.pagos.atrasado)}</span></div></div>
      <div class="tabla-env mt"><table><thead><tr><th>Mes</th><th>Concepto</th><th class="der">Importe</th><th>Vence</th><th>Estado</th><th>Cobrado el</th></tr></thead>
        <tbody>${d.pagos.ultimos.map((p) => html`<tr><td>${mesLargo(p.periodo)}</td><td>${p.concepto}</td><td class="der num">${euros(p.importe, true)}</td><td class="num">${fecha(p.vence)}</td><td>${chipPago(p.estado)}</td><td class="num">${fecha(p.pagado_el)}</td></tr>`)}</tbody></table></div>
    </section>` : ''}
    <section class="tarjeta mt"><header><div><h2>Documentos</h2><p>Gestión documental del contrato</p></div></header>
      <ul class="actividad">
        <li class="t-contrato"><span class="p"></span><span>Contrato de arrendamiento de habitación · ${c.codigo} <button class="enlace pequeno" data-doc="contrato">Ver</button></span><time>${fecha(c.firmado)}</time></li>
        <li class="t-contrato"><span class="p"></span><span>Anexo I · Normas de convivencia <button class="enlace pequeno" data-doc="normas">Ver</button></span><time>${fecha(c.firmado)}</time></li>
        <li class="t-contrato"><span class="p"></span><span>Anexo II · Inventario de entrada de la habitación <button class="enlace pequeno" data-doc="inventario">Ver</button></span><time>${fecha(c.inicio)}</time></li>
        ${d.documentos.map((x) => html`<li class="t-pago"><span class="p"></span><span><a href="/api/documentos/${x.id}">${x.nombre}</a></span><time>${fecha(x.creado)}</time></li>`)}
      </ul></section>`);

  const abrir = (tipo) => documento(c, tipo, verInq);
  $('#ver-doc', el).onclick = () => abrir('contrato');
  el.addEventListener('click', (e) => { const b = e.target.closest('[data-doc]'); if (b) abrir(b.dataset.doc); });
  $('#renovar', el)?.addEventListener('click', () => {
    const inicio = new Date(Date.parse(c.fin + 'T12:00:00Z') + 86400000).toISOString().slice(0, 10);
    const fin = new Date(Date.parse(inicio + 'T12:00:00Z')); fin.setUTCFullYear(fin.getUTCFullYear() + 1); fin.setUTCDate(fin.getUTCDate() - 1);
    formulario({ titulo: 'Renovar ' + c.codigo, descripcion: 'Se crea un contrato nuevo enlazado a este, que empieza al día siguiente de terminar.',
      campos: [{ nombre: 'inicio', etiqueta: 'Inicio', tipo: 'date', req: true, valor: inicio }, { nombre: 'fin', etiqueta: 'Fin', tipo: 'date', req: true, valor: fin.toISOString().slice(0, 10) },
        { nombre: 'renta', etiqueta: 'Renta (€/mes)', tipo: 'number', paso: '0.01', req: true, valor: (Math.round(c.renta * 1.03 / 500) * 5).toFixed(2), ayuda: 'Propuesta: +3 % redondeado.' }],
      boton: 'Renovar', enviar: async (x) => { const r = await post('/api/contratos/' + c.id + '/renovar', x); aviso('Contrato renovado'); location.hash = '#/contratos/' + r.id; } });
  });
}

// ---------- Documento de ejemplo (sin validez legal) ----------
function documento(c, tipo, verInq) {
  const d = document.createElement('dialog');
  d.className = 'ancho-doc';
  const inq = verInq && c.inquilino ? c.inquilino : '[Nombre del inquilino]';
  const cuerpo = {
    contrato: html`<h3>CONTRATO DE ARRENDAMIENTO DE HABITACIÓN</h3><div class="ref">Ref. ${c.codigo} · València, ${fecha(c.firmado)}</div>
      <p><b>REUNIDOS.</b> De una parte, ALKI (en adelante, «la gestora»), que actúa como arrendataria principal y gestora de la vivienda situada en ${c.direccion || c.inmueble_nombre}. De otra parte, <b>${inq}</b> (en adelante, «el residente»).</p>
      <p><b>PRIMERA · Objeto.</b> La gestora cede al residente el uso de la habitación <b>${c.habitacion}</b> (${TIPOS_HAB[c.habitacion_tipo] || 'habitación'}${c.habitacion_m2 ? ', ' + c.habitacion_m2 + ' m²' : ''}${c.caracteristicas ? ': ' + c.caracteristicas.toLowerCase() : ''}) y el uso compartido de cocina, baños y salón.</p>
      <p><b>SEGUNDA · Duración.</b> Desde el ${fecha(c.inicio)} hasta el ${fecha(c.fin)} (${c.duracion} meses), sin prórroga automática.${c.renovacion_de ? ' Este contrato renueva uno anterior entre las mismas partes.' : ''}</p>
      <p><b>TERCERA · Precio.</b> ${euros(c.renta)} al mes por la habitación, más ${euros(c.servicios)} de cuota de servicios (internet, agua, luz y limpieza semanal de zonas comunes), pagaderos antes del día 5 de cada mes.</p>
      <p><b>CUARTA · Fianza.</b> El residente entrega ${euros(c.fianza)} como fianza, que se devolverá al finalizar el contrato una vez revisado el inventario.</p>
      <p><b>QUINTA · Normas.</b> El residente acepta las normas de convivencia del Anexo I y el inventario del Anexo II.</p>
      <div class="firmas"><div>Por la gestora</div><div>El residente</div></div>`,
    normas: html`<h3>ANEXO I · NORMAS DE CONVIVENCIA</h3><div class="ref">Ref. ${c.codigo} · Vivienda ${c.inmueble}</div>
      ${['Silencio de 23:00 a 8:00 entre semana y de 00:00 a 9:00 el fin de semana.', 'No se permite fumar dentro de la vivienda.', 'La cocina se deja limpia después de cada uso.', 'La basura se saca según el turno de la casa.', 'Las visitas no pueden pasar la noche sin avisar a ALKI.', 'Cualquier avería se comunica en cuanto se detecta.', 'Las zonas comunes son de todos: no se dejan objetos personales.'].map((n, i) => html`<p>${i + 1}. ${n}</p>`)}
      <div class="firmas"><div>Por la gestora</div><div>El residente</div></div>`,
    inventario: html`<h3>ANEXO II · INVENTARIO DE ENTRADA</h3><div class="ref">Habitación ${c.habitacion} · ${c.inmueble} · ${fecha(c.inicio)}</div>
      ${['Cama y somier en buen estado', 'Colchón con funda protectora', 'Escritorio y silla', 'Armario con perchas', 'Lámpara de techo y de mesa', 'Persiana y cortina', 'Juego de llaves: portal, vivienda y habitación', ...(c.caracteristicas || '').split(',').filter((x) => /Aire|Balcón|Baño|Terraza/.test(x)).map((x) => x.trim() + ': revisado')].map((n) => html`<p>☑ ${n}</p>`)}
      <p>Observaciones: sin desperfectos a la entrada.</p><div class="firmas"><div>Por la gestora</div><div>El residente</div></div>`
  }[tipo];
  montar(d, html`<div class="d-cab"><h2>Documento</h2><button type="button" class="cerrar" aria-label="Cerrar">×</button></div>
    <div class="d-cuerpo"><div class="aviso-demo">Documento de ejemplo generado con datos ficticios · sin validez legal</div><article class="documento">${cuerpo}</article></div>
    <footer><button type="button" class="boton" data-imprimir>Imprimir / PDF</button><button type="button" class="boton primario" data-cerrar>Cerrar</button></footer>`);
  document.body.append(d);
  const cerrar = () => { d.close(); d.remove(); document.body.classList.remove('imprimir-doc'); };
  $('.cerrar', d).onclick = cerrar; $('[data-cerrar]', d).onclick = cerrar;
  d.addEventListener('cancel', (e) => { e.preventDefault(); cerrar(); });
  $('[data-imprimir]', d).onclick = () => { document.body.classList.add('imprimir-doc'); window.print(); setTimeout(() => document.body.classList.remove('imprimir-doc'), 500); };
  d.showModal();
}
