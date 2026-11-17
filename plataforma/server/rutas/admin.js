/* ==========================================================================
   rutas/admin.js — ADMINISTRACIÓN: USUARIOS, PERMISOS, INTEGRACIONES,
   IMPORTACIÓN, AUDITORÍA, AJUSTES Y COPIAS DE SEGURIDAD
   ========================================================================== */
'use strict';
const db = require('../db');
const { ruta, ErrorHttp } = require('../http');
const { ROLES, PERMISOS, SECCIONES, ESPECIALES, SOLO_ADMIN, efectivos } = require('../seguridad/permisos');
const { validar } = require('../seguridad/validar');
const { igualSeguro, tokenAleatorio } = require('../seguridad/cifrado');
const { limitar } = require('../seguridad/limites');
const sesiones = require('../seguridad/sesiones');
const { registrar } = require('../servicios/auditoria');
const correo = require('../servicios/correo');
const copias = require('../servicios/copias');
const costes = require('../servicios/costes');
const integ = require('../integraciones');
const csv = require('../integraciones/csv-homming');
const { crearEnlaceClave, enlace } = require('./auth');
const { TIPOS_MANT } = require('./mantenimientos');

// ---------- Catálogo para formularios ----------
ruta('GET', '/api/catalogo', {}, () => {
  const inmuebles = db.todos('SELECT id, codigo, nombre FROM inmuebles WHERE activo = 1 ORDER BY codigo');
  const habs = db.todos('SELECT id, inmueble_id, codigo FROM habitaciones WHERE activo = 1 ORDER BY codigo');
  return {
    inmuebles: inmuebles.map((i) => ({ ...i, habitaciones: habs.filter((h) => h.inmueble_id === i.id).map(({ id, codigo }) => ({ id, codigo })) })),
    categorias: costes.CATEGORIAS,
    tipos: TIPOS_MANT
  };
});

// ---------- Usuarios ----------
ruta('GET', '/api/admin/usuarios', { permiso: 'admin.usuarios' }, () => ({
  usuarios: db.todos('SELECT id, email, nombre, rol, permisos, mfa_activo, activo, creado, ultimo_acceso, hash_clave IS NOT NULL AS activada, bloqueado_hasta > ? AS bloqueado FROM usuarios ORDER BY rol = \'admin\' DESC, activo DESC, nombre', Date.now())
    .map((u) => ({ ...u, personalizado: !!u.permisos && u.rol !== 'admin', permisos: efectivos(u) })),
  roles: Object.fromEntries(Object.entries(ROLES).map(([k, r]) => [k, { nombre: r.nombre, descripcion: r.descripcion, permisos: efectivos({ rol: k }) }])),
  permisos: PERMISOS,
  secciones: SECCIONES.map(([clave, nombre, acciones, descripcion, grupo]) => ({ clave, nombre, acciones, descripcion, grupo })),
  especiales: ESPECIALES,
  soloAdmin: SOLO_ADMIN
}));

// Permisos personalizados de una persona (null = volver a los de su rol)
ruta('PUT', '/api/admin/usuarios/:id/permisos', { permiso: 'admin.usuarios' }, ({ peticion, params, cuerpo, usuario }) => {
  const u = db.uno('SELECT * FROM usuarios WHERE id = ?', params.id);
  if (!u) throw new ErrorHttp(404, 'Usuario no encontrado.');
  if (u.rol === 'admin') throw new ErrorHttp(400, 'Un Administrador tiene siempre todos los permisos.');
  if (!cuerpo || (cuerpo.permisos !== null && !Array.isArray(cuerpo.permisos))) throw new ErrorHttp(400, 'Datos no válidos.');
  let lista = null;
  if (cuerpo.permisos) {
    lista = [...new Set(cuerpo.permisos)];
    if (lista.length > 60 || lista.some((p) => typeof p !== 'string' || !PERMISOS[p])) throw new ErrorHttp(400, 'Hay permisos que no existen.');
    // Solo un Administrador puede dar permisos de administración
    if (usuario.rol !== 'admin' && lista.some((p) => SOLO_ADMIN.includes(p))) throw new ErrorHttp(403, 'Solo un Administrador puede dar ese permiso.');
  }
  const antes = efectivos(u);
  db.ejecutar('UPDATE usuarios SET permisos = ? WHERE id = ?', lista ? JSON.stringify(lista) : null, u.id);
  const despues = efectivos({ ...u, permisos: lista ? JSON.stringify(lista) : null });
  registrar(peticion, 'usuario.permisos', { entidad: 'usuario', id: u.id, detalle: { quitados: antes.filter((p) => !despues.includes(p)), añadidos: despues.filter((p) => !antes.includes(p)) } });
  return { ok: true, permisos: despues };
});

