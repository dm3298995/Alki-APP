/* ==========================================================================
   vistas/rentabilidad.js — BENEFICIO REAL DE CADA PISO Y CALCULADORA
   Pestañas:
   · Por piso: ingresos − todos los costes (suministros, mantenimiento,
     impuestos, seguros, gastos generales…) = beneficio real.
   · Calculadora: simula un piso (real o nuevo) cambiando precio, ocupación
     y costes, y calcula beneficio, margen y ocupación mínima para no perder.
   ========================================================================== */
import { html, montar, $, $$, euros, eurosCompacto, pct, mesLargo, pestanas, aviso, formulario, selectorPeriodo, nuevoPeriodo, textoPeriodo } from '../ui.js';
import { get, put } from '../api.js';
import { barras, tarjeta } from '../graficos.js';

const estado = nuevoPeriodo('m12');
const GRUPOS = { alquiler: 'Alquiler del piso', suministros: 'Suministros (luz, agua, gas, internet)', limpieza: 'Limpieza', mantenimiento: 'Mantenimiento y reparaciones', impuestos: 'Impuestos y tasas', seguros: 'Seguros', otros: 'Comisiones y otros' };
const eje = (v, t) => (t ? euros(v) : eurosCompacto(v));
const signo = (v) => html`<span class="${v < 0 ? 'negativo' : 'positivo'}">${euros(v)}</span>`;

export async function vistaRentabilidad(el, { query, ctx, recargar }) {
  const pest = query.get('vista') === 'calculadora' ? 'calculadora' : 'pisos';
  montar(el, html`<div class="cabecera"><div><h1>Rentabilidad</h1><p>Lo que gana de verdad cada piso, después de todos sus costes</p></div>
    <div class="acciones">${ctx.puede('gastos.editar') ? html`<a class="boton" href="#/gastos?vista=mes">Subir gastos del mes</a>` : ''}${ctx.puede('rentabilidad.editar') ? html`<button class="boton" id="ajustes">Impuestos y gastos generales</button>` : ''}</div></div>
    ${pestanas([['pisos', 'Beneficio por piso', null, '#/rentabilidad'], ['calculadora', 'Calculadora', null, '#/rentabilidad?vista=calculadora']], pest)}
    <div id="periodo"></div><div id="cuerpo"></div>`);
  let datos;
  const cargar = async () => { datos = await get('/api/rentabilidad?desde=' + estado.desde + '&hasta=' + estado.hasta); };
  const pintar = async () => { await cargar(); if (pest === 'pisos') pintarPisos($('#cuerpo', el), datos, query.get('piso')); else calculadora($('#cuerpo', el), datos, query.get('piso')); };
  if (pest === 'pisos') $('#periodo', el).append(selectorPeriodo(estado, pintar));
  await pintar();
  $('#ajustes', el)?.addEventListener('click', () => editarAjustes(datos.ajustes, recargar));
}

