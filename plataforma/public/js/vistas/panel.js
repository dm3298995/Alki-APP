/* ==========================================================================
   vistas/panel.js — PANEL PRINCIPAL
   Orden de prioridad: 1) estado de las habitaciones, 2) próximas salidas
   agrupadas por urgencia, 3) alertas, 4) pagos y gastos del mes,
   5) ocupación por inmueble.
   ========================================================================== */
import { html, montar, euros, fecha, chipDias, chipPagos, chipRenovacion, icono, mesLargo, pct, TIPOS_HAB } from '../ui.js';
import { get } from '../api.js';

const NOMBRES = { ocupada: 'Ocupadas', por_liberar: 'Ocupadas, se liberan pronto', reservada: 'Reservadas', disponible: 'Disponibles', bloqueada: 'En mantenimiento' };
export const barraOcupacion = (r, gruesa = false) => {
  const partes = [['ocupada', r.ocupadas - r.porLiberar], ['por_liberar', r.porLiberar], ['reservada', r.reservadas], ['disponible', r.disponibles], ['bloqueada', r.bloqueadas]];
  return html`<div class="barra ${gruesa ? 'gruesa' : ''}" role="img" aria-label="${r.ocupadas} de ${r.total} ocupadas">${partes.filter(([, n]) => n > 0).map(([k, n]) => html`<i class="b-${k}" data-flex="${n}" data-tt="${JSON.stringify({ t: NOMBRES[k], f: [['', '', n + ' habitación(es)']] })}"></i>`)}</div>`;
};

function saludo() { const h = new Date().getHours(); return h < 14 ? 'Buenos días' : h < 21 ? 'Buenas tardes' : 'Buenas noches'; }

const GRUPOS = [['u15', 'Menos de 15 días', (d) => d <= 15], ['u30', 'Entre 15 y 30 días', (d) => d > 15 && d <= 30], ['u60', 'Entre 30 y 60 días', (d) => d > 30]];