async function invitar(peticion, u) {
  const token = crearEnlaceClave(u.id, 72 * 60);
  await correo.enviar({
    para: u.email, asunto: 'Tu acceso a ALKI Gestión',
    texto: 'Hola ' + u.nombre + ',\n\nSe ha creado tu acceso a la plataforma de gestión de ALKI.\nPara elegir tu contraseña abre este enlace (válido 72 horas, un solo uso):\n\n' +
      enlace(peticion, 'nueva-clave', token) + '\n\nALKI Gestión'
  });
}

ruta('POST', '/api/admin/usuarios', { permiso: 'admin.usuarios' }, async ({ peticion, cuerpo, usuario }) => {
  const d = validar(cuerpo, { email: { tipo: 'email', req: true }, nombre: { tipo: 'texto', req: true, max: 80, etiqueta: 'Nombre' }, rol: { tipo: 'enum', req: true, valores: Object.keys(ROLES), etiqueta: 'Rol' } });
  if (db.uno('SELECT 1 FROM usuarios WHERE email = ?', d.email)) throw new ErrorHttp(409, 'Ya existe un usuario con ese correo.');
  if (d.rol === 'admin' && usuario.rol !== 'admin') throw new ErrorHttp(403, 'Solo un Administrador puede crear otro Administrador.');
  const id = Number(db.ejecutar('INSERT INTO usuarios (email, nombre, rol) VALUES (?, ?, ?)', d.email, d.nombre, d.rol).lastInsertRowid);
  await invitar(peticion, { id, ...d });
  registrar(peticion, 'usuario.crear', { entidad: 'usuario', id, detalle: { email: d.email, rol: d.rol } });
  return { id, mensaje: 'Usuario creado. Se le ha enviado un enlace para elegir su contraseña.' };
});

ruta('PUT', '/api/admin/usuarios/:id', { permiso: 'admin.usuarios' }, ({ peticion, params, cuerpo, usuario }) => {
  const u = db.uno('SELECT * FROM usuarios WHERE id = ?', params.id);
  if (!u) throw new ErrorHttp(404, 'Usuario no encontrado.');
  const d = validar(cuerpo, { nombre: { tipo: 'texto', max: 80 }, rol: { tipo: 'enum', valores: Object.keys(ROLES) }, activo: { tipo: 'bool' }, desbloquear: { tipo: 'bool' } }, { parcial: true });
  if (u.id === usuario.id && (d.activo === false || (d.rol && d.rol !== 'admin'))) throw new ErrorHttp(400, 'No puedes quitarte a ti mismo el acceso de administrador.');
  if (usuario.rol !== 'admin' && (u.rol === 'admin' || d.rol === 'admin')) throw new ErrorHttp(403, 'Solo un Administrador puede modificar a otro Administrador.');
  const admins = db.uno("SELECT COUNT(*) AS n FROM usuarios WHERE rol = 'admin' AND activo = 1").n;
  if (u.rol === 'admin' && admins <= 1 && ((d.rol && d.rol !== 'admin') || d.activo === false)) throw new ErrorHttp(400, 'Debe quedar al menos un administrador activo.');
  if (d.nombre) db.ejecutar('UPDATE usuarios SET nombre = ? WHERE id = ?', d.nombre, u.id);
  if (d.rol) db.ejecutar('UPDATE usuarios SET rol = ? WHERE id = ?', d.rol, u.id);
  if (d.activo !== undefined) db.ejecutar('UPDATE usuarios SET activo = ? WHERE id = ?', d.activo ? 1 : 0, u.id);
  if (d.desbloquear) db.ejecutar('UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = 0 WHERE id = ?', u.id);
  // Cambiar el rol o desactivar cierra sus sesiones (mínimo privilegio inmediato)
  if (d.rol || d.activo === false) sesiones.cerrarTodas(u.id);
  registrar(peticion, 'usuario.editar', { entidad: 'usuario', id: u.id, detalle: d });
  return { ok: true };
});

