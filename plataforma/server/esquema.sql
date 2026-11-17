-- ==========================================================================
-- esquema.sql — BASE DE DATOS DE ALKI
-- Todas las tablas de la plataforma. Los importes se guardan en CÉNTIMOS
-- (enteros) para evitar errores de redondeo. Las fechas en formato ISO
-- (AAAA-MM-DD) y los periodos mensuales como AAAA-MM.
-- Las columnas external_id/origen permiten sincronizar con Homming u otras
-- fuentes sin duplicar registros.
-- ==========================================================================
PRAGMA foreign_keys = ON;

-- ---------- Usuarios y acceso ----------
CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  nombre TEXT NOT NULL,
  rol TEXT NOT NULL CHECK (rol IN ('admin','direccion','gestion','operativo')),
  permisos TEXT,                         -- JSON con permisos personalizados (NULL = los de su rol)
  hash_clave TEXT,                       -- scrypt; NULL hasta que el usuario activa su cuenta
  mfa_secreto TEXT,                      -- cifrado con AES-256-GCM
  mfa_activo INTEGER NOT NULL DEFAULT 0,
  mfa_ultimo_paso INTEGER NOT NULL DEFAULT 0,  -- evita reutilizar un código TOTP
  intentos_fallidos INTEGER NOT NULL DEFAULT 0,
  bloqueado_hasta INTEGER NOT NULL DEFAULT 0,
  activo INTEGER NOT NULL DEFAULT 1,
  creado TEXT NOT NULL DEFAULT (datetime('now')),
  ultimo_acceso TEXT
);

CREATE TABLE IF NOT EXISTS sesiones (
  id_hash TEXT PRIMARY KEY,              -- se guarda el hash del token, nunca el token
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  fase TEXT NOT NULL CHECK (fase IN ('mfa','mfa_alta','completa')),
  csrf TEXT NOT NULL,
  creada INTEGER NOT NULL,
  ultima_actividad INTEGER NOT NULL,
  intentos_mfa INTEGER NOT NULL DEFAULT 0,
  ip TEXT, agente TEXT
);
CREATE INDEX IF NOT EXISTS ix_sesiones_usuario ON sesiones(usuario_id);

CREATE TABLE IF NOT EXISTS recuperaciones (
  token_hash TEXT PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  caduca INTEGER NOT NULL,
  usado INTEGER NOT NULL DEFAULT 0
);

