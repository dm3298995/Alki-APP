/* ==========================================================================
   scripts/demo.js — DEMOSTRACIÓN REALISTA DE ALKI (datos 100 % ficticios)
   --------------------------------------------------------------------------
   Simula una empresa de alquiler de habitaciones en Valencia que gestiona
   26 pisos desde 2022. Todo sale de UNA simulación coherente:
     · Cada habitación tiene una cadena de contratos desde que el piso entró
       en la cartera hasta hoy (con huecos entre inquilinos, renovaciones y
       salidas anticipadas) y, a veces, el contrato siguiente ya firmado.
     · Cada contrato genera sus recibos (renta + servicios, con prorrateo del
       primer y último mes) y cada inquilino tiene su forma de pagar.
     · Luz, agua y gas dependen de cuánta gente vivía en el piso ese mes y de
       la estación; la limpieza, de las semanas del mes; el alquiler al
       propietario sube con el IPC cada año.
     · Los mantenimientos aparecen de forma irregular y algunos están ligados
       a hechos concretos (limpieza a fondo tras una salida, una fuga que
       dispara la factura del agua...).
   Nombres, direcciones, teléfonos y correos son INVENTADOS. Los correos usan
   el dominio reservado example.com y los teléfonos van enmascarados.

   Uso:  npm run demo            (con la base de datos vacía)
         npm run demo -- --forzar (borra los datos de negocio y regenera)
   No se puede ejecutar en producción.
   ========================================================================== */
'use strict';
process.removeAllListeners('warning');
const fs = require('node:fs');
const path = require('node:path');
const config = require('../config');
if (config.produccion) { console.error('No se cargan datos de demostración en producción.'); process.exit(1); }
const db = require('../db');
const { hashClave, tokenAleatorio } = require('../seguridad/cifrado');
const costes = require('../servicios/costes');
const { hoyISO } = require('../servicios/ocupacion');

const forzar = process.argv.includes('--forzar');
if (db.uno('SELECT 1 FROM inmuebles LIMIT 1') && !forzar) {
  console.error('La base de datos ya tiene inmuebles. Usa  npm run demo -- --forzar  para borrarlos y generar la demo.');
  process.exit(1);
}

// ---------- Azar con semilla: la demo sale siempre igual ----------
let semilla = 26112026;
const azar = () => ((semilla = (semilla * 1664525 + 1013904223) % 4294967296) / 4294967296);
const entre = (a, b) => Math.floor(a + azar() * (b - a + 1));
const real = (a, b) => a + azar() * (b - a);
const elegir = (l) => l[Math.floor(azar() * l.length)];
const prob = (p) => azar() < p;
const barajar = (l) => { const a = [...l]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(azar() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const cent = (euros) => Math.round(euros * 100);

// ---------- Fechas (cadenas AAAA-MM-DD, en UTC) ----------
const D = (iso) => Date.parse(iso + 'T12:00:00Z');
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const masDias = (f, n) => iso(D(f) + n * 86400000);
const masMeses = (f, n) => { const d = new Date(D(f)); const dia = d.getUTCDate(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n); const ult = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate(); d.setUTCDate(Math.min(dia, ult)); return iso(d.getTime()); };
const dias = (a, b) => Math.round((D(b) - D(a)) / 86400000);
const diasMes = (p) => new Date(Date.UTC(+p.slice(0, 4), +p.slice(5, 7), 0)).getUTCDate();
const HOY = hoyISO();
const MES_HOY = HOY.slice(0, 7);

// ===================================================================
// 1. CARTERA: 26 pisos en barrios de Valencia (direcciones inventadas)
// ===================================================================
// [código, calle, número, planta, barrio, habitaciones, m², desde (alta en ALKI), gas, antigüedad]
const PISOS = [
  ['Aza14', 'Calle del Azahar', 14, '3ª, pta. 7', 'Russafa', 5, 104, '2022-09-01', true, 'antiguo'],
  ['Bru31', 'Calle de la Brújula', 31, '2ª, pta. 4', 'Russafa', 4, 88, '2022-10-15', false, 'reformado'],
  ['Mag8', 'Calle del Magraner', 8, '5ª, pta. 10', 'Benimaclet', 5, 96, '2022-09-01', true, 'antiguo'],
  ['Sor22', 'Calle de la Sorolla Vella', 22, '1ª, pta. 2', 'Benimaclet', 4, 82, '2023-01-10', false, 'medio'],
  ['Cam56', 'Avenida del Campus', 56, '7ª, pta. 27', 'Algirós', 6, 118, '2022-09-01', false, 'medio'],
  ['Ter9', 'Calle de les Tendes', 9, '4ª, pta. 8', 'Algirós', 4, 85, '2023-08-25', false, 'reformado'],
  ['Mst40', 'Calle Mestre Llorenç', 40, '6ª, pta. 23', 'Mestalla', 5, 100, '2023-02-01', true, 'medio'],
  ['Llo3', 'Plaza de la Llotgeta', 3, '2ª', 'El Carme', 3, 70, '2023-03-15', false, 'antiguo'],
  ['Cor17', 'Calle de les Corretgeries', 17, '3ª, pta. 6', 'El Carme', 4, 90, '2024-01-08', false, 'reformado'],
  ['Ang25', 'Calle del Àngel Custodi', 25, '8ª, pta. 31', 'Extramurs', 5, 108, '2023-05-02', true, 'medio'],
  ['Pal63', 'Calle del Palleter Nou', 63, '4ª, pta. 14', 'Extramurs', 4, 86, '2024-04-01', false, 'medio'],
  ['Nar12', 'Calle dels Tarongers Vells', 12, '9ª, pta. 36', 'Campanar', 4, 92, '2023-09-01', false, 'reformado'],
  ['Pat71', 'Avenida del Patraix Antic', 71, '5ª, pta. 19', 'Patraix', 5, 101, '2023-06-12', true, 'medio'],
  ['Xu4', 'Calle del Xúquer Alt', 4, '1ª', 'Patraix', 3, 68, '2024-09-01', false, 'antiguo'],
  ['Mar88', 'Calle de la Mar Xica', 88, '2ª', 'Cabanyal', 4, 84, '2023-10-02', false, 'antiguo'],
  ['Bar5', 'Calle de les Barques Blaves', 5, '3ª, pta. 9', 'Cabanyal', 5, 95, '2024-06-03', true, 'medio'],
  ['Mll33', 'Calle del Molí de Malilla', 33, '6ª, pta. 24', 'Malilla', 4, 87, '2024-02-15', false, 'reformado'],
  ['Arb19', 'Avenida dels Arbres', 19, '10ª, pta. 39', 'Quatre Carreres', 6, 125, '2023-04-03', false, 'reformado'],
  ['Hor7', 'Calle de l’Horta Nord', 7, '4ª, pta. 13', 'Benicalap', 4, 83, '2024-10-01', false, 'medio'],
  ['Tor46', 'Calle de la Torre Vella', 46, '2ª, pta. 5', 'Torrefiel', 3, 72, '2025-01-13', false, 'antiguo'],
  ['Orr2', 'Calle de les Orriolenques', 2, '5ª, pta. 18', 'Orriols', 4, 80, '2025-03-03', true, 'medio'],
  ['Mis28', 'Avenida del Sud', 28, '3ª, pta. 11', 'Mislata', 5, 98, '2024-07-15', false, 'medio'],
  ['Bur15', 'Calle del Campus Burjassot', 15, '1ª, pta. 3', 'Burjassot', 5, 97, '2023-09-01', false, 'medio'],
  ['Eix50', 'Calle del Gran Eixample', 50, '7ª, pta. 28', "L'Eixample", 7, 150, '2025-05-05', true, 'reformado'],
  ['Gra11', 'Calle dels Camins Verds', 11, '6ª, pta. 22', 'Camins al Grau', 4, 89, '2025-09-01', false, 'reformado'],
  ['Tri36', 'Calle de la Trinitat Nova', 36, '3ª, pta. 10', 'Trinitat', 3, 71, '2026-02-02', false, 'medio']
];
// Precio base de una habitación estándar por barrio (€/mes) y si es zona de estudiantes
const BARRIOS = {
  Russafa: [470, false], Benimaclet: [395, true], 'Algirós': [415, true], Mestalla: [430, true], 'El Carme': [480, false],
  Extramurs: [440, false], Campanar: [420, false], Patraix: [385, false], Cabanyal: [425, false], Malilla: [380, false],
  'Quatre Carreres': [410, false], Benicalap: [360, false], Torrefiel: [355, false], Orriols: [330, false], Mislata: [365, false],
  Burjassot: [370, true], "L'Eixample": [500, false], 'Camins al Grau': [430, true], Trinitat: [375, false]
};
const DIFICILES = ['Orriols', 'Benicalap', 'Torrefiel', 'Mislata']; // zonas donde cuesta más alquilar (dossier)
const PROPIETARIOS = ['Rosa M. Llopis', 'Vicent Ferrando', 'Herederos de A. Climent', 'Carmen Sanchis', 'Joan B. Aleixandre', 'Pilar Escrivà', 'Inversiones Turia Mar SL', 'Amparo Gil', 'Josep Martí', 'Elena Ribes', 'Francisco J. Peiró', 'Mercedes Alapont', 'Rafael Soler', 'Teresa Navarro', 'Hnos. Cervera Bataller', 'Manuel Bellver', 'Concepción Mollà', 'Salvador Gimeno', 'Isabel Tormo', 'Patrimonial Albereda SL', 'Luis Monzó', 'Dolors Puchades', 'Enrique Vidal', 'Marisa Climent', 'Ricardo Alemany', 'Nuria Sapena'];

// ===================================================================
// 2. INQUILINOS: nombres ficticios variados (estudiantes y jóvenes profesionales)
// ===================================================================
const NOMBRES = {
  es: [['Lucía', 'Marina', 'Paula', 'Carmen', 'Andrea', 'Nerea', 'Irene', 'Claudia', 'Laia', 'Noelia', 'Sara', 'Alba', 'Elena', 'Ainhoa', 'Rocío'], ['Pablo', 'Adrián', 'Javier', 'Hugo', 'Álvaro', 'Sergio', 'Iván', 'Marc', 'Raúl', 'Unai', 'Diego', 'Víctor', 'Rubén', 'Óscar', 'Jorge'], ['García', 'Martínez', 'López', 'Sanchis', 'Ferrer', 'Navarro', 'Gómez', 'Ortega', 'Vidal', 'Romero', 'Moreno', 'Castro', 'Sáez', 'Pons', 'Llorca', 'Aguilar', 'Rubio', 'Domínguez', 'Benavent', 'Tormo']],
  it: [['Giulia', 'Chiara', 'Francesca', 'Martina', 'Sofia'], ['Luca', 'Matteo', 'Lorenzo', 'Andrea', 'Davide'], ['Rossi', 'Bianchi', 'Esposito', 'Colombo', 'Ricci', 'Greco', 'Marino', 'Conti']],
  fr: [['Camille', 'Léa', 'Manon', 'Chloé', 'Inès'], ['Théo', 'Hugo', 'Louis', 'Antoine', 'Maxime'], ['Martin', 'Bernard', 'Dubois', 'Moreau', 'Laurent', 'Girard', 'Lefèvre']],
  de: [['Lena', 'Hannah', 'Anna', 'Lea'], ['Jonas', 'Felix', 'Lukas', 'Paul'], ['Müller', 'Schmidt', 'Becker', 'Hoffmann', 'Wagner', 'Keller']],
  latam: [['Valentina', 'Camila', 'Daniela', 'Mariana', 'Fernanda', 'Gabriela'], ['Santiago', 'Mateo', 'Sebastián', 'Nicolás', 'Andrés', 'Tomás'], ['Rodríguez', 'Herrera', 'Vargas', 'Rojas', 'Mendoza', 'Quintero', 'Salazar', 'Cárdenas', 'Paredes']],
  pt: [['Beatriz', 'Inês', 'Mariana'], ['João', 'Tiago', 'Rafael'], ['Silva', 'Santos', 'Ferreira', 'Pereira', 'Costa']],
  ma: [['Salma', 'Yasmine', 'Imane'], ['Youssef', 'Adam', 'Mehdi'], ['El Amrani', 'Benali', 'Tazi', 'Alaoui']],
  ua: [['Anastasiia', 'Olena', 'Sofiia'], ['Oleksandr', 'Dmytro', 'Maksym'], ['Kovalenko', 'Bondarenko', 'Shevchenko', 'Tkachenko']],
  nl: [['Sanne', 'Fleur'], ['Daan', 'Bram'], ['de Vries', 'van Dijk', 'Jansen', 'Bakker']],
  ro: [['Ioana', 'Andreea'], ['Andrei', 'Mihai'], ['Popescu', 'Ionescu', 'Dumitru']]
};
const ORIGENES = [['es', 44], ['it', 11], ['fr', 9], ['latam', 13], ['de', 6], ['pt', 4], ['ma', 4], ['ua', 3], ['nl', 3], ['ro', 3]];
const usados = new Set();
function nuevoInquilino() {
  let t = azar() * 100, o = 'es';
  for (const [k, w] of ORIGENES) { if ((t -= w) < 0) { o = k; break; } }
  const [f, m, ap] = NOMBRES[o];
  let n, intentos = 0;
  do {
    const nombre = elegir(prob(0.5) ? f : m);
    const ap1 = elegir(ap); let ap2 = elegir(ap); while (ap2 === ap1) ap2 = elegir(ap);
    n = o === 'es' || o === 'latam' ? nombre + ' ' + ap1 + ' ' + ap2 : nombre + ' ' + ap1;
  } while (usados.has(n) && ++intentos < 50);
  usados.add(n);
  const limpio = n.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z ]/g, '').split(' ');
  return {
    nombre: n,
    email: limpio[0] + '.' + limpio[1] + (prob(0.4) ? entre(10, 99) : '') + '@example.com',
    telefono: '+34 6·· ··· ' + String(entre(100, 999)),
    // Perfil de pago: la mayoría paga bien
    perfil: azar() < 0.7 ? 'puntual' : azar() < 0.7 ? 'despistado' : 'moroso'
  };
}

