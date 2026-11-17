/* ==========================================================================
   propietario.js — PANTALLAS DEL PROPIETARIO
   Inicio (mis viviendas) · Detalle de vivienda · Ingresos · Documentos · Mensajes

   Privacidad (RGPD): en Rent to Rent el propietario alquila el piso a ALKI,
   no a los residentes. Por eso aquí NUNCA se muestran nombres, contactos ni
   pagos de los inquilinos: solo el estado del inmueble y lo que ALKI le paga.
   ========================================================================== */
window.Alki = window.Alki || {};
Alki.vistas = Alki.vistas || {};

(function () {
  const S = Alki.store, U = Alki.ui;
  const esc = U.esc, ic = U.icono;

  const incidenciasVisibles = (vId) => S.incidenciasDeVivienda(vId).filter((i) => i.visiblePropietario);
  function proximoIngreso(propId) {
    const pendientes = S.pagosAPropietario(propId).filter((p) => !p.pagado);
    if (!pendientes.length) return null;
    const fecha = pendientes[pendientes.length - 1].fecha;
    const mismos = pendientes.filter((p) => p.fecha === fecha);
    return { fecha, importe: mismos.reduce((s, p) => s + p.importe, 0) };
  }
  function recibidoAnio(propId) {
    const anio = String(new Date().getFullYear());
    return S.pagosAPropietario(propId).filter((p) => p.pagado && p.fecha.slice(0, 4) === anio).reduce((s, p) => s + p.importe, 0);
  }

  /* ======================================================================
     INICIO: mis viviendas
     ====================================================================== */
  function inicio(p, ses) {
    const pr = S.buscar('propietarios', ses.refId);
    const viviendas = S.viviendasDe(pr.id);
    const proximo = proximoIngreso(pr.id);
    const tarjetas = viviendas.map(function (v) {
      const abiertas = incidenciasVisibles(v.id).filter(S.incidenciaAbierta).length;
      const enReforma = S.reformasDe(v.id).filter((r) => r.estado === 'en_curso').length;
      return '<a class="vivienda vivienda--horizontal" href="#/propietario/vivienda/' + v.id + '">' +
        '<div><div class="vivienda__cab"><div><h2>' + esc(v.alias) + '</h2><p class="suave pequeno">' + esc(v.codigo) + (v.barrio ? ' · ' + esc(v.barrio) : '') + '</p></div>' +
        U.etiqueta('vivienda', v.estadoGeneral) + '</div>' +
        '<div class="vivienda__pie" style="margin-top:14px">' + (v.ultimaRevision ? '<span>Revisada <strong>' + (U.diasHasta(v.ultimaRevision) > -30 ? U.relativo(v.ultimaRevision) : 'el ' + U.fecha(v.ultimaRevision)) + '</strong></span>' : '') +
        '<span><strong>' + abiertas + '</strong> ' + (abiertas === 1 ? 'incidencia abierta' : 'incidencias abiertas') + '</span>' +
        (enReforma ? '<span><strong>1</strong> reforma en curso</span>' : '') +
        (v.rentaPropietario ? '<span>Renta <strong>' + U.euro(v.rentaPropietario) + '</strong>/mes</span>' : '') + '</div></div>' +
        U.plano(v) + '</a>';
    }).join('');

    return {
      titulo: 'Mis viviendas',
      html: '<header class="cabecera"><p class="antetitulo">Tus viviendas con ALKI</p><h1>Hola, ' + esc(U.primerNombre(pr.nombre)) + '</h1>' +
        '<p class="cabecera__sub">' + (viviendas.length === 1 ? 'Tu vivienda está gestionada por ALKI.' : 'Tus ' + viviendas.length + ' viviendas gestionadas por ALKI.') + '</p></header>' +
        '<div class="panel"><dl class="datos">' +
          '<div><dt>Próximo ingreso</dt><dd class="num">' + (proximo ? U.euro(proximo.importe) + ' <span class="suave pequeno">el ' + U.fecha(proximo.fecha) + '</span>' : '—') + '</dd></div>' +
          '<div><dt>Recibido este año</dt><dd class="num">' + U.euro(recibidoAnio(pr.id)) + '</dd></div>' +
          '<div><dt>Viviendas</dt><dd>' + viviendas.length + '</dd></div>' +
        '</dl></div>' +
        '<section class="seccion"><div class="seccion__cab"><h2>Estado de tus pisos</h2></div>' + tarjetas + U.leyendaPlano() + '</section>'
    };
  }

  /* ======================================================================
     DETALLE DE UNA VIVIENDA
     ====================================================================== */
  function vivienda(p, ses) {
    const v = S.buscar('viviendas', p.id);
    if (!v || v.propietarioId !== ses.refId) return { html: U.cabecera('Vivienda no encontrada', { volver: '/propietario' }) };
    const incs = incidenciasVisibles(v.id);
    const reformas = S.reformasDe(v.id);
    const r = S.resumenVivienda(v.id);
    const dias = v.contratoFin ? U.diasHasta(v.contratoFin) : null;

    const filasInc = incs.map((i) =>
      '<li><button class="fila" type="button" data-inc="' + i.id + '"><span class="fila__icono">' + ic('incidencias') + '</span>' +
      '<span class="fila__principal"><span class="fila__titulo">' + esc(i.titulo) + '</span><span class="fila__meta">' +
      Alki.constantes.categorias[i.categoria] + ' · ' + U.fecha(i.creada) + (i.coste ? ' · ' + U.euro(i.coste) + ' a cargo de ALKI' : '') + '</span></span>' +
      '<span class="fila__fin">' + U.etiqueta('incidencia', i.estado) + '</span></button></li>').join('');

    const bloquesReforma = reformas.map(function (rf) {
      const hechos = rf.pasos.filter((x) => x.hecho).length;
      return '<div class="panel"><div class="vivienda__cab"><div><h3 style="font-size:1.05rem">' + esc(rf.titulo) + '</h3>' +
        '<p class="suave pequeno">' + esc(rf.proveedor) + ' · ' + (rf.estado === 'completada' ? 'terminada el ' + U.fecha(rf.finPrevisto) : 'fin previsto el ' + U.fecha(rf.finPrevisto)) + '</p></div>' +
        U.etiqueta('reforma', rf.estado) + '</div>' +
        '<ol class="pasos">' + rf.pasos.map((x, n) => '<li class="' + (x.hecho ? 'hecho' : '') + '"><i>' + (x.hecho ? '✓' : n + 1) + '</i><span>' + esc(x.texto) + '</span></li>').join('') + '</ol>' +
        '<div class="acciones" style="margin-top:14px;align-items:center;justify-content:space-between"><span class="pequeno suave">' + hechos + ' de ' + rf.pasos.length + ' pasos · ' + U.euro(rf.coste) + ' a cargo de ALKI</span>' +
        '<button class="boton boton--sec boton--peq" type="button" data-doc="reforma:' + rf.id + '">Ver resumen</button></div></div>';
    }).join('');

    return {
      titulo: v.alias,
      html: U.cabecera(v.alias, { volver: '/propietario', volverTexto: 'Mis viviendas', subtitulo: esc(v.codigo) + (v.barrio ? ' · ' + esc(v.barrio) : '') + (v.m2 ? ' · ' + v.m2 + ' m²' : '') }) +
        U.plano(v) + U.leyendaPlano() +
        '<p class="suave pequeno" style="margin-top:8px">' + r.ocupadas + ' de ' + r.total + ' habitaciones ocupadas. Por privacidad no mostramos datos de los residentes.</p>' +
        '<div class="dos-columnas">' +
        '<section class="seccion"><h2 style="margin-bottom:10px">Estado del inmueble</h2><div class="panel">' +
          '<div class="vivienda__cab"><p class="fila__titulo">' + (v.ultimaRevision ? 'Última revisión: ' + U.fecha(v.ultimaRevision, true) : 'Sin revisión registrada') + '</p>' + U.etiqueta('vivienda', v.estadoGeneral) + '</div>' +
          '<p style="margin-top:8px">' + esc(v.notaRevision || 'ALKI añadirá aquí el resultado de la próxima revisión.') + '</p>' +
          '<div class="acciones" style="margin-top:14px"><button class="boton boton--sec boton--peq" type="button" data-doc="revision:' + v.id + '">' + ic('documentos') + 'Ver informe</button></div>' +
        '</div></section>' +
        '<section class="seccion"><h2 style="margin-bottom:10px">Contrato con ALKI</h2><div class="panel"><dl class="datos">' +
          '<div><dt>Renta mensual</dt><dd class="num">' + (v.rentaPropietario ? U.euro(v.rentaPropietario) : 'Pendiente') + '</dd></div><div><dt>Pago</dt><dd>Día 10</dd></div>' +
          (v.contratoInicio ? '<div><dt>Desde</dt><dd>' + U.fecha(v.contratoInicio, true) + '</dd></div>' : '') + (v.contratoFin ? '<div><dt>Hasta</dt><dd>' + U.fecha(v.contratoFin, true) + '</dd></div>' : '') +
          '</dl>' + (dias !== null ? '<p class="pequeno suave" style="margin-top:12px">Quedan ' + dias + ' días de contrato.</p>' : '') +
          '<div class="acciones" style="margin-top:12px"><button class="boton boton--sec boton--peq" type="button" data-doc="arrendamiento:' + v.id + '">' + ic('documentos') + 'Ver contrato</button></div>' +
        '</div></section></div>' +
        '<section class="seccion"><h2 style="margin-bottom:10px">Reformas y mejoras</h2>' + (bloquesReforma || U.vacio('No hay reformas registradas en esta vivienda.')) + '</section>' +
        '<section class="seccion"><h2 style="margin-bottom:10px">Incidencias del inmueble</h2>' +
          (incs.length ? '<ul class="lista">' + filasInc + '</ul>' : U.vacio('No ha habido incidencias en el inmueble.')) + '</section>',
      montar: function (raiz) {
        raiz.querySelectorAll('[data-inc]').forEach(function (b) {
          b.addEventListener('click', function () {
            const inc = S.buscar('incidencias', b.dataset.inc);
            U.abrirModal(inc.titulo, Alki.vistas.detalleIncidencia(inc, 'propietario'));
          });
        });
      }
    };
  }

  /* ======================================================================
     INGRESOS (pagos de ALKI al propietario)
     ====================================================================== */
  function pagos(p, ses) {
    const lista = S.pagosAPropietario(ses.refId);
    const proximo = proximoIngreso(ses.refId);
    const varias = S.viviendasDe(ses.refId).length > 1;
    return {
      titulo: 'Ingresos',
      html: U.cabecera('Ingresos', {
        subtitulo: 'Lo que ALKI te transfiere cada mes, haya o no habitaciones libres.',
        accion: '<button class="boton boton--sec" type="button" data-doc="ingresos:' + ses.refId + '">' + ic('descargar') + 'Resumen para la renta</button>'
      }) +
        '<div class="panel"><dl class="datos">' +
          '<div><dt>Recibido este año</dt><dd class="num">' + U.euro(recibidoAnio(ses.refId)) + '</dd></div>' +
          '<div><dt>Próximo ingreso</dt><dd class="num">' + (proximo ? U.euro(proximo.importe) + ' <span class="suave pequeno">el ' + U.fecha(proximo.fecha) + '</span>' : '—') + '</dd></div>' +
        '</dl></div>' +
        '<section class="seccion"><h2 style="margin-bottom:10px">Movimientos</h2>' + (lista.length ? '' : U.vacio('ALKI todavía no ha registrado la renta pactada de tus viviendas.')) + '<ul class="lista"' + (lista.length ? '' : ' hidden') + '>' + lista.map((x) => {
          const v = S.buscar('viviendas', x.viviendaId);
          return '<li><div class="fila"><span class="fila__icono">' + ic('pagos') + '</span><span class="fila__principal">' +
            '<span class="fila__titulo">' + U.mes(x.periodo) + (varias ? ' · ' + esc(v.alias) : '') + '</span>' +
            '<span class="fila__meta">' + (x.pagado ? 'Transferido el ' : 'Se transferirá el ') + U.fecha(x.fecha) + '</span></span>' +
            '<span class="fila__fin"><span class="fila__importe">' + U.euro(x.importe) + '</span>' + U.etiqueta('ingreso', x.pagado) + '</span></div></li>';
        }).join('') + '</ul></section>'
    };
  }

  /* ======================================================================
     DOCUMENTOS
     ====================================================================== */
  function documentos(p, ses) {
    const F = Alki.vistas.filaDocumento;
    const bloques = S.viviendasDe(ses.refId).map((v) =>
      '<section class="seccion"><h2 style="margin-bottom:10px">' + esc(v.alias) + '</h2><ul class="lista">' +
      F('arrendamiento', v.id, 'Contrato de arrendamiento con ALKI', v.contratoInicio ? 'Firmado el ' + U.fecha(v.contratoInicio, true) : esc(v.codigo)) +
      F('revision', v.id, 'Informe de la última revisión', v.ultimaRevision ? U.fecha(v.ultimaRevision, true) : 'Sin revisión registrada') +
      S.reformasDe(v.id).map((r) => F('reforma', r.id, 'Reforma: ' + r.titulo, esc(r.proveedor) + ' · ' + U.euro(r.coste))).join('') +
      '</ul></section>').join('');
    return {
      titulo: 'Documentos',
      html: U.cabecera('Documentos', { subtitulo: 'Contratos, informes y facturas de tus viviendas.' }) + bloques +
        '<section class="seccion"><div class="seccion__cab"><h2>Tus documentos</h2>' +
        '<button class="boton boton--sec boton--peq" type="button" data-subir-doc>' + ic('subir') + 'Subir</button></div>' +
        Alki.vistas.misDocumentos(ses.refId) + '</section>',
      montar: (raiz) => Alki.vistas.montarDocumentos(raiz, ses.refId)
    };
  }

  /* ======================================================================
     MENSAJES (chat con ALKI). Lo reutiliza el panel de ALKI.
     ====================================================================== */
  Alki.vistas.chat = function (hilo, yo) {
    const msgs = S.mensajesDe(hilo);
    return '<div class="chat" aria-live="polite">' + (msgs.length ? msgs.map((m) =>
      '<div class="burbuja' + (m.de === yo ? ' burbuja--mia' : '') + '"><p>' + esc(m.texto) + '</p><time>' + U.relativo(m.fecha) + '</time></div>').join('')
      : '<p class="suave" style="margin:auto">Todavía no hay mensajes.</p>') + '</div>' +
      '<form class="chat-form" id="form-chat"><label class="oculto" for="msg">Escribe un mensaje</label>' +
      '<input id="msg" name="texto" type="text" placeholder="Escribe un mensaje" autocomplete="off" required>' +
      '<button class="boton" type="submit">' + ic('enviar') + 'Enviar</button></form>';
  };
  Alki.vistas.montarChat = function (raiz, hilo, yo) {
    const form = raiz.querySelector('#form-chat');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      const texto = form.texto.value.trim();
      if (!texto) return;
      S.enviarMensaje(hilo, yo, texto);
      Alki.app.refrescar(true);
      const nuevo = document.querySelector('#msg');
      if (nuevo) nuevo.focus();
    });
  };

  function mensajes(p, ses) {
    return {
      titulo: 'Mensajes',
      html: U.cabecera('Mensajes', { subtitulo: 'Habla con tu gestor de ALKI. Respondemos en menos de 24 horas.' }) + Alki.vistas.chat(ses.refId, ses.refId),
      montar: (raiz) => Alki.vistas.montarChat(raiz, ses.refId, ses.refId)
    };
  }

  Alki.vistas.prop = { inicio, vivienda, pagos, documentos, mensajes };
})();
