/* ==========================================================================
   integraciones/homming.js — CONECTOR CON LA API DE HOMMING
   ---------------------------------------------------------------------------
   Lo que se sabe (noviembre 2026, ver docs/HOMMING.md):
   · Homming ofrece "API para integraciones" en sus planes de pago.
   · El token se genera en Homming → Ajustes de la cuenta → Conexiones, y solo
     se muestra una vez.
   · Tiene webhooks (avisos automáticos a una URL cuando pasa algo).
   · La lista de endpoints, el formato de los datos y los límites de uso NO son
     públicos: hay que pedírselos a Homming.

   Por eso este conector es CONFIGURABLE: la URL base, las rutas de cada recurso
   y el nombre de los campos se ajustan desde Administración → Integraciones o
   en MAPEO (abajo), sin tocar el resto de la plataforma. Si Homming falla, la
   plataforma sigue funcionando con los últimos datos guardados.
   ========================================================================== */
'use strict';
const almacen = require('./almacen');

const ORIGEN = 'homming';

// Configuración por defecto. ⚠ Rutas y campos PENDIENTES DE CONFIRMAR con la documentación oficial.
const CONFIG_DEFECTO = {
  baseUrl: '',                       // la facilita Homming junto con la documentación
  token: '',
  cabecera: 'Authorization',
  formato: 'Bearer {token}',
  rutas: { inmuebles: '/properties', unidades: '/units', contratos: '/contracts', pagos: '/payments' },
  paginacion: { parametro: 'page', tamano: 'per_page', porPagina: 100, maxPaginas: 50 },
  sincronizarPagos: false,
  webhookClave: ''
};

/* MAPEO: cómo se llaman los campos en las respuestas de Homming.
   Cada función recibe un objeto de Homming y devuelve el formato de ALKI.
   Se prueban varios nombres habituales; ajustarlos cuando haya documentación. */
const pick = (o, ...claves) => { for (const k of claves) { const v = k.split('.').reduce((x, p) => (x == null ? x : x[p]), o); if (v !== undefined && v !== null && v !== '') return v; } return null; };
const aCentimos = (v) => (v == null ? 0 : Math.round(Number(String(v).replace(',', '.')) * 100) || 0);
const aFecha = (v) => (v ? String(v).slice(0, 10) : null);
const ESTADOS = { active: 'activo', signed: 'activo', current: 'activo', reserved: 'reservado', pending: 'reservado', expired: 'finalizado', finished: 'finalizado', ended: 'finalizado', rescinded: 'rescindido', cancelled: 'rescindido', terminated: 'rescindido' };

const MAPEO = {
  inmueble: (o) => ({
    external_id: pick(o, 'id', 'uuid'),
    codigo: String(pick(o, 'reference', 'code', 'ref', 'alias', 'id')).replace(/\s+/g, ''),
    nombre: pick(o, 'name', 'title', 'alias', 'address.full', 'address'),
    direccion: typeof pick(o, 'address') === 'object' ? pick(o, 'address.street', 'address.full') : pick(o, 'address', 'street'),
    propietario: pick(o, 'owner.name', 'owner_name', 'landlord.name')
  }),
  unidad: (o) => ({
    external_id: pick(o, 'id', 'uuid'),
    inmueble_external_id: pick(o, 'property_id', 'propertyId', 'property.id', 'parent_id'),
    codigo: String(pick(o, 'reference', 'code', 'name', 'id')).toUpperCase(),
    precio: aCentimos(pick(o, 'price', 'rent', 'amount'))
  }),
  contrato: (o) => ({
    external_id: pick(o, 'id', 'uuid'),
    nombre: pick(o, 'name', 'title', 'reference'),
    inmueble_external_id: pick(o, 'property_id', 'propertyId', 'property.id'),
    unidad_external_id: pick(o, 'unit_id', 'unitId', 'unit.id', 'room_id'),
    inquilino: { external_id: pick(o, 'tenant.id', 'tenant_id', 'tenants.0.id'), nombre: pick(o, 'tenant.name', 'tenant_name', 'tenants.0.name') || 'Sin nombre',
      email: pick(o, 'tenant.email', 'tenants.0.email'), telefono: pick(o, 'tenant.phone', 'tenants.0.phone') },
    estado: ESTADOS[String(pick(o, 'status', 'state') || '').toLowerCase()] || 'finalizado',
    tipo: 'habitacion',
    inicio: aFecha(pick(o, 'start_date', 'startDate', 'start', 'date_start')),
    fin: aFecha(pick(o, 'end_date', 'endDate', 'end', 'date_end')),
    renta: aCentimos(pick(o, 'rent', 'amount', 'price', 'monthly_rent')),
    fianza: aCentimos(pick(o, 'deposit', 'bond', 'security_deposit'))
  }),
  pago: (o) => ({
    external_id: pick(o, 'id', 'uuid'),
    contrato_external_id: pick(o, 'contract_id', 'contractId', 'contract.id'),
    periodo: String(pick(o, 'period', 'due_date', 'dueDate', 'date') || '').slice(0, 7),
    concepto: 'renta',
    importe: aCentimos(pick(o, 'amount', 'total')),
    vence: aFecha(pick(o, 'due_date', 'dueDate', 'date')),
    pagado_el: aFecha(pick(o, 'paid_at', 'paidAt', 'payment_date'))
  })
};