// ===================================================================
// 3. HABITACIONES: tipos, metros, características y precio coherente
// ===================================================================
const TIPOS_HAB = {
  estandar: { m2: [8, 11], extra: 0, camas: ['Cama 90', 'Cama 105'] },
  grande: { m2: [12, 15], extra: 45, camas: ['Cama 135'] },
  doble: { m2: [13, 16], extra: 75, camas: ['Cama 135', 'Cama 150'] },
  suite: { m2: [14, 18], extra: 115, camas: ['Cama 150', 'Cama 135'] }
};
function crearHabitaciones(p) {
  const [, , , , barrio, n] = p;
  const base = BARRIOS[barrio][0];
  const tipos = Array(n).fill('estandar');
  tipos[0] = n >= 5 ? 'suite' : 'grande';            // la habitación principal
  if (n >= 4) tipos[1] = prob(0.5) ? 'doble' : 'grande';
  if (n >= 6) tipos[2] = 'grande';
  return barajar(tipos).map((tipo, i) => {
    const t = TIPOS_HAB[tipo];
    const exterior = prob(0.62);
    const car = [exterior ? 'Exterior' : 'Interior', elegir(t.camas), 'Escritorio'];
    if (tipo === 'suite') car.push('Baño privado');
    if (exterior && prob(0.35)) car.push('Balcón');
    if (prob(0.45)) car.push('Aire acondicionado');
    if (prob(0.4)) car.push('Armario empotrado');
    if (tipo !== 'estandar' && prob(0.15)) car.push('Terraza privada');
    let precio = base + t.extra + (exterior ? 15 : -25) + (car.includes('Balcón') ? 20 : 0) + (car.includes('Aire acondicionado') ? 15 : 0) + (car.includes('Terraza privada') ? 40 : 0) + entre(-3, 3) * 5;
    precio = Math.round(precio / 5) * 5;
    return { codigo: 'H' + (i + 1), tipo, m2: entre(...t.m2), caracteristicas: car.join(', '), precio, aire: car.includes('Aire acondicionado') };
  });
}

// ===================================================================
// 4. ESTADO DE HOY: se decide primero y la historia se construye hacia atrás
// ===================================================================
function planificarEstados(habs) {
  // Las libres salen sobre todo de zonas donde cuesta más alquilar (Orriols, Benicalap...)
  const dificiles = barajar(habs.filter((h) => DIFICILES.includes(h.barrio)));
  let resto = barajar(habs.filter((h) => !DIFICILES.includes(h.barrio)));
  const plan = [];
  for (const h of dificiles.splice(0, 4)) plan.push({ hab: h, estado: 'disponible', libreDesde: entre(9, 55) });
  resto = barajar([...resto, ...dificiles]);
  const tomar = (n, estado, extra = () => ({})) => { for (let i = 0; i < n && resto.length; i++) plan.push({ hab: resto.shift(), estado, ...extra(i) }); };
  tomar(3, 'disponible', () => ({ libreDesde: entre(3, 20) }));
  tomar(3, 'mantenimiento', () => ({ libreDesde: entre(6, 22) }));
  tomar(5, 'reservada', () => ({ libreDesde: entre(3, 30), entraEn: entre(2, 26) }));
  // Próximas a desocuparse: repartidas por urgencia (<15, 15-30, 30-60 días)
  const salidas = [2, 5, 8, 11, 13, 17, 20, 23, 26, 29, 33, 36, 41, 45, 49, 53, 57];
  const situaciones = barajar(['nuevo', 'nuevo', 'nuevo', 'nuevo', 'nuevo', 'renovado', 'renovado', 'solicitada', 'solicitada', 'en_negociacion', 'no_renueva', 'no_renueva', 'no_renueva', 'nada', 'nada', 'nada', 'nada']);
  tomar(salidas.length, 'por_liberar', (i) => ({ quedan: salidas[i], situacion: situaciones[i] }));
  tomar(resto.length, 'ocupada');
  return plan;
}

// ===================================================================
// 5. HISTORIA DE CADA HABITACIÓN (contratos encadenados hacia atrás)
// ===================================================================
const DURACIONES = [6, 10, 10, 11, 11, 12, 12, 12];
function historia(h, plan, inicioPiso) {
  const cadena = []; // { inicio, fin, inquilino, renovacionDePrevio, estado }
  const estudiantes = BARRIOS[h.barrio][1];
  // --- Estado actual ---
  if (plan.estado === 'ocupada' || plan.estado === 'por_liberar') {
    let fin, inicio;
    const dur = estudiantes && prob(0.5) ? 10 : elegir(DURACIONES);
    if (plan.estado === 'por_liberar') { fin = masDias(HOY, plan.quedan); inicio = masDias(masMeses(fin, -dur), 1); }
    else { inicio = masDias(HOY, -entre(15, dur * 30 - 75)); fin = masDias(masMeses(inicio, dur), -1); if (dias(HOY, fin) <= 62) fin = masDias(HOY, entre(65, 260)); }
    const inq = nuevoInquilino();
    const actual = { inicio, fin, inquilino: inq, estado: 'activo' };
    // Contrato siguiente (ya firmado)
    if (plan.situacion === 'nuevo') cadena.push({ inicio: masDias(fin, entre(1, 9)), fin: null, inquilino: nuevoInquilino(), estado: 'activo', futuro: true });
    if (plan.situacion === 'renovado') cadena.push({ inicio: masDias(fin, 1), fin: null, inquilino: inq, estado: 'activo', futuro: true, renovacion: true });
    if (['solicitada', 'en_negociacion', 'no_renueva'].includes(plan.situacion)) actual.renovacion = plan.situacion;
    if (actual.inicio < inicioPiso) actual.inicio = masDias(inicioPiso, entre(0, 20));
    cadena.unshift(actual);
  } else {
    const finUltimo = masDias(HOY, -plan.libreDesde);
    if (plan.estado === 'reservada') cadena.push({ inicio: masDias(HOY, plan.entraEn), fin: null, inquilino: nuevoInquilino(), estado: 'activo', futuro: true });
    const dur = elegir(DURACIONES);
    const ultimo = { inicio: masDias(masMeses(finUltimo, -dur), 1), fin: finUltimo, inquilino: nuevoInquilino(), estado: 'finalizado' };
    if (ultimo.inicio < inicioPiso) ultimo.inicio = masDias(inicioPiso, entre(0, 15));
    cadena.unshift(ultimo);
  }
  // Rellenar los "fin: null" de los futuros
  for (const c of cadena) if (!c.fin) c.fin = masDias(masMeses(c.inicio, c.renovacion ? 12 : elegir(DURACIONES)), -1);

  // --- Hacia atrás hasta que el piso entró en ALKI ---
  let siguiente = cadena[0];
  while (true) {
    const renueva = prob(0.27);
    // Hueco entre inquilinos: casi siempre unos días, a veces semanas (más en verano en zonas de estudiantes)
    let hueco = renueva ? 1 : prob(0.55) ? entre(3, 14) : prob(0.7) ? entre(15, 38) : entre(39, 70);
    const finPrevio = masDias(siguiente.inicio, -hueco);
    const mes = +finPrevio.slice(5, 7);
    if (!renueva && estudiantes && (mes >= 6 && mes <= 8) && prob(0.7)) hueco += entre(25, 60);
    else if (!renueva && (mes === 7 || mes === 8) && prob(0.35)) hueco += entre(10, 30); // verano flojo en zonas de estudiantes
    const fin = masDias(siguiente.inicio, -hueco);
    const dur = estudiantes && prob(0.55) ? 10 : elegir(DURACIONES);
    let inicio = masDias(masMeses(fin, -dur), 1);
    if (fin <= inicioPiso) break;
    if (inicio < inicioPiso) { inicio = masDias(inicioPiso, entre(0, 25)); if (dias(inicio, fin) < 75) break; }
    const rescinde = !renueva && prob(0.09);
    const previo = { inicio, fin, inquilino: renueva ? siguiente.inquilino : nuevoInquilino(), estado: rescinde ? 'rescindido' : 'finalizado' };
    cadena.unshift(previo);
    siguiente = previo;
  }
  return cadena;
}

