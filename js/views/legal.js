/* ==========================================================================
   legal.js — POLÍTICA DE PRIVACIDAD (RGPD) Y TÉRMINOS DE USO
   --------------------------------------------------------------------------
   Textos que el usuario acepta al crear su contraseña. Son un borrador:
   ALKI debe revisarlos con su asesoría legal antes de usarlos con clientes.
   ========================================================================== */
window.Alki = window.Alki || {};

Alki.legal = (function () {
  const C = Alki.constantes;
  const version = '1.0 · noviembre 2026';

  const privacidad =
    '<div class="legal">' +
    '<h3>Responsable</h3><p>' + C.empresa + ', Valencia (España). Contacto para protección de datos: <a href="mailto:' + C.contacto.email + '">' + C.contacto.email + '</a>.</p>' +
    '<h3>Qué datos tratamos</h3><ul><li>Identificación y contacto: nombre, correo y teléfono.</li><li>Datos del contrato: vivienda, habitación, renta, fianza y fechas.</li>' +
    '<li>Pagos: recibos y su estado.</li><li>Incidencias: descripciones y fotos que subas.</li><li>Si te unes a ALKI Social: tus publicaciones, comentarios y fotos.</li></ul>' +
    '<h3>Para qué</h3><ul><li>Gestionar tu contrato de alquiler, los cobros y el mantenimiento de la vivienda.</li><li>Atender tus incidencias y solicitudes.</li>' +
    '<li>Enviarte avisos sobre tu vivienda.</li><li>ALKI Social, solo si lo aceptas expresamente.</li></ul>' +
    '<h3>Base legal</h3><p>La ejecución de tu contrato de arrendamiento (art. 6.1.b RGPD), el cumplimiento de obligaciones legales (art. 6.1.c) y, para ALKI Social, tu consentimiento (art. 6.1.a), que puedes retirar cuando quieras desde tu perfil.</p>' +
    '<h3>Quién más ve tus datos</h3><p>El equipo de ALKI. Los proveedores que reparan una incidencia reciben solo lo necesario para hacerlo. El propietario de la vivienda no ve tus datos personales. En ALKI Social, el resto de residentes ve tu nombre, la inicial de tu apellido y tu vivienda.</p>' +
    '<h3>Cuánto tiempo</h3><p>Mientras dure tu contrato y, después, durante los plazos que exige la ley (por ejemplo, fiscales). Las publicaciones de ALKI Social se borran si te das de baja.</p>' +
    '<h3>Tus derechos</h3><p>Puedes pedir acceso, rectificación, supresión, oposición, limitación y portabilidad de tus datos escribiendo a ' + C.contacto.email + '. Si no estás conforme, puedes reclamar ante la Agencia Española de Protección de Datos (aepd.es).</p>' +
    '<p class="suave pequeno">Versión ' + version + '. Texto provisional pendiente de revisión legal.</p></div>';

  const terminos =
    '<div class="legal">' +
    '<h3>Uso de la app</h3><p>La app de ALKI sirve para consultar tu contrato, tus pagos y tus documentos, comunicar incidencias y relacionarte con ALKI. Tu cuenta es personal: no compartas tu contraseña.</p>' +
    '<h3>Datos del contrato</h3><p>Los datos que ves en la app reflejan tu contrato firmado. Si algo no coincide, avísanos desde la app: el contrato firmado prevalece mientras lo revisamos.</p>' +
    '<h3>Pagos</h3><p>Pulsar «Ya he pagado» es un aviso: el recibo queda pagado cuando ALKI confirma el ingreso.</p>' +
    '<h3>Incidencias y fotos</h3><p>Sube solo fotos de la vivienda o del problema. No subas fotos en las que aparezcan otras personas sin su permiso.</p>' +
    '<h3>ALKI Social</h3><ul><li>Trata a los demás con respeto. No se permiten insultos, acoso, discriminación ni contenido ilegal.</li>' +
    '<li>No publiques datos personales de otras personas.</li><li>No se permite publicidad ni subarrendar habitaciones.</li>' +
    '<li>ALKI puede retirar publicaciones que no cumplan estas normas o las normas de convivencia.</li></ul>' +
    '<p class="suave pequeno">Versión ' + version + '. Texto provisional pendiente de revisión legal.</p></div>';

  function abrir(tipo) {
    Alki.ui.abrirModal(tipo === 'terminos' ? 'Términos de uso' : 'Política de privacidad', tipo === 'terminos' ? terminos : privacidad, { ancho: true });
  }
  // Cualquier enlace con data-legal="privacidad|terminos" abre el texto
  document.addEventListener('click', function (e) {
    const b = e.target.closest('[data-legal]');
    if (!b) return;
    e.preventDefault();
    abrir(b.dataset.legal);
  });
  return { version, abrir };
})();
