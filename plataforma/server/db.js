/* ==========================================================================
   db.js — CONEXIÓN A LA BASE DE DATOS (SQLite integrado en Node.js)
   · Todas las consultas usan parámetros (?) → protección contra SQL Injection.
   · Modo WAL: lecturas y escrituras simultáneas sin bloqueos.
   · Para crecer, el esquema es compatible con PostgreSQL (ver README).
   ========================================================================== */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const config = require('./config');

const archivo = path.join(config.DATA, 'alki.db');
const db = new DatabaseSync(archivo);
try { fs.chmodSync(archivo, 0o600); } catch { /* sin permisos para cambiarlo: no es grave */ }

db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
// Migraciones: columnas añadidas en versiones posteriores (bases de datos ya creadas)
const MIGRACIONES = [
  ['habitaciones', 'tipo', "TEXT NOT NULL DEFAULT 'estandar'"], ['habitaciones', 'm2', 'INTEGER'], ['habitaciones', 'caracteristicas', 'TEXT'],
  ['inmuebles', 'm2', 'INTEGER'], ['inmuebles', 'planta', 'TEXT'], ['inmuebles', 'descripcion', 'TEXT'],
  ['contratos', 'codigo', 'TEXT'], ['contratos', 'renovacion_de', 'INTEGER REFERENCES contratos(id) ON DELETE SET NULL'],
  ['contratos', 'renovacion', 'TEXT'], ['contratos', 'firmado', 'TEXT'], ['pagos', 'cobrado', 'INTEGER NOT NULL DEFAULT 0'], ['usuarios', 'permisos', 'TEXT']
];
const existe = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'usuarios'").get();
if (existe) {
  for (const [tabla, col, def] of MIGRACIONES) {
    const cols = db.prepare('PRAGMA table_info(' + tabla + ')').all().map((c) => c.name);
    if (!cols.includes(col)) db.exec('ALTER TABLE ' + tabla + ' ADD COLUMN ' + col + ' ' + def);
  }
}
// Tablas cuyas reglas (CHECK) han cambiado: se reconstruyen conservando los datos
const RECONSTRUIR = [['gastos', "'impuestos'"], ['documentos', "'incidencia'"]];
const pendientes = [];
if (existe) {
  db.exec('PRAGMA foreign_keys = OFF; PRAGMA legacy_alter_table = ON;');
  for (const [tabla, marca] of RECONSTRUIR) {
    const f = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(tabla);
    if (f && !f.sql.includes(marca)) { db.exec('ALTER TABLE ' + tabla + ' RENAME TO ' + tabla + '__viejo'); pendientes.push(tabla); }
  }
}
const ESQUEMA = fs.readFileSync(path.join(__dirname, 'esquema.sql'), 'utf8');
db.exec(ESQUEMA);
if (pendientes.length) {
  for (const tabla of pendientes) {
    const cols = db.prepare('PRAGMA table_info(' + tabla + '__viejo)').all().map((c) => c.name)
      .filter((c) => db.prepare('PRAGMA table_info(' + tabla + ')').all().some((n) => n.name === c)).join(', ');
    db.exec('INSERT INTO ' + tabla + ' (' + cols + ') SELECT ' + cols + ' FROM ' + tabla + '__viejo; DROP TABLE ' + tabla + '__viejo;');
  }
  db.exec(ESQUEMA); // vuelve a crear los índices
}
db.exec('PRAGMA legacy_alter_table = OFF; PRAGMA foreign_keys = ON;');
// Los recibos marcados como pagados antes de existir "cobrado" se consideran cobrados del todo
db.exec('UPDATE pagos SET cobrado = importe WHERE pagado_el IS NOT NULL AND cobrado = 0');

// Caché de sentencias preparadas: más rápido y siempre parametrizado.
const cache = new Map();
function prep(sql) {
  let s = cache.get(sql);
  if (!s) { s = db.prepare(sql); cache.set(sql, s); }
  return s;
}

module.exports = {
  raw: db,
  archivo,
  todos: (sql, ...p) => prep(sql).all(...p),
  uno: (sql, ...p) => prep(sql).get(...p),
  ejecutar: (sql, ...p) => prep(sql).run(...p),
  // Ejecuta varias operaciones como una sola: o se hacen todas, o ninguna.
  transaccion(fn) {
    db.exec('BEGIN');
    try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
  },
  ajuste(clave, porDefecto) {
    const f = prep('SELECT valor FROM ajustes WHERE clave = ?').get(clave);
    return f ? JSON.parse(f.valor) : porDefecto;
  },
  guardarAjuste(clave, valor) {
    prep('INSERT INTO ajustes (clave, valor) VALUES (?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor').run(clave, JSON.stringify(valor));
  }
};
