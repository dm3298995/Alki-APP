/* ==========================================================================
   permisos.js — ACCESOS POR PESTAÑA Y POR PERSONA
   · Cada pestaña de la plataforma tiene su permiso de «ver» y, si se puede
     modificar algo en ella, de «editar» (editar incluye ver).
   · Cada usuario tiene un ROL que da unos permisos de partida (plantilla).
     El administrador puede ajustar los permisos de cada persona una a una.
   · El rol Administrador (el encargado / creador) tiene SIEMPRE todo y es el
     único que puede dar permisos de administración.
   · El servidor comprueba el permiso en CADA petición: ocultar un botón en la
     pantalla no basta.
   ========================================================================== */
'use strict';

// Pestañas de la plataforma: [clave, nombre, acciones posibles, descripción, grupo]
// grupo 'finanzas' = información económica sensible (se puede quitar de golpe)
const SECCIONES = [
  ['panel', 'Panel', ['ver'], 'Resumen del día, próximas salidas y alertas', 'gestion'],
  ['incidencias', 'Incidencias', ['ver', 'editar'], 'Ver el tablero / crear, comentar, asignar y cerrar incidencias', 'gestion'],
  ['inmuebles', 'Inmuebles', ['ver', 'editar'], 'Fichas de los pisos / crear y modificar pisos', 'gestion'],
  ['habitaciones', 'Habitaciones', ['ver', 'editar'], 'Estado de las habitaciones / crear, modificar y bloquear', 'gestion'],
  ['contratos', 'Contratos', ['ver', 'editar'], 'Historial y documentos / crear, renovar y finalizar contratos', 'gestion'],
  ['mantenimientos', 'Mantenimientos', ['ver', 'editar'], 'Trabajos y reparaciones / registrar y actualizar', 'gestion'],
  ['estadisticas', 'Estadísticas', ['ver'], 'Gráficos de ocupación (y de cobros y gastos si tiene esos permisos)', 'gestion'],
  ['ingresos', 'Ingresos', ['ver', 'editar'], 'Historial de ingresos / registrar ingresos manuales', 'finanzas'],
  ['pagos', 'Cobros (recibos de inquilinos)', ['ver', 'editar'], 'Recibos, cobros y atrasos / registrar cobros', 'finanzas'],
  ['gastos', 'Gastos y costes', ['ver', 'editar'], 'Costes de cada piso / registrar e importar gastos y suministros', 'finanzas'],
  ['facturas', 'Facturas', ['ver'], 'Ver y descargar las facturas de gastos y mantenimientos', 'finanzas'],
  ['rentabilidad', 'Beneficios y rentabilidad', ['ver', 'editar'], 'Beneficio de cada piso y calculadora / cambiar impuestos y gastos generales', 'finanzas']
];

// Permisos especiales (no son una pestaña)
const ESPECIALES = {
  'inquilinos.ver': 'Ver nombre, correo y teléfono de los inquilinos (datos personales)',
  'admin.importar': 'Importar datos (CSV de Homming o de gastos) y lanzar sincronizaciones',
  'admin.auditoria': 'Consultar el registro de actividad',
  'admin.integraciones': 'Configurar integraciones, ajustes y copias de seguridad',
  'admin.usuarios': 'Gestionar usuarios y sus permisos'
};

const PERMISOS = {};
for (const [k, n, acciones, d] of SECCIONES) for (const a of acciones) PERMISOS[k + '.' + a] = n + ' · ' + (a === 'ver' ? 'ver' : 'editar') + ' — ' + d;
Object.assign(PERMISOS, ESPECIALES);
const TODOS = Object.keys(PERMISOS);
// Permisos que solo un Administrador puede conceder
const SOLO_ADMIN = ['admin.usuarios', 'admin.integraciones'];

const ver = (...s) => s.map((x) => x + '.ver');
const editar = (...s) => s.flatMap((x) => [x + '.ver', x + '.editar']);

// Plantillas de cada rol (punto de partida; se pueden ajustar por persona)
const ROLES = {
  admin: { nombre: 'Administrador', descripcion: 'Encargado de la plataforma: acceso total y control de permisos', permisos: TODOS },
  direccion: {
    nombre: 'Dirección', descripcion: 'Ve y modifica todo el negocio; no gestiona usuarios',
    permisos: [...ver('panel', 'estadisticas', 'facturas'), ...editar('incidencias', 'inmuebles', 'habitaciones', 'contratos', 'ingresos', 'pagos', 'gastos', 'rentabilidad', 'mantenimientos'), 'inquilinos.ver', 'admin.importar', 'admin.auditoria']
  },
  gestion: {
    nombre: 'Gestión', descripcion: 'Día a día: contratos, cobros, gastos e incidencias',
    permisos: [...ver('panel', 'estadisticas', 'rentabilidad', 'facturas'), ...editar('incidencias', 'inmuebles', 'habitaciones', 'contratos', 'ingresos', 'pagos', 'gastos', 'mantenimientos'), 'inquilinos.ver', 'admin.importar']
  },
  operativo: {
    nombre: 'Personal operativo', descripcion: 'Incidencias y mantenimientos en los pisos',
    permisos: [...ver('panel', 'inmuebles', 'habitaciones'), ...editar('incidencias', 'mantenimientos')]
  }
};

// Roles que están obligados a usar autenticación multifactor
const MFA_OBLIGATORIO = ['admin', 'direccion'];

// Permisos que tiene de verdad un usuario (rol o ajuste personal; editar ⇒ ver)
function efectivos(usuario) {
  if (!usuario) return [];
  if (usuario.rol === 'admin') return TODOS;
  let lista = ROLES[usuario.rol]?.permisos || [];
  if (usuario.permisos) { try { lista = JSON.parse(usuario.permisos); } catch { /* ajuste dañado: se usa el rol */ } }
  const s = new Set(lista.filter((p) => PERMISOS[p]));
  for (const p of [...s]) if (p.endsWith('.editar')) s.add(p.replace('.editar', '.ver'));
  return TODOS.filter((p) => s.has(p));
}

const tiene = (usuario, permiso) => efectivos(usuario).includes(permiso);
const tieneAlguno = (usuario, lista) => lista.some((p) => tiene(usuario, p));

// Permisos financieros (para quitarlos todos de golpe)
const FINANCIEROS = SECCIONES.filter((x) => x[4] === 'finanzas').flatMap(([k, , a]) => a.map((x) => k + '.' + x));

module.exports = { FINANCIEROS, SECCIONES, ESPECIALES, PERMISOS, TODOS, SOLO_ADMIN, ROLES, MFA_OBLIGATORIO, efectivos, tiene, tieneAlguno };