// ===================================================================
// 6. RECIBOS: renta + servicios, prorrateo y forma de pagar de cada inquilino
// ===================================================================
const METODOS = ['Transferencia', 'Transferencia', 'Domiciliación', 'Domiciliación', 'Bizum'];
function recibos(c, contratoId, inq) {
  const out = [];
  const meses = costes.periodos(c.inicio.slice(0, 7), (c.fin < HOY ? c.fin : HOY).slice(0, 7));
  const metodo = elegir(METODOS);
  meses.forEach((p, i) => {
    const dm = diasMes(p);
    const desde = i === 0 ? +c.inicio.slice(8) : 1;
    const hasta = p === c.fin.slice(0, 7) ? +c.fin.slice(8) : dm;
    const factor = (hasta - desde + 1) / dm;
    const vence = i === 0 ? c.inicio : p + '-05';
    for (const [concepto, mensual] of [['renta', c.renta], ['servicios', c.servicios]]) {
      if (!mensual) continue;
      let importe = Math.round(mensual * factor);
      let notas = factor < 1 ? 'Prorrateo: ' + (hasta - desde + 1) + ' de ' + dm + ' días' : null;
      if (concepto === 'renta' && i === 0 && c.descuento) { importe -= c.descuento; notas = 'Descuento de bienvenida (' + c.descuento / 100 + ' €)' + (notas ? ' · ' + notas : ''); }
      if (importe < 500) continue;
      const pagoMes = cobro(vence, importe, inq.perfil, metodo, concepto);
      out.push({ contrato_id: contratoId, periodo: p, concepto, importe, vence, ...pagoMes, notas: [notas, pagoMes.notas].filter(Boolean).join(' · ') || null });
    }
  });
  return out;
}
function cobro(vence, importe, perfil, metodo, concepto) {
  const antiguedad = dias(vence, HOY);              // días desde el vencimiento
  if (antiguedad < -1) return { pagado_el: null, cobrado: 0, metodo: null };
  // Mes en curso: los domiciliados y puntuales suelen haber pagado ya
  if (antiguedad <= 0) return prob(metodo === 'Domiciliación' ? 0.85 : perfil === 'puntual' ? 0.55 : 0.2) ? pago(masDias(vence, -entre(0, 4)), importe, metodo) : { pagado_el: null, cobrado: 0, metodo: null };
  let retraso;
  if (perfil === 'puntual') retraso = prob(0.92) ? -entre(0, 4) : entre(1, 6);
  else if (perfil === 'despistado') retraso = prob(0.74) ? -entre(0, 3) : entre(3, 16);
  else retraso = prob(0.35) ? entre(0, 3) : entre(6, 28);
  // Morosos: en los dos últimos meses aún deben algo (atrasado o parcial)
  if (perfil === 'moroso' && antiguedad < 62 && antiguedad > 0 && concepto === 'renta' && prob(0.7)) {
    return prob(0.45) ? { pagado_el: null, cobrado: Math.round(importe * elegir([0.3, 0.4, 0.5, 0.6]) / 100) * 100, metodo: 'Transferencia', notas: 'Pago parcial: acordado pagar el resto a final de mes' } : { pagado_el: null, cobrado: 0, metodo: null };
  }
  if (perfil === 'despistado' && antiguedad < 25 && antiguedad > 3 && concepto === 'renta' && prob(0.25)) return { pagado_el: null, cobrado: 0, metodo: null };
  const fecha = masDias(vence, retraso);
  if (fecha > HOY) return { pagado_el: null, cobrado: 0, metodo: null };
  return pago(fecha, importe, metodo, perfil === 'moroso' && retraso > 10 && prob(0.4));
}
function pago(fecha, importe, metodo, fraccionado = false) {
  return { pagado_el: fecha > HOY ? HOY : fecha, cobrado: importe, metodo, notas: fraccionado ? 'Pagado en dos transferencias' : null };
}

// ===================================================================
// 7. GASTOS: alquiler (con IPC), internet, limpieza, luz, agua, gas, otros
// ===================================================================
const ESTACION_LUZ = [1.45, 1.32, 1.08, 0.92, 0.9, 1.12, 1.5, 1.42, 1.15, 0.94, 1.02, 1.34];
const ESTACION_GAS = [1.95, 1.75, 1.35, 0.95, 0.7, 0.5, 0.42, 0.4, 0.52, 0.8, 1.3, 1.8];
const PRECIO_KWH = { 2022: 0.235, 2023: 0.19, 2024: 0.172, 2025: 0.168, 2026: 0.163 };
function lunesDelMes(p) { let n = 0; for (let d = 1; d <= diasMes(p); d++) if (new Date(Date.UTC(+p.slice(0, 4), +p.slice(5, 7) - 1, d)).getUTCDay() === 1) n++; return n; }

// ===================================================================
// 8. MANTENIMIENTOS (catálogo realista) y proveedores ficticios
// ===================================================================
const PROV = {
  fontaneria: 'Fontanería Ràpida Túria', electricidad: 'Electricitat Llum Llevant', cerrajeria: 'Cerrajería 24h Russafa', persianas: 'Persianas y Toldos Albereda',
  electrodomesticos: 'SAT Hogar Valencia', plagas: 'Plagas Fuera Mediterráneo', climatizacion: 'Climatización Albufera', limpieza: 'Limpiezas Brillo Llevant',
  mobiliario: 'Mobles Express Valencia', pintura: 'Pinturas Vicent Esteve', carpinteria: 'Fusteria Hnos. Bataller', interno: 'Equipo ALKI (Javier)'
};
// [tipo, categoría, descripción, zonas posibles ('H' = habitación), coste mín, coste máx, proveedor]
const CATALOGO = [
  ['cerrajeria', 'reparaciones', 'Reparación de la cerradura de la puerta principal', ['Entrada'], 65, 135, 'cerrajeria'],
  ['cerrajeria', 'reparaciones', 'Cambio de bombín por pérdida de llaves', ['Entrada'], 70, 120, 'cerrajeria'],
  ['cerrajeria', 'reparaciones', 'Instalación de cerradura en la puerta de la habitación', ['H'], 55, 90, 'cerrajeria'],
  ['fontaneria', 'reparaciones', 'Sustitución del grifo monomando de la cocina', ['Cocina'], 72, 128, 'fontaneria'],
  ['fontaneria', 'reparaciones', 'Reparación de fuga bajo el fregadero', ['Cocina'], 58, 140, 'fontaneria'],
  ['fontaneria', 'reparaciones', 'Desatasco del plato de ducha', ['Baño'], 48, 92, 'fontaneria'],
  ['fontaneria', 'reparaciones', 'Cambio del mecanismo de la cisterna', ['Baño'], 44, 86, 'fontaneria'],
  ['fontaneria', 'reparaciones', 'Termo sin agua caliente: cambio de resistencia y termostato', ['Baño', 'Cocina'], 95, 165, 'fontaneria'],
  ['fontaneria', 'reparaciones', 'Sustitución del termo eléctrico (80 L)', ['Baño', 'Cocina'], 330, 425, 'fontaneria'],
  ['persianas', 'reparaciones', 'Reparación de persiana: cinta rota', ['H', 'Salón'], 42, 88, 'persianas'],
  ['persianas', 'reparaciones', 'Cambio de lamas de la persiana del salón', ['Salón'], 95, 175, 'persianas'],
  ['electricidad', 'mantenimiento', 'Cambio de bombillas y regleta de la cocina', ['Cocina', 'Salón', 'Pasillo'], 14, 38, 'interno'],
  ['electricidad', 'reparaciones', 'Enchufe quemado: sustitución del mecanismo', ['H', 'Cocina'], 48, 96, 'electricidad'],
  ['electricidad', 'reparaciones', 'Salta el diferencial: revisión del cuadro eléctrico', ['Entrada'], 68, 145, 'electricidad'],
  ['electrodomesticos', 'reparaciones', 'Reparación de la lavadora (bomba de desagüe)', ['Cocina', 'Galería'], 86, 152, 'electrodomesticos'],
  ['electrodomesticos', 'reparaciones', 'Sustitución de la lavadora (8 kg)', ['Galería'], 345, 435, 'electrodomesticos'],
  ['electrodomesticos', 'reparaciones', 'Frigorífico no enfría: carga de gas', ['Cocina'], 112, 185, 'electrodomesticos'],
  ['electrodomesticos', 'reparaciones', 'Cambio de la placa vitrocerámica', ['Cocina'], 255, 345, 'electrodomesticos'],
  ['electrodomesticos', 'reparaciones', 'Reparación del horno (resistencia)', ['Cocina'], 68, 118, 'electrodomesticos'],
  ['mobiliario', 'reparaciones', 'Sustitución de colchón', ['H'], 139, 215, 'mobiliario'],
  ['mobiliario', 'reparaciones', 'Cambio de somier', ['H'], 89, 145, 'mobiliario'],
  ['mobiliario', 'reparaciones', 'Reparación de puerta de armario descolgada', ['H'], 35, 78, 'carpinteria'],
  ['mobiliario', 'reparaciones', 'Nueva silla de escritorio', ['H'], 44, 79, 'mobiliario'],
  ['mobiliario', 'reparaciones', 'Sustitución del sofá del salón', ['Salón'], 385, 525, 'mobiliario'],
  ['plagas', 'mantenimiento', 'Tratamiento contra cucarachas en cocina y baño', ['Cocina'], 92, 155, 'plagas'],
  ['plagas', 'mantenimiento', 'Revisión de seguimiento del tratamiento de plagas', ['Cocina'], 38, 62, 'plagas'],
  ['climatizacion', 'mantenimiento', 'Mantenimiento anual del aire acondicionado', ['Salón', 'H'], 72, 125, 'climatizacion'],
  ['climatizacion', 'reparaciones', 'Aire acondicionado no enfría: carga de gas', ['H', 'Salón'], 118, 195, 'climatizacion'],
  ['limpieza', 'mantenimiento', 'Limpieza extraordinaria de cocina y zonas comunes', ['Cocina'], 82, 145, 'limpieza'],
  ['carpinteria', 'reparaciones', 'Ajuste de la puerta del baño que no cierra', ['Baño'], 38, 70, 'carpinteria'],
  ['otros', 'mantenimiento', 'Duplicado de llaves y mando del portal', ['Entrada'], 18, 46, 'interno']
];

