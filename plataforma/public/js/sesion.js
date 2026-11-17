/* ==========================================================================
   sesion.js — PERMISOS DE LA PERSONA QUE HA ENTRADO (para las pantallas)
   app.js lo rellena al iniciar sesión. Sirve para ocultar botones y campos;
   el servidor comprueba igualmente cada permiso en cada petición.
   ========================================================================== */
export const sesion = { permisos: [] };
export const puede = (p) => sesion.permisos.includes(p);
