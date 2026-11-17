/* ==========================================================================
   inquilino.js — PANTALLAS DEL INQUILINO
   Inicio · Pagos · Incidencias · Documentos · Mi casa · Embajadores
   ========================================================================== */
window.Alki = window.Alki || {};
Alki.vistas = Alki.vistas || {};

(function () {
  const S = Alki.store, U = Alki.ui, C = Alki.constantes;
  const esc = U.esc, ic = U.icono;

  // Reúne los datos básicos del inquilino que ha iniciado sesión
  function contexto(ses) {
    const i = S.buscar('inquilinos', ses.refId);
    const c = S.contratoDeInquilino(i.id);
    const h = S.buscar('habitaciones', c.habitacionId);
    const v = S.buscar('viviendas', h.viviendaId);
    return { i, c, h, v };
  }
  const referencia = (h, p) => 'ALK-' + (S.buscar('viviendas', h.viviendaId).codigo + '-' + h.codigo).toUpperCase() + '-' + p.periodo.replace('-', '');
  const porPagar = (p) => ['pendiente', 'vencido'].includes(S.estadoPago(p));

  /* ---------- Avisar a ALKI de que se ha pagado ---------- */
  function modalPagado(pagoId) {
    const p = S.buscar('pagos', pagoId);
    const c = S.buscar('contratos', p.contratoId);
    const h = S.buscar('habitaciones', c.habitacionId);
    U.abrirModal('Avisar de un pago',
      '<p style="margin-bottom:16px">Recibo de <strong>' + U.mes(p.periodo) + '</strong> por <strong>' + U.euro(p.importe) + '</strong>. ' +
      'Referencia: <span class="referencia">' + referencia(h, p) + '</span></p>' +
      '<form id="form-pago"><fieldset class="campo" style="border:0;padding:0;margin:0 0 18px"><legend class="campo__titulo" style="font-weight:600;font-size:.9rem;margin-bottom:8px">¿Cómo has pagado?</legend>' +
      '<div class="chips">' + ['Transferencia', 'Bizum', 'Efectivo en oficina'].map((m, n) =>
        '<label><input type="radio" name="metodo" value="' + m + '"' + (n === 0 ? ' checked' : '') + '><span>' + m + '</span></label>').join('') +
      '</div></fieldset>' +
      '<button class="boton boton--bloque" type="submit">' + ic('check') + 'Avisar a ALKI</button>' +
      '<p class="campo__ayuda" style="margin-top:10px">ALKI comprobará el ingreso y el recibo pasará a «Pagado».</p></form>',
      {
        alMontar: function (m) {
          m.querySelector('form').addEventListener('submit', function (e) {
            e.preventDefault();
            S.notificarPago(pagoId, U.datosFormulario(this).metodo);
            U.cerrarModal();
            U.toast('Aviso enviado. ALKI confirmará el pago.');
            Alki.app.refrescar();
          });
        }
      });
  }
  function montarBotonesPago(raiz) {
    raiz.querySelectorAll('[data-pagado]').forEach((b) => b.addEventListener('click', () => modalPagado(b.dataset.pagado)));
  }

  function filaIncidencia(inc) {
    return '<li><a class="fila" href="#/inquilino/incidencias/' + inc.id + '">' +
      '<span class="fila__icono">' + ic('incidencias') + '</span>' +
      '<span class="fila__principal"><span class="fila__titulo">' + esc(inc.titulo) + '</span>' +
      '<span class="fila__meta">' + C.categorias[inc.categoria] + ' · ' + U.relativo(inc.creada) + '</span></span>' +
      '<span class="fila__fin">' + U.etiqueta('incidencia', inc.estado) + '</span></a></li>';
  }

  /* ======================================================================
     INICIO
     ====================================================================== */
  function inicio(p, ses) {
    const { i, c, h, v } = contexto(ses);
    const pagos = S.pagosDeContrato(c.id);
    const sinPagar = pagos.filter((x) => S.estadoPago(x) !== 'pagado');
    const proximo = sinPagar[sinPagar.length - 1]; // el más antiguo sin pagar
    const abiertas = S.incidenciasDeInquilino(i.id).filter(S.incidenciaAbierta);
    const avisos = S.avisosPara(v.id).slice(0, 3);
    const dias = U.diasHasta(c.fin);
    const total = Math.max(1, (new Date(c.fin) - new Date(c.inicio)) / 86400000);
    const transcurrido = Math.min(100, Math.max(0, Math.round((1 - dias / total) * 100)));

    let bloquePago;
    if (!proximo) {
      bloquePago = '<div class="panel pago-destacado"><div><p class="fila__titulo">Estás al día</p><p class="suave pequeno">No tienes recibos pendientes.</p></div>' + ic('check') + '</div>';
    } else {
      const est = S.estadoPago(proximo);
      bloquePago = '<div class="panel"><div class="pago-destacado"><div>' +
        '<p class="suave pequeno">' + U.mes(proximo.periodo) + ' · ' + (est === 'vencido' ? 'venció el ' : 'vence el ') + U.fecha(proximo.vence) + '</p>' +
        '<p class="pago-destacado__importe">' + U.euro(proximo.importe) + '</p></div>' + U.etiqueta('pago', est) + '</div>' +
        (est === 'revision'
          ? '<p class="suave pequeno" style="margin-top:10px">Has avisado de este pago. ALKI lo confirmará pronto.</p>'
          : '<div class="acciones" style="margin-top:14px"><button class="boton" type="button" data-pagado="' + proximo.id + '">' + ic('check') + 'Ya he pagado</button>' +
            '<a class="boton boton--sec" href="#/inquilino/pagos">Ver todos los pagos</a></div>') +
        '</div>';
    }

    return {
      titulo: 'Inicio',
      html:
        '<header class="cabecera"><h1>Hola, ' + esc(U.primerNombre(i.nombre)) + '</h1></header>' +
        ((S.confirmacionDe(ses) || {}).correctos === false ? '<div class="banda">' + ic('documentos') + '<span>Avisaste de que algún dato de tu contrato no cuadra. ALKI lo está revisando.</span></div>' : '') +
        '<a class="llavero" href="#/inquilino/casa" style="text-decoration:none">' +
          '<span class="llavero__codigo' + (h.codigo.length > 2 ? ' llavero__codigo--largo' : '') + '">' + h.codigo + '</span>' +
          '<span class="llavero__texto"><strong>' + esc(v.codigo + '-' + h.codigo) + '</strong><span>' + esc(v.direccion) + (v.barrio ? ' · ' + esc(v.barrio) : '') + '</span>' +
          '<span class="llavero__contrato">Contrato hasta el ' + U.fecha(c.fin, true) + (dias <= 90 ? ' · quedan ' + dias + ' días' : '') +
          '<span class="barra"><i style="width:' + transcurrido + '%"></i></span></span></span>' +
        '</a>' +
        '<nav class="atajos" aria-label="Accesos">' +
          [['/inquilino/pagos', 'pagos', 'Pagos'], ['/inquilino/incidencias', 'incidencias', 'Incidencias'], ['/inquilino/documentos', 'documentos', 'Documentos'],
           ['/inquilino/casa', 'llave', 'Mi casa'], ['/inquilino/social', 'personas', 'Social'], ['/perfil', 'usuario', 'Perfil']]
            .map((a) => '<a href="#' + a[0] + '">' + ic(a[1]) + '<span>' + a[2] + '</span></a>').join('') +
        '</nav>' +
        '<div class="dos-columnas">' +
          '<section class="seccion"><div class="seccion__cab"><h2>Tu próximo pago</h2></div>' + bloquePago + '</section>' +
          '<section class="seccion"><div class="seccion__cab"><h2>Incidencias abiertas</h2><a href="#/inquilino/incidencias">Ver todas</a></div>' +
            (abiertas.length ? '<ul class="lista">' + abiertas.map(filaIncidencia).join('') + '</ul>' : U.vacio('No tienes incidencias abiertas.')) +
            '<div class="acciones" style="margin-top:12px"><a class="boton boton--sec" href="#/inquilino/incidencias/nueva">' + ic('mas') + 'Reportar una incidencia</a></div>' +
          '</section>' +
        '</div>' +
        '<section class="seccion"><div class="seccion__cab"><h2>Avisos de tu casa</h2></div>' +
          (avisos.length ? '<ul class="lista">' + avisos.map((a) =>
            '<li class="aviso-fila"><div class="fila"><span class="fila__icono">' + ic('campana') + '</span><span class="fila__principal">' +
            '<span class="fila__titulo">' + esc(a.titulo) + '</span><span class="fila__meta">' + esc(a.texto) + '</span></span>' +
            '<span class="fila__fin suave pequeno">' + U.relativo(a.fecha) + '</span></div></li>').join('') + '</ul>' : U.vacio('No hay avisos nuevos.')) +
        '</section>' +
        '<section class="seccion"><ul class="lista"><li><a class="fila" href="#/inquilino/embajadores">' +
          '<span class="fila__icono">' + ic('regalo') + '</span><span class="fila__principal"><span class="fila__titulo">Recomienda ALKI y gana 30 €</span>' +
          '<span class="fila__meta">Tu código: ' + esc(i.codigoReferido) + '</span></span>' + ic('flecha') + '</a></li></ul></section>',
      montar: montarBotonesPago
    };
  }

  /* ======================================================================
     PAGOS
     ====================================================================== */
  function pagos(p, ses, q) {
    q = q || {};
    const { c, h, v } = contexto(ses);
    const lista = S.pagosDeContrato(c.id);
    const hoy = new Date();
    const periodoHoy = Alki.fechas.periodo(hoy);
    const anioIni = Number(c.inicio.slice(0, 4)), anioFin = Number(c.fin.slice(0, 4));
    const anios = [];
    for (let a = anioIni; a <= anioFin; a++) anios.push(a);
    const anio = Number(q.a) || Math.min(Math.max(hoy.getFullYear(), anioIni), anioFin);
    const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const etiquetas = { pagado: 'Pagado', revision: 'En revisión', vencido: 'Vencido', pendiente: 'Pendiente', proximo: 'Próximo', fuera: '' };

    // Estado de cada mes del año elegido
    const celdas = MESES.map(function (nombre, n) {
      const per = anio + '-' + Alki.fechas.pad(n + 1);
      const dentro = per >= c.inicio.slice(0, 7) && per <= c.fin.slice(0, 7);
      const recibo = lista.find((x) => x.periodo === per && x.concepto !== 'Fianza');
      let estado = 'fuera';
      if (dentro) estado = recibo ? S.estadoPago(recibo) : (per > periodoHoy ? 'proximo' : 'pendiente');
      return { nombre, per, estado, recibo, actual: per === periodoHoy };
    });
    const delMes = lista.find((x) => x.periodo === periodoHoy && x.concepto !== 'Fianza');
    const estMes = delMes ? S.estadoPago(delMes) : null;
    const deuda = lista.filter((x) => ['vencido', 'pendiente'].includes(S.estadoPago(x)));
    const pagadoAnio = lista.filter((x) => x.pagadoEl && x.periodo.slice(0, 4) === String(anio)).reduce((s, x) => s + x.importe, 0);

    return {
      titulo: 'Pagos',
      html: U.cabecera('Pagos', { subtitulo: U.euro(c.renta) + ' al mes' + (c.servicios ? ' + ' + U.euro(c.servicios) + ' de servicios' : ', gastos incluidos') + '. Se paga del 1 al 5.' }) +
        (delMes ? '<div class="panel mes-actual mes-actual--' + estMes + '"><div><p class="suave pequeno">' + U.mes(periodoHoy) + '</p>' +
          '<p class="mes-actual__estado">' + (estMes === 'pagado' ? 'Pagado' : estMes === 'revision' ? 'Pago en revisión' : estMes === 'vencido' ? 'Sin pagar' : 'Pendiente de pago') + '</p>' +
          '<p class="suave pequeno">' + (estMes === 'pagado' ? 'El ' + U.fecha(delMes.pagadoEl) : estMes === 'revision' ? 'ALKI lo está comprobando' : 'Vence el ' + U.fecha(delMes.vence)) + '</p></div>' +
          '<div class="mes-actual__fin"><span class="pago-destacado__importe">' + U.euro(delMes.importe) + '</span>' +
          (porPagar(delMes) ? '<button class="boton" type="button" data-pagado="' + delMes.id + '">' + ic('check') + 'Ya he pagado</button>' : '') + '</div></div>' : '') +
        (deuda.length > 1 ? '<div class="banda banda--mal">' + ic('pagos') + '<span>Tienes <strong>' + deuda.length + ' recibos sin pagar</strong> por ' + U.euro(deuda.reduce((s, x) => s + x.importe, 0)) + '.</span></div>' : '') +
        '<section class="seccion"><div class="seccion__cab"><h2>Todos los meses</h2><span class="suave pequeno">Pagado en ' + anio + ': <strong>' + U.euro(pagadoAnio) + '</strong></span></div>' +
          (anios.length > 1 ? '<nav class="chips chips--filtro" aria-label="Año" style="margin-bottom:12px">' + anios.map((a) => '<a href="#/inquilino/pagos?a=' + a + '"' + (a === anio ? ' aria-current="true"' : '') + '>' + a + '</a>').join('') + '</nav>' : '') +
          '<div class="meses">' + celdas.map((m) =>
            '<button class="mes mes--' + m.estado + (m.actual ? ' mes--actual' : '') + '" type="button"' + (m.estado === 'fuera' ? ' disabled' : ' data-mes="' + m.per + '"') + '>' +
            '<span class="mes__nombre">' + m.nombre + '</span>' +
            (m.estado === 'fuera' ? '<span class="mes__estado">—</span>' : '<span class="mes__estado">' + etiquetas[m.estado] + '</span>') +
            '</button>').join('') + '</div>' +
          '<ul class="leyenda"><li><i class="leyenda__m mes--pagado"></i>Pagado</li><li><i class="leyenda__m mes--pendiente"></i>Pendiente</li><li><i class="leyenda__m mes--vencido"></i>Vencido</li><li><i class="leyenda__m mes--proximo"></i>Próximo</li></ul>' +
        '</section>' +
        '<section class="seccion"><h2 style="margin-bottom:10px">Cómo pagar</h2><div class="panel"><p>Transferencia o Bizum a la cuenta de tu contrato con la referencia <span class="referencia">' + referencia(h, { periodo: periodoHoy }) + '</span>. Después pulsa <strong>Ya he pagado</strong>.</p></div></section>' +
        (c.fianza ? '<p class="suave pequeno" style="margin-top:14px">Fianza depositada: ' + U.euro(c.fianza) + '</p>' : ''),
      montar: function (raiz) {
        montarBotonesPago(raiz);
        raiz.querySelectorAll('[data-mes]').forEach(function (b) {
          b.addEventListener('click', function () {
            const m = celdas.find((x) => x.per === b.dataset.mes);
            const r = m.recibo;
            const est = m.estado;
            const detalle = r
              ? '<dl class="datos"><div><dt>Importe</dt><dd>' + U.euro(r.importe) + '</dd></div><div><dt>Vence</dt><dd>' + U.fecha(r.vence, true) + '</dd></div>' +
                (r.pagadoEl ? '<div><dt>Pagado</dt><dd>' + U.fecha(r.pagadoEl, true) + (r.metodo ? ' · ' + esc(r.metodo) : '') + '</dd></div>' : '') +
                '<div><dt>Referencia</dt><dd>' + referencia(h, r) + '</dd></div></dl>'
              : '<p>Este recibo se generará a principios de mes por ' + U.euro(c.renta + c.servicios) + '.</p>';
            const acciones = r && porPagar(r) ? '<button class="boton" type="button" id="m-pagar">' + ic('check') + 'Ya he pagado</button>'
              : r && est === 'pagado' ? '<button class="boton boton--sec" type="button" data-doc="recibo:' + r.id + '">' + ic('documentos') + 'Ver recibo</button>' : '';
            U.abrirModal(U.mes(m.per), '<div style="margin-bottom:14px">' + U.etiqueta('pago', est === 'proximo' ? 'pendiente' : est).replace('Pendiente', est === 'proximo' ? 'Próximo' : 'Pendiente') + '</div>' + detalle + (acciones ? '<div class="acciones">' + acciones + '</div>' : ''), {
              alMontar: function (modal) { const bp = modal.querySelector('#m-pagar'); if (bp) bp.addEventListener('click', () => modalPagado(r.id)); }
            });
          });
        });
      }
    };
  }

  /* ======================================================================
     INCIDENCIAS
     ====================================================================== */
  function incidencias(p, ses) {
    const lista = S.incidenciasDeInquilino(ses.refId);
    const abiertas = lista.filter(S.incidenciaAbierta);
    const resueltas = lista.filter((x) => !S.incidenciaAbierta(x));
    return {
      titulo: 'Incidencias',
      html: U.cabecera('Incidencias', {
        accion: '<a class="boton" href="#/inquilino/incidencias/nueva">' + ic('mas') + 'Nueva incidencia</a>'
      }) +
        '<section class="seccion" style="margin-top:0"><h2 style="margin-bottom:10px">Abiertas</h2>' +
        (abiertas.length ? '<ul class="lista">' + abiertas.map(filaIncidencia).join('') + '</ul>' : U.vacio('No tienes incidencias abiertas.', '<a class="boton boton--sec" href="#/inquilino/incidencias/nueva">' + ic('mas') + 'Reportar una incidencia</a>')) + '</section>' +
        '<section class="seccion"><h2 style="margin-bottom:10px">Resueltas</h2>' +
        (resueltas.length ? '<ul class="lista">' + resueltas.map(filaIncidencia).join('') + '</ul>' : U.vacio('Aquí aparecerán las incidencias ya resueltas.')) + '</section>'
    };
  }

  // Detalle de una incidencia (lo usan inquilino, propietario y ALKI)
  Alki.vistas.detalleIncidencia = function (inc, quienMira) {
    const h = inc.habitacionId ? S.buscar('habitaciones', inc.habitacionId) : null;
    const fotos = (inc.fotos || []).concat(inc.foto ? [inc.foto] : []);
    const inq = inc.inquilinoId ? S.buscar('inquilinos', inc.inquilinoId) : null;
    const autor = function (x) {
      if (x.autor === 'inquilino') return quienMira === 'inquilino' ? 'Tú' : (inq ? U.primerNombre(inq.nombre) : 'Inquilino');
      if (x.autor === 'alki') return 'ALKI' + (x.autorNombre && quienMira === 'alki' ? ' · ' + U.primerNombre(x.autorNombre) : '');
      return '';
    };
    return '<div class="panel">' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">' + U.etiqueta('incidencia', inc.estado) + U.etiqueta('prioridad', inc.prioridad) + '</div>' +
      '<p>' + esc(inc.descripcion) + '</p>' + U.galeria(fotos) +
      '<dl class="datos" style="margin-top:16px"><div><dt>Dónde</dt><dd>' + (h ? (h.codigo === 'Piso' ? 'Vivienda' : 'Habitación ' + h.codigo) : 'Zonas comunes') + '</dd></div>' +
      '<div><dt>Categoría</dt><dd>' + C.categorias[inc.categoria] + '</dd></div>' +
      (inc.proveedor ? '<div><dt>Quién lo arregla</dt><dd>' + esc(inc.proveedor) + '</dd></div>' : '') + '</dl></div>' +
      '<section class="seccion"><h2 style="margin-bottom:14px">Seguimiento</h2><ol class="historial">' +
      inc.historial.map((x) => '<li data-estado="' + x.estado + '"><time>' + (x.hora ? U.haceTiempo(x.hora) : U.fecha(x.fecha, true)) + '</time>' +
        (autor(x) ? '<span class="historial__autor">' + esc(autor(x)) + '</span>' : '') + '<p>' + esc(x.texto) + '</p>' + U.galeria(x.fotos) + '</li>').join('') +
      '</ol></section>';
  };

  function incidencia(p, ses) {
    const inc = S.buscar('incidencias', p.id);
    if (!inc || inc.inquilinoId !== ses.refId) return { html: U.cabecera('Incidencia no encontrada', { volver: '/inquilino/incidencias' }) };
    const resuelta = inc.estado === 'resuelta';
    return {
      titulo: inc.titulo,
      html: U.cabecera(inc.titulo, { volver: '/inquilino/incidencias', volverTexto: 'Incidencias', subtitulo: 'Enviada el ' + U.fecha(inc.creada, true) }) +
        Alki.vistas.detalleIncidencia(inc, 'inquilino') +
        '<section class="seccion"><h2 style="margin-bottom:10px">' + (resuelta ? '¿Sigue sin funcionar?' : 'Añadir información') + '</h2>' +
        '<form id="form-seguimiento" class="panel">' +
          '<div class="campo"><label for="seg-texto">' + (resuelta ? 'Cuéntanos qué pasa' : 'Comentario para ALKI') + '</label>' +
          '<textarea id="seg-texto" placeholder="' + (resuelta ? 'Por ejemplo: vuelve a gotear desde ayer' : 'Por ejemplo: estaré en casa el jueves por la tarde') + '"></textarea></div>' +
          '<div class="campo"><span class="campo__titulo">Fotos</span>' + U.selectorFotos(6) + '</div>' +
          '<p class="error-form" hidden></p>' +
          '<div class="acciones" style="margin-top:4px"><button class="boton" type="submit">' + ic('enviar') + (resuelta ? 'Reabrir incidencia' : 'Enviar') + '</button>' +
          (resuelta ? '' : '<button class="boton boton--sec" type="button" id="solucionado">' + ic('check') + 'Ya está solucionado</button>') + '</div>' +
        '</form></section>',
      montar: function (raiz) {
        const form = raiz.querySelector('#form-seguimiento');
        const fotosElegidas = U.montarSelectorFotos(form);
        form.addEventListener('submit', function (e) {
          e.preventDefault();
          const texto = form.querySelector('#seg-texto').value.trim();
          const urls = fotosElegidas();
          if (!texto && !urls.length) {
            const err = form.querySelector('.error-form');
            err.textContent = 'Escribe un comentario o añade alguna foto.'; err.hidden = false; return;
          }
          form.querySelector('button[type=submit]').disabled = true;
          U.guardarFotos(urls).then(function (ids) {
            if (resuelta) S.reabrirIncidencia(inc.id, texto, ids); else S.comentarIncidencia(inc.id, texto, ids);
            U.toast(resuelta ? 'Incidencia reabierta' : 'Enviado a ALKI');
            Alki.app.refrescar();
          });
        });
        const sol = raiz.querySelector('#solucionado');
        if (sol) sol.addEventListener('click', function () {
          S.cerrarPorInquilino(inc.id);
          U.toast('¡Gracias! Incidencia cerrada');
          Alki.app.refrescar();
        });
      }
    };
  }

  function nuevaIncidencia(p, ses) {
    const { h } = contexto(ses);
    const chips = (nombre, opciones, marcada) => '<div class="chips">' + opciones.map((o) =>
      '<label><input type="radio" name="' + nombre + '" value="' + o[0] + '" required' + (o[0] === marcada ? ' checked' : '') + '><span>' + o[1] + '</span></label>').join('') + '</div>';
    const grupo = (titulo, contenido) => '<fieldset class="campo" style="border:0;padding:0;margin:0 0 20px"><legend class="campo__titulo" style="font-weight:600;font-size:.9rem;margin-bottom:8px">' + titulo + '</legend>' + contenido + '</fieldset>';
    const miSitio = h.codigo === 'Piso' ? 'Dentro de la vivienda' : 'Mi habitación (' + h.codigo + ')';

    return {
      titulo: 'Nueva incidencia',
      html: U.cabecera('Nueva incidencia', { volver: '/inquilino/incidencias', volverTexto: 'Incidencias' }) +
        '<form id="form-incidencia" class="panel" style="padding:20px" novalidate>' +
          grupo('Tipo de problema', chips('categoria', Object.keys(C.categorias).map((k) => [k, C.categorias[k]]))) +
          grupo('Dónde', chips('donde', [[h.id, miSitio], ['comun', 'Zonas comunes']], h.id)) +
          '<div class="campo"><label for="titulo">Resumen</label><input id="titulo" name="titulo" type="text" maxlength="80" required placeholder="Por ejemplo: la ducha pierde agua"></div>' +
          '<div class="campo"><label for="descripcion">Descripción</label><textarea id="descripcion" name="descripcion" required placeholder="Desde cuándo pasa, qué has probado…"></textarea></div>' +
          grupo('Urgencia', chips('prioridad', [['baja', 'Puede esperar'], ['media', 'Esta semana'], ['alta', 'Lo antes posible'], ['urgente', 'Emergencia']], 'media')) +
          '<div class="campo"><span class="campo__titulo">Fotos (hasta 6)</span>' + U.selectorFotos(6) +
          '<p class="campo__ayuda">Una foto ayuda a que el técnico venga con lo necesario.</p></div>' +
          '<p class="campo__ayuda" style="margin-bottom:16px">Si hay peligro (gas, fuego, inundación), llama primero al 112.</p>' +
          '<p class="error-form" hidden></p>' +
          '<button class="boton boton--bloque" type="submit">' + ic('enviar') + 'Enviar incidencia</button>' +
        '</form>',
      montar: function (raiz) {
        const form = raiz.querySelector('form');
        const fotosElegidas = U.montarSelectorFotos(form);
        form.addEventListener('submit', function (e) {
          e.preventDefault();
          const d = U.datosFormulario(form);
          const error = form.querySelector('.error-form');
          if (!d.categoria || !d.titulo || !d.descripcion) {
            error.textContent = 'Elige el tipo de problema y rellena el resumen y la descripción.';
            error.hidden = false;
            return;
          }
          const boton = form.querySelector('button[type=submit]');
          boton.disabled = true; boton.textContent = 'Enviando…';
          U.guardarFotos(fotosElegidas()).then(function (ids) {
            const c = S.contratoDeInquilino(ses.refId);
            const hab = S.buscar('habitaciones', c.habitacionId);
            const inc = S.crearIncidencia({
              viviendaId: hab.viviendaId, habitacionId: d.donde === 'comun' ? null : hab.id, inquilinoId: ses.refId,
              categoria: d.categoria, titulo: d.titulo, descripcion: d.descripcion, prioridad: d.prioridad || 'media', fotos: ids
            });
            U.toast('Incidencia enviada');
            Alki.app.ir('/inquilino/incidencias/' + inc.id);
          });
        });
      }
    };
  }

  /* ======================================================================
     DOCUMENTOS
     ====================================================================== */
  function documentos(p, ses) {
    const { i, c, h, v } = contexto(ses);
    const F = Alki.vistas.filaDocumento;
    const recibos = S.pagosDeContrato(c.id).filter((x) => x.pagadoEl).length;
    return {
      titulo: 'Documentos',
      html: U.cabecera('Documentos', { subtitulo: 'Todo lo de tu alquiler, siempre a mano.' }) +
        '<section class="seccion" style="margin-top:0"><h2 style="margin-bottom:10px">De ALKI</h2><ul class="lista">' +
          F('contrato', c.id, 'Contrato ' + v.codigo + '-' + h.codigo, 'Desde el ' + U.fecha(c.inicio, true)) +
          F('normas', v.id, 'Normas de convivencia', esc(v.alias)) +
          F('inventario', h.id, 'Inventario de entrada', 'Mobiliario y llaves entregadas') +
          '<li><a class="fila" href="#/inquilino/pagos"><span class="fila__icono">' + ic('pagos') + '</span><span class="fila__principal">' +
          '<span class="fila__titulo">Recibos de pago</span><span class="fila__meta">' + recibos + ' recibos disponibles en Pagos</span></span>' + ic('flecha') + '</a></li>' +
        '</ul></section>' +
        '<section class="seccion"><div class="seccion__cab"><h2>Tus documentos</h2>' +
          '<button class="boton boton--sec boton--peq" type="button" data-subir-doc>' + ic('subir') + 'Subir</button></div>' +
          Alki.vistas.misDocumentos(i.id) + '</section>',
      montar: (raiz) => Alki.vistas.montarDocumentos(raiz, i.id)
    };
  }

  /* ======================================================================
     MI CASA
     ====================================================================== */
  function casa(p, ses) {
    const { i, c, h, v } = contexto(ses);
    const dias = U.diasHasta(c.fin);
    const solicitud = S.db.solicitudes.find((s) => s.inquilinoId === i.id && s.estado === 'nueva');
    const tipos = { renovacion: 'renovar el contrato', salida: 'avisar de tu salida' };
    return {
      titulo: 'Mi casa',
      html: U.cabecera(v.codigo + ' · ' + v.alias, { subtitulo: (v.barrio ? esc(v.barrio) + ', ' : '') + 'Valencia' }) +
        U.plano(v, { resaltar: h.id }) + '<p class="suave pequeno" style="margin-top:8px">Tu habitación es la ' + h.codigo + ', marcada con borde oscuro.</p>' +
        '<div class="dos-columnas">' +
        '<section class="seccion"><h2 style="margin-bottom:10px">Tu habitación</h2><div class="panel"><dl class="datos">' +
          '<div><dt>Tipo</dt><dd>' + esc(h.tipo) + '</dd></div>' + (h.cama ? '<div><dt>Cama</dt><dd>' + h.cama + ' cm</dd></div>' : '') +
          '<div><dt>Renta</dt><dd class="num">' + U.euro(c.renta) + '</dd></div><div><dt>Gastos</dt><dd>' + (c.servicios ? U.euro(c.servicios) : 'Incluidos') + '</dd></div>' +
        '</dl><p class="suave pequeno" style="margin-top:14px">Incluye: ' + C.serviciosIncluidos.join(', ').toLowerCase() + '.</p></div></section>' +
        '<section class="seccion"><h2 style="margin-bottom:10px">Tu contrato</h2><div class="panel">' +
          '<dl class="datos"><div><dt>Desde</dt><dd>' + U.fecha(c.inicio, true) + '</dd></div><div><dt>Hasta</dt><dd>' + U.fecha(c.fin, true) + '</dd></div></dl>' +
          '<p class="pequeno" style="margin-top:12px">Quedan <strong>' + dias + ' días</strong></p>' +
          (S.confirmacionDe(ses) ? '<p class="pequeno ' + (S.confirmacionDe(ses).correctos ? 'positivo' : 'negativo') + '" style="margin-top:6px">' + (S.confirmacionDe(ses).correctos ? '✓ Confirmaste estos datos el ' + U.fecha(S.confirmacionDe(ses).fecha.slice(0, 10)) : 'Avisaste de un dato incorrecto') + '</p>' : '') +
          (solicitud
            ? '<p class="pequeno suave" style="margin-top:12px">Has pedido ' + tipos[solicitud.tipo] + ' el ' + U.fecha(solicitud.fecha) + '. ALKI te contactará.</p>'
            : '<div class="acciones" style="margin-top:14px"><button class="boton boton--peq" type="button" data-solicitud="renovacion">Quiero renovar</button>' +
              '<button class="boton boton--sec boton--peq" type="button" data-solicitud="salida">Avisar de mi salida</button></div>') +
        '</div></section></div>' +
        '<section class="seccion"><h2 style="margin-bottom:10px">Día a día</h2><ul class="lista">' +
          (v.wifi && v.wifi.red ? '<li><div class="fila"><span class="fila__icono">' + ic('wifi') + '</span><span class="fila__principal"><span class="fila__titulo">Wifi: ' + esc(v.wifi.red) + '</span>' +
            '<span class="fila__meta">Clave: <span class="wifi-clave" id="clave">••••••••••</span></span></span>' +
            '<button class="boton boton--sec boton--peq" type="button" id="ver-clave">Mostrar</button></div></li>'
            : '<li><div class="fila"><span class="fila__icono">' + ic('wifi') + '</span><span class="fila__principal"><span class="fila__titulo">Wifi</span><span class="fila__meta">Pide la clave a ALKI por WhatsApp</span></span></div></li>') +
          (v.limpieza ? '<li><div class="fila"><span class="fila__icono">' + ic('calendario') + '</span><span class="fila__principal"><span class="fila__titulo">Limpieza de zonas comunes</span>' +
            '<span class="fila__meta">' + esc(v.limpieza) + '</span></span></div></li>' : '') +
          Alki.vistas.filaDocumento('normas', v.id, 'Normas de convivencia', esc(C.normas[0])) +
        '</ul></section>' +
        '<section class="seccion"><h2 style="margin-bottom:10px">¿Necesitas algo?</h2><ul class="lista">' +
          '<li><a class="fila" href="https://wa.me/' + C.contacto.whatsapp + '" target="_blank" rel="noopener"><span class="fila__icono">' + ic('chat') + '</span><span class="fila__principal"><span class="fila__titulo">Escribir a ALKI por WhatsApp</span><span class="fila__meta">' + C.contacto.telefono + ' · ' + C.contacto.horario + '</span></span>' + ic('flecha') + '</a></li>' +
          '<li><a class="fila" href="#/inquilino/incidencias/nueva"><span class="fila__icono">' + ic('incidencias') + '</span><span class="fila__principal"><span class="fila__titulo">Reportar una incidencia</span><span class="fila__meta">Averías, limpieza, convivencia…</span></span>' + ic('flecha') + '</a></li>' +
        '</ul></section>',
      montar: function (raiz) {
        const boton = raiz.querySelector('#ver-clave');
        if (boton) boton.addEventListener('click', function () {
          const span = raiz.querySelector('#clave');
          const visible = boton.textContent === 'Ocultar';
          span.textContent = visible ? '••••••••••' : v.wifi.clave;
          boton.textContent = visible ? 'Mostrar' : 'Ocultar';
        });
        raiz.querySelectorAll('[data-solicitud]').forEach(function (b) {
          b.addEventListener('click', function () {
            const tipo = b.dataset.solicitud;
            const renovar = tipo === 'renovacion';
            U.abrirModal(renovar ? 'Quiero renovar' : 'Avisar de mi salida',
              '<form><div class="campo"><label for="sol-texto">' + (renovar ? '¿Cuántos meses más te gustaría quedarte?' : '¿Qué día piensas dejar la habitación?') + '</label>' +
              '<textarea id="sol-texto" name="texto" required placeholder="' + (renovar ? 'Por ejemplo: 6 meses más, hasta julio' : 'Por ejemplo: el 31 de enero por la mañana') + '"></textarea></div>' +
              '<button class="boton boton--bloque" type="submit">Enviar a ALKI</button></form>',
              {
                alMontar: function (m) {
                  m.querySelector('form').addEventListener('submit', function (e) {
                    e.preventDefault();
                    S.crearSolicitud(i.id, tipo, this.texto.value.trim());
                    U.cerrarModal();
                    U.toast('Solicitud enviada a ALKI');
                    Alki.app.refrescar();
                  });
                }
              });
          });
        });
      }
    };
  }

  /* ======================================================================
     EMBAJADORES
     ====================================================================== */
  function embajadores(p, ses) {
    const i = S.buscar('inquilinos', ses.refId);
    const refs = S.referidosDe(i.id);
    const ganado = refs.filter((r) => r.estado === 'pagado').length * 30;
    const mensaje = 'Busco compañero/a de piso: alquila con ALKI en Valencia usando mi código ' + i.codigoReferido;
    return {
      titulo: 'Embajadores',
      html: U.cabecera('Recomienda ALKI', { subtitulo: 'Por cada persona que alquile gracias a ti, te llevas 30 €.' }) +
        '<div class="codigo-referido"><div><p class="pequeno" style="font-weight:600">Tu código</p><strong>' + esc(i.codigoReferido) + '</strong></div>' +
        '<div class="acciones" style="margin:0"><button class="boton" type="button" id="compartir">' + ic('enviar') + 'Compartir</button>' +
        '<button class="boton boton--sec" type="button" id="copiar">' + ic('copiar') + 'Copiar</button></div></div>' +
        '<div class="dos-columnas">' +
        '<section class="seccion"><h2 style="margin-bottom:14px">Cómo funciona</h2><ol class="como-funciona">' +
          '<li><span><strong>Comparte tu código</strong><span class="suave pequeno">Con amigos, compañeros de clase o de trabajo.</span></span></li>' +
          '<li><span><strong>Alquila al menos 6 meses</strong><span class="suave pequeno">La persona firma un contrato de 6 meses o más.</span></span></li>' +
          '<li><span><strong>Cobras 30 €</strong><span class="suave pequeno">Cuando sus pagos están al día, te los descontamos del siguiente recibo.</span></span></li>' +
        '</ol></section>' +
        '<section class="seccion"><div class="seccion__cab"><h2>Tus recomendaciones</h2><span class="suave pequeno">Has ganado <strong>' + U.euro(ganado) + '</strong></span></div>' +
          (refs.length ? '<ul class="lista">' + refs.map((r) =>
            '<li><div class="fila"><span class="fila__icono">' + ic('usuario') + '</span><span class="fila__principal"><span class="fila__titulo">' + esc(r.nombre) + '</span>' +
            '<span class="fila__meta">Recomendado el ' + U.fecha(r.fecha) + '</span></span>' + U.etiqueta('referido', r.estado) + '</div></li>').join('') + '</ul>'
            : U.vacio('Todavía no has recomendado a nadie.')) +
          '<div class="acciones" style="margin-top:12px"><button class="boton boton--sec" type="button" id="nuevo-ref">' + ic('mas') + 'Añadir una recomendación</button></div>' +
        '</section></div>',
      montar: function (raiz) {
        function copiar() {
          const ok = () => U.toast('Código copiado');
          if (navigator.clipboard) navigator.clipboard.writeText(mensaje).then(ok, ok); else ok();
        }
        raiz.querySelector('#copiar').addEventListener('click', copiar);
        raiz.querySelector('#compartir').addEventListener('click', function () {
          if (navigator.share) navigator.share({ title: 'ALKI Rentals', text: mensaje }).catch(function () {});
          else copiar();
        });
        raiz.querySelector('#nuevo-ref').addEventListener('click', function () {
          U.abrirModal('Añadir una recomendación',
            '<form><div class="campo"><label for="ref-nombre">Nombre</label><input id="ref-nombre" name="nombre" type="text" required></div>' +
            '<div class="campo"><label for="ref-contacto">Teléfono o correo</label><input id="ref-contacto" name="contacto" type="text" required></div>' +
            '<p class="campo__ayuda" style="margin-bottom:14px">Avísale antes: ALKI le escribirá para enseñarle las habitaciones libres.</p>' +
            '<button class="boton boton--bloque" type="submit">Añadir recomendación</button></form>',
            {
              alMontar: function (m) {
                m.querySelector('form').addEventListener('submit', function (e) {
                  e.preventDefault();
                  S.crearReferido(i.id, this.nombre.value.trim(), this.contacto.value.trim());
                  U.cerrarModal();
                  U.toast('Recomendación añadida');
                  Alki.app.refrescar();
                });
              }
            });
        });
      }
    };
  }

  /* ======================================================================
     CONFIRMAR DATOS DEL ALQUILER (primer acceso)
     El inquilino revisa piso, habitación, renta y fechas, y confirma
     que coinciden con lo que firmó. Si no, avisa a ALKI.
     ====================================================================== */
  function confirmar(p, ses) {
    const { c, h, v } = contexto(ses);
    const fila = (a, b, clase) => '<div><dt>' + a + '</dt><dd' + (clase ? ' class="' + clase + '"' : '') + '>' + b + '</dd></div>';
    return {
      titulo: 'Confirma tus datos',
      html: '<div class="confirmar">' +
        '<div class="entrada__logo logo logo--grande">' + Alki.marca + '</div>' +
        '<h1>Confirma los datos de tu alquiler</h1>' +
        '<p class="entrada__texto">Revisa que coinciden con tu contrato. Así tú y ALKI tenéis la misma información.</p>' +
        '<div class="panel resumen-alquiler"><dl>' +
          fila('Titular' + ((c.cotitulares || []).length ? 'es' : ''), esc(c.nombres)) +
          fila('Vivienda', esc(v.codigo) + '<br><span class="suave pequeno">' + esc(v.direccion) + (v.barrio ? ', ' + esc(v.barrio) : '') + '</span>') +
          fila(h.codigo === 'Piso' ? 'Tipo' : 'Habitación', h.codigo === 'Piso' ? 'Vivienda completa' : esc(h.codigo) + '<br><span class="suave pequeno">' + esc(h.tipo) + (h.cama ? ', cama de ' + h.cama + ' cm' : '') + '</span>') +
          fila('Pagas al mes', U.euro(c.renta + c.servicios) + '<br><span class="suave pequeno">' + (c.servicios ? 'renta ' + U.euro(c.renta) + ' + servicios ' + U.euro(c.servicios) : 'gastos incluidos') + '</span>', 'importe') +
          fila('Día de pago', 'Del 1 al 5 de cada mes') +
          fila('Fianza', c.fianza ? U.euro(c.fianza) : 'Sin fianza') +
          fila('Contrato', U.fecha(c.inicio, true) + '<br>al ' + U.fecha(c.fin, true)) +
        '</dl></div>' +
        '<div class="acciones" style="flex-direction:column"><button class="boton boton--bloque" type="button" id="correctos">' + ic('check') + 'Sí, los datos son correctos</button>' +
        '<button class="boton boton--sec boton--bloque" type="button" id="no-cuadra">Hay algo que no cuadra</button></div>' +
        '<form id="form-discrepancia" class="panel" style="margin-top:14px" hidden><div class="campo"><label for="disc">¿Qué dato no es correcto?</label>' +
        '<textarea id="disc" placeholder="Por ejemplo: pago 420 €, no 430 €"></textarea></div><p class="error-form" hidden></p>' +
        '<button class="boton boton--bloque" type="submit">Enviar a ALKI</button></form>' +
        '</div>',
      montar: function (raiz) {
        raiz.querySelector('#correctos').addEventListener('click', function () {
          S.confirmarDatos(ses, true);
          U.toast('¡Gracias! Datos confirmados');
          Alki.app.ir('/inquilino');
        });
        const form = raiz.querySelector('#form-discrepancia');
        raiz.querySelector('#no-cuadra').addEventListener('click', function () { form.hidden = false; form.querySelector('textarea').focus(); });
        form.addEventListener('submit', function (e) {
          e.preventDefault();
          const t = form.querySelector('textarea').value.trim();
          if (!t) { const er = form.querySelector('.error-form'); er.textContent = 'Cuéntanos qué dato no es correcto.'; er.hidden = false; return; }
          S.confirmarDatos(ses, false, t);
          U.toast('Enviado. ALKI revisará tus datos');
          Alki.app.ir('/inquilino');
        });
      }
    };
  }

  Alki.vistas.inq = { confirmar, inicio, pagos, incidencias, incidencia, nuevaIncidencia, documentos, casa, embajadores };
})();