// PDF mínimo de una sola página (para las facturas de ejemplo)
function pdfEjemplo(lineas) {
  const esc = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e]/g, '').replace(/([()\\])/g, '\\$1');
  const texto = 'BT /F1 11 Tf 56 780 Td 15 TL ' + lineas.map((l, i) => (i === 0 ? '/F1 16 Tf (' + esc(l) + ') Tj /F1 11 Tf T* T*' : '(' + esc(l) + ') Tj T*')).join(' ') + ' ET';
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', '<< /Length ' + texto.length + ' >>\nstream\n' + texto + '\nendstream'];
  let s = '%PDF-1.4\n'; const offs = [];
  objs.forEach((o, i) => { offs.push(s.length); s += (i + 1) + ' 0 obj\n' + o + '\nendobj\n'; });
  const x = s.length;
  s += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n' + offs.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('') + 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + x + '\n%%EOF';
  return Buffer.from(s, 'latin1');
}

// ===================================================================
// 9. INCIDENCIAS: lo que avisan inquilinos y equipo, con conversación
// ===================================================================
const MAPA_CAT = { fontaneria: 'fontaneria', electricidad: 'electricidad', electrodomesticos: 'electrodomesticos', cerrajeria: 'cerrajeria', plagas: 'plagas',
  climatizacion: 'climatizacion', mobiliario: 'mobiliario', persianas: 'persianas', carpinteria: 'mobiliario', limpieza: 'limpieza', pintura: 'otros', otros: 'otros' };
