/* ==========================================================================
   admin.js — PANEL DEL EQUIPO ALKI
   Panel · Viviendas · Incidencias · Cobros · Personas · Mensajes
   Es el "centro de control": aquí se importan los CSV, se confirman pagos,
   se gestionan incidencias y se ve la rentabilidad de cada vivienda.
   ========================================================================== */
window.Alki = window.Alki || {};
Alki.vistas = Alki.vistas || {};

(function () {
  const S = Alki.store, U = Alki.ui, C = Alki.constantes;
  const esc = U.esc, ic = U.icono;
  const pesoPrioridad = { urgente: 0, alta: 1, media: 2, baja: 3 };
  const nombreVivienda = (v) => v.codigo + ' · ' + v.alias;

  // Datos de un recibo listos para mostrar (quién, qué piso, qué habitación)
  function infoPago(p) {
    const c = S.buscar('contratos', p.contratoId);
    const h = S.buscar('habitaciones', c.habitacionId);
    return { c, h, v: S.buscar('viviendas', h.viviendaId), i: S.buscar('inquilinos', c.inquilinoId) };
  }
  function filtros(base, actual, opciones, param) {
    return '<nav class="chips chips--filtro" aria-label="Filtrar" style="margin-bottom:14px">' + opciones.map((o) =>
      '<a href="#' + base + '?' + (param || 'f') + '=' + o[0] + '"' + (o[0] === actual ? ' aria-current="true"' : '') + '>' + o[1] + '</a>').join('') + '</nav>';
  }
  // Buscador instantáneo: oculta los elementos [data-buscar] que no contienen el texto
  function buscador(placeholder) {
    return '<div class="buscador"><label class="oculto" for="buscar">Buscar</label><input id="buscar" type="search" placeholder="' + placeholder + '" autocomplete="off"></div>';
  }
  function montarBuscador(raiz) {
    const input = raiz.querySelector('#buscar');
    if (!input) return;
    const norm = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    input.addEventListener('input', function () {
      const q = norm(input.value.trim());
      raiz.querySelectorAll('[data-buscar]').forEach((el) => { el.hidden = q && !norm(el.dataset.buscar).includes(q); });
    });
  }
  function montarCobros(raiz) {
    raiz.querySelectorAll('[data-cobrar]').forEach(function (b) {
      b.addEventListener('click', function () {
        S.confirmarPago(b.dataset.cobrar);
        U.toast('Pago marcado como cobrado');
        Alki.app.refrescar(true);
      });
    });
  }
  const leerTexto = (archivo) => new Promise(function (ok, mal) {
    const r = new FileReader();
    r.onload = () => ok(r.result);
    r.onerror = () => mal(new Error('No se pudo leer ' + archivo.name));
    r.readAsText(archivo, 'utf-8');
  });

  /* ---------- Importar CSV del programa de gestión ---------- */
  function modalImportar() {
    U.abrirModal('Importar datos de ALKI',
      '<p style="margin-bottom:14px">Sube los dos CSV que exportas del programa de gestión: <strong>contratos</strong> e <strong>inquilinos</strong>. ' +
      'Se guardan solo en este navegador. Lo que ya hayas hecho en la app (pagos confirmados, incidencias, rentas de propietarios) se conserva.</p>' +
      '<form id="form-importar"><div class="campo"><label for="csv">Archivos CSV (selecciona los dos)</label>' +
      '<input id="csv" type="file" accept=".csv,text/csv" multiple required></div>' +
      '<p class="error-form" hidden></p><button class="boton boton--bloque" type="submit">' + ic('subir') + 'Importar datos</button></form>',
      {
        alMontar: function (m) {
          m.querySelector('form').addEventListener('submit', function (e) {
            e.preventDefault();
            const archivos = Array.from(m.querySelector('#csv').files);
            const error = m.querySelector('.error-form');
            if (archivos.length !== 2) { error.textContent = 'Selecciona los dos archivos a la vez (contratos e inquilinos).'; error.hidden = false; return; }
            Promise.all(archivos.map(leerTexto)).then(function (textos) {
              const r = S.importarCSV(textos[0], textos[1]);
              U.cerrarModal();
              U.toast('Importados ' + r.contratos + ' contratos de ' + r.viviendas + ' viviendas');
              Alki.app.refrescar();
            }).catch(function (err) { error.textContent = err.message; error.hidden = false; });
          });
        }
      });
  }
  function modalRevisar() {
    const tipos = { duplicado: 'Habitaciones con dos contratos', referencia: 'La ficha del inquilino no coincide con su contrato', unidad: 'Contratos sin habitación', 'sin-contrato': 'Inquilinos sin contrato activo', ficha: 'Contratos sin ficha de inquilino', correo: 'Correos compartidos', fechas: 'Contratos vencidos', formato: 'Filas que no se han podido leer' };
    const grupos = {};
    (S.db.avisosDatos || []).forEach((a) => { (grupos[a.tipo] = grupos[a.tipo] || []).push(a.texto); });
    U.abrirModal('Revisar datos',
      '<p class="suave" style="margin-bottom:14px">Incoherencias encontradas al cruzar los CSV. Conviene corregirlas en el programa de gestión y volver a importar.</p>' +
      Object.keys(grupos).map((t) => '<h3 style="font-size:1rem;margin:18px 0 8px">' + esc(tipos[t] || t) + ' (' + grupos[t].length + ')</h3><ul class="lista">' +
        grupos[t].map((x) => '<li><div class="fila"><span class="fila__principal pequeno">' + esc(x) + '</span></div></li>').join('') + '</ul>').join(''),
      { ancho: true });
  }
  function descargar(nombre, texto, tipo) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([texto], { type: tipo }));
    a.download = nombre;
    document.body.appendChild(a); a.click(); a.remove();
  }

  /* ======================================================================
     PANEL
     ====================================================================== */
  function panel() {
    const k = S.indicadores();
    const db = S.db;
    const enRevision = db.pagos.filter((p) => S.estadoPago(p) === 'revision');
    const vencidos = db.pagos.filter((p) => S.estadoPago(p) === 'vencido');
    const urgentes = db.incidencias.filter((i) => S.incidenciaAbierta(i) && (i.prioridad === 'urgente' || i.prioridad === 'alta'));
    const solicitudes = db.solicitudes.filter((s) => s.estado === 'nueva');
    const hoyISO = Alki.fechas.fecha(new Date());
    const finDentro60 = db.contratos.filter((c) => { const d = U.diasHasta(c.fin); return d >= 0 && d <= 60; });
    const tiposSol = { renovacion: 'Quiere renovar', salida: 'Aviso de salida', datos: 'Sus datos no cuadran' };
    const nAvisos = (db.avisosDatos || []).length;

    const atencion = []
      .concat(enRevision.map(function (p) {
        const x = infoPago(p);
        return '<li><div class="fila"><span class="fila__icono">' + ic('pagos') + '</span><span class="fila__principal">' +
          '<span class="fila__titulo">' + esc(x.c.nombres) + ' avisa de un pago</span><span class="fila__meta">' + U.mes(p.periodo) + ' · ' + esc(x.v.codigo + '-' + x.h.codigo) + (p.metodo ? ' · ' + esc(p.metodo) : '') + '</span></span>' +
          '<span class="fila__fin"><span class="fila__importe">' + U.euro(p.importe) + '</span><button class="boton boton--peq" type="button" data-cobrar="' + p.id + '">Confirmar</button></span></div></li>';
      }))
      .concat(urgentes.map((i) =>
        '<li><a class="fila" href="#/admin/incidencias/' + i.id + '"><span class="fila__icono">' + ic('incidencias') + '</span><span class="fila__principal">' +
        '<span class="fila__titulo">' + esc(i.titulo) + '</span><span class="fila__meta">' + esc(S.buscar('viviendas', i.viviendaId).codigo) + ' · ' + U.relativo(i.creada) + '</span></span>' +
        '<span class="fila__fin">' + U.etiqueta('prioridad', i.prioridad) + '</span></a></li>'))
      .concat(solicitudes.map(function (s) {
        const i = S.buscar('inquilinos', s.inquilinoId);
        return '<li><div class="fila"><span class="fila__icono">' + ic('calendario') + '</span><span class="fila__principal">' +
          '<span class="fila__titulo">' + tiposSol[s.tipo] + ': ' + esc(i ? i.nombre : '') + '</span><span class="fila__meta">«' + esc(s.texto) + '» · ' + U.relativo(s.fecha) + '</span></span>' +
          '<button class="boton boton--sec boton--peq" type="button" data-solicitud="' + s.id + '">Marcar atendida</button></div></li>';
      }))
      .concat(vencidos.length ? ['<li><a class="fila" href="#/admin/cobros?f=vencidos"><span class="fila__icono">' + ic('pagos') + '</span><span class="fila__principal">' +
        '<span class="fila__titulo">' + vencidos.length + (vencidos.length === 1 ? ' recibo vencido' : ' recibos vencidos') + '</span><span class="fila__meta">Total pendiente de cobro</span></span>' +
        '<span class="fila__fin"><span class="fila__importe negativo">' + U.euro(k.vencido) + '</span></span></a></li>'] : [])
      .concat(finDentro60.length ? ['<li><a class="fila" href="#/admin/personas?f=terminan"><span class="fila__icono">' + ic('calendario') + '</span><span class="fila__principal">' +
        '<span class="fila__titulo">' + finDentro60.length + ' contratos terminan en los próximos 60 días</span><span class="fila__meta">Ofrece renovación o prepara la comercialización</span></span>' + ic('flecha') + '</a></li>'] : [])
      .concat(nAvisos ? ['<li><button class="fila" type="button" id="revisar"><span class="fila__icono">' + ic('documentos') + '</span><span class="fila__principal">' +
        '<span class="fila__titulo">' + nAvisos + ' incoherencias en los datos importados</span><span class="fila__meta">Contratos duplicados, fichas que no cuadran…</span></span>' + ic('flecha') + '</button></li>'] : []);

    let totI = 0, totR = 0, totD = 0;
    const filas = db.viviendas.map(function (v) {
      const r = S.resumenVivienda(v.id);
      totI += r.ingresos; if (r.renta) { totR += r.renta; totD += r.diferencia; }
      return '<tr data-buscar="' + esc(nombreVivienda(v) + ' ' + v.barrio) + '"><td style="white-space:nowrap"><a href="#/admin/viviendas/' + v.id + '"><strong>' + esc(v.codigo) + '</strong></a> <span class="suave">' + esc(v.alias) + '</span></td>' +
        '<td class="der">' + r.ocupadas + '/' + r.total + '</td><td class="der">' + U.euro(r.ingresos) + '</td>' +
        '<td class="der">' + (r.renta ? U.euro(r.renta) : '<a href="#/admin/viviendas/' + v.id + '" class="suave">Añadir</a>') + '</td>' +
        '<td class="der ' + (r.diferencia === null ? '' : r.diferencia >= 0 ? 'positivo' : 'negativo') + '">' + (r.diferencia === null ? '—' : U.euro(r.diferencia)) + '</td></tr>';
    }).join('');

    const origen = db.origen === 'real'
      ? '<div class="banda banda--real">' + ic('check') + '<span><strong>Datos reales de ALKI</strong> · actualizados el ' + U.fecha(db.importado, true) + '</span></div>'
      : '<div class="banda">' + ic('ojo') + '<span><strong>Datos de demostración:</strong> pisos y contratos reales con nombres inventados. Para usar los reales, pulsa <em>Importar CSV</em>.</span></div>';

    return {
      titulo: 'Panel',
      html: U.cabecera('Panel de ALKI', {
        subtitulo: U.fecha(hoyISO, true) + ' · ' + db.viviendas.length + ' viviendas · ' + db.contratos.length + ' contratos activos',
        accion: '<div class="acciones" style="margin:0"><button class="boton boton--sec" type="button" id="importar">' + ic('subir') + 'Importar CSV</button>' +
          '<button class="boton" type="button" id="nuevo-aviso">' + ic('campana') + 'Publicar aviso</button></div>'
      }) + origen +
        '<div class="cifras">' +
          '<div><strong>' + k.ocupacion + ' %</strong><span>Ocupación (' + k.ocupadas + ' de ' + k.habitaciones + ')</span></div>' +
          '<div><strong>' + k.libres + '</strong><span>Libres' + (k.reforma ? ' · ' + k.reforma + ' en reforma' : '') + '</span></div>' +
          '<div><strong>' + U.euro(k.cobradoMes) + '</strong><span>Cobrado de ' + U.euro(k.previstoMes) + ' este mes</span></div>' +
          '<div><strong class="' + (k.vencido ? 'negativo' : '') + '">' + U.euro(k.vencido) + '</strong><span>Recibos vencidos</span></div>' +
        '</div>' +
        '<section class="seccion"><div class="seccion__cab"><h2>Necesita atención</h2></div>' +
          (atencion.length ? '<ul class="lista">' + atencion.join('') + '</ul>' : U.vacio('Todo en orden por hoy.')) + '</section>' +
        '<section class="seccion"><div class="seccion__cab"><h2>Rentabilidad mensual por vivienda</h2></div>' + buscador('Buscar vivienda o barrio') +
          '<div class="tabla-scroll"><table class="tabla"><thead><tr><th>Vivienda</th><th class="der">Ocup.</th><th class="der">Ingresos</th><th class="der">Renta propietario</th><th class="der">Diferencia</th></tr></thead>' +
          '<tbody>' + filas + '</tbody><tfoot><tr><td>Total</td><td></td><td class="der">' + U.euro(totI) + '</td><td class="der">' + (totR ? U.euro(totR) : '—') + '</td><td class="der">' + (totR ? U.euro(totD) : '—') + '</td></tr></tfoot></table></div>' +
          '<p class="suave pequeno" style="margin-top:8px">Ingresos = rentas de los contratos activos. Diferencia inicial: antes de suministros, limpieza, mantenimiento, vacancia e impuestos; no es el beneficio neto. La renta al propietario no viene en el CSV: añádela en cada vivienda.</p>' +
        '</section>' +
        '<section class="seccion"><h2 style="margin-bottom:10px">Datos y copias</h2><ul class="lista">' +
          '<li><a class="fila" href="#/admin/mensajes"><span class="fila__icono">' + ic('chat') + '</span><span class="fila__principal"><span class="fila__titulo">Mensajes de propietarios</span><span class="fila__meta">' + db.propietarios.length + ' propietarios</span></span>' + ic('flecha') + '</a></li>' +
          '<li><button class="fila" type="button" id="exportar"><span class="fila__icono">' + ic('descargar') + '</span><span class="fila__principal"><span class="fila__titulo">Descargar copia de seguridad</span><span class="fila__meta">Guarda todo lo que hay en la app en un archivo</span></span></button></li>' +
          '<li><label class="fila" style="cursor:pointer"><span class="fila__icono">' + ic('subir') + '</span><span class="fila__principal"><span class="fila__titulo">Restaurar una copia</span><span class="fila__meta">Para pasar los datos a otro ordenador</span></span><input class="oculto" type="file" id="restaurar" accept=".json,application/json"></label></li>' +
        '</ul></section>',
      montar: function (raiz) {
        montarCobros(raiz);
        montarBuscador(raiz);
        raiz.querySelector('#importar').addEventListener('click', modalImportar);
        const rev = raiz.querySelector('#revisar');
        if (rev) rev.addEventListener('click', modalRevisar);
        raiz.querySelector('#exportar').addEventListener('click', () => descargar('alki-copia-' + hoyISO + '.json', S.exportarCopia(), 'application/json'));
        raiz.querySelector('#restaurar').addEventListener('change', function () {
          if (!this.files[0]) return;
          leerTexto(this.files[0]).then(function (t) { S.importarCopia(t); U.toast('Copia restaurada'); Alki.app.refrescar(); })
            .catch((e) => U.toast(e.message));
        });
        raiz.querySelectorAll('[data-solicitud]').forEach((b) => b.addEventListener('click', function () {
          S.cerrarSolicitud(b.dataset.solicitud);
          U.toast('Solicitud atendida');
          Alki.app.refrescar(true);
        }));
        raiz.querySelector('#nuevo-aviso').addEventListener('click', function () {
          U.abrirModal('Publicar aviso',
            '<form><div class="campo"><label for="av-viv">Para quién</label><select id="av-viv" name="vivienda"><option value="">Todos los residentes</option>' +
            S.db.viviendas.map((v) => '<option value="' + v.id + '">' + esc(nombreVivienda(v)) + '</option>').join('') + '</select></div>' +
            '<div class="campo"><label for="av-tit">Título</label><input id="av-tit" name="titulo" type="text" required maxlength="80"></div>' +
            '<div class="campo"><label for="av-txt">Mensaje</label><textarea id="av-txt" name="texto" required></textarea></div>' +
            '<button class="boton boton--bloque" type="submit">Publicar aviso</button></form>',
            {
              alMontar: function (m) {
                m.querySelector('form').addEventListener('submit', function (e) {
                  e.preventDefault();
                  const d = U.datosFormulario(this);
                  S.crearAviso(d.vivienda, d.titulo, d.texto);
                  U.cerrarModal();
                  U.toast('Aviso publicado');
                });
              }
            });
        });
      }
    };
  }

  /* ======================================================================
     VIVIENDAS
     ====================================================================== */
  function viviendas() {
    const tarjetas = S.db.viviendas.map(function (v) {
      const r = S.resumenVivienda(v.id);
      const pr = S.buscar('propietarios', v.propietarioId);
      const deuda = S.habitacionesDe(v.id).some((h) => { const c = S.contratoDeHabitacion(h.id); return c && c.solvencia === 'overdue'; });
      return '<a class="vivienda vivienda--compacta" href="#/admin/viviendas/' + v.id + '" data-buscar="' + esc(nombreVivienda(v) + ' ' + v.barrio + ' ' + pr.nombre) + '">' +
        '<div class="vivienda__cab"><div><h2>' + esc(v.codigo) + '</h2><p class="suave pequeno">' + esc(v.alias) + (v.barrio ? ' · ' + esc(v.barrio) : '') + '</p></div>' +
        (r.libres ? '<span class="etiqueta etiqueta--aviso">' + r.libres + (r.libres === 1 ? ' libre' : ' libres') + '</span>' : '<span class="etiqueta etiqueta--ok">Completa</span>') + '</div>' +
        U.plano(v, { mini: true }) +
        '<div class="vivienda__pie"><span><strong>' + r.ocupadas + '/' + r.total + '</strong> ocupadas</span><span><strong>' + U.euro(r.ingresos) + '</strong>/mes</span>' +
        (deuda ? '<span class="negativo"><strong>Con deuda</strong></span>' : '') + '</div></a>';
    }).join('');
    return {
      titulo: 'Viviendas',
      html: U.cabecera('Viviendas', { subtitulo: S.db.viviendas.length + ' viviendas y ' + S.db.habitaciones.length + ' unidades en la cartera.' }) +
        buscador('Buscar por código, calle, barrio o propietario') + '<div class="rejilla">' + tarjetas + '</div>' + U.leyendaPlano(),
      montar: montarBuscador
    };
  }

  function vivienda(p) {
    const v = S.buscar('viviendas', p.id);
    if (!v) return { html: U.cabecera('Vivienda no encontrada', { volver: '/admin/viviendas' }) };
    const pr = S.buscar('propietarios', v.propietarioId);
    const incs = S.incidenciasDeVivienda(v.id);
    const r = S.resumenVivienda(v.id);
    const filas = S.habitacionesDe(v.id).sort((a, b) => a.codigo.localeCompare(b.codigo, 'es', { numeric: true })).map(function (h) {
      const est = S.estadoHabitacion(h);
      const lista = S.contratosDeHabitacion(h.id);
      const accion = est === 'ocupada' ? '' : '<button class="boton boton--sec boton--peq" type="button" data-reforma="' + h.id + '" data-valor="' + (est === 'libre') + '">' +
        (est === 'libre' ? 'Pasar a reforma' : 'Lista para alquilar') + '</button>';
      const residentes = lista.length ? lista.map((c) => '<div>' + esc(c.nombres) + ' <span class="suave pequeno">· hasta ' + U.fecha(c.fin) + '</span> ' + U.etiqueta('solvencia', c.solvencia) + '</div>').join('') : '<span class="suave">—</span>';
      return '<tr><td><strong>' + h.codigo + '</strong><div class="suave pequeno">' + esc(h.tipo) + (h.cama ? ' · ' + h.cama + ' cm' : '') + '</div></td><td>' + U.etiqueta('habitacion', est) + '</td>' +
        '<td>' + residentes + '</td><td class="der">' + U.euro(lista.length ? lista[0].renta : h.precio) + '</td><td>' + accion + '</td></tr>';
    }).join('');
    const val = (x) => esc(x === null || x === undefined ? '' : x);
    const opcion = (valor, texto) => '<option value="' + valor + '"' + (String(v.estadoGeneral) === valor ? ' selected' : '') + '>' + texto + '</option>';
    return {
      titulo: v.codigo,
      html: U.cabecera(nombreVivienda(v), { volver: '/admin/viviendas', volverTexto: 'Viviendas', subtitulo: (v.barrio ? esc(v.barrio) + ' · ' : '') + 'propietario: ' + esc(pr.nombre) + ' · inmueble n.º ' + v.numero }) +
        U.plano(v, { nombres: true }) + U.leyendaPlano() +
        '<div class="panel" style="margin-top:16px"><dl class="datos">' +
          '<div><dt>Ocupación</dt><dd>' + r.ocupadas + ' de ' + r.total + '</dd></div><div><dt>Ingresos al mes</dt><dd class="num">' + U.euro(r.ingresos) + '</dd></div>' +
          '<div><dt>Renta al propietario</dt><dd class="num">' + (r.renta ? U.euro(r.renta) : 'Sin registrar') + '</dd></div>' +
          '<div><dt>Diferencia</dt><dd class="num ' + (r.diferencia === null ? '' : r.diferencia >= 0 ? 'positivo' : 'negativo') + '">' + (r.diferencia === null ? '—' : U.euro(r.diferencia)) + '</dd></div></dl></div>' +
        '<section class="seccion"><h2 style="margin-bottom:10px">Habitaciones y contratos</h2><div class="tabla-scroll"><table class="tabla">' +
        '<thead><tr><th>Unidad</th><th>Estado</th><th>Residentes</th><th class="der">Renta</th><th></th></tr></thead><tbody>' + filas + '</tbody></table></div></section>' +
        '<div class="dos-columnas" style="align-items:start">' +
        '<section class="seccion"><h2 style="margin-bottom:10px">Datos de la vivienda</h2>' +
        '<form id="form-vivienda" class="panel"><p class="suave pequeno" style="margin-bottom:14px">Estos datos no vienen en el CSV. Los ven el propietario y los inquilinos.</p>' +
          '<div class="campo"><label for="f-renta">Renta mensual al propietario (€)</label><input id="f-renta" name="rentaPropietario" type="number" min="0" step="1" value="' + val(v.rentaPropietario) + '"></div>' +
          '<div class="campo"><label for="f-ini">Contrato con el propietario: inicio</label><input id="f-ini" name="contratoInicio" type="date" value="' + val(v.contratoInicio) + '"></div>' +
          '<div class="campo"><label for="f-fin">Contrato con el propietario: fin</label><input id="f-fin" name="contratoFin" type="date" value="' + val(v.contratoFin) + '"></div>' +
          '<div class="campo"><label for="f-barrio">Barrio</label><input id="f-barrio" name="barrio" type="text" value="' + val(v.barrio) + '"></div>' +
          '<div class="campo"><label for="f-estado">Estado de la vivienda</label><select id="f-estado" name="estadoGeneral">' + opcion('null', 'Sin revisar') + opcion('bueno', 'Buen estado') + opcion('atencion', 'Requiere atención') + opcion('reforma', 'En reforma') + '</select></div>' +
          '<div class="campo"><label for="f-nota">Nota de la última revisión</label><textarea id="f-nota" name="notaRevision">' + val(v.notaRevision) + '</textarea><p class="campo__ayuda">Al cambiarla se guarda la fecha de hoy como última revisión.</p></div>' +
          '<div class="campo"><label for="f-wifi">Wifi: nombre de la red</label><input id="f-wifi" name="wifiRed" type="text" value="' + val(v.wifi && v.wifi.red) + '"></div>' +
          '<div class="campo"><label for="f-clave">Wifi: clave</label><input id="f-clave" name="wifiClave" type="text" value="' + val(v.wifi && v.wifi.clave) + '"></div>' +
          '<div class="campo"><label for="f-limp">Día de limpieza</label><input id="f-limp" name="limpieza" type="text" placeholder="Por ejemplo: martes por la mañana" value="' + val(v.limpieza) + '"></div>' +
          '<button class="boton boton--bloque" type="submit">Guardar datos de la vivienda</button></form></section>' +
        '<section class="seccion"><div class="seccion__cab"><h2>Incidencias</h2><a href="#/admin/incidencias?nueva=' + v.id + '">Registrar</a></div>' +
          (incs.length ? '<ul class="lista">' + incs.map(filaIncidencia).join('') + '</ul>' : U.vacio('Sin incidencias.')) + '</section></div>',
      montar: function (raiz) {
        raiz.querySelectorAll('[data-reforma]').forEach((b) => b.addEventListener('click', function () {
          S.marcarReforma(b.dataset.reforma, b.dataset.valor === 'true');
          U.toast('Habitación actualizada');
          Alki.app.refrescar(true);
        }));
        raiz.querySelector('#form-vivienda').addEventListener('submit', function (e) {
          e.preventDefault();
          const d = U.datosFormulario(this);
          const cambios = {
            rentaPropietario: Number(d.rentaPropietario) || null, contratoInicio: d.contratoInicio || null, contratoFin: d.contratoFin || null,
            barrio: d.barrio, estadoGeneral: d.estadoGeneral === 'null' ? null : d.estadoGeneral, limpieza: d.limpieza || null,
            wifi: d.wifiRed ? { red: d.wifiRed, clave: d.wifiClave } : null, notaRevision: d.notaRevision
          };
          if (d.notaRevision !== (v.notaRevision || '')) cambios.ultimaRevision = Alki.fechas.fecha(new Date());
          S.actualizarVivienda(v.id, cambios);
          U.toast('Datos guardados');
          Alki.app.refrescar(true);
        });
      }
    };
  }

  /* ======================================================================
     INCIDENCIAS
     ====================================================================== */
  function filaIncidencia(i) {
    const v = S.buscar('viviendas', i.viviendaId);
    const h = i.habitacionId ? S.buscar('habitaciones', i.habitacionId) : null;
    const inq = i.inquilinoId ? S.buscar('inquilinos', i.inquilinoId) : null;
    return '<li><a class="fila" href="#/admin/incidencias/' + i.id + '"><span class="fila__icono">' + ic('incidencias') + '</span>' +
      '<span class="fila__principal"><span class="fila__titulo">' + esc(i.titulo) + '</span>' +
      '<span class="fila__meta">' + esc(v.codigo) + (h ? '-' + h.codigo : '') + (inq ? ' · ' + esc(inq.nombre) : '') + ' · ' + U.relativo(i.creada) + '</span></span>' +
      '<span class="fila__fin">' + U.etiqueta('incidencia', i.estado) + U.etiqueta('prioridad', i.prioridad) + '</span></a></li>';
  }

  // El equipo registra incidencias que llegan por WhatsApp o teléfono
  function modalNuevaIncidencia(viviendaId) {
    const opcionesViv = S.db.viviendas.map((v) => '<option value="' + v.id + '"' + (v.id === viviendaId ? ' selected' : '') + '>' + esc(nombreVivienda(v)) + '</option>').join('');
    U.abrirModal('Registrar incidencia',
      '<form><div class="campo"><label for="n-viv">Vivienda</label><select id="n-viv" name="vivienda" required>' + opcionesViv + '</select></div>' +
      '<div class="campo"><label for="n-hab">Dónde</label><select id="n-hab" name="habitacion"></select></div>' +
      '<div class="campo"><label for="n-cat">Categoría</label><select id="n-cat" name="categoria">' + Object.keys(C.categorias).map((k) => '<option value="' + k + '">' + C.categorias[k] + '</option>').join('') + '</select></div>' +
      '<div class="campo"><label for="n-tit">Título</label><input id="n-tit" name="titulo" type="text" required maxlength="80"></div>' +
      '<div class="campo"><label for="n-desc">Descripción</label><textarea id="n-desc" name="descripcion" required></textarea></div>' +
      '<div class="campo"><label for="n-pri">Prioridad</label><select id="n-pri" name="prioridad"><option value="baja">Baja</option><option value="media" selected>Media</option><option value="alta">Alta</option><option value="urgente">Urgente</option></select></div>' +
      '<button class="boton boton--bloque" type="submit">Registrar incidencia</button></form>',
      {
        alMontar: function (m) {
          const selV = m.querySelector('#n-viv'), selH = m.querySelector('#n-hab');
          function rellenar() {
            selH.innerHTML = '<option value="">Zonas comunes</option>' + S.habitacionesDe(selV.value).map(function (h) {
              const c = S.contratoDeHabitacion(h.id);
              return '<option value="' + h.id + '">' + h.codigo + (c ? ' · ' + esc(c.nombres) : ' · libre') + '</option>';
            }).join('');
          }
          rellenar();
          selV.addEventListener('change', rellenar);
          m.querySelector('form').addEventListener('submit', function (e) {
            e.preventDefault();
            const d = U.datosFormulario(this);
            const c = d.habitacion ? S.contratoDeHabitacion(d.habitacion) : null;
            const inc = S.crearIncidencia({ viviendaId: d.vivienda, habitacionId: d.habitacion || null, inquilinoId: c ? c.inquilinoId : null, categoria: d.categoria, titulo: d.titulo, descripcion: d.descripcion, prioridad: d.prioridad });
            U.cerrarModal();
            U.toast('Incidencia registrada');
            Alki.app.ir('/admin/incidencias/' + inc.id);
          });
        }
      });
  }

  function incidencias(p, ses, q) {
    const f = q.f || 'abiertas';
    let lista = S.db.incidencias.slice();
    if (f === 'abiertas') lista = lista.filter(S.incidenciaAbierta);
    if (f === 'resueltas') lista = lista.filter((i) => !S.incidenciaAbierta(i));
    lista.sort((a, b) => (pesoPrioridad[a.prioridad] - pesoPrioridad[b.prioridad]) || (a.creada < b.creada ? 1 : -1));
    return {
      titulo: 'Incidencias',
      html: U.cabecera('Incidencias', { subtitulo: 'Ordenadas por urgencia.', accion: '<button class="boton" type="button" id="nueva-inc">' + ic('mas') + 'Registrar incidencia</button>' }) +
        filtros('/admin/incidencias', f, [['abiertas', 'Abiertas'], ['resueltas', 'Resueltas'], ['todas', 'Todas']]) +
        (lista.length ? '<ul class="lista">' + lista.map(filaIncidencia).join('') + '</ul>' : U.vacio('No hay incidencias en esta lista.')),
      montar: function (raiz) {
        raiz.querySelector('#nueva-inc').addEventListener('click', () => modalNuevaIncidencia());
        if (q.nueva) modalNuevaIncidencia(q.nueva);
      }
    };
  }

  function incidencia(p) {
    const i = S.buscar('incidencias', p.id);
    if (!i) return { html: U.cabecera('Incidencia no encontrada', { volver: '/admin/incidencias' }) };
    const v = S.buscar('viviendas', i.viviendaId);
    const inq = i.inquilinoId ? S.buscar('inquilinos', i.inquilinoId) : null;
    const opcion = (valor, texto, actual) => '<option value="' + valor + '"' + (valor === actual ? ' selected' : '') + '>' + texto + '</option>';
    return {
      titulo: i.titulo,
      html: U.cabecera(i.titulo, { volver: '/admin/incidencias', volverTexto: 'Incidencias', subtitulo: esc(nombreVivienda(v)) + ' · ' + U.fecha(i.creada, true) + (inq ? ' · ' + esc(inq.nombre) + (inq.telefono ? ', ' + esc(inq.telefono) : '') : '') }) +
        '<div class="dos-columnas" style="align-items:start"><div>' + Alki.vistas.detalleIncidencia(i, 'alki') + '</div>' +
        '<section class="seccion" style="margin-top:0"><h2 style="margin-bottom:10px">Gestionar</h2>' +
        '<form id="form-gestion" class="panel">' +
          '<div class="campo"><label for="g-estado">Estado</label><select id="g-estado" name="estado">' +
            opcion('abierta', 'Abierta', i.estado) + opcion('en_curso', 'En curso', i.estado) + opcion('resuelta', 'Resuelta', i.estado) + '</select></div>' +
          '<div class="campo"><label for="g-prov">Proveedor</label><input id="g-prov" name="proveedor" type="text" value="' + esc(i.proveedor) + '" placeholder="Fontanero, cerrajero…"></div>' +
          '<div class="campo"><label for="g-coste">Coste (€)</label><input id="g-coste" name="coste" type="number" min="0" step="1" value="' + (i.coste || '') + '"></div>' +
          '<div class="campo"><label for="g-nota">Mensaje para el inquilino</label><textarea id="g-nota" name="nota" placeholder="Por ejemplo: el técnico irá el jueves entre 10:00 y 12:00"></textarea>' +
          '<p class="campo__ayuda">Aparecerá en el seguimiento de la incidencia.</p></div>' +
          '<div class="campo"><span class="campo__titulo">Fotos (por ejemplo, del arreglo)</span>' + U.selectorFotos(6) + '</div>' +
          '<label class="interruptor campo"><input type="checkbox" name="visible"' + (i.visiblePropietario ? ' checked' : '') + '>Visible para el propietario</label>' +
          '<button class="boton boton--bloque" type="submit">Guardar cambios</button>' +
        '</form></section></div>',
      montar: function (raiz) {
        const form = raiz.querySelector('#form-gestion');
        const fotosElegidas = U.montarSelectorFotos(form);
        form.addEventListener('submit', function (e) {
          e.preventDefault();
          const d = U.datosFormulario(form);
          form.querySelector('button[type=submit]').disabled = true;
          U.guardarFotos(fotosElegidas()).then(function (ids) {
            S.actualizarIncidencia(i.id, {
              estado: d.estado, proveedor: d.proveedor, coste: Number(d.coste) || 0, visiblePropietario: form.visible.checked
            }, d.nota, ids);
            U.toast('Cambios guardados');
            Alki.app.refrescar(true);
          });
        });
      }
    };
  }

  /* ======================================================================
     COBROS
     ====================================================================== */
  function cobros(p, ses, q) {
    const f = q.f || 'mes';
    const periodo = Alki.fechas.periodo(new Date());
    let lista = S.db.pagos.slice();
    if (f === 'mes') lista = lista.filter((x) => x.periodo === periodo && x.concepto !== 'Fianza');
    if (f === 'vencidos') lista = lista.filter((x) => S.estadoPago(x) === 'vencido');
    if (f === 'revision') lista = lista.filter((x) => S.estadoPago(x) === 'revision');
    const orden = { vencido: 0, revision: 1, pendiente: 2, pagado: 3 };
    lista.sort((a, b) => (orden[S.estadoPago(a)] - orden[S.estadoPago(b)]) || (a.vence < b.vence ? 1 : -1));
    const delMes = S.db.pagos.filter((x) => x.periodo === periodo && x.concepto !== 'Fianza');
    const cobrado = delMes.filter((x) => x.pagadoEl).reduce((s, x) => s + x.importe, 0);
    const porCobrar = delMes.filter((x) => !x.pagadoEl).reduce((s, x) => s + x.importe, 0);

    const filas = lista.map(function (x) {
      const d = infoPago(x);
      const est = S.estadoPago(x);
      const accion = est === 'revision' ? '<button class="boton boton--peq" type="button" data-cobrar="' + x.id + '">Confirmar pago</button>'
        : est === 'pagado' ? '<button class="boton boton--sec boton--peq" type="button" data-doc="recibo:' + x.id + '">Recibo</button>'
          : '<button class="boton boton--sec boton--peq" type="button" data-cobrar="' + x.id + '">Marcar cobrado</button>';
      return '<li data-buscar="' + esc(d.c.nombres + ' ' + d.v.codigo + '-' + d.h.codigo + ' ' + d.v.alias) + '"><div class="fila"><span class="fila__icono">' + ic('pagos') + '</span><span class="fila__principal">' +
        '<span class="fila__titulo">' + esc(d.c.nombres) + '</span><span class="fila__meta">' + (x.concepto === 'Fianza' ? 'Fianza' : U.mes(x.periodo)) + ' · ' + esc(d.v.codigo + '-' + d.h.codigo) + '</span></span>' +
        '<span class="fila__fin"><span class="fila__importe">' + U.euro(x.importe) + '</span>' + U.etiqueta('pago', est) + '</span></div>' +
        '<div class="fila__acciones">' + accion + '</div></li>';
    }).join('');

    return {
      titulo: 'Cobros',
      html: U.cabecera('Cobros', { subtitulo: 'Recibos de los residentes. El estado inicial sale de la columna «Solvencia» del CSV.' }) +
        '<div class="panel" style="margin-bottom:18px"><dl class="datos">' +
          '<div><dt>Cobrado ' + U.mes(periodo).toLowerCase() + '</dt><dd class="num positivo">' + U.euro(cobrado) + '</dd></div>' +
          '<div><dt>Por cobrar este mes</dt><dd class="num">' + U.euro(porCobrar) + '</dd></div>' +
          '<div><dt>Vencido total</dt><dd class="num negativo">' + U.euro(S.indicadores().vencido) + '</dd></div></dl></div>' +
        filtros('/admin/cobros', f, [['mes', 'Este mes'], ['revision', 'Por confirmar'], ['vencidos', 'Vencidos'], ['todos', 'Todos']]) +
        buscador('Buscar por nombre o habitación (Alb20-H1)') +
        (lista.length ? '<ul class="lista">' + filas + '</ul>' : U.vacio('No hay recibos en esta lista.')),
      montar: function (raiz) { montarCobros(raiz); montarBuscador(raiz); }
    };
  }

  /* ======================================================================
     PERSONAS (inquilinos y propietarios)
     ====================================================================== */
  function personas(p, ses, q) {
    const f = q.f || 'todos';
    let contratos = S.db.contratos.slice().sort(function (a, b) {
      const ha = S.buscar('habitaciones', a.habitacionId), hb = S.buscar('habitaciones', b.habitacionId);
      return (ha.viviendaId + ha.codigo).localeCompare(hb.viviendaId + hb.codigo, 'es', { numeric: true });
    });
    if (f === 'deuda') contratos = contratos.filter((c) => c.solvencia === 'overdue');
    if (f === 'revisar') contratos = contratos.filter((c) => S.estadoConfirmacion(c) === 'revisar');
    if (f === 'sinconfirmar') contratos = contratos.filter((c) => S.estadoConfirmacion(c) === 'pendiente');
    if (f === 'terminan') contratos = contratos.filter((c) => { const d = U.diasHasta(c.fin); return d <= 60; }).sort((a, b) => (a.fin > b.fin ? 1 : -1));
    const filasInq = contratos.map(function (c) {
      const h = S.buscar('habitaciones', c.habitacionId);
      const v = S.buscar('viviendas', h.viviendaId);
      const dias = U.diasHasta(c.fin);
      return '<tr data-buscar="' + esc(c.nombres + ' ' + v.codigo + '-' + h.codigo + ' ' + v.alias) + '"><td><button class="enlace" type="button" data-ficha="' + c.id + '">' + esc(c.nombres) + '</button></td>' +
        '<td style="white-space:nowrap">' + esc(v.codigo + '-' + h.codigo) + '</td><td class="der">' + U.euro(c.renta) + '</td>' +
        '<td style="white-space:nowrap">' + U.fecha(c.fin) + (dias <= 60 ? ' <span class="etiqueta etiqueta--' + (dias < 0 ? 'mal' : 'aviso') + '">' + (dias < 0 ? 'Vencido' : dias + ' días') + '</span>' : '') + '</td>' +
        '<td>' + U.etiqueta('solvencia', c.solvencia) + '</td><td>' + U.etiqueta('confirmacion', S.estadoConfirmacion(c)) + '</td></tr>';
    }).join('');
    const filasProp = S.db.propietarios.map((pr) =>
      '<tr data-buscar="' + esc(pr.nombre) + '"><td><strong>' + esc(pr.nombre) + '</strong></td><td>' + S.viviendasDe(pr.id).map((v) => esc(v.codigo)).join(', ') + '</td>' +
      '<td class="suave pequeno">' + esc(pr.email) + '</td></tr>').join('');
    return {
      titulo: 'Personas',
      html: U.cabecera('Personas', { subtitulo: 'Datos confirmados por los inquilinos: ' + S.db.contratos.filter((c) => S.estadoConfirmacion(c) === 'ok').length + ' de ' + S.db.contratos.length + ' contratos.' }) +
        filtros('/admin/personas', f, [['todos', 'Todos'], ['deuda', 'Con deuda'], ['terminan', 'Terminan en 60 días'], ['revisar', 'Datos a revisar'], ['sinconfirmar', 'Sin confirmar']]) + buscador('Buscar por nombre o habitación') +
        '<section class="seccion" style="margin-top:0"><h2 style="margin-bottom:10px">Contratos y residentes</h2><div class="tabla-scroll"><table class="tabla">' +
        '<thead><tr><th>Residentes</th><th>Unidad</th><th class="der">Renta</th><th>Hasta</th><th>Pagos</th><th>Datos</th></tr></thead><tbody>' + filasInq + '</tbody></table></div></section>' +
        '<section class="seccion"><h2 style="margin-bottom:10px">Propietarios</h2><div class="tabla-scroll"><table class="tabla">' +
        '<thead><tr><th>Nombre</th><th>Viviendas</th><th>Usuario en la app</th></tr></thead><tbody>' + filasProp + '</tbody></table></div></section>',
      montar: function (raiz) {
        montarBuscador(raiz);
        raiz.querySelectorAll('[data-ficha]').forEach((b) => b.addEventListener('click', function () {
          const c = S.buscar('contratos', b.dataset.ficha);
          const h = S.buscar('habitaciones', c.habitacionId);
          const v = S.buscar('viviendas', h.viviendaId);
          const gente = [c.inquilinoId].concat(c.cotitulares || []).map((id) => S.buscar('inquilinos', id));
          const pagos = S.pagosDeContrato(c.id).slice(0, 5);
          U.abrirModal(c.nombres,
            '<dl class="datos"><div><dt>Unidad</dt><dd>' + esc(v.codigo + '-' + h.codigo) + '</dd></div><div><dt>Renta</dt><dd>' + U.euro(c.renta) + '</dd></div>' +
            '<div><dt>Contrato</dt><dd>' + U.fecha(c.inicio) + ' – ' + U.fecha(c.fin) + '</dd></div><div><dt>Fianza</dt><dd>' + (c.fianza ? U.euro(c.fianza) : '—') + '</dd></div></dl>' +
            gente.map((i) => '<h3 style="font-size:1rem;margin:20px 0 6px">' + esc(i.nombre) + '</h3><p class="pequeno">' +
              (i.email ? '<a href="mailto:' + esc(i.email) + '">' + esc(i.email) + '</a>' : 'Sin correo') + (i.telefono ? ' · <a href="tel:' + esc(i.telefono.replace(/\s/g, '')) + '">' + esc(i.telefono) + '</a>' : '') + '</p>').join('') +
            '<h3 style="font-size:1rem;margin:20px 0 8px">Últimos recibos</h3><ul class="lista">' + pagos.map((x) =>
              '<li><div class="fila"><span class="fila__principal"><span class="fila__titulo">' + (x.concepto === 'Fianza' ? 'Fianza' : U.mes(x.periodo)) + '</span></span>' +
              '<span class="fila__fin"><span class="fila__importe">' + U.euro(x.importe) + '</span>' + U.etiqueta('pago', S.estadoPago(x)) + '</span></div></li>').join('') + '</ul>' +
            '<div class="acciones"><button class="boton boton--sec" type="button" data-doc="contrato:' + c.id + '">Ver contrato</button></div>');
        }));
      }
    };
  }

  /* ======================================================================
     MENSAJES con propietarios
     ====================================================================== */
  function mensajes(p, ses, q) {
    const props = S.db.propietarios;
    const actual = q.p && S.buscar('propietarios', q.p) ? q.p : props[0].id;
    const pr = S.buscar('propietarios', actual);
    return {
      titulo: 'Mensajes',
      html: U.cabecera('Mensajes', { volver: '/admin', volverTexto: 'Panel', subtitulo: 'Conversaciones con propietarios.' }) +
        '<div class="campo"><label for="sel-prop">Propietario</label><select id="sel-prop">' + props.map((x) => '<option value="' + x.id + '"' + (x.id === actual ? ' selected' : '') + '>' + esc(x.nombre) + ' · ' + S.viviendasDe(x.id).map((v) => v.codigo).join(', ') + '</option>').join('') + '</select></div>' +
        '<h2 style="font-size:1.1rem;margin-bottom:10px">' + esc(pr.nombre) + '</h2>' + Alki.vistas.chat(actual, 'alki'),
      montar: function (raiz) {
        raiz.querySelector('#sel-prop').addEventListener('change', function () { Alki.app.ir('/admin/mensajes?p=' + this.value); });
        Alki.vistas.montarChat(raiz, actual, 'alki');
      }
    };
  }

  Alki.vistas.admin = { panel, viviendas, vivienda, incidencias, incidencia, cobros, personas, mensajes,
    // Piezas que reutiliza ALKI Panel
    utilidades: { modalImportar, modalRevisar, modalNuevaIncidencia, descargar, leerTexto, filaIncidencia, buscador, montarBuscador } };
})();
