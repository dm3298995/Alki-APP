/* ==========================================================================
   vistas/estadisticas.js — GRÁFICOS DE OCUPACIÓN, PAGOS Y GASTOS
   Periodo seleccionable: este mes, 3 meses, 6 meses, este año o personalizado.
   ========================================================================== */
import { html, montar, $, euros, eurosCompacto, mesLargo, pct, selectorPeriodo, nuevoPeriodo, textoPeriodo } from '../ui.js';
import { get } from '../api.js';
import { barras, linea, barrasH, tarjeta } from '../graficos.js';

const estado = nuevoPeriodo('m6');
const eje = (v, t) => (t ? euros(v) : eurosCompacto(v));

export async function vistaEstadisticas(el) {
  montar(el, html`<div class="cabecera"><div><h1>Estadísticas</h1><p>Cómo evoluciona ALKI</p></div></div><div id="periodo"></div><div id="cuerpo"></div>`);
  const pintar = async () => {
    const d = await get('/api/estadisticas?desde=' + estado.desde + '&hasta=' + estado.hasta);
    const h = d.habitaciones, per = textoPeriodo(estado);
    const meses = h.ocupacion.map((o) => o.periodo);
    const mediaOcup = h.ocupacion.reduce((s, o) => s + o.porcentaje, 0) / (h.ocupacion.length || 1);
    const entradas = h.movimientos.reduce((s, m) => s + m.entradas, 0), salidas = h.movimientos.reduce((s, m) => s + m.salidas, 0);
    montar($('#cuerpo', el), html`
      <h2 class="mt">Habitaciones</h2>
      <div class="cifras mt">
        <div class="cifra"><span class="etq">Ocupación actual</span><span class="valor">${pct(h.resumen.ocupacion)}</span><span class="sub">${h.resumen.ocupadas} de ${h.resumen.total}</span></div>
        <div class="cifra"><span class="etq">Ocupación media</span><span class="valor">${pct(mediaOcup)}</span><span class="sub">${per}</span></div>
        <div class="cifra"><span class="etq">Entradas</span><span class="valor">${entradas}</span><span class="sub">contratos que empiezan</span></div>
        <div class="cifra"><span class="etq">Salidas</span><span class="valor">${salidas}</span><span class="sub">contratos terminados</span></div>
      </div>
      <div class="rejilla r-2 mt">
        ${tarjeta({ titulo: 'Evolución de la ocupación', sub: '% de habitaciones ocupadas a final de cada mes',
          grafico: linea({ etiquetas: meses, valores: h.ocupacion.map((o) => o.porcentaje), maximo: 100, nombre: 'Ocupación', formato: (v, t) => (t ? pct(v) : Math.round(v) + ' %') }),
          tabla: { cabeceras: ['Mes', 'Ocupadas', 'Total', '%'], filas: h.ocupacion.map((o) => [mesLargo(o.periodo), o.ocupadas, o.total, pct(o.porcentaje)]) } })}
        ${tarjeta({ titulo: 'Entradas y salidas', sub: 'Contratos que empiezan y que terminan cada mes',
          series: [{ nombre: 'Entradas', color: '--serie-1' }, { nombre: 'Salidas', color: '--serie-2' }],
          grafico: barras({ etiquetas: meses, apilado: false, series: [{ nombre: 'Entradas', color: '--serie-1', valores: h.movimientos.map((m) => m.entradas) }, { nombre: 'Salidas', color: '--serie-2', valores: h.movimientos.map((m) => m.salidas) }], formato: (v) => Math.round(v) }),
          tabla: { cabeceras: ['Mes', 'Entradas', 'Salidas'], filas: h.movimientos.map((m) => [mesLargo(m.periodo), m.entradas, m.salidas]) } })}
        ${tarjeta({ titulo: 'Habitaciones libres por mes', sub: 'Sin inquilino a final de mes (incluye las que están en mantenimiento o recién reservadas)',
          grafico: barras({ etiquetas: meses, series: [{ nombre: 'Libres', color: '--serie-2', valores: h.ocupacion.map((o) => o.libres) }], formato: (v) => Math.round(v) }),
          tabla: { cabeceras: ['Mes', 'Libres', 'En cartera'], filas: h.ocupacion.map((o) => [mesLargo(o.periodo), o.libres, o.total]) } })}
        ${tarjeta({ titulo: 'Habitaciones disponibles por inmueble', sub: 'Hoy',
          grafico: h.porInmueble.some((i) => i.disponibles) ? barrasH(h.porInmueble.filter((i) => i.disponibles).map((i) => ({ etiqueta: i.codigo, valor: i.disponibles, enlace: '#/inmuebles/' + i.id, detalle: i.ocupadas + '/' + i.total + ' ocupadas' })), (v) => v + ' libre' + (v === 1 ? '' : 's')) : html`<p class="suave">Ahora mismo no hay habitaciones libres sin reserva.</p>` })}
        ${tarjeta({ titulo: 'Próximas desocupaciones', sub: 'Habitaciones que quedan libres cada mes y aún no tienen reserva',
          grafico: barras({ etiquetas: h.futuras.map((f) => f.periodo), series: [{ nombre: 'Habitaciones', color: '--serie-2', valores: h.futuras.map((f) => f.habitaciones) }], formato: (v) => Math.round(v) }),
          tabla: { cabeceras: ['Mes', 'Habitaciones'], filas: h.futuras.map((f) => [mesLargo(f.periodo), f.habitaciones]) } })}
      </div>
      ${d.pagos ? html`
      <h2 class="mt-g">Pagos</h2>
      <div class="cifras mt">
        <div class="cifra"><span class="etq"><span class="punto p-disponible"></span>Recibido</span><span class="valor">${euros(d.pagos.totales.pagado)}</span><span class="sub">${per}</span></div>
        <div class="cifra"><span class="etq">Pendiente</span><span class="valor">${euros(d.pagos.totales.pendiente)}</span></div>
        <div class="cifra"><span class="etq"><span class="punto p-por_liberar"></span>Atrasado</span><span class="valor">${euros(d.pagos.totales.vencido)}</span><span class="sub">${d.pagos.incidencias.vencidos} recibos</span></div>
        <div class="cifra"><span class="etq">Incidencias de pago</span><span class="valor">${d.pagos.incidencias.pagadosConRetraso + d.pagos.incidencias.vencidos}</span><span class="sub">${d.pagos.incidencias.pagadosConRetraso} con retraso · ${d.pagos.incidencias.parciales} parciales · ${d.pagos.incidencias.vencidos} sin cobrar</span></div>
      </div>
      <div class="mt">${tarjeta({ titulo: 'Evolución mensual de ingresos', sub: 'Importe de los recibos de cada mes según su estado',
        series: [{ nombre: 'Cobrado', color: '--g-bueno' }, { nombre: 'Pendiente', color: '--g-aviso' }, { nombre: 'Atrasado', color: '--g-critico' }],
        grafico: barras({ etiquetas: meses, series: [{ nombre: 'Cobrado', color: '--g-bueno', valores: d.pagos.porMes.map((m) => m.pagado) }, { nombre: 'Pendiente', color: '--g-aviso', valores: d.pagos.porMes.map((m) => m.pendiente) }, { nombre: 'Atrasado', color: '--g-critico', valores: d.pagos.porMes.map((m) => m.vencido) }], formato: eje, ancho: 1040, alto: 260 }),
        tabla: { cabeceras: ['Mes', 'Cobrado', 'Pendiente', 'Atrasado'], filas: d.pagos.porMes.map((m) => [mesLargo(m.periodo), euros(m.pagado), euros(m.pendiente), euros(m.vencido)]) } })}</div>` : ''}
      ${d.otrosIngresos ? html`<div class="mt">${tarjeta({ titulo: 'Otros ingresos registrados a mano', sub: per + ' · ' + euros(d.otrosIngresos.total),
        grafico: barras({ etiquetas: d.otrosIngresos.porMes.map((m) => m.periodo), series: [{ nombre: 'Otros ingresos', color: '--serie-3', valores: d.otrosIngresos.porMes.map((m) => m.importe) }], formato: eje, ancho: 1040, alto: 200 }),
        tabla: { cabeceras: ['Mes', 'Importe'], filas: d.otrosIngresos.porMes.map((m) => [mesLargo(m.periodo), euros(m.importe)]) } })}</div>` : ''}
      ${d.gastos ? html`
      <h2 class="mt-g">Gastos</h2>
      <div class="rejilla r-2 mt">
        ${tarjeta({ titulo: 'Evolución de gastos mensuales', sub: 'Media: ' + euros(d.gastos.mediaMensual) + '/mes',
          grafico: barras({ etiquetas: d.gastos.porMes.map((m) => m.periodo), series: [{ nombre: 'Gastos', color: '--serie-1', valores: d.gastos.porMes.map((m) => m.importe) }], formato: eje }),
          tabla: { cabeceras: ['Mes', 'Gastos'], filas: d.gastos.porMes.map((m) => [mesLargo(m.periodo), euros(m.importe)]) } })}
        ${tarjeta({ titulo: 'Distribución por categoría', sub: per + ' · ' + euros(d.gastos.total),
          grafico: barrasH(d.gastos.porCategoria.map((c) => ({ etiqueta: c.nombre, valor: c.importe, detalle: Math.round((c.importe / (d.gastos.total || 1)) * 100) + ' %' })), (v) => euros(v)) })}
      </div>
      <div class="mt">${tarjeta({ titulo: 'Gastos totales por inmueble', sub: per,
        grafico: barrasH(d.gastos.porInmueble.map((i) => ({ etiqueta: i.codigo, valor: i.importe, enlace: '#/inmuebles/' + i.id })), (v) => euros(v)) })}</div>` : ''}`);
  };
  $('#periodo', el).append(selectorPeriodo(estado, pintar));
  await pintar();
}