// Cómo lo cuenta quien avisa (título de la incidencia) según el tipo de trabajo
const AVISOS = {
  fontaneria: ['Gotea el grifo de la cocina', 'Se atasca la ducha', 'No sale agua caliente', 'Hay agua debajo del fregadero', 'La cisterna no deja de correr'],
  electricidad: ['Salta la luz al encender el horno', 'No funciona un enchufe de la habitación', 'Se ha fundido la luz del pasillo'],
  electrodomesticos: ['La lavadora no desagua', 'El frigorífico no enfría', 'El horno no calienta', 'La vitro no enciende un fuego'],
  cerrajeria: ['La puerta de entrada cuesta mucho de abrir', 'Han perdido las llaves', 'La cerradura de la habitación no cierra'],
  plagas: ['Han visto cucarachas en la cocina', 'Vuelven a salir cucarachas'],
  climatizacion: ['El aire acondicionado no enfría', 'El aire gotea agua'],
  mobiliario: ['El colchón está hundido', 'Se ha roto la silla del escritorio', 'La puerta del armario se ha descolgado', 'El sofá está roto'],
  persianas: ['La persiana no sube', 'Se ha roto la cinta de la persiana'],
  limpieza: ['La cocina está muy sucia', 'Limpieza a fondo antes de la entrada'], otros: ['Faltan llaves del portal', 'Hay que revisar una pared']
};
// Título con el que llega la incidencia, coherente con el trabajo que se hizo después
const AVISO_DE = [
  [/seguimiento/i, 'Revisión de seguimiento del tratamiento de plagas'], [/Mantenimiento anual/i, 'Toca la revisión anual del aire acondicionado'],
  [/Fuga continua/i, 'Fuga continua en la cisterna del baño'], [/Termo eléctrico calentando/i, 'La factura de luz ha subido mucho: revisar el termo'],
  [/grifo/i, 'Gotea el grifo de la cocina'], [/fuga bajo el fregadero/i, 'Hay agua debajo del fregadero'], [/plato de ducha/i, 'Se atasca la ducha'],
  [/cisterna/i, 'La cisterna no deja de correr'], [/termo|agua caliente/i, 'No sale agua caliente'], [/cinta rota/i, 'Se ha roto la cinta de la persiana'],
  [/lamas/i, 'La persiana del salón no baja bien'], [/Persiana del salón atascada/i, 'Persiana del salón atascada'], [/bombillas/i, 'Se han fundido varias luces de la cocina'],
  [/Enchufe/i, 'Un enchufe no funciona y huele a quemado'], [/diferencial/i, 'Salta la luz cada dos por tres'], [/luz del techo/i, 'No funciona la luz del techo de la habitación'],
  [/no centrifuga/i, 'La lavadora no centrifuga'], [/lavadora \(bomba/i, 'La lavadora no desagua'], [/Sustitución de la lavadora/i, 'La lavadora ya no funciona'],
  [/Frigorífico/i, 'El frigorífico no enfría'], [/vitro/i, 'La vitro no enciende un fuego'], [/horno/i, 'El horno no calienta'], [/colchón/i, 'El colchón está hundido'],
  [/somier/i, 'El somier está roto'], [/armario/i, 'La puerta del armario se ha descolgado'], [/silla/i, 'Se ha roto la silla del escritorio'], [/sofá/i, 'El sofá del salón está roto'],
  [/cucarachas/i, 'Han visto cucarachas en la cocina'], [/Aire acondicionado no enfría/i, 'El aire acondicionado no enfría'], [/Limpieza extraordinaria/i, 'La cocina está muy sucia'],
  [/puerta del baño/i, 'La puerta del baño no cierra'], [/llaves y mando/i, 'Faltan copias de las llaves del portal'], [/puerta principal/i, 'La puerta de entrada cuesta mucho de abrir'],
  [/bombín/i, 'Han perdido las llaves de casa'], [/puerta de la habitación/i, 'Piden cerradura en la puerta de la habitación'], [/Humedad/i, 'Mancha de humedad en la pared de la habitación'],
  [/ventana/i, 'La ventana de la habitación no cierra'], [/mobiliario de la habitación/i, 'Renovar los muebles de la habitación'], [/cucarachas en la cocina: tratamiento/i, 'Han visto cucarachas en la cocina']
];
const SIN_COSTE = [
  ['convivencia', 'Ruido por las noches en el piso', 'Varias quejas de ruido a partir de la 1:00 entre semana.', ['Hablado con los dos residentes. Se les recuerdan las normas de silencio.', 'Una semana sin quejas. Cerramos.']],
  ['convivencia', 'Olor a tabaco en el salón', 'Un residente avisa de que alguien fuma dentro del piso.', ['Enviado aviso por escrito a todo el piso con la norma de no fumar.', 'El residente confirma que ya no huele. Resuelta.']],
  ['limpieza', 'Cocina sucia y basura acumulada', 'Fotos de la cocina con platos sin fregar varios días.', ['Recordatorio del turno de limpieza en el grupo del piso.', 'La limpieza de la semana lo ha dejado bien. Seguimos vigilando.']],
  ['convivencia', 'Discusión por el uso de la lavadora', 'Dos residentes no se ponen de acuerdo con los turnos de lavadora.', ['Propuesto un cuadrante de turnos en la puerta de la cocina.', 'Aceptado por todos. Resuelta.']],
  ['seguridad', 'La puerta del portal no cierra bien', 'El portal se queda abierto. Lo gestiona la comunidad.', ['Avisado al administrador de la finca.', 'La comunidad lo ha arreglado.']],
  ['otros', 'Paquete de un antiguo inquilino', 'Ha llegado un paquete a nombre de un inquilino que ya no vive aquí.', ['Contactado el antiguo inquilino: pasa a recogerlo el viernes.', 'Recogido.']],
  ['convivencia', 'Visita que se queda a dormir sin avisar', 'Los compañeros comentan que una visita se queda varias noches.', ['Llamado al residente: recordada la norma de visitas.', 'Aclarado. Cerramos.']],
  ['otros', 'Consulta: ¿se puede renovar el contrato?', 'Un residente pregunta si puede quedarse otro año.', ['Pasado a gestión para preparar la renovación.', 'Le enviamos la propuesta. Resuelta.']]
];
const COMENTARIOS = {
  asignar: ['Me encargo yo, mañana paso por el piso.', 'Lo miro esta tarde.', 'Llamo al proveedor y os digo.', 'Paso a verlo cuando acabe en el otro piso.'],
  esperando: ['El técnico viene el jueves por la mañana. Avisada la inquilina.', 'Pedido el recambio; tarda 3–4 días.', 'Esperando a que el inquilino nos diga cuándo puede abrir.', 'Presupuesto pedido, a la espera.'],
  resolver: ['Arreglado. Adjunto la factura en el mantenimiento.', 'Hecho. El inquilino confirma que ya funciona.', 'Solucionado en la visita de hoy.', 'Resuelto. Cierro la incidencia.'],
  direccion: ['¿Cuánto nos ha costado? Es la segunda vez este año en este piso.', 'Si se repite, valoremos cambiarlo por uno nuevo.', 'Ok, gracias.']
};

function generarIncidencias(inmuebles, equipo) {
  const desde = masDias(HOY, -120);
  const quien = () => (prob(0.62) ? equipo.operativo : prob(0.6) ? equipo.gestion : equipo.admin);
  const insInc = (x) => Number(db.ejecutar(
    'INSERT INTO incidencias (titulo, descripcion, inmueble_id, habitacion_id, zona, categoria, prioridad, estado, origen, reportado_por, asignado_a, creado_por, fecha_limite, mantenimiento_id, creado, actualizado, resuelta_el) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    x.titulo, x.descripcion, x.inmueble_id, x.habitacion_id, x.zona, x.categoria, x.prioridad, x.estado, x.origen, x.reportado_por, x.asignado_a, x.creado_por, x.fecha_limite, x.mantenimiento_id,
    x.creado, x.actualizado || x.creado, x.resuelta_el).lastInsertRowid);
  const ev = (id, u, tipo, texto, f) => db.ejecutar('INSERT INTO incidencia_eventos (incidencia_id, usuario_id, tipo, texto, creado) VALUES (?, ?, ?, ?, ?)', id, u, tipo, texto, f);
  const hora = (f, h0 = 9, h1 = 19) => f + ' ' + String(entre(h0, h1)).padStart(2, '0') + ':' + String(entre(0, 59)).padStart(2, '0') + ':00';
  const nombres = Object.fromEntries(db.todos('SELECT id, nombre FROM usuarios').map((u) => [u.id, u.nombre]));
  let n = 0;
  const lista = [];

  // a) Las que acabaron en un mantenimiento (coherentes con su coste)
  const mants = db.todos("SELECT m.*, h.codigo AS hab FROM mantenimientos m LEFT JOIN habitaciones h ON h.id = m.habitacion_id WHERE m.fecha >= ? AND m.descripcion NOT LIKE 'Limpieza a fondo de la habitación tras%' AND m.descripcion NOT LIKE 'Pintura de la habitación y repaso%' ORDER BY m.fecha", desde);
  for (const m of mants) {
    const cat = MAPA_CAT[m.tipo] || 'otros';
    const creado = hora(masDias(m.fecha, -entre(0, 2)));
    const estado = m.estado === 'terminado' || m.estado === 'cancelado' ? 'resuelta' : m.estado === 'en_curso' ? (prob(0.45) ? 'esperando' : 'en_curso') : (prob(0.5) ? 'nueva' : 'en_curso');
    const asignado = estado === 'nueva' ? null : quien();
    const urgente = /fuga|sin agua caliente|no sale agua|diferencial|bombín|cerradura de la puerta principal/i.test(m.descripcion);
    const inq = m.hab ? 'Inquilino/a de ' + m.hab : 'Residentes del piso';
    lista.push({ m, x: {
      titulo: (AVISO_DE.find(([re]) => re.test(m.descripcion)) || [null, elegir(AVISOS[cat] || AVISOS.otros)])[1],
      descripcion: 'Trabajo previsto: ' + m.descripcion + '.', inmueble_id: m.inmueble_id, habitacion_id: m.habitacion_id, zona: m.zona, categoria: cat,
      prioridad: urgente ? (prob(0.5) ? 'urgente' : 'alta') : elegir(['media', 'media', 'alta', 'baja']), estado,
      origen: /anual|seguimiento|Termo eléctrico calentando|Fuga continua/i.test(m.descripcion) ? 'revision' : prob(0.85) ? 'inquilino' : 'revision', reportado_por: prob(0.8) ? inq + (prob(0.6) ? ', por WhatsApp' : ', por llamada') : 'Revisión del equipo',
      asignado_a: asignado, creado_por: prob(0.6) ? equipo.gestion : equipo.operativo, fecha_limite: urgente ? masDias(creado.slice(0, 10), 2) : null,
      mantenimiento_id: m.id, creado, resuelta_el: estado === 'resuelta' ? hora(masDias(m.fecha, entre(0, 3)) > HOY ? HOY : masDias(m.fecha, entre(0, 3))) : null } });
  }
  // b) Las que no cuestan dinero (convivencia, limpieza, gestiones)
  for (let k = 0; k < 16; k++) {
    const [cat, titulo, descripcion, pasos] = elegir(SIN_COSTE);
    const inm = elegir(inmuebles);
    const dia = masDias(HOY, -entre(0, 115));
    const abierta = dias(dia, HOY) < 9 && prob(0.7);
    lista.push({ pasos, x: {
      titulo, descripcion, inmueble_id: inm.id, habitacion_id: null, zona: null, categoria: cat, prioridad: elegir(['baja', 'media', 'media']),
      estado: abierta ? elegir(['nueva', 'en_curso', 'esperando']) : 'resuelta', origen: cat === 'seguridad' ? 'equipo' : 'inquilino',
      reportado_por: 'Residente de ' + elegir(inm.habs).codigo, asignado_a: null, creado_por: equipo.gestion, fecha_limite: null, mantenimiento_id: null,
      creado: hora(dia), resuelta_el: null } });
  }
  // c) Dos urgentes abiertas ahora mismo
  const p1 = barajar(inmuebles)[0], p2 = barajar(inmuebles)[1];
  lista.push({ x: { titulo: 'Fuga de agua en el baño: cae agua al vecino de abajo', descripcion: 'El vecino del piso inferior avisa de una mancha de humedad que gotea. Cerrada la llave de paso del baño.', inmueble_id: p1.id, habitacion_id: null, zona: 'Baño', categoria: 'fontaneria', prioridad: 'urgente', estado: 'en_curso', origen: 'propietario', reportado_por: 'Vecino del piso inferior, por llamada al propietario', asignado_a: equipo.operativo, creado_por: equipo.admin, fecha_limite: HOY, mantenimiento_id: null, creado: hora(masDias(HOY, -1), 18, 21), resuelta_el: null },
    pasos: null, urgente: ['Voy ahora mismo con el fontanero de guardia.', 'Localizada la fuga en el desagüe de la bañera. Mañana a primera hora la reparan.'] });
  lista.push({ x: { titulo: 'No hay agua caliente en todo el piso', descripcion: 'Los 4 residentes avisan esta mañana. El termo no enciende.', inmueble_id: p2.id, habitacion_id: null, zona: 'Cocina', categoria: 'fontaneria', prioridad: 'urgente', estado: 'nueva', origen: 'inquilino', reportado_por: 'Grupo de WhatsApp del piso', asignado_a: null, creado_por: equipo.gestion, fecha_limite: masDias(HOY, 1), mantenimiento_id: null, creado: hora(HOY, 8, 9), resuelta_el: null }, pasos: null });

  lista.sort((a, b) => a.x.creado.localeCompare(b.x.creado));
  for (const item of lista) {
    const x = item.x;
    if (x.estado !== 'nueva' && !x.asignado_a) x.asignado_a = quien();
    if (x.estado === 'resuelta' && !x.resuelta_el) x.resuelta_el = hora(masDias(x.creado.slice(0, 10), entre(1, 6)) > HOY ? HOY : masDias(x.creado.slice(0, 10), entre(1, 6)));
    if (x.resuelta_el && x.resuelta_el < x.creado) x.resuelta_el = x.creado;
    x.actualizado = x.resuelta_el || x.creado;
    const id = insInc(x);
    db.ejecutar('UPDATE incidencias SET codigo = ? WHERE id = ?', 'INC-' + String(id).padStart(4, '0'), id);
    const d0 = x.creado.slice(0, 10);
    ev(id, x.creado_por, 'cambio', 'Creó la incidencia', x.creado);
    if (x.asignado_a) {
      const fa = x.creado.slice(0, 10) + ' ' + String(Math.min(20, +x.creado.slice(11, 13) + 1)).padStart(2, '0') + x.creado.slice(13);
      ev(id, x.asignado_a === x.creado_por ? x.creado_por : equipo.gestion, 'cambio', 'Asignada a ' + nombres[x.asignado_a] + ' · Estado: Nueva → En curso', fa);
      const pasos = item.pasos || item.urgente;
      ev(id, x.asignado_a, 'comentario', pasos ? pasos[0] : elegir(COMENTARIOS.asignar), fa);
      if (x.estado === 'esperando' || (x.estado === 'resuelta' && prob(0.4))) ev(id, x.asignado_a, 'comentario', elegir(COMENTARIOS.esperando), hora(masDias(d0, 1) > HOY ? HOY : masDias(d0, 1)));
      if (x.estado === 'esperando') ev(id, x.asignado_a, 'cambio', 'Estado: En curso → Esperando (proveedor / inquilino)', hora(masDias(d0, 1) > HOY ? HOY : masDias(d0, 1), 19, 20));
      if (item.urgente && item.urgente[1]) ev(id, x.asignado_a, 'comentario', item.urgente[1], hora(HOY, 9, 10));
      if (x.estado === 'resuelta') {
        if (item.m && item.m.coste > 0) ev(id, x.asignado_a, 'cambio', 'Coste registrado: ' + (item.m.coste / 100).toLocaleString('es-ES', { minimumFractionDigits: 2 }) + ' € (' + item.m.proveedor + ') · se suma a los gastos del piso', x.resuelta_el);
        ev(id, x.asignado_a, 'comentario', item.pasos ? item.pasos[1] : elegir(COMENTARIOS.resolver), x.resuelta_el);
        ev(id, x.asignado_a, 'cambio', 'Estado: En curso → Resuelta', x.resuelta_el);
        if (item.m && item.m.coste > 20000 && prob(0.6)) ev(id, equipo.direccion, 'comentario', elegir(COMENTARIOS.direccion), x.resuelta_el.slice(0, 11) + '20:15:00');
      }
    }
    n++;
  }
  return n;
}

// ===================================================================
// 10. INGRESOS REGISTRADOS A MANO (ligados a hechos de la demo)
// ===================================================================
function generarIngresos(equipo) {
  const desde = masDias(HOY, -420);
  const ins = (fecha, pagador, importe, concepto, tipo, metodo, inmueble, habitacion, obs) => {
    if (fecha > HOY) fecha = HOY;
    db.ejecutar('INSERT INTO ingresos (fecha, periodo, pagador, importe, concepto, tipo, metodo, inmueble_id, habitacion_id, observaciones, creado_por, creado) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      fecha, fecha.slice(0, 7), pagador, Math.round(importe), concepto, tipo, metodo, inmueble, habitacion, obs, prob(0.7) ? equipo.gestion : equipo.admin, fecha + ' 12:' + String(entre(10, 59)) + ':00');
    n++;
  };
  let n = 0;
  // Salidas anticipadas: penalización pactada en el contrato (medio mes de renta)
  for (const c of db.todos("SELECT c.*, q.nombre, h.codigo AS hab FROM contratos c JOIN inquilinos q ON q.id = c.inquilino_id LEFT JOIN habitaciones h ON h.id = c.habitacion_id WHERE c.estado = 'rescindido' AND c.fin >= ? AND c.fin < ?", desde, HOY))
    if (prob(0.75)) ins(masDias(c.fin, entre(2, 9)), c.nombre, c.renta / 2, 'Penalización por salida anticipada (' + c.codigo + ')', 'penalizacion', elegir(['Transferencia', 'Transferencia', 'Bizum']), c.inmueble_id, c.habitacion_id, 'Medio mes de renta según la cláusula de preaviso. Se descuenta de la fianza.');
  // Pérdida de llaves: se repercute al inquilino el cambio de bombín
  for (const m of db.todos("SELECT * FROM mantenimientos WHERE descripcion LIKE 'Cambio de bombín%' AND estado = 'terminado' AND fecha >= ?", desde))
    ins(masDias(m.fecha, entre(1, 6)), 'Residente del piso', m.coste, 'Cargo por pérdida de llaves y cambio de bombín', 'danos', 'Bizum', m.inmueble_id, m.habitacion_id, 'Repercutido al inquilino que perdió las llaves.');
  // Daños por agua: el seguro reembolsa parte de las reparaciones caras
  for (const m of db.todos("SELECT * FROM mantenimientos WHERE (descripcion LIKE '%fuga%' OR descripcion LIKE '%Fuga%' OR descripcion LIKE 'Sustitución del termo%') AND estado = 'terminado' AND coste > 9000 AND fecha >= ?", desde))
    if (prob(0.6)) ins(masDias(m.fecha, entre(18, 40)), 'Seguros Turia Hogar', m.coste * real(0.55, 0.8), 'Reembolso del seguro por la reparación del ' + m.fecha.split('-').reverse().join('/'), 'seguro', 'Transferencia', m.inmueble_id, m.habitacion_id, 'Siniestro abierto por el equipo; franquicia descontada.');
  // Estancias cortas en habitaciones libres: solo dentro de un hueco real entre dos contratos
  let estancias = 0;
  for (const h of db.todos('SELECT id, inmueble_id, precio FROM habitaciones WHERE bloqueo IS NULL ORDER BY id')) {
    if (estancias >= 7 || !prob(0.25)) continue;
    const cs = db.todos('SELECT inicio, fin FROM contratos WHERE habitacion_id = ? ORDER BY inicio', h.id);
    for (let k = 1; k < cs.length; k++) {
      const libre = dias(cs[k - 1].fin, cs[k].inicio) - 1;
      if (libre < 9 || cs[k - 1].fin < desde || cs[k].inicio > HOY) continue;
      const noches = Math.min(libre - 2, entre(5, 12));
      const entra = masDias(cs[k - 1].fin, 1 + entre(0, libre - noches - 1));
      ins(entra, elegir(['Estudiante Erasmus (visita)', 'Profesor visitante', 'Trabajador en prácticas', 'Familiar de un residente']), h.precio * noches / 30 * 1.4, 'Estancia corta de ' + noches + ' noches', 'estancia', elegir(['Bizum', 'Tarjeta', 'Transferencia']), h.inmueble_id, h.id, 'Habitación libre entre dos contratos (del ' + masDias(cs[k - 1].fin, 1).split('-').reverse().join('/') + ' al ' + masDias(cs[k].inicio, -1).split('-').reverse().join('/') + ').');
      estancias++; break;
    }
  }
  // Venta del mobiliario sustituido
  for (const m of db.todos("SELECT * FROM mantenimientos WHERE descripcion LIKE 'Sustitución del sofá%' AND estado = 'terminado' AND fecha >= ?", desde))
    ins(masDias(m.fecha, entre(3, 15)), 'Particular (Wallapop)', real(40, 95) * 100, 'Venta del sofá antiguo', 'venta', 'Bizum', m.inmueble_id, null, null);
  // Ingresos de la empresa (sin piso)
  ins(masDias(HOY, -entre(60, 200)), 'Llum del Mediterrani', real(92, 160) * 100, 'Devolución de la fianza del contrato de luz de un piso dado de baja', 'otros', 'Transferencia', null, null, null);
  ins(masDias(HOY, -entre(5, 50)), 'Agencia Tributaria', real(180, 420) * 100, 'Devolución del IVA de un trimestre', 'otros', 'Transferencia', null, null, 'Según la gestoría.');
  return n;
}

// ===================================================================
// GENERACIÓN
// ===================================================================
async function main() {
  if (forzar) {
    db.transaccion(() => {
      for (const t of ['uso_sesiones', 'uso_apartados', 'ingresos', 'incidencia_eventos', 'incidencias', 'documentos', 'pagos', 'gastos', 'gastos_recurrentes', 'mantenimientos', 'contratos', 'inquilinos', 'habitaciones', 'inmuebles', 'auditoria', 'sincronizaciones']) db.ejecutar('DELETE FROM ' + t);
      db.ejecutar("DELETE FROM usuarios WHERE email LIKE '%@demo.alki'");
    });
    const carpeta = path.join(config.DATA, 'documentos');
    if (fs.existsSync(carpeta)) for (const f of fs.readdirSync(carpeta)) fs.unlinkSync(path.join(carpeta, f));
  }

  // Equipo de ALKI (ficticio)
  const claveDemo = process.env.DEMO_CLAVE || 'Demo-ALKI-2026!';
  const clave = await hashClave(claveDemo);
  const equipo = {};
  for (const [email, nombre, rol] of [['direccion@demo.alki', 'Lucía Andreu', 'direccion'], ['gestion@demo.alki', 'Marta Soriano', 'gestion'], ['operativo@demo.alki', 'Javier Peris', 'operativo']]) {
    db.ejecutar("INSERT INTO usuarios (email, nombre, rol, hash_clave, ultimo_acceso) VALUES (?, ?, ?, ?, datetime('now', '-' || ? || ' hours'))", email, nombre, rol, clave, entre(1, 30));
    equipo[rol] = db.uno('SELECT id FROM usuarios WHERE email = ?', email).id;
  }
  // El administrador (encargado): se crea sin contraseña si aún no existe; la elige con el enlace al arrancar
  db.ejecutar("INSERT OR IGNORE INTO usuarios (email, nombre, rol) VALUES (?, 'Daniel', 'admin')", config.adminInicial);
  equipo.admin = db.uno("SELECT id FROM usuarios WHERE rol = 'admin' ORDER BY id LIMIT 1").id;

  const res = { inmuebles: 0, habitaciones: 0, contratos: 0, recibos: 0, gastos: 0, mantenimientos: 0, documentos: 0 };
  const todasHabs = [];
  const inmuebles = [];

  db.transaccion(() => {
    // ---------- Inmuebles y habitaciones ----------
    PISOS.forEach((p, idx) => {
      const [codigo, calle, num, planta, barrio, n, m2, desde, gas, edad] = p;
      const habs = crearHabitaciones(p);
      const rentaProp = Math.round(habs.reduce((s, h) => s + h.precio, 0) * real(0.5, 0.56) / 10) * 10;
      const desc = n + ' habitaciones, ' + (n >= 6 ? 2 : n >= 4 ? 2 : 1) + ' baño' + (n >= 4 ? 's' : '') + ', cocina equipada, salón' + (edad === 'reformado' ? '. Reformado por ALKI' : '') + (gas ? '. Caldera de gas' : '. Termo eléctrico');
      const id = Number(db.ejecutar('INSERT INTO inmuebles (codigo, nombre, direccion, barrio, propietario, renta_propietario, m2, planta, descripcion, notas, origen, creado) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        codigo, String(idx + 1).padStart(3, '0') + ' · ' + calle + ' ' + num, calle + ' ' + num + ', ' + planta + ' · 460' + String(entre(1, 46)).padStart(2, '0') + ' València', barrio, PROPIETARIOS[idx], cent(rentaProp), m2, planta, desc,
        'En cartera desde el ' + desde.split('-').reverse().join('/') + '. Contrato con la propiedad renovable cada 5 años.', 'demo', desde + ' 10:00:00').lastInsertRowid);
      const inm = { id, codigo, barrio, n, desde, gas, edad, rentaProp, habs: [] };
      for (const h of habs) {
        h.id = Number(db.ejecutar('INSERT INTO habitaciones (inmueble_id, codigo, precio, tipo, m2, caracteristicas, origen) VALUES (?, ?, ?, ?, ?, ?, ?)',
          id, h.codigo, cent(h.precio), h.tipo, h.m2, h.caracteristicas, 'demo').lastInsertRowid);
        h.inmueble = inm; h.barrio = barrio;
        inm.habs.push(h); todasHabs.push(h);
      }
      inmuebles.push(inm);
      res.inmuebles++; res.habitaciones += habs.length;
    });

    // ---------- Contratos, inquilinos y recibos ----------
    const plan = planificarEstados(todasHabs);
    let numContrato = 0;
    const pendientesCodigo = [];
    for (const pl of plan) {
      const h = pl.hab;
      const cadena = historia(h, pl, h.inmueble.desde);
      h.contratos = [];
      let previoId = null, previoInq = null;
      for (const c of cadena) {
        // Precio: el de la habitación en ese momento (sube algo cada año)
        const anios = (D(HOY) - D(c.inicio)) / (365 * 86400000);
        const precioEpoca = Math.round(h.precio * (1 - 0.028 * Math.max(0, anios)) / 5) * 5;
        c.renta = cent(precioEpoca - (prob(0.12) ? 10 : 0));
        c.servicios = cent(h.aire ? 60 : 50);
        c.descuento = !c.futuro && prob(0.05) ? cent(elegir([25, 50])) : 0;
        if (c.fin < HOY && c.estado === 'activo') c.estado = 'finalizado';
        const esRenovacion = previoInq && previoInq === c.inquilino;
        const qId = esRenovacion ? h.contratos[h.contratos.length - 1].inquilinoId : Number(db.ejecutar('INSERT INTO inquilinos (nombre, email, telefono, origen) VALUES (?, ?, ?, ?)', c.inquilino.nombre, c.inquilino.email, c.inquilino.telefono, 'demo').lastInsertRowid);
        const firmado = masDias(c.inicio, -entre(4, c.futuro ? 12 : 35));
        const id = Number(db.ejecutar(
          'INSERT INTO contratos (nombre, inmueble_id, habitacion_id, inquilino_id, tipo, estado, inicio, fin, renta, servicios, fianza, renovacion_de, renovacion, firmado, origen) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          h.inmueble.codigo + '-' + h.codigo, h.inmueble.id, h.id, qId, 'habitacion', c.estado, c.inicio, c.fin, c.renta, c.servicios, c.renta,
          esRenovacion ? previoId : null, c.renovacion && typeof c.renovacion === 'string' ? c.renovacion : null, firmado > HOY ? HOY : firmado, 'demo').lastInsertRowid);
        pendientesCodigo.push([id, c.inicio]);
        h.contratos.push({ ...c, id, inquilinoId: qId });
        for (const r of recibos(c, id, c.inquilino)) {
          db.ejecutar('INSERT INTO pagos (contrato_id, periodo, concepto, importe, vence, pagado_el, cobrado, metodo, notas, origen) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            r.contrato_id, r.periodo, r.concepto, r.importe, r.vence, r.pagado_el, r.cobrado, r.metodo, r.notas, 'demo');
          res.recibos++;
        }
        previoId = id; previoInq = c.inquilino;
        res.contratos++;
      }
      if (pl.estado === 'mantenimiento') { db.ejecutar("UPDATE habitaciones SET bloqueo = 'mantenimiento' WHERE id = ?", h.id); h.bloqueada = true; }
    }
    // Códigos internos por orden cronológico: ALK-2024-0137
    pendientesCodigo.sort((a, b) => a[1].localeCompare(b[1]));
    for (const [id, inicio] of pendientesCodigo) db.ejecutar('UPDATE contratos SET codigo = ? WHERE id = ?', 'ALK-' + inicio.slice(0, 4) + '-' + String(++numContrato).padStart(4, '0'), id);

    // ---------- Programa de embajadores: 30 € por cada nuevo inquilino recomendado ----------
    for (const h of todasHabs) for (const c of h.contratos) {
      const pago = masDias(c.inicio, 45);
      if (c.futuro || pago > HOY || c.inicio < h.inmueble.desde || !prob(0.07)) continue;
      db.ejecutar('INSERT INTO gastos (inmueble_id, categoria, fecha, periodo, importe, proveedor, descripcion, creado_por) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        h.inmueble.id, 'comisiones', pago, pago.slice(0, 7), 3000, 'Programa de embajadores', 'Recompensa por recomendar al inquilino de ' + h.codigo, equipo.gestion);
      res.gastos++;
    }

    // ---------- Gastos de cada piso ----------
    for (const inm of inmuebles) {
      const mesesPiso = costes.periodos(inm.desde.slice(0, 7), MES_HOY);
      // Alquiler al propietario: plantilla por cada año (actualización IPC en el aniversario)
      let renta = inm.rentaProp * (1 - 0.027 * Math.max(0, (D(HOY) - D(inm.desde)) / (365 * 86400000) - 0.5));
      renta = Math.round(renta / 10) * 10;
      let desdeT = inm.desde.slice(0, 7);
      while (desdeT <= MES_HOY) {
        const hastaT = costes.sumarMes(desdeT, 11);
        const ultimo = hastaT >= MES_HOY;
        db.ejecutar('INSERT INTO gastos_recurrentes (inmueble_id, categoria, importe, dia, desde, hasta, proveedor, descripcion) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          inm.id, 'alquiler', cent(renta), 1, desdeT, ultimo ? null : hastaT, PROPIETARIOS[inmuebles.indexOf(inm)], 'Renta mensual a la propiedad' + (desdeT > inm.desde.slice(0, 7) ? ' (actualizada con IPC)' : ''));
        renta = Math.round(renta * real(1.022, 1.034));
        desdeT = costes.sumarMes(desdeT, 12);
      }
      // Internet: precio estable con una subida en 2025
      const [operador, cuota] = elegir([['Fibra Túria', 29.9], ['Conecta Llevant', 34.9], ['NetValència', 39.9], ['Fibra Túria', 32.5]]);
      const cambio = '2025-03';
      db.ejecutar('INSERT INTO gastos_recurrentes (inmueble_id, categoria, importe, dia, desde, hasta, proveedor, descripcion) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', inm.id, 'internet', cent(cuota), 8, inm.desde.slice(0, 7), inm.desde.slice(0, 7) < cambio ? '2025-02' : null, operador, 'Fibra 600 Mb + router WiFi 6');
      if (inm.desde.slice(0, 7) < cambio) db.ejecutar('INSERT INTO gastos_recurrentes (inmueble_id, categoria, importe, dia, desde, proveedor, descripcion) VALUES (?, ?, ?, ?, ?, ?, ?)', inm.id, 'internet', cent(cuota + 3), 8, cambio, operador, 'Fibra 600 Mb + router WiFi 6 (nueva tarifa)');
      // Seguro del hogar: anual
      const prima = real(178, 265);

      const precioLimpieza = real(21, 27) + inm.n * real(2.5, 3.5);
      for (const p of mesesPiso) {
        const mes = +p.slice(5, 7), anio = +p.slice(0, 4);
        const mitad = p + '-15';
        const ocupantes = inm.habs.filter((h) => h.contratos.some((c) => c.inicio <= mitad && c.fin >= mitad)).length;
        const parcialMes = p === inm.desde.slice(0, 7) ? (diasMes(p) - +inm.desde.slice(8) + 1) / diasMes(p) : 1;
        const ins = (categoria, fecha, importe, proveedor, descripcion) => {
          if (importe <= 0) return null;
          res.gastos++;
          return Number(db.ejecutar('INSERT INTO gastos (inmueble_id, categoria, fecha, periodo, importe, proveedor, descripcion, creado_por) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            inm.id, categoria, fecha > HOY ? HOY : fecha, p, Math.round(importe), proveedor, descripcion, equipo.gestion).lastInsertRowid);
        };
        // Luz: depende de ocupantes y estación (facturas que llegan a mediados del mes siguiente)
        const factFecha = masDias(costes.sumarMes(p, 1) + '-01', entre(0, 3));
        {
          if (p !== MES_HOY) {
            let kwh = (ocupantes * real(62, 84) + 35) * ESTACION_LUZ[mes - 1] * (inm.gas ? 0.82 : 1);
            let luz = (kwh * (PRECIO_KWH[anio] || 0.165) + real(17, 24)) * 1.21 * parcialMes * 100;
            inm.luz = inm.luz || [];
            inm.luz.push({ p, importe: luz });
            ins('electricidad', factFecha, luz, 'Llum del Mediterrani', 'Factura de luz de ' + p.split('-').reverse().join('/') + ' · ' + Math.round(kwh) + ' kWh');
          }
        }
        // Agua: bimestral (meses pares), variación moderada
        if (mes % 2 === 0 && p !== MES_HOY) {
          const agua = (ocupantes * 2 * real(6.4, 8.6) + real(8, 11)) * parcialMes * 100;
          ins('agua', masDias(costes.sumarMes(p, 1) + '-01', entre(3, 20)), agua, 'Aigües de València', 'Factura bimestral de agua (' + costes.sumarMes(p, -1).slice(5) + '–' + p.slice(5) + '/' + p.slice(0, 4) + ')');
        }
        // Gas: solo en pisos con caldera; bimestral, muy estacional
        if (inm.gas && mes % 2 === 1 && p !== MES_HOY) {
          const gas = (ocupantes * real(8, 11) * ESTACION_GAS[mes - 1] * 2 + real(9, 13)) * parcialMes * 100;
          ins('gas', masDias(costes.sumarMes(p, 1) + '-01', entre(5, 22)), gas, 'Gas Natural Llevant', 'Factura bimestral de gas');
        }
        // Limpieza semanal de zonas comunes (según los lunes del mes)
        if (p < MES_HOY) ins('limpieza', p + '-' + String(diasMes(p)).padStart(2, '0'), lunesDelMes(p) * precioLimpieza * parcialMes * 100, 'Limpiezas Brillo Llevant', lunesDelMes(p) + ' limpiezas semanales de zonas comunes');
        // Otros: seguro anual y pequeñas compras
        if (mes === +inm.desde.slice(5, 7) && p !== MES_HOY) ins('seguros', p + '-' + String(Math.min(28, +inm.desde.slice(8) || 1)).padStart(2, '0'), prima * (1 + 0.03 * (anio - +inm.desde.slice(0, 4))) * 100, 'Seguros Turia Hogar', 'Seguro multirriesgo del hogar (anual)');
        // Impuestos y tasas: tasa de residuos municipal (octubre) y metropolitana (mayo)
        if (mes === 10 && p !== MES_HOY) ins('impuestos', p + '-' + String(entre(10, 25)).padStart(2, '0'), real(72, 118) * (inm.n / 4) * 100, 'Ajuntament de València', 'Tasa de recogida de residuos (TAMER) · anual');
        if (mes === 5 && p !== MES_HOY) ins('impuestos', p + '-' + String(entre(5, 28)).padStart(2, '0'), real(48, 79) * 100, 'Entidad Metropolitana de Residuos', 'Tasa metropolitana de residuos (EMTRE) · anual');
        // Comisiones: anuncio destacado en portales los meses con habitaciones libres
        const libresMes = inm.n - ocupantes;
        if (libresMes > 0 && p !== MES_HOY && prob(0.75)) ins('comisiones', p + '-03', (libresMes > 1 ? 44.9 : 29.9) * 100, 'Portal inmobiliario', 'Anuncio destacado de ' + libresMes + ' habitación(es)');
        if (prob(0.22) && p !== MES_HOY) ins('otros', p + '-' + String(entre(2, 26)).padStart(2, '0'), real(14, 62) * 100, elegir(['Bazar Russafa', 'Ferretería Ciutat', 'Supermercado']), elegir(['Productos de limpieza para zonas comunes', 'Bombillas LED y pilas', 'Reposición de menaje de cocina', 'Protectores de colchón', 'Cortina de ducha y alfombrilla']));
      }
    }

    // ---------- Mantenimientos ----------
    const insMant = (inm, habId, zona, [tipo, categoria, descripcion], fecha, coste, proveedor, estado, quien) => {
      res.mantenimientos++;
      return Number(db.ejecutar('INSERT INTO mantenimientos (inmueble_id, habitacion_id, zona, categoria, tipo, descripcion, fecha, coste, proveedor, estado, creado_por, creado) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        inm.id, habId, zona, categoria, tipo, descripcion, fecha, cent(coste), proveedor, estado, quien, fecha + ' 09:' + String(entre(10, 59)) + ':00').lastInsertRowid);
    };
    const estadoPorFecha = (fecha) => {
      const d = dias(fecha, HOY);
      if (d <= 2) return 'pendiente';
      if (d <= 12) return prob(0.55) ? 'en_curso' : 'terminado';
      return prob(0.03) ? 'cancelado' : 'terminado';
    };
    const facturas = [];
    for (const inm of inmuebles) {
      const tasa = { antiguo: 0.62, medio: 0.42, reformado: 0.24 }[inm.edad] * (inm.n / 4.5);
      for (const p of costes.periodos(inm.desde.slice(0, 7), MES_HOY)) {
        // Número de incidencias del mes (distribución de Poisson): irregular, muchos meses ninguna
        let n = 0, acum = azar();
        while (acum > Math.exp(-tasa) && n < 4) { n++; acum *= azar(); }
        for (let k = 0; k < n; k++) {
          const item = elegir(CATALOGO);
          const fecha = p + '-' + String(entre(1, diasMes(p))).padStart(2, '0');
          if (fecha > HOY) continue;
          const hab = item[3].includes('H') ? elegir(inm.habs) : null;
          const zona = hab ? null : elegir(item[3].filter((z) => z !== 'H'));
          const estado = estadoPorFecha(fecha);
          const coste = estado === 'pendiente' ? 0 : real(item[4], item[5]);
          const id = insMant(inm, hab?.id ?? null, zona, item, fecha, coste, PROV[item[6]], estado, prob(0.6) ? equipo.operativo : equipo.gestion);
          if (estado === 'terminado' && coste > 60 && prob(0.45)) facturas.push({ id, inm, item, fecha, coste, prov: PROV[item[6]] });
        }
      }
      // Ligados a la rotación: limpieza a fondo y pintura tras una salida
      for (const h of inm.habs) for (const c of h.contratos) {
        if (c.fin >= HOY || c.futuro) continue;
        const sig = h.contratos.find((x) => x.inicio > c.fin);
        if (sig && sig.inquilino === c.inquilino) continue; // renovación: no hay salida
        const f = masDias(c.fin, entre(1, 3));
        if (f > HOY) continue;
        if (prob(0.35)) insMant(inm, h.id, null, ['limpieza', 'mantenimiento', 'Limpieza a fondo de la habitación tras la salida del inquilino'], f, real(45, 70), PROV.limpieza, estadoPorFecha(f), equipo.operativo);
        else if (prob(0.14)) insMant(inm, h.id, null, ['pintura', 'mantenimiento', 'Pintura de la habitación y repaso de agujeros'], f, real(165, 290), PROV.pintura, estadoPorFecha(f), equipo.operativo);
      }
      // Habitaciones bloqueadas: el trabajo que las tiene fuera de servicio
      for (const h of inm.habs.filter((x) => x.bloqueada)) {
        const trabajo = elegir([['pintura', 'reparaciones', 'Humedad en la pared exterior: saneado y pintura antihumedad'], ['carpinteria', 'reparaciones', 'Cambio de la ventana de la habitación (no cierra bien)'], ['mobiliario', 'reparaciones', 'Renovación completa del mobiliario de la habitación']]);
        insMant(inm, h.id, null, trabajo, masDias(HOY, -entre(3, 9)), real(240, 620), trabajo[0] === 'pintura' ? PROV.pintura : trabajo[0] === 'carpinteria' ? PROV.carpinteria : PROV.mobiliario, 'en_curso', equipo.gestion);
      }
    }

    // ---------- Situaciones concretas recientes (coherentes con otras secciones) ----------
    const mesPrev = costes.sumarMes(MES_HOY, -1);
    const pares = +mesPrev.slice(5) % 2 === 0;
    // a) Fuga en la cisterna → factura de agua disparada
    const conAgua = inmuebles.filter((i) => i.desde < '2025-06-01');
    const fuga = conAgua[3];
    if (pares) {
      const g = db.uno("SELECT id, importe FROM gastos WHERE inmueble_id = ? AND categoria = 'agua' AND periodo = ?", fuga.id, mesPrev);
      if (g) db.ejecutar("UPDATE gastos SET importe = ?, descripcion = descripcion || ' · consumo anómalo por fuga en la cisterna' WHERE id = ?", Math.round(g.importe * 2.15), g.id);
    }
    insMant(fuga, null, 'Baño', ['fontaneria', 'reparaciones', 'Fuga continua en la cisterna del baño (detectada por la factura del agua)'], masDias(HOY, -entre(9, 14)), real(68, 95), PROV.fontaneria, 'terminado', equipo.operativo);
    // b) Termo con la resistencia en mal estado → factura de luz alta
    const termo = inmuebles.filter((i) => !i.gas && i.desde < '2025-06-01')[5];
    const gl = db.uno("SELECT id, importe FROM gastos WHERE inmueble_id = ? AND categoria = 'electricidad' AND periodo = ?", termo.id, mesPrev);
    if (gl) db.ejecutar("UPDATE gastos SET importe = ?, descripcion = descripcion || ' · consumo muy superior al habitual' WHERE id = ?", Math.round(gl.importe * 1.95), gl.id);
    insMant(termo, null, 'Baño', ['fontaneria', 'reparaciones', 'Termo eléctrico calentando sin parar: revisión del termostato (subida de la factura de luz)'], masDias(HOY, -2), 0, PROV.fontaneria, 'pendiente', equipo.gestion);
    // c) Incidencias abiertas del día a día
    const abiertos = barajar(inmuebles).slice(0, 4);
    insMant(abiertos[0], null, 'Salón', ['persianas', 'reparaciones', 'Persiana del salón atascada a media altura'], masDias(HOY, -1), 0, PROV.persianas, 'pendiente', equipo.operativo);
    insMant(abiertos[1], null, 'Galería', ['electrodomesticos', 'reparaciones', 'La lavadora no centrifuga y deja la ropa empapada'], masDias(HOY, -4), real(88, 120), PROV.electrodomesticos, 'en_curso', equipo.operativo);
    insMant(abiertos[2], elegir(abiertos[2].habs).id, null, ['electricidad', 'reparaciones', 'No funciona la luz del techo de la habitación'], masDias(HOY, 0), 0, PROV.electricidad, 'pendiente', equipo.operativo);
    insMant(abiertos[3], null, 'Cocina', ['plagas', 'mantenimiento', 'Aviso de cucarachas en la cocina: tratamiento programado'], masDias(HOY, -3), real(95, 130), PROV.plagas, 'en_curso', equipo.gestion);

    // ---------- Facturas de ejemplo (PDF) adjuntas a mantenimientos ----------
    const carpeta = path.join(config.DATA, 'documentos');
    fs.mkdirSync(carpeta, { recursive: true, mode: 0o700 });
    for (const f of facturas.slice(-140)) {
      const num = 'F-' + f.fecha.slice(0, 4) + '-' + String(entre(100, 999));
      const base = f.coste / 1.21;
      const pdf = pdfEjemplo([f.prov + ' - FACTURA ' + num, 'DOCUMENTO DE EJEMPLO - DATOS FICTICIOS - SIN VALIDEZ FISCAL', '', 'Fecha: ' + f.fecha.split('-').reverse().join('/'),
        'Cliente: ALKI (demo)  -  Inmueble: ' + f.inm.codigo, '', 'Concepto: ' + f.item[2], '', 'Base imponible: ' + base.toFixed(2) + ' EUR', 'IVA 21%: ' + (f.coste - base).toFixed(2) + ' EUR', 'TOTAL: ' + f.coste.toFixed(2) + ' EUR']);
      const archivo = tokenAleatorio(18) + '.pdf';
      fs.writeFileSync(path.join(carpeta, archivo), pdf, { mode: 0o600 });
      db.ejecutar("INSERT INTO documentos (nombre, archivo, tipo_mime, bytes, entidad, entidad_id, subido_por, creado) VALUES (?, ?, 'application/pdf', ?, 'mantenimiento', ?, ?, ?)",
        'Factura ' + num + ' - ' + f.prov + '.pdf', archivo, pdf.length, f.id, equipo.gestion, f.fecha + ' 18:00:00');
      res.documentos++;
    }

    // ---------- Incidencias del equipo (últimos 4 meses) ----------
    res.incidencias = generarIncidencias(inmuebles, equipo);
    res.ingresos = generarIngresos(equipo);

    // ---------- Registro de actividad de las últimas semanas ----------
    const ips = ['83.47.112.' + entre(2, 250), '88.12.64.' + entre(2, 250), '79.150.20.' + entre(2, 250)];
    for (let d = 21; d >= 0; d--) {
      const f = masDias(HOY, -d);
      const dow = new Date(D(f)).getUTCDay();
      if (dow === 0 || dow === 6) continue;
      for (const [rol, ip] of [['gestion', ips[0]], ['operativo', ips[1]], ['direccion', ips[2]]]) {
        if (rol === 'direccion' && prob(0.5)) continue;
        db.ejecutar("INSERT INTO auditoria (fecha, usuario_id, accion, ip, detalle) VALUES (?, ?, 'acceso.correcto', ?, ?)", f + ' 0' + entre(8, 9) + ':' + String(entre(0, 59)).padStart(2, '0') + ':00', equipo[rol], ip, rol === 'direccion' ? 'con MFA' : null);
      }
      for (const p of db.todos("SELECT p.id, p.importe FROM pagos p WHERE p.pagado_el = ? AND p.metodo <> 'Domiciliación' LIMIT 12", f))
        db.ejecutar("INSERT INTO auditoria (fecha, usuario_id, accion, entidad, entidad_id, ip, detalle) VALUES (?, ?, 'pago.cobrado', 'pago', ?, ?, ?)", f + ' 1' + entre(0, 8) + ':' + String(entre(0, 59)).padStart(2, '0') + ':00', equipo.gestion, p.id, ips[0], JSON.stringify({ cobrado: p.importe }));
      for (const m of db.todos('SELECT id FROM mantenimientos WHERE fecha = ?', f))
        db.ejecutar("INSERT INTO auditoria (fecha, usuario_id, accion, entidad, entidad_id, ip) VALUES (?, ?, 'mantenimiento.crear', 'mantenimiento', ?, ?)", f + ' 1' + entre(0, 9) + ':' + String(entre(0, 59)).padStart(2, '0') + ':00', equipo.operativo, m.id, ips[1]);
    }
    // ---------- Uso de la plataforma (sesiones y apartados de los últimos 60 días) ----------
    const HABITOS = {
      gestion: { sesiones: [2, 4], min: [12, 55], apartados: { Panel: 3, Pagos: 4, Incidencias: 3, Contratos: 2, Habitaciones: 2, 'Gastos y costes': 2, Ingresos: 1, Inmuebles: 1 } },
      operativo: { sesiones: [1, 3], min: [4, 18], apartados: { Incidencias: 6, Mantenimientos: 4, Panel: 2, Inmuebles: 1, Habitaciones: 1 } },
      direccion: { sesiones: [0, 2], min: [8, 30], apartados: { Panel: 3, Beneficios: 3, Estadísticas: 2, 'Gastos y costes': 2, Pagos: 1 } },
      admin: { sesiones: [1, 2], min: [10, 40], apartados: { Panel: 3, Beneficios: 2, Incidencias: 2, Configuración: 1, Pagos: 1, Estadísticas: 1 } }
    };
    for (const [rol, h] of Object.entries(HABITOS)) {
      for (let k = 60; k >= 1; k--) {
        const f = masDias(HOY, -k);
        const dow = new Date(D(f)).getUTCDay();
        if ((dow === 0 || dow === 6) && !prob(0.12)) continue;
        const n = entre(...h.sesiones);
        for (let j = 0; j < n; j++) {
          const ini = D(f) - 3 * 3600000 + entre(0, 9) * 3600000 + entre(0, 59) * 60000; // entre las 9:00 y las 18:59 aprox.
          const dur = entre(...h.min) * 60000;
          db.ejecutar('INSERT INTO uso_sesiones (usuario_id, inicio, fin, motivo) VALUES (?, ?, ?, ?)', equipo[rol], ini, ini + dur, prob(0.6) ? 'inactividad' : 'salida');
          for (const [ap, peso] of Object.entries(h.apartados)) {
            const veces = Math.round(peso * real(0.3, 1.4) * dur / 900000);
            if (veces > 0) db.ejecutar('INSERT INTO uso_apartados (usuario_id, fecha, apartado, n) VALUES (?, ?, ?, ?) ON CONFLICT(usuario_id, fecha, apartado) DO UPDATE SET n = n + excluded.n', equipo[rol], f, ap, veces);
          }
        }
      }
    }
    db.ejecutar("INSERT INTO auditoria (fecha, usuario_id, accion, ip, detalle) VALUES (?, NULL, 'acceso.fallido', '185.220.101.' || ?, 'correo desconocido')", masDias(HOY, -6) + ' 03:14:00', entre(2, 250));
    db.ejecutar("INSERT INTO auditoria (fecha, usuario_id, accion, ip, detalle) VALUES (?, NULL, 'acceso.bloqueado_ip', '185.220.101.' || ?, 'login')", masDias(HOY, -6) + ' 03:16:00', entre(2, 250));
  });

  // Gastos fijos de todos los meses (alquiler, internet) a partir de las plantillas
  costes.generarRecurrentes();
  // Ajustes de la demo
  db.guardarAjuste('dias_aviso_salida', 60);
  db.guardarAjuste('dia_vencimiento', 5);
  db.guardarAjuste('tipo_impuesto_beneficios', 23);
  db.guardarAjuste('gastos_generales_mes', 215000);
  db.guardarAjuste('gastos_generales_detalle', 'Gestoría 190 € · software y CRM 120 € · oficina 640 € · teléfono 60 € · publicidad de marca 240 € · asesoría legal 90 € · parte de sueldos 810 €');

  const n = (t, w = '') => db.uno('SELECT COUNT(*) AS n FROM ' + t + ' ' + w).n;
  console.log('Demo cargada (datos ficticios):');
  console.log('  ' + res.inmuebles + ' inmuebles · ' + res.habitaciones + ' habitaciones · ' + res.contratos + ' contratos · ' + n('inquilinos') + ' inquilinos');
  console.log('  ' + res.recibos + ' recibos · ' + n('gastos') + ' gastos · ' + res.mantenimientos + ' mantenimientos · ' + res.incidencias + ' incidencias · ' + res.ingresos + ' ingresos manuales · ' + res.documentos + ' facturas PDF de ejemplo');
  console.log('Usuarios de prueba (contraseña ' + (process.env.DEMO_CLAVE ? 'la de la variable DEMO_CLAVE' : claveDemo) + '):');
  console.log('  gestion@demo.alki (Marta Soriano) · operativo@demo.alki (Javier Peris) · direccion@demo.alki (Lucía Andreu, pide MFA)');
}
main();
