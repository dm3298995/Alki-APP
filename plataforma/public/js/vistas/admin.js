/* ==========================================================================
   vistas/admin.js — ADMINISTRACIÓN Y MI CUENTA
   Usuarios y permisos · Integraciones (Homming) · Importar CSV ·
   Ajustes y copias · Registro de actividad
   ========================================================================== */
import { html, montar, $, fecha, fechaHora, pestanas, formulario, aviso, confirmar } from '../ui.js';
import { get, post, put, api } from '../api.js';
import { barras, barrasH, tarjeta } from '../graficos.js';

export async function vistaAdmin(el, { params, ctx, recargar }) {
  const disponibles = [
    ['usuarios', 'Accesos y usuarios', 'admin.usuarios'], ['integraciones', 'Integraciones', 'admin.integraciones'],
    ['importar', 'Importar datos', 'admin.importar'], ['ajustes', 'Ajustes y copias', 'admin.integraciones'], ['uso', 'Uso de la plataforma', 'admin.auditoria'], ['actividad', 'Registro de actividad', 'admin.auditoria']
  ].filter(([, , p]) => ctx.puede(p));
  if (!disponibles.length) return montar(el, html`<p>No tienes acceso a la administración.</p>`);
  const sec = disponibles.find(([k]) => k === params[0])?.[0] || disponibles[0][0];
  montar(el, html`<div class="cabecera"><div><h1>Configuración</h1></div></div>
    ${pestanas(disponibles.map(([k, t]) => [k, t, null, '#/admin/' + k]), sec)}<div id="sec"></div>`);
  const cont = $('#sec', el);
  await ({ usuarios, integraciones, importar, ajustes, actividad, uso })[sec](cont, ctx, recargar);
}

// ---------- Usuarios y permisos ----------
// Nivel de acceso de una persona a una pestaña: 'no' | 'ver' | 'editar'
const nivel = (permisos, clave) => (permisos.includes(clave + '.editar') ? 'editar' : permisos.includes(clave + '.ver') ? 'ver' : 'no');
const ICONO_NIVEL = { no: ['', 'Sin acceso', ''], ver: ['', 'Ver', 'info'], editar: ['', 'Ver y editar', 'ok'] };

