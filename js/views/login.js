/* ==========================================================================
   login.js — PANTALLA DE ACCESO
   --------------------------------------------------------------------------
   Flujo:
     1. El usuario escribe su correo.
     2. Si comparten correo varias personas (parejas) → elige quién es.
     3. Si aún no tiene contraseña → la crea (primer acceso).
        Si ya tiene → la escribe. Si la olvidó → crea una nueva.
   Abajo hay un acceso plegado para probar la app con cualquier perfil.
   ========================================================================== */
window.Alki = window.Alki || {};
Alki.vistas = Alki.vistas || {};

Alki.vistas.login = function () {
  if (Alki.nube && Alki.nube.activa) return Alki.vistas.loginNube();
  const U = Alki.ui, S = Alki.store, C = Alki.constantes, esc = U.esc;
  const db = S.db;
  const inquilinos = db.contratos.map(function (c) {
    const h = S.buscar('habitaciones', c.habitacionId), v = S.buscar('viviendas', h.viviendaId);
    return { id: c.inquilinoId, etiqueta: v.codigo + '-' + h.codigo + ' · ' + S.buscar('inquilinos', c.inquilinoId).nombre, orden: v.numero + h.codigo };
  }).sort((a, b) => a.orden.localeCompare(b.orden, 'es', { numeric: true }));
  const propietarios = db.propietarios.slice().sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  return {
    titulo: 'Acceso',
    html:
      '<div class="entrada">' +
        '<div class="entrada__caja">' +
          '<div class="entrada__logo logo logo--grande">' + Alki.marca + '</div>' +
          '<p class="entrada__lema">Más que un contrato, una familia.</p>' +
          '<div id="paso" aria-live="polite"></div>' +
          '<details class="probar"><summary>Probar con otro perfil</summary>' +
            '<button class="boton boton--sec boton--bloque" type="button" id="entrar-admin">Equipo ALKI</button>' +
            '<label class="oculto" for="sel-inq">Inquilino</label><div class="chat-form"><select id="sel-inq">' +
              inquilinos.map((i) => '<option value="' + i.id + '">' + esc(i.etiqueta) + '</option>').join('') + '</select>' +
              '<button class="boton boton--sec" type="button" id="entrar-inq">Inquilino</button></div>' +
            '<label class="oculto" for="sel-prop">Propietario</label><div class="chat-form"><select id="sel-prop">' +
              propietarios.map((p) => '<option value="' + p.id + '">' + esc(p.nombre) + '</option>').join('') + '</select>' +
              '<button class="boton boton--sec" type="button" id="entrar-prop">Propietario</button></div>' +
          '</details>' +
        '</div>' +
        '<a class="entrada__ayuda" href="https://wa.me/' + C.contacto.whatsapp + '" target="_blank" rel="noopener">¿Necesitas ayuda? Escríbenos</a>' +
      '</div>',

    montar: function (raiz) {
      const caja = raiz.querySelector('#paso');
      let correo = '';
      const irAlInicio = (s) => Alki.app.ir(Alki.app.inicioDe(s.rol));
      function error(texto) {
        const e = caja.querySelector('.error-form');
        e.innerHTML = texto; e.hidden = false;
      }
      function pintar(html, alMontar) {
        caja.innerHTML = html;
        const primero = caja.querySelector('input, button');
        if (primero) primero.focus();
        if (alMontar) alMontar();
      }
      const volver = '<button class="enlace entrada__cambiar" type="button" data-volver>Usar otro correo</button>';

      /* ---------- Paso 1: correo ---------- */
      function pasoCorreo() {
        pintar('<h1>Entra en tu cuenta</h1>' +
          '<form novalidate><div class="campo"><label for="email">Correo</label>' +
          '<input id="email" type="email" autocomplete="username" required value="' + esc(correo) + '" placeholder="tu@correo.com"></div>' +
          '<p class="error-form" hidden></p><button class="boton boton--bloque" type="submit">Continuar</button></form>' +
          (Alki.config && Alki.config.modoPrueba ? '<p class="pista-prueba">¿Vienes a probarla? Entra con <b>lucia@demo.alki</b> (la primera vez eliges tu contraseña) o usa «Probar con otro perfil» más abajo.</p>' : ''),
          function () {
            caja.querySelector('form').addEventListener('submit', function (e) {
              e.preventDefault();
              correo = caja.querySelector('#email').value.trim();
              if (!/^\S+@\S+\.\S+$/.test(correo)) return error('Escribe un correo válido.');
              const cuentas = S.usuariosPorEmail(correo);
              if (!cuentas.length) return error('No encontramos ese correo. <a href="https://wa.me/' + C.contacto.whatsapp + '" target="_blank" rel="noopener">Escríbenos</a> y te damos de alta.');
              if (cuentas.length > 1) return pasoElegir(cuentas);
              siguiente(cuentas[0]);
            });
          });
      }
      function siguiente(u) { if (u.clave) pasoClave(u); else pasoCrear(u, true); }

      /* ---------- Paso 2 (solo si comparten correo) ---------- */
      function pasoElegir(cuentas) {
        pintar('<h1>¿Quién eres?</h1><p class="entrada__texto">Este correo lo compartís varias personas.</p>' +
          '<div class="entrada__opciones">' + cuentas.map((u, n) => '<button class="boton boton--sec boton--bloque" type="button" data-n="' + n + '">' + esc(u.nombre) + '</button>').join('') + '</div>' + volver,
          function () {
            caja.querySelectorAll('[data-n]').forEach((b) => b.addEventListener('click', () => siguiente(cuentas[Number(b.dataset.n)])));
            caja.querySelector('[data-volver]').addEventListener('click', pasoCorreo);
          });
      }

      /* ---------- Paso 3a: escribir la contraseña ---------- */
      function pasoClave(u) {
        pintar('<h1>Hola, ' + esc(U.primerNombre(u.nombre)) + '</h1><p class="entrada__texto">' + esc(u.email) + '</p>' +
          '<form novalidate><div class="campo"><label for="clave">Contraseña</label>' +
          '<input id="clave" type="password" autocomplete="current-password" required></div>' +
          '<p class="error-form" hidden></p><button class="boton boton--bloque" type="submit">Entrar</button></form>' +
          '<div class="entrada__enlaces"><button class="enlace" type="button" id="olvido">¿Has olvidado tu contraseña?</button>' + volver + '</div>',
          function () {
            caja.querySelector('form').addEventListener('submit', function (e) {
              e.preventDefault();
              S.comprobarContrasena(u, caja.querySelector('#clave').value).then(function (ok) {
                if (ok) irAlInicio(S.entrarComo(u.rol, u.refId));
                else error('La contraseña no es correcta.');
              });
            });
            caja.querySelector('#olvido').addEventListener('click', () => pasoCrear(u, false));
            caja.querySelector('[data-volver]').addEventListener('click', pasoCorreo);
          });
      }

      /* ---------- Paso 3b: crear contraseña (primer acceso u olvido) ---------- */
      function pasoCrear(u, primeraVez) {
        pintar('<h1>' + (primeraVez ? 'Crea tu contraseña' : 'Nueva contraseña') + '</h1>' +
          '<p class="entrada__texto">' + (primeraVez ? 'Es tu primera vez, ' + esc(U.primerNombre(u.nombre)) + '. Elige una contraseña para entrar.' : esc(u.email)) + '</p>' +
          '<form novalidate>' +
            '<div class="campo"><label for="nueva">Contraseña</label><input id="nueva" type="password" autocomplete="new-password" minlength="8" required>' +
            '<p class="campo__ayuda">Mínimo 8 caracteres.</p></div>' +
            '<div class="campo"><label for="repite">Repite la contraseña</label><input id="repite" type="password" autocomplete="new-password" required></div>' +
            '<label class="interruptor campo pequeno"><input type="checkbox" id="ver"> Mostrar contraseña</label>' +
            (primeraVez ? '<div class="consentimientos">' +
              '<label class="casilla"><input type="checkbox" id="acepto"><span>He leído y acepto la <a href="#" data-legal="privacidad">Política de privacidad (RGPD)</a> y los <a href="#" data-legal="terminos">Términos de uso</a>.</span></label>' +
              (u.rol === 'inquilino' ? '<label class="casilla"><input type="checkbox" id="social"><span>Quiero unirme a ALKI Social. Otros residentes verán mi nombre y mi vivienda. <em>Opcional.</em></span></label>' : '') +
            '</div>' : '') +
            '<p class="error-form" hidden></p><button class="boton boton--bloque" type="submit">' + (primeraVez ? 'Crear cuenta y entrar' : 'Guardar y entrar') + '</button></form>' + volver,
          function () {
            const nueva = caja.querySelector('#nueva'), repite = caja.querySelector('#repite');
            caja.querySelector('#ver').addEventListener('change', function () { nueva.type = repite.type = this.checked ? 'text' : 'password'; });
            caja.querySelector('form').addEventListener('submit', function (e) {
              e.preventDefault();
              if (nueva.value.length < 8) return error('La contraseña debe tener al menos 8 caracteres.');
              if (nueva.value !== repite.value) return error('Las dos contraseñas no coinciden.');
              const acepto = caja.querySelector('#acepto');
              if (acepto && !acepto.checked) return error('Para crear tu cuenta tienes que aceptar la política de privacidad y los términos de uso.');
              const social = caja.querySelector('#social');
              S.crearContrasena(u, nueva.value, primeraVez ? { social: !!(social && social.checked) } : null)
                .then(function (s) { U.toast(primeraVez ? 'Cuenta creada' : 'Contraseña cambiada'); irAlInicio(s); });
            });
            caja.querySelector('[data-volver]').addEventListener('click', pasoCorreo);
          });
      }

      pasoCorreo();

      /* ---------- Acceso de prueba ---------- */
      const como = (rol, id) => { const s = S.entrarComo(rol, id); if (s) irAlInicio(s); };
      raiz.querySelector('#entrar-admin').addEventListener('click', () => como('admin', null));
      raiz.querySelector('#entrar-inq').addEventListener('click', () => como('inquilino', raiz.querySelector('#sel-inq').value));
      raiz.querySelector('#entrar-prop').addEventListener('click', () => como('propietario', raiz.querySelector('#sel-prop').value));
    }
  };
};


