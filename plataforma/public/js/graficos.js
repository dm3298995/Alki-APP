/* ==========================================================================
   graficos.js — GRÁFICOS SVG SIN LIBRERÍAS
   · Barras, barras apiladas/agrupadas, línea y barras horizontales.
   · Paleta validada para daltonismo; un solo eje; trazos finos.
   · Al pasar el ratón (o tocar) se ve el detalle; cada gráfico tiene "Ver
     tabla" para consultar los números exactos (accesibilidad).
   ========================================================================== */
import { html, crudo, esc, mesCorto } from './ui.js';

let ANCHO = 520; // ancho lógico del SVG (los gráficos a todo el ancho usan ancho: 1040)
const M = { arriba: 14, derecha: 8, abajo: 26, izquierda: 46 };

// Máximo "redondo" para el eje (p. ej. 1.234 → 1.500)
function techo(v) {
  if (v <= 0) return 1;
  const e = 10 ** Math.floor(Math.log10(v));
  return [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].map((m) => m * e).find((m) => m >= v);
}

const tt = (titulo, filas) => esc(JSON.stringify({ t: titulo, f: filas }));

function ejeY(max, alto, formato) {
  const lineas = [];
  for (let i = 0; i <= 4; i++) {
    const v = (max / 4) * i, y = M.arriba + (alto - M.arriba - M.abajo) * (1 - i / 4);
    lineas.push(`<line class="${i ? 'rejilla-l' : 'eje'}" x1="${M.izquierda}" x2="${ANCHO - M.derecha}" y1="${y}" y2="${y}"/>` +
      `<text x="${M.izquierda - 6}" y="${y + 4}" text-anchor="end">${esc(formato(v))}</text>`);
  }
  return lineas.join('');
}

function etiquetasX(etqs, x, ancho, alto) {
  const paso = Math.ceil(etqs.length / Math.floor(ANCHO / 54)); // evita que se pisen
  return etqs.map((e, i) => (i % paso ? '' : `<text x="${x(i) + ancho / 2}" y="${alto - 8}" text-anchor="middle">${esc(e)}</text>`)).join('');
}

/* Barras (una serie o varias apiladas).
   series: [{ nombre, color (var CSS), valores: [] }]  etiquetas: [AAAA-MM o texto] */
export function barras({ etiquetas, series, formato = (v) => v, alto = 230, apilado = true, nombresX, ancho: anchoSvg = 520 }) {
  ANCHO = anchoSvg;
  const n = etiquetas.length;
  const totales = etiquetas.map((_, i) => (apilado ? series.reduce((s, se) => s + (se.valores[i] || 0), 0) : Math.max(...series.map((se) => se.valores[i] || 0))));
  const max = techo(Math.max(...totales, 0));
  const zona = ANCHO - M.izquierda - M.derecha;
  const banda = zona / n;
  const anchoBarra = Math.min(42, banda * 0.62);
  const x = (i) => M.izquierda + banda * i + (banda - anchoBarra) / 2;
  const h = alto - M.arriba - M.abajo;
  const y = (v) => M.arriba + h * (1 - v / max);
  const etq = nombresX || etiquetas.map((e) => (/^\d{4}-\d{2}$/.test(e) ? mesCorto(e) : e));
  let marcas = '';
  etiquetas.forEach((_, i) => {
    let base = 0;
    const filasTt = [];
    const grupo = apilado ? 1 : series.length;
    series.forEach((se, k) => {
      const v = se.valores[i] || 0;
      filasTt.push([se.color, se.nombre, formato(v, true)]);
      if (!v) return;
      const ancho = apilado ? anchoBarra : (anchoBarra - (grupo - 1) * 2) / grupo;
      const xx = apilado ? x(i) : x(i) + k * (ancho + 2);
      const y1 = y(apilado ? base + v : v), y0 = y(apilado ? base : 0);
      const alto1 = Math.max(1, y0 - y1 - (apilado && base ? 2 : 0)); // 2px de separación entre segmentos
      const arriba = !apilado || k === series.length - 1 || series.slice(k + 1).every((s) => !s.valores[i]);
      const r = arriba ? Math.min(4, ancho / 2, alto1) : 0;
      marcas += r
        ? `<path class="marca c${se.color.slice(1)}" d="M${xx},${y1 + alto1} V${y1 + r} Q${xx},${y1} ${xx + r},${y1} H${xx + ancho - r} Q${xx + ancho},${y1} ${xx + ancho},${y1 + r} V${y1 + alto1} Z"/>`
        : `<rect class="marca c${se.color.slice(1)}" x="${xx}" y="${y1}" width="${ancho}" height="${alto1}"/>`;
      if (apilado) base += v;
    });
    if (apilado && series.length > 1) filasTt.push(['', 'Total', formato(totales[i], true)]);
    marcas += `<rect class="zona-hover" x="${M.izquierda + banda * i}" y="${M.arriba}" width="${banda}" height="${h}" data-tt="${tt(etiquetaLarga(etiquetas[i], nombresX?.[i]), filasTt)}"/>`;
  });
  return crudo(`<svg class="grafico" viewBox="0 0 ${ANCHO} ${alto}" role="img" aria-label="Gráfico de barras">${ejeY(max, alto, formato)}${marcas}${etiquetasX(etq, (i) => M.izquierda + banda * i, banda, alto)}</svg>`);
}

