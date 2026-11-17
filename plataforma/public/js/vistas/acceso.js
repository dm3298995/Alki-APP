/* ==========================================================================
   vistas/acceso.js — INICIO DE SESIÓN, MFA Y RECUPERACIÓN DE CONTRASEÑA
   ========================================================================== */
import { html, montar, $ } from '../ui.js';
import { api, post, configurar } from '../api.js';

const caja = (contenido) => html`<div class="acceso"><div class="caja">
  <div class="logo"><img src="icon.svg" alt=""><div><h1>ALKI Gestión</h1><span class="suave pequeno">Plataforma interna · acceso privado</span></div></div>
  ${contenido}</div></div>`;

const error = (form, msg) => { const e = $('.error-form', form); e.textContent = msg; e.classList.toggle('oculto', !msg); };

async function enviando(form, fn) {
  const b = $('[type=submit]', form); b.disabled = true; error(form, '');
  try { await fn(); } catch (e) { error(form, e.message); } finally { b.disabled = false; }
}

// Pantalla de acceso (según la fase de la sesión)
export function entrar(app, yo, listo) {
  if (yo?.fase === 'mfa') return pedirCodigo(app, yo, listo);
  if (yo?.fase === 'mfa_alta') return altaMfa(app, yo, listo);
  const motivo = sessionStorage.getItem('alki_motivo'); sessionStorage.removeItem('alki_motivo');
  montar(app, caja(html`<form id="f" novalidate>
    ${motivo ? html`<div class="exito-form">${motivo}</div>` : ''}
    <div class="error-form oculto" role="alert"></div>
    <label class="campo"><span>Correo</span><input type="email" name="email" autocomplete="username" required autofocus></label>
    <label class="campo"><span>Contraseña</span><input type="password" name="clave" autocomplete="current-password" required></label>
    <button class="boton primario" type="submit">Entrar</button>
    <a href="#/recuperar" class="pequeno">¿Has olvidado la contraseña?</a>
  </form><p class="pie">Acceso solo para el equipo de ALKI. La actividad queda registrada.</p>`));
  const f = $('#f');
  f.onsubmit = (e) => {
    e.preventDefault();
    if (!f.reportValidity()) return;
    enviando(f, async () => {
      await api('/api/auth/login', { metodo: 'POST', datos: { email: f.email.value.trim(), clave: f.clave.value } });
      await listo();
    });
  };
}

async function sesion() { const yo = await api('/api/auth/yo'); configurar({ csrf: yo.csrf }); return yo; }

async function pedirCodigo(app, yo, listo) {
  configurar({ csrf: yo.csrf });
  montar(app, caja(html`<form id="f" novalidate>
    <p>Hola, <b>${yo.usuario.nombre}</b>. Escribe el código de 6 dígitos de tu app de autenticación.</p>
    <div class="error-form oculto" role="alert"></div>
    <input class="codigo-mfa" name="codigo" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" required autofocus aria-label="Código de verificación">
    <button class="boton primario" type="submit">Verificar</button>
    <button class="enlace pequeno" type="button" id="otro">Entrar con otra cuenta</button>
  </form>`));
  const f = $('#f');
  $('#otro').onclick = async () => { await post('/api/auth/salir'); location.reload(); };
  f.onsubmit = (e) => { e.preventDefault(); enviando(f, async () => { await post('/api/auth/mfa', { codigo: f.codigo.value }); await listo(); }); };
}

// Alta del MFA (obligatorio para Administración y Dirección)
async function altaMfa(app, yo, listo) {
  configurar({ csrf: yo.csrf });
  const datos = await post('/api/auth/mfa/preparar');
  montar(app, caja(html`<form id="f" novalidate>
    <h2>Activa la verificación en dos pasos</h2>
    <p class="suave pequeno">Tu perfil (${yo.usuario.rolNombre}) la necesita para proteger los datos de ALKI.</p>
    <ol class="pasos">
      <li>Instala en el móvil una app de autenticación (Google Authenticator, Microsoft Authenticator…).</li>
      <li>Añade una cuenta nueva «con clave de configuración» y escribe esta clave:<div class="clave-secreta mt">${datos.secreto}</div>
        <a class="pequeno" href="${datos.uri}">O pulsa aquí si estás en el móvil</a></li>
      <li>Escribe el código de 6 dígitos que aparece en la app.</li>
    </ol>
    <div class="error-form oculto" role="alert"></div>
    <input class="codigo-mfa" name="codigo" inputmode="numeric" maxlength="6" autocomplete="one-time-code" required aria-label="Código de verificación">
    <button class="boton primario" type="submit">Activar y entrar</button>
  </form>`));
  const f = $('#f');
  f.onsubmit = (e) => { e.preventDefault(); enviando(f, async () => { await post('/api/auth/mfa/activar', { codigo: f.codigo.value }); await sesion(); await listo(); }); };
}

export function recuperar(app) {
  montar(app, caja(html`<form id="f" novalidate>
    <h2>Recuperar contraseña</h2>
    <p class="suave pequeno">Te enviaremos un enlace para crear una contraseña nueva. Caduca en 30 minutos.</p>
    <div class="error-form oculto" role="alert"></div><div class="exito-form oculto"></div>
    <label class="campo"><span>Correo</span><input type="email" name="email" autocomplete="username" required autofocus></label>
    <button class="boton primario" type="submit">Enviar enlace</button>
    <a href="#/" class="pequeno">Volver al acceso</a>
  </form>`));
  const f = $('#f');
  f.onsubmit = (e) => {
    e.preventDefault(); if (!f.reportValidity()) return;
    enviando(f, async () => {
      const r = await api('/api/auth/recuperar', { metodo: 'POST', datos: { email: f.email.value.trim() } });
      const ok = $('.exito-form', f); ok.textContent = r.mensaje; ok.classList.remove('oculto');
    });
  };
}

export function nuevaClave(app, query) {
  const token = query.get('token') || '';
  montar(app, caja(html`<form id="f" novalidate>
    <h2>Elige tu contraseña</h2>
    <p class="suave pequeno">Mínimo 12 caracteres. Mejor una frase que puedas recordar, por ejemplo «Mi-piso-de-Ruzafa-tiene-5-ventanas».</p>
    <div class="error-form oculto" role="alert"></div>
    <label class="campo"><span>Contraseña nueva</span><input type="password" name="clave" autocomplete="new-password" minlength="12" required autofocus></label>
    <label class="campo"><span>Repítela</span><input type="password" name="repetir" autocomplete="new-password" minlength="12" required></label>
    <button class="boton primario" type="submit">Guardar contraseña</button>
  </form>`));
  const f = $('#f');
  f.onsubmit = (e) => {
    e.preventDefault(); if (!f.reportValidity()) return;
    if (f.clave.value !== f.repetir.value) return error(f, 'Las contraseñas no coinciden.');
    enviando(f, async () => {
      await api('/api/auth/nueva-clave', { metodo: 'POST', datos: { token, clave: f.clave.value } });
      sessionStorage.setItem('alki_motivo', 'Contraseña guardada. Ya puedes entrar.');
      history.replaceState(null, '', location.pathname + '#/');
      location.reload();
    });
  };
}