function pintarPisos(cont, d, pisoSel) {
  const t = d.total;
  const max = Math.max(...d.pisos.map((p) => Math.abs(p.beneficio)), 1);
  montar(cont, html`
    <div class="cifras">
      <div class="cifra"><span class="etq">Ingresos</span><span class="valor">${euros(t.ingresos)}</span><span class="sub">recibos emitidos${t.otrosIngresos ? ' + ' + euros(t.otrosIngresos) + ' de otros ingresos' : ''} · cobrado ${euros(t.cobrado)}</span></div>
      <div class="cifra"><span class="etq">Costes de los pisos</span><span class="valor">${euros(t.costes)}</span><span class="sub">alquiler, suministros, mantenimiento…</span></div>
      <div class="cifra"><span class="etq">Gastos generales</span><span class="valor">${euros(t.generales)}</span><span class="sub">${euros(d.ajustes.gastosGeneralesMes)}/mes repartidos por habitación</span></div>
      <div class="cifra destacada"><span class="etq">Beneficio antes de impuestos</span><span class="valor">${signo(t.beneficio)}</span><span class="sub">margen ${t.margen != null ? pct(t.margen) : '—'}</span></div>
      <div class="cifra"><span class="etq">Impuesto estimado (${d.ajustes.tipoImpuesto} %)</span><span class="valor">${euros(t.impuestoEmpresa)}</span><span class="sub">sobre el beneficio de la empresa</span></div>
      <div class="cifra"><span class="etq">Beneficio neto</span><span class="valor">${signo(t.netoEmpresa)}</span><span class="sub">${textoPeriodo(estado)}</span></div>
    </div>
    <div class="rejilla r-2-1 mt">
      ${tarjeta({ titulo: 'Ingresos, costes y beneficio por mes', sub: 'Toda la empresa · costes incluyen los gastos generales', series: [{ nombre: 'Ingresos', color: '--serie-1' }, { nombre: 'Costes', color: '--serie-2' }],
        grafico: barras({ etiquetas: d.porMes.map((m) => m.periodo), apilado: false, series: [{ nombre: 'Ingresos', color: '--serie-1', valores: d.porMes.map((m) => m.ingresos) }, { nombre: 'Costes', color: '--serie-2', valores: d.porMes.map((m) => m.costes) }], formato: eje }),
        tabla: { cabeceras: ['Mes', 'Ingresos', 'Costes', 'Beneficio'], filas: d.porMes.map((m) => [mesLargo(m.periodo), euros(m.ingresos), euros(m.costes), euros(m.beneficio)]) } })}
      <section class="tarjeta"><header><div><h2>¿A dónde va cada euro?</h2><p>De cada 100 € que se cobran a los inquilinos</p></div></header>
        <div class="barras-h">${[...Object.entries(GRUPOS).map(([g, n]) => [n, t.grupos[g]]), ['Gastos generales', t.generales], ['Impuesto estimado', t.impuestoEmpresa], ['Beneficio neto', t.netoEmpresa]].map(([n, v]) => html`<div class="fila">
          <span>${n}</span><div class="pista"><i class="${n === 'Beneficio neto' ? 'verde' : ''}" data-ancho="${t.ingresos ? Math.max(0, v / t.ingresos * 100) : 0}"></i></div><b>${t.ingresos ? Math.round(v / t.ingresos * 100) : 0} €</b></div>`)}</div>
      </section>
    </div>
    <section class="tarjeta mt"><header><div><h2>Beneficio de cada piso</h2><p>${textoPeriodo(estado)} · de más a menos rentable · pulsa un piso para ver su cuenta</p></div></header>
      <div class="tabla-env"><table>
        <thead><tr><th>Piso</th><th class="der">Hab.</th><th class="der">Ingresos</th><th class="der ocultar-movil">Alquiler</th><th class="der ocultar-movil">Suministros</th><th class="der ocultar-movil">Limpieza</th><th class="der ocultar-movil">Manten.</th><th class="der ocultar-movil">Impuestos, seguros y otros</th><th class="der ocultar-movil">Generales</th><th>Beneficio</th><th class="der">Margen</th><th class="der">€/hab/mes</th></tr></thead>
        <tbody>${d.pisos.map((p) => html`<tr class="clic ${String(p.id) === pisoSel ? 'seleccionada' : ''}" data-piso="${p.id}"><td><b>${p.codigo}</b><span class="sec">${p.barrio || ''}</span></td><td class="der num">${p.habitaciones}</td>
          <td class="der num">${euros(p.ingresos)}</td><td class="der num ocultar-movil">${euros(p.grupos.alquiler)}</td><td class="der num ocultar-movil">${euros(p.grupos.suministros)}</td>
          <td class="der num ocultar-movil">${euros(p.grupos.limpieza)}</td><td class="der num ocultar-movil">${euros(p.grupos.mantenimiento)}</td><td class="der num ocultar-movil">${euros(p.grupos.impuestos + p.grupos.seguros + p.grupos.otros)}</td><td class="der num ocultar-movil">${euros(p.generales)}</td>
          <td><div class="barra-b"><i class="${p.beneficio < 0 ? 'neg' : ''}" data-ancho="${Math.abs(p.beneficio) / max * 100}"></i></div><b class="num">${signo(p.beneficio)}</b></td>
          <td class="der num">${p.margen != null ? pct(p.margen) : '—'}</td><td class="der num">${euros(p.porHabitacionMes)}</td></tr>`)}</tbody>
        <tfoot><tr><td>Total</td><td class="der">${d.pisos.reduce((s, p) => s + p.habitaciones, 0)}</td><td class="der num">${euros(t.ingresos)}</td><td class="der num ocultar-movil">${euros(t.grupos.alquiler)}</td><td class="der num ocultar-movil">${euros(t.grupos.suministros)}</td><td class="der num ocultar-movil">${euros(t.grupos.limpieza)}</td><td class="der num ocultar-movil">${euros(t.grupos.mantenimiento)}</td><td class="der num ocultar-movil">${euros(t.grupos.impuestos + t.grupos.seguros + t.grupos.otros)}</td><td class="der num ocultar-movil">${euros(t.generales)}</td><td class="num">${signo(t.beneficio)}</td><td class="der num">${t.margen != null ? pct(t.margen) : '—'}</td><td></td></tr></tfoot>
      </table></div>
      <p class="pequeno suave">Ingresos = recibos emitidos (renta + servicios) + ingresos registrados a mano en ese piso${t.otrosIngresosEmpresa ? ' (los ' + euros(t.otrosIngresosEmpresa) + ' de ingresos sin piso cuentan solo en el total)' : ''}. El impuesto por piso es orientativo: el Impuesto sobre Sociedades se paga por el beneficio total de la empresa.</p>
    </section>
    <div id="detalle"></div>`);
  const detalle = (id) => {
    const p = d.pisos.find((x) => String(x.id) === String(id)); if (!p) return;
    $$('tr[data-piso]', cont).forEach((tr) => tr.classList.toggle('seleccionada', tr.dataset.piso === String(id)));
    const lineas = [['Recibos (renta + servicios)', p.ingresos - p.otrosIngresos, 'ingreso'], ...(p.otrosIngresos ? [['Otros ingresos (registrados a mano)', p.otrosIngresos, 'ingreso']] : []), ...Object.entries(GRUPOS).map(([g, n]) => [n, -p.grupos[g]]), ['Parte de gastos generales', -p.generales], ['= Beneficio antes de impuestos', p.beneficio, 'total'], ['Impuesto estimado (' + d.ajustes.tipoImpuesto + ' %)', -p.impuesto], ['= Beneficio neto estimado', p.neto, 'total']];
    montar($('#detalle', cont), html`<div class="rejilla r-2-1 mt">
      ${tarjeta({ titulo: 'Cuenta de ' + p.codigo + ' · ' + p.nombre, sub: textoPeriodo(estado) + ' · ' + p.habitaciones + ' habitaciones', series: [{ nombre: 'Ingresos', color: '--serie-1' }, { nombre: 'Costes', color: '--serie-2' }],
        grafico: barras({ etiquetas: p.porMes.map((m) => m.periodo), apilado: false, series: [{ nombre: 'Ingresos', color: '--serie-1', valores: p.porMes.map((m) => m.ingresos) }, { nombre: 'Costes', color: '--serie-2', valores: p.porMes.map((m) => m.costes) }], formato: eje }),
        tabla: { cabeceras: ['Mes', 'Ingresos', 'Costes', 'Beneficio'], filas: p.porMes.map((m) => [mesLargo(m.periodo), euros(m.ingresos), euros(m.costes), euros(m.beneficio)]) } })}
      <section class="tarjeta"><header><div><h2>Cuenta de resultados</h2><p>${p.codigo}</p></div><a class="boton mini" href="#/rentabilidad?vista=calculadora&piso=${p.id}">Simular cambios</a></header>
        <table><tbody>${lineas.map(([n, v, tipo]) => html`<tr class="${tipo === 'total' ? 'fila-total' : ''}"><td>${n}</td><td class="der num">${tipo ? signo(v) : v ? euros(v) : html`<span class="suave">—</span>`}</td></tr>`)}</tbody></table>
        <p class="pequeno suave mt">Margen: <b>${p.margen != null ? pct(p.margen) : '—'}</b> · Beneficio por habitación y mes: <b>${euros(p.porHabitacionMes)}</b> · Ocupación media: <b>${p.calculadora.ocupacion} %</b></p>
        <a class="pequeno" href="#/inmuebles/${p.id}">Ver ficha del piso →</a>
      </section></div>`);
    $('#detalle', cont).scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  cont.onclick = (e) => { const tr = e.target.closest('tr[data-piso]'); if (tr) detalle(tr.dataset.piso); };
  if (pisoSel) detalle(pisoSel);
}

// ---------- Calculadora / simulador ----------
function calculadora(cont, d, pisoSel) {
  const base = (p) => p ? { nombre: p.codigo, ...p.calculadora } : { nombre: 'Piso nuevo', habitaciones: 4, precioMedio: 47000, ocupacion: 90, alquiler: 110000, suministros: 26000, limpieza: 12000, mantenimiento: 7000, impuestos: 1000, seguros: 1800, otros: 1500 };
  let v = base(d.pisos.find((p) => String(p.id) === pisoSel));
  const totalHabs = d.pisos.reduce((s, p) => s + p.habitaciones, 0) || 1;
  const e = (c) => (c / 100).toFixed(0);
  const campo = (n, et, ayuda, paso = 1) => html`<label class="campo"><span>${et}</span><input type="number" name="${n}" min="0" step="${paso}" value="${n === 'habitaciones' || n === 'ocupacion' ? v[n] : e(v[n])}">${ayuda ? html`<small>${ayuda}</small>` : ''}</label>`;
  montar(cont, html`<div class="rejilla r-2-1">
    <section class="tarjeta"><header><div><h2>Datos del piso</h2><p>Parte de los datos reales de los últimos 12 meses (medias mensuales). Cambia lo que quieras.</p></div>
      <select id="piso"><option value="">Piso nuevo (para captar)</option>${d.pisos.map((p) => html`<option value="${p.id}"${String(p.id) === pisoSel ? html` selected` : ''}>${p.codigo} · ${p.nombre}</option>`)}</select></header>
      <form id="calc" class="form" novalidate>
        <h3 class="ancho">Ingresos</h3>
        ${campo('habitaciones', 'Habitaciones', '', 1)}${campo('precioMedio', 'Precio medio por habitación (€/mes)', 'Renta + cuota de servicios')}
        ${campo('ocupacion', 'Ocupación media (%)', 'Ej.: 90 = 1 mes y pico vacía al año', 1)}
        <h3 class="ancho">Costes mensuales (€)</h3>
        ${campo('alquiler', 'Alquiler al propietario')}${campo('suministros', 'Suministros (luz, agua, gas, internet)')}
        ${campo('limpieza', 'Limpieza')}${campo('mantenimiento', 'Mantenimiento y reparaciones')}
        ${campo('impuestos', 'Impuestos y tasas')}${campo('seguros', 'Seguros')}${campo('otros', 'Comisiones y otros')}
      </form></section>
    <section class="tarjeta" id="resultado" aria-live="polite"></section></div>`);
  const calcular = () => {
    const f = $('#calc', cont);
    const n = (k) => Math.max(0, Number(f.elements[k].value) || 0);
    const habs = n('habitaciones'), precio = n('precioMedio') * 100, ocup = Math.min(100, n('ocupacion'));
    const fijos = ['alquiler', 'suministros', 'limpieza', 'mantenimiento', 'impuestos', 'seguros', 'otros'].reduce((s, k) => s + n(k) * 100, 0);
    const generales = Math.round(d.ajustes.gastosGeneralesMes * (habs / (totalHabs + (pisoSel ? 0 : habs))));
    const ingresos = Math.round(habs * precio * ocup / 100);
    const costesMes = fijos + generales;
    const beneficio = ingresos - costesMes;
    const impuesto = Math.max(0, Math.round(beneficio * d.ajustes.tipoImpuesto / 100));
    const equilibrio = habs && precio ? Math.ceil((costesMes / (habs * precio)) * 100) : null;
    const escenarios = [70, 80, 90, 95, 100].map((o) => { const i = Math.round(habs * precio * o / 100); return [o, i, i - costesMes]; });
    montar($('#resultado', cont), html`<header><div><h2>Resultado</h2><p>${v.nombre} · al mes</p></div></header>
      <dl class="ficha grande">
        <dt>Ingresos</dt><dd>${euros(ingresos)}</dd><dt>Costes del piso</dt><dd>${euros(fijos)}</dd>
        <dt>Parte de gastos generales</dt><dd>${euros(generales)}</dd>
        <dt>Beneficio antes de impuestos</dt><dd>${signo(beneficio)}</dd><dt>Impuesto (${d.ajustes.tipoImpuesto} %)</dt><dd>${euros(impuesto)}</dd>
        <dt>Beneficio neto</dt><dd><b>${signo(beneficio - impuesto)}</b></dd>
        <dt>Al año (neto)</dt><dd><b>${signo((beneficio - impuesto) * 12)}</b></dd>
        <dt>Margen</dt><dd>${ingresos ? pct(beneficio / ingresos * 100) : '—'}</dd>
        <dt>Por habitación</dt><dd>${habs ? euros(Math.round(beneficio / habs)) : '—'} al mes</dd>
      </dl>
      <div class="${equilibrio > 100 ? 'error-form' : equilibrio > 85 ? 'aviso-demo' : 'exito-form'} mt">${equilibrio == null ? 'Introduce habitaciones y precio.' : equilibrio > 100 ? 'Con estos números el piso pierde dinero aunque esté siempre lleno.' : 'Ocupación mínima para no perder dinero: ' + equilibrio + ' %' + (equilibrio > 85 ? ' (muy justo)' : '')}</div>
      <h3 class="mt">¿Y si cambia la ocupación?</h3>
      <div class="tabla-env"><table><thead><tr><th>Ocupación</th><th class="der">Ingresos</th><th class="der">Beneficio</th></tr></thead>
        <tbody>${escenarios.map(([o, i, b]) => html`<tr class="${o === ocup ? 'seleccionada' : ''}"><td>${o} %</td><td class="der num">${euros(i)}</td><td class="der num">${signo(b)}</td></tr>`)}</tbody></table></div><p class="pequeno suave">Beneficio mensual antes de impuestos.</p>`);
  };
  $('#calc', cont).addEventListener('input', calcular);
  $('#piso', cont).onchange = (ev) => { location.hash = '#/rentabilidad?vista=calculadora' + (ev.target.value ? '&piso=' + ev.target.value : ''); };
  calcular();
}

function editarAjustes(a, recargar) {
  formulario({
    titulo: 'Impuestos y gastos generales', descripcion: 'Se usan para calcular el beneficio real de cada piso.',
    campos: [
      { nombre: 'tipoImpuesto', etiqueta: 'Impuesto sobre beneficios (%)', tipo: 'number', min: 0, valor: a.tipoImpuesto, ayuda: 'Impuesto sobre Sociedades. Confírmalo con vuestra gestoría.' },
      { nombre: 'gastosGeneralesMes', etiqueta: 'Gastos generales de la empresa (€/mes)', tipo: 'number', paso: '0.01', min: 0, valor: (a.gastosGeneralesMes / 100).toFixed(2), ayuda: 'Gestoría, software, oficina, teléfono, sueldos… Se reparte entre los pisos según sus habitaciones.' },
      { nombre: 'detalleGenerales', etiqueta: 'Detalle (para recordar qué incluye)', tipo: 'textarea', valor: a.detalleGenerales }
    ],
    enviar: async (x) => { await put('/api/rentabilidad/ajustes', { ...x, tipoImpuesto: Number(x.tipoImpuesto) }); aviso('Ajustes guardados'); recargar(); }
  });
}