ruta('POST', '/api/admin/usuarios/:id/reiniciar-mfa', { permiso: 'admin.usuarios' }, ({ peticion, params, usuario }) => {
  if (usuario.rol !== 'admin' && db.uno("SELECT 1 FROM usuarios WHERE id = ? AND rol = 'admin'", params.id)) throw new ErrorHttp(403, 'Solo un Administrador puede hacer esto.');
  db.ejecutar('UPDATE usuarios SET mfa_activo = 0, mfa_secreto = NULL, mfa_ultimo_paso = 0 WHERE id = ?', params.id);
  sesiones.cerrarTodas(params.id);
  registrar(peticion, 'usuario.reiniciar_mfa', { entidad: 'usuario', id: params.id });
  return { ok: true };
});

ruta('POST', '/api/admin/usuarios/:id/invitar', { permiso: 'admin.usuarios' }, async ({ peticion, params }) => {
  const u = db.uno('SELECT id, email, nombre FROM usuarios WHERE id = ? AND activo = 1', params.id);
  if (!u) throw new ErrorHttp(404, 'Usuario no encontrado o desactivado.');
  await invitar(peticion, u);
  registrar(peticion, 'usuario.invitar', { entidad: 'usuario', id: u.id });
  return { ok: true };
});

// ---------- Auditoría ----------
ruta('GET', '/api/admin/auditoria', { permiso: 'admin.auditoria' }, ({ query }) => {
  const cond = ['1 = 1'], p = [];
  const accion = query.get('accion');
  if (accion && /^[a-z_.]{1,40}$/.test(accion)) { cond.push('a.accion LIKE ?'); p.push(accion + '%'); }
  const antes = Number(query.get('antes'));
  if (Number.isInteger(antes) && antes > 0) { cond.push('a.id < ?'); p.push(antes); }
  return { registros: db.todos('SELECT a.*, u.email FROM auditoria a LEFT JOIN usuarios u ON u.id = a.usuario_id WHERE ' + cond.join(' AND ') + ' ORDER BY a.id DESC LIMIT 200', ...p) };
});

// ---------- Integraciones ----------
ruta('GET', '/api/admin/integraciones', { permiso: 'admin.integraciones' }, () => ({ integraciones: Object.keys(integ.CONECTORES).map(integ.publica) }));

ruta('PUT', '/api/admin/integraciones/homming', { permiso: 'admin.integraciones' }, ({ peticion, cuerpo }) => {
  const d = validar(cuerpo, {
    activa: { tipo: 'bool' }, intervalo: { tipo: 'entero', min: 15, max: 1440 },
    baseUrl: { tipo: 'texto', max: 300 }, token: { tipo: 'texto', max: 2000 },
    cabecera: { tipo: 'texto', max: 60 }, formato: { tipo: 'texto', max: 100 },
    rutaInmuebles: { tipo: 'texto', max: 200 }, rutaUnidades: { tipo: 'texto', max: 200 }, rutaContratos: { tipo: 'texto', max: 200 }, rutaPagos: { tipo: 'texto', max: 200 },
    sincronizarPagos: { tipo: 'bool' }, generarWebhook: { tipo: 'bool' }
  }, { parcial: true });
  if (d.baseUrl && !/^https:\/\/[a-z0-9.-]+(:\d+)?(\/[\w./-]*)?$/i.test(d.baseUrl)) throw new ErrorHttp(400, 'La URL debe ser https:// y no contener parámetros.');
  if (d.cabecera && !/^[A-Za-z-]+$/.test(d.cabecera)) throw new ErrorHttp(400, 'Nombre de cabecera no válido.');
  if (d.formato && !d.formato.includes('{token}')) throw new ErrorHttp(400, 'El formato debe incluir {token}.');
  for (const k of ['rutaInmuebles', 'rutaUnidades', 'rutaContratos', 'rutaPagos']) if (d[k] && !/^\/[\w./{}-]*$/.test(d[k])) throw new ErrorHttp(400, 'Ruta no válida: ' + d[k]);
  const { fila, config } = integ.leerConfig('homming');
  const nueva = { ...config };
  if (d.baseUrl !== undefined) nueva.baseUrl = d.baseUrl || '';
  if (d.token) nueva.token = d.token; // vacío = conservar el actual
  if (d.cabecera) nueva.cabecera = d.cabecera;
  if (d.formato) nueva.formato = d.formato;
  if (d.sincronizarPagos !== undefined) nueva.sincronizarPagos = d.sincronizarPagos;
  nueva.rutas = { ...config.rutas };
  if (d.rutaInmuebles !== undefined) nueva.rutas.inmuebles = d.rutaInmuebles || '';
  if (d.rutaUnidades !== undefined) nueva.rutas.unidades = d.rutaUnidades || '';
  if (d.rutaContratos !== undefined) nueva.rutas.contratos = d.rutaContratos || '';
  if (d.rutaPagos !== undefined) nueva.rutas.pagos = d.rutaPagos || '';
  let webhook = null;
  if (d.generarWebhook) { nueva.webhookClave = tokenAleatorio(32); webhook = '/api/integraciones/homming/webhook?clave=' + nueva.webhookClave; }
  integ.guardarConfig('homming', nueva, { activa: d.activa ?? !!fila?.activa, intervalo: d.intervalo ?? fila?.intervalo_min ?? 60 });
  registrar(peticion, 'integracion.configurar', { detalle: { nombre: 'homming', campos: Object.keys(d).filter((k) => k !== 'token'), tokenCambiado: !!d.token } });
  // La URL del webhook se muestra UNA sola vez
  return { ok: true, webhook, integracion: integ.publica('homming') };
});