export async function vistaPanel(el, { ctx }) {
  const d = await get('/api/panel');
  const r = d.habitaciones;
  const verInq = ctx.puede('inquilinos.ver'), verFin = !!d.pagos;
  const hoyTxt = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  const columnas = 5 + (verInq ? 1 : 0) + (verFin ? 1 : 0);

  montar(el, html`
  <div class="cabecera"><div><h1>${saludo()}, ${ctx.usuario.nombre.split(' ')[0]}</h1><p>${hoyTxt.charAt(0).toUpperCase() + hoyTxt.slice(1)} · así están hoy los ${d.inmuebles.length} pisos de ALKI.</p></div></div>

  <section aria-labelledby="t-hab">
    <h2 id="t-hab" class="sr">Estado de las habitaciones</h2>
    <div class="cifras">
      <a class="cifra" href="#/habitaciones"><span class="etq">Habitaciones</span><span class="valor">${r.total}</span><span class="sub">${pct(r.ocupacion)} de ocupación</span></a>
      <a class="cifra" href="#/habitaciones?estado=ocupada"><span class="etq"><span class="punto p-ocupada"></span>Ocupadas</span><span class="valor">${r.ocupadas}</span><span class="sub">con contrato en vigor</span></a>
      <a class="cifra" href="#/habitaciones?estado=disponible"><span class="etq"><span class="punto p-disponible"></span>Disponibles</span><span class="valor">${r.disponibles}</span><span class="sub">libres y sin reserva</span></a>
      <a class="cifra" href="#/habitaciones?estado=reservada"><span class="etq"><span class="punto p-reservada"></span>Reservadas</span><span class="valor">${r.reservadas}</span><span class="sub">entrada próxima</span></a>
      <a class="cifra" href="#/habitaciones?estado=bloqueada"><span class="etq"><span class="punto p-bloqueada"></span>En mantenimiento</span><span class="valor">${r.bloqueadas}</span><span class="sub">fuera de servicio</span></a>
      <a class="cifra destacada" href="#/habitaciones?estado=por_liberar"><span class="etq"><span class="punto p-por_liberar"></span>Próximas desocupaciones</span><span class="valor">${r.porLiberar}</span><span class="sub">ocupadas que terminan en ≤ ${d.diasAviso} días</span></a>
      ${verFin ? html`<a class="cifra" href="#/pagos?estado=vencido"><span class="etq">Pagos pendientes</span><span class="valor">${euros(d.pagos.pendiente + d.pagos.vencidosTotal)}</span><span class="sub">${euros(d.pagos.vencidosTotal)} atrasados · ${d.pagos.nVencidos} recibos</span></a>` : ''}
      ${d.ingresosMes ? html`<a class="cifra" href="#/ingresos"><span class="etq">Otros ingresos del mes</span><span class="valor">${euros(d.ingresosMes.total)}</span><span class="sub">${d.ingresosMes.n} registrados a mano</span></a>` : ''}
      ${d.gastos ? html`<a class="cifra" href="#/gastos"><span class="etq">Gastos del mes</span><span class="valor">${euros(d.gastos.total)}</span><span class="sub">${mesLargo(d.gastos.periodo)} hasta hoy</span></a>` : ''}
    </div>
    <div class="tarjeta mt">
      ${barraOcupacion(r, true)}
      <div class="leyenda">
        <span><span class="punto p-ocupada"></span>Ocupadas <b>${r.ocupadas - r.porLiberar}</b></span>
        <span><span class="punto p-por_liberar"></span>Ocupadas que se liberan pronto <b>${r.porLiberar}</b></span>
        <span><span class="punto p-reservada"></span>Reservadas <b>${r.reservadas}</b></span>
        <span><span class="punto p-disponible"></span>Disponibles <b>${r.disponibles}</b></span>
        <span><span class="punto p-bloqueada"></span>En mantenimiento <b>${r.bloqueadas}</b></span>
        <span class="suave">= ${r.total} habitaciones</span>
      </div>
    </div>
  </section>

  <div class="rejilla r-2-1 mt-g">
    <section class="tarjeta" aria-labelledby="t-prox">
      <header><div><h2 id="t-prox">Próximas habitaciones a desocupar</h2><p>${d.proximasSalidas.length} contratos terminan en los próximos ${d.diasAviso} días · ordenados por urgencia</p></div>
        <a class="boton mini" href="#/habitaciones?estado=por_liberar">Ver todas</a></header>
      <div class="filtros">${GRUPOS.map(([k, t], i) => html`<span class="chip ${['critico', 'serio', 'aviso'][i]}">${t}: ${d.grupos[k]}</span>`)}</div>
      ${d.proximasSalidas.length ? html`<div class="tabla-env"><table>
        <thead><tr><th>Inmueble · hab.</th>${verInq ? html`<th>Inquilino actual</th>` : ''}<th>Fin del contrato</th><th>Quedan</th><th>Situación</th>${verFin ? html`<th>Pagos</th>` : ''}<th class="der ocultar-movil">Renta</th></tr></thead>
        ${GRUPOS.map(([k, t, f]) => {
          const filas = d.proximasSalidas.filter((s) => f(s.diasRestantes));
          return filas.length ? html`<tbody><tr class="grupo"><td colspan="${columnas}">${t}</td></tr>${filas.map((s) => html`<tr class="clic" data-ir="#/habitaciones/${s.habitacionId}">
            <td><b>${s.inmueble.codigo}</b> · ${s.habitacion}<span class="sec">${TIPOS_HAB[s.tipo] || ''}</span></td>
            ${verInq ? html`<td>${s.inquilino || '—'}</td>` : ''}<td class="num">${fecha(s.fin)}</td><td>${chipDias(s.diasRestantes)}</td>
            <td>${s.siguiente ? html`<span class="chip ${s.siguiente.esRenovacion ? 'ok' : 'info'}">${s.siguiente.esRenovacion ? 'Renovado' : 'Nuevo inquilino'}</span><span class="sec">desde ${fecha(s.siguiente.inicio)}</span>`
              : s.renovacion ? chipRenovacion(s.renovacion) : html`<span class="chip serio">Sin reserva</span>`}</td>
            ${verFin ? html`<td>${chipPagos(s.pagos)}</td>` : ''}<td class="der num ocultar-movil">${euros(s.renta)}</td></tr>`)}</tbody>` : '';
        })}
      </table></div>` : html`<p class="vacio">No hay contratos que terminen pronto.</p>`}
    </section>

    <div class="pila">
      <section class="tarjeta" aria-labelledby="t-al">
        <header><h2 id="t-al">Alertas</h2><span class="suave pequeno">${d.alertas.length} avisos</span></header>
        ${d.alertas.length ? html`<div class="alertas">${d.alertas.map((a) => html`<a class="alerta ${a.nivel}" href="${a.enlace}">${icono(a.nivel === 'info' ? 'info' : 'alerta')}<span>${a.texto}</span><span class="ir">›</span></a>`)}</div>`
          : html`<p class="suave">Todo en orden. No hay avisos.</p>`}
      </section>
      ${d.incidencias ? html`<section class="tarjeta" aria-labelledby="t-inc">
        <header><div><h2 id="t-inc">Incidencias</h2><p>${d.incidencias.n || 0} abiertas · ${d.incidencias.mias || 0} tuyas · ${d.incidencias.sinAsignar || 0} sin asignar</p></div><a class="boton mini" href="#/incidencias">Ver tablero</a></header>
        ${d.incidencias.lista.length ? html`<ul class="actividad">${d.incidencias.lista.map((n) => html`<li class="t-${n.prioridad === 'urgente' ? 'alerta' : n.prioridad === 'alta' ? 'aviso' : 'contrato'}"><span class="p"></span>
          <span><a href="#/incidencias?abrir=${n.id}">${n.titulo}</a><span class="sec">${n.inmueble}${n.habitacion ? ' · ' + n.habitacion : ''} · ${n.asignado || 'sin asignar'}</span></span><time>${n.codigo}</time></li>`)}</ul>` : html`<p class="suave">No hay incidencias abiertas.</p>`}
      </section>` : ''}
      ${d.pagos ? html`<section class="tarjeta" aria-labelledby="t-pag">
        <header><div><h2 id="t-pag">Cobros de ${mesLargo(d.pagos.periodo)}</h2><p>${d.pagos.recibos} recibos · ${euros(d.pagos.esperado)} previstos</p></div><a class="boton mini" href="#/pagos">Ver pagos</a></header>
        <div class="barra gruesa" role="img" aria-label="Cobrado del mes"><i class="b-disponible" data-flex="${d.pagos.cobrado || 0.001}"></i><i class="b-reservada" data-flex="${d.pagos.pendiente || 0.001}"></i></div>
        <dl class="ficha mt">
          <dt>Cobrado</dt><dd class="num">${euros(d.pagos.cobrado)} · ${pct((d.pagos.cobrado / (d.pagos.esperado || 1)) * 100)}</dd>
          <dt>Pendiente (en plazo)</dt><dd class="num">${euros(d.pagos.pendiente)}</dd>
          <dt>Atrasado (total)</dt><dd class="num">${d.pagos.nVencidos ? html`<a href="#/pagos?estado=vencido">${euros(d.pagos.vencidosTotal)} · ${d.pagos.nVencidos} recibos</a>` : euros(0)}</dd>
          <dt>Pagos parciales</dt><dd class="num">${d.pagos.nParciales ? html`<a href="#/pagos?estado=parcial">${d.pagos.nParciales} recibos</a>` : '0'}</dd>
        </dl></section>` : ''}
      ${d.gastos ? html`<section class="tarjeta" aria-labelledby="t-gas">
        <header><div><h2 id="t-gas">Gastos de ${mesLargo(d.gastos.periodo)}</h2><p>${mesLargo(d.gastos.anteriorPeriodo)}: ${euros(d.gastos.anterior)}</p></div><a class="boton mini" href="#/gastos">Ver costes</a></header>
        <dl class="ficha">
          <dt>Total hasta hoy</dt><dd class="num">${euros(d.gastos.total)}</dd>
          <dt>Suministros</dt><dd class="num">${euros(d.gastos.suministros)}</dd>
          <dt>Mantenimiento</dt><dd class="num">${euros(d.gastos.mantenimiento)}</dd>
        </dl><p class="pequeno suave">Las facturas de luz, agua y gas del mes llegan a principios del siguiente.</p></section>` : ''}
    </div>
  </div>

  <section class="tarjeta mt-g" aria-labelledby="t-inm">
    <header><div><h2 id="t-inm">Ocupación por inmueble</h2><p>Primero los que tienen habitaciones libres</p></div><a class="boton mini" href="#/inmuebles">Ver inmuebles</a></header>
    <div class="tabla-env"><table>
      <thead><tr><th>Inmueble</th><th>Ocupación</th><th class="der">Ocupadas</th><th class="der">Libres</th><th class="der ocultar-movil">Se liberan</th>${d.gastos ? html`<th class="der ocultar-movil">Gasto del mes</th>` : ''}</tr></thead>
      <tbody>${d.inmuebles.map((i) => html`<tr class="clic" data-ir="#/inmuebles/${i.id}">
        <td><b>${i.codigo}</b><span class="sec ocultar-movil">${i.nombre}</span></td>
        <td>${barraOcupacion(i)}</td>
        <td class="der num">${i.ocupadas}/${i.total}</td><td class="der num">${i.disponibles ? html`<b>${i.disponibles}</b>` : '0'}</td>
        <td class="der num ocultar-movil">${i.porLiberar}</td>${d.gastos ? html`<td class="der num ocultar-movil">${euros(i.gastoMes)}</td>` : ''}</tr>`)}</tbody>
    </table></div>
  </section>`);
  activarFilas(el);
}

// Filas de tabla que llevan a una ficha
export function activarFilas(el) {
  el.addEventListener('click', (e) => {
    if (e.target.closest('a, button')) return;
    const f = e.target.closest('[data-ir]'); if (f) location.hash = f.dataset.ir;
  });
}
