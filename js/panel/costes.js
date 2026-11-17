/* ==========================================================================
   panel/costes.js — COSTES Y BENEFICIO REAL DE CADA PISO
   --------------------------------------------------------------------------
   Cada gasto se apunta con su categoría, importe, fecha y si se repite:
     puntual    → cuenta entero en el mes de la fecha
     mensual    → cuenta cada mes desde la fecha
     trimestral → se reparte entre 3 meses (importe ÷ 3 cada mes)
     anual      → se reparte entre 12 meses (importe ÷ 12 cada mes), p. ej. el IBI
   Beneficio del piso en un mes =
     ingresos (rentas de los contratos) − renta al propietario − gastos del mes
     − coste de las incidencias resueltas ese mes.
   Los gastos sin vivienda son "generales" (oficina, gestoría…) y solo
   cuentan en el total de la empresa.
   ========================================================================== */
window.Alki = window.Alki || {};
Alki.panel = Alki.panel || {};

(function () {
  const S = Alki.store, U = Alki.ui, F = Alki.fechas;
  const esc = U.esc, ic = U.icono;

  const categorias = {
    suministros: { nombre: 'Suministros', conceptos: ['Luz', 'Agua', 'Gas', 'Internet'] },
    mantenimiento: { nombre: 'Mantenimiento', conceptos: ['Fontanería', 'Electricidad', 'Electrodomésticos', 'Cerrajería', 'Pintura'] },
    limpieza: { nombre: 'Limpieza', conceptos: ['Limpieza semanal', 'Limpieza a fondo', 'Productos de limpieza'] },
    comunidad: { nombre: 'Comunidad', conceptos: ['Cuota de comunidad', 'Derrama'] },
    seguros: { nombre: 'Seguros', conceptos: ['Seguro de hogar', 'Seguro de impago'] },
    impuestos: { nombre: 'Impuestos y tasas', conceptos: ['IBI', 'Tasa de basuras', 'IVA', 'Impuesto de sociedades'] },
    gestion: { nombre: 'Gestión y comercial', conceptos: ['Publicidad', 'Comisión', 'Gestoría', 'Software'] },
    mobiliario: { nombre: 'Mobiliario', conceptos: ['Muebles', 'Colchones', 'Menaje'] },
    otros: { nombre: 'Otros', conceptos: [] }
  };
  const recurrencias = { puntual: 'Puntual', mensual: 'Cada mes', trimestral: 'Trimestral (÷3 al mes)', anual: 'Anual (÷12 al mes)' };
  const factor = { mensual: 1, trimestral: 1 / 3, anual: 1 / 12 };

  /* ======================================================================
     CÁLCULOS
     ====================================================================== */
  const gastos = () => (S.db.costes = S.db.costes || []);
  const ultimoDia = (per) => F.fecha(new Date(Number(per.slice(0, 4)), Number(per.slice(5, 7)), 0));

  // Cuánto cuenta un gasto en un mes concreto
  function importeEnMes(g, per) {
    const desde = g.fecha.slice(0, 7);
    if (per < desde) return 0;
    if (g.recurrencia === 'puntual' || !g.recurrencia) return per === desde ? g.importe : 0;
    if (g.hasta && per > g.hasta) return 0;
    return g.importe * factor[g.recurrencia];
  }
  // Mes en que se apunta el coste de una incidencia: cuando se resolvió (o cuando se abrió)
  function mesIncidencia(i) {
    const fin = i.historial.filter((h) => h.estado === 'resuelta').pop();
    return (fin ? fin.fecha : i.creada).slice(0, 7);
  }

  // Resultado de una vivienda en uno o varios meses
  function resultado(vId, periodos, base) {
    const v = S.buscar('viviendas', vId);
    const habs = S.habitacionesDe(vId).map((h) => h.id);
    const r = { ingresos: 0, rentaPropietario: 0, porCategoria: {}, costes: 0, beneficio: 0, margen: null, sinRenta: !v.rentaPropietario, detalleIncidencias: [] };
    Object.keys(categorias).forEach((k) => { r.porCategoria[k] = 0; });
    periodos.forEach(function (per) {
      const ini = per + '-01', fin = ultimoDia(per);
      if (base === 'cobrado') {
        r.ingresos += S.db.pagos.filter((p) => p.periodo === per && p.pagadoEl && p.concepto !== 'Fianza' && habs.includes(S.buscar('contratos', p.contratoId).habitacionId)).reduce((s, p) => s + p.importe, 0);
      } else {
        r.ingresos += S.db.contratos.filter((c) => habs.includes(c.habitacionId) && c.inicio <= fin && c.fin >= ini).reduce((s, c) => s + c.renta + c.servicios, 0);
      }
      if (v.rentaPropietario && (!v.contratoInicio || per >= v.contratoInicio.slice(0, 7)) && (!v.contratoFin || per <= v.contratoFin.slice(0, 7))) r.rentaPropietario += v.rentaPropietario;
      gastos().filter((g) => g.viviendaId === vId).forEach((g) => { r.porCategoria[g.categoria] = (r.porCategoria[g.categoria] || 0) + importeEnMes(g, per); });
      S.db.incidencias.filter((i) => i.viviendaId === vId && i.coste > 0 && mesIncidencia(i) === per).forEach(function (i) {
        r.porCategoria.mantenimiento += i.coste;
        r.detalleIncidencias.push(i);
      });
    });
    r.costes = r.rentaPropietario + Object.values(r.porCategoria).reduce((s, x) => s + x, 0);
    r.beneficio = r.ingresos - r.costes;
    r.margen = r.ingresos ? Math.round((r.beneficio / r.ingresos) * 100) : null;
    return r;
  }
  function generales(periodos) {
    const porCategoria = {};
    let total = 0;
    gastos().filter((g) => !g.viviendaId).forEach(function (g) {
      const x = periodos.reduce((s, per) => s + importeEnMes(g, per), 0);
      porCategoria[g.categoria] = (porCategoria[g.categoria] || 0) + x;
      total += x;
    });
    return { porCategoria, total };
  }

  // Periodo elegido: un mes (m=AAAA-MM) o un año (a=AAAA, hasta el mes actual si es este año)
  function periodoDe(q) {
    const hoy = new Date(), actual = F.periodo(hoy);
    if (q.a) {
      const a = Number(q.a), meses = [];
      for (let n = 1; n <= 12; n++) { const per = a + '-' + F.pad(n); if (per <= actual || a < hoy.getFullYear()) meses.push(per); }
      return { modo: 'anio', valor: String(a), periodos: meses, titulo: a === hoy.getFullYear() ? a + ' (hasta ' + U.mes(actual).toLowerCase() + ')' : String(a) };
    }
    const m = /^\d{4}-\d{2}$/.test(q.m || '') ? q.m : actual;
    return { modo: 'mes', valor: m, periodos: [m], titulo: U.mes(m) };
  }

  /* ======================================================================
     PIEZAS VISUALES
     ====================================================================== */
  const pct = (x) => (x === null ? '—' : x + ' %');
  const claseSigno = (x) => (x > 0 ? 'positivo' : x < 0 ? 'negativo' : '');

  // Barras horizontales de beneficio (positivo a la derecha del cero, negativo a la izquierda)
  function barrasBeneficio(filas) {
    if (!filas.length) return '';
    const min = Math.min(0, ...filas.map((f) => f.valor)), max = Math.max(0, ...filas.map((f) => f.valor));
    const rango = max - min || 1;
    const cero = (-min / rango) * 100;
    return '<div class="grafica" role="img" aria-label="Beneficio por vivienda. Los datos están en la tabla de abajo.">' +
      filas.map(function (f) {
        const ancho = (Math.abs(f.valor) / rango) * 100;
        const izq = f.valor >= 0 ? cero : cero - ancho;
        return '<a class="grafica__fila" href="#' + f.enlace + '" title="' + esc(f.titulo) + '">' +
          '<span class="grafica__etiqueta">' + esc(f.etiqueta) + '</span>' +
          '<span class="grafica__pista"><i class="grafica__cero" style="left:' + cero + '%"></i>' +
          '<i class="grafica__barra ' + (f.valor < 0 ? 'grafica__barra--neg' : '') + '" style="left:' + izq + '%;width:' + Math.max(ancho, 0.6) + '%"></i></span>' +
          '<span class="grafica__valor ' + claseSigno(f.valor) + '">' + U.euro(f.valor) + '</span></a>';
      }).join('') + '</div>';
  }
  // Desglose de costes por categoría con barras proporcionales
  function desglose(r, extra) {
    const filas = [['Renta al propietario', r.rentaPropietario]].concat(Object.keys(categorias).map((k) => [categorias[k].nombre, r.porCategoria[k] || 0])).concat(extra || []).filter((f) => f[1] > 0);
    const total = filas.reduce((s, f) => s + f[1], 0);
    if (!total) return U.vacio('No hay costes en este periodo.');
    return '<ul class="desglose">' + filas.sort((a, b) => b[1] - a[1]).map((f) =>
      '<li><span>' + esc(f[0]) + '</span><span class="desglose__pista"><i style="width:' + (f[1] / total * 100) + '%"></i></span><strong class="num">' + U.euro(f[1]) + '</strong></li>').join('') + '</ul>';
  }
  function controles(base, per, q, puedeEditar, vId) {
    const hoy = new Date();
    const meses = [];
    for (let n = -12; n <= 1; n++) meses.push(F.periodo(F.sumarMeses(hoy, n, 1)));
    const anios = [hoy.getFullYear() - 1, hoy.getFullYear(), hoy.getFullYear() + 1];
    const b = q.b === 'cobrado' ? 'cobrado' : 'previsto';
    const enlace = (extra) => '#' + base + '?' + extra + '&b=' + b;
    return '<div class="controles">' +
      '<nav class="chips chips--filtro" aria-label="Periodo"><a href="' + enlace('m=' + F.periodo(hoy)) + '"' + (per.modo === 'mes' ? ' aria-current="true"' : '') + '>Mes</a>' +
      '<a href="' + enlace('a=' + hoy.getFullYear()) + '"' + (per.modo === 'anio' ? ' aria-current="true"' : '') + '>Año</a></nav>' +
      (per.modo === 'mes'
        ? '<label class="oculto" for="sel-periodo">Mes</label><select id="sel-periodo" data-base="' + base + '" data-param="m" data-b="' + b + '">' + meses.reverse().map((m) => '<option value="' + m + '"' + (m === per.valor ? ' selected' : '') + '>' + U.mes(m) + '</option>').join('') + '</select>'
        : '<label class="oculto" for="sel-periodo">Año</label><select id="sel-periodo" data-base="' + base + '" data-param="a" data-b="' + b + '">' + anios.map((a) => '<option value="' + a + '"' + (String(a) === per.valor ? ' selected' : '') + '>' + a + '</option>').join('') + '</select>') +
      '<nav class="chips chips--filtro" aria-label="Ingresos"><a href="#' + base + '?' + (per.modo === 'mes' ? 'm=' : 'a=') + per.valor + '&b=previsto"' + (b === 'previsto' ? ' aria-current="true"' : '') + '>Previsto</a>' +
      '<a href="#' + base + '?' + (per.modo === 'mes' ? 'm=' : 'a=') + per.valor + '&b=cobrado"' + (b === 'cobrado' ? ' aria-current="true"' : '') + '>Cobrado</a></nav>' +
      '<span class="controles__hueco"></span>' +
      '<button class="boton boton--sec" type="button" data-calculadora="' + (vId || '') + '">' + ic('calculadora') + 'Calculadora</button>' +
      (puedeEditar ? '<button class="boton" type="button" data-nuevo-gasto="' + (vId || '') + '">' + ic('mas') + 'Añadir gasto</button>' : '') +
      '</div>';
  }
  function montarControles(raiz) {
    const sel = raiz.querySelector('#sel-periodo');
    if (sel) sel.addEventListener('change', () => Alki.app.ir(sel.dataset.base + '?' + sel.dataset.param + '=' + sel.value + '&b=' + sel.dataset.b));
    raiz.querySelectorAll('[data-nuevo-gasto]').forEach((b) => b.addEventListener('click', () => formGasto({ viviendaId: b.dataset.nuevoGasto || null })));
    raiz.querySelectorAll('[data-calculadora]').forEach((b) => b.addEventListener('click', () => calculadora(b.dataset.calculadora || null)));
  }

  /* ======================================================================
     FORMULARIO DE GASTO (nuevo o editar)
     ====================================================================== */
  function formGasto(o) {
    const g = o.gasto || { viviendaId: o.viviendaId, categoria: 'suministros', concepto: '', importe: '', fecha: F.fecha(new Date()), recurrencia: 'puntual', hasta: '', nota: '' };
    const opcionesViv = '<option value="">General (no es de un piso)</option>' + S.db.viviendas.map((v) => '<option value="' + v.id + '"' + (v.id === g.viviendaId ? ' selected' : '') + '>' + esc(v.codigo + ' · ' + v.alias) + '</option>').join('');
    const sugerencias = Object.values(categorias).flatMap((c) => c.conceptos);
    U.abrirModal(o.gasto ? 'Editar gasto' : 'Añadir gasto',
      '<form id="form-gasto" novalidate>' +
        '<div class="campo"><label for="g-viv">Vivienda</label><select id="g-viv" name="viviendaId">' + opcionesViv + '</select></div>' +
        '<div class="rejilla-2"><div class="campo"><label for="g-cat">Categoría</label><select id="g-cat" name="categoria">' +
          Object.keys(categorias).map((k) => '<option value="' + k + '"' + (k === g.categoria ? ' selected' : '') + '>' + categorias[k].nombre + '</option>').join('') + '</select></div>' +
        '<div class="campo"><label for="g-con">Concepto</label><input id="g-con" name="concepto" type="text" list="conceptos" value="' + esc(g.concepto) + '" placeholder="Luz, IBI, fontanero…"></div></div>' +
        '<datalist id="conceptos">' + sugerencias.map((x) => '<option value="' + esc(x) + '">').join('') + '</datalist>' +
        '<div class="rejilla-2"><div class="campo"><label for="g-imp">Importe (€)</label><input id="g-imp" name="importe" type="text" inputmode="decimal" autocomplete="off" placeholder="0,00" value="' + esc(g.importe === '' ? '' : String(g.importe).replace('.', ',')) + '" required></div>' +
        '<div class="campo"><label for="g-fecha">Fecha</label><input id="g-fecha" name="fecha" type="date" value="' + esc(g.fecha) + '" required></div></div>' +
        '<div class="rejilla-2"><div class="campo"><label for="g-rec">¿Se repite?</label><select id="g-rec" name="recurrencia">' +
          Object.keys(recurrencias).map((k) => '<option value="' + k + '"' + (k === g.recurrencia ? ' selected' : '') + '>' + recurrencias[k] + '</option>').join('') + '</select>' +
          '<p class="campo__ayuda">Un IBI de 600 € anual cuenta 50 € cada mes.</p></div>' +
        '<div class="campo" id="campo-hasta"><label for="g-hasta">Hasta (opcional)</label><input id="g-hasta" name="hasta" type="month" value="' + esc(g.hasta || '') + '"><p class="campo__ayuda">Déjalo vacío si sigue.</p></div></div>' +
        '<div class="campo"><label for="g-nota">Nota (opcional)</label><input id="g-nota" name="nota" type="text" value="' + esc(g.nota || '') + '" placeholder="Nº de factura, proveedor…"></div>' +
        '<div class="campo"><span class="campo__titulo">Factura o ticket (foto)</span>' + (g.factura ? U.galeria([g.factura]) : '') + U.selectorFotos(1) + '</div>' +
        '<p class="error-form" hidden></p><button class="boton boton--bloque" type="submit">' + (o.gasto ? 'Guardar cambios' : 'Añadir gasto') + '</button>' +
      '</form>',
      {
        alMontar: function (m) {
          const form = m.querySelector('form');
          const fotos = U.montarSelectorFotos(form);
          const rec = form.querySelector('#g-rec'), hasta = form.querySelector('#campo-hasta');
          const cat = form.querySelector('#g-cat'), con = form.querySelector('#g-con');
          const verHasta = () => { hasta.hidden = rec.value === 'puntual'; };
          verHasta(); rec.addEventListener('change', verHasta);
          cat.addEventListener('change', () => { if (!con.value && categorias[cat.value].conceptos[0]) con.placeholder = categorias[cat.value].conceptos.join(', '); });
          form.addEventListener('submit', function (e) {
            e.preventDefault();
            const d = U.datosFormulario(form);
            // Acepta "48,50", "48.50" y "1.250,00"
            const txt = String(d.importe).trim();
            const importe = Number(/,\d{1,2}$/.test(txt) ? txt.replace(/\./g, '').replace(',', '.') : txt.replace(/,/g, ''));
            const err = form.querySelector('.error-form');
            if (!(importe > 0) || !d.fecha) { err.textContent = 'Indica un importe mayor que 0 y una fecha.'; err.hidden = false; return; }
            form.querySelector('button[type=submit]').disabled = true;
            U.guardarFotos(fotos()).then(function (ids) {
              const datos = {
                viviendaId: d.viviendaId || null, categoria: d.categoria, concepto: d.concepto || categorias[d.categoria].nombre, importe: Math.round(importe * 100) / 100,
                fecha: d.fecha, recurrencia: d.recurrencia, hasta: d.recurrencia === 'puntual' ? null : (d.hasta || null), nota: d.nota
              };
              if (ids[0]) datos.factura = ids[0];
              const ses = Alki.panel.equipo.sesion();
              const nombreV = datos.viviendaId ? S.buscar('viviendas', datos.viviendaId).codigo : 'General';
              if (o.gasto) {
                Object.assign(o.gasto, datos);
                Alki.panel.equipo.registrar('Ha editado un gasto', nombreV + ' · ' + datos.concepto + ' · ' + U.euro(datos.importe));
              } else {
                gastos().push(Object.assign({ id: 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), creadoPor: ses ? ses.nombre : '', creado: new Date().toISOString() }, datos));
                Alki.panel.equipo.registrar('Ha añadido un gasto', nombreV + ' · ' + datos.concepto + ' · ' + U.euro(datos.importe));
              }
              S.guardar();
              U.cerrarModal();
              U.toast(o.gasto ? 'Gasto actualizado' : 'Gasto añadido');
              Alki.app.refrescar();
            });
          });
        }
      });
  }

  /* ======================================================================
     CALCULADORA DE RENTABILIDAD (simulador)
     ====================================================================== */
  function calculadora(vId) {
    const v = vId ? S.buscar('viviendas', vId) : null;
    let ini = { total: 5, ocupadas: 5, precio: 450, renta: 1500, suministros: 250, mantenimiento: 60, limpieza: 80, impuestos: 60, otros: 30 };
    if (v) {
      const habs = S.habitacionesDe(v.id);
      const ocupadas = habs.filter((h) => S.estadoHabitacion(h) === 'ocupada');
      const precios = habs.map((h) => { const c = S.contratoDeHabitacion(h.id); return c ? c.renta + c.servicios : h.precio; });
      // Media de los gastos de los últimos 3 meses
      const hoy = new Date();
      const ult = [-3, -2, -1].map((n) => F.periodo(F.sumarMeses(hoy, n, 1)));
      const r = resultado(v.id, ult, 'previsto');
      const media = (k) => Math.round((r.porCategoria[k] || 0) / 3);
      ini = {
        total: habs.length, ocupadas: ocupadas.length, precio: Math.round(precios.reduce((s, x) => s + x, 0) / (precios.length || 1)), renta: v.rentaPropietario || 0,
        suministros: media('suministros'), mantenimiento: media('mantenimiento'), limpieza: media('limpieza'),
        impuestos: media('impuestos') + media('seguros') + media('comunidad'), otros: media('gestion') + media('mobiliario') + media('otros')
      };
    }
    const campo = (id, et, val, ayuda) => '<div class="campo"><label for="c-' + id + '">' + et + '</label><input id="c-' + id + '" data-c="' + id + '" type="text" inputmode="decimal" autocomplete="off" value="' + val + '">' + (ayuda ? '<p class="campo__ayuda">' + ayuda + '</p>' : '') + '</div>';
    U.abrirModal('Calculadora' + (v ? ' · ' + v.codigo : ''),
      '<p class="suave pequeno" style="margin-bottom:14px">' + (v ? 'Rellenada con los datos actuales del piso y la media de gastos de los últimos 3 meses. ' : '') + 'Cambia cualquier número para simular.</p>' +
      '<div class="calc"><div class="calc__datos">' +
        '<h3>Ingresos</h3><div class="rejilla-2">' + campo('total', 'Habitaciones', ini.total) + campo('ocupadas', 'Ocupadas', ini.ocupadas) + '</div>' +
        campo('precio', 'Precio medio por habitación (€/mes)', ini.precio) +
        '<h3>Costes al mes</h3>' + campo('renta', 'Renta al propietario', ini.renta) +
        '<div class="rejilla-2">' + campo('suministros', 'Suministros', ini.suministros) + campo('mantenimiento', 'Mantenimiento', ini.mantenimiento) +
        campo('limpieza', 'Limpieza', ini.limpieza) + campo('impuestos', 'Impuestos, seguros y comunidad', ini.impuestos) + '</div>' +
        campo('otros', 'Otros', ini.otros) +
      '</div><div class="calc__resultado" aria-live="polite"></div></div>',
      {
        ancho: true,
        alMontar: function (m) {
          const out = m.querySelector('.calc__resultado');
          function calcular() {
            const x = {};
            m.querySelectorAll('[data-c]').forEach((i) => { x[i.dataset.c] = Math.max(0, Number(String(i.value).replace(/\./g, '').replace(',', '.')) || 0); });
            x.ocupadas = Math.min(x.ocupadas, x.total);
            const ingresos = x.ocupadas * x.precio;
            const costes = x.renta + x.suministros + x.mantenimiento + x.limpieza + x.impuestos + x.otros;
            const beneficio = ingresos - costes;
            const margen = ingresos ? Math.round(beneficio / ingresos * 100) : 0;
            const minimo = x.precio ? Math.ceil(costes / x.precio) : null;
            out.innerHTML =
              '<p class="suave pequeno">Beneficio al mes</p><p class="calc__cifra ' + claseSigno(beneficio) + '">' + U.euro(beneficio) + '</p>' +
              '<dl class="calc__lista">' +
                '<div><dt>Ingresos</dt><dd>' + U.euro(ingresos) + '</dd></div><div><dt>Costes</dt><dd>' + U.euro(costes) + '</dd></div>' +
                '<div><dt>Margen</dt><dd class="' + claseSigno(beneficio) + '">' + margen + ' %</dd></div><div><dt>Al año</dt><dd class="' + claseSigno(beneficio) + '">' + U.euro(beneficio * 12) + '</dd></div>' +
                '<div><dt>Ocupación</dt><dd>' + (x.total ? Math.round(x.ocupadas / x.total * 100) : 0) + ' %</dd></div>' +
              '</dl>' +
              '<p class="calc__nota">' + (minimo === null ? '' : minimo > x.total
                ? 'Ni con todas las habitaciones ocupadas se cubren los costes: hay que subir precios o bajar gastos.'
                : 'Para no perder dinero necesitas <strong>' + minimo + ' de ' + x.total + '</strong> habitaciones ocupadas a ese precio.') + '</p>';
          }
          m.querySelectorAll('[data-c]').forEach((i) => i.addEventListener('input', calcular));
          calcular();
        }
      });
  }

  /* ======================================================================
     IMPORTAR GASTOS DESDE CSV (por ejemplo, exportados del banco o de Excel)
     ====================================================================== */
  const PLANTILLA = 'vivienda;categoria;concepto;importe;fecha;recurrencia;hasta\n' +
    'Alb20;Suministros;Luz;85,40;01/11/2026;puntual;\n' +
    'Alb20;Suministros;Internet;35,00;01/11/2026;mensual;\n' +
    'Alb20;Impuestos y tasas;IBI;620,00;01/01/2026;anual;\n' +
    'General;Gestión y comercial;Gestoría;150,00;01/11/2026;mensual;\n';
  function importarGastos(texto) {
    const t = Alki.leerCSV(texto);
    ['vivienda', 'categoria', 'importe', 'fecha'].forEach((c) => { if (!t.cabeceras.includes(c)) throw new Error('Falta la columna «' + c + '». Descarga la plantilla para ver el formato.'); });
    const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    const errores = [], nuevos = [];
    t.filas.forEach(function (f, n) {
      const linea = n + 2;
      let vId = null;
      if (f.vivienda && !['general', 'empresa', 'oficina'].includes(norm(f.vivienda))) {
        const v = S.db.viviendas.find((x) => norm(x.codigo) === norm(f.vivienda) || norm(x.alias) === norm(f.vivienda) || x.numero === String(f.vivienda).padStart(3, '0'));
        if (!v) { errores.push('Línea ' + linea + ': no existe la vivienda «' + f.vivienda + '».'); return; }
        vId = v.id;
      }
      const cat = Object.keys(categorias).find((k) => k === norm(f.categoria) || norm(categorias[k].nombre) === norm(f.categoria) || norm(categorias[k].nombre).indexOf(norm(f.categoria)) === 0) || 'otros';
      const importe = parseFloat(String(f.importe).replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, ''));
      if (!(importe > 0)) { errores.push('Línea ' + linea + ': importe no válido.'); return; }
      let fecha = f.fecha;
      const es = String(fecha).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (es) fecha = es[3] + '-' + F.pad(es[2]) + '-' + F.pad(es[1]);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) { errores.push('Línea ' + linea + ': fecha no válida (usa 01/11/2026).'); return; }
      const rec = Object.keys(recurrencias).find((k) => norm(f.recurrencia).indexOf(k.slice(0, 5)) === 0) || 'puntual';
      const hasta = (f.hasta || '').match(/(\d{1,2})\/(\d{4})/) ? f.hasta.replace(/(\d{1,2})\/(\d{4})/, (x, mm, aa) => aa + '-' + F.pad(mm)) : (f.hasta || null);
      nuevos.push({ id: 'g' + Date.now().toString(36) + n + Math.random().toString(36).slice(2, 4), viviendaId: vId, categoria: cat, concepto: f.concepto || categorias[cat].nombre, importe: Math.round(importe * 100) / 100, fecha, recurrencia: rec, hasta: rec === 'puntual' ? null : hasta, nota: 'Importado de CSV', creado: new Date().toISOString() });
    });
    nuevos.forEach((g) => gastos().push(g));
    S.guardar();
    if (nuevos.length) Alki.panel.equipo.registrar('Ha importado gastos desde CSV', nuevos.length + ' gastos');
    return { nuevos: nuevos.length, errores };
  }
  function modalImportarGastos() {
    U.abrirModal('Importar gastos',
      '<p style="margin-bottom:12px">Sube un CSV con una fila por gasto. Columnas: <strong>vivienda</strong> (código, p. ej. Alb20, o «General»), <strong>categoria</strong>, concepto, <strong>importe</strong>, <strong>fecha</strong> (01/11/2026), recurrencia (puntual, mensual, trimestral o anual) y hasta.</p>' +
      '<div class="acciones" style="margin:0 0 16px"><button class="boton boton--sec" type="button" id="plantilla">' + ic('descargar') + 'Descargar plantilla</button></div>' +
      '<form><div class="campo"><label for="csv-g">Archivo CSV</label><input id="csv-g" type="file" accept=".csv,text/csv" required></div>' +
      '<div class="resultado-import" hidden></div><p class="error-form" hidden></p><button class="boton boton--bloque" type="submit">' + ic('subir') + 'Importar gastos</button></form>',
      {
        alMontar: function (m) {
          m.querySelector('#plantilla').addEventListener('click', () => Alki.vistas.admin.utilidades.descargar('plantilla-gastos-alki.csv', '﻿' + PLANTILLA, 'text/csv'));
          m.querySelector('form').addEventListener('submit', function (e) {
            e.preventDefault();
            const f = m.querySelector('#csv-g').files[0], err = m.querySelector('.error-form'), res = m.querySelector('.resultado-import');
            if (!f) return;
            Alki.vistas.admin.utilidades.leerTexto(f).then(function (texto) {
              const r = importarGastos(texto);
              res.hidden = false;
              res.innerHTML = '<p class="positivo"><strong>' + r.nuevos + ' gastos importados.</strong></p>' + (r.errores.length ? '<ul class="pequeno negativo">' + r.errores.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul>' : '');
              if (!r.errores.length) { U.toast(r.nuevos + ' gastos importados'); Alki.app.refrescar(); return; }
              // Con errores, se deja el resumen a la vista hasta que se pulse «Hecho»
              res.insertAdjacentHTML('beforeend', '<button class="boton boton--sec" type="button" id="hecho">Hecho</button>');
              m.querySelector('form button[type=submit]').hidden = true;
              m.querySelector('#hecho').addEventListener('click', () => { U.cerrarModal(); Alki.app.refrescar(); });
            }).catch(function (x) { err.textContent = x.message; err.hidden = false; });
          });
        }
      });
  }

  /* ======================================================================
     PANTALLA: RESUMEN DE COSTES Y BENEFICIO
     ====================================================================== */
  function resumen(p, ses, q) {
    const per = periodoDe(q);
    const base = q.b === 'cobrado' ? 'cobrado' : 'previsto';
    const editar = Alki.panel.equipo.permiso(ses, 'costes') === 'editar';
    const filas = S.db.viviendas.map((v) => ({ v, r: resultado(v.id, per.periodos, base) }));
    const gen = generales(per.periodos);
    const tot = filas.reduce((t, f) => { t.ingresos += f.r.ingresos; t.costes += f.r.costes; t.renta += f.r.rentaPropietario; Object.keys(f.r.porCategoria).forEach((k) => { t.cat[k] = (t.cat[k] || 0) + f.r.porCategoria[k]; }); return t; }, { ingresos: 0, costes: 0, renta: 0, cat: {} });
    tot.costes += gen.total;
    const beneficio = tot.ingresos - tot.costes;
    const sinRenta = filas.filter((f) => f.r.sinRenta);
    const orden = filas.slice().sort((a, b) => b.r.beneficio - a.r.beneficio);
    const otros = (r) => ['limpieza', 'comunidad', 'seguros', 'gestion', 'mobiliario', 'otros'].reduce((s, k) => s + (r.porCategoria[k] || 0), 0);
    const enlace = (v) => '/admin/costes/' + v.id + '?' + (per.modo === 'mes' ? 'm=' : 'a=') + per.valor + '&b=' + base;
    const totalGenerales = Object.keys(gen.porCategoria).map((k) => ['Generales · ' + categorias[k].nombre, gen.porCategoria[k]]);

    return {
      titulo: 'Costes y beneficio',
      html: U.cabecera('Costes y beneficio', { subtitulo: per.titulo + ' · ingresos ' + (base === 'cobrado' ? 'realmente cobrados' : 'previstos según contratos') }) +
        controles('/admin/costes', per, q, editar) +
        '<div class="cifras">' +
          '<div><strong>' + U.euro(tot.ingresos) + '</strong><span>Ingresos</span></div>' +
          '<div><strong>' + U.euro(tot.costes) + '</strong><span>Costes (con renta al propietario)</span></div>' +
          '<div><strong class="' + claseSigno(beneficio) + '">' + U.euro(beneficio) + '</strong><span>Beneficio</span></div>' +
          '<div><strong class="' + claseSigno(beneficio) + '">' + pct(tot.ingresos ? Math.round(beneficio / tot.ingresos * 100) : null) + '</strong><span>Margen</span></div>' +
        '</div>' +
        (sinRenta.length ? '<div class="banda banda--mal" style="margin-top:14px">' + ic('pagos') + '<span><strong>' + sinRenta.length + ' viviendas sin renta al propietario registrada</strong>: su beneficio sale más alto de lo real. Añádela en Viviendas → Datos de la vivienda.</span></div>' : '') +
        '<div class="dos-columnas" style="align-items:start">' +
        '<section class="seccion"><div class="seccion__cab"><h2>Beneficio por vivienda</h2></div><div class="panel">' +
          barrasBeneficio(orden.map((f) => ({ etiqueta: f.v.codigo, valor: f.r.beneficio, enlace: enlace(f.v), titulo: f.v.codigo + ': ' + U.euro(f.r.beneficio) + ' de beneficio · margen ' + pct(f.r.margen) }))) +
        '</div></section>' +
        '<section class="seccion"><div class="seccion__cab"><h2>¿En qué se va el dinero?</h2></div><div class="panel">' +
          desglose({ rentaPropietario: tot.renta, porCategoria: tot.cat }, totalGenerales) + '</div></section></div>' +
        '<section class="seccion"><div class="seccion__cab"><h2>Detalle por vivienda</h2></div>' +
          '<div class="tabla-scroll"><table class="tabla tabla--compacta"><thead><tr><th>Vivienda</th><th class="der">Ingresos</th><th class="der">Renta prop.</th><th class="der">Suministros</th><th class="der">Mantenim.</th><th class="der">Impuestos</th><th class="der">Otros</th><th class="der">Beneficio</th><th class="der">Margen</th></tr></thead><tbody>' +
          orden.map((f) => '<tr><td style="white-space:nowrap"><a href="#' + enlace(f.v) + '"><strong>' + esc(f.v.codigo) + '</strong></a>' + (f.r.sinRenta ? ' <span class="etiqueta etiqueta--aviso">sin renta</span>' : '') + '</td>' +
            '<td class="der">' + U.euro(f.r.ingresos) + '</td><td class="der">' + U.euro(f.r.rentaPropietario) + '</td><td class="der">' + U.euro(f.r.porCategoria.suministros) + '</td>' +
            '<td class="der">' + U.euro(f.r.porCategoria.mantenimiento) + '</td><td class="der">' + U.euro(f.r.porCategoria.impuestos) + '</td><td class="der">' + U.euro(otros(f.r)) + '</td>' +
            '<td class="der ' + claseSigno(f.r.beneficio) + '"><strong>' + U.euro(f.r.beneficio) + '</strong></td><td class="der">' + pct(f.r.margen) + '</td></tr>').join('') +
          (gen.total ? '<tr><td><em>Gastos generales</em></td><td></td><td></td><td></td><td></td><td></td><td class="der">' + U.euro(gen.total) + '</td><td class="der negativo">' + U.euro(-gen.total) + '</td><td></td></tr>' : '') +
          '</tbody><tfoot><tr><td>Total</td><td class="der">' + U.euro(tot.ingresos) + '</td><td class="der">' + U.euro(tot.renta) + '</td><td class="der">' + U.euro(tot.cat.suministros || 0) + '</td><td class="der">' + U.euro(tot.cat.mantenimiento || 0) + '</td><td class="der">' + U.euro(tot.cat.impuestos || 0) + '</td>' +
          '<td class="der">' + U.euro(otros({ porCategoria: tot.cat }) + gen.total) + '</td><td class="der ' + claseSigno(beneficio) + '">' + U.euro(beneficio) + '</td><td class="der">' + pct(tot.ingresos ? Math.round(beneficio / tot.ingresos * 100) : null) + '</td></tr></tfoot></table></div>' +
          '<p class="suave pequeno" style="margin-top:8px">Los gastos anuales y trimestrales se reparten por meses. El mantenimiento incluye el coste de las incidencias resueltas en el periodo.</p>' +
        '</section>' +
        (editar ? '<section class="seccion"><ul class="lista"><li><button class="fila" type="button" id="importar-gastos"><span class="fila__icono">' + ic('subir') + '</span><span class="fila__principal"><span class="fila__titulo">Importar gastos desde CSV</span><span class="fila__meta">Facturas de luz, agua, internet… de varios pisos a la vez</span></span>' + ic('flecha') + '</button></li>' +
          '<li><a class="fila" href="#/admin/costes/general"><span class="fila__icono">' + ic('documentos') + '</span><span class="fila__principal"><span class="fila__titulo">Gastos generales</span><span class="fila__meta">Los que no son de un piso: gestoría, oficina, publicidad…</span></span>' + ic('flecha') + '</a></li></ul></section>' : ''),
      montar: function (raiz) {
        montarControles(raiz);
        const imp = raiz.querySelector('#importar-gastos');
        if (imp) imp.addEventListener('click', modalImportarGastos);
      }
    };
  }

  /* ======================================================================
     PANTALLA: COSTES DE UNA VIVIENDA (o de los gastos generales)
     ====================================================================== */
  function vivienda(p, ses, q) {
    const esGeneral = p.id === 'general';
    const v = esGeneral ? null : S.buscar('viviendas', p.id);
    if (!esGeneral && !v) return { html: U.cabecera('Vivienda no encontrada', { volver: '/admin/costes' }) };
    const per = periodoDe(q);
    const base = q.b === 'cobrado' ? 'cobrado' : 'previsto';
    const editar = Alki.panel.equipo.permiso(ses, 'costes') === 'editar';
    const r = esGeneral ? null : resultado(v.id, per.periodos, base);
    const lista = gastos().filter((g) => (esGeneral ? !g.viviendaId : g.viviendaId === v.id)).sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
    const enPeriodo = (g) => per.periodos.reduce((s, x) => s + importeEnMes(g, x), 0);
    const gen = esGeneral ? generales(per.periodos) : null;

    const filasGasto = lista.map(function (g) {
      const cuenta = enPeriodo(g);
      return '<li class="gasto' + (cuenta ? '' : ' gasto--fuera') + '"><div class="fila">' +
        (g.factura ? '<button class="gasto__factura" type="button" data-ampliar="' + esc(g.factura) + '" aria-label="Ver factura"><img data-foto="' + esc(g.factura) + '" alt=""></button>' : '<span class="fila__icono">' + ic('pagos') + '</span>') +
        '<span class="fila__principal"><span class="fila__titulo">' + esc(g.concepto) + ' <span class="suave pequeno">· ' + categorias[g.categoria].nombre + '</span></span>' +
        '<span class="fila__meta">' + U.fecha(g.fecha) + ' · ' + recurrencias[g.recurrencia] + (g.hasta ? ' hasta ' + U.mes(g.hasta).toLowerCase() : '') + (g.nota ? ' · ' + esc(g.nota) : '') + (g.creadoPor ? ' · ' + esc(U.primerNombre(g.creadoPor)) : '') + '</span></span>' +
        '<span class="fila__fin"><span class="fila__importe">' + U.euro(g.importe) + '</span>' + (cuenta ? '<span class="pequeno suave">' + U.euro(cuenta) + ' en el periodo</span>' : '<span class="pequeno suave">fuera del periodo</span>') + '</span>' +
        (editar ? '<span class="gasto__acciones"><button class="boton-icono" type="button" data-editar="' + g.id + '" aria-label="Editar">' + ic('documentos') + '</button><button class="boton-icono" type="button" data-borrar-gasto="' + g.id + '" aria-label="Borrar">' + ic('papelera') + '</button></span>' : '') +
        '</div></li>';
    }).join('');
    const incs = esGeneral ? [] : r.detalleIncidencias;

    return {
      titulo: esGeneral ? 'Gastos generales' : 'Costes ' + v.codigo,
      html: U.cabecera(esGeneral ? 'Gastos generales' : 'Costes · ' + v.codigo, { volver: '/admin/costes?' + (per.modo === 'mes' ? 'm=' : 'a=') + per.valor + '&b=' + base, volverTexto: 'Costes y beneficio', subtitulo: esGeneral ? 'Gastos de la empresa que no son de un piso concreto.' : esc(v.alias) + ' · ' + per.titulo }) +
        controles('/admin/costes/' + p.id, per, q, editar, esGeneral ? '' : v.id) +
        (esGeneral ? '<div class="cifras cifras--dos"><div><strong>' + U.euro(gen.total) + '</strong><span>Gastos generales del periodo</span></div><div><strong>' + lista.length + '</strong><span>Gastos registrados</span></div></div>'
          : '<div class="cifras">' +
          '<div><strong>' + U.euro(r.ingresos) + '</strong><span>Ingresos ' + (base === 'cobrado' ? 'cobrados' : 'previstos') + '</span></div>' +
          '<div><strong>' + U.euro(r.costes) + '</strong><span>Costes</span></div>' +
          '<div><strong class="' + claseSigno(r.beneficio) + '">' + U.euro(r.beneficio) + '</strong><span>Beneficio</span></div>' +
          '<div><strong class="' + claseSigno(r.beneficio) + '">' + pct(r.margen) + '</strong><span>Margen</span></div></div>' +
          (r.sinRenta ? '<div class="banda banda--mal" style="margin-top:14px">' + ic('pagos') + '<span>Falta la <strong>renta al propietario</strong> de este piso. <a href="#/admin/viviendas/' + v.id + '">Añádela aquí</a>.</span></div>' : '')) +
        '<div class="dos-columnas" style="align-items:start">' +
          (esGeneral ? '' : '<section class="seccion"><h2 style="margin-bottom:10px">Desglose de costes</h2><div class="panel">' + desglose(r) + '</div></section>') +
          '<section class="seccion"><div class="seccion__cab"><h2>Gastos registrados</h2><span class="suave pequeno">' + lista.length + '</span></div>' +
            (lista.length ? '<ul class="lista">' + filasGasto + '</ul>' : U.vacio('Todavía no hay gastos. Añade la luz, el agua, el IBI…', editar ? '<button class="boton" type="button" data-nuevo-gasto="' + (esGeneral ? '' : v.id) + '">' + ic('mas') + 'Añadir gasto</button>' : '')) +
            (incs.length ? '<h3 style="font-size:1rem;margin:18px 0 8px">Incidencias con coste en el periodo</h3><ul class="lista">' + incs.map((i) =>
              '<li><a class="fila" href="#/admin/incidencias/' + i.id + '"><span class="fila__icono">' + ic('incidencias') + '</span><span class="fila__principal"><span class="fila__titulo">' + esc(i.titulo) + '</span><span class="fila__meta">' + esc(i.proveedor || 'Sin proveedor') + '</span></span><span class="fila__importe">' + U.euro(i.coste) + '</span></a></li>').join('') + '</ul>' : '') +
          '</section></div>',
      montar: function (raiz) {
        montarControles(raiz);
        raiz.querySelectorAll('[data-editar]').forEach((b) => b.addEventListener('click', () => formGasto({ gasto: gastos().find((g) => g.id === b.dataset.editar) })));
        raiz.querySelectorAll('[data-borrar-gasto]').forEach((b) => b.addEventListener('click', function () {
          const g = gastos().find((x) => x.id === b.dataset.borrarGasto);
          U.abrirModal('¿Borrar este gasto?', '<p>' + esc(g.concepto) + ' · ' + U.euro(g.importe) + ' · ' + U.fecha(g.fecha, true) + '</p><div class="acciones"><button class="boton boton--peligro" type="button" id="si">Borrar gasto</button><button class="boton boton--sec" type="button" data-cerrar-modal>Cancelar</button></div>', {
            alMontar: (m) => m.querySelector('#si').addEventListener('click', function () {
              S.db.costes = gastos().filter((x) => x.id !== g.id);
              S.guardar();
              Alki.panel.equipo.registrar('Ha borrado un gasto', (g.viviendaId ? S.buscar('viviendas', g.viviendaId).codigo : 'General') + ' · ' + g.concepto + ' · ' + U.euro(g.importe));
              U.cerrarModal(); U.toast('Gasto borrado'); Alki.app.refrescar();
            })
          });
        }));
      }
    };
  }

  Alki.panel.costes = { categorias, recurrencias, importeEnMes, resultado, generales, periodoDe, resumen, vivienda, formGasto, calculadora, modalImportarGastos, importarGastos, barrasBeneficio };
})();