ruta('POST', '/api/admin/integraciones/homming/probar', { permiso: 'admin.integraciones' }, async ({ peticion }) => {
  const { config } = integ.leerConfig('homming');
  if (!config.baseUrl || !config.token) throw new ErrorHttp(400, 'Primero guarda la URL de la API y el token.');
  try {
    const r = await integ.CONECTORES.homming.probar(config);
    registrar(peticion, 'integracion.prueba_ok', { detalle: 'homming' });
    return r;
  } catch (e) { throw new ErrorHttp(502, e.message); }
});

ruta('POST', '/api/admin/integraciones/homming/sincronizar', { permiso: 'admin.importar' }, async ({ peticion }) => integ.ejecutar('homming', { peticion, motivo: 'manual' }));

// Webhook: Homming avisa de un cambio → se lanza una sincronización.
// Sin sesión ni CSRF (lo llama Homming), protegido por una clave secreta larga.
ruta('POST', '/api/integraciones/homming/webhook', { publica: true, sinCsrf: true, maxBytes: 256 * 1024 }, ({ peticion, query }) => {
  if (!limitar('webhook:' + peticion.ip, 30, 60 * 1000).permitido) throw new ErrorHttp(429, 'Demasiadas peticiones.');
  const { config, fila } = integ.leerConfig('homming');
  if (!fila?.activa || !config.webhookClave || !igualSeguro(query.get('clave') || '', config.webhookClave)) {
    registrar(peticion, 'integracion.webhook_rechazado');
    throw new ErrorHttp(401, 'No autorizado.');
  }
  integ.ejecutar('homming', { peticion, motivo: 'webhook' }).catch(() => { /* registrado */ });
  return { recibido: true };
});

// ---------- Importar CSV de Homming ----------
ruta('POST', '/api/admin/importar/homming-csv', { permiso: 'admin.importar', crudo: true, maxBytes: 10 * 1024 * 1024 }, ({ peticion, cuerpo }) => {
  let texto = cuerpo.toString('utf8');
  if (texto.includes('�')) texto = cuerpo.toString('latin1'); // exportaciones en ANSI/Windows
  const r = csv.importar(texto);
  registrar(peticion, 'importar.homming_csv', { detalle: { ...r, avisos: r.avisos.length } });
  return r;
});

// ---------- Ajustes ----------
ruta('GET', '/api/admin/ajustes', { permiso: 'admin.integraciones' }, () => ({
  dias_aviso_salida: db.ajuste('dias_aviso_salida', 60),
  dia_vencimiento: db.ajuste('dia_vencimiento', 5),
  recibos_automaticos: db.ajuste('recibos_automaticos', true),
  copias: copias.listar().slice(0, 10)
}));

