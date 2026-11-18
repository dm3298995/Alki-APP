/* ==========================================================================
   nube-reparto.js — QUÉ PUEDE VER Y CAMBIAR CADA INQUILINO Y PROPIETARIO
   --------------------------------------------------------------------------
   Lo usa el panel del equipo al guardar en Firebase:
     · Cada registro se sube con la lista «e» de correos que pueden leerlo.
       Las reglas de Firestore solo dejan a un inquilino leer los registros
       donde aparece su correo («*» = cualquier residente: avisos generales y
       publicaciones de ALKI Social para toda la comunidad).
     · «acceso/{correo}» dice qué correos pueden entrar en la app y con qué perfil.
     · Lo que hace un inquilino en la app llega al «buzón». El panel lo revisa
       con estas reglas (qué listas y qué campos puede tocar) y lo aplica.
   ========================================================================== */
window.Alki = window.Alki || {};

Alki.nubeReparto = (function () {
  const norm = (e) => String(e || '').trim().toLowerCase();
  const TODOS = '*';

  // Relaciones que hacen falta para repartir: quién vive dónde y de quién es cada casa
  function contexto(db) {
    const porInq = {}, porProp = {};
    (db.usuarios || []).forEach(function (u) {
      const e = norm(u.email);
      if (!e || !u.refId) return;
      if (u.rol === 'inquilino') (porInq[u.refId] = porInq[u.refId] || []).push(e);
      if (u.rol === 'propietario') (porProp[u.refId] = porProp[u.refId] || []).push(e);
    });
    const vivDeHab = {};
    (db.habitaciones || []).forEach((h) => { vivDeHab[h.id] = h.viviendaId; });
    const propDeViv = {};
    (db.viviendas || []).forEach((v) => { propDeViv[v.id] = v.propietarioId; });
    const titulares = (c) => [c.inquilinoId].concat(c.cotitulares || []).filter(Boolean);
    // Residentes actuales de cada vivienda (contrato activo)
    const residentes = {};
    const ocupadas = {};
    (db.contratos || []).forEach(function (c) {
      if (c.estado !== 'activo') return;
      ocupadas[c.habitacionId] = true;
      const v = vivDeHab[c.habitacionId];
      if (!v) return;
      residentes[v] = residentes[v] || [];
      titulares(c).forEach((i) => (porInq[i] || []).forEach((e) => residentes[v].push(e)));
    });
    const delPropietario = (vId) => porProp[propDeViv[vId]] || [];
    const contratoPorId = {};
    (db.contratos || []).forEach((c) => { contratoPorId[c.id] = c; });
    return { porInq, porProp, vivDeHab, propDeViv, titulares, residentes, ocupadas, delPropietario, contratoPorId };
  }

  const unicos = (a) => Array.from(new Set(a.filter(Boolean)));

  // Correos que pueden leer un registro
  function visibles(lista, r, x) {
    const deInq = (id) => x.porInq[id] || [];
    const deProp = (id) => x.porProp[id] || [];
    const vecinos = (vId) => x.residentes[vId] || [];
    switch (lista) {
      case 'usuarios': return r.rol === 'inquilino' || r.rol === 'propietario' ? [norm(r.email)] : [];
      case 'inquilinos': return deInq(r.id);
      case 'propietarios': return deProp(r.id);
      case 'viviendas': return unicos(vecinos(r.id).concat(x.delPropietario(r.id)));
      case 'habitaciones': return unicos(vecinos(r.viviendaId).concat(x.delPropietario(r.viviendaId)));
      case 'contratos': {
        const v = x.vivDeHab[r.habitacionId];
        return unicos(x.titulares(r).flatMap(deInq).concat(x.delPropietario(v)));
      }
      case 'pagos': {
        const c = x.contratoPorId[r.contratoId];
        return c ? unicos(x.titulares(c).flatMap(deInq)) : [];
      }
      case 'incidencias': return unicos(deInq(r.inquilinoId).concat(r.visiblePropietario ? x.delPropietario(r.viviendaId) : []));
      case 'avisos': return r.viviendaId ? unicos(vecinos(r.viviendaId).concat(x.delPropietario(r.viviendaId))) : [TODOS];
      case 'reformas': return x.delPropietario(r.viviendaId);
      case 'documentos': return unicos(deInq(r.refId).concat(deProp(r.refId)));
      case 'referidos': return deInq(r.embajadorId);
      case 'solicitudes': return deInq(r.inquilinoId);
      case 'mensajes': return unicos(deProp(r.hilo).concat(deInq(r.hilo)));
      case 'social': return r.viviendaId ? unicos(vecinos(r.viviendaId)) : [TODOS];
      default: return []; // costes, actividad, avisos de datos…: solo el equipo
    }
  }

  // Tarjeta pública de quien escribe en ALKI Social (nombre y casa, sin apellidos)
  function tarjeta(db, x, rol, id) {
    if (rol === 'admin') return { nombre: 'Equipo ALKI', detalle: 'ALKI Rentals', iniciales: '', alki: true };
    const i = rol === 'inquilino' ? (db.inquilinos || []).find((p) => p.id === id) : (db.propietarios || []).find((p) => p.id === id);
    if (!i) return { nombre: 'Antiguo residente', detalle: '', iniciales: '·' };
    const partes = String(i.nombre || '').split(' ').filter(Boolean);
    let detalle = '';
    if (rol === 'inquilino') {
      const c = (db.contratos || []).filter((k) => k.estado === 'activo' && x.titulares(k).includes(id)).sort((a, b) => (a.inicio < b.inicio ? 1 : -1))[0];
      const v = c ? (db.viviendas || []).find((w) => w.id === x.vivDeHab[c.habitacionId]) : null;
      detalle = v ? v.codigo + (v.barrio ? ' · ' + v.barrio : '') : '';
    }
    return { nombre: (partes[0] || '') + (partes[1] ? ' ' + partes[1].charAt(0) + '.' : ''), detalle, iniciales: ((partes[0] || '').charAt(0) + (partes[1] || '').charAt(0)).toUpperCase() };
  }

  // Lo que se sube de cada registro: en algunos se añade lo justo para no tener que compartir datos ajenos
  function paraSubir(lista, r, x, db) {
    if (lista === 'habitaciones') {
      // El plano de la casa muestra qué habitaciones están ocupadas sin enseñar los contratos de los compañeros
      return Object.assign({}, r, { estadoPublico: r.enReforma ? 'reforma' : x.ocupadas[r.id] ? 'ocupada' : 'libre' });
    }
    if (lista === 'social') {
      const p = Object.assign({}, r, { autorTarjeta: tarjeta(db, x, r.autorRol, r.autorId) });
      p.comentarios = (r.comentarios || []).map((c) => Object.assign({}, c, { autorTarjeta: tarjeta(db, x, c.autorRol, c.autorId) }));
      return p;
    }
    return r;
  }

  // Quién puede entrar en la app de inquilinos (correo → perfiles)
  function accesos(db) {
    const m = new Map();
    (db.usuarios || []).forEach(function (u) {
      const e = norm(u.email);
      if (!e || (u.rol !== 'inquilino' && u.rol !== 'propietario') || !u.refId) return;
      const a = m.get(e) || { email: e, perfiles: [] };
      a.perfiles.push({ rol: u.rol, refId: u.refId, nombre: u.nombre || '' });
      m.set(e, a);
    });
    return m;
  }

  /* ---------- Buzón: revisar y aplicar lo que llega de la app ---------- */
  // Campos que un inquilino puede cambiar en registros que ya existen
  const CAMPOS = {
    contratos: ['confirmaciones'],
    pagos: ['notificadoEl', 'metodo'],
    usuarios: ['consentimiento'],
    incidencias: ['estado', 'historial', 'comentarios', 'fotos', 'valoracion', 'cerrada', 'actualizada', 'reabierta']
  };
  const NUEVOS = ['incidencias', 'social', 'solicitudes', 'referidos', 'documentos', 'mensajes'];

  function aplicarBuzon(envio, db, claveDe) {
    const email = norm(envio.e);
    const x = contexto(db);
    const mios = { inquilino: [], propietario: [] };
    (db.usuarios || []).forEach((u) => { if (norm(u.email) === email && mios[u.rol]) mios[u.rol].push(u.refId); });
    const esMio = (rol, id) => !!(mios[rol] && mios[rol].includes(id));
    const esMioCualquiera = (id) => esMio('inquilino', id) || esMio('propietario', id);
    const resultado = { aplicados: 0, rechazados: [] };
    const rechazar = (c, motivo) => resultado.rechazados.push((c.lista || '?') + ': ' + motivo);
    if (!mios.inquilino.length && !mios.propietario.length) { rechazar({}, 'correo sin perfil'); return resultado; }

    (envio.cambios || []).forEach(function (c) {
      const lista = c.lista;
      if (!Array.isArray(db[lista])) return rechazar(c, 'lista desconocida');
      const pos = db[lista].findIndex((r) => claveDe(r) === c.k);
      const antes = pos >= 0 ? db[lista][pos] : null;
      let nuevo = null;
      if (c.j) { try { nuevo = JSON.parse(c.j); } catch (e) { return rechazar(c, 'dañado'); } }
      const veo = antes && (visibles(lista, antes, x).includes(email) || (visibles(lista, antes, x).includes(TODOS)));

      // Borrar: solo publicaciones y documentos propios
      if (!nuevo) {
        if (!antes) return; // ya no estaba
        if (lista === 'social' && esMio(antes.autorRol, antes.autorId)) { db.social.splice(pos, 1); resultado.aplicados++; return; }
        if (lista === 'documentos' && esMioCualquiera(antes.refId)) { db.documentos.splice(pos, 1); resultado.aplicados++; return; }
        return rechazar(c, 'no puede borrar');
      }

      // Registro nuevo
      if (!antes) {
        if (!NUEVOS.includes(lista)) return rechazar(c, 'no puede crear');
        const ok = (lista === 'incidencias' && esMio('inquilino', nuevo.inquilinoId)) ||
          (lista === 'social' && esMio(nuevo.autorRol, nuevo.autorId)) ||
          (lista === 'solicitudes' && esMio('inquilino', nuevo.inquilinoId)) ||
          (lista === 'referidos' && esMio('inquilino', nuevo.embajadorId)) ||
          (lista === 'documentos' && esMioCualquiera(nuevo.refId)) ||
          (lista === 'mensajes' && esMioCualquiera(nuevo.hilo) && nuevo.de !== 'alki');
        if (!ok) return rechazar(c, 'no es suyo');
        if (lista === 'incidencias') { delete nuevo.coste; delete nuevo.proveedor; delete nuevo.asignadoA; }
        if (lista === 'solicitudes') nuevo.estado = 'nueva';
        delete nuevo.autorTarjeta;
        if (lista === 'social' || lista === 'avisos') db[lista].unshift(nuevo); else db[lista].push(nuevo);
        resultado.aplicados++;
        return;
      }

      // Registro que ya existe
      if (!veo) return rechazar(c, 'no lo ve');
      if (lista === 'social') {
        // En publicaciones propias puede cambiar el texto; en las de otros, solo «me gusta» y comentarios
        const propio = esMio(antes.autorRol, antes.autorId);
        const base = Object.assign({}, antes, propio ? { texto: nuevo.texto, viviendaId: nuevo.viviendaId, fotos: nuevo.fotos || [] } : {});
        // «Me gusta»: cada persona solo pone o quita el suyo
        const misClaves = ['inquilino', 'propietario'].flatMap((rol) => mios[rol].map((id) => rol + ':' + id));
        const likesAntes = (antes.likes || []).filter((k) => !misClaves.includes(k));
        base.likes = likesAntes.concat((nuevo.likes || []).filter((k) => misClaves.includes(k)));
        // Comentarios: se conservan los de los demás; los propios se pueden añadir o borrar
        const ajenos = (antes.comentarios || []).filter((k) => !esMio(k.autorRol, k.autorId));
        const mis = (nuevo.comentarios || []).filter((k) => esMio(k.autorRol, k.autorId)).map((k) => { const r = Object.assign({}, k); delete r.autorTarjeta; return r; });
        base.comentarios = ajenos.concat(mis).sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
        delete base.autorTarjeta;
        db.social[pos] = base; resultado.aplicados++; return;
      }
      const campos = CAMPOS[lista];
      if (!campos) return rechazar(c, 'no puede cambiar ' + lista);
      if (lista === 'pagos' && antes.pagadoEl) return; // ya cobrado: nada que avisar
      if (lista === 'usuarios' && norm(antes.email) !== email) return rechazar(c, 'otro usuario');
      if (lista === 'incidencias' && !esMio('inquilino', antes.inquilinoId)) return rechazar(c, 'incidencia ajena');
      const cambiado = Object.assign({}, antes);
      campos.forEach((k) => { if (k in nuevo) cambiado[k] = nuevo[k]; });
      if (lista === 'incidencias') {
        // Solo puede cerrarla o reabrirla, y añadir al historial (nunca cambiar lo que escribió ALKI)
        if (!['abierta', 'resuelta'].includes(nuevo.estado) && nuevo.estado !== antes.estado) cambiado.estado = antes.estado;
        const h0 = antes.historial || [], h1 = nuevo.historial || [];
        const mismoInicio = h1.length >= h0.length && h0.every((x, n) => JSON.stringify(x) === JSON.stringify(h1[n]));
        cambiado.historial = mismoInicio ? h0.concat(h1.slice(h0.length).map((x) => Object.assign({}, x, { autor: 'inquilino' }))) : h0;
      }
      if (lista === 'contratos') {
        // Solo su propia confirmación de datos
        const conf = Object.assign({}, antes.confirmaciones || {});
        mios.inquilino.forEach((id) => { if (nuevo.confirmaciones && nuevo.confirmaciones[id]) conf[id] = nuevo.confirmaciones[id]; });
        cambiado.confirmaciones = conf;
      }
      db[lista][pos] = cambiado; resultado.aplicados++;
    });
    return resultado;
  }

  return { contexto, visibles, paraSubir, accesos, aplicarBuzon, tarjeta, TODOS, norm };
})();
