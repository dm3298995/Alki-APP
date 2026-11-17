/* ==========================================================================
   config.js — AJUSTES DE LA VERSIÓN PÚBLICA (se pueden cambiar sin programar)
   Para cambiar algo desde la web de GitHub: abre este archivo, pulsa el lápiz
   (Edit), cambia el valor entre comillas y pulsa «Commit changes».
   ========================================================================== */
window.Alki = window.Alki || {};
Alki.config = {
  // Muestra la franja «Versión de prueba» y el botón «Tu opinión»
  modoPrueba: true,

  // Dónde se envían las opiniones. Si pones el enlace de un Google Forms o
  // Tally, el botón lo abre. Si lo dejas vacío, se abre un correo a esta dirección.
  opinionUrl: '',
  opinionCorreo: 'daniel@alki.casa',

  // Estadísticas de uso. proveedor: 'ga4' (Google Analytics), 'umami' o 'cloudflare'.
  //  · ga4: id = «G-XXXXXXXXXX». Usa cookies → se pide permiso antes de medir.
  //  · umami: id = el «website ID» de Umami (sin cookies, no hace falta permiso).
  //  · cloudflare: id = el «token» de Cloudflare Web Analytics (sin cookies).
  // Mientras id esté vacío no se mide nada.
  analitica: { proveedor: 'ga4', id: '' }
};
