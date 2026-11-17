/* ==========================================================================
   comunes.js — PIEZAS COMPARTIDAS ENTRE ROLES
   --------------------------------------------------------------------------
   · Alki.docs: genera y muestra los documentos (contratos, recibos, informes)
   · Alki.vistas.perfil: pantalla de perfil (la usan los tres roles)
   · Alki.vistas.subirDocumento: ventana para subir un archivo propio
   ========================================================================== */
window.Alki = window.Alki || {};
Alki.vistas = Alki.vistas || {};

(function () {
  const S = Alki.store, U = Alki.ui, C = Alki.constantes;
  const esc = U.esc;

  /* ---------- Plantilla base de cualquier documento ---------- */
  function papel(titulo, subtitulo, cuerpo) {
    return '<article class="doc">' +
      '<div class="doc__cab"><div><h3>' + esc(titulo) + '</h3><p class="suave pequeno">' + subtitulo + '</p></div>' +
      '<div class="logo">' + Alki.marca + '</div></div>' +
      cuerpo +
      '<p class="doc__nota">Documento generado por la app · ' + esc(C.empresa) + ' · Valencia.</p>' +
      '</article>';
  }
  const filaTabla = (a, b) => '<tr><td>' + a + '</td><td>' + b + '</td></tr>';

  /* ---------- Cada tipo de documento ---------- */
  const plantillas = {
    // Contrato de habitación (inquilino)
    contrato: function (id) {
      const c = S.buscar('contratos', id);
      const h = S.buscar('habitaciones', c.habitacionId);
      const v = S.buscar('viviendas', h.viviendaId);
      const piso = h.codigo === 'Piso';
      return ['Contrato ' + v.codigo + '-' + h.codigo, papel(piso ? 'Contrato de arrendamiento de vivienda' : 'Contrato de arrendamiento de habitación', 'Referencia ' + esc(c.referenciaCSV || v.codigo + '-' + h.codigo) + ' · desde el ' + U.fecha(c.inicio, true),
        '<h4>Partes</h4><p><strong>' + esc(C.empresa) + '</strong>, como arrendadora, y <strong>' + esc(c.nombres) + '</strong>, como parte arrendataria.</p>' +
        '<h4>Objeto</h4><p>' + (piso ? 'Uso de la vivienda' : 'Uso de la habitación <strong>' + h.codigo + '</strong> (' + esc([h.tipo, h.cama ? 'cama de ' + h.cama + ' cm' : ''].filter(Boolean).join(', ')) + ')') +
        ' en ' + esc(v.direccion) + ' (Valencia)' + (piso ? '' : ', con acceso a cocina, baños y salón') + '.</p>' +
        '<h4>Condiciones económicas</h4><table>' +
        filaTabla('Renta mensual', U.euro(c.renta)) + (c.servicios ? filaTabla('Cuota de servicios', U.euro(c.servicios)) : filaTabla('Suministros', 'Incluidos')) +
        filaTabla('Fianza', c.fianza ? U.euro(c.fianza) : 'Sin fianza registrada') +
        filaTabla('Día de pago', 'Del 1 al 5 de cada mes') + '</table>' +
        '<h4>Duración</h4><p>Del ' + U.fecha(c.inicio, true) + ' al ' + U.fecha(c.fin, true) + ' (' + c.duracionMeses + ' meses).</p>' +
        '<h4>Servicios incluidos</h4><ul>' + C.serviciosIncluidos.map((s) => '<li>' + s + '</li>').join('') + '</ul>' +
        '<h4>Convivencia</h4><p>La arrendataria acepta las normas de convivencia de la vivienda, que forman parte de este contrato.</p>')];
    },
    normas: function (vId) {
      const v = S.buscar('viviendas', vId);
      return ['Normas de convivencia', papel('Normas de convivencia', esc(v.alias) + ' · ' + esc(v.direccion),
        '<ol>' + C.normas.map((n) => '<li>' + esc(n) + '</li>').join('') + '</ol>' +
        '<h4>Limpieza</h4><p>La limpieza de zonas comunes la organiza ALKI' + (v.limpieza ? ': ' + esc(v.limpieza.toLowerCase()) : '') + '. Cada residente mantiene su habitación.</p>')];
    },
    inventario: function (hId) {
      const h = S.buscar('habitaciones', hId);
      const c = S.contratoDeHabitacion(hId);
      return ['Inventario de entrada', papel('Inventario de entrada', 'Habitación ' + h.codigo + (c ? ' · entrega de llaves el ' + U.fecha(c.inicio, true) : ''),
        '<h4>Mobiliario de la habitación</h4><ul>' + ['Cama' + (h.cama ? ' de ' + h.cama + ' cm' : '') + ' con colchón y protector', 'Armario', 'Escritorio y silla', 'Lámpara'].map((m) => '<li>' + esc(m) + ' — buen estado</li>').join('') + '</ul>' +
        '<h4>Llaves entregadas</h4><ul><li>1 llave del portal</li><li>1 llave de la vivienda</li><li>1 llave de la habitación</li></ul>')];
    },
    recibo: function (pId) {
      const p = S.buscar('pagos', pId);
      const c = S.buscar('contratos', p.contratoId);
      const h = S.buscar('habitaciones', c.habitacionId);
      const v = S.buscar('viviendas', h.viviendaId);
      const lineas = p.concepto === 'Fianza'
        ? filaTabla('Fianza', U.euro(p.importe))
        : filaTabla('Renta ' + esc(v.codigo + '-' + h.codigo) + (c.servicios ? '' : ' (gastos incluidos)'), U.euro(c.renta)) + (c.servicios ? filaTabla('Cuota de servicios', U.euro(c.servicios)) : '');
      return ['Recibo ' + U.mes(p.periodo), papel('Recibo de pago', U.mes(p.periodo) + ' · ' + esc(c.nombres),
        '<table>' + lineas + filaTabla('<strong>Total</strong>', U.euro(p.importe)) + '</table>' +
        '<p>Pagado el ' + U.fecha(p.pagadoEl, true) + ' por ' + esc((p.metodo || 'transferencia').toLowerCase()) + '.</p>')];
    },
    // Contrato entre el propietario y ALKI
    arrendamiento: function (vId) {
      const v = S.buscar('viviendas', vId);
      const p = S.buscar('propietarios', v.propietarioId);
      return ['Contrato con ALKI', papel('Contrato de arrendamiento de vivienda', v.contratoInicio ? 'Firmado el ' + U.fecha(v.contratoInicio, true) : esc(v.codigo),
        '<h4>Partes</h4><p><strong>' + esc(p.nombre) + '</strong>, como propietaria, y <strong>' + esc(C.empresa) + '</strong>, como arrendataria y gestora.</p>' +
        '<h4>Inmueble</h4><p>' + esc(v.direccion) + ' (Valencia)' + (v.m2 ? ', ' + v.m2 + ' m²' : '') + ', ' + S.habitacionesDe(v.id).length + ' unidades.</p>' +
        '<h4>Renta</h4><table>' + filaTabla('Renta mensual garantizada', v.rentaPropietario ? U.euro(v.rentaPropietario) : 'Pendiente de registrar') + filaTabla('Fecha de pago', 'Día 10 de cada mes') + '</table>' +
        (v.contratoInicio && v.contratoFin ? '<h4>Duración</h4><p>Del ' + U.fecha(v.contratoInicio, true) + ' al ' + U.fecha(v.contratoFin, true) + '.</p>' : '') +
        '<h4>Gestión</h4><p>ALKI se encarga de la comercialización, la selección de residentes, el cobro, la limpieza y el mantenimiento ordinario, y cuenta con autorización expresa para alquilar por habitaciones.</p>')];
    },
    revision: function (vId) {
      const v = S.buscar('viviendas', vId);
      const r = S.resumenVivienda(vId);
      return ['Informe de revisión', papel('Informe de revisión de la vivienda', esc(v.codigo + ' · ' + v.alias) + (v.ultimaRevision ? ' · ' + U.fecha(v.ultimaRevision, true) : ''),
        '<h4>Estado general</h4><p>' + esc(v.notaRevision || 'Todavía no hay una revisión registrada para esta vivienda.') + '</p>' +
        '<h4>Habitaciones</h4><table>' + filaTabla('Ocupadas', r.ocupadas) + filaTabla('Libres', r.libres) + filaTabla('En reforma', r.reforma) + '</table>' +
        '<h4>Revisado</h4><ul><li>Instalación de agua y calentador</li><li>Cuadro eléctrico y enchufes</li><li>Cerraduras y ventanas</li><li>Humedades y pintura</li></ul>')];
    },
    reforma: function (rId) {
      const r = S.buscar('reformas', rId);
      const v = S.buscar('viviendas', r.viviendaId);
      return ['Factura de reforma', papel('Resumen de reforma', esc(v.alias) + ' · ' + esc(r.proveedor),
        '<h4>' + esc(r.titulo) + '</h4><ul>' + r.pasos.map((p) => '<li>' + esc(p.texto) + (p.hecho ? '' : ' (pendiente)') + '</li>').join('') + '</ul>' +
        '<table>' + filaTabla('Inicio', U.fecha(r.inicio, true)) + filaTabla(r.estado === 'completada' ? 'Fin' : 'Fin previsto', U.fecha(r.finPrevisto, true)) +
        filaTabla('Importe', U.euro(r.coste)) + filaTabla('A cargo de', esc(C.empresa)) + '</table>')];
    },
    ingresos: function (propId) {
      const p = S.buscar('propietarios', propId);
      const lista = S.pagosAPropietario(propId).filter((x) => x.pagado);
      const total = lista.reduce((s, x) => s + x.importe, 0);
      return ['Resumen de ingresos', papel('Resumen de ingresos', esc(p.nombre) + ' · generado el ' + U.fecha(Alki.fechas.fecha(new Date()), true),
        '<table>' + lista.map((x) => filaTabla(U.mes(x.periodo) + ' · ' + esc(S.buscar('viviendas', x.viviendaId).alias), U.euro(x.importe))).join('') +
        filaTabla('<strong>Total recibido</strong>', U.euro(total)) + '</table>')];
    },
    // Archivo subido por el usuario (foto o PDF)
    subido: function (dId) {
      const d = S.buscar('documentos', dId);
      const url = U.enlaceDesdeDataUrl(d.dataUrl);
      const vista = d.tipo.indexOf('image/') === 0
        ? '<img src="' + url + '" alt="' + esc(d.nombre) + '" style="border-radius:12px;margin:0 auto">'
        : '<iframe class="doc-visor" src="' + url + '" title="' + esc(d.nombre) + '"></iframe>';
      return [d.nombre, vista, url];
    }
  };

  Alki.docs = {
    abrir: function (tipo, id) {
      if (!plantillas[tipo]) return;
      const r = plantillas[tipo](id);
      const acciones = tipo === 'subido'
        ? '<a class="boton" href="' + r[2] + '" download="' + esc(r[0]) + '">' + U.icono('descargar') + 'Descargar</a>'
        : '<button class="boton" type="button" data-imprimir>' + U.icono('imprimir') + 'Imprimir o guardar en PDF</button>';
      U.abrirModal(r[0], r[1] + '<div class="acciones no-imprimir">' + acciones + '</div>', {
        ancho: true,
        alMontar: function (m) {
          const b = m.querySelector('[data-imprimir]');
          if (b) b.addEventListener('click', () => window.print());
        }
      });
    }
  };

  /* ---------- Fila de documento para las listas ---------- */
  Alki.vistas.filaDocumento = function (tipo, id, titulo, meta) {
    return '<li><button class="fila" type="button" data-doc="' + tipo + ':' + id + '">' +
      '<span class="fila__icono">' + U.icono('documentos') + '</span>' +
      '<span class="fila__principal"><span class="fila__titulo">' + esc(titulo) + '</span><span class="fila__meta">' + meta + '</span></span>' +
      U.icono('ojo') + '</button></li>';
  };

  /* ---------- Lista de documentos subidos por el usuario ---------- */
  Alki.vistas.misDocumentos = function (refId) {
    const docs = S.documentosDe(refId);
    if (!docs.length) return U.vacio('Aún no has subido ningún documento. Puedes guardar aquí tu DNI, pasaporte, nóminas o seguros.');
    return '<ul class="lista">' + docs.map((d) =>
      '<li style="display:flex;align-items:center"><button class="fila" type="button" data-doc="subido:' + d.id + '">' +
      '<span class="fila__icono">' + U.icono(d.tipo.indexOf('image/') === 0 ? 'camara' : 'documentos') + '</span>' +
      '<span class="fila__principal"><span class="fila__titulo">' + esc(d.nombre) + '</span><span class="fila__meta">Subido ' + U.relativo(d.fecha) + '</span></span></button>' +
      '<button class="boton-icono" type="button" data-borrar-doc="' + d.id + '" aria-label="Borrar ' + esc(d.nombre) + '" style="margin-right:8px">' + U.icono('papelera') + '</button></li>'
    ).join('') + '</ul>';
  };

  // Conecta los botones de subir y borrar documentos de una pantalla
  Alki.vistas.montarDocumentos = function (raiz, refId) {
    const subir = raiz.querySelector('[data-subir-doc]');
    if (subir) subir.addEventListener('click', function () {
      U.abrirModal('Subir documento',
        '<form id="form-doc"><div class="campo"><label for="doc-nombre">Nombre del documento</label>' +
        '<input id="doc-nombre" name="nombre" type="text" required placeholder="Por ejemplo: DNI por las dos caras"></div>' +
        '<div class="campo"><label for="doc-archivo">Archivo</label><input id="doc-archivo" name="archivo" type="file" accept="image/*,application/pdf" required>' +
        '<p class="campo__ayuda">Fotos o PDF de hasta 1,5 MB. Se guardan solo en este dispositivo.</p></div>' +
        '<p class="error-form" hidden></p><button class="boton boton--bloque" type="submit">' + U.icono('subir') + 'Subir documento</button></form>',
        {
          alMontar: function (m) {
            m.querySelector('form').addEventListener('submit', function (e) {
              e.preventDefault();
              const archivo = m.querySelector('#doc-archivo').files[0];
              const nombre = m.querySelector('#doc-nombre').value.trim();
              const error = m.querySelector('.error-form');
              U.leerArchivo(archivo).then(function (dataUrl) {
                const tipo = dataUrl.slice(5, dataUrl.indexOf(';'));
                if (!S.subirDocumento(refId, nombre, tipo, dataUrl)) throw new Error('No queda espacio en este navegador. Borra algún documento y vuelve a intentarlo.');
                U.cerrarModal();
                U.toast('Documento subido');
                Alki.app.refrescar();
              }).catch(function (err) { error.textContent = err.message; error.hidden = false; });
            });
          }
        });
    });
    raiz.querySelectorAll('[data-borrar-doc]').forEach(function (b) {
      b.addEventListener('click', function () {
        S.borrarDocumento(b.dataset.borrarDoc);
        U.toast('Documento borrado');
        Alki.app.refrescar();
      });
    });
  };

  /* ---------- Perfil (los tres roles) ---------- */
  Alki.vistas.perfil = function (p, ses) {
    const roles = { inquilino: 'Inquilino', propietario: 'Propietario', admin: 'Equipo ALKI' };
    let extra = '';
    if (ses.rol === 'inquilino') {
      const i = S.buscar('inquilinos', ses.refId);
      extra = '<div><dt>Teléfono</dt><dd>' + esc(i.telefono || '—') + '</dd></div>';
    } else if (ses.rol === 'propietario') {
      const pr = S.buscar('propietarios', ses.refId);
      extra = pr.telefono ? '<div><dt>Teléfono</dt><dd>' + esc(pr.telefono) + '</dd></div>' : '';
    }
    return {
      titulo: 'Perfil',
      html: U.cabecera(ses.nombre, { subtitulo: roles[ses.rol] }) +
        '<div class="panel"><dl class="datos"><div><dt>Correo</dt><dd>' + esc(ses.email) + '</dd></div>' + extra + '</dl></div>' +
        '<section class="seccion"><h2>Privacidad</h2><ul class="lista">' +
          '<li><button class="fila" type="button" data-legal="privacidad"><span class="fila__icono">' + U.icono('documentos') + '</span><span class="fila__principal"><span class="fila__titulo">Política de privacidad (RGPD)</span><span class="fila__meta">' +
            ((S.consentimientoDe(ses) || {}).privacidad ? 'Aceptada el ' + U.fecha(S.consentimientoDe(ses).privacidad.slice(0, 10), true) : 'Léela aquí') + '</span></span>' + U.icono('flecha') + '</button></li>' +
          '<li><button class="fila" type="button" data-legal="terminos"><span class="fila__icono">' + U.icono('documentos') + '</span><span class="fila__principal"><span class="fila__titulo">Términos de uso</span></span>' + U.icono('flecha') + '</button></li>' +
          (ses.rol === 'inquilino' ? '<li><label class="fila" style="cursor:pointer"><span class="fila__icono">' + U.icono('personas') + '</span><span class="fila__principal"><span class="fila__titulo">Participar en ALKI Social</span><span class="fila__meta">Otros residentes ven tu nombre y tu vivienda</span></span>' +
            '<input type="checkbox" id="social-perfil"' + (S.enSocial(ses) ? ' checked' : '') + ' style="width:22px;height:22px;accent-color:var(--tinta)"></label></li>' : '') +
        '</ul></section>' +
        '<section class="seccion"><h2>Instalar en el móvil</h2><div class="panel"><p>Abre la app en el navegador del móvil y elige <strong>Añadir a pantalla de inicio</strong> en el menú. Se abrirá como una app más, a pantalla completa.</p></div></section>' +
        '<section class="seccion"><h2>Contacto con ALKI</h2><ul class="lista">' +
        '<li><a class="fila" href="https://wa.me/' + C.contacto.whatsapp + '" target="_blank" rel="noopener"><span class="fila__icono">' + U.icono('chat') + '</span><span class="fila__principal"><span class="fila__titulo">WhatsApp ' + C.contacto.telefono + '</span><span class="fila__meta">' + C.contacto.horario + '</span></span></a></li>' +
        '<li><a class="fila" href="mailto:' + C.contacto.email + '"><span class="fila__icono">' + U.icono('correo') + '</span><span class="fila__principal"><span class="fila__titulo">' + C.contacto.email + '</span><span class="fila__meta">Respondemos en menos de 24 horas</span></span></a></li></ul></section>' +
        '<div class="acciones"><button class="boton boton--sec" type="button" id="cambiar-clave">Cambiar contraseña</button>' +
        '<button class="boton" type="button" id="salir">' + U.icono('salir') + 'Cerrar sesión</button>' +
        (ses.rol === 'admin' ? '<button class="boton boton--peligro" type="button" id="reiniciar">Restablecer datos</button>' : '') + '</div>',
      montar: function (raiz) {
        raiz.querySelector('#salir').addEventListener('click', function () {
          S.cerrarSesion();
          Alki.app.ir('/login');
        });
        const sp = raiz.querySelector('#social-perfil');
        if (sp) sp.addEventListener('change', function () { S.unirseSocial(ses, sp.checked); U.toast(sp.checked ? 'Te has unido a ALKI Social' : 'Has salido de ALKI Social'); });
        raiz.querySelector('#cambiar-clave').addEventListener('click', function () {
          U.abrirModal('Cambiar contraseña',
            '<form novalidate><div class="campo"><label for="c-nueva">Nueva contraseña</label><input id="c-nueva" type="password" autocomplete="new-password"><p class="campo__ayuda">Mínimo 8 caracteres.</p></div>' +
            '<div class="campo"><label for="c-rep">Repite la contraseña</label><input id="c-rep" type="password" autocomplete="new-password"></div>' +
            '<p class="error-form" hidden></p><button class="boton boton--bloque" type="submit">Guardar contraseña</button></form>',
            {
              alMontar: function (m) {
                m.querySelector('form').addEventListener('submit', function (e) {
                  e.preventDefault();
                  const n = m.querySelector('#c-nueva').value, r = m.querySelector('#c-rep').value, err = m.querySelector('.error-form');
                  if (n.length < 8) { err.textContent = 'Mínimo 8 caracteres.'; err.hidden = false; return; }
                  if (n !== r) { err.textContent = 'Las contraseñas no coinciden.'; err.hidden = false; return; }
                  S.crearContrasena(S.usuarioDe(ses.rol, ses.refId), n).then(() => { U.cerrarModal(); U.toast('Contraseña cambiada'); });
                });
              }
            });
        });
        const reiniciar = raiz.querySelector('#reiniciar');
        if (reiniciar) reiniciar.addEventListener('click', function () {
          U.abrirModal('¿Restablecer los datos?',
            '<p>Se borrará todo lo hecho en este dispositivo (incidencias, pagos confirmados, publicaciones, contraseñas creadas) y se volverá a cargar la cartera original.</p>' +
            '<div class="acciones"><button class="boton boton--peligro" type="button" id="si-reiniciar">Restablecer datos</button>' +
            '<button class="boton boton--sec" type="button" data-cerrar-modal>Cancelar</button></div>',
            {
              alMontar: function (m) {
                m.querySelector('#si-reiniciar').addEventListener('click', function () {
                  S.reiniciar();
                  U.cerrarModal();
                  U.toast('Datos restablecidos');
                  Alki.app.refrescar();
                });
              }
            });
        });
      }
    };
  };
})();