async function usuarios(el, ctx, recargar) {
  const d = await get('/api/admin/usuarios');
  const soyAdmin = ctx.usuario.rol === 'admin';
  const opcRol = Object.entries(d.roles).filter(([k]) => soyAdmin || k !== 'admin').map(([k, r]) => [k, r.nombre]);
  montar(el, html`
    <section class="tarjeta"><header><div><h2>Equipo</h2><p>${d.usuarios.filter((u) => u.activo).length} personas con acceso. El Administrador tiene siempre todo; al resto se le da acceso pestaña por pestaña.</p></div>
      <button class="boton primario" id="nuevo">Añadir persona</button></header>
      <div class="tabla-env"><table><thead><tr><th>Persona</th><th>Rol</th><th>Estado</th><th>MFA</th><th>Último acceso</th><th></th></tr></thead>
      <tbody>${d.usuarios.map((u) => html`<tr><td><b>${u.nombre}</b><span class="sec">${u.email}</span></td>
        <td>${d.roles[u.rol].nombre}${u.personalizado ? html`<span class="sec">con permisos personalizados</span>` : ''}</td>
        <td>${!u.activo ? html`<span class="chip">Desactivado</span>` : u.bloqueado ? html`<span class="chip critico">Bloqueado</span>` : !u.activada ? html`<span class="chip aviso">Invitación pendiente</span>` : html`<span class="chip ok">Activo</span>`}</td>
        <td>${u.mfa_activo ? html`<span class="chip ok">Activado</span>` : html`<span class="chip">No</span>`}</td><td class="num">${fechaHora(u.ultimo_acceso)}</td>
        <td class="der"><div class="filtros">${u.rol !== 'admin' ? html`<button class="boton mini primario" data-permisos="${u.id}">Accesos</button>` : ''}${soyAdmin || u.rol !== 'admin' ? html`<button class="boton mini" data-u="${u.id}">Gestionar</button>` : ''}</div></td></tr>`)}</tbody></table></div></section>

    <section class="tarjeta mt"><header><div><h2>Quién puede ver qué</h2><p>«Ver», «Ver y editar» o — (bloqueado). Pulsa «Accesos» en una persona para cambiarlo.</p></div></header>
      <div class="tabla-env"><table class="matriz"><thead><tr><th>Pestaña</th>${d.usuarios.filter((u) => u.activo).map((u) => html`<th class="centro">${u.nombre.split(' ')[0]}<span class="sec">${d.roles[u.rol].nombre}</span></th>`)}</tr></thead>
      <tbody>${d.secciones.map((sec, k) => html`${k === 0 || d.secciones[k - 1].grupo !== sec.grupo ? html`<tr class="grupo"><td colspan="${d.usuarios.filter((u) => u.activo).length + 1}">${GRUPOS_PERMISOS[sec.grupo]}</td></tr>` : ''}<tr><td><b>${sec.nombre}</b><span class="sec">${sec.descripcion}</span></td>${d.usuarios.filter((u) => u.activo).map((u) => { const n = nivel(u.permisos, sec.clave); return html`<td class="centro">${n === 'no' ? html`<span class="suave">—</span>` : html`<span class="chip ${ICONO_NIVEL[n][2]}">${ICONO_NIVEL[n][1]}</span>`}</td>`; })}</tr>`)}
        ${Object.entries(d.especiales).map(([p, t]) => html`<tr><td>${t}</td>${d.usuarios.filter((u) => u.activo).map((u) => html`<td class="centro">${u.permisos.includes(p) ? html`<span class="chip ok">Sí</span>` : html`<span class="suave">—</span>`}</td>`)}</tr>`)}</tbody></table></div></section>`);

  $('#nuevo', el).onclick = () => formulario({
    titulo: 'Añadir persona', descripcion: 'Recibirá un correo con un enlace (válido 72 h) para elegir su contraseña. Después podrás ajustar a qué pestañas accede.',
    campos: [{ nombre: 'nombre', etiqueta: 'Nombre', req: true }, { nombre: 'email', etiqueta: 'Correo', tipo: 'email', req: true },
      { nombre: 'rol', etiqueta: 'Rol (plantilla de permisos)', tipo: 'select', req: true, opciones: opcRol, valor: 'operativo', ayuda: Object.values(d.roles).map((r) => r.nombre + ': ' + r.descripcion).join(' · ') }],
    enviar: async (x) => { const r = await post('/api/admin/usuarios', x); aviso(r.mensaje); recargar(); }
  });

  el.addEventListener('click', (e) => {
    const bp = e.target.closest('[data-permisos]');
    if (bp) return editorPermisos(d.usuarios.find((x) => String(x.id) === bp.dataset.permisos), d, soyAdmin, recargar);
    const b = e.target.closest('[data-u]'); if (!b) return;
    const u = d.usuarios.find((x) => String(x.id) === b.dataset.u);
    const dlg = formulario({
      titulo: u.nombre, descripcion: u.email,
      campos: [{ nombre: 'nombre', etiqueta: 'Nombre', req: true, valor: u.nombre }, { nombre: 'rol', etiqueta: 'Rol', tipo: 'select', vacio: false, opciones: opcRol, valor: u.rol, ayuda: 'Al cambiar el rol se cierran sus sesiones abiertas.' },
        { nombre: 'activo', etiqueta: 'Acceso activo', tipo: 'checkbox', valor: !!u.activo, ancho: true },
        ...(u.bloqueado ? [{ nombre: 'desbloquear', etiqueta: 'Desbloquear (tiene intentos fallidos)', tipo: 'checkbox', valor: true, ancho: true }] : [])],
      enviar: async (x) => { await put('/api/admin/usuarios/' + u.id, x); aviso('Usuario actualizado'); recargar(); }
    });
    const extra = document.createElement('div'); extra.className = 'ancho filtros';
    montar(extra, html`<button type="button" class="boton mini" data-acc="invitar">Reenviar enlace de contraseña</button>${u.mfa_activo ? html`<button type="button" class="boton mini peligro" data-acc="mfa">Reiniciar MFA (móvil perdido)</button>` : ''}`);
    $('.form', dlg).append(extra);
    extra.onclick = async (ev) => {
      const acc = ev.target.closest('[data-acc]')?.dataset.acc; if (!acc) return;
      if (acc === 'invitar') { await post('/api/admin/usuarios/' + u.id + '/invitar'); aviso('Enlace enviado a ' + u.email); }
      if (acc === 'mfa') { dlg.close(); if (await confirmar('Se desactivará su verificación en dos pasos y tendrá que configurarla de nuevo al entrar.', 'Reiniciar MFA')) { await post('/api/admin/usuarios/' + u.id + '/reiniciar-mfa'); aviso('MFA reiniciado'); recargar(); } }
    };
  });
}

