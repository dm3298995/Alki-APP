/* ==========================================================================
   integraciones/index.js — REGISTRO Y PROGRAMADOR DE SINCRONIZACIONES
   · Cada integración es un módulo independiente (homming.js, y en el futuro
     el servidor virtual de ALKI, contabilidad...). Para añadir una nueva basta
     con crear su archivo y registrarlo en CONECTORES.
   · Cada minuto se comprueba qué integraciones toca sincronizar.
   · Si una falla varias veces seguidas, se espera más entre intentos
     (1x, 2x, 4x, 8x, 16x el intervalo) para no saturar al proveedor, y se
     muestra un aviso en el panel. El resto de la plataforma sigue funcionando.
   ========================================================================== */
'use strict';
const db = require('../db');
const { cifrar, descifrar } = require('../seguridad/cifrado');
const { registrar } = require('../servicios/auditoria');

const CONECTORES = { homming: require('./homming') };
const enCurso = new Set();

function leerConfig(nombre) {
  const c = CONECTORES[nombre];
  const f = db.uno('SELECT * FROM integraciones WHERE nombre = ?', nombre);
  const guardada = f?.config_cifrada ? JSON.parse(descifrar(f.config_cifrada)) : {};
  return { fila: f, config: { ...c.CONFIG_DEFECTO, ...guardada, rutas: { ...c.CONFIG_DEFECTO.rutas, ...(guardada.rutas || {}) }, paginacion: { ...c.CONFIG_DEFECTO.paginacion, ...(guardada.paginacion || {}) } } };
}

function guardarConfig(nombre, config, { activa, intervalo }) {
  db.ejecutar(
    'INSERT INTO integraciones (nombre, activa, config_cifrada, intervalo_min, ultimo_estado) VALUES (?, ?, ?, ?, \'nunca\') ' +
    'ON CONFLICT(nombre) DO UPDATE SET activa = excluded.activa, config_cifrada = excluded.config_cifrada, intervalo_min = excluded.intervalo_min',
    nombre, activa ? 1 : 0, cifrar(JSON.stringify(config)), intervalo);
}

// Vista segura para el navegador: el token nunca sale del servidor
function publica(nombre) {
  const { fila, config } = leerConfig(nombre);
  return {
    nombre, titulo: CONECTORES[nombre].titulo, activa: !!fila?.activa, intervalo: fila?.intervalo_min ?? 60,
    ultimaSync: fila?.ultima_sync || null, estado: fila?.ultimo_estado || 'nunca', error: fila?.ultimo_error || null, fallos: fila?.fallos_seguidos || 0,
    config: { ...config, token: undefined, webhookClave: undefined, tieneToken: !!config.token, tieneWebhook: !!config.webhookClave },
    historial: db.todos('SELECT inicio, fin, estado, resumen FROM sincronizaciones WHERE integracion = ? ORDER BY id DESC LIMIT 10', nombre)
  };
}

async function ejecutar(nombre, { peticion = null, motivo = 'programada' } = {}) {
  if (enCurso.has(nombre)) return { omitida: 'Ya hay una sincronización en curso.' };
  const { config } = leerConfig(nombre);
  if (!config.baseUrl || !config.token) throw Object.assign(new Error('Falta configurar la URL de la API y el token.'), { estado: 400 });
  enCurso.add(nombre);
  const id = Number(db.ejecutar('INSERT INTO sincronizaciones (integracion, estado) VALUES (?, ?)', nombre, 'en_curso').lastInsertRowid);
  try {
    const res = await CONECTORES[nombre].sincronizar(config, db);
    db.ejecutar("UPDATE sincronizaciones SET fin = datetime('now'), estado = 'ok', resumen = ? WHERE id = ?", JSON.stringify(res), id);
    db.ejecutar("UPDATE integraciones SET ultima_sync = datetime('now'), ultimo_estado = 'ok', ultimo_error = NULL, fallos_seguidos = 0 WHERE nombre = ?", nombre);
    registrar(peticion, 'integracion.sync_ok', { detalle: { nombre, motivo, ...res, avisos: undefined } });
    return res;
  } catch (e) {
    const msg = String(e.message || e).slice(0, 300);
    db.ejecutar("UPDATE sincronizaciones SET fin = datetime('now'), estado = 'error', resumen = ? WHERE id = ?", msg, id);
    db.ejecutar("UPDATE integraciones SET ultima_sync = datetime('now'), ultimo_estado = 'error', ultimo_error = ?, fallos_seguidos = fallos_seguidos + 1 WHERE nombre = ?", msg, nombre);
    registrar(peticion, 'integracion.sync_error', { detalle: { nombre, motivo, error: msg } });
    throw Object.assign(new Error(msg), { estado: 502 });
  } finally {
    enCurso.delete(nombre);
  }
}

function programar() {
  setInterval(() => {
    for (const f of db.todos('SELECT * FROM integraciones WHERE activa = 1')) {
      if (!CONECTORES[f.nombre]) continue;
      const factor = 2 ** Math.min(f.fallos_seguidos, 4);
      const ultima = f.ultima_sync ? Date.parse(f.ultima_sync.replace(' ', 'T') + 'Z') : 0;
      if (Date.now() - ultima >= f.intervalo_min * 60 * 1000 * factor) ejecutar(f.nombre).catch(() => { /* ya registrado */ });
    }
  }, 60 * 1000).unref();
}

module.exports = { CONECTORES, leerConfig, guardarConfig, publica, ejecutar, programar };