/* Línea (una serie), con puntos y zona de detalle por mes */
export function linea({ etiquetas, valores, formato = (v) => v, alto = 230, maximo, color = '--serie-1', nombre = 'Valor', ancho: anchoSvg = 520 }) {
  ANCHO = anchoSvg;
  const n = etiquetas.length;
  const max = maximo ?? techo(Math.max(...valores, 0));
  const zona = ANCHO - M.izquierda - M.derecha;
  const banda = zona / n;
  const h = alto - M.arriba - M.abajo;
  const x = (i) => M.izquierda + banda * i + banda / 2;
  const y = (v) => M.arriba + h * (1 - v / max);
  const d = valores.map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(v).toFixed(1)).join(' ');
  const area = d + ` L${x(n - 1)},${y(0)} L${x(0)},${y(0)} Z`;
  let puntos = '';
  valores.forEach((v, i) => {
    puntos += `<rect class="zona-hover" x="${M.izquierda + banda * i}" y="${M.arriba}" width="${banda}" height="${h}" data-tt="${tt(etiquetaLarga(etiquetas[i]), [[color, nombre, formato(v, true)]])}"/>`;
    puntos += `<circle class="c${color.slice(1)}" cx="${x(i)}" cy="${y(v)}" r="${n > 18 ? 3 : 4}" stroke="#fff" stroke-width="2" pointer-events="none"/>`;
  });
  // Etiqueta directa del último valor
  const ult = n ? `<text class="valor-txt" x="${x(n - 1)}" y="${y(valores[n - 1]) - 10}" text-anchor="end">${esc(formato(valores[n - 1], true))}</text>` : '';
  const etq = etiquetas.map((e) => (/^\d{4}-\d{2}$/.test(e) ? mesCorto(e) : e));
  return crudo(`<svg class="grafico" viewBox="0 0 ${ANCHO} ${alto}" role="img" aria-label="Gráfico de línea">${ejeY(max, alto, formato)}` +
    `<path class="c${color.slice(1)}" d="${area}" opacity="0.08"/><path class="t${color.slice(1)}" d="${d}" fill="none" stroke-width="2" stroke-linejoin="round"/>${puntos}${ult}${etiquetasX(etq, (i) => M.izquierda + banda * i, banda, alto)}</svg>`);
}