// Editor de permisos de una persona: interruptores pestaña por pestaña
const GRUPOS_PERMISOS = { gestion: 'Gestión del día a día', finanzas: 'Información financiera (sensible)' };
function editorPermisos(u, d, soyAdmin, recargar) {
  const dlg = document.createElement('dialog');
  dlg.className = 'ancho-doc';
  let actuales = new Set(u.permisos);
  const interruptor = (nombre, activo, etiqueta, desactivado = false) => html`<label class="interruptor${desactivado ? ' apagado' : ''}"><input type="checkbox" name="${nombre}"${activo ? html` checked` : ''}${desactivado ? html` disabled` : ''} role="switch" aria-label="${etiqueta}"><span class="pista-i"></span><span class="txt">${etiqueta}</span></label>`;
  const pintar = () => montar(dlg, html`<form method="dialog" novalidate>
    <header><h2>Accesos de ${u.nombre}</h2><button type="button" class="cerrar" aria-label="Cerrar">×</button></header>
    <div class="d-cuerpo">
      <p class="suave">Rol: <b>${d.roles[u.rol].nombre}</b>. Activa solo lo que necesita. Lo que esté apagado queda <b>totalmente bloqueado</b>: no aparece en el menú, no se abre escribiendo la dirección y sus cifras no se muestran en ninguna otra pantalla.</p>
      <div class="filtros"><span class="pequeno suave">Atajos:</span>${Object.entries(d.roles).filter(([k]) => k !== 'admin').map(([k, r]) => html`<button type="button" class="boton mini" data-plantilla="${k}">Plantilla ${r.nombre}</button>`)}
        <button type="button" class="boton mini peligro" data-atajo="sin-finanzas">Quitar todo lo financiero</button><button type="button" class="boton mini" data-atajo="finanzas-ver">Finanzas solo lectura</button></div>
      ${Object.entries(GRUPOS_PERMISOS).map(([g, titulo]) => html`<h3 class="mt ${g === 'finanzas' ? 'titulo-sensible' : ''}">${titulo}</h3>
        <div class="lista-permisos">${d.secciones.filter((sec) => sec.grupo === g).map((sec) => { const ver = actuales.has(sec.clave + '.ver'), ed = actuales.has(sec.clave + '.editar'); return html`<div class="permiso-fila">
          <div><b>${sec.nombre}</b><span class="sec">${sec.descripcion}</span></div>
          <div class="interruptores">${interruptor('v-' + sec.clave, ver, 'Acceso')}${sec.acciones.includes('editar') ? interruptor('e-' + sec.clave, ver && ed, 'Puede modificar', !ver) : html`<span class="txt suave pequeno">Solo consulta</span>`}</div></div>`; })}</div>`)}
      <h3 class="mt">Otros permisos</h3>
      <div class="lista-permisos">${Object.entries(d.especiales).map(([p, t]) => html`<div class="permiso-fila"><div><b>${t}</b>${d.soloAdmin.includes(p) ? html`<span class="sec">Solo lo puede dar un Administrador</span>` : ''}</div>
        <div class="interruptores">${interruptor('x-' + p, actuales.has(p), 'Activado', !soyAdmin && d.soloAdmin.includes(p))}</div></div>`)}</div>
      <div class="error-form oculto mt" role="alert"></div>
    </div>
    <footer><button type="button" class="boton" data-rol>Volver a los de su rol</button><button type="button" class="boton" data-cancelar>Cancelar</button><button type="submit" class="boton primario">Guardar accesos</button></footer></form>`);
  const leer = () => {
    const f = $('form', dlg), out = new Set();
    for (const sec of d.secciones) {
      if (f.elements['v-' + sec.clave].checked) { out.add(sec.clave + '.ver'); if (f.elements['e-' + sec.clave]?.checked) out.add(sec.clave + '.editar'); }
    }
    for (const p of Object.keys(d.especiales)) if (f.elements['x-' + p].checked) out.add(p);
    return out;
  };
  const guardar = async (permisos) => {
    try { await put('/api/admin/usuarios/' + u.id + '/permisos', { permisos }); aviso('Accesos de ' + u.nombre + ' guardados'); dlg.close(); dlg.remove(); recargar(); }
    catch (ex) { const e = $('.error-form', dlg); e.textContent = ex.message; e.classList.remove('oculto'); }
  };
  const enlazar = () => {
    $('.cerrar', dlg).onclick = () => { dlg.close(); dlg.remove(); };
    $('[data-cancelar]', dlg).onclick = () => { dlg.close(); dlg.remove(); };
    $('[data-rol]', dlg).onclick = () => guardar(null);
    $('form', dlg).onsubmit = (e) => { e.preventDefault(); guardar([...leer()]); };
    // Encender «Acceso» habilita «Puede modificar»; apagarlo, lo apaga
    $('form', dlg).onchange = (e) => {
      if (!e.target.name?.startsWith('v-')) return;
      const ed = $('form', dlg).elements['e-' + e.target.name.slice(2)];
      if (ed) { ed.disabled = !e.target.checked; if (!e.target.checked) ed.checked = false; ed.closest('.interruptor').classList.toggle('apagado', !e.target.checked); }
    };
    dlg.querySelectorAll('[data-plantilla]').forEach((b) => { b.onclick = () => { actuales = new Set(d.roles[b.dataset.plantilla].permisos); pintar(); enlazar(); }; });
    dlg.querySelectorAll('[data-atajo]').forEach((b) => { b.onclick = () => {
      actuales = leer();
      const fin = d.secciones.filter((x) => x.grupo === 'finanzas');
      for (const x of fin) { actuales.delete(x.clave + '.ver'); actuales.delete(x.clave + '.editar'); if (b.dataset.atajo === 'finanzas-ver') actuales.add(x.clave + '.ver'); }
      pintar(); enlazar();
    }; });
  };
  pintar(); document.body.append(dlg); enlazar();
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); dlg.close(); dlg.remove(); });
  dlg.showModal();
}

