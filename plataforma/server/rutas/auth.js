/* ==========================================================================
   rutas/auth.js — ACCESO: LOGIN, MFA, RECUPERACIÓN Y CIERRE DE SESIÓN
   Medidas:
   · Límite de intentos por IP y bloqueo temporal de la cuenta tras 5 fallos.
   · Mensajes genéricos ("correo o contraseña incorrectos") para no revelar
     qué correos existen.
   · MFA obligatorio para Administrador y Dirección.
   · Enlaces de recuperación de un solo uso que caducan en 30 minutos.
   ========================================================================== */
'use strict';
const db = require('../db');
const config = require('../config');
const { ruta, ErrorHttp } = require('../http');
const sesiones = require('../seguridad/sesiones');
const cif = require('../seguridad/cifrado');
const totp = require('../seguridad/totp');
const { limitar, reiniciar } = require('../seguridad/limites');
const { ROLES, PERMISOS, MFA_OBLIGATORIO, efectivos } = require('../seguridad/permisos');
const { validar } = require('../seguridad/validar');
const { registrar } = require('../servicios/auditoria');
const correo = require('../servicios/correo');

const MAX_FALLOS = 5, BLOQUEO_MIN = 15;

function frenar(peticion, clave, max = 10) {
  const r = limitar(clave + ':' + peticion.ip, max, 15 * 60 * 1000);
  if (!r.permitido) {
    registrar(peticion, 'acceso.bloqueado_ip', { detalle: clave });
    throw new ErrorHttp(429, 'Demasiados intentos. Vuelve a probar en ' + Math.ceil(r.esperarSeg / 60) + ' minutos.');
  }
}

function enlace(peticion, ruta, token) {
  const base = config.origen || ('http://' + peticion.headers.host);
  return base + '/#/' + ruta + '?token=' + encodeURIComponent(token);
}

// Crea un enlace de un solo uso para fijar contraseña (alta o recuperación)
function crearEnlaceClave(usuarioId, minutos = 30) {
  const token = cif.tokenAleatorio(32);
  db.ejecutar('INSERT INTO recuperaciones (token_hash, usuario_id, caduca) VALUES (?, ?, ?)', cif.sha256(token), usuarioId, Date.now() + minutos * 60 * 1000);
  return token;
}

function perfil(usuario, sesion) {
  return {
    usuario: { id: usuario.id, email: usuario.email, nombre: usuario.nombre, rol: usuario.rol, rolNombre: ROLES[usuario.rol].nombre, mfa: !!usuario.mfa_activo },
    permisos: efectivos(usuario),
    fase: sesion.fase,
    csrf: sesion.csrf,
    inactividadMin: config.sesion.inactividadMin
  };
}

// ---------- Login ----------
ruta('POST', '/api/auth/login', { publica: true }, async ({ peticion, res, cuerpo }) => {
  frenar(peticion, 'login');
  const { email, clave } = validar(cuerpo, { email: { tipo: 'email', req: true }, clave: { tipo: 'texto', req: true, max: 200 } });
  const u = db.uno('SELECT * FROM usuarios WHERE email = ?', email);

  if (u && u.bloqueado_hasta > Date.now()) {
    registrar(peticion, 'acceso.cuenta_bloqueada', { usuarioId: u.id });
    throw new ErrorHttp(429, 'Cuenta bloqueada temporalmente por intentos fallidos. Prueba en unos minutos o recupera tu contraseña.');
  }
  const ok = await cif.verificarClave(clave, u && u.activo ? u.hash_clave : null);
  if (!ok) {
    if (u) {
      const fallos = u.intentos_fallidos + 1;
      db.ejecutar('UPDATE usuarios SET intentos_fallidos = ?, bloqueado_hasta = ? WHERE id = ?',
        fallos >= MAX_FALLOS ? 0 : fallos, fallos >= MAX_FALLOS ? Date.now() + BLOQUEO_MIN * 60 * 1000 : 0, u.id);
      registrar(peticion, fallos >= MAX_FALLOS ? 'acceso.bloqueo_cuenta' : 'acceso.fallido', { usuarioId: u.id });
    } else registrar(peticion, 'acceso.fallido', { detalle: 'correo desconocido' });
    throw new ErrorHttp(401, 'Correo o contraseña incorrectos.');
  }

  db.ejecutar('UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = 0 WHERE id = ?', u.id);
  const fase = u.mfa_activo ? 'mfa' : (MFA_OBLIGATORIO.includes(u.rol) ? 'mfa_alta' : 'completa');
  sesiones.crear(res, peticion, u.id, fase);
  if (fase === 'completa') {
    db.ejecutar("UPDATE usuarios SET ultimo_acceso = datetime('now') WHERE id = ?", u.id);
    registrar(peticion, 'acceso.correcto', { usuarioId: u.id });
  }
  return { fase };
});