-- ---------- Inmuebles y habitaciones ----------
CREATE TABLE IF NOT EXISTS inmuebles (
  id INTEGER PRIMARY KEY,
  codigo TEXT NOT NULL UNIQUE COLLATE NOCASE,   -- p. ej. Pal2, SJB55
  nombre TEXT NOT NULL,
  direccion TEXT,
  barrio TEXT,
  propietario TEXT,
  renta_propietario INTEGER NOT NULL DEFAULT 0, -- céntimos al mes (informativo)
  m2 INTEGER, planta TEXT, descripcion TEXT,
  notas TEXT,
  activo INTEGER NOT NULL DEFAULT 1,
  external_id TEXT, origen TEXT NOT NULL DEFAULT 'manual',
  creado TEXT NOT NULL DEFAULT (datetime('now')),
  actualizado TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS habitaciones (
  id INTEGER PRIMARY KEY,
  inmueble_id INTEGER NOT NULL REFERENCES inmuebles(id) ON DELETE CASCADE,
  codigo TEXT NOT NULL,                          -- H1, H2, P2...
  nombre TEXT,
  precio INTEGER NOT NULL DEFAULT 0,             -- precio de referencia, céntimos
  tipo TEXT NOT NULL DEFAULT 'estandar',         -- estandar | grande | doble | suite
  m2 INTEGER,
  caracteristicas TEXT,                          -- lista separada por comas: Balcón, Baño privado...
  bloqueo TEXT CHECK (bloqueo IN ('mantenimiento','no_disponible') OR bloqueo IS NULL),
  activo INTEGER NOT NULL DEFAULT 1,
  external_id TEXT, origen TEXT NOT NULL DEFAULT 'manual',
  UNIQUE (inmueble_id, codigo)
);

CREATE TABLE IF NOT EXISTS inquilinos (
  id INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL,
  email TEXT, telefono TEXT,
  external_id TEXT, origen TEXT NOT NULL DEFAULT 'manual'
);
CREATE INDEX IF NOT EXISTS ix_inquilinos_nombre ON inquilinos(nombre);

-- Un pago va ligado a un CONTRATO (no a la habitación): así se conserva el
-- historial aunque un inquilino cambie de habitación.
CREATE TABLE IF NOT EXISTS contratos (
  id INTEGER PRIMARY KEY,
  codigo TEXT,                                   -- identificador interno, p. ej. ALK-2025-0142
  nombre TEXT,
  inmueble_id INTEGER NOT NULL REFERENCES inmuebles(id) ON DELETE CASCADE,
  habitacion_id INTEGER REFERENCES habitaciones(id) ON DELETE SET NULL,
  inquilino_id INTEGER REFERENCES inquilinos(id) ON DELETE SET NULL,
  tipo TEXT NOT NULL DEFAULT 'habitacion',       -- habitacion | temporal | vivienda | otro
  estado TEXT NOT NULL CHECK (estado IN ('activo','reservado','finalizado','rescindido')),
  inicio TEXT NOT NULL,
  fin TEXT,
  renta INTEGER NOT NULL DEFAULT 0,
  servicios INTEGER NOT NULL DEFAULT 0,          -- cuota mensual de servicios
  fianza INTEGER NOT NULL DEFAULT 0,
  renovacion_de INTEGER REFERENCES contratos(id) ON DELETE SET NULL, -- contrato anterior si es una renovación
  renovacion TEXT CHECK (renovacion IN ('solicitada','en_negociacion','no_renueva') OR renovacion IS NULL),
  firmado TEXT,                                  -- fecha de firma
  external_id TEXT, origen TEXT NOT NULL DEFAULT 'manual',
  actualizado TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_contratos_hab ON contratos(habitacion_id);
CREATE INDEX IF NOT EXISTS ix_contratos_inm ON contratos(inmueble_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_contratos_ext ON contratos(origen, external_id) WHERE external_id IS NOT NULL;

-- ---------- Pagos de inquilinos ----------
CREATE TABLE IF NOT EXISTS pagos (
  id INTEGER PRIMARY KEY,
  contrato_id INTEGER NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
  periodo TEXT NOT NULL,                         -- AAAA-MM
  concepto TEXT NOT NULL CHECK (concepto IN ('renta','servicios','fianza','otro')),
  importe INTEGER NOT NULL,
  vence TEXT NOT NULL,
  pagado_el TEXT,                                -- fecha en que quedó pagado del todo (NULL = no)
  cobrado INTEGER NOT NULL DEFAULT 0,            -- importe cobrado hasta ahora (permite pagos parciales)
  metodo TEXT,
  notas TEXT,
  external_id TEXT, origen TEXT NOT NULL DEFAULT 'manual',
  UNIQUE (contrato_id, periodo, concepto)
);
CREATE INDEX IF NOT EXISTS ix_pagos_periodo ON pagos(periodo);

-- ---------- Gastos ----------
CREATE TABLE IF NOT EXISTS gastos (
  id INTEGER PRIMARY KEY,
  inmueble_id INTEGER NOT NULL REFERENCES inmuebles(id) ON DELETE CASCADE,
  categoria TEXT NOT NULL CHECK (categoria IN ('alquiler','electricidad','agua','gas','internet','limpieza','mantenimiento','reparaciones','impuestos','seguros','comisiones','otros')),
  fecha TEXT NOT NULL,
  periodo TEXT NOT NULL,                         -- mes al que corresponde el gasto
  importe INTEGER NOT NULL,
  proveedor TEXT,
  descripcion TEXT,
  documento_id INTEGER REFERENCES documentos(id) ON DELETE SET NULL,
  recurrente_id INTEGER REFERENCES gastos_recurrentes(id) ON DELETE SET NULL,
  creado_por INTEGER REFERENCES usuarios(id),
  creado TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_gastos_inm_periodo ON gastos(inmueble_id, periodo);

-- Gastos fijos que se repiten cada mes (alquiler al propietario, internet...).
-- Cada mes la plataforma genera el gasto real a partir de esta plantilla.
CREATE TABLE IF NOT EXISTS gastos_recurrentes (
  id INTEGER PRIMARY KEY,
  inmueble_id INTEGER NOT NULL REFERENCES inmuebles(id) ON DELETE CASCADE,
  categoria TEXT NOT NULL,
  importe INTEGER NOT NULL,
  dia INTEGER NOT NULL DEFAULT 1,
  desde TEXT NOT NULL,                           -- AAAA-MM
  hasta TEXT,                                    -- AAAA-MM o NULL = indefinido
  proveedor TEXT,
  descripcion TEXT,
  activo INTEGER NOT NULL DEFAULT 1
);

-- ---------- Mantenimientos ----------
-- Su coste se suma AUTOMÁTICAMENTE a los gastos del inmueble (ver servicios/costes.js).
CREATE TABLE IF NOT EXISTS mantenimientos (
  id INTEGER PRIMARY KEY,
  inmueble_id INTEGER NOT NULL REFERENCES inmuebles(id) ON DELETE CASCADE,
  habitacion_id INTEGER REFERENCES habitaciones(id) ON DELETE SET NULL,
  zona TEXT,                                     -- cocina, baño, salón... si es zona común
  categoria TEXT NOT NULL CHECK (categoria IN ('mantenimiento','reparaciones')),
  tipo TEXT NOT NULL DEFAULT 'otros',            -- fontaneria, electricidad, plagas...
  descripcion TEXT NOT NULL,
  fecha TEXT NOT NULL,
  coste INTEGER NOT NULL DEFAULT 0,
  proveedor TEXT,
  estado TEXT NOT NULL CHECK (estado IN ('pendiente','en_curso','terminado','cancelado')),
  creado_por INTEGER REFERENCES usuarios(id),
  creado TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_mant_inm ON mantenimientos(inmueble_id, fecha);

-- ---------- Documentos (facturas, contratos...) ----------
-- El archivo se guarda fuera de la carpeta pública con un nombre aleatorio.
CREATE TABLE IF NOT EXISTS documentos (
  id INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL,
  archivo TEXT NOT NULL UNIQUE,
  tipo_mime TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  entidad TEXT NOT NULL CHECK (entidad IN ('mantenimiento','gasto','inmueble','contrato','incidencia')),
  entidad_id INTEGER NOT NULL,
  subido_por INTEGER REFERENCES usuarios(id),
  creado TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_docs_entidad ON documentos(entidad, entidad_id);

-- ---------- Auditoría ----------
CREATE TABLE IF NOT EXISTS auditoria (
  id INTEGER PRIMARY KEY,
  fecha TEXT NOT NULL DEFAULT (datetime('now')),
  usuario_id INTEGER,
  accion TEXT NOT NULL,
  entidad TEXT, entidad_id INTEGER,
  ip TEXT,
  detalle TEXT
);
CREATE INDEX IF NOT EXISTS ix_auditoria_fecha ON auditoria(fecha);

-- ---------- Integraciones (Homming, servidor propio...) ----------
CREATE TABLE IF NOT EXISTS integraciones (
  nombre TEXT PRIMARY KEY,
  activa INTEGER NOT NULL DEFAULT 0,
  config_cifrada TEXT,                           -- token y opciones, cifrados
  intervalo_min INTEGER NOT NULL DEFAULT 60,
  ultima_sync TEXT,
  ultimo_estado TEXT,                            -- ok | error | nunca
  ultimo_error TEXT,
  fallos_seguidos INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sincronizaciones (
  id INTEGER PRIMARY KEY,
  integracion TEXT NOT NULL,
  inicio TEXT NOT NULL DEFAULT (datetime('now')),
  fin TEXT,
  estado TEXT,
  resumen TEXT
);

CREATE TABLE IF NOT EXISTS ajustes (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);

-- ---------- Incidencias (tablero compartido del equipo) ----------
-- Lo que se reporta (avería, queja de convivencia, limpieza...). Si genera un
-- gasto, se enlaza a un mantenimiento y su coste va a los costes del piso.
CREATE TABLE IF NOT EXISTS incidencias (
  id INTEGER PRIMARY KEY,
  codigo TEXT,                                   -- INC-0042
  titulo TEXT NOT NULL,
  descripcion TEXT,
  inmueble_id INTEGER NOT NULL REFERENCES inmuebles(id) ON DELETE CASCADE,
  habitacion_id INTEGER REFERENCES habitaciones(id) ON DELETE SET NULL,
  zona TEXT,
  categoria TEXT NOT NULL,                       -- fontaneria, electricidad, limpieza, convivencia, seguridad, plagas, mantenimiento, otros
  prioridad TEXT NOT NULL CHECK (prioridad IN ('baja','media','alta','urgente')),
  estado TEXT NOT NULL CHECK (estado IN ('nueva','en_curso','esperando','resuelta')),
  origen TEXT NOT NULL DEFAULT 'equipo',         -- inquilino | propietario | equipo | revision
  reportado_por TEXT,                            -- texto libre: «Inquilino de H3», «Vecino 2ºB»...
  asignado_a INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  fecha_limite TEXT,
  mantenimiento_id INTEGER REFERENCES mantenimientos(id) ON DELETE SET NULL,
  creado TEXT NOT NULL DEFAULT (datetime('now')),
  actualizado TEXT NOT NULL DEFAULT (datetime('now')),
  resuelta_el TEXT
);
CREATE INDEX IF NOT EXISTS ix_incidencias_estado ON incidencias(estado, prioridad);
CREATE INDEX IF NOT EXISTS ix_incidencias_inm ON incidencias(inmueble_id);

CREATE TABLE IF NOT EXISTS incidencia_eventos (
  id INTEGER PRIMARY KEY,
  incidencia_id INTEGER NOT NULL REFERENCES incidencias(id) ON DELETE CASCADE,
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('comentario','cambio')),
  texto TEXT NOT NULL,
  creado TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_inc_eventos ON incidencia_eventos(incidencia_id, creado);

-- ---------- Ingresos manuales ----------
-- Dinero que entra y no es un recibo mensual: penalizaciones, cargos por daños
-- o llaves, reembolsos del seguro, estancias cortas, ventas de mobiliario...
-- Cuentan en los ingresos y beneficios del piso (o de la empresa si no hay piso).
CREATE TABLE IF NOT EXISTS ingresos (
  id INTEGER PRIMARY KEY,
  fecha TEXT NOT NULL,
  periodo TEXT NOT NULL,                         -- mes al que se imputa (AAAA-MM)
  pagador TEXT NOT NULL,                         -- persona o entidad que paga
  importe INTEGER NOT NULL,                      -- céntimos
  concepto TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'otros',            -- penalizacion | danos | seguro | estancia | venta | reserva | otros
  metodo TEXT,
  inmueble_id INTEGER REFERENCES inmuebles(id) ON DELETE SET NULL,
  habitacion_id INTEGER REFERENCES habitaciones(id) ON DELETE SET NULL,
  observaciones TEXT,
  creado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  creado TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_ingresos_periodo ON ingresos(periodo, inmueble_id);

-- ---------- Uso de la plataforma (estadísticas internas del equipo) ----------
-- Sesiones terminadas (por cierre, inactividad o caducidad) y apartados visitados.
-- Solo para el equipo: no sale a servicios externos.
CREATE TABLE IF NOT EXISTS uso_sesiones (
  id INTEGER PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  inicio INTEGER NOT NULL,                       -- milisegundos
  fin INTEGER NOT NULL,
  motivo TEXT                                    -- salida | inactividad | caducada
);
CREATE INDEX IF NOT EXISTS ix_uso_sesiones ON uso_sesiones(inicio, usuario_id);
CREATE TABLE IF NOT EXISTS uso_apartados (
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  fecha TEXT NOT NULL,                           -- AAAA-MM-DD
  apartado TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (usuario_id, fecha, apartado)
);
