/* ==========================================================================
   panel/vistas.js — PANTALLAS PROPIAS DE ALKI PANEL
   Acceso · Resumen · Tablero de incidencias · Comunicación · Datos ·
   Equipo y permisos · Actividad · Perfil
   (Viviendas, Cobros e Inquilinos reutilizan las pantallas de admin.js;
    Costes y beneficio está en costes.js)
   ========================================================================== */
window.Alki = window.Alki || {};
Alki.panel = Alki.panel || {};

(function () {
  const S = Alki.store, U = Alki.ui, E = Alki.panel.equipo;
  const esc = U.esc, ic = U.icono;
  const A = () => Alki.vistas.admin;
  const niveles = { no: 'Sin acceso', ver: 'Solo ver', editar: 'Editar' };
  const iniciales = (n) => String(n || '?').split(' ').slice(0, 2).map((x) => x.charAt(0)).join('').toUpperCase();
  const puede = (ses, s, nivel) => { const p = E.permiso(ses, s); return nivel === 'editar' ? p === 'editar' : p !== 'no'; };
  const activos = () => (S.db.equipo || []).filter((m) => m.activo);

  /* ======================================================================
     ACCESO DEL EQUIPO
     ====================================================================== */
  function login() {
    return {
      titulo: 'Acceso del equipo',
      html: '<div class="entrada"><div class="entrada__caja">' +
        '<div class="entrada__logo logo logo--grande">' + Alki.logoSimbolo + '<span class="logo__texto">Alki<span>Panel</span></span></div>' +
        '<div id="paso" aria-live="polite"></div></div>' +
        '<p class="entrada__ayuda">Acceso solo para el equipo de ALKI</p></div>',
      montar: function (raiz) {
        const caja = raiz.querySelector('#paso');
        let correo = '';
        const error = (t) => { const e = caja.querySelector('.error-form'); e.innerHTML = t; e.hidden = false; };
        const pintar = (html, fn) => { caja.innerHTML = html; const f = caja.querySelector('input'); if (f) f.focus(); fn(); };
        const volver = '<button class="enlace entrada__cambiar" type="button" data-volver>Usar otro correo</button>';
        const entrar = (m) => { E.entrar(m); Alki.app.ir('/admin'); };

        function pasoCorreo() {
          pintar('<h1>Panel del equipo</h1><form novalidate><div class="campo"><label for="email">Correo de trabajo</label>' +
            '<input id="email" type="email" autocomplete="username" value="' + esc(correo) + '"></div>' +
            '<p class="error-form" hidden></p><button class="boton boton--bloque" type="submit">Continuar</button></form>', function () {
            caja.querySelector('form').addEventListener('submit', function (e) {
              e.preventDefault();
              correo = caja.querySelector('#email').value.trim();
              const m = E.buscarPorEmail(correo);
              if (!m) return error('Este correo no está en el equipo. Pide al encargado que te dé de alta.');
              if (!m.activo) return error('Tu acceso está desactivado. Habla con el encargado.');
              if (m.clave) pasoClave(m); else pasoCrear(m, true);
            });
          });
        }
        function pasoClave(m) {
          pintar('<h1>Hola, ' + esc(U.primerNombre(m.nombre)) + '</h1><p class="entrada__texto">' + esc(m.email) + '</p>' +
            '<form novalidate><div class="campo"><label for="clave">Contraseña</label><input id="clave" type="password" autocomplete="current-password"></div>' +
            '<p class="error-form" hidden></p><button class="boton boton--bloque" type="submit">Entrar</button></form>' +
            '<div class="entrada__enlaces"><button class="enlace" type="button" id="olvido">¿Has olvidado tu contraseña?</button>' + volver + '</div>', function () {
            caja.querySelector('form').addEventListener('submit', function (e) {
              e.preventDefault();
              E.comprobarClave(m, caja.querySelector('#clave').value).then((ok) => (ok ? entrar(m) : error('La contraseña no es correcta.')));
            });
            caja.querySelector('#olvido').addEventListener('click', function () {
              if (m.superadmin) pasoCrear(m, false);
              else error('Pide al encargado que restablezca tu contraseña desde «Equipo y permisos».');
            });
            caja.querySelector('[data-volver]').addEventListener('click', pasoCorreo);
          });
        }
        function pasoCrear(m, primera) {
          pintar('<h1>' + (primera ? 'Crea tu contraseña' : 'Nueva contraseña') + '</h1><p class="entrada__texto">' + (primera ? 'Bienvenido al panel, ' + esc(U.primerNombre(m.nombre)) + '.' : esc(m.email)) + '</p>' +
            '<form novalidate><div class="campo"><label for="nueva">Contraseña</label><input id="nueva" type="password" autocomplete="new-password"><p class="campo__ayuda">Mínimo 8 caracteres.</p></div>' +
            '<div class="campo"><label for="repite">Repite la contraseña</label><input id="repite" type="password" autocomplete="new-password"></div>' +
            (primera ? '<div class="consentimientos"><label class="casilla"><input type="checkbox" id="acepto"><span>Me comprometo a tratar de forma <strong>confidencial</strong> los datos de inquilinos y propietarios y a usarlos solo para mi trabajo en ALKI (deber de secreto, RGPD).</span></label></div>' : '') +
            '<p class="error-form" hidden></p><button class="boton boton--bloque" type="submit">Guardar y entrar</button></form>' + volver, function () {
            caja.querySelector('form').addEventListener('submit', function (e) {
              e.preventDefault();
              const n = caja.querySelector('#nueva').value, r = caja.querySelector('#repite').value, a = caja.querySelector('#acepto');
              if (n.length < 8) return error('Mínimo 8 caracteres.');
              if (n !== r) return error('Las contraseñas no coinciden.');
              if (a && !a.checked) return error('Tienes que aceptar el compromiso de confidencialidad.');
              E.crearClave(m, n, primera).then(() => entrar(m));
            });
            caja.querySelector('[data-volver]').addEventListener('click', pasoCorreo);
          });
        }
        pasoCorreo();
      }
    };
  }

  /* ======================================================================
     RESUMEN
     ====================================================================== */
  function resumen(p, ses) {
    const k = S.indicadores();
    const db = S.db;
    const yo = ses.miembroId;
    const misInc = db.incidencias.filter((i) => S.incidenciaAbierta(i) && i.asignadoA === yo);
    const sinAsignar = db.incidencias.filter((i) => S.incidenciaAbierta(i) && !i.asignadoA);
    const urgentes = db.incidencias.filter((i) => S.incidenciaAbierta(i) && (i.prioridad === 'urgente' || i.prioridad === 'alta'));
    const revision = db.pagos.filter((x) => S.estadoPago(x) === 'revision');
    const solicitudes = db.solicitudes.filter((s) => s.estado === 'nueva');
    const terminan = db.contratos.filter((c) => { const d = U.diasHasta(c.fin); return d >= 0 && d <= 60; });
    const sinRenta = db.viviendas.filter((v) => !v.rentaPropietario);
    const per = Alki.fechas.periodo(new Date());
    const beneficioMes = puede(ses, 'costes') ? db.viviendas.reduce((s, v) => s + Alki.panel.costes.resultado(v.id, [per], 'previsto').beneficio, 0) - Alki.panel.costes.generales([per]).total : null;
    const item = (seccion, ruta, icono, titulo, meta, valor) => puede(ses, seccion) ? '<li><a class="fila" href="#' + ruta + '"><span class="fila__icono">' + ic(icono) + '</span><span class="fila__principal"><span class="fila__titulo">' + titulo + '</span><span class="fila__meta">' + meta + '</span></span>' + (valor || ic('flecha')) + '</a></li>' : '';
    const atencion = [
      revision.length ? item('cobros', '/admin/cobros?f=revision', 'pagos', revision.length + ' pagos por confirmar', 'Inquilinos que han avisado de que han pagado') : '',
      urgentes.length ? item('incidencias', '/admin/incidencias', 'incidencias', urgentes.length + ' incidencias urgentes o de prioridad alta', 'Sin resolver') : '',
      sinAsignar.length ? item('incidencias', '/admin/incidencias?f=sinasignar', 'usuario', sinAsignar.length + ' incidencias sin responsable', 'Asígnalas a alguien del equipo') : '',
      solicitudes.length ? item('personas', '/admin/personas?f=revisar', 'calendario', solicitudes.length + ' solicitudes de inquilinos', 'Renovaciones, salidas o datos que no cuadran') : '',
      k.vencido ? item('cobros', '/admin/cobros?f=vencidos', 'pagos', 'Recibos vencidos', 'Pendientes de cobro', '<span class="fila__importe negativo">' + U.euro(k.vencido) + '</span>') : '',
      terminan.length ? item('personas', '/admin/personas?f=terminan', 'calendario', terminan.length + ' contratos terminan en 60 días', 'Ofrece renovación o prepara la comercialización') : '',
      sinRenta.length ? item('viviendas', '/admin/viviendas', 'edificio', sinRenta.length + ' viviendas sin renta al propietario', 'Sin ella el beneficio no es real') : '',
      (db.avisosDatos || []).length ? item('datos', '/admin/datos', 'documentos', db.avisosDatos.length + ' incoherencias en los datos importados', 'Contratos duplicados, fichas que no cuadran…') : ''
    ].join('');
    const actividad = ses.superadmin ? (db.actividad || []).slice(0, 8) : [];
    return {
      titulo: 'Resumen',
      html: U.cabecera('Hola, ' + U.primerNombre(ses.nombre), { subtitulo: U.fecha(Alki.fechas.fecha(new Date()), true) + (db.origen === 'real' ? ' · datos reales de ALKI' : ' · datos de demostración') }) +
        '<div class="cifras">' +
          '<div><strong>' + k.ocupacion + ' %</strong><span>Ocupación · ' + k.libres + ' libres</span></div>' +
          '<div><strong>' + k.incidenciasAbiertas + '</strong><span>Incidencias abiertas</span></div>' +
          (puede(ses, 'cobros') ? '<div><strong>' + U.euro(k.cobradoMes) + '</strong><span>Cobrado de ' + U.euro(k.previstoMes) + '</span></div>' : '<div><strong>' + db.contratos.length + '</strong><span>Contratos activos</span></div>') +
          (beneficioMes !== null ? '<div><strong class="' + (beneficioMes >= 0 ? 'positivo' : 'negativo') + '">' + U.euro(beneficioMes) + '</strong><span>Beneficio previsto del mes</span></div>' : '<div><strong>' + db.viviendas.length + '</strong><span>Viviendas</span></div>') +
        '</div>' +
        '<div class="dos-columnas" style="align-items:start">' +
          '<section class="seccion"><div class="seccion__cab"><h2>Necesita atención</h2></div>' + (atencion ? '<ul class="lista">' + atencion + '</ul>' : U.vacio('Todo en orden.')) + '</section>' +
          (puede(ses, 'incidencias') ? '<section class="seccion"><div class="seccion__cab"><h2>Mis incidencias</h2><a href="#/admin/incidencias?f=mias">Ver tablero</a></div>' +
            (misInc.length ? '<ul class="lista">' + misInc.map(A().utilidades.filaIncidencia).join('') + '</ul>' : U.vacio('No tienes incidencias asignadas.')) + '</section>' : '') +
        '</div>' +
        (actividad.length ? '<section class="seccion"><div class="seccion__cab"><h2>Actividad reciente del equipo</h2><a href="#/admin/actividad">Ver todo</a></div><ul class="lista">' +
          actividad.map(filaActividad).join('') + '</ul></section>' : '')
    };
  }
  function filaActividad(a) {
    return '<li><div class="fila"><span class="avatar avatar--peq" aria-hidden="true">' + esc(iniciales(a.quien)) + '</span><span class="fila__principal"><span class="fila__titulo">' + esc(a.quien) + ' <span style="font-weight:400">' + esc(a.accion.charAt(0).toLowerCase() + a.accion.slice(1)) + '</span></span>' +
      (a.detalle ? '<span class="fila__meta">' + esc(a.detalle) + '</span>' : '') + '</span><span class="fila__fin suave pequeno">' + U.haceTiempo(a.fecha) + '</span></div></li>';
  }

  /* ======================================================================
     TABLERO DE INCIDENCIAS (compartido por todo el equipo)
     ====================================================================== */
  function tablero(p, ses, q) {
    const f = q.f || 'todas';
    const yo = ses.miembroId;
    let lista = S.db.incidencias.slice();
    if (f === 'mias') lista = lista.filter((i) => i.asignadoA === yo);
    if (f === 'sinasignar') lista = lista.filter((i) => !i.asignadoA && S.incidenciaAbierta(i));
    if (q.v) lista = lista.filter((i) => i.viviendaId === q.v);
    const peso = { urgente: 0, alta: 1, media: 2, baja: 3 };
    lista.sort((a, b) => (peso[a.prioridad] - peso[b.prioridad]) || (a.creada < b.creada ? 1 : -1));
    const hace30 = Alki.fechas.fecha(Alki.fechas.sumarDias(new Date(), -30));
    const columnas = [
      ['abierta', 'Abiertas', lista.filter((i) => i.estado === 'abierta')],
      ['en_curso', 'En curso', lista.filter((i) => i.estado === 'en_curso')],
      ['resuelta', 'Resueltas · 30 días', lista.filter((i) => i.estado === 'resuelta' && (i.historial[i.historial.length - 1] || {}).fecha >= hace30)]
    ];
    const tarjeta = function (i) {
      const v = S.buscar('viviendas', i.viviendaId);
      const h = i.habitacionId ? S.buscar('habitaciones', i.habitacionId) : null;
      const m = i.asignadoA ? E.miembro(i.asignadoA) : null;
      const nFotos = (i.fotos || []).length + i.historial.reduce((s, x) => s + (x.fotos || []).length, 0);
      return '<a class="tarjeta-inc tarjeta-inc--' + i.prioridad + '" href="#/admin/incidencias/' + i.id + '">' +
        '<span class="tarjeta-inc__titulo">' + esc(i.titulo) + '</span>' +
        '<span class="tarjeta-inc__meta">' + esc(v.codigo) + (h ? '-' + h.codigo : '') + ' · ' + Alki.constantes.categorias[i.categoria] + ' · ' + U.relativo(i.creada) + '</span>' +
        '<span class="tarjeta-inc__pie">' + U.etiqueta('prioridad', i.prioridad) + (nFotos ? '<span class="suave pequeno">' + ic('camara') + nFotos + '</span>' : '') +
        (m ? '<span class="avatar avatar--peq" title="' + esc(m.nombre) + '">' + esc(iniciales(m.nombre)) + '</span>' : '<span class="tarjeta-inc__libre">Sin asignar</span>') + '</span></a>';
    };
    const editar = puede(ses, 'incidencias', 'editar');
    return {
      titulo: 'Incidencias',
      html: U.cabecera('Incidencias', { subtitulo: 'El tablero de todo el equipo.', accion: editar ? '<button class="boton" type="button" id="nueva-inc">' + ic('mas') + 'Registrar incidencia</button>' : '' }) +
        '<div class="controles"><nav class="chips chips--filtro" aria-label="Filtrar">' +
          [['todas', 'Todas'], ['mias', 'Mis incidencias'], ['sinasignar', 'Sin asignar']].map((o) => '<a href="#/admin/incidencias?f=' + o[0] + (q.v ? '&v=' + q.v : '') + '"' + (o[0] === f ? ' aria-current="true"' : '') + '>' + o[1] + '</a>').join('') + '</nav>' +
          '<label class="oculto" for="f-viv">Vivienda</label><select id="f-viv"><option value="">Todas las viviendas</option>' + S.db.viviendas.map((v) => '<option value="' + v.id + '"' + (v.id === q.v ? ' selected' : '') + '>' + esc(v.codigo) + '</option>').join('') + '</select></div>' +
        '<div class="tablero">' + columnas.map((c) => '<section class="tablero__col tablero__col--' + c[0] + '"><h2>' + c[1] + ' <span>' + c[2].length + '</span></h2>' +
          (c[2].length ? c[2].map(tarjeta).join('') : '<p class="tablero__vacio">Nada por aquí</p>') + '</section>').join('') + '</div>',
      montar: function (raiz) {
        const b = raiz.querySelector('#nueva-inc');
        if (b) b.addEventListener('click', () => A().utilidades.modalNuevaIncidencia());
        raiz.querySelector('#f-viv').addEventListener('change', function () { Alki.app.ir('/admin/incidencias?f=' + f + (this.value ? '&v=' + this.value : '')); });
      }
    };
  }

  // Detalle: la pantalla de gestión de siempre + quién es el responsable
  function incidencia(p, ses) {
    const base = A().incidencia(p);
    const i = S.buscar('incidencias', p.id);
    if (!i) return base;
    const editar = puede(ses, 'incidencias', 'editar');
    const posibles = activos().filter((m) => E.permiso({ miembroId: m.id }, 'incidencias') !== 'no' || m.superadmin);
    const bloque = '<div class="panel responsable"><label for="asignar"><strong>Responsable</strong><span class="suave pequeno">Quién del equipo se encarga</span></label>' +
      '<select id="asignar"' + (editar ? '' : ' disabled') + '><option value="">Sin asignar</option>' + posibles.map((m) => '<option value="' + m.id + '"' + (m.id === i.asignadoA ? ' selected' : '') + '>' + esc(m.nombre) + ' · ' + esc(m.puesto) + '</option>').join('') + '</select></div>';
    const corte = base.html.indexOf('</header>') + 9;
    return {
      titulo: base.titulo,
      html: base.html.slice(0, corte) + bloque + base.html.slice(corte),
      montar: function (raiz) {
        if (base.montar) base.montar(raiz);
        raiz.querySelector('#asignar').addEventListener('change', function () {
          i.asignadoA = this.value || null;
          const m = i.asignadoA ? E.miembro(i.asignadoA) : null;
          S.guardar();
          E.registrar(m ? 'Ha asignado una incidencia a ' + m.nombre : 'Ha quitado el responsable de una incidencia', i.titulo);
          U.toast(m ? 'Asignada a ' + U.primerNombre(m.nombre) : 'Sin responsable');
        });
      }
    };
  }

  /* ======================================================================
     COMUNICACIÓN: mensajes con propietarios, ALKI Social y avisos
     ====================================================================== */
  function pestanasComunicacion(activa, ses) {
    return '<div class="controles"><nav class="chips chips--filtro" aria-label="Comunicación">' +
      '<a href="#/admin/mensajes"' + (activa === 'mensajes' ? ' aria-current="true"' : '') + '>Mensajes con propietarios</a>' +
      '<a href="#/admin/social"' + (activa === 'social' ? ' aria-current="true"' : '') + '>ALKI Social</a></nav><span class="controles__hueco"></span>' +
      (puede(ses, 'comunicacion', 'editar') ? '<button class="boton boton--sec" type="button" id="publicar-aviso">' + ic('campana') + 'Publicar aviso</button>' : '') + '</div>';
  }
  function modalAviso() {
    U.abrirModal('Publicar aviso', '<form><div class="campo"><label for="av-viv">Para quién</label><select id="av-viv" name="vivienda"><option value="">Todos los residentes</option>' +
      S.db.viviendas.map((v) => '<option value="' + v.id + '">' + esc(v.codigo + ' · ' + v.alias) + '</option>').join('') + '</select></div>' +
      '<div class="campo"><label for="av-tit">Título</label><input id="av-tit" name="titulo" type="text" required maxlength="80"></div>' +
      '<div class="campo"><label for="av-txt">Mensaje</label><textarea id="av-txt" name="texto" required></textarea></div>' +
      '<button class="boton boton--bloque" type="submit">Publicar aviso</button></form>', {
      alMontar: (m) => m.querySelector('form').addEventListener('submit', function (e) {
        e.preventDefault();
        const d = U.datosFormulario(this);
        if (!d.titulo || !d.texto) return;
        S.crearAviso(d.vivienda, d.titulo, d.texto);
        U.cerrarModal(); U.toast('Aviso publicado');
      })
    });
  }
  function conPestanas(vista, activa) {
    return function (p, ses, q) {
      const base = vista(p, ses, q);
      const corte = base.html.indexOf('</header>') + 9;
      return {
        titulo: base.titulo,
        html: base.html.slice(0, corte) + pestanasComunicacion(activa, ses) + base.html.slice(corte),
        montar: function (raiz) {
          if (base.montar) base.montar(raiz);
          const b = raiz.querySelector('#publicar-aviso');
          if (b) b.addEventListener('click', modalAviso);
        }
      };
    };
  }

  /* ======================================================================
     DATOS: importar, revisar, copias
     ====================================================================== */
  function datos(p, ses) {
    const db = S.db;
    const editar = puede(ses, 'datos', 'editar');
    const fila = (id, icono, titulo, meta) => '<li><button class="fila" type="button" id="' + id + '"><span class="fila__icono">' + ic(icono) + '</span><span class="fila__principal"><span class="fila__titulo">' + titulo + '</span><span class="fila__meta">' + meta + '</span></span>' + ic('flecha') + '</button></li>';
    return {
      titulo: 'Datos',
      html: U.cabecera('Datos', { subtitulo: db.origen === 'real' ? 'Datos reales de ALKI, actualizados el ' + U.fecha(db.importado, true) + '.' : 'Datos de demostración.' }) +
        '<section class="seccion" style="margin-top:0"><h2 style="margin-bottom:10px">Programa de gestión</h2><ul class="lista">' +
          (editar ? fila('importar', 'subir', 'Importar CSV de contratos e inquilinos', 'Actualiza pisos, contratos y residentes. Lo hecho en el panel se conserva.') : '') +
          fila('revisar', 'documentos', 'Revisar incoherencias', (db.avisosDatos || []).length + ' avisos del último cruce de datos') +
        '</ul></section>' +
        (editar && puede(ses, 'costes', 'editar') ? '<section class="seccion"><h2 style="margin-bottom:10px">Gastos</h2><ul class="lista">' +
          fila('importar-gastos', 'pagos', 'Importar gastos desde CSV', 'Luz, agua, internet, IBI… de varios pisos a la vez') + '</ul></section>' : '') +
        (editar ? '<section class="seccion"><h2 style="margin-bottom:10px">Copias de seguridad</h2><ul class="lista">' +
          fila('exportar', 'descargar', 'Descargar copia de seguridad', 'Todo el panel en un archivo: contratos, incidencias, gastos, equipo…') +
          '<li><label class="fila" style="cursor:pointer"><span class="fila__icono">' + ic('subir') + '</span><span class="fila__principal"><span class="fila__titulo">Restaurar una copia</span><span class="fila__meta">Para pasar los datos a otro ordenador</span></span><input class="oculto" type="file" id="restaurar" accept=".json,application/json"></label></li>' +
          '</ul></section>' : ''),
      montar: function (raiz) {
        const u = A().utilidades;
        const on = (id, fn) => { const b = raiz.querySelector('#' + id); if (b) b.addEventListener('click', fn); };
        on('importar', u.modalImportar);
        on('revisar', u.modalRevisar);
        on('importar-gastos', Alki.panel.costes.modalImportarGastos);
        on('exportar', () => { u.descargar('alki-panel-copia-' + Alki.fechas.fecha(new Date()) + '.json', S.exportarCopia(), 'application/json'); E.registrar('Ha descargado una copia de seguridad', ''); });
        const r = raiz.querySelector('#restaurar');
        if (r) r.addEventListener('change', function () {
          if (!this.files[0]) return;
          u.leerTexto(this.files[0]).then((t) => { S.importarCopia(t); U.toast('Copia restaurada'); Alki.app.refrescar(); }).catch((e) => U.toast(e.message));
        });
      }
    };
  }

  /* ======================================================================
     EQUIPO Y PERMISOS (solo el encargado)
     ====================================================================== */
  function equipo(p, ses) {
    const lista = S.db.equipo || [];
    const secs = E.seccionesConPermiso;
    const estado = (m) => !m.activo ? '<span class="etiqueta etiqueta--neutro">Desactivado</span>' : m.clave ? '<span class="etiqueta etiqueta--ok">Activo</span>' : '<span class="etiqueta etiqueta--aviso">Pendiente de primer acceso</span>';
    const ultima = (m) => { const a = (S.db.actividad || []).find((x) => x.quien === m.nombre); return a ? U.haceTiempo(a.fecha) : '—'; };
    return {
      titulo: 'Equipo y permisos',
      html: U.cabecera('Equipo y permisos', { subtitulo: 'Tú tienes acceso total. Decide qué puede ver o editar cada persona.', accion: '<button class="boton" type="button" id="nuevo">' + ic('mas') + 'Añadir trabajador</button>' }) +
        '<section class="seccion" style="margin-top:0"><h2 style="margin-bottom:10px">Personas</h2><ul class="lista">' + lista.map((m) =>
          '<li><div class="fila"><span class="avatar" aria-hidden="true">' + esc(iniciales(m.nombre)) + '</span><span class="fila__principal"><span class="fila__titulo">' + esc(m.nombre) + (m.superadmin ? ' <span class="etiqueta etiqueta--info">Encargado</span>' : '') + '</span>' +
          '<span class="fila__meta">' + esc(m.puesto) + ' · ' + esc(m.email) + ' · última actividad ' + ultima(m) + '</span></span>' +
          '<span class="fila__fin">' + estado(m) + '</span></div>' +
          '<div class="fila__acciones"><button class="boton boton--sec boton--peq" type="button" data-editar="' + m.id + '">Editar datos</button>' +
          (m.clave ? '<button class="boton boton--sec boton--peq" type="button" data-reset="' + m.id + '">Restablecer contraseña</button>' : '') +
          (m.superadmin ? '' : '<button class="boton boton--' + (m.activo ? 'peligro' : 'sec') + ' boton--peq" type="button" data-activo="' + m.id + '">' + (m.activo ? 'Desactivar acceso' : 'Reactivar acceso') + '</button>') + '</div></li>').join('') + '</ul></section>' +
        '<section class="seccion"><div class="seccion__cab"><h2>Permisos por pestaña</h2></div>' +
          '<p class="suave pequeno" style="margin-bottom:10px"><strong>Sin acceso</strong>: no ve la pestaña. <strong>Solo ver</strong>: la consulta pero no cambia nada. <strong>Editar</strong>: trabaja en ella. Los cambios se guardan al momento.</p>' +
          '<div class="tabla-scroll"><table class="tabla matriz"><thead><tr><th>Persona</th>' + secs.map((s) => '<th title="' + esc(s[4]) + '">' + esc(s[1]) + '</th>').join('') + '<th>Perfil</th></tr></thead><tbody>' +
          lista.map((m) => '<tr><td><strong>' + esc(U.primerNombre(m.nombre)) + '</strong><div class="suave pequeno">' + esc(m.puesto) + '</div></td>' +
            secs.map((s) => m.superadmin ? '<td><span class="nivel nivel--editar">Total</span></td>'
              : '<td><label class="oculto" for="pm-' + m.id + '-' + s[0] + '">' + esc(s[1]) + ' de ' + esc(m.nombre) + '</label><select class="nivel nivel--' + (m.permisos[s[0]] || 'no') + '" id="pm-' + m.id + '-' + s[0] + '" data-miembro="' + m.id + '" data-seccion="' + s[0] + '"' + (m.activo ? '' : ' disabled') + '>' +
                Object.keys(niveles).map((n) => '<option value="' + n + '"' + ((m.permisos[s[0]] || 'no') === n ? ' selected' : '') + '>' + niveles[n] + '</option>').join('') + '</select></td>').join('') +
            '<td>' + (m.superadmin ? '' : '<label class="oculto" for="pf-' + m.id + '">Aplicar perfil</label><select id="pf-' + m.id + '" data-perfil="' + m.id + '"' + (m.activo ? '' : ' disabled') + '><option value="">Aplicar perfil…</option>' +
              Object.keys(E.perfiles).map((k) => '<option value="' + k + '">' + E.perfiles[k].nombre + '</option>').join('') + '</select>') + '</td></tr>').join('') +
          '</tbody></table></div>' +
          '<p class="suave pequeno" style="margin-top:8px">«Equipo y permisos» y «Actividad» son solo para el encargado.</p></section>',
      montar: function (raiz) {
        raiz.querySelector('#nuevo').addEventListener('click', () => formMiembro());
        raiz.querySelectorAll('[data-editar]').forEach((b) => b.addEventListener('click', () => formMiembro(E.miembro(b.dataset.editar))));
        raiz.querySelectorAll('[data-reset]').forEach((b) => b.addEventListener('click', function () {
          const m = E.miembro(b.dataset.reset);
          U.abrirModal('Restablecer contraseña', '<p>' + esc(m.nombre) + ' tendrá que crear una contraseña nueva la próxima vez que entre con su correo.</p><div class="acciones"><button class="boton" type="button" id="si">Restablecer</button><button class="boton boton--sec" type="button" data-cerrar-modal>Cancelar</button></div>', {
            alMontar: (md) => md.querySelector('#si').addEventListener('click', () => { E.restablecerClave(m.id); U.cerrarModal(); U.toast('Contraseña restablecida'); Alki.app.refrescar(); })
          });
        }));
        raiz.querySelectorAll('[data-activo]').forEach((b) => b.addEventListener('click', function () {
          const m = E.miembro(b.dataset.activo);
          E.actualizarTrabajador(m.id, { activo: !m.activo }, m.activo ? 'Ha desactivado el acceso de ' + m.nombre : 'Ha reactivado el acceso de ' + m.nombre);
          U.toast(m.activo ? 'Acceso reactivado' : 'Acceso desactivado');
          Alki.app.refrescar();
        }));
        raiz.querySelectorAll('select[data-seccion]').forEach((s) => s.addEventListener('change', function () {
          E.cambiarPermiso(s.dataset.miembro, s.dataset.seccion, s.value);
          s.className = 'nivel nivel--' + s.value;
          U.toast('Permiso guardado');
        }));
        raiz.querySelectorAll('select[data-perfil]').forEach((s) => s.addEventListener('change', function () {
          if (!s.value) return;
          E.aplicarPerfil(s.dataset.perfil, s.value);
          U.toast('Perfil aplicado');
          Alki.app.refrescar();
        }));
      }
    };
  }
  function formMiembro(m) {
    U.abrirModal(m ? 'Editar datos' : 'Añadir trabajador',
      '<form novalidate><div class="campo"><label for="m-nombre">Nombre y apellidos</label><input id="m-nombre" name="nombre" type="text" value="' + esc(m ? m.nombre : '') + '"></div>' +
      '<div class="campo"><label for="m-email">Correo de trabajo</label><input id="m-email" name="email" type="email" value="' + esc(m ? m.email : '') + '"><p class="campo__ayuda">Con este correo entrará y creará su contraseña.</p></div>' +
      '<div class="campo"><label for="m-puesto">Puesto</label><input id="m-puesto" name="puesto" type="text" value="' + esc(m ? m.puesto : '') + '" placeholder="Por ejemplo: Mantenimiento"></div>' +
      (m ? '' : '<div class="campo"><label for="m-perfil">Permisos de partida</label><select id="m-perfil" name="perfil">' + Object.keys(E.perfiles).filter((k) => k !== 'total').concat('total').map((k) => '<option value="' + k + '">' + E.perfiles[k].nombre + '</option>').join('') + '</select>' +
        '<p class="campo__ayuda">Luego puedes cambiarlos pestaña a pestaña.</p></div>') +
      '<p class="error-form" hidden></p><button class="boton boton--bloque" type="submit">' + (m ? 'Guardar' : 'Dar de alta') + '</button></form>', {
      alMontar: (md) => md.querySelector('form').addEventListener('submit', function (e) {
        e.preventDefault();
        const d = U.datosFormulario(this), err = md.querySelector('.error-form');
        if (!d.nombre || !/^\S+@\S+\.\S+$/.test(d.email)) { err.textContent = 'Escribe el nombre y un correo válido.'; err.hidden = false; return; }
        try {
          if (m) E.actualizarTrabajador(m.id, { nombre: d.nombre, email: d.email, puesto: d.puesto || m.puesto }, 'Ha editado los datos de ' + d.nombre);
          else E.crearTrabajador(d);
        } catch (x) { err.textContent = x.message; err.hidden = false; return; }
        U.cerrarModal();
        U.toast(m ? 'Datos guardados' : d.nombre + ' ya puede entrar con su correo');
        Alki.app.refrescar();
      })
    });
  }

  /* ======================================================================
     ACTIVIDAD (solo el encargado)
     ====================================================================== */
  function actividad(p, ses, q) {
    const quien = q.q || '';
    const lista = (S.db.actividad || []).filter((a) => !quien || a.quien === quien).slice(0, 300);
    const personas = Array.from(new Set((S.db.actividad || []).map((a) => a.quien)));
    let dia = '';
    return {
      titulo: 'Actividad',
      html: U.cabecera('Actividad', { subtitulo: 'Todo lo que hace el equipo en el panel.' }) +
        '<div class="controles"><label class="oculto" for="f-quien">Persona</label><select id="f-quien"><option value="">Todo el equipo</option>' + personas.map((x) => '<option' + (x === quien ? ' selected' : '') + '>' + esc(x) + '</option>').join('') + '</select></div>' +
        (lista.length ? lista.map(function (a) {
          const d = a.fecha.slice(0, 10);
          const cab = d !== dia ? (dia ? '</ul>' : '') + '<h2 class="actividad__dia">' + U.fecha(d, true) + '</h2><ul class="lista">' : '';
          dia = d;
          return cab + filaActividad(a);
        }).join('') + '</ul>' : U.vacio('Todavía no hay actividad.')),
      montar: (raiz) => raiz.querySelector('#f-quien').addEventListener('change', function () { Alki.app.ir('/admin/actividad' + (this.value ? '?q=' + encodeURIComponent(this.value) : '')); })
    };
  }

  /* ======================================================================
     PERFIL
     ====================================================================== */
  function perfil(p, ses) {
    const m = E.miembro(ses.miembroId);
    return {
      titulo: 'Mi perfil',
      html: U.cabecera(m.nombre, { subtitulo: esc(m.puesto) + ' · ' + esc(m.email) }) +
        '<section class="seccion" style="margin-top:0"><h2 style="margin-bottom:10px">Mis accesos</h2><ul class="lista">' +
          E.secciones.filter((s) => !E.soloEncargado.includes(s[0]) || m.superadmin).map((s) => { const n = E.permiso(ses, s[0]); return '<li><div class="fila"><span class="fila__icono">' + ic(s[2]) + '</span><span class="fila__principal"><span class="fila__titulo">' + s[1] + '</span><span class="fila__meta">' + esc(s[4]) + '</span></span><span class="nivel nivel--' + n + '">' + (m.superadmin ? 'Total' : niveles[n]) + '</span></div></li>'; }).join('') +
        '</ul></section>' +
        '<div class="acciones"><button class="boton boton--sec" type="button" id="cambiar">Cambiar contraseña</button><button class="boton" type="button" id="salir">' + ic('salir') + 'Cerrar sesión</button></div>',
      montar: function (raiz) {
        raiz.querySelector('#salir').addEventListener('click', () => { E.registrar('Ha cerrado sesión', ''); E.salir(); Alki.app.ir('/login'); });
        raiz.querySelector('#cambiar').addEventListener('click', function () {
          U.abrirModal('Cambiar contraseña', '<form novalidate><div class="campo"><label for="n1">Nueva contraseña</label><input id="n1" type="password" autocomplete="new-password"></div><div class="campo"><label for="n2">Repite la contraseña</label><input id="n2" type="password" autocomplete="new-password"></div><p class="error-form" hidden></p><button class="boton boton--bloque" type="submit">Guardar</button></form>', {
            alMontar: (md) => md.querySelector('form').addEventListener('submit', function (e) {
              e.preventDefault();
              const a = md.querySelector('#n1').value, b = md.querySelector('#n2').value, err = md.querySelector('.error-form');
              if (a.length < 8 || a !== b) { err.textContent = a.length < 8 ? 'Mínimo 8 caracteres.' : 'No coinciden.'; err.hidden = false; return; }
              E.crearClave(m, a).then(() => { E.registrar('Ha cambiado su contraseña', ''); U.cerrarModal(); U.toast('Contraseña cambiada'); });
            })
          });
        });
      }
    };
  }

  Alki.panel.vistas = {
    login, resumen, tablero, incidencia, datos, equipo, actividad, perfil,
    mensajes: conPestanas((p, s, q) => A().mensajes(p, s, q || {}), 'mensajes'),
    social: conPestanas((p, s, q) => Alki.vistas.social(p, s, q || {}), 'social')
  };
})();