// ---------- Integraciones ----------
async function integraciones(el, ctx, recargar) {
  const { integraciones: [h] } = await get('/api/admin/integraciones');
  const c = h.config;
  const ESTADO = { ok: ['Funcionando', 'ok'], error: ['Con errores', 'critico'], nunca: ['Sin sincronizar', 'neutro'] };
  montar(el, html`
    <div class="rejilla r-2-1">
      <section class="tarjeta"><header><div><h2>Homming</h2><p>Sincroniza inmuebles, habitaciones, contratos y (si la API lo permite) pagos.</p></div>
        <span class="chip ${h.activa ? ESTADO[h.estado][1] : ''}">${h.activa ? ESTADO[h.estado][0] : 'Desactivada'}</span></header>
        ${h.error ? html`<div class="error-form">Último error: ${h.error}</div>` : ''}
        <form id="f-h" class="form mt" novalidate>
          <label class="campo ancho"><span>URL base de la API</span><input type="url" name="baseUrl" value="${c.baseUrl}" placeholder="https://… (la facilita Homming)"><small>Solo https. Pídela a Homming junto con la documentación de la API.</small></label>
          <label class="campo ancho"><span>Token de API</span><input type="password" name="token" placeholder="${c.tieneToken ? '•••••••• (guardado; escribe uno nuevo para cambiarlo)' : 'Pega aquí el token'}" autocomplete="off"><small>Homming → Ajustes de la cuenta → Conexiones. Se guarda cifrado y nunca vuelve a mostrarse.</small></label>
          <label class="campo"><span>Cabecera</span><input type="text" name="cabecera" value="${c.cabecera}"></label>
          <label class="campo"><span>Formato</span><input type="text" name="formato" value="${c.formato}"></label>
          <label class="campo"><span>Ruta de inmuebles</span><input type="text" name="rutaInmuebles" value="${c.rutas.inmuebles}"></label>
          <label class="campo"><span>Ruta de unidades / habitaciones</span><input type="text" name="rutaUnidades" value="${c.rutas.unidades}"></label>
          <label class="campo"><span>Ruta de contratos</span><input type="text" name="rutaContratos" value="${c.rutas.contratos}"></label>
          <label class="campo"><span>Ruta de pagos</span><input type="text" name="rutaPagos" value="${c.rutas.pagos}"></label>
          <label class="campo"><span>Cada cuántos minutos</span><input type="number" name="intervalo" min="15" max="1440" value="${h.intervalo}"></label>
          <div class="campo"><span>Opciones</span><label class="casilla"><input type="checkbox" name="sincronizarPagos"${c.sincronizarPagos ? html` checked` : ''}> Sincronizar pagos</label><label class="casilla"><input type="checkbox" name="activa"${h.activa ? html` checked` : ''}> Sincronización automática activa</label></div>
          <div class="ancho filtros"><button class="boton primario" type="submit">Guardar</button><button class="boton" type="button" id="probar">Probar conexión</button><button class="boton" type="button" id="sync">Sincronizar ahora</button><button class="boton" type="button" id="webhook">${c.tieneWebhook ? 'Regenerar' : 'Crear'} URL de webhook</button></div>
          <div class="ancho" id="resultado"></div>
        </form>
      </section>
      <div class="pila">
        <section class="tarjeta"><h2>Estado de la API de Homming</h2>
          <ul class="pasos mt"><li>Homming incluye «API para integraciones» en sus planes Starter, Advanced y Enterprise.</li>
          <li>El token se genera en Ajustes de la cuenta → Conexiones (solo se ve una vez).</li>
          <li>Tiene webhooks para avisar de cambios.</li>
          <li><b>Pendiente:</b> pedir a Homming la documentación de endpoints, formato y límites de uso. Las rutas de la izquierda son provisionales.</li></ul>
          <p class="pequeno suave mt">Mientras tanto, importa el CSV de contratos de Homming en «Importar datos».</p></section>
        <section class="tarjeta"><h2>Últimas sincronizaciones</h2>
          ${h.historial.length ? html`<table class="mt"><tbody>${h.historial.map((s) => html`<tr><td class="num pequeno">${fechaHora(s.inicio)}</td><td><span class="chip ${s.estado === 'ok' ? 'ok' : s.estado === 'error' ? 'critico' : ''}">${s.estado}</span></td></tr>`)}</tbody></table>` : html`<p class="suave">Todavía no se ha sincronizado.</p>`}</section>
      </div>
    </div>`);
  const f = $('#f-h', el), res = $('#resultado', el);
  const mostrar = (txt, ok = true) => montar(res, html`<div class="${ok ? 'exito-form' : 'error-form'}">${txt}</div>`);
  const datos = () => ({
    baseUrl: f.baseUrl.value.trim(), token: f.token.value.trim() || undefined, cabecera: f.cabecera.value.trim(), formato: f.formato.value.trim(),
    rutaInmuebles: f.rutaInmuebles.value.trim(), rutaUnidades: f.rutaUnidades.value.trim(), rutaContratos: f.rutaContratos.value.trim(), rutaPagos: f.rutaPagos.value.trim(),
    intervalo: Number(f.intervalo.value), sincronizarPagos: f.sincronizarPagos.checked, activa: f.activa.checked
  });
  f.onsubmit = async (e) => { e.preventDefault(); try { await put('/api/admin/integraciones/homming', datos()); aviso('Configuración guardada'); recargar(); } catch (ex) { mostrar(ex.message, false); } };
  $('#probar', el).onclick = async () => { mostrar('Probando…'); try { const r = await post('/api/admin/integraciones/homming/probar'); mostrar('Conexión correcta.' + (r.muestra.length ? ' Campos recibidos: ' + r.muestra.join(', ') : '')); } catch (ex) { mostrar(ex.message, false); } };
  $('#sync', el).onclick = async () => { mostrar('Sincronizando…'); try { const r = await post('/api/admin/integraciones/homming/sincronizar'); mostrar(r.omitida || 'Sincronizado: ' + r.inmuebles + ' inmuebles, ' + r.habitaciones + ' habitaciones, ' + r.contratos + ' contratos, ' + r.pagos + ' pagos.'); } catch (ex) { mostrar(ex.message, false); } };
  $('#webhook', el).onclick = async () => {
    try {
      const r = await put('/api/admin/integraciones/homming', { generarWebhook: true });
      montar(res, html`<div class="exito-form">Copia esta URL y pégala en Homming (Conexiones → Webhooks). <b>Solo se muestra ahora.</b><div class="clave-secreta mt">${location.origin + r.webhook}</div></div>`);
    } catch (ex) { mostrar(ex.message, false); }
  };
}

