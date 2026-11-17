/* ==========================================================================
   social.js — ALKI SOCIAL y menú «Más»
   --------------------------------------------------------------------------
   ALKI Social es un muro de la comunidad: los inquilinos publican mensajes
   con fotos, se dan "me gusta" y comentan. Cada publicación puede ser para
   toda la comunidad ALKI o solo para su casa. El equipo ALKI también publica
   y puede borrar cualquier publicación o comentario (moderación).

   Nota: sin servidor, las publicaciones se guardan en este navegador. Para que
   todos los inquilinos vean lo mismo desde sus móviles hace falta un servidor
   (ver GUIA.md, punto 6).
   ========================================================================== */
window.Alki = window.Alki || {};
Alki.vistas = Alki.vistas || {};

(function () {
  const S = Alki.store, U = Alki.ui;
  const esc = U.esc, ic = U.icono;

  // Vivienda del inquilino que ha iniciado sesión
  function miVivienda(ses) {
    if (ses.rol !== 'inquilino') return null;
    const c = S.contratoDeInquilino(ses.refId);
    return c ? S.buscar('viviendas', S.buscar('habitaciones', c.habitacionId).viviendaId) : null;
  }
  // Nombre que se muestra: "Lucía N. · Sen15" (sin apellidos completos, por privacidad)
  function autor(rol, id) {
    if (rol === 'admin') return { nombre: 'Equipo ALKI', detalle: 'ALKI Rentals', iniciales: '', alki: true };
    const i = S.buscar('inquilinos', id);
    if (!i) return { nombre: 'Antiguo residente', detalle: '', iniciales: '·' };
    const partes = i.nombre.split(' ');
    const c = S.contratoDeInquilino(i.id);
    const v = c ? S.buscar('viviendas', S.buscar('habitaciones', c.habitacionId).viviendaId) : null;
    return {
      nombre: partes[0] + (partes[1] ? ' ' + partes[1].charAt(0) + '.' : ''),
      detalle: v ? v.codigo + (v.barrio ? ' · ' + v.barrio : '') : '',
      iniciales: (partes[0].charAt(0) + (partes[1] || '').charAt(0)).toUpperCase()
    };
  }
  const avatar = (a) => a.alki ? '<span class="avatar avatar--alki" aria-hidden="true">' + Alki.logoSimbolo + '</span>' : '<span class="avatar" aria-hidden="true">' + esc(a.iniciales) + '</span>';

  function tarjeta(p, ses) {
    const a = autor(p.autorRol, p.autorId);
    const mio = p.autorRol === ses.rol && p.autorId === ses.refId;
    const puedeBorrar = mio || ses.rol === 'admin';
    const gusta = p.likes.includes(S.claveAutor(ses));
    const v = p.viviendaId ? S.buscar('viviendas', p.viviendaId) : null;
    return '<article class="post' + (a.alki ? ' post--alki' : '') + '" data-post="' + p.id + '">' +
      '<div class="post__cab">' + avatar(a) + '<div><div class="post__autor">' + esc(a.nombre) + '</div>' +
        '<div class="post__meta">' + esc(a.detalle) + (a.detalle ? ' · ' : '') + U.haceTiempo(p.fecha) + (v ? ' · solo ' + esc(v.codigo) : '') + '</div></div></div>' +
      (p.texto ? '<p class="post__texto">' + esc(p.texto) + '</p>' : '') + U.galeria(p.fotos) +
      '<div class="post__acciones">' +
        '<button class="post__accion' + (gusta ? ' post__accion--activo' : '') + '" type="button" data-like aria-pressed="' + gusta + '">' + ic('corazon') + '<span>' + (p.likes.length || '') + ' Me gusta</span></button>' +
        '<button class="post__accion" type="button" data-comentar>' + ic('comentario') + '<span>' + (p.comentarios.length || '') + ' Comentar</span></button>' +
        (puedeBorrar ? '<button class="post__accion post__borrar" type="button" data-borrar aria-label="Borrar publicación">' + ic('papelera') + '</button>' : '') +
      '</div>' +
      '<div class="comentarios">' + p.comentarios.map(function (c) {
        const ac = autor(c.autorRol, c.autorId);
        const borrable = (c.autorRol === ses.rol && c.autorId === ses.refId) || ses.rol === 'admin';
        return '<div class="comentario"><strong>' + esc(ac.nombre) + '</strong> ' + esc(c.texto) +
          '<div class="comentario__pie"><span>' + U.haceTiempo(c.fecha) + '</span>' + (borrable ? '<button type="button" data-borrar-com="' + c.id + '">Borrar</button>' : '') + '</div></div>';
      }).join('') + '</div>' +
      '<form class="comentar"><label class="oculto" for="com-' + p.id + '">Escribe un comentario</label><input id="com-' + p.id + '" type="text" placeholder="Escribe un comentario…" autocomplete="off" maxlength="500">' +
      '<button class="boton boton--peq" type="submit">Enviar</button></form>' +
      '</article>';
  }

  Alki.vistas.social = function (p, ses, q) {
    q = q || {};
    const casa = miVivienda(ses);
    const f = q.f || 'todos';
    let posts = (S.db.social || []).slice().sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
    if (ses.rol === 'inquilino') posts = posts.filter((x) => !x.viviendaId || (casa && x.viviendaId === casa.id));
    if (f === 'casa' && casa) posts = posts.filter((x) => x.viviendaId === casa.id || (x.autorRol === 'inquilino' && autor('inquilino', x.autorId).detalle.indexOf(casa.codigo) === 0));
    const base = ses.rol === 'admin' ? '/admin/social' : '/inquilino/social';
    const opcionesPara = ses.rol === 'admin'
      ? '<option value="">Toda la comunidad</option>' + S.db.viviendas.map((v) => '<option value="' + v.id + '">Solo ' + esc(v.codigo) + '</option>').join('')
      : '<option value="">Toda la comunidad</option>' + (casa ? '<option value="' + casa.id + '">Solo mi casa (' + esc(casa.codigo) + ')</option>' : '');

    // RGPD: para participar hace falta haber aceptado unirse a ALKI Social
    if (!S.enSocial(ses)) {
      return {
        titulo: 'ALKI Social',
        html: U.cabecera('ALKI Social', { subtitulo: 'La comunidad de quienes viven en un piso ALKI.' }) +
          '<div class="panel"><h2 style="font-size:1.15rem;margin-bottom:8px">Únete a la comunidad</h2>' +
          '<p>Comparte planes, recomendaciones del barrio y fotos con otros residentes de ALKI.</p>' +
          '<p class="suave pequeno" style="margin-top:10px">Otros residentes verán tu nombre, la inicial de tu apellido y tu vivienda. Puedes salir cuando quieras desde tu perfil. ' +
          '<a href="#" data-legal="privacidad">Política de privacidad</a> · <a href="#" data-legal="terminos">Normas de uso</a></p>' +
          '<div class="acciones"><button class="boton" type="button" id="unirme">' + ic('personas') + 'Unirme a ALKI Social</button></div></div>',
        montar: (raiz) => raiz.querySelector('#unirme').addEventListener('click', () => { S.unirseSocial(ses, true); U.toast('¡Bienvenido a ALKI Social!'); Alki.app.refrescar(); })
      };
    }
    return {
      titulo: 'ALKI Social',
      html: U.cabecera('ALKI Social', { subtitulo: 'La comunidad de quienes viven en un piso ALKI.' }) +
        '<form class="panel publicar" id="form-post">' +
          '<label class="oculto" for="post-texto">¿Qué quieres compartir?</label>' +
          '<textarea id="post-texto" maxlength="1500" placeholder="' + (ses.rol === 'admin' ? 'Escribe un aviso o una novedad para la comunidad…' : 'Comparte un plan, una recomendación del barrio o preséntate…') + '"></textarea>' +
          U.selectorFotos(4) +
          '<div class="publicar__pie"><label class="oculto" for="post-para">Para quién</label><select id="post-para">' + opcionesPara + '</select>' +
          '<button class="boton" type="submit">' + ic('enviar') + 'Publicar</button></div>' +
          '<p class="error-form" hidden></p>' +
        '</form>' +
        (casa ? '<nav class="chips chips--filtro" aria-label="Filtrar" style="margin:18px 0 12px">' +
          '<a href="#' + base + '?f=todos"' + (f !== 'casa' ? ' aria-current="true"' : '') + '>Comunidad</a>' +
          '<a href="#' + base + '?f=casa"' + (f === 'casa' ? ' aria-current="true"' : '') + '>Mi casa</a></nav>' : '<div style="height:18px"></div>') +
        (posts.length ? posts.map((x) => tarjeta(x, ses)).join('') : U.vacio('Todavía no hay publicaciones. ¡Sé el primero!')) +
        '<p class="suave pequeno" style="margin-top:18px;text-align:center">Sé respetuoso. ALKI puede retirar publicaciones que no cumplan las normas de convivencia.</p>',
      montar: function (raiz) {
        const form = raiz.querySelector('#form-post');
        const fotosElegidas = U.montarSelectorFotos(form);
        form.addEventListener('submit', function (e) {
          e.preventDefault();
          const texto = form.querySelector('#post-texto').value.trim();
          const urls = fotosElegidas();
          if (!texto && !urls.length) {
            const err = form.querySelector('.error-form');
            err.textContent = 'Escribe algo o añade una foto.'; err.hidden = false; return;
          }
          form.querySelector('button[type=submit]').disabled = true;
          U.guardarFotos(urls).then(function (ids) {
            S.publicar(ses, form.querySelector('#post-para').value, texto, ids);
            U.toast('Publicado');
            Alki.app.refrescar();
          });
        });
        raiz.querySelectorAll('[data-post]').forEach(function (art) {
          const id = art.dataset.post;
          art.querySelector('[data-like]').addEventListener('click', () => { S.meGusta(id, ses); Alki.app.refrescar(); });
          art.querySelector('[data-comentar]').addEventListener('click', () => art.querySelector('.comentar input').focus());
          const borrar = art.querySelector('[data-borrar]');
          if (borrar) borrar.addEventListener('click', function () {
            U.abrirModal('¿Borrar la publicación?', '<p>Se borrará para todos junto con sus comentarios.</p><div class="acciones">' +
              '<button class="boton boton--peligro" type="button" id="si-borrar">Borrar publicación</button><button class="boton boton--sec" type="button" data-cerrar-modal>Cancelar</button></div>', {
              alMontar: (m) => m.querySelector('#si-borrar').addEventListener('click', () => { S.borrarPost(id); U.cerrarModal(); U.toast('Publicación borrada'); Alki.app.refrescar(); })
            });
          });
          art.querySelectorAll('[data-borrar-com]').forEach((b) => b.addEventListener('click', () => { S.borrarComentario(id, b.dataset.borrarCom); Alki.app.refrescar(); }));
          art.querySelector('.comentar').addEventListener('submit', function (e) {
            e.preventDefault();
            const t = this.querySelector('input').value.trim();
            if (!t) return;
            S.comentarPost(id, ses, t);
            Alki.app.refrescar();
          });
        });
      }
    };
  };

  /* ---------- Menú «Más» (móvil): lo que no cabe en la barra de abajo ---------- */
  Alki.vistas.mas = function (p, ses) {
    const items = (Alki.menus[ses.rol] || []).filter((it) => it[4] === 'lateral');
    return {
      titulo: 'Más',
      html: U.cabecera('Más') +
        '<ul class="lista">' + items.map((it) =>
          '<li><a class="fila" href="#' + it[1] + '"><span class="fila__icono">' + ic(it[3]) + '</span><span class="fila__principal"><span class="fila__titulo">' + it[2] + '</span></span>' + ic('flecha') + '</a></li>').join('') +
          '<li><a class="fila" href="#/perfil"><span class="fila__icono">' + ic('usuario') + '</span><span class="fila__principal"><span class="fila__titulo">Mi perfil</span></span>' + ic('flecha') + '</a></li>' +
        '</ul>' +
        '<div class="acciones"><button class="boton boton--sec" type="button" id="salir-mas">' + ic('salir') + 'Cerrar sesión</button></div>',
      montar: function (raiz) {
        raiz.querySelector('#salir-mas').addEventListener('click', () => { S.cerrarSesion(); Alki.app.ir('/login'); });
      }
    };
  };
})();
