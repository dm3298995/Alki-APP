/* ==========================================================================
   nube.js — CONEXIÓN DEL PANEL CON FIREBASE (datos compartidos del equipo)
   --------------------------------------------------------------------------
   Sin Firebase, cada móvil guarda su propia copia de los datos.
   Con Firebase (rellenando «firebase» en js/config.js):
     · El equipo entra con su correo y una contraseña de Firebase Authentication.
       La primera vez se crea la cuenta y hay que confirmar el correo.
     · Solo entra quien esté en la lista «equipo» de Firestore (la gestiona el
       encargado desde «Equipo y permisos»). Lo comprueban las reglas de
       seguridad de Firestore (archivo firestore.rules), no solo la app.
     · Todos los datos (viviendas, contratos, cobros, incidencias, gastos…) se
       guardan en Firestore y se ven al momento en los móviles de los demás.
     · El primer correo que entra cuando la base de datos está vacía se queda
       como encargado y sube los datos iniciales.

   Cómo se guarda en Firestore:
     equipo/{correo}          → una persona del equipo (nombre, puesto, permisos…)
     ajustes/encargado        → quién es el encargado (se fija una sola vez)
     d_{lista}/{id}           → cada registro: { j: JSON del registro, o: orden }
                                p. ej. d_incidencias/in1, d_pagos/v002-h5-…|2025-03
     d_ajustes/general        → datos sueltos (origen, fecha de importación…)
   ========================================================================== */
window.Alki = window.Alki || {};