// ---------- Importar ----------
async function importar(el, ctx, recargar) {
  montar(el, html`<section class="tarjeta"><header><div><h2>Importar contratos desde Homming (CSV)</h2>
      <p>En Homming: Contratos → Exportar. Sube aquí el archivo .csv. Se puede repetir cuando quieras: actualiza lo que ya existe y no duplica nada.</p></div></header>
    <ol class="pasos"><li>Crea los inmuebles y habitaciones que falten (por el código entre paréntesis, p. ej. «(Pal2)», y la habitación del nombre del contrato, p. ej. «Pal2-H3»).</li>
      <li>Crea o actualiza los contratos con sus fechas, renta y fianza.</li><li>No toca gastos, mantenimientos ni cobros registrados aquí.</li></ol>
    <div class="filtros mt"><input type="file" id="csv" accept=".csv,text/csv"><button class="boton primario" id="subir">Importar</button></div>
    <div id="res"></div></section>`);
  $('#subir', el).onclick = async () => {
    const archivo = $('#csv', el).files[0];
    if (!archivo) return aviso('Elige un archivo CSV', 'error');
    const b = $('#subir', el); b.disabled = true;
    try {
      const r = await api('/api/admin/importar/homming-csv', { metodo: 'POST', crudo: archivo, tipo: 'text/csv' });
      montar($('#res', el), html`<div class="exito-form mt">Importadas ${r.filas} filas: ${r.inmueblesNuevos} inmuebles nuevos, ${r.habitacionesNuevas} habitaciones nuevas, ${r.contratosNuevos} contratos nuevos y ${r.contratosActualizados} actualizados${r.omitidas ? ' · ' + r.omitidas + ' filas omitidas' : ''}.</div>
        ${r.avisos.length ? html`<h3 class="mt">Revisar (${r.avisos.length})</h3><ul class="pequeno">${r.avisos.map((a) => html`<li>${a}</li>`)}</ul>` : ''}`);
    } catch (ex) { montar($('#res', el), html`<div class="error-form mt">${ex.message}</div>`); }
    b.disabled = false;
  };
}

