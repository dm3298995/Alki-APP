/* ==========================================================================
   data.js — DATOS DE ALKI E IMPORTADOR DE CSV
   --------------------------------------------------------------------------
   · Alki.importar(): lee los CSV que exporta el programa de gestión de ALKI
     (contratos e inquilinos) y construye la "base de datos" de la app:
     viviendas, habitaciones, contratos, inquilinos, propietarios y recibos.
   · Alki.seed(): datos iniciales = los pisos y contratos reales de ALKI con
     nombres inventados (demo-csv.js) + algunos ejemplos de incidencias,
     avisos y mensajes para enseñar la app.

   Cómo se cruzan los datos:
     Contrato "Llo3-H1" → piso Llo3 (código) → habitación H1
     Inmueble "025. Plaza de la Llotgeta 3 P2 (Llo3) - Rosa M."
               nº   dirección          código  propietario
     Inquilinos: el nombre del contrato se busca en el CSV de inquilinos
     para sacar correo, teléfono y solvencia (al día / con deuda).
   ========================================================================== */
window.Alki = window.Alki || {};

(function () {
  /* ---------- Utilidades de fecha (siempre en hora local) ---------- */
  function pad(n) { return String(n).padStart(2, '0'); }
  function fecha(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function sumarMeses(base, n, dia) { return new Date(base.getFullYear(), base.getMonth() + n, dia === undefined ? base.getDate() : dia); }
  function sumarDias(base, n) { const d = new Date(base); d.setDate(d.getDate() + n); return d; }
  function periodo(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1); }
  const aFecha = (iso) => new Date(iso + 'T00:00:00');
  Alki.fechas = { pad, fecha, sumarMeses, sumarDias, periodo, aFecha };

  /* ---------- Constantes de la empresa (de alki.es) ---------- */
  Alki.constantes = {
    empresa: 'Alki Rental Solutions, S.L.',
    contacto: { telefono: '+34 600 023 110', whatsapp: '34600023110', email: 'antonio@alki.es', horario: 'L–V de 9:00 a 19:00' },
    categorias: {
      fontaneria: 'Fontanería', electricidad: 'Electricidad', limpieza: 'Limpieza',
      convivencia: 'Convivencia', seguridad: 'Cerraduras y seguridad', plagas: 'Plagas',
      mantenimiento: 'Mantenimiento', otros: 'Otros'
    },
    zonas: { salon: 'Salón', cocina: 'Cocina', bano: 'Baño' },
    normas: [
      'Silencio de 23:00 a 8:00 entre semana y de 00:00 a 9:00 el fin de semana.',
      'No se permite fumar dentro de la vivienda, tampoco en las habitaciones.',
      'La cocina se deja limpia después de cada uso: platos fregados y encimera recogida.',
      'Cada residente saca la basura según el turno de la casa.',
      'Las visitas no pueden pasar la noche sin avisar antes a ALKI.',
      'Cualquier avería se comunica desde la app en cuanto se detecta.',
      'Las zonas comunes son de todos: no se dejan objetos personales en ellas.'
    ],
    serviciosIncluidos: ['Internet fibra', 'Agua', 'Luz', 'Limpieza de zonas comunes']
  };

  /* ---------- Catálogo de habitaciones de la demo (barrio, precio, cama) · ficticio ----------
     Formato de cada habitación: [precio, tipo, ancho de cama en cm] */
  Alki.catalogoWeb = {
    pal63: { barrio: "Extramurs", m2: 72, hab: { H1: [355, 'Individual', 105], H2: [355, 'Individual', 105], H3: [405, 'Individual', 135], H4: [355, 'Individual', 105] } },
    eix50: { barrio: "L'Eixample", m2: 73, hab: { H4: [390, 'Individual', 105] } },
    aza14: { barrio: "Russafa", m2: 95, hab: { H1: [325, 'Individual', 90], H2: [345, 'Individual', 135], H3: [345, 'Individual', 135], H4: [345, 'Individual', 90], H5: [380, 'Pareja', 135] } },
    xu4: { barrio: "Patraix", m2: 100, hab: { H1: [425, 'Individual', 135], H2: [460, 'Individual', 135], H3: [375, 'Individual', 105], H4: [445, 'Individual', 90], H5: [490, 'Individual', 135] } },
    tor46: { barrio: "Torrefiel", m2: 80, hab: { H1: [405, 'Individual', 90], H2: [405, 'Individual', 90], H3: [475, 'Individual', 135], H4: [435, 'Individual', 135] } },
    mst40: { barrio: "Mestalla", m2: 85, hab: { H1: [375, 'Individual', 135], H2: [455, 'Individual', 135], H3: [475, 'Individual', 135], H4: [490, 'Pareja', 135] } },
    mis28: { barrio: "Mislata", m2: 92, hab: { H1: [475, 'Pareja', 135], H2: [445, 'Individual', 135], H3: [475, 'Individual', 135], H4: [455, 'Individual', 105], H5: [475, 'Individual', 105] } },
    cor17: { barrio: "El Carme", m2: 87, hab: { H1: [460, 'Individual', 105], H2: [460, 'Individual', 135], H3: [505, 'Individual', 135], H4: [515, 'Individual', 135] } },
    pat71: { barrio: "Patraix", m2: 90, hab: { H1: [510, 'Individual', 135], H2: [475, 'Individual', 105], H3: [500, 'Individual', 135], H4: [445, 'Individual', 105], H5: [460, 'Individual', 135] } },
    ter9: { barrio: "Algirós", m2: 88, hab: { H1: [425, 'Individual', 150], H2: [430, 'Individual', 135], H3: [425, 'Individual', 135], H4: [360, 'Individual', 105] } },
    nar12: { barrio: "Campanar", m2: 74, hab: { H1: [440, 'Individual', 135], H2: [450, 'Individual', 135], H3: [450, 'Individual', 135], H4: [425, 'Individual', 105] } },
    orr2: { barrio: "Orriols", m2: 93, hab: { H1: [430, 'Individual', 135] } }
  };

  /* ======================================================================
     LECTOR DE CSV (separador ; o , y comillas)
     ====================================================================== */
  const limpiar = (s) => String(s || '').replace(/[​-‏‪-‮﻿]/g, '').replace(/\s+/g, ' ').trim();
  const normalizar = (s) => limpiar(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const slug = (s) => normalizar(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  function leerCSV(texto) {
    texto = String(texto || '').replace(/^﻿/, '');
    const primera = texto.split('\n')[0];
    const sep = (primera.match(/;/g) || []).length >= (primera.match(/,/g) || []).length ? ';' : ',';
    const filas = [];
    let fila = [], campo = '', comillas = false;
    for (let i = 0; i < texto.length; i++) {
      const ch = texto[i];
      if (comillas) {
        if (ch === '"') { if (texto[i + 1] === '"') { campo += '"'; i++; } else comillas = false; } else campo += ch;
      } else if (ch === '"') comillas = true;
      else if (ch === sep) { fila.push(campo); campo = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && texto[i + 1] === '\n') i++;
        fila.push(campo); filas.push(fila); fila = []; campo = '';
      } else campo += ch;
    }
    if (campo || fila.length) { fila.push(campo); filas.push(fila); }
    const utiles = filas.filter((f) => f.some((c) => limpiar(c)));
    const cabeceras = (utiles.shift() || []).map(normalizar);
    // Devuelve objetos { cabecera normalizada: valor }
    return {
      cabeceras,
      filas: utiles.map((f) => { const o = {}; cabeceras.forEach((c, n) => { o[c] = limpiar(f[n]); }); return o; })
    };
  }
  Alki.leerCSV = leerCSV;

  const numero = (s) => parseFloat(String(s || '0').replace(/\./g, '').replace(',', '.')) || 0;
  function fechaES(s) { // 31/03/2027 → 2027-03-31
    const m = String(s || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    return m ? m[3] + '-' + pad(m[2]) + '-' + pad(m[1]) : null;
  }
  const mesesEntre = (a, b) => { const x = aFecha(a), y = aFecha(b); return Math.max(1, Math.round((y - x) / (30.44 * 86400000))); };

  /* ---------- Plano automático según las habitaciones ----------
     4 columnas: primero las habitaciones y al final salón (doble), cocina y baño. */
  function planoAuto(unidades) {
    const piezas = unidades.map((u) => [u.toLowerCase(), unidades.length === 1 ? 2 : 1])
      .concat([['salon', 2], ['cocina', 1], ['bano', 1]]);
    const filas = [];
    let actual = [];
    piezas.forEach(function (p) {
      if (actual.length + p[1] > 4) { while (actual.length < 4) actual.push('.'); filas.push(actual.join(' ')); actual = []; }
      for (let n = 0; n < p[1]; n++) actual.push(p[0]);
    });
    if (actual.length) { while (actual.length < 4) actual.push('.'); filas.push(actual.join(' ')); }
    return filas;
  }
  const ordenNatural = (a, b) => (a === 'PISO') - (b === 'PISO') || a.localeCompare(b, 'es', { numeric: true });

  /* ======================================================================
     IMPORTAR: CSV de contratos + CSV de inquilinos → base de datos
     ====================================================================== */
  Alki.importar = function (textoContratos, textoInquilinos, opciones) {
    const o = opciones || {};
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const hoyISO = fecha(hoy);
    const avisos = []; // incoherencias que ALKI debería revisar
    const aviso = (tipo, texto) => avisos.push({ tipo, texto });

    let C = leerCSV(textoContratos), I = leerCSV(textoInquilinos);
    // Si los archivos vienen cambiados de orden, se corrigen solos
    if (!C.cabeceras.includes('inmueble') && I.cabeceras.includes('inmueble')) { const t = C; C = I; I = t; }
    const exigir = (tabla, cols, nombre) => cols.forEach((c) => {
      if (!tabla.cabeceras.includes(c)) throw new Error('El archivo de ' + nombre + ' no tiene la columna «' + c + '». ¿Es el CSV correcto?');
    });
    exigir(C, ['nombre del contrato', 'inmueble', 'inquilinos', 'estado', 'fecha de inicio', 'fecha de fin', 'importe de renta'], 'contratos');
    exigir(I, ['nombre', 'email'], 'inquilinos');

    /* --- Fichas de inquilinos (no se lee el documento de identidad) --- */
    const fichas = {};
    I.filas.forEach(function (r) {
      if (!r.nombre || /staff/i.test(r.referencia || '')) return;
      fichas[normalizar(r.nombre)] = {
        nombre: r.nombre, email: (r.email || '').toLowerCase(), telefono: r['telefono'] || '',
        referencia: r.referencia || '', solvencia: r.solvencia || 'pending', usada: false
      };
    });

    /* --- Filas de contrato --- */
    const filas = [];
    C.filas.forEach(function (r) {
      if (normalizar(r.estado) !== 'active') return;
      const inm = r.inmueble;
      if (/^0+\.0\b/.test(inm)) return; // contrato interno de ALKI
      const m = inm.match(/^(\d+)\.?\s+(.*?)\s*\(([^)]+)\)\s*-\s*(.+)$/);
      if (!m) { aviso('formato', 'No se ha podido leer el inmueble «' + inm + '» del contrato ' + r['nombre del contrato'] + '.'); return; }
      const inicio = fechaES(r['fecha de inicio']), fin = fechaES(r['fecha de fin']);
      if (!inicio || !fin) { aviso('formato', 'El contrato ' + r['nombre del contrato'] + ' no tiene fechas válidas.'); return; }
      filas.push({
        nombre: r['nombre del contrato'], num: m[1].padStart(3, '0'),
        direccion: m[2].replace(/,?\s*Valencia$/i, '').replace(/\s+,/g, ',').trim(),
        codigoInm: m[3].replace(/\s+/g, ''), propietario: m[4].trim(), inquilinos: r.inquilinos,
        tipo: r.tipo || 'rooms', inicio, fin, renta: numero(r['importe de renta']), fianza: numero(r.fianza)
      });
    });
    if (!filas.length) throw new Error('No se ha encontrado ningún contrato activo en el archivo.');

    /* --- Propietarios --- */
    const propietarios = {};
    function propietario(nombre) {
      const id = 'p-' + slug(nombre);
      if (!propietarios[id]) propietarios[id] = {
        id, nombre, telefono: '',
        email: slug(nombre).replace(/-/g, '.') + (o.demo ? '@demo.alki' : '@propietarios.alki')
      };
      return id;
    }

    /* --- Viviendas: se agrupan los contratos por número de inmueble --- */
    const porNum = {};
    filas.forEach((f) => { (porNum[f.num] = porNum[f.num] || []).push(f); });
    const viviendas = [], alias = {}; // alias: cualquier forma de escribir el código → vivienda
    Object.keys(porNum).sort().forEach(function (num) {
      const grupo = porNum[num];
      const f0 = grupo[0];
      const prefijos = grupo.filter((f) => f.nombre.includes('-')).map((f) => f.nombre.split('-')[0].trim());
      let codigo = prefijos.find((p) => normalizar(p) === normalizar(f0.codigoInm));
      if (!codigo && prefijos.length) {
        const cuenta = {};
        prefijos.forEach((p) => { cuenta[p] = (cuenta[p] || 0) + 1; });
        codigo = Object.keys(cuenta).sort((a, b) => cuenta[b] - cuenta[a])[0];
      }
      codigo = codigo || f0.codigoInm;
      const v = {
        id: 'v' + num, numero: num, codigo, alias: f0.direccion, direccion: f0.direccion, barrio: '', cp: '', m2: null,
        propietarioId: propietario(f0.propietario), rentaPropietario: null, contratoInicio: null, contratoFin: null,
        estadoGeneral: null, ultimaRevision: null, notaRevision: '', wifi: null, limpieza: null, plano: []
      };
      [codigo, f0.codigoInm].concat(prefijos).forEach((a) => { alias[normalizar(a)] = v.id; });
      const cat = Alki.catalogoWeb[normalizar(codigo)] || Alki.catalogoWeb[normalizar(f0.codigoInm)];
      if (cat) { v.barrio = cat.barrio; v.m2 = cat.m2; }
      v.catalogo = cat || null;
      viviendas.push(v);
    });
    const vivienda = (id) => viviendas.find((v) => v.id === id);

    /* --- Personas (inquilinos) --- */
    const personas = {};
    function persona(nombre) {
      const ficha = fichas[normalizar(nombre)];
      const id = 'i-' + slug(nombre);
      if (!personas[id]) {
        if (ficha) ficha.usada = true;
        const primero = slug(nombre).split('-')[0];
        personas[id] = {
          id, nombre: ficha ? ficha.nombre : nombre, email: ficha ? ficha.email : '', telefono: ficha ? ficha.telefono : '',
          referencia: ficha ? ficha.referencia : '', solvencia: ficha ? ficha.solvencia : 'pending',
          codigoReferido: 'ALKI-' + primero.toUpperCase().slice(0, 10), nacionalidad: ''
        };
        if (!ficha) aviso('ficha', 'No hay ficha de inquilino para «' + nombre + '» (aparece en un contrato).');
      }
      return personas[id];
    }
    function separar(texto) {
      if (fichas[normalizar(texto)]) return [texto];
      return texto.split(/\s*,\s*|\s+y\s+|\s*&\s*/).map(limpiar).filter(Boolean);
    }

    /* --- Habitaciones y contratos --- */
    const habitaciones = {}, contratos = [];
    filas.forEach(function (f) {
      const v = vivienda('v' + f.num);
      const nombres = separar(f.inquilinos);
      const gente = nombres.map(persona);
      // Unidad: "Llo3-H1" → H1. Si el contrato no la dice, se busca en la ficha del inquilino.
      let unidad = f.nombre.includes('-') ? f.nombre.split('-').slice(1).join('-').trim().toUpperCase() : '';
      if (!/^[HP]\d+$/.test(unidad)) {
        unidad = '';
        gente.forEach(function (p) {
          // Solo vale la pista si la ficha habla de ESTE piso ("Pal63 - H4") o el nombre la lleva ("Denys H1")
          const ref = (p.referencia || '').match(/([A-Za-z]{2,}\d+)\s*[-\s]?\s*H\s?(\d)\b/i);
          const enNombre = p.nombre.match(/\bH(\d)\b/);
          if (!unidad && ref && alias[normalizar(ref[1])] === v.id) unidad = 'H' + ref[2];
          if (!unidad && enNombre) unidad = 'H' + enNombre[1];
        });
        if (unidad) aviso('unidad', 'El contrato «' + f.nombre + '» de ' + v.codigo + ' no indica habitación: se ha asignado a ' + unidad + ' por la ficha de ' + gente[0].nombre + '.');
        else unidad = 'PISO';
      }
      const habId = v.id + '-' + unidad.toLowerCase();
      const cat = v.catalogo && v.catalogo.hab[unidad];
      if (!habitaciones[habId]) habitaciones[habId] = {
        id: habId, viviendaId: v.id, codigo: unidad === 'PISO' ? 'Piso' : unidad, area: unidad.toLowerCase(),
        precio: f.renta, servicios: 0, tipo: cat ? cat[1] : (unidad === 'PISO' ? 'Piso completo' : 'Individual'),
        cama: cat ? cat[2] : null, enReforma: false
      };
      let id = habId + '-' + f.inicio.replace(/-/g, '');
      while (contratos.some((c) => c.id === id)) id += 'b';
      const peor = gente.map((p) => p.solvencia).sort((a, b) => ['overdue', 'pending', 'up_to_date'].indexOf(a) - ['overdue', 'pending', 'up_to_date'].indexOf(b))[0];
      contratos.push({
        id, habitacionId: habId, inquilinoId: gente[0].id, cotitulares: gente.slice(1).map((p) => p.id), nombres: limpiar(f.inquilinos),
        tipo: f.tipo, inicio: f.inicio, fin: f.fin, duracionMeses: mesesEntre(f.inicio, f.fin),
        renta: f.renta, servicios: 0, fianza: f.fianza, estado: 'activo', solvencia: peor || 'pending', referenciaCSV: f.nombre
      });
      if (f.fin < hoyISO) aviso('fechas', 'El contrato ' + f.nombre + ' (' + limpiar(f.inquilinos) + ') terminó el ' + f.fin.split('-').reverse().join('/') + ' y sigue activo.');
    });
    // El precio de cada habitación es el de su contrato más reciente
    contratos.slice().sort((a, b) => (a.inicio > b.inicio ? 1 : -1)).forEach((c) => { habitaciones[c.habitacionId].precio = c.renta; });
    // Habitaciones de la web que no tienen contrato → libres
    viviendas.forEach(function (v) {
      if (!v.catalogo) return;
      Object.keys(v.catalogo.hab).forEach(function (u) {
        const habId = v.id + '-' + u.toLowerCase();
        if (habitaciones[habId]) return;
        const c = v.catalogo.hab[u];
        habitaciones[habId] = { id: habId, viviendaId: v.id, codigo: u, area: u.toLowerCase(), precio: c[0], servicios: 0, tipo: c[1], cama: c[2], enReforma: false };
      });
    });
    viviendas.forEach(function (v) {
      const unidades = Object.values(habitaciones).filter((h) => h.viviendaId === v.id).map((h) => h.area.toUpperCase()).sort(ordenNatural);
      v.plano = planoAuto(unidades.map((u) => u.toLowerCase()).map((u) => u.toUpperCase()));
      delete v.catalogo;
    });

    /* --- Comprobaciones de coherencia --- */
    const porHab = {};
    contratos.forEach((c) => { (porHab[c.habitacionId] = porHab[c.habitacionId] || []).push(c); });
    Object.keys(porHab).forEach(function (h) {
      const lista = porHab[h];
      if (lista.length < 2) return;
      const hab = habitaciones[h], v = vivienda(hab.viviendaId);
      aviso('duplicado', v.codigo + '-' + hab.codigo + ' tiene ' + lista.length + ' contratos activos a la vez: ' + lista.map((c) => c.nombres + ' (desde ' + c.inicio.split('-').reverse().join('/') + ')').join(' y ') + '.');
    });
    contratos.forEach(function (c) {
      const hab = habitaciones[c.habitacionId], v = vivienda(hab.viviendaId);
      [c.inquilinoId].concat(c.cotitulares).forEach(function (pid) {
        const p = personas[pid];
        const m = (p.referencia || '').match(/([A-Za-z]{2,}\d+)\s*[-\s]?\s*([HP]\d)\b/i);
        if (!m) return;
        const vRef = alias[normalizar(m[1])];
        if (!vRef) return;
        if (vRef !== v.id || m[2].toUpperCase() !== hab.codigo.toUpperCase()) {
          aviso('referencia', 'La ficha de ' + p.nombre + ' dice «' + m[1] + ' ' + m[2].toUpperCase() + '», pero su contrato es ' + v.codigo + '-' + hab.codigo + '.');
        }
      });
    });
    Object.values(fichas).forEach((f) => { if (!f.usada) aviso('sin-contrato', f.nombre + ' está en el archivo de inquilinos pero no tiene contrato activo.'); });
    const porEmail = {};
    Object.values(personas).forEach((p) => { if (p.email) (porEmail[p.email] = porEmail[p.email] || []).push(p.nombre); });
    Object.keys(porEmail).forEach((e) => { if (porEmail[e].length > 1) aviso('correo', porEmail[e].join(' y ') + ' comparten el correo ' + e + ': en la app solo podrá entrar el primero.'); });

    /* --- Recibos ----------------------------------------------------------
       Un recibo por cada mes desde el inicio del contrato hasta el mes actual.
       La columna "Solvencia" decide qué está pagado:
         up_to_date → todo pagado · pending → falta el mes actual
         overdue    → falta el mes anterior y el actual */
    const pagos = [];
    contratos.forEach(function (c) {
      const inicio = aFecha(c.inicio);
      if (c.fianza > 0) pagos.push({ id: c.id + '|fianza', contratoId: c.id, periodo: c.inicio.slice(0, 7), concepto: 'Fianza', importe: c.fianza, vence: c.inicio, pagadoEl: c.inicio, metodo: 'Transferencia' });
      const desde = -Math.min(36, (hoy.getFullYear() - inicio.getFullYear()) * 12 + hoy.getMonth() - inicio.getMonth());
      for (let n = desde; n <= 0; n++) {
        const mes = sumarMeses(hoy, n, 1);
        if (sumarMeses(mes, 1, 0) < inicio) continue; // el contrato aún no había empezado
        if (aFecha(c.fin) < mes) continue;
        const per = periodo(mes);
        let vence = fecha(sumarMeses(hoy, n, 5));
        if (per === c.inicio.slice(0, 7) && c.inicio > vence) vence = c.inicio;
        let pagado = true;
        if (c.solvencia === 'pending' && n === 0) pagado = false;
        if (c.solvencia === 'overdue' && n >= -1) pagado = false;
        pagos.push({
          id: c.id + '|' + per, contratoId: c.id, periodo: per, concepto: 'Renta (gastos incluidos)', importe: c.renta, vence,
          pagadoEl: pagado ? (vence <= hoyISO ? vence : hoyISO) : null, metodo: pagado ? 'Transferencia' : null
        });
      }
    });

    /* --- Usuarios para entrar en la app ---
       Nadie tiene contraseña al principio (clave: null). La primera vez que
       alguien entra con su correo, la app le pide que se cree una. */
    const usuarios = [{ email: 'equipo@alki.es', clave: null, rol: 'admin', refId: null, nombre: 'Equipo ALKI' }];
    Object.values(propietarios).forEach((p) => usuarios.push({ email: p.email, clave: null, rol: 'propietario', refId: p.id, nombre: p.nombre }));
    Object.values(personas).forEach((p) => usuarios.push({ email: p.email || null, clave: null, rol: 'inquilino', refId: p.id, nombre: p.nombre }));

    return {
      version: 3, origen: o.demo ? 'demo' : 'real', importado: hoyISO,
      propietarios: Object.values(propietarios), viviendas, habitaciones: Object.values(habitaciones),
      inquilinos: Object.values(personas), contratos, pagos, usuarios, avisosDatos: avisos,
      incidencias: [], reformas: [], avisos: [], referidos: [], mensajes: [], solicitudes: [], documentos: [],
      social: [{ id: 'post-bienvenida', autorRol: 'admin', autorId: null, viviendaId: null, fotos: [], likes: [], comentarios: [], fecha: hoy.toISOString(),
        texto: '¡Bienvenidos a ALKI Social! Este es el espacio de la comunidad: presentaos, organizad planes, compartid recomendaciones del barrio o buscad compañero para ir al gimnasio. Recordad ser respetuosos.' }]
    };
  };

  /* ======================================================================
     SEED: pisos reales con nombres inventados + ejemplos para la demo
     ====================================================================== */
  Alki.seed = function () {
    const db = Alki.importar(Alki.demoCSV.contratos, Alki.demoCSV.inquilinos, { demo: true });
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const D = (n) => fecha(sumarDias(hoy, n));
    const M = (n, dia) => fecha(sumarMeses(hoy, n, dia));

    // Inquilino de demo (Eix50-H1, cuenta de prueba) y su casa
    const lucia = db.inquilinos.find((i) => i.email === 'lucia@demo.alki') || db.inquilinos[0];
    const cLucia = db.contratos.find((c) => c.inquilinoId === lucia.id);
    const hLucia = db.habitaciones.find((h) => h.id === cLucia.habitacionId);
    const vLucia = db.viviendas.find((v) => v.id === hLucia.viviendaId);
    Object.assign(vLucia, { wifi: { red: 'ALKI-' + vLucia.codigo, clave: 'alki-' + vLucia.codigo.toLowerCase() + '-2026' }, limpieza: 'Martes por la mañana', estadoGeneral: 'bueno', ultimaRevision: M(-1, 12), notaRevision: 'Vivienda en buen estado. Se revisó la caldera.' });

    // Propietaria de demo (Carmen Soler): datos de ejemplo de su contrato con ALKI
    const carmen = db.propietarios.find((p) => p.nombre === 'Carmen Soler') || db.propietarios[0];
    const vCarmen = db.viviendas.filter((v) => v.propietarioId === carmen.id);
    vCarmen.forEach(function (v, n) {
      Object.assign(v, {
        rentaPropietario: n === 0 ? 1450 : 900, contratoInicio: M(-14, 1), contratoFin: M(22, 0),
        estadoGeneral: n === 0 ? 'bueno' : 'atencion', ultimaRevision: M(-1, 20 - n * 5),
        notaRevision: n === 0 ? 'Sin incidencias estructurales. Pintura en buen estado.' : 'Hay que revisar la persiana del salón y el sellado de la ducha.',
        wifi: { red: 'ALKI-' + v.codigo, clave: 'alki-' + v.codigo.toLowerCase() }, limpieza: 'Jueves por la mañana'
      });
    });
    const vOtra = db.viviendas.find((v) => v.id !== vLucia.id && !vCarmen.includes(v));

    const historial = (pasos) => pasos.map((p) => ({ fecha: D(p[0]), estado: p[1], texto: p[2] }));
    const inc = (o) => Object.assign({ habitacionId: null, inquilinoId: null, proveedor: '', coste: 0, foto: null, visiblePropietario: true }, o);
    db.incidencias = [
      inc({ id: 'in1', viviendaId: vLucia.id, habitacionId: hLucia.id, inquilinoId: lucia.id, categoria: 'seguridad', titulo: 'La cerradura de mi habitación se atasca', prioridad: 'media', estado: 'en_curso', creada: D(-3), descripcion: 'Cuesta mucho girar la llave y a veces no abre a la primera.', proveedor: 'Cerrajería Centro', historial: historial([[-3, 'abierta', 'Incidencia recibida.'], [-2, 'en_curso', 'El cerrajero pasará el jueves por la tarde para cambiar el bombín.']]) }),
      inc({ id: 'in2', viviendaId: vLucia.id, inquilinoId: lucia.id, categoria: 'fontaneria', titulo: 'El calentador no da agua caliente', prioridad: 'alta', estado: 'resuelta', creada: D(-40), descripcion: 'El agua sale fría en la ducha y en la cocina.', proveedor: 'Fontanería Turia', coste: 85, historial: historial([[-40, 'abierta', 'Incidencia recibida.'], [-39, 'en_curso', 'Fontanería Turia irá mañana entre 9:00 y 11:00.'], [-38, 'resuelta', 'Se cambió el termopar. Funciona correctamente.']]) }),
      inc({ id: 'in3', viviendaId: vCarmen[0].id, categoria: 'plagas', titulo: 'Cucarachas en la cocina', prioridad: 'alta', estado: 'resuelta', creada: D(-25), descripcion: 'Se han visto cucarachas por la noche junto al fregadero.', proveedor: 'Control de Plagas Levante', coste: 120, historial: historial([[-25, 'abierta', 'Incidencia recibida.'], [-21, 'resuelta', 'Tratamiento aplicado. Revisión en 30 días incluida.']]) }),
      inc({ id: 'in4', viviendaId: (vCarmen[1] || vCarmen[0]).id, categoria: 'mantenimiento', titulo: 'La persiana del salón no sube', prioridad: 'baja', estado: 'abierta', creada: D(-6), descripcion: 'La cinta se ha soltado y la persiana se ha quedado bajada.', historial: historial([[-6, 'abierta', 'Incidencia recibida.']]) }),
      inc({ id: 'in5', viviendaId: vOtra.id, categoria: 'electricidad', titulo: 'Salta el diferencial al usar el horno', prioridad: 'urgente', estado: 'abierta', creada: D(0), descripcion: 'Cada vez que se enciende el horno se va la luz de toda la casa.', historial: historial([[0, 'abierta', 'Incidencia recibida.']]) }),
      inc({ id: 'in6', viviendaId: vLucia.id, categoria: 'convivencia', titulo: 'Ruido en el salón por las noches', prioridad: 'baja', estado: 'abierta', creada: D(-1), descripcion: 'Varias noches seguidas hay música alta después de las 00:00.', visiblePropietario: false, historial: historial([[-1, 'abierta', 'Incidencia recibida.']]) })
    ];
    db.reformas = [{
      id: 'r1', viviendaId: vCarmen[0].id, titulo: 'Pintura de zonas comunes', proveedor: 'Reformas Llum', estado: 'completada',
      inicio: M(-3, 10), finPrevisto: M(-3, 14), coste: 640,
      pasos: [{ texto: 'Proteger suelos y muebles', hecho: true }, { texto: 'Pintar salón y pasillo', hecho: true }, { texto: 'Pintar cocina con pintura antihumedad', hecho: true }]
    }];
    db.avisos = [
      { id: 'a1', viviendaId: vLucia.id, fecha: D(-1), titulo: 'Corte de agua el jueves de 9:00 a 12:00', texto: 'La comunidad revisa las tuberías del edificio.' },
      { id: 'a2', viviendaId: null, fecha: D(-2), titulo: 'Recomienda ALKI y gana 30 €', texto: 'Si alguien que recomiendas alquila al menos 6 meses, te llevas 30 €.' }
    ];
    db.referidos = [{ id: 'rf1', embajadorId: lucia.id, nombre: 'Marta G.', contacto: 'marta@ejemplo.com', estado: 'firmado', fecha: D(-20) }];
    // ALKI Social: algunas publicaciones de ejemplo
    const hace = (h) => new Date(Date.now() - h * 3600000).toISOString();
    const vecinos = db.contratos.filter((c) => c.inquilinoId !== lucia.id).slice(0, 40);
    const deCasa = db.contratos.filter((c) => c.habitacionId !== hLucia.id && db.habitaciones.find((h) => h.id === c.habitacionId).viviendaId === vLucia.id);
    const autor = (c) => ({ autorRol: 'inquilino', autorId: c.inquilinoId });
    const k = (c) => 'inquilino:' + c.inquilinoId;
    db.social = [
      Object.assign({ id: 'post-1', viviendaId: null, fotos: [], fecha: hace(2), texto: '¿Alguien se apunta el sábado a ver el atardecer en la Malvarrosa? Llevo altavoz 🌅', likes: [k(vecinos[3]), k(vecinos[8]), 'inquilino:' + lucia.id],
        comentarios: [{ id: 'c1', autorRol: 'inquilino', autorId: vecinos[8].inquilinoId, texto: '¡Yo voy! ¿A qué hora?', fecha: hace(1.5) }, { id: 'c2', autorRol: 'inquilino', autorId: vecinos[0].inquilinoId, texto: 'Sobre las 19:00 en la parada del tranvía.', fecha: hace(1) }] }, autor(vecinos[0])),
      Object.assign({ id: 'post-2', viviendaId: vLucia.id, fotos: [], fecha: hace(20), texto: 'Recordatorio para la casa: el jueves no hay agua de 9:00 a 12:00. Llenad alguna botella la noche antes 💧', likes: ['inquilino:' + lucia.id], comentarios: [] }, autor(deCasa[0] || vecinos[1])),
      Object.assign({ id: 'post-3', viviendaId: null, fotos: [], fecha: hace(30), texto: 'Recomendación: el horno de Benimaclet abre a las 7:00 y tiene el mejor pan de la zona. ¿Otros sitios buenos cerca de vuestros pisos?', likes: [k(vecinos[5])],
        comentarios: [{ id: 'c3', autorRol: 'inquilino', autorId: vecinos[12].inquilinoId, texto: 'En Ruzafa, el mercado los sábados por la mañana 👌', fecha: hace(26) }] }, autor(vecinos[10])),
      { id: 'post-4', autorRol: 'admin', autorId: null, viviendaId: null, fotos: [], likes: [k(vecinos[2]), k(vecinos[4])], comentarios: [], fecha: hace(50),
        texto: 'Recomienda ALKI a un amigo: si alquila al menos 6 meses, te llevas 30 €. Tu código está en Embajadores 🎁' }
    ].concat(db.social);

    db.mensajes = [
      { id: 'm1', hilo: carmen.id, de: 'alki', fecha: D(-5), texto: 'Hola Carmen, ya tienes en Documentos el informe de la última revisión. Todo en orden.' },
      { id: 'm2', hilo: carmen.id, de: carmen.id, fecha: D(-4), texto: 'Perfecto, muchas gracias.' }
    ];
    return db;
  };
})();