ruta('PUT', '/api/admin/ajustes', { permiso: 'admin.integraciones' }, ({ peticion, cuerpo }) => {
  const d = validar(cuerpo, { dias_aviso_salida: { tipo: 'entero', min: 7, max: 180 }, dia_vencimiento: { tipo: 'entero', min: 1, max: 28 }, recibos_automaticos: { tipo: 'bool' } }, { parcial: true });
  for (const [k, v] of Object.entries(d)) db.guardarAjuste(k, v);
  registrar(peticion, 'ajustes.editar', { detalle: d });
  return { ok: true };
});

ruta('POST', '/api/admin/copias', { permiso: 'admin.integraciones' }, ({ peticion }) => {
  const archivo = copias.crear();
  registrar(peticion, 'copia.crear', { detalle: archivo });
  return { archivo };
});

// ---------- Uso de la plataforma: quién entra, cuánto tiempo y qué apartados usa ----------
ruta('GET', '/api/admin/uso', { permiso: 'admin.auditoria' }, ({ query }) => {
  const dias = [7, 30, 90].includes(Number(query.get('dias'))) ? Number(query.get('dias')) : 30;
  const desde = Date.now() - dias * 86400000;
  const desdeFecha = new Date(desde).toISOString().slice(0, 10);
  // Sesiones terminadas + las que siguen abiertas ahora
  const sesiones = [
    ...db.todos('SELECT usuario_id, inicio, fin FROM uso_sesiones WHERE inicio >= ?', desde),
    ...db.todos("SELECT usuario_id, creada AS inicio, ultima_actividad AS fin FROM sesiones WHERE fase = 'completa' AND creada >= ?", desde).map((s) => ({ ...s, abierta: true }))
  ].map((s) => ({ ...s, min: Math.max(1, Math.round((s.fin - s.inicio) / 60000)) }));
  const usuarios = db.todos('SELECT id, nombre, rol, activo, ultimo_acceso FROM usuarios ORDER BY nombre');
  const apartados = db.todos('SELECT usuario_id, apartado, SUM(n) AS n FROM uso_apartados WHERE fecha >= ? GROUP BY usuario_id, apartado', desdeFecha);
  const porPersona = usuarios.map((u) => {
    const ss = sesiones.filter((s) => s.usuario_id === u.id);
    const total = ss.reduce((t, s) => t + s.min, 0);
    const diasActivos = new Set(ss.map((s) => new Date(s.inicio).toISOString().slice(0, 10))).size;
    const top = apartados.filter((a) => a.usuario_id === u.id).sort((a, b) => b.n - a.n).slice(0, 3).map((a) => a.apartado);
    return { id: u.id, nombre: u.nombre, rol: u.rol, activo: !!u.activo, ultimoAcceso: u.ultimo_acceso, sesiones: ss.length, minutos: total,
      mediaMin: ss.length ? Math.round(total / ss.length) : 0, diasActivos, abiertaAhora: ss.some((s) => s.abierta), top };
  }).filter((u) => u.activo || u.sesiones).sort((a, b) => b.minutos - a.minutos);
  // Sesiones por día
  const porDia = [];
  for (let k = dias - 1; k >= 0; k--) {
    const f = new Date(Date.now() - k * 86400000).toISOString().slice(0, 10);
    const delDia = sesiones.filter((s) => new Date(s.inicio).toISOString().slice(0, 10) === f);
    porDia.push({ fecha: f, sesiones: delDia.length, personas: new Set(delDia.map((s) => s.usuario_id)).size, minutos: delDia.reduce((t, s) => t + s.min, 0) });
  }
  const totalApartados = {};
  for (const a of apartados) totalApartados[a.apartado] = (totalApartados[a.apartado] || 0) + a.n;
  const minutos = sesiones.reduce((t, s) => t + s.min, 0);
  return {
    dias, personas: porPersona, porDia,
    apartados: Object.entries(totalApartados).map(([apartado, n]) => ({ apartado, n })).sort((a, b) => b.n - a.n),
    resumen: { sesiones: sesiones.length, minutos, mediaMin: sesiones.length ? Math.round(minutos / sesiones.length) : 0,
      personasActivas: new Set(sesiones.map((s) => s.usuario_id)).size, conectadasAhora: new Set(sesiones.filter((s) => s.abierta && Date.now() - s.fin < 15 * 60000).map((s) => s.usuario_id)).size }
  };
});