// ---------- Verificar código MFA ----------
ruta('POST', '/api/auth/mfa', { fase: 'mfa' }, ({ peticion, res, cuerpo, usuario, sesion }) => {
  const { codigo } = validar(cuerpo, { codigo: { tipo: 'texto', req: true, max: 10 } });
  const u = db.uno('SELECT mfa_secreto, mfa_ultimo_paso FROM usuarios WHERE id = ?', usuario.id);
  const paso = totp.verificar(cif.descifrar(u.mfa_secreto), codigo, u.mfa_ultimo_paso);
  if (!paso) {
    const intentos = sesion.intentos_mfa + 1;
    db.ejecutar('UPDATE sesiones SET intentos_mfa = ? WHERE id_hash = ?', intentos, sesion.id_hash);
    registrar(peticion, 'mfa.fallido');
    if (intentos >= 5) { sesiones.cerrar(res, sesion.id_hash); throw new ErrorHttp(401, 'Demasiados códigos incorrectos. Vuelve a iniciar sesión.'); }
    throw new ErrorHttp(400, 'Código incorrecto. Revisa la app de autenticación.');
  }
  db.ejecutar("UPDATE usuarios SET mfa_ultimo_paso = ?, ultimo_acceso = datetime('now') WHERE id = ?", paso, usuario.id);
  sesiones.cambiarFase(sesion.id_hash, 'completa');
  registrar(peticion, 'acceso.correcto', { detalle: 'con MFA' });
  return { fase: 'completa' };
});

// ---------- Alta de MFA: generar secreto ----------
ruta('POST', '/api/auth/mfa/preparar', { fase: ['mfa_alta', 'completa'] }, ({ usuario }) => {
  const secreto = totp.nuevoSecreto();
  db.ejecutar('UPDATE usuarios SET mfa_secreto = ? WHERE id = ? AND mfa_activo = 0', cif.cifrar(secreto), usuario.id);
  const u = db.uno('SELECT mfa_activo FROM usuarios WHERE id = ?', usuario.id);
  if (u.mfa_activo) throw new ErrorHttp(400, 'El MFA ya está activado.');
  return { secreto: secreto.match(/.{1,4}/g).join(' '), uri: totp.uri(secreto, usuario.email) };
});

// ---------- Alta de MFA: confirmar con el primer código ----------
ruta('POST', '/api/auth/mfa/activar', { fase: ['mfa_alta', 'completa'] }, ({ peticion, cuerpo, usuario, sesion }) => {
  const { codigo } = validar(cuerpo, { codigo: { tipo: 'texto', req: true, max: 10 } });
  const u = db.uno('SELECT mfa_secreto, mfa_activo FROM usuarios WHERE id = ?', usuario.id);
  if (u.mfa_activo || !u.mfa_secreto) throw new ErrorHttp(400, 'Primero genera la clave de configuración.');
  const paso = totp.verificar(cif.descifrar(u.mfa_secreto), codigo, 0);
  if (!paso) throw new ErrorHttp(400, 'El código no coincide. Comprueba que la hora del móvil es correcta.');
  db.ejecutar("UPDATE usuarios SET mfa_activo = 1, mfa_ultimo_paso = ?, ultimo_acceso = datetime('now') WHERE id = ?", paso, usuario.id);
  sesiones.cambiarFase(sesion.id_hash, 'completa');
  registrar(peticion, 'mfa.activado');
  return { fase: 'completa' };
});

// ---------- ¿Quién soy? ----------
ruta('GET', '/api/auth/yo', { fase: ['mfa', 'mfa_alta', 'completa'], noRenueva: true }, ({ usuario, sesion }) => perfil(usuario, sesion));

// ---------- Mantener la sesión activa (el usuario está trabajando) ----------
ruta('POST', '/api/auth/activo', {}, () => ({ ok: true }));

