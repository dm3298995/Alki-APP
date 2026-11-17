/* ==========================================================================
   panel/equipo.js — EQUIPO DE ALKI, PERMISOS Y REGISTRO DE ACTIVIDAD
   --------------------------------------------------------------------------
   · El encargado (superadministrador) tiene acceso total y es el único que
     puede dar de alta trabajadores y cambiar permisos.
   · Cada trabajador tiene, para cada sección del panel, uno de estos niveles:
       'no'     → no ve la sección
       'ver'    → la ve pero no puede cambiar nada
       'editar' → la ve y puede trabajar en ella
   · Todo lo que se hace en el panel queda en el registro de actividad.

   Importante: sin servidor, los permisos se comprueban en el navegador.
   Con un servidor (Supabase) se comprobarían también allí, que es lo seguro.
   ========================================================================== */
window.Alki = window.Alki || {};
Alki.panel = Alki.panel || {};

(function () {
  const S = Alki.store;

  /* [clave, nombre, icono, ruta, descripción, nombre corto para la barra] */
  const secciones = [
    ['resumen', 'Resumen', 'panel', '/admin', 'Cifras del día y lo que necesita atención'],
    ['incidencias', 'Incidencias', 'incidencias', '/admin/incidencias', 'Tablero de incidencias, asignaciones y respuestas'],
    ['viviendas', 'Viviendas', 'edificio', '/admin/viviendas', 'Pisos, habitaciones y datos de cada vivienda'],
    ['costes', 'Costes y beneficio', 'calculadora', '/admin/costes', 'Gastos de cada piso y beneficio real', 'Costes'],
    ['cobros', 'Cobros', 'pagos', '/admin/cobros', 'Recibos de los inquilinos'],
    ['personas', 'Inquilinos', 'personas', '/admin/personas', 'Contratos, residentes y propietarios'],
    ['comunicacion', 'Comunicación', 'chat', '/admin/mensajes', 'Mensajes con propietarios, avisos y ALKI Social'],
    ['datos', 'Datos', 'subir', '/admin/datos', 'Importar CSV, copias de seguridad'],
    ['equipo', 'Equipo y permisos', 'llave', '/admin/equipo', 'Solo el encargado', 'Equipo'],
    ['actividad', 'Actividad', 'calendario', '/admin/actividad', 'Solo el encargado']
  ];
  const soloEncargado = ['equipo', 'actividad'];
  const seccionesConPermiso = secciones.filter((s) => !soloEncargado.includes(s[0]));

  // Perfiles de partida: se aplican al crear a un trabajador y luego se pueden cambiar
  const perfiles = {
    mantenimiento: { nombre: 'Mantenimiento', permisos: { resumen: 'ver', incidencias: 'editar', viviendas: 'ver', costes: 'no', cobros: 'no', personas: 'ver', comunicacion: 'no', datos: 'no' } },
    administracion: { nombre: 'Administración y cobros', permisos: { resumen: 'ver', incidencias: 'ver', viviendas: 'ver', costes: 'editar', cobros: 'editar', personas: 'ver', comunicacion: 'no', datos: 'editar' } },
    comercial: { nombre: 'Comercial / captación', permisos: { resumen: 'ver', incidencias: 'ver', viviendas: 'editar', costes: 'no', cobros: 'no', personas: 'ver', comunicacion: 'ver', datos: 'no' } },
    atencion: { nombre: 'Atención al inquilino', permisos: { resumen: 'ver', incidencias: 'editar', viviendas: 'ver', costes: 'no', cobros: 'ver', personas: 'editar', comunicacion: 'editar', datos: 'no' } },
    total: { nombre: 'Acceso total', permisos: { resumen: 'editar', incidencias: 'editar', viviendas: 'editar', costes: 'editar', cobros: 'editar', personas: 'editar', comunicacion: 'editar', datos: 'editar' } }
  };

  const nuevoId = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const normEmail = (e) => String(e || '').trim().toLowerCase();

  // El encargado existe siempre (no se puede borrar ni quitarle permisos)
  function asegurar() {
    const db = S.db;
    if (!db.equipo || !db.equipo.length) {
      db.equipo = [{
        id: 'eq-encargado', nombre: 'Daniel (encargado)', email: 'daniel@alki.casa', puesto: 'Encargado',
        superadmin: true, activo: true, permisos: Object.assign({}, perfiles.total.permisos), clave: null, creado: new Date().toISOString()
      }];
    }
    db.actividad = db.actividad || [];
    db.costes = db.costes || [];
    S.guardar();
  }

  /* ---------- Contraseñas del equipo (huella SHA-256, igual que en la app) ---------- */
  async function huella(m, texto) {
    const entrada = 'alki-equipo|' + m.id + '|' + texto;
    if (window.crypto && crypto.subtle) {
      const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(entrada));
      return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, '0')).join('');
    }
    let h = 5381;
    for (let i = 0; i < entrada.length; i++) h = ((h << 5) + h + entrada.charCodeAt(i)) | 0;
    return 'x' + (h >>> 0).toString(16);
  }
  const buscarPorEmail = (email) => (S.db.equipo || []).find((m) => normEmail(m.email) === normEmail(email)) || null;
  const miembro = (id) => (S.db.equipo || []).find((m) => m.id === id) || null;
  async function comprobarClave(m, texto) { return !!m.clave && m.clave === await huella(m, texto); }
  async function crearClave(m, texto, confidencialidad) {
    m.clave = await huella(m, texto);
    if (confidencialidad) m.confidencialidad = new Date().toISOString();
    S.guardar();
  }

  /* ---------- Sesión del panel (separada de la app de inquilinos) ---------- */
  const CLAVE_SESION = 'alki-panel-sesion';
  let enMemoria = null;
  function sesion() {
    let id = enMemoria;
    try { id = localStorage.getItem(CLAVE_SESION) || enMemoria; } catch (e) { /* nada */ }
    const m = id && miembro(id);
    if (!m || !m.activo) return null;
    Alki.autorActual = m.nombre;
    return { rol: 'admin', refId: null, nombre: m.nombre, email: m.email, miembroId: m.id, superadmin: !!m.superadmin };
  }
  function entrar(m) {
    enMemoria = m.id;
    try { localStorage.setItem(CLAVE_SESION, m.id); } catch (e) { /* nada */ }
    registrar('Ha entrado en el panel', '', m);
    return sesion();
  }
  function salir() {
    enMemoria = null;
    try { localStorage.removeItem(CLAVE_SESION); } catch (e) { /* nada */ }
  }

  /* ---------- Permisos ---------- */
  function permiso(ses, seccion) {
    if (!ses) return 'no';
    const m = miembro(ses.miembroId);
    if (!m || !m.activo) return 'no';
    if (m.superadmin) return 'editar';
    if (soloEncargado.includes(seccion)) return 'no';
    return (m.permisos || {})[seccion] || 'no';
  }

  /* ---------- Gestión del equipo (solo encargado) ---------- */
  function crearTrabajador(datos) {
    if (buscarPorEmail(datos.email)) throw new Error('Ya hay alguien en el equipo con ese correo.');
    const m = {
      id: nuevoId('eq-'), nombre: datos.nombre, email: normEmail(datos.email), puesto: datos.puesto || perfiles[datos.perfil].nombre,
      superadmin: false, activo: true, permisos: Object.assign({}, perfiles[datos.perfil || 'mantenimiento'].permisos), clave: null, creado: new Date().toISOString()
    };
    S.db.equipo.push(m);
    registrar('Ha dado de alta a ' + m.nombre, m.puesto);
    S.guardar();
    return m;
  }
  function actualizarTrabajador(id, cambios, texto) {
    const m = miembro(id);
    if (!m) return;
    if (cambios.email && normEmail(cambios.email) !== normEmail(m.email) && buscarPorEmail(cambios.email)) throw new Error('Ese correo ya lo usa otra persona del equipo.');
    if (m.superadmin) { delete cambios.activo; delete cambios.permisos; }
    Object.assign(m, cambios);
    if (cambios.email) m.email = normEmail(cambios.email);
    if (texto) registrar(texto, m.nombre);
    S.guardar();
  }
  function cambiarPermiso(id, seccion, nivel) {
    const m = miembro(id);
    if (!m || m.superadmin) return;
    m.permisos[seccion] = nivel;
    const nombres = { no: 'sin acceso', ver: 'solo ver', editar: 'editar' };
    registrar('Ha cambiado permisos de ' + m.nombre, secciones.find((s) => s[0] === seccion)[1] + ': ' + nombres[nivel]);
    S.guardar();
  }
  function aplicarPerfil(id, perfil) {
    const m = miembro(id);
    if (!m || m.superadmin || !perfiles[perfil]) return;
    m.permisos = Object.assign({}, perfiles[perfil].permisos);
    registrar('Ha aplicado el perfil «' + perfiles[perfil].nombre + '»', m.nombre);
    S.guardar();
  }
  function restablecerClave(id) {
    const m = miembro(id);
    if (!m) return;
    m.clave = null;
    registrar('Ha restablecido la contraseña de ' + m.nombre, 'Creará una nueva al entrar');
    S.guardar();
  }

  /* ---------- Registro de actividad ---------- */
  function registrar(accion, detalle, quien) {
    const ses = quien ? null : sesion();
    const nombre = quien ? quien.nombre : ses ? ses.nombre : 'Sistema';
    S.db.actividad = S.db.actividad || [];
    S.db.actividad.unshift({ id: nuevoId('ac-'), fecha: new Date().toISOString(), quien: nombre, accion, detalle: detalle || '' });
    if (S.db.actividad.length > 800) S.db.actividad.length = 800;
    S.guardar();
  }

  // Lo que se hace con las funciones de la base de datos también queda registrado
  function envolver(nombre, describir) {
    const original = S[nombre];
    if (!original || original.__envuelta) return;
    S[nombre] = function () {
      const r = original.apply(this, arguments);
      try { if (sesion()) { const d = describir.apply(null, Array.from(arguments).concat([r])); if (d) registrar(d[0], d[1]); } } catch (e) { /* el registro nunca rompe la acción */ }
      return r;
    };
    S[nombre].__envuelta = true;
  }
  function nombreViv(id) { const v = id && S.buscar('viviendas', id); return v ? v.codigo : 'General'; }
  function nombreRecibo(id) {
    const p = S.buscar('pagos', id);
    if (!p) return '';
    const c = S.buscar('contratos', p.contratoId);
    const h = S.buscar('habitaciones', c.habitacionId);
    return nombreViv(h.viviendaId) + '-' + h.codigo + ' · ' + Alki.ui.mes(p.periodo) + ' · ' + Alki.ui.euro(p.importe);
  }
  function instalarRegistro() {
    envolver('confirmarPago', (id) => ['Ha marcado un recibo como cobrado', nombreRecibo(id)]);
    envolver('crearIncidencia', (d, r) => ['Ha registrado una incidencia', nombreViv(d.viviendaId) + ' · ' + d.titulo]);
    envolver('actualizarIncidencia', (id, cambios, nota) => { const i = S.buscar('incidencias', id); return ['Ha actualizado una incidencia', (i ? nombreViv(i.viviendaId) + ' · ' + i.titulo : '') + (cambios.estado ? ' → ' + cambios.estado.replace('_', ' ') : '')]; });
    envolver('actualizarVivienda', (id) => ['Ha editado los datos de una vivienda', nombreViv(id)]);
    envolver('marcarReforma', (id, si) => ['Ha cambiado el estado de una habitación', id.split('-').slice(1).join('-').toUpperCase() + (si ? ' → en reforma' : ' → lista para alquilar')]);
    envolver('crearAviso', (v, t) => ['Ha publicado un aviso', nombreViv(v) + ' · ' + t]);
    envolver('importarCSV', (a, b, r) => ['Ha importado los CSV de contratos e inquilinos', r ? r.contratos + ' contratos' : '']);
    envolver('importarCopia', () => ['Ha restaurado una copia de seguridad', '']);
    envolver('enviarMensaje', (hilo) => { const p = S.buscar('propietarios', hilo); return ['Ha enviado un mensaje', p ? p.nombre : '']; });
    envolver('publicar', () => ['Ha publicado en ALKI Social', '']);
    envolver('borrarPost', () => ['Ha borrado una publicación de ALKI Social', '']);
    envolver('cerrarSolicitud', () => ['Ha atendido una solicitud de un inquilino', '']);
  }

  Alki.panel.equipo = {
    secciones, seccionesConPermiso, soloEncargado, perfiles, asegurar, buscarPorEmail, miembro, comprobarClave, crearClave,
    sesion, entrar, salir, permiso, crearTrabajador, actualizarTrabajador, cambiarPermiso, aplicarPerfil, restablecerClave,
    registrar, instalarRegistro
  };
})();