Alki.nube = (function () {
  const cfg = (Alki.config && Alki.config.firebase) || {};
  const activa = !!(cfg.apiKey && cfg.projectId);
  const SDK = ['assets/vendor/firebase/firebase-app-compat.js', 'assets/vendor/firebase/firebase-auth-compat.js', 'assets/vendor/firebase/firebase-firestore-compat.js'];
  // Listas que se guardan al principio (lo más nuevo arriba)
  const AL_PRINCIPIO = ['social', 'actividad'];
  const ESPECIALES = ['equipo'];
  const LIMITE_DOC = 900 * 1024; // Firestore admite hasta 1 MB por registro

  let fb = null, auth = null, fs = null;
  let usuario = null;
  let listo = false;            // ya se han descargado los datos compartidos
  let espejo = {};              // lo último que hay en la nube: lista → Map(clave → { j, o })
  let espejoEquipo = new Map(); // correo → JSON
  let espejoAjustes = null;
  let escuchas = [];
  let temporizador = null;
  let subiendo = Promise.resolve();
  let alCambiar = null;         // función para repintar la pantalla
  let estado = 'sin-conexion';  // 'sin-conexion' | 'conectando' | 'conectado' | 'error'
  let ultimoError = '';

  /* ---------- Carga del SDK de Firebase (incluido en la web, no depende de otra página) ---------- */
  function cargarScript(src) {
    return new Promise(function (ok, mal) {
      if (document.querySelector('script[data-sdk="' + src + '"]')) return ok();
      const s = document.createElement('script');
      s.src = src; s.async = false; s.dataset.sdk = src;
      s.onload = ok; s.onerror = () => mal(new Error('No se pudo cargar ' + src));
      document.head.appendChild(s);
    });
  }

  let iniciando = null;
  function iniciar() {
    if (!activa) return Promise.resolve(null);
    if (iniciando) return iniciando;
    iniciando = (window.firebase && window.firebase.firestore ? Promise.resolve() : SDK.reduce((p, src) => p.then(() => cargarScript(src)), Promise.resolve()))
      .then(function () {
        fb = window.firebase;
        const app = fb.apps.length ? fb.app() : fb.initializeApp({ apiKey: cfg.apiKey, authDomain: cfg.authDomain || cfg.projectId + '.firebaseapp.com', projectId: cfg.projectId, appId: cfg.appId });
        auth = app.auth();
        auth.languageCode = 'es';
        fs = app.firestore();
        // Copia en el móvil: abre más rápido y funciona un rato sin conexión
        try { fs.enablePersistence({ synchronizeTabs: true }).catch(function () { /* otro navegador: sigue sin copia */ }); } catch (e) { /* nada */ }
        return new Promise(function (ok) {
          const quitar = auth.onAuthStateChanged(function (u) { usuario = u; quitar(); ok(u); });
        });
      });
    return iniciando;
  }

  const correo = () => (usuario && usuario.email ? usuario.email.toLowerCase() : '');
  const traducir = function (e) {
    const c = (e && e.code) || '';
    const textos = {
      'auth/invalid-credential': 'El correo o la contraseña no son correctos. Si es tu primera vez, pulsa «Es mi primera vez».',
      'auth/wrong-password': 'La contraseña no es correcta.',
      'auth/user-not-found': 'Todavía no has creado tu contraseña. Pulsa «Es mi primera vez».',
      'auth/email-already-in-use': 'Ya tienes cuenta con este correo. Entra con tu contraseña o pulsa «¿Has olvidado tu contraseña?».',
      'auth/weak-password': 'La contraseña es demasiado débil. Usa al menos 8 caracteres.',
      'auth/invalid-email': 'Ese correo no es válido.',
      'auth/too-many-requests': 'Demasiados intentos. Espera unos minutos y vuelve a probar.',
      'auth/network-request-failed': 'No hay conexión a internet.',
      'permission-denied': 'No tienes permiso para esto. Habla con el encargado.'
    };
    return textos[c] || (e && e.message) || 'Algo ha fallado.';
  };

  /* ---------- Cuenta ---------- */
  function entrar(email, clave) {
    return iniciar().then(() => auth.signInWithEmailAndPassword(email.trim(), clave)).then((r) => { usuario = r.user; return r.user; });
  }
  function crearCuenta(email, clave) {
    return iniciar().then(() => auth.createUserWithEmailAndPassword(email.trim(), clave)).then(function (r) {
      usuario = r.user;
      return r.user.sendEmailVerification().then(() => r.user);
    });
  }
  function reenviarVerificacion() { return usuario ? usuario.sendEmailVerification() : Promise.resolve(); }
  function recargarUsuario() { return usuario ? usuario.reload().then(() => { usuario = auth.currentUser; return usuario; }) : Promise.resolve(null); }
  function olvido(email) { return iniciar().then(() => auth.sendPasswordResetEmail(email.trim())); }
  function salir() {
    escuchas.forEach((f) => { try { f(); } catch (e) { /* nada */ } });
    escuchas = []; listo = false; espejo = {}; espejoEquipo = new Map(); espejoAjustes = null; estado = 'sin-conexion';
    return auth ? auth.signOut().then(() => { usuario = null; }) : Promise.resolve();
  }

  /* ---------- Equipo ---------- */
  function fichaEquipo(email) {
    return fs.collection('equipo').doc(email.toLowerCase()).get().then((d) => (d.exists ? d.data() : null));
  }
  function hayEncargado() {
    return fs.collection('ajustes').doc('encargado').get().then((d) => d.exists);
  }
  // Primer acceso a una base de datos vacía: quien entra se queda como encargado
  function crearEncargado(datos) {
    const email = correo();
    const ficha = limpiarMiembro(Object.assign({}, datos, { email, superadmin: true, activo: true }));
    const lote = fs.batch();
    lote.set(fs.collection('ajustes').doc('encargado'), { email, fecha: new Date().toISOString() });
    lote.set(fs.collection('equipo').doc(email), ficha);
    return lote.commit().then(() => ficha);
  }
  function aceptarConfidencialidad() {
    const fecha = new Date().toISOString();
    return fs.collection('equipo').doc(correo()).update({ confidencialidad: fecha }).then(() => fecha);
  }
  function limpiarMiembro(m) {
    const r = {};
    ['id', 'nombre', 'email', 'puesto', 'superadmin', 'activo', 'permisos', 'creado', 'confidencialidad'].forEach((k) => { if (m[k] !== undefined && m[k] !== null) r[k] = m[k]; });
    r.email = String(r.email || '').toLowerCase();
    r.superadmin = !!r.superadmin; r.activo = r.activo !== false;
    r.permisos = Object.assign({}, r.permisos || {});
    return r;
  }

  /* ---------- Claves y orden de los registros ---------- */
  function hash(texto) { let h = 5381; for (let i = 0; i < texto.length; i++) h = ((h << 5) + h + texto.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
  function claveDe(r) {
    const k = r && (r.id || (r.email ? 'u:' + r.email : null)) || 'h:' + hash(JSON.stringify(r));
    return String(k).replace(/\//g, '∕').slice(0, 700);
  }
  const listas = (db) => Object.keys(db).filter((k) => Array.isArray(db[k]) && !ESPECIALES.includes(k));
  const sueltos = (db) => { const r = {}; Object.keys(db).forEach((k) => { if (!Array.isArray(db[k])) r[k] = db[k]; }); return r; };

  /* ---------- Subir los cambios del móvil a la nube ---------- */
  // Compara los datos con lo último que hay en la nube y escribe solo lo que ha cambiado
  function prepararCambios() {
    const db = Alki.store.db;
    const ops = [];
    const ahora = Date.now();
    listas(db).forEach(function (lista) {
      const mapa = espejo[lista] || (espejo[lista] = new Map());
      const vistos = new Set();
      const inicio = AL_PRINCIPIO.includes(lista);
      db[lista].forEach(function (r, i) {
        const k = claveDe(r);
        if (vistos.has(k)) return; // duplicado exacto: se guarda una vez
        vistos.add(k);
        const j = JSON.stringify(r);
        const antes = mapa.get(k);
        if (antes && antes.j === j) return;
        if (j.length > LIMITE_DOC) { console.warn('Registro demasiado grande para la nube:', lista, k); return; }
        // El orden se fija al crear el registro y no cambia después
        const o = antes ? antes.o : (mapa.size === 0 && !espejoAjustes ? (inicio ? -i : i) : (inicio ? -(ahora * 1000 + i) : ahora * 1000 + i));
        mapa.set(k, { j, o });
        ops.push({ tipo: 'set', ref: fs.collection('d_' + lista).doc(k), datos: { j, o } });
      });
      Array.from(mapa.keys()).forEach(function (k) {
        if (!vistos.has(k)) { mapa.delete(k); ops.push({ tipo: 'del', ref: fs.collection('d_' + lista).doc(k) }); }
      });
    });
    // Datos sueltos (origen, fecha de importación…)
    const s = JSON.stringify(sueltos(db));
    if (s !== espejoAjustes) { espejoAjustes = s; ops.push({ tipo: 'set', ref: fs.collection('d_ajustes').doc('general'), datos: { j: s, o: 0 } }); }
    // El equipo solo lo puede cambiar el encargado
    const yo = (db.equipo || []).find((m) => (m.email || '').toLowerCase() === correo());
    if (yo && yo.superadmin) {
      const vistos = new Set();
      (db.equipo || []).forEach(function (m) {
        const ficha = limpiarMiembro(m);
        if (!ficha.email) return;
        vistos.add(ficha.email);
        const j = JSON.stringify(ficha);
        if (espejoEquipo.get(ficha.email) === j) return;
        espejoEquipo.set(ficha.email, j);
        ops.push({ tipo: 'set', ref: fs.collection('equipo').doc(ficha.email), datos: ficha });
      });
      Array.from(espejoEquipo.keys()).forEach(function (e) {
        if (!vistos.has(e) && e !== correo()) { espejoEquipo.delete(e); ops.push({ tipo: 'del', ref: fs.collection('equipo').doc(e) }); }
      });
    }
    return ops;
  }
  function escribir(ops) {
    if (!ops.length) return Promise.resolve();
    // Firestore admite hasta 500 operaciones por lote
    const lotes = [];
    for (let i = 0; i < ops.length; i += 450) lotes.push(ops.slice(i, i + 450));
    return lotes.reduce(function (p, trozo) {
      return p.then(function () {
        const b = fs.batch();
        trozo.forEach((op) => (op.tipo === 'set' ? b.set(op.ref, op.datos) : b.delete(op.ref)));
        return b.commit();
      });
    }, Promise.resolve()).catch(function (e) {
      estado = 'error'; ultimoError = traducir(e);
      console.error('No se pudo guardar en la nube', e);
      if (Alki.ui && Alki.ui.toast) Alki.ui.toast('No se ha podido guardar en la nube: ' + ultimoError);
    });
  }
  function subirYa() {
    clearTimeout(temporizador); temporizador = null;
    if (!listo || !fs) return subiendo;
    const ops = prepararCambios();
    subiendo = subiendo.then(() => escribir(ops));
    return subiendo;
  }
  // Se llama cada vez que la app guarda (store.guardar)
  function alGuardar() {
    if (!listo) return;
    clearTimeout(temporizador);
    temporizador = setTimeout(subirYa, 300);
  }

  /* ---------- Recibir los cambios de los demás ---------- */
  function reconstruir(lista) {
    const mapa = espejo[lista] || new Map();
    const valores = Array.from(mapa.values()).sort((a, b) => a.o - b.o);
    const arr = [];
    valores.forEach(function (v) { try { arr.push(JSON.parse(v.j)); } catch (e) { /* registro dañado: se ignora */ } });
    Alki.store.db[lista] = arr;
  }
  function reconstruirEquipo() {
    const locales = {};
    (Alki.store.db.equipo || []).forEach((m) => { locales[(m.email || '').toLowerCase()] = m; });
    Alki.store.db.equipo = Array.from(espejoEquipo.values()).map(function (j) {
      const m = JSON.parse(j);
      m.id = m.id || 'eq-' + hash(m.email);
      m.clave = null; // la contraseña la guarda Firebase, no la app
      return m;
    }).sort((a, b) => (b.superadmin ? 1 : 0) - (a.superadmin ? 1 : 0) || String(a.creado || '').localeCompare(String(b.creado || '')));
  }
  let repintarPendiente = false;
  function avisarCambio() {
    if (!listo) return;
    Alki.store.guardarLocal();
    if (repintarPendiente) return;
    repintarPendiente = true;
    (function intentar() {
      // No se repinta mientras alguien escribe en un formulario o tiene una ventana abierta
      const foco = document.activeElement;
      const escribiendo = foco && /^(INPUT|TEXTAREA|SELECT)$/.test(foco.tagName);
      const modal = document.querySelector('.modal-fondo');
      if (escribiendo || modal) { setTimeout(intentar, 1500); return; }
      repintarPendiente = false;
      if (alCambiar) alCambiar();
    })();
  }

  // Si a esta persona la quitan o la desactivan, Firestore deja de darle datos: se cierra su sesión
  let retirando = false;
  function retirarAcceso() {
    if (retirando) return;
    retirando = true;
    salir().then(function () {
      retirando = false;
      if (Alki.ui) Alki.ui.toast('Tu acceso al panel se ha retirado. Habla con el encargado.');
      if (alCambiar) alCambiar();
    });
  }
  const errorEscucha = (e) => { if (e && e.code === 'permission-denied') { if (listo) retirarAcceso(); } else console.error(e); };

  // Descarga todo y se queda escuchando cambios. Devuelve una promesa que se cumple
  // cuando los datos de la nube ya están en el móvil.
  function conectar(opciones) {
    opciones = opciones || {};
    alCambiar = opciones.alCambiar || alCambiar;
    estado = 'conectando';
    const db = Alki.store.db;
    // Listas que puede haber en la nube aunque este móvil no las tenga todavía
    const nombres = Array.from(new Set(listas(db).concat(['propietarios', 'viviendas', 'habitaciones', 'inquilinos', 'contratos', 'pagos', 'usuarios', 'avisosDatos', 'incidencias', 'reformas', 'avisos', 'referidos', 'mensajes', 'solicitudes', 'documentos', 'social', 'actividad', 'costes'])));
    let pendientes = nombres.length + 2;
    let terminado;
    const primeraCarga = new Promise((ok) => { terminado = ok; });
    const unoMenos = () => { if (--pendientes === 0) terminado(); };
    const fallo = (e) => { estado = 'error'; ultimoError = traducir(e); console.error(e); terminado(); };

    nombres.forEach(function (lista) {
      let primera = true;
      espejo[lista] = espejo[lista] || new Map();
      escuchas.push(fs.collection('d_' + lista).onSnapshot(function (snap) {
        if (listo) subirYaSincrono();
        let cambio = false;
        snap.docChanges().forEach(function (c) {
          if (c.doc.metadata.hasPendingWrites) return; // es un cambio nuestro que aún se está enviando
          const k = c.doc.id;
          if (c.type === 'removed') { if (espejo[lista].delete(k)) cambio = true; return; }
          const d = c.doc.data();
          const antes = espejo[lista].get(k);
          if (!antes || antes.j !== d.j) { espejo[lista].set(k, { j: d.j, o: d.o || 0 }); cambio = true; }
        });
        if (primera) { primera = false; unoMenos(); }
        if (cambio && listo) { reconstruir(lista); avisarCambio(); }
      }, function (e) { if (primera) { primera = false; fallo(e); } else errorEscucha(e); }));
    });
    let primeraEq = true;
    escuchas.push(fs.collection('equipo').onSnapshot(function (snap) {
      let cambio = false;
      snap.docChanges().forEach(function (c) {
        if (c.doc.metadata.hasPendingWrites) return;
        if (c.type === 'removed') { if (espejoEquipo.delete(c.doc.id)) cambio = true; return; }
        const j = JSON.stringify(limpiarMiembro(c.doc.data()));
        if (espejoEquipo.get(c.doc.id) !== j) { espejoEquipo.set(c.doc.id, j); cambio = true; }
      });
      if (primeraEq) { primeraEq = false; unoMenos(); }
      if (cambio && listo) {
        reconstruirEquipo();
        // Si a esta persona la han quitado o desactivado, se cierra su sesión
        const yo = Alki.store.db.equipo.find((m) => m.email === correo());
        if (!yo || !yo.activo) { retirarAcceso(); return; }
        avisarCambio();
      }
    }, function (e) { if (primeraEq) { primeraEq = false; fallo(e); } else errorEscucha(e); }));
    let primeraAj = true;
    escuchas.push(fs.collection('d_ajustes').doc('general').onSnapshot(function (d) {
      const j = d.exists ? d.data().j : null;
      const primeraVez = primeraAj; primeraAj = false;
      if (j && j !== espejoAjustes && !d.metadata.hasPendingWrites) {
        espejoAjustes = j;
        if (listo) { try { Object.assign(Alki.store.db, JSON.parse(j)); } catch (e) { /* nada */ } avisarCambio(); }
      }
      if (primeraVez) unoMenos();
    }, function (e) { if (primeraAj) { primeraAj = false; fallo(e); } else errorEscucha(e); }));

    return primeraCarga.then(function () {
      if (estado === 'error') throw new Error(ultimoError);
      const db = Alki.store.db;
      const nubeVacia = espejoAjustes === null && nombres.every((l) => !espejo[l] || espejo[l].size === 0);
      if (nubeVacia) {
        // Base de datos recién creada: este móvil sube lo que tiene (solo lo hace el encargado)
        espejo = {}; espejoAjustes = null;
        listo = true; estado = 'conectado';
        reconstruirEquipo();
        return subirYa().then(() => 'subido');
      }
      // La nube manda: se sustituyen los datos del móvil por los compartidos
      Object.keys(db).forEach((k) => { if (Array.isArray(db[k]) && !ESPECIALES.includes(k)) db[k] = []; });
      if (espejoAjustes) { try { Object.assign(db, JSON.parse(espejoAjustes)); } catch (e) { /* nada */ } }
      Object.keys(espejo).forEach(reconstruir);
      reconstruirEquipo();
      listo = true; estado = 'conectado';
      Alki.store.guardarLocal();
      return 'descargado';
    });
  }
  function subirYaSincrono() {
    // Antes de aplicar un cambio de otra persona, se envían los nuestros pendientes
    if (temporizador) subirYa();
  }

  return {
    activa, iniciar, entrar, crearCuenta, reenviarVerificacion, recargarUsuario, olvido, salir,
    fichaEquipo, hayEncargado, crearEncargado, aceptarConfidencialidad, conectar, alGuardar, subirYa,
    usuario: () => usuario, correo, listo: () => listo, estado: () => estado, error: () => ultimoError, traducir
  };
})();

// Cada vez que la app guarda, también se sube a la nube
Alki.alGuardar = function () { if (Alki.nube.activa) Alki.nube.alGuardar(); };