// ---------- Cerrar sesión ----------
ruta('POST', '/api/auth/salir', { publica: true }, ({ peticion, res, sesion }) => {
  if (sesion) registrar(peticion, 'acceso.salida');
  sesiones.cerrar(res, sesion?.id_hash);
  return { ok: true };
});

// ---------- Olvidé mi contraseña ----------
ruta('POST', '/api/auth/recuperar', { publica: true }, async ({ peticion, cuerpo }) => {
  frenar(peticion, 'recuperar', 5);
  const { email } = validar(cuerpo, { email: { tipo: 'email', req: true } });
  const u = db.uno('SELECT id, nombre, email FROM usuarios WHERE email = ? AND activo = 1', email);
  if (u) {
    const token = crearEnlaceClave(u.id, 30);
    registrar(peticion, 'clave.recuperacion_solicitada', { usuarioId: u.id });
    await correo.enviar({
      para: u.email, asunto: 'Restablecer tu contraseña de ALKI Gestión',
      texto: 'Hola ' + u.nombre + ',\n\nPara crear una contraseña nueva abre este enlace (caduca en 30 minutos y solo sirve una vez):\n\n' +
        enlace(peticion, 'nueva-clave', token) + '\n\nSi no lo has pedido tú, ignora este correo: tu contraseña no cambiará.\n\nALKI Gestión'
    });
  }
  // Siempre la misma respuesta, exista o no el correo
  return { ok: true, mensaje: 'Si el correo está registrado, recibirás un enlace para restablecer la contraseña.' };
});

// ---------- Fijar contraseña nueva con el enlace ----------
ruta('POST', '/api/auth/nueva-clave', { publica: true }, async ({ peticion, res, cuerpo }) => {
  frenar(peticion, 'nueva-clave', 10);
  const { token, clave } = validar(cuerpo, { token: { tipo: 'texto', req: true, max: 100 }, clave: { tipo: 'texto', req: true, max: 200 } });
  const r = db.uno('SELECT * FROM recuperaciones WHERE token_hash = ?', cif.sha256(token));
  if (!r || r.usado || r.caduca < Date.now()) throw new ErrorHttp(400, 'El enlace no es válido o ha caducado. Pide uno nuevo.');
  const u = db.uno('SELECT id, email FROM usuarios WHERE id = ? AND activo = 1', r.usuario_id);
  if (!u) throw new ErrorHttp(400, 'El enlace no es válido o ha caducado.');
  const error = cif.validarClave(clave, u.email);
  if (error) throw new ErrorHttp(400, error);
  const hash = await cif.hashClave(clave);
  db.transaccion(() => {
    db.ejecutar('UPDATE usuarios SET hash_clave = ?, intentos_fallidos = 0, bloqueado_hasta = 0 WHERE id = ?', hash, u.id);
    db.ejecutar('UPDATE recuperaciones SET usado = 1 WHERE usuario_id = ?', u.id);
  });
  sesiones.cerrarTodas(u.id);   // cierra cualquier sesión abierta con la contraseña antigua
  sesiones.cerrar(res, null);
  registrar(peticion, 'clave.cambiada', { usuarioId: u.id, detalle: 'mediante enlace' });
  return { ok: true };
});

// ---------- Cambiar contraseña estando dentro ----------
ruta('POST', '/api/auth/cambiar-clave', {}, async ({ peticion, cuerpo, usuario, sesion }) => {
  frenar(peticion, 'cambiar-clave', 10);
  const { actual, nueva } = validar(cuerpo, { actual: { tipo: 'texto', req: true, max: 200 }, nueva: { tipo: 'texto', req: true, max: 200 } });
  const u = db.uno('SELECT hash_clave FROM usuarios WHERE id = ?', usuario.id);
  if (!(await cif.verificarClave(actual, u.hash_clave))) throw new ErrorHttp(400, 'La contraseña actual no es correcta.');
  const error = cif.validarClave(nueva, usuario.email);
  if (error) throw new ErrorHttp(400, error);
  db.ejecutar('UPDATE usuarios SET hash_clave = ? WHERE id = ?', await cif.hashClave(nueva), usuario.id);
  sesiones.cerrarTodas(usuario.id, sesion.id_hash); // las demás sesiones se cierran
  registrar(peticion, 'clave.cambiada');
  return { ok: true };
});

module.exports = { crearEnlaceClave, enlace, PERMISOS };