/* Barras horizontales (HTML): para comparar inmuebles o categorías */
export function barrasH(lista, formato = (v) => v) {
  const max = Math.max(...lista.map((l) => l.valor), 1);
  if (!lista.length) return html`<p class="vacio">Sin datos en este periodo.</p>`;
  return html`<div class="barras-h">${lista.map((l) => html`<div class="fila" data-tt="${crudo(tt(l.etiqueta, [['--serie-1', l.detalle || '', formato(l.valor, true)]]))}">
    <span>${l.enlace ? html`<a href="${l.enlace}">${l.etiqueta}</a>` : l.etiqueta}</span><div class="pista"><i data-ancho="${(l.valor / max) * 100}"></i></div><b>${formato(l.valor, true)}</b></div>`)}</div>`;
}

const etiquetaLarga = (e, nombre) => nombre || (/^\d{4}-\d{2}$/.test(e) ? ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'][Number(e.slice(5)) - 1] + ' ' + e.slice(0, 4) : e);

export const leyenda = (series) => html`<div class="leyenda">${series.map((s) => html`<span><i class="${'c' + s.color.slice(1)}"></i>${s.nombre}</span>`)}</div>`;

/* Tarjeta de gráfico con botón "Ver tabla" */
export function tarjeta({ titulo, sub, grafico, tabla, series, extra }) {
  const id = 't' + Math.random().toString(36).slice(2, 8);
  return html`<section class="tarjeta">
    <header><div><h2>${titulo}</h2>${sub ? html`<p>${sub}</p>` : ''}</div>${tabla ? html`<button class="enlace alternar-tabla" data-alternar="${id}" aria-expanded="false">Ver tabla</button>` : ''}</header>
    ${series && series.length > 1 ? leyenda(series) : ''}
    <div data-vista="${id}">${grafico}</div>
    ${tabla ? html`<div class="tabla-env oculto" data-tabla="${id}"><table><thead><tr>${tabla.cabeceras.map((c, i) => html`<th class="${i ? 'der' : ''}">${c}</th>`)}</tr></thead><tbody>${tabla.filas.map((f) => html`<tr>${f.map((c, i) => html`<td class="${i ? 'der num' : ''}">${c}</td>`)}</tr>`)}</tbody></table></div>` : ''}
    ${extra || ''}
  </section>`;
}

// ---------- Comportamiento global: tooltip y alternar tabla ----------
export function activarGraficos() {
  const caja = document.getElementById('tooltip');
  const mostrar = (el, ev) => {
    let datos; try { datos = JSON.parse(el.dataset.tt); } catch { return; }
    caja.replaceChildren();
    const t = document.createElement('b'); t.textContent = datos.t; caja.append(t);
    for (const [color, nombre, valor] of datos.f) {
      const f = document.createElement('div'); f.className = 'fila-tt';
      if (color) { const i = document.createElement('i'); i.className = 'c' + color.slice(1); f.append(i); }
      f.append(document.createTextNode((nombre ? nombre + ': ' : '') + valor));
      caja.append(f);
    }
    caja.classList.remove('oculto');
    const r = caja.getBoundingClientRect();
    const x = Math.min(ev.clientX + 14, window.innerWidth - r.width - 8), y = ev.clientY - r.height - 12;
    caja.style.left = Math.max(8, x) + 'px'; caja.style.top = (y < 8 ? ev.clientY + 18 : y) + 'px';
  };
  document.addEventListener('pointermove', (ev) => {
    const el = ev.target.closest?.('[data-tt]');
    if (el) mostrar(el, ev); else caja.classList.add('oculto');
  });
  document.addEventListener('pointerleave', () => caja.classList.add('oculto'));
  document.addEventListener('scroll', () => caja.classList.add('oculto'), true);
  document.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-alternar]'); if (!b) return;
    const id = b.dataset.alternar;
    const tabla = document.querySelector(`[data-tabla="${id}"]`), vista = document.querySelector(`[data-vista="${id}"]`);
    const ver = tabla.classList.contains('oculto');
    tabla.classList.toggle('oculto', !ver); vista.classList.toggle('oculto', ver);
    b.textContent = ver ? 'Ver gráfico' : 'Ver tabla'; b.setAttribute('aria-expanded', String(ver));
  });
}