/* ==========================================================================
   ACCESO CON FIREBASE (datos reales)
   Cada inquilino o propietario entra con el correo que tiene en ALKI:
     1. Correo y contraseña (la primera vez la crea y confirma su correo).
     2. Se comprueba que el correo está en ALKI y se descargan solo sus datos.
     3. Si comparten correo varias personas, elige quién es.
     4. La primera vez acepta la privacidad y los términos.
   ========================================================================== */
Alki.vistas.loginNube = function () {
  const U = Alki.ui, S = Alki.store, C = Alki.constantes, N = Alki.nube, esc = U.esc;
  return {
    titulo: 'Acceso',
    html:
      '<div class="entrada"><div class="entrada__caja">' +
        '<div class="entrada__logo logo logo--grande">' + Alki.marca + '</div>' +
        '<p class="entrada__lema">Más que un contrato, una familia.</p>' +
        '<div id="paso" aria-live="polite"></div>' +
      '</div>' +
      '<a class="entrada__ayuda" href="https://wa.me/' + C.contacto.whatsapp + '" target="_blank" rel="noopener">¿Necesitas ayuda? Escríbenos</a></div>',
    montar: function (raiz) {
      const caja = raiz.querySelector('#paso');
      let correo = (N.usuario() && N.usuario().email) || '';
      const valido = (e) => /^\S+@\S+\.\S+$/.test(e);
      const error = (t) => { const e = caja.querySelector('.error-form'); if (e) { e.innerHTML = t; e.hidden = false; } };
      const pintar = (html, fn) => { caja.innerHTML = html; const f = caja.querySelector('input'); if (f) f.focus(); if (fn) fn(); };
      const ocupado = (b, si) => { if (!b) return; b.disabled = si; b.dataset.texto = b.dataset.texto || b.textContent; b.textContent = si ? 'Un momento…' : b.dataset.texto; };
      const otro = '<button class="enlace entrada__cambiar" type="button" data-otro>Usar otro correo</button>';
      const enlazarOtro = () => { const b = caja.querySelector('[data-otro]'); if (b) b.addEventListener('click', () => N.salir().then(pasoEntrar)); };
      const ayuda = '<a href="https://wa.me/' + C.contacto.whatsapp + '" target="_blank" rel="noopener">escríbenos por WhatsApp</a>';

      function pasoEntrar() {
        pintar('<h1>Entra en tu cuenta</h1><form novalidate>' +
          '<div class="campo"><label for="email">Correo</label><input id="email" type="email" autocomplete="username" placeholder="tu@correo.com" value="' + esc(correo) + '"></div>' +
          '<div class="campo"><label for="clave">Contraseña</label><input id="clave" type="password" autocomplete="current-password"></div>' +
          '<p class="error-form" hidden></p><button class="boton boton--bloque" type="submit">Entrar</button></form>' +
          '<div class="entrada__enlaces"><button class="enlace" type="button" id="primera">Es mi primera vez</button><button class="enlace" type="button" id="olvido">¿Has olvidado tu contraseña?</button></div>' +
          '<p class="entrada__texto pequeno" style="margin-top:14px">Usa el correo que diste a ALKI al firmar tu contrato.</p>', function () {
          caja.querySelector('form').addEventListener('submit', function (e) {
            e.preventDefault();
            correo = caja.querySelector('#email').value.trim();
            if (!valido(correo)) return error('Escribe un correo válido.');
            const b = this.querySelector('button[type=submit]'); ocupado(b, true);
            N.entrar(correo, caja.querySelector('#clave').value).then(continuar).catch((x) => { ocupado(b, false); error(N.traducir(x)); });
          });
          caja.querySelector('#primera').addEventListener('click', () => { correo = caja.querySelector('#email').value.trim(); pasoCrear(); });
          caja.querySelector('#olvido').addEventListener('click', function () {
            correo = caja.querySelector('#email').value.trim();
            if (!valido(correo)) return error('Escribe tu correo arriba y vuelve a pulsar.');
            N.olvido(correo).then(() => error('Te hemos enviado un correo a <strong>' + esc(correo) + '</strong> para elegir una contraseña nueva. Mira también en «Spam».')).catch((x) => error(N.traducir(x)));
          });
        });
      }
      function pasoCrear() {
        pintar('<h1>Crea tu contraseña</h1><p class="entrada__texto">Usa el correo que diste a ALKI.</p><form novalidate>' +
          '<div class="campo"><label for="email">Correo</label><input id="email" type="email" autocomplete="username" value="' + esc(correo) + '"></div>' +
          '<div class="campo"><label for="nueva">Contraseña</label><input id="nueva" type="password" autocomplete="new-password"><p class="campo__ayuda">Mínimo 8 caracteres.</p></div>' +
          '<div class="campo"><label for="repite">Repite la contraseña</label><input id="repite" type="password" autocomplete="new-password"></div>' +
          '<p class="error-form" hidden></p><button class="boton boton--bloque" type="submit">Crear contraseña</button></form>' +
          '<button class="enlace entrada__cambiar" type="button" id="atras">Ya tengo contraseña</button>', function () {
          caja.querySelector('form').addEventListener('submit', function (e) {
            e.preventDefault();
            correo = caja.querySelector('#email').value.trim();
            const n = caja.querySelector('#nueva').value, r = caja.querySelector('#repite').value;
            if (!valido(correo)) return error('Escribe un correo válido.');
            if (n.length < 8) return error('Mínimo 8 caracteres.');
            if (n !== r) return error('Las dos contraseñas no coinciden.');
            const b = this.querySelector('button[type=submit]'); ocupado(b, true);
            N.crearCuenta(correo, n).then(pasoVerificar).catch((x) => { ocupado(b, false); error(N.traducir(x)); });
          });
          caja.querySelector('#atras').addEventListener('click', pasoEntrar);
        });
      }
      function pasoVerificar() {
        pintar('<h1>Confirma tu correo</h1><p class="entrada__texto">Te hemos enviado un correo a <strong>' + esc(correo) + '</strong>. Abre el enlace que trae (mira también en «Spam» o «Promociones») y vuelve aquí.</p>' +
          '<p class="error-form" hidden></p><button class="boton boton--bloque" type="button" id="hecho">Ya lo he confirmado</button>' +
          '<div class="entrada__enlaces"><button class="enlace" type="button" id="reenviar">Enviar el correo otra vez</button>' + otro + '</div>', function () {
          caja.querySelector('#hecho').addEventListener('click', function () {
            const b = this; ocupado(b, true);
            N.recargarUsuario().then(function (u) {
              ocupado(b, false);
              if (u && u.emailVerified) continuar(); else error('Todavía no aparece confirmado. Abre el enlace del correo y vuelve a pulsar.');
            }).catch((x) => { ocupado(b, false); error(N.traducir(x)); });
          });
          caja.querySelector('#reenviar').addEventListener('click', () => N.reenviarVerificacion().then(() => error('Correo enviado de nuevo.')).catch((x) => error(N.traducir(x))));
          enlazarOtro();
        });
      }
      const pasoCargando = () => pintar('<h1>Hola</h1><p class="entrada__texto">Cargando tu casa…</p>');
      const pasoError = (t) => pintar('<h1>No puedes entrar todavía</h1><p class="entrada__texto">' + t + '</p>' + otro, enlazarOtro);

      function continuar() {
        const u = N.usuario();
        if (!u) return pasoEntrar();
        correo = u.email;
        if (!u.emailVerified) return pasoVerificar();
        pasoCargando();
        N.perfilAcceso().then(function (acc) {
          if (!acc) return pasoError('El correo <strong>' + esc(correo) + '</strong> no aparece en ALKI. Si es tu correo de contrato, ' + ayuda + ' y lo revisamos.');
          return N.conectarPortal({ alCambiar: () => Alki.app.refrescar() }).then(function () {
            const cuentas = S.usuariosPorEmail(correo);
            if (!cuentas.length) return pasoError('Todavía no tenemos tus datos listos. Inténtalo en unos minutos o ' + ayuda + '.');
            if (cuentas.length > 1) return pasoElegir(cuentas);
            elegido(cuentas[0]);
          });
        }).catch((x) => pasoError(N.traducir(x)));
      }
      function pasoElegir(cuentas) {
        pintar('<h1>¿Quién eres?</h1><p class="entrada__texto">Este correo lo compartís varias personas.</p>' +
          '<div class="entrada__opciones">' + cuentas.map((u, n) => '<button class="boton boton--sec boton--bloque" type="button" data-n="' + n + '">' + esc(u.nombre) + (u.rol === 'propietario' ? ' (propietario)' : '') + '</button>').join('') + '</div>' + otro, function () {
          caja.querySelectorAll('[data-n]').forEach((b) => b.addEventListener('click', () => elegido(cuentas[Number(b.dataset.n)])));
          enlazarOtro();
        });
      }
      function elegido(u) {
        if (u.consentimiento && u.consentimiento.privacidad) return Alki.app.ir(Alki.app.inicioDe(S.entrarComo(u.rol, u.refId).rol));
        pintar('<h1>Bienvenido, ' + esc(U.primerNombre(u.nombre)) + '</h1><p class="entrada__texto">Antes de entrar por primera vez:</p>' +
          '<div class="consentimientos"><label class="casilla"><input type="checkbox" id="acepto"><span>He leído y acepto la <a href="#" data-legal="privacidad">Política de privacidad (RGPD)</a> y los <a href="#" data-legal="terminos">Términos de uso</a>.</span></label>' +
          (u.rol === 'inquilino' ? '<label class="casilla"><input type="checkbox" id="social"><span>Quiero unirme a ALKI Social. Otros residentes verán mi nombre y mi vivienda. <em>Opcional.</em></span></label>' : '') + '</div>' +
          '<p class="error-form" hidden></p><button class="boton boton--bloque" type="button" id="seguir">Entrar</button>', function () {
          caja.querySelector('#seguir').addEventListener('click', function () {
            if (!caja.querySelector('#acepto').checked) return error('Para entrar tienes que aceptar la política de privacidad y los términos de uso.');
            const ses = S.entrarComo(u.rol, u.refId);
            const so = caja.querySelector('#social');
            S.aceptarCondiciones(ses, { social: !!(so && so.checked) });
            U.toast('Bienvenido a ALKI');
            Alki.app.ir(Alki.app.inicioDe(ses.rol));
          });
        });
      }

      if (N.usuario()) continuar(); else pasoEntrar();
    }
  };
};