// ---------- Ajustes ----------
async function ajustes(el, ctx, recargar) {
  const a = await get('/api/admin/ajustes');
  montar(el, html`<div class="rejilla r-2">
    <section class="tarjeta"><h2>Ajustes</h2><form id="f-a" class="form mt" novalidate>
      <label class="campo"><span>Avisar de salidas con (días)</span><input type="number" name="dias_aviso_salida" min="7" max="180" value="${a.dias_aviso_salida}"><small>Una habitación pasa a «se libera pronto» cuando le quedan estos días.</small></label>
      <label class="campo"><span>Día de vencimiento de los recibos</span><input type="number" name="dia_vencimiento" min="1" max="28" value="${a.dia_vencimiento}"></label>
      <label class="casilla ancho"><input type="checkbox" name="recibos_automaticos"${a.recibos_automaticos ? html` checked` : ''}> Generar automáticamente los recibos de cada mes</label>
      <div class="ancho"><button class="boton primario" type="submit">Guardar</button></div></form></section>
    <section class="tarjeta"><header><div><h2>Copias de seguridad</h2><p>Se hacen solas cada día. Copia la carpeta data/copias fuera del servidor.</p></div><button class="boton mini" id="copia">Hacer copia ahora</button></header>
      ${a.copias.length ? html`<table><tbody>${a.copias.map((c) => html`<tr><td class="pequeno">${c.archivo}</td><td class="der num pequeno">${Math.round(c.bytes / 1024)} KB</td></tr>`)}</tbody></table>` : html`<p class="suave">Sin copias todavía.</p>`}</section></div>`);
  const f = $('#f-a', el);
  f.onsubmit = async (e) => { e.preventDefault(); await put('/api/admin/ajustes', { dias_aviso_salida: Number(f.dias_aviso_salida.value), dia_vencimiento: Number(f.dia_vencimiento.value), recibos_automaticos: f.recibos_automaticos.checked }); aviso('Ajustes guardados'); recargar(); };
  $('#copia', el).onclick = async () => { const r = await post('/api/admin/copias'); aviso('Copia creada: ' + r.archivo); recargar(); };
}

