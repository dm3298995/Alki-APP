/* ==========================================================================
   vistas/inmuebles.js — LISTA DE INMUEBLES Y FICHA DE CADA PISO
   ========================================================================== */
import { html, montar, $, CATEGORIAS, TIPOS_HAB, ESTADOS_HAB, chipPagos, chipRenovacion, euros, eurosCompacto, fecha, chipHab, chipDias, chipMant, formulario, aviso, mesLargo, pct, icono } from '../ui.js';
import { get, post, put } from '../api.js';
import { barras, tarjeta } from '../graficos.js';
import { barraOcupacion, activarFilas } from './panel.js';
import { nuevoGasto, nuevoGastoFijo } from './gastos.js';
import { nuevoMantenimiento } from './mantenimientos.js';


export async function vistaInmuebles(el, { ctx, recargar }) {
  const lista = await get('/api/inmuebles');
  const activos = lista.filter((i) => i.activo);
  const total = activos.reduce((t, i) => ({ total: t.total + i.total, ocupadas: t.ocupadas + i.ocupadas, disponibles: t.disponibles + i.disponibles }), { total: 0, ocupadas: 0, disponibles: 0 });
  montar(el, html`
    <div class="cabecera"><div><h1>Inmuebles</h1><p>${activos.length} pisos · ${total.ocupadas} de ${total.total} habitaciones ocupadas · ${total.disponibles} disponibles</p></div>
      <div class="acciones">${ctx.puede('inmuebles.editar') ? html`<button class="boton primario" id="nuevo">${icono('mas')}Nuevo inmueble</button>` : ''}</div></div>
    <div class="rejilla r-auto">${lista.map((i) => html`<a class="tarjeta inm" href="#/inmuebles/${i.id}">
      <div><span class="cod">${i.codigo}</span>${i.activo ? '' : html` <span class="chip">Inactivo</span>`}<h3>${i.nombre}</h3><span class="suave pequeno">${i.barrio || i.direccion || ''}</span></div>
      ${barraOcupacion(i)}
      <div class="datos"><span><b>${i.ocupadas}/${i.total}</b> ocupadas</span><span>${i.disponibles ? html`<b>${i.disponibles}</b> libre(s)` : 'Sin libres'}</span><span>${pct(i.ocupacion)}</span></div>
      <div class="datos"><span>${i.proximaSalida ? html`Próxima salida: <b>${i.proximaSalida.habitacion}</b> · ${fecha(i.proximaSalida.fin)}` : 'Sin salidas previstas'}</span>
      ${i.costeMedio !== undefined ? html`<span>Coste medio: <b>${euros(i.costeMedio)}</b>/mes</span>` : ''}</div>
    </a>`)}</div>
    ${lista.length ? '' : html`<div class="tarjeta vacio">Aún no hay inmuebles. Créalos aquí o importa el CSV de Homming en Administración → Importar.</div>`}`);
  $('#nuevo', el)?.addEventListener('click', () => formInmueble(null, recargar));
}

function formInmueble(i, recargar) {
  formulario({
    titulo: i ? 'Editar inmueble' : 'Nuevo inmueble',
    campos: [
      { nombre: 'codigo', etiqueta: 'Código', req: true, valor: i?.codigo, ayuda: 'Corto y único, como en Homming: Pal2, SJB55…' },
      { nombre: 'nombre', etiqueta: 'Nombre', req: true, valor: i?.nombre },
      { nombre: 'direccion', etiqueta: 'Dirección', valor: i?.direccion, ancho: true },
      { nombre: 'barrio', etiqueta: 'Barrio', valor: i?.barrio },
      { nombre: 'propietario', etiqueta: 'Propietario', valor: i?.propietario },
      { nombre: 'renta_propietario', etiqueta: 'Renta al propietario (€/mes)', tipo: 'number', paso: '0.01', min: 0, valor: i ? i.renta_propietario / 100 : '', ayuda: 'Para que cuente en los costes, añádela también como gasto fijo.' },
      { nombre: 'notas', etiqueta: 'Notas', tipo: 'textarea', valor: i?.notas },
      ...(i ? [{ nombre: 'activo', etiqueta: 'Inmueble activo (gestionado por ALKI)', tipo: 'checkbox', valor: !!i.activo, ancho: true }] : [])
    ],
    enviar: async (d) => {
      if (i) await put('/api/inmuebles/' + i.id, d); else { const r = await post('/api/inmuebles', d); location.hash = '#/inmuebles/' + r.id; }
      aviso('Inmueble guardado'); recargar();
    }
  });
}

