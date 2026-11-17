/* ==========================================================================
   api.js — COMUNICACIÓN CON EL SERVIDOR
   · Envía siempre el token CSRF en las peticiones que modifican datos.
   · Si la sesión caduca (401), vuelve a la pantalla de acceso.
   · Nunca guarda contraseñas ni tokens en el navegador: la sesión va en una
     cookie HttpOnly que JavaScript no puede leer.
   ========================================================================== */
let csrf = '';
let alCaducar = () => {};

export const configurar = (opc) => { if (opc.csrf !== undefined) csrf = opc.csrf; if (opc.alCaducar) alCaducar = opc.alCaducar; };

export async function api(ruta, { metodo = 'GET', datos, crudo, tipo } = {}) {
  const cab = { Accept: 'application/json' };
  let cuerpo;
  if (metodo !== 'GET') cab['X-CSRF-Token'] = csrf;
  if (crudo) { cuerpo = crudo; cab['Content-Type'] = tipo || 'application/octet-stream'; }
  else if (datos !== undefined) { cuerpo = JSON.stringify(datos); cab['Content-Type'] = 'application/json'; }
  let r;
  try {
    r = await fetch(ruta, { method: metodo, headers: cab, body: cuerpo, credentials: 'same-origin', cache: 'no-store' });
  } catch {
    throw new Error('No hay conexión con el servidor. Comprueba tu internet.');
  }
  let json = null;
  try { json = await r.json(); } catch { /* respuesta vacía */ }
  if (r.status === 401 && !ruta.startsWith('/api/auth/')) { alCaducar(json?.error); throw new Error(json?.error || 'Sesión caducada'); }
  if (!r.ok) throw Object.assign(new Error(json?.error || 'Error ' + r.status), { estado: r.status });
  return json;
}

export const get = (ruta) => api(ruta);
export const post = (ruta, datos) => api(ruta, { metodo: 'POST', datos: datos ?? {} });
export const put = (ruta, datos) => api(ruta, { metodo: 'PUT', datos });
export const del = (ruta) => api(ruta, { metodo: 'DELETE' });
export const subir = (ruta, archivo) => api(ruta, { metodo: 'POST', crudo: archivo, tipo: archivo.type || 'application/octet-stream' });