// ---------- Actividad ----------
const ACCIONES = { 'acceso.correcto': 'Inicio de sesión', 'acceso.fallido': 'Intento fallido', 'acceso.bloqueo_cuenta': 'Cuenta bloqueada', 'acceso.bloqueado_ip': 'IP frenada', 'acceso.salida': 'Cierre de sesión', 'mfa.fallido': 'Código MFA incorrecto', 'mfa.activado': 'MFA activado' };
async function actividad(el) {
  let filtro = '';
  const pintar = async () => {
    const d = await get('/api/admin/auditoria' + (filtro ? '?accion=' + filtro : ''));
    montar($('#tabla', el), html`<div class="tabla-env"><table><thead><tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Elemento</th><th class="ocultar-movil">IP</th><th class="ocultar-movil">Detalle</th></tr></thead>
      <tbody>${d.registros.map((r) => html`<tr><td class="num pequeno">${fechaHora(r.fecha)}</td><td>${r.email || '—'}</td><td>${ACCIONES[r.accion] || r.accion}</td><td>${r.entidad ? r.entidad + ' #' + r.entidad_id : ''}</td><td class="ocultar-movil pequeno">${r.ip}</td><td class="ocultar-movil pequeno suave">${(r.detalle || '').slice(0, 120)}</td></tr>`)}</tbody></table></div>`);
  };
  montar(el, html`<section class="tarjeta"><header><div><h2>Registro de actividad</h2><p>Últimos 200 eventos. No se guardan contraseñas ni códigos.</p></div>
    <select id="f-acc"><option value="">Todo</option><option value="acceso">Accesos</option><option value="usuario">Usuarios</option><option value="pago">Pagos</option><option value="gasto">Gastos</option><option value="mantenimiento">Mantenimientos</option><option value="integracion">Integraciones</option><option value="importar">Importaciones</option><option value="documento">Documentos</option></select></header><div id="tabla"></div></section>`);
  $('#f-acc', el).onchange = (e) => { filtro = e.target.value; pintar(); };
  await pintar();
}

// ---------- Mi cuenta ----------
export async function vistaCuenta(el, { ctx }) {
  const u = ctx.usuario;
  montar(el, html`<div class="cabecera"><div><h1>Mi cuenta</h1><p>${u.nombre} · ${u.email} · ${u.rolNombre}</p></div></div>
    <div class="rejilla r-2">
      <section class="tarjeta"><h2>Cambiar contraseña</h2><form id="f-c" class="pila mt" novalidate>
        <div class="error-form oculto"></div>
        <label class="campo"><span>Contraseña actual</span><input type="password" name="actual" autocomplete="current-password" required></label>
        <label class="campo"><span>Contraseña nueva</span><input type="password" name="nueva" autocomplete="new-password" minlength="12" required><small>Mínimo 12 caracteres. Al cambiarla se cierran tus otras sesiones.</small></label>
        <div><button class="boton primario" type="submit">Cambiar</button></div></form></section>
      <section class="tarjeta"><h2>Verificación en dos pasos</h2>
        <p>${u.mfa ? html`<span class="chip ok">Activada</span> Tu cuenta pide un código del móvil al entrar.` : html`<span class="chip aviso">No activada</span> Recomendada para todos los usuarios.`}</p>
        ${u.mfa ? html`<p class="pequeno suave">Si pierdes el móvil, pide a un administrador que la reinicie.</p>` : html`<button class="boton" id="activar">Activar ahora</button><div id="alta"></div>`}
      </section></div>`);
  const f = $('#f-c', el);
  f.onsubmit = async (e) => {
    e.preventDefault(); if (!f.reportValidity()) return;
    const err = $('.error-form', f); err.classList.add('oculto');
    try { await post('/api/auth/cambiar-clave', { actual: f.actual.value, nueva: f.nueva.value }); f.reset(); aviso('Contraseña cambiada'); }
    catch (ex) { err.textContent = ex.message; err.classList.remove('oculto'); }
  };
  $('#activar', el)?.addEventListener('click', async () => {
    const d = await post('/api/auth/mfa/preparar');
    montar($('#alta', el), html`<ol class="pasos mt"><li>Añade una cuenta en tu app de autenticación con esta clave:<div class="clave-secreta mt">${d.secreto}</div><a class="pequeno" href="${d.uri}">Abrir en la app (móvil)</a></li><li>Escribe el código que aparece:</li></ol>
      <form id="f-m" class="filtros mt"><input class="codigo-mfa" name="codigo" inputmode="numeric" maxlength="6" required aria-label="Código"><button class="boton primario" type="submit">Activar</button></form>`);
    $('#f-m', el).onsubmit = async (e) => {
      e.preventDefault();
      try { await post('/api/auth/mfa/activar', { codigo: e.target.codigo.value }); aviso('Verificación en dos pasos activada'); setTimeout(() => location.reload(), 800); }
      catch (ex) { aviso(ex.message, 'error'); }
    };
  });
}