// ---------- Cliente HTTP con tiempo límite y reintentos ----------
async function pedir(cfg, ruta, params = {}) {
  if (!/^https:\/\//.test(cfg.baseUrl)) throw new Error('La URL de la API debe empezar por https://');
  const url = new URL(cfg.baseUrl.replace(/\/$/, '') + ruta);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  for (let intento = 0; intento < 3; intento++) {
    const ctrl = AbortSignal.timeout(20000);
    let r;
    try {
      r = await fetch(url, { headers: { [cfg.cabecera]: cfg.formato.replace('{token}', cfg.token), Accept: 'application/json' }, signal: ctrl, redirect: 'error' });
    } catch (e) {
      if (intento === 2) throw new Error('No se pudo conectar con Homming: ' + (e.cause?.code || e.message));
      await new Promise((ok) => setTimeout(ok, 1000 * 2 ** intento));
      continue;
    }
    if (r.status === 429 || r.status >= 500) {
      // Límite de uso o fallo temporal: espera (respetando Retry-After) y reintenta
      const espera = Math.min(Number(r.headers.get('retry-after')) || 2 ** intento * 2, 30) * 1000;
      if (intento === 2) throw new Error('Homming respondió ' + r.status + ' (' + (r.status === 429 ? 'límite de uso' : 'error del servidor') + ')');
      await new Promise((ok) => setTimeout(ok, espera));
      continue;
    }
    if (r.status === 401 || r.status === 403) throw new Error('Homming rechazó el token (' + r.status + '). Genera uno nuevo en Homming → Ajustes → Conexiones.');
    if (!r.ok) throw new Error('Homming respondió ' + r.status + ' en ' + ruta);
    return r.json();
  }
}

// Recorre todas las páginas de un listado
async function listar(cfg, ruta) {
  const { parametro, tamano, porPagina, maxPaginas } = cfg.paginacion;
  const todos = [];
  for (let pag = 1; pag <= maxPaginas; pag++) {
    const datos = await pedir(cfg, ruta, { [parametro]: pag, [tamano]: porPagina });
    const lista = Array.isArray(datos) ? datos : datos.data || datos.items || datos.results || [];
    todos.push(...lista);
    const hayMas = !Array.isArray(datos) && (datos.next || datos.links?.next || (datos.meta && datos.meta.current_page < datos.meta.last_page));
    if (!hayMas && lista.length < porPagina) break;
    if (!lista.length) break;
  }
  return todos;
}

async function probar(cfg) {
  const datos = await pedir(cfg, cfg.rutas.inmuebles, { [cfg.paginacion.parametro]: 1, [cfg.paginacion.tamano]: 1 });
  const lista = Array.isArray(datos) ? datos : datos.data || datos.items || datos.results || [];
  return { ok: true, muestra: lista[0] ? Object.keys(lista[0]).slice(0, 30) : [] };
}

// ---------- Sincronización completa ----------
async function sincronizar(cfg, db) {
  // 1. Descargar todo ANTES de tocar la base de datos (si falla, no se cambia nada)
  const inmuebles = await listar(cfg, cfg.rutas.inmuebles);
  const unidades = cfg.rutas.unidades ? await listar(cfg, cfg.rutas.unidades) : [];
  const contratos = await listar(cfg, cfg.rutas.contratos);
  const pagos = cfg.sincronizarPagos && cfg.rutas.pagos ? await listar(cfg, cfg.rutas.pagos) : [];

  const res = { inmuebles: 0, habitaciones: 0, contratos: 0, pagos: 0, avisos: [] };
  // 2. Guardar todo en una única transacción
  db.transaccion(() => {
    const idInm = new Map(), idHab = new Map(), idCon = new Map();
    for (const o of inmuebles) {
      const m = MAPEO.inmueble(o);
      if (!m.external_id || !m.codigo) continue;
      idInm.set(String(m.external_id), almacen.inmueble({ ...m, origen: ORIGEN }).id); res.inmuebles++;
    }
    for (const o of unidades) {
      const m = MAPEO.unidad(o);
      const inm = idInm.get(String(m.inmueble_external_id));
      if (!inm || !m.codigo) continue;
      idHab.set(String(m.external_id), almacen.habitacion(inm, m.codigo, { precio: m.precio || null, external_id: m.external_id, origen: ORIGEN }).id); res.habitaciones++;
    }
    for (const o of contratos) {
      const m = MAPEO.contrato(o);
      const inm = idInm.get(String(m.inmueble_external_id));
      if (!inm || !m.inicio || !m.external_id) { if (res.avisos.length < 20) res.avisos.push('Contrato ' + (m.nombre || m.external_id) + ' sin inmueble o sin fecha; omitido.'); continue; }
      const q = almacen.inquilino({ ...m.inquilino, origen: ORIGEN });
      const c = almacen.contrato({ ...m, inmueble_id: inm, habitacion_id: idHab.get(String(m.unidad_external_id)) || null, inquilino_id: q, origen: ORIGEN });
      idCon.set(String(m.external_id), c.id); res.contratos++;
    }
    for (const o of pagos) {
      const m = MAPEO.pago(o);
      const c = idCon.get(String(m.contrato_external_id));
      if (!c || !/^\d{4}-\d{2}$/.test(m.periodo) || !m.vence) continue;
      almacen.pago({ ...m, contrato_id: c, origen: ORIGEN }); res.pagos++;
    }
  });
  return res;
}

module.exports = { nombre: 'homming', titulo: 'Homming', CONFIG_DEFECTO, MAPEO, probar, sincronizar };