export async function vistaInmueble(el, { params, ctx, recargar }) {
  const d = await get('/api/inmuebles/' + params[0]);
  const i = d.inmueble, r = d.resumen;
  const verInq = ctx.puede('inquilinos.ver'), verFin = !!d.costes;
  const c = d.costes;
  const mesActual = c ? c.porMes[c.porMes.length - 1] : null;
  const mesPrevio = c ? c.porMes[c.porMes.length - 2] : null;
  const ultimoMesCat = c ? c.porMesCategoria[c.porMesCategoria.length - 1] : {};
  const previoMesCat = c ? c.porMesCategoria[c.porMesCategoria.length - 2] || {} : {};

  montar(el, html`
    <a class="miga" href="#/inmuebles">← Inmuebles</a>
    <div class="cabecera"><div><h1>${i.codigo} · ${i.nombre}</h1><p>${[i.direccion, i.barrio].filter(Boolean).join(' · ')}${i.propietario ? ' · Propietario: ' + i.propietario : ''}</p></div>
      <div class="acciones">
        ${ctx.puede('mantenimientos.editar') ? html`<button class="boton" id="n-mant">${icono('mas')}Mantenimiento</button>` : ''}
        ${ctx.puede('gastos.editar') ? html`<button class="boton" id="n-gasto">${icono('mas')}Gasto</button>` : ''}
        ${ctx.puede('habitaciones.editar') ? html`<button class="boton" id="n-hab">${icono('mas')}Habitación</button>` : ''}
        ${ctx.puede('inmuebles.editar') ? html`<button class="boton" id="editar">Editar</button>` : ''}
      </div></div>

    <div class="rejilla r-2-1">
      <section class="tarjeta"><header><div><h2>Habitaciones</h2><p>${r.total} habitaciones · ${pct(r.ocupacion)} ocupado · ${r.disponibles} disponible(s) · ${r.porLiberar} se liberan pronto</p></div></header>
        <div class="plano">${d.habitaciones.map((h) => html`<a class="cuarto e-${h.estado}" href="#/habitaciones/${h.id}">
          <div class="fila-c"><b>${h.codigo}</b>${chipHab(h.estado)}</div>
          <span class="sec">${TIPOS_HAB[h.tipo] || 'Habitación'}${h.m2 ? ' · ' + h.m2 + ' m²' : ''}</span>
          ${h.actual ? html`${verInq ? html`<span>${h.actual.inquilino}</span>` : ''}<small>Hasta ${fecha(h.actual.fin)} · ${h.actual.diasRestantes} días</small>`
            : h.siguiente ? html`<small>Entra el ${fecha(h.siguiente.inicio)}</small>` : html`<small>${h.estado === 'disponible' ? 'Lista para entrar' : 'Fuera de servicio'}</small>`}
          <span class="fila-c"><span class="num">${euros(h.actual ? h.actual.renta : h.precio)}/mes</span>${h.actual?.pagos ? chipPagos(h.actual.pagos) : ''}</span>
        </a>`)}</div>
        <div class="leyenda">${['ocupada', 'por_liberar', 'reservada', 'disponible', 'mantenimiento'].map((k) => html`<span><span class="punto p-${k === 'mantenimiento' ? 'bloqueada' : k}"></span>${ESTADOS_HAB[k][0]}</span>`)}</div>
      </section>
      <section class="tarjeta"><header><h2>Información general</h2></header>
        <dl class="ficha">
          <dt>Código</dt><dd>${i.codigo}</dd><dt>Zona</dt><dd>${i.barrio || '—'}</dd>
          <dt>Dirección</dt><dd>${i.direccion || '—'}</dd>${i.m2 ? html`<dt>Superficie</dt><dd>${i.m2} m²</dd>` : ''}
          <dt>Habitaciones</dt><dd>${r.total}</dd>${i.descripcion ? html`<dt>Vivienda</dt><dd>${i.descripcion}</dd>` : ''}
          ${i.propietario ? html`<dt>Propiedad</dt><dd>${i.propietario}</dd>` : ''}
          ${verFin ? html`<dt>Alquiler mensual</dt><dd>${euros(ultimoMesCat.alquiler || i.renta_propietario)}</dd>${d.ingresosMes != null ? html`<dt>Ingresos del mes</dt><dd>${euros(d.ingresosMes)} <span class="suave pequeno">(rentas + servicios en vigor)</span></dd>` : ''}` : ''}
        </dl>
        ${i.notas ? html`<p class="pequeno suave mt">${i.notas}</p>` : ''}
      </section>
    </div>

    ${verFin ? html`<div class="cifras mt">
      <div class="cifra"><span class="etq">Gasto total del mes</span><span class="valor">${euros(mesActual.importe)}</span><span class="sub">${mesLargo(mesActual.periodo)} hasta hoy</span></div>
      <div class="cifra"><span class="etq">Mes anterior</span><span class="valor">${euros(mesPrevio?.importe || 0)}</span><span class="sub">Media 12 meses: ${euros(c.mediaMensual)}</span></div>
      <div class="cifra"><span class="etq">Suministros</span><span class="valor">${euros((previoMesCat.electricidad || 0) + (previoMesCat.agua || 0) + (previoMesCat.gas || 0) + (previoMesCat.internet || 0))}</span><span class="sub">${mesLargo(mesPrevio?.periodo || mesActual.periodo)} (último mes completo)</span></div>
      <div class="cifra"><span class="etq">Limpieza</span><span class="valor">${euros(previoMesCat.limpieza || 0)}</span><span class="sub">limpieza semanal · mes anterior</span></div>
      <div class="cifra"><span class="etq">Mantenimiento 12 meses</span><span class="valor">${euros(c.mantenimiento)}</span><span class="sub">${d.mantenimientos.length} trabajos recientes</span></div>
    </div>` : ''}

    <section class="tarjeta mt">
      <header><div><h2>Detalle de habitaciones</h2><p>Estado calculado a partir de los contratos</p></div></header>
      <div class="tabla-env"><table>
        <thead><tr><th>Hab.</th><th>Tipo</th><th>Estado</th>${verInq ? html`<th>Inquilino</th>` : ''}<th>Inicio</th><th>Fin</th><th>Quedan</th>${verFin ? html`<th>Pagos</th>` : ''}<th class="der">Renta</th><th class="ocultar-movil">Siguiente</th></tr></thead>
        <tbody>${d.habitaciones.map((h) => html`<tr class="clic" data-ir="#/habitaciones/${h.id}">
          <td><b>${h.codigo}</b></td><td>${TIPOS_HAB[h.tipo] || '—'}<span class="sec">${h.m2 ? h.m2 + ' m²' : ''}</span></td><td>${chipHab(h.estado)}${h.actual?.renovacion ? html`<span class="sec">${chipRenovacion(h.actual.renovacion)}</span>` : ''}</td>
          ${verInq ? html`<td>${h.actual?.inquilino || '—'}</td>` : ''}
          <td class="num">${h.actual ? fecha(h.actual.inicio) : '—'}</td><td class="num">${h.actual ? fecha(h.actual.fin) : '—'}</td><td>${h.actual ? chipDias(h.actual.diasRestantes) : ''}</td>
          ${verFin ? html`<td>${h.actual ? chipPagos(h.actual.pagos) : ''}</td>` : ''}
          <td class="der num">${euros(h.actual ? h.actual.renta : h.precio)}${h.actual ? '' : html`<span class="sec">precio publicado</span>`}</td>
          <td class="ocultar-movil">${h.siguiente ? html`${h.siguiente.esRenovacion ? 'Renueva' : 'Entra'} ${fecha(h.siguiente.inicio)}${verInq && h.siguiente.inquilino && !h.siguiente.esRenovacion ? html`<span class="sec">${h.siguiente.inquilino}</span>` : ''}` : html`<span class="suave">—</span>`}</td></tr>`)}</tbody>
      </table></div>
      ${d.habitaciones.length ? '' : html`<p class="vacio">Este inmueble no tiene habitaciones activas.</p>`}
    </section>

    <section class="tarjeta mt"><header><div><h2>Actividad reciente</h2><p>Últimas semanas en este piso</p></div></header>
      ${d.actividad.length ? html`<ul class="actividad">${d.actividad.map((a) => html`<li class="t-${a.tipo}"><span class="p"></span><span>${a.texto}</span><time>${fecha(a.fecha)}</time></li>`)}</ul>` : html`<p class="suave">Sin actividad reciente.</p>`}
    </section>

    ${verFin ? html`<div class="rejilla r-2-1 mt-g">
      ${tarjeta({
        titulo: 'Coste real del piso', sub: 'Últimos 12 meses · gastos + mantenimientos',
        grafico: barras({ etiquetas: c.porMes.map((m) => m.periodo), series: [{ nombre: 'Coste', color: '--serie-1', valores: c.porMes.map((m) => m.importe) }], formato: (v, t) => (t ? euros(v) : eurosCompacto(v)) }),
        tabla: { cabeceras: ['Mes', 'Coste'], filas: c.porMes.map((m) => [mesLargo(m.periodo), euros(m.importe)]) }
      })}
      <section class="tarjeta"><header><div><h2>¿En qué se va?</h2><p>${mesLargo(mesActual.periodo)} frente al mes anterior</p></div></header>
        <div class="tabla-env"><table><thead><tr><th>Categoría</th><th class="der">Este mes</th><th class="der">Anterior</th></tr></thead>
        <tbody>${c.porCategoria.map((cat) => html`<tr><td>${cat.nombre}</td><td class="der num">${euros(ultimoMesCat[cat.categoria] || 0)}</td><td class="der num suave">${euros(previoMesCat[cat.categoria] || 0)}</td></tr>`)}</tbody>
        <tfoot><tr><td>Total</td><td class="der num">${euros(mesActual.importe)}</td><td class="der num">${euros(mesPrevio?.importe || 0)}</td></tr></tfoot></table></div>
        ${d.ingresosMes != null ? html`<p class="pequeno suave">Ingresos esperados del mes (rentas en vigor): <b>${euros(d.ingresosMes)}</b></p>` : ''}
      </section>
    </div>

    <section class="tarjeta mt">
      <header><div><h2>Gastos fijos mensuales</h2><p>Se apuntan solos cada mes (alquiler, internet, limpieza…)</p></div>
        ${ctx.puede('gastos.editar') ? html`<button class="boton mini" id="n-fijo">${icono('mas')}Gasto fijo</button>` : ''}</header>
      ${d.recurrentes.length ? html`<div class="tabla-env"><table><thead><tr><th>Categoría</th><th>Proveedor</th><th>Desde</th><th>Hasta</th><th class="der">Importe</th><th></th></tr></thead>
        <tbody>${d.recurrentes.map((g) => html`<tr><td>${CATEGORIAS[g.categoria] || g.categoria}${g.activo ? '' : html` <span class="chip">Pausado</span>`}</td><td>${g.proveedor || '—'}</td><td>${mesLargo(g.desde)}</td><td>${g.hasta ? mesLargo(g.hasta) : 'Indefinido'}</td><td class="der num">${euros(g.importe)}</td>
          <td class="der">${ctx.puede('gastos.editar') ? html`<button class="enlace pequeno" data-fijo="${g.id}" data-activo="${g.activo}">${g.activo ? 'Pausar' : 'Reanudar'}</button>` : ''}</td></tr>`)}</tbody></table></div>`
        : html`<p class="suave">No hay gastos fijos. Añade al menos el alquiler que se paga al propietario.</p>`}
    </section>` : ''}

    <section class="tarjeta mt">
      <header><div><h2>Últimos mantenimientos</h2></div><a class="boton mini" href="#/mantenimientos?inmueble=${i.id}">Ver todos</a></header>
      ${d.mantenimientos.length ? html`<div class="tabla-env"><table><thead><tr><th>Fecha</th><th>Trabajo</th><th>Dónde</th><th>Estado</th>${verFin ? html`<th class="der">Coste</th>` : ''}</tr></thead>
        <tbody>${d.mantenimientos.map((m) => html`<tr><td class="num">${fecha(m.fecha)}</td><td>${m.descripcion}</td><td>${m.habitacion || m.zona || 'Zona común'}</td><td>${chipMant(m.estado)}</td>${verFin ? html`<td class="der num">${euros(m.coste)}</td>` : ''}</tr>`)}</tbody></table></div>`
        : html`<p class="suave">Sin mantenimientos registrados.</p>`}
    </section>
`);

  activarFilas(el);
  $('#editar', el)?.addEventListener('click', () => formInmueble(i, recargar));
  $('#n-hab', el)?.addEventListener('click', () => formulario({
    titulo: 'Nueva habitación en ' + i.codigo,
    campos: [{ nombre: 'codigo', etiqueta: 'Código', req: true, placeholder: 'H' + (d.habitaciones.length + 1) }, { nombre: 'nombre', etiqueta: 'Nombre (opcional)' },
      { nombre: 'precio', etiqueta: 'Precio de referencia (€/mes)', tipo: 'number', paso: '0.01', min: 0 }],
    enviar: async (x) => { await post('/api/inmuebles/' + i.id + '/habitaciones', x); aviso('Habitación creada'); recargar(); }
  }));
  $('#n-gasto', el)?.addEventListener('click', () => nuevoGasto({ inmuebleId: i.id }, recargar));
  $('#n-fijo', el)?.addEventListener('click', () => nuevoGastoFijo(i.id, recargar));
  $('#n-mant', el)?.addEventListener('click', () => nuevoMantenimiento({ inmuebleId: i.id }, recargar));
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-fijo]'); if (!b) return;
    await put('/api/recurrentes/' + b.dataset.fijo, { activo: b.dataset.activo !== '1' }); aviso('Gasto fijo actualizado'); recargar();
  });
}