// ---------- Uso de la plataforma (estadísticas internas, sin servicios externos) ----------
const duracion = (min) => (min >= 60 ? Math.floor(min / 60) + ' h ' + String(min % 60).padStart(2, '0') + ' min' : min + ' min');
async function uso(el) {
  let dias = 30;
  const pintar = async () => {
    const d = await get('/api/admin/uso?dias=' + dias);
    const r = d.resumen;
    montar(el, html`
      <div class="filtros"><div class="segmentos" role="group" aria-label="Periodo">${[7, 30, 90].map((n) => html`<button type="button" data-dias="${n}" aria-pressed="${dias === n}">Últimos ${n} días</button>`)}</div>
        <span class="pequeno suave">Solo el equipo de ALKI. No se envía nada a servicios externos.</span></div>
      <div class="cifras">
        <div class="cifra"><span class="etq">Personas activas</span><span class="valor">${r.personasActivas}</span><span class="sub">${r.conectadasAhora} conectada(s) ahora</span></div>
        <div class="cifra"><span class="etq">Sesiones</span><span class="valor">${r.sesiones}</span><span class="sub">en ${dias} días</span></div>
        <div class="cifra"><span class="etq">Tiempo medio por sesión</span><span class="valor">${duracion(r.mediaMin)}</span></div>
        <div class="cifra"><span class="etq">Tiempo total de uso</span><span class="valor">${duracion(r.minutos)}</span></div>
      </div>
      <div class="rejilla r-2-1 mt">
        ${tarjeta({ titulo: 'Sesiones por día', sub: 'Cuántas veces se ha entrado cada día',
          grafico: barras({ etiquetas: d.porDia.map((x) => x.fecha), nombresX: d.porDia.map((x) => x.fecha.slice(8) + '/' + x.fecha.slice(5, 7)), series: [{ nombre: 'Sesiones', color: '--serie-1', valores: d.porDia.map((x) => x.sesiones) }], formato: (v) => Math.round(v) }),
          tabla: { cabeceras: ['Día', 'Sesiones', 'Personas', 'Tiempo'], filas: d.porDia.map((x) => [fecha(x.fecha), x.sesiones, x.personas, duracion(x.minutos)]) } })}
        ${tarjeta({ titulo: 'Apartados más usados', sub: 'Veces que se ha abierto cada pantalla',
          grafico: barrasH(d.apartados.map((a) => ({ etiqueta: a.apartado, valor: a.n })), (v) => v + ' visitas') })}
      </div>
      <section class="tarjeta mt"><header><div><h2>Por persona</h2><p>Ordenado por tiempo de uso</p></div></header>
        <div class="tabla-env"><table><thead><tr><th>Persona</th><th class="der">Sesiones</th><th class="der">Días activos</th><th class="der">Tiempo total</th><th class="der">Media por sesión</th><th>Lo que más usa</th><th>Último acceso</th></tr></thead>
          <tbody>${d.personas.map((u) => html`<tr><td><b>${u.nombre}</b>${u.abiertaAhora ? html` <span class="chip ok">Conectada</span>` : ''}</td><td class="der num">${u.sesiones}</td><td class="der num">${u.diasActivos}</td>
            <td class="der num">${duracion(u.minutos)}</td><td class="der num">${duracion(u.mediaMin)}</td><td>${u.top.length ? u.top.join(', ') : html`<span class="suave">—</span>`}</td><td class="num">${fechaHora(u.ultimoAcceso)}</td></tr>`)}</tbody></table></div>
        <p class="pequeno suave">Una sesión va desde que alguien entra hasta que sale o se cierra por inactividad. Conviene avisar al equipo de que se registra el uso.</p>
      </section>`);
    el.querySelectorAll('[data-dias]').forEach((b) => { b.onclick = () => { dias = Number(b.dataset.dias); pintar(); }; });
  };
  await pintar();
}
