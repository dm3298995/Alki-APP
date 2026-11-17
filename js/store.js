/* ==========================================================================
   store.js — "BASE DE DATOS" DE LA APP
   --------------------------------------------------------------------------
   Guarda los datos en el navegador con localStorage y ofrece funciones para
   consultarlos (buscar, filtrar, calcular) y modificarlos (crear incidencia,
   confirmar pago…). Todas las vistas usan estas funciones, nunca tocan
   localStorage directamente. Si en el futuro se conecta un servidor real
   (por ejemplo Supabase o Firebase), solo habría que cambiar este archivo.
   ========================================================================== */
window.Alki = window.Alki || {};

Alki.store = (function () {
  // La versión con datos reales guarda en otra "caja" para no mezclarse con la demo
  const CLAVE_DATOS = Alki.datosReales ? 'alki-app-real-v3' : 'alki-app-datos-v3';
  const CLAVE_SESION = Alki.datosReales ? 'alki-app-real-sesion' : 'alki-app-sesion-v1';
  let db = null;
  let sesionEnMemoria = null; // por si el navegador bloquea localStorage

  const F = Alki.fechas;
  const hoyISO = () => F.fecha(new Date());
  const nuevoId = (prefijo) => prefijo + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

  /* ---------------- Guardar / cargar ---------------- */
  // Guarda en este navegador y, si el panel está conectado a Firebase, también en la nube
  function guardar() {
    const ok = guardarLocal();
    if (Alki.alGuardar) { try { Alki.alGuardar(); } catch (e) { console.warn(e); } }
    return ok || !!(Alki.nube && Alki.nube.listo && Alki.nube.listo());
  }
  function guardarLocal() {
    try {
      localStorage.setItem(CLAVE_DATOS, JSON.stringify(db));
      return true;
    } catch (e) {
      console.warn('No se pudieron guardar los datos (¿almacenamiento lleno?)', e);
      return false;
    }
  }
  function cargar() {
    try {
      const texto = localStorage.getItem(CLAVE_DATOS);
      if (texto) {
        const guardado = JSON.parse(texto);
        if (guardado.version === 3 && (guardado.huella === huellaActual() || guardado.importadoManual)) {
          db = guardado; asegurarRecibos(); return;
        }
        // La app trae datos más nuevos que los guardados en este navegador:
        // se cargan los nuevos y se conservan contraseñas, consentimientos y lo hecho en la app
        if (guardado.version === 3) {
          db = fusionar(datosIniciales(), guardado);
          guardar();
          return;
        }
      }
    } catch (e) { /* si falla, se generan datos nuevos */ }
    db = datosIniciales();
    guardar();
  }
  // "Huella" de los datos que trae el archivo: si cambia, hay datos nuevos que cargar
  function huellaActual() {
    const fuente = Alki.datosReales ? Alki.datosReales.contratos + Alki.datosReales.inquilinos : Alki.demoCSV.contratos + Alki.demoCSV.inquilinos;
    let h = 5381;
    for (let i = 0; i < fuente.length; i++) h = ((h << 5) + h + fuente.charCodeAt(i)) | 0;
    return 'd' + (h >>> 0).toString(36) + '-' + fuente.length;
  }
  // Datos iniciales: los reales si la app los trae incluidos (versión para ALKI), si no, la demo
  function datosIniciales() {
    if (Alki.datosReales) {
      const d = Alki.importar(Alki.datosReales.contratos, Alki.datosReales.inquilinos);
      d.origen = 'real'; d.importado = Alki.datosReales.fecha || d.importado;
      d.huella = huellaActual();
      return d;
    }
    const d = Alki.seed();
    d.huella = huellaActual();
    return d;
  }
  function reiniciar() { db = datosIniciales(); guardar(); }

  // Cada mes nuevo aparece su recibo (pendiente) en todos los contratos activos
  function asegurarRecibos() {
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    let nuevos = 0;
    db.contratos.forEach(function (c) {
      for (let n = -2; n <= 0; n++) {
        const mes = F.sumarMeses(hoy, n, 1);
        const per = F.periodo(mes);
        if (per < c.inicio.slice(0, 7) || F.aFecha(c.fin) < mes) continue;
        const id = c.id + '|' + per;
        if (db.pagos.some((p) => p.id === id)) continue;
        db.pagos.push({ id, contratoId: c.id, periodo: per, concepto: 'Renta (gastos incluidos)', importe: c.renta, vence: F.fecha(F.sumarMeses(hoy, n, 5)), pagadoEl: null, metodo: null });
        nuevos++;
      }
    });
    if (nuevos) guardar();
  }

  /* ---------------- Sesión (quién ha iniciado sesión) ---------------- */
  function sesion() {
    try {
      const s = localStorage.getItem(CLAVE_SESION);
      return s ? JSON.parse(s) : sesionEnMemoria;
    } catch (e) { return sesionEnMemoria; }
  }
  /* ---------- Contraseñas ----------
     Nunca se guarda la contraseña tal cual: se guarda su "huella" (hash SHA-256).
     Al entrar se calcula la huella de lo que escribe el usuario y se compara. */
  const normEmail = (e) => String(e || '').trim().toLowerCase();
  // Todas las cuentas con ese correo (una pareja puede compartir correo)
  const usuariosPorEmail = (email) => db.usuarios.filter((u) => u.email && normEmail(u.email) === normEmail(email));
  const usuarioDe = (rol, refId) => db.usuarios.find((u) => u.rol === rol && u.refId === refId) || null;
  async function huella(u, texto) {
    const entrada = 'alki|' + u.rol + '|' + u.refId + '|' + texto;
    if (window.crypto && crypto.subtle) {
      const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(entrada));
      return Array.from(new Uint8Array(bytes)).map((b) => b.toString(16).padStart(2, '0')).join('');
    }
    // Navegadores antiguos sin crypto.subtle: huella sencilla (solo para el prototipo)
    let h = 5381;
    for (let i = 0; i < entrada.length; i++) h = ((h << 5) + h + entrada.charCodeAt(i)) | 0;
    return 'x' + (h >>> 0).toString(16);
  }
  async function comprobarContrasena(u, texto) { return !!u.clave && u.clave === await huella(u, texto); }
  // consentimiento (solo en el primer acceso): { social: true/false }
  async function crearContrasena(u, texto, consentimiento) {
    const real = db.usuarios.find((x) => x.rol === u.rol && x.refId === u.refId);
    real.clave = await huella(real, texto);
    if (consentimiento) {
      const ahora = new Date().toISOString();
      real.consentimiento = { version: Alki.legal ? Alki.legal.version : '1', privacidad: ahora, terminos: ahora, social: !!consentimiento.social, socialFecha: consentimiento.social ? ahora : null };
    }
    guardar();
    return abrirSesion(real);
  }

  /* ---------------- RGPD: consentimiento para ALKI Social ---------------- */
  const consentimientoDe = (ses) => { const u = usuarioDe(ses.rol, ses.refId); return (u && u.consentimiento) || null; };
  const enSocial = (ses) => ses.rol === 'admin' || !!(consentimientoDe(ses) || {}).social;
  function unirseSocial(ses, si) {
    const u = usuarioDe(ses.rol, ses.refId);
    if (!u) return;
    u.consentimiento = Object.assign({ version: Alki.legal ? Alki.legal.version : '1' }, u.consentimiento || {}, { social: si, socialFecha: new Date().toISOString() });
    guardar();
  }

  /* ---------------- Confirmación de los datos del alquiler ----------------
     Cada titular confirma que su piso, habitación, renta y fechas son correctos.
     Si algo no cuadra, se crea una solicitud para que ALKI lo revise. */
  function confirmacionDe(ses) {
    const c = contratoDeInquilino(ses.refId);
    return c && c.confirmaciones ? c.confirmaciones[ses.refId] || null : null;
  }
  const necesitaConfirmar = (ses) => ses.rol === 'inquilino' && !!contratoDeInquilino(ses.refId) && !confirmacionDe(ses);
  function confirmarDatos(ses, correctos, texto) {
    const c = contratoDeInquilino(ses.refId);
    if (!c) return;
    c.confirmaciones = c.confirmaciones || {};
    c.confirmaciones[ses.refId] = { fecha: new Date().toISOString(), correctos, texto: texto || '' };
    if (!correctos) db.solicitudes.push({ id: nuevoId('s'), inquilinoId: ses.refId, tipo: 'datos', texto: texto || 'Los datos del contrato no son correctos.', fecha: hoyISO(), estado: 'nueva' });
    guardar();
  }
  // Estado para el panel de ALKI: 'ok' | 'revisar' | 'pendiente'
  function estadoConfirmacion(c) {
    const lista = [c.inquilinoId].concat(c.cotitulares || []).map((id) => (c.confirmaciones || {})[id]);
    if (lista.some((x) => x && !x.correctos)) return 'revisar';
    if (lista.length && lista.every((x) => x && x.correctos)) return 'ok';
    return 'pendiente';
  }
  // Acceso rápido para probar: entra directamente con un perfil concreto
  function entrarComo(rol, refId) {
    const u = usuarioDe(rol, refId);
    return u ? abrirSesion(u) : null;
  }
  function abrirSesion(u) {
    const s = { rol: u.rol, refId: u.refId, nombre: u.nombre, email: u.email };
    sesionEnMemoria = s;
    try { localStorage.setItem(CLAVE_SESION, JSON.stringify(s)); } catch (e) { /* queda en memoria */ }
    return s;
  }
  function cerrarSesion() {
    sesionEnMemoria = null;
    try { localStorage.removeItem(CLAVE_SESION); } catch (e) { /* nada */ }
  }

  /* ---------------- Consultas básicas ---------------- */
  const buscar = (coleccion, id) => db[coleccion].find((x) => x.id === id) || null;
  const habitacionesDe = (viviendaId) => db.habitaciones.filter((h) => h.viviendaId === viviendaId);
  const viviendasDe = (propietarioId) => db.viviendas.filter((v) => v.propietarioId === propietarioId);
  const masReciente = (lista) => lista.sort((a, b) => (a.inicio < b.inicio ? 1 : -1))[0] || null;
  const esTitular = (c, inqId) => c.inquilinoId === inqId || (c.cotitulares || []).includes(inqId);
  // Si hay dos contratos activos en la misma habitación, manda el más reciente
  const contratoDeHabitacion = (habId) => masReciente(db.contratos.filter((c) => c.habitacionId === habId && c.estado === 'activo'));
  const contratoDeInquilino = (inqId) => masReciente(db.contratos.filter((c) => esTitular(c, inqId) && c.estado === 'activo'));
  const contratosDeHabitacion = (habId) => db.contratos.filter((c) => c.habitacionId === habId && c.estado === 'activo');

  // ¿Quién vive en esta habitación? (solo lo usa el panel de ALKI)
  function inquilinoDeHabitacion(habId) {
    const c = contratoDeHabitacion(habId);
    return c ? buscar('inquilinos', c.inquilinoId) : null;
  }
  // 'ocupada' | 'libre' | 'reforma'
  function estadoHabitacion(h) {
    if (h.enReforma) return 'reforma';
    return contratoDeHabitacion(h.id) ? 'ocupada' : 'libre';
  }

  // Estado de un recibo: 'pagado' | 'revision' | 'vencido' | 'pendiente'
  function estadoPago(p) {
    if (p.pagadoEl) return 'pagado';
    if (p.notificadoEl) return 'revision';
    return p.vence < hoyISO() ? 'vencido' : 'pendiente';
  }
  const ordenarPorFechaDesc = (campo) => (a, b) => (a[campo] < b[campo] ? 1 : a[campo] > b[campo] ? -1 : 0);

  const pagosDeContrato = (contratoId) =>
    db.pagos.filter((p) => p.contratoId === contratoId).sort(ordenarPorFechaDesc('vence'));

  function pagosDeInquilino(inqId) {
    const ids = db.contratos.filter((c) => esTitular(c, inqId)).map((c) => c.id);
    return db.pagos.filter((p) => ids.includes(p.contratoId)).sort(ordenarPorFechaDesc('vence'));
  }

  // Cuánto debe un inquilino (recibos vencidos sin pagar)
  function deudaDeInquilino(inqId) {
    return pagosDeInquilino(inqId).filter((p) => estadoPago(p) === 'vencido').reduce((s, p) => s + p.importe, 0);
  }

  const incidenciasDeVivienda = (vId) => db.incidencias.filter((i) => i.viviendaId === vId).sort(ordenarPorFechaDesc('creada'));
  const incidenciasDeInquilino = (inqId) => db.incidencias.filter((i) => i.inquilinoId === inqId).sort(ordenarPorFechaDesc('creada'));
  const incidenciaAbierta = (i) => i.estado !== 'resuelta';

  // Avisos de una vivienda + avisos generales
  const avisosPara = (vId) => db.avisos.filter((a) => a.viviendaId === null || a.viviendaId === vId).sort(ordenarPorFechaDesc('fecha'));

  const reformasDe = (vId) => db.reformas.filter((r) => r.viviendaId === vId).sort(ordenarPorFechaDesc('inicio'));
  // Lo que ALKI paga al propietario: se calcula con la renta pactada (día 10 de cada mes)
  function pagosAPropietario(propId) {
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const lista = [];
    viviendasDe(propId).forEach(function (v) {
      if (!v.rentaPropietario) return;
      for (let n = -5; n <= 1; n++) {
        const f = F.sumarMeses(hoy, n, 10);
        if (v.contratoInicio && F.fecha(f) < v.contratoInicio) continue;
        lista.push({ id: v.id + '|' + F.periodo(f), viviendaId: v.id, periodo: F.periodo(f), importe: v.rentaPropietario, fecha: F.fecha(f), pagado: f <= hoy });
      }
    });
    return lista.sort(ordenarPorFechaDesc('fecha'));
  }
  const mensajesDe = (hilo) => db.mensajes.filter((m) => m.hilo === hilo).sort((a, b) => (a.fecha > b.fecha ? 1 : -1));
  const referidosDe = (inqId) => db.referidos.filter((r) => r.embajadorId === inqId).sort(ordenarPorFechaDesc('fecha'));
  const documentosDe = (refId) => db.documentos.filter((d) => d.refId === refId).sort(ordenarPorFechaDesc('fecha'));

  /* ---------------- Cálculos para el panel de ALKI ---------------- */
  // Resumen económico de una vivienda en el mes actual
  function resumenVivienda(vId) {
    const v = buscar('viviendas', vId);
    const habs = habitacionesDe(vId);
    const ocupadas = habs.filter((h) => estadoHabitacion(h) === 'ocupada');
    const ingresos = ocupadas.reduce((s, h) => {
      const c = contratoDeHabitacion(h.id);
      return s + c.renta + c.servicios;
    }, 0);
    return {
      total: habs.length,
      ocupadas: ocupadas.length,
      libres: habs.filter((h) => estadoHabitacion(h) === 'libre').length,
      reforma: habs.filter((h) => estadoHabitacion(h) === 'reforma').length,
      ingresos,
      renta: v.rentaPropietario,
      diferencia: v.rentaPropietario ? ingresos - v.rentaPropietario : null // diferencia inicial, NO beneficio neto
    };
  }

  function indicadores() {
    const habs = db.habitaciones;
    const ocupadas = habs.filter((h) => estadoHabitacion(h) === 'ocupada').length;
    const periodoActual = F.periodo(new Date());
    const recibosMes = db.pagos.filter((p) => p.periodo === periodoActual && p.concepto !== 'Fianza');
    return {
      habitaciones: habs.length,
      ocupadas,
      libres: habs.filter((h) => estadoHabitacion(h) === 'libre').length,
      reforma: habs.filter((h) => estadoHabitacion(h) === 'reforma').length,
      ocupacion: habs.length ? Math.round((ocupadas / habs.length) * 100) : 0,
      vencido: db.pagos.filter((p) => estadoPago(p) === 'vencido').reduce((s, p) => s + p.importe, 0),
      cobradoMes: recibosMes.filter((p) => p.pagadoEl).reduce((s, p) => s + p.importe, 0),
      previstoMes: recibosMes.reduce((s, p) => s + p.importe, 0),
      incidenciasAbiertas: db.incidencias.filter(incidenciaAbierta).length
    };
  }

  /* ---------------- Acciones que modifican datos ---------------- */
  function crearIncidencia(datos) {
    const i = Object.assign({
      id: nuevoId('in'), estado: 'abierta', creada: hoyISO(), proveedor: '', coste: 0,
      visiblePropietario: datos.categoria !== 'convivencia' && datos.categoria !== 'limpieza',
      historial: [{ fecha: hoyISO(), estado: 'abierta', texto: 'Incidencia recibida.' }]
    }, datos);
    db.incidencias.push(i);
    guardar();
    return i;
  }

  // Cambios del equipo ALKI (estado, proveedor, coste) con mensaje y fotos opcionales
  function actualizarIncidencia(id, cambios, nota, fotos) {
    const i = buscar('incidencias', id);
    if (!i) return null;
    const estadoAntes = i.estado;
    Object.assign(i, cambios);
    if (nota || (fotos && fotos.length) || cambios.estado !== estadoAntes) {
      const textos = { abierta: 'Incidencia reabierta.', en_curso: 'Estamos trabajando en ello.', resuelta: 'Incidencia resuelta.' };
      i.historial.push({ fecha: hoyISO(), hora: new Date().toISOString(), estado: i.estado, autor: 'alki', autorNombre: Alki.autorActual || null, texto: nota || textos[i.estado], fotos: fotos || [] });
    }
    guardar();
    return i;
  }
  // El inquilino añade un comentario o más fotos
  function comentarIncidencia(id, texto, fotos) {
    const i = buscar('incidencias', id);
    if (!i) return;
    i.historial.push({ fecha: hoyISO(), hora: new Date().toISOString(), estado: i.estado, autor: 'inquilino', texto: texto || 'He añadido fotos.', fotos: fotos || [] });
    guardar();
  }
  // El inquilino confirma que ya está arreglado, o la reabre si sigue igual
  function cerrarPorInquilino(id) {
    const i = buscar('incidencias', id);
    if (!i) return;
    i.estado = 'resuelta';
    i.historial.push({ fecha: hoyISO(), hora: new Date().toISOString(), estado: 'resuelta', autor: 'inquilino', texto: 'Confirmo que ya está solucionado.', fotos: [] });
    guardar();
  }
  function reabrirIncidencia(id, texto, fotos) {
    const i = buscar('incidencias', id);
    if (!i) return;
    i.estado = 'abierta';
    i.historial.push({ fecha: hoyISO(), hora: new Date().toISOString(), estado: 'abierta', autor: 'inquilino', texto: 'Sigue sin funcionar: ' + (texto || 'el problema continúa.'), fotos: fotos || [] });
    guardar();
  }

  /* ---------------- ALKI Social ----------------
     Publicaciones de la comunidad: texto, fotos, me gusta y comentarios.
     viviendaId = null → para toda la comunidad; con valor → solo esa casa. */
  const claveAutor = (ses) => ses.rol + ':' + (ses.refId || 'alki');
  function publicar(ses, viviendaId, texto, fotos) {
    db.social = db.social || [];
    const p = { id: nuevoId('post'), autorRol: ses.rol, autorId: ses.refId, viviendaId: viviendaId || null, texto, fotos: fotos || [], fecha: new Date().toISOString(), likes: [], comentarios: [] };
    db.social.unshift(p);
    guardar();
    return p;
  }
  function meGusta(postId, ses) {
    const p = (db.social || []).find((x) => x.id === postId);
    if (!p) return;
    const k = claveAutor(ses);
    p.likes = p.likes.includes(k) ? p.likes.filter((x) => x !== k) : p.likes.concat(k);
    guardar();
  }
  function comentarPost(postId, ses, texto) {
    const p = (db.social || []).find((x) => x.id === postId);
    if (!p) return;
    p.comentarios.push({ id: nuevoId('com'), autorRol: ses.rol, autorId: ses.refId, texto, fecha: new Date().toISOString() });
    guardar();
  }
  function borrarPost(postId) { db.social = (db.social || []).filter((x) => x.id !== postId); guardar(); }
  function borrarComentario(postId, comId) {
    const p = (db.social || []).find((x) => x.id === postId);
    if (p) { p.comentarios = p.comentarios.filter((c) => c.id !== comId); guardar(); }
  }

  // El inquilino avisa de que ha pagado; ALKI lo confirma después
  function notificarPago(pagoId, metodo) {
    const p = buscar('pagos', pagoId);
    if (!p) return;
    p.notificadoEl = hoyISO();
    p.metodo = metodo;
    guardar();
  }
  function confirmarPago(pagoId) {
    const p = buscar('pagos', pagoId);
    if (!p) return;
    p.pagadoEl = hoyISO();
    if (!p.metodo) p.metodo = 'Transferencia';
    guardar();
  }

  function crearSolicitud(inqId, tipo, texto) {
    db.solicitudes.push({ id: nuevoId('s'), inquilinoId: inqId, tipo, texto, fecha: hoyISO(), estado: 'nueva' });
    guardar();
  }
  function cerrarSolicitud(id) {
    const s = buscar('solicitudes', id);
    if (s) { s.estado = 'atendida'; guardar(); }
  }

  function enviarMensaje(hilo, de, texto) {
    db.mensajes.push({ id: nuevoId('m'), hilo, de, texto, fecha: hoyISO() });
    guardar();
  }

  function crearAviso(viviendaId, titulo, texto) {
    db.avisos.push({ id: nuevoId('a'), viviendaId: viviendaId || null, titulo, texto, fecha: hoyISO() });
    guardar();
  }

  function crearReferido(inqId, nombre, contacto) {
    db.referidos.push({ id: nuevoId('rf'), embajadorId: inqId, nombre, contacto, estado: 'interesado', fecha: hoyISO() });
    guardar();
  }

  // Devuelve false si no cabe en el almacenamiento del navegador
  function subirDocumento(refId, nombre, tipo, dataUrl) {
    const d = { id: nuevoId('d'), refId, nombre, tipo, dataUrl, fecha: hoyISO() };
    db.documentos.push(d);
    if (!guardar()) { db.documentos.pop(); return false; }
    return true;
  }
  function borrarDocumento(id) {
    db.documentos = db.documentos.filter((d) => d.id !== id);
    guardar();
  }

  // Datos de la vivienda que no vienen en los CSV (renta al propietario, wifi…)
  function actualizarVivienda(id, cambios) {
    const v = buscar('viviendas', id);
    if (v) { Object.assign(v, cambios); guardar(); }
  }

  /* ---------------- Importar CSV reales / copias de seguridad ----------------
     Al volver a importar se conserva lo que se ha hecho en la app:
     incidencias, mensajes, documentos, pagos confirmados y datos de viviendas. */
  // Pasa a unos datos nuevos todo lo que se ha hecho en la app con los antiguos
  function fusionar(nuevo, viejo) {
    nuevo.viviendas.forEach(function (v) {
      const antes = viejo.viviendas.find((x) => x.id === v.id);
      if (!antes) return;
      ['rentaPropietario', 'contratoInicio', 'contratoFin', 'estadoGeneral', 'ultimaRevision', 'notaRevision', 'wifi', 'limpieza', 'cp'].forEach((k) => { if (antes[k] !== null && antes[k] !== undefined && antes[k] !== '') v[k] = antes[k]; });
      if (antes.barrio) v.barrio = antes.barrio;
    });
    nuevo.habitaciones.forEach((h) => { const a = viejo.habitaciones.find((x) => x.id === h.id); if (a) h.enReforma = a.enReforma; });
    // Las contraseñas creadas se conservan (si la persona sigue en los datos)
    nuevo.usuarios.forEach((u) => {
      const a = viejo.usuarios.find((x) => x.rol === u.rol && x.refId === u.refId);
      if (a && a.clave) u.clave = a.clave;
      if (a && a.consentimiento) u.consentimiento = a.consentimiento;
    });
    // Las confirmaciones de datos se conservan si el contrato no ha cambiado
    nuevo.contratos.forEach((c) => { const a = viejo.contratos.find((x) => x.id === c.id); if (a && a.confirmaciones && a.renta === c.renta && a.fin === c.fin) c.confirmaciones = a.confirmaciones; });
    nuevo.pagos.forEach(function (p) {
      const a = viejo.pagos.find((x) => x.id === p.id);
      if (a && a.pagadoEl && !p.pagadoEl) { p.pagadoEl = a.pagadoEl; p.metodo = a.metodo; }
      if (a && a.notificadoEl && !p.pagadoEl) { p.notificadoEl = a.notificadoEl; p.metodo = a.metodo; }
    });
    if (viejo.origen === 'real') {
      const existe = (col, id) => !id || nuevo[col].some((x) => x.id === id);
      nuevo.incidencias = viejo.incidencias.filter((i) => existe('viviendas', i.viviendaId) && existe('inquilinos', i.inquilinoId));
      nuevo.reformas = viejo.reformas.filter((r) => existe('viviendas', r.viviendaId));
      nuevo.avisos = viejo.avisos.filter((a) => existe('viviendas', a.viviendaId));
      ['mensajes', 'documentos', 'referidos', 'solicitudes', 'social'].forEach((k) => { nuevo[k] = viejo[k] || []; });
    }
    // Lo del panel del equipo (trabajadores, permisos, gastos y actividad) siempre se conserva
    ['equipo', 'costes', 'actividad'].forEach((k) => { if (viejo[k]) nuevo[k] = viejo[k]; });
    return nuevo;
  }
  function importarCSV(textoA, textoB) {
    const nuevo = fusionar(Alki.importar(textoA, textoB), db);
    nuevo.importadoManual = true; // a partir de aquí manda lo importado, no lo que trae el archivo
    db = nuevo;
    if (!guardar()) throw new Error('No hay espacio suficiente en este navegador para guardar los datos.');
    return { viviendas: db.viviendas.length, habitaciones: db.habitaciones.length, contratos: db.contratos.length, inquilinos: db.inquilinos.length, avisos: db.avisosDatos.length };
  }
  const exportarCopia = () => JSON.stringify(db);
  function importarCopia(texto) {
    const d = JSON.parse(texto);
    if (d.version !== 3 || !Array.isArray(d.viviendas)) throw new Error('El archivo no es una copia de seguridad de esta app.');
    // Con la nube, el equipo no se toca al restaurar una copia (lo gestiona el encargado)
    if (Alki.nube && Alki.nube.listo && Alki.nube.listo()) d.equipo = db.equipo;
    db = d; guardar();
  }

  function marcarReforma(habId, enReforma) {
    const h = buscar('habitaciones', habId);
    if (h) { h.enReforma = enReforma; guardar(); }
  }

  cargar();

  return {
    get db() { return db; },
    guardar, guardarLocal, reiniciar, sesion, entrarComo, cerrarSesion, usuariosPorEmail, usuarioDe, comprobarContrasena, crearContrasena,
    consentimientoDe, enSocial, unirseSocial, confirmacionDe, necesitaConfirmar, confirmarDatos, estadoConfirmacion,
    buscar, habitacionesDe, viviendasDe, contratoDeHabitacion, contratoDeInquilino, inquilinoDeHabitacion,
    estadoHabitacion, estadoPago, contratosDeHabitacion, esTitular, actualizarVivienda, importarCSV, exportarCopia, importarCopia, pagosDeContrato, pagosDeInquilino, deudaDeInquilino,
    incidenciasDeVivienda, incidenciasDeInquilino, incidenciaAbierta, avisosPara, reformasDe,
    pagosAPropietario, mensajesDe, referidosDe, documentosDe, resumenVivienda, indicadores,
    crearIncidencia, actualizarIncidencia, comentarIncidencia, cerrarPorInquilino, reabrirIncidencia,
    claveAutor, publicar, meGusta, comentarPost, borrarPost, borrarComentario, notificarPago, confirmarPago, crearSolicitud, cerrarSolicitud,
    enviarMensaje, crearAviso, crearReferido, subirDocumento, borrarDocumento, marcarReforma
  };
})();
