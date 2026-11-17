# Seguridad de ALKI Gestión

Ninguna aplicación es invulnerable. El objetivo es reducir el riesgo con varias capas de protección: si una falla, la siguiente sigue protegiendo. Esta tabla relaciona cada medida con el archivo que la implementa y con el riesgo de **OWASP Top 10 (2021)** que cubre.

| Medida | Dónde | OWASP |
|---|---|---|
| Contraseñas con **scrypt** (N=2¹⁷, r=8, p=1) y sal propia | `seguridad/cifrado.js` | A02, A07 |
| Política de contraseñas: mínimo 12 caracteres, sin el correo, no comunes | `seguridad/cifrado.js` | A07 |
| **MFA (TOTP)** obligatorio para Administración y Dirección; un código no se puede reutilizar | `seguridad/totp.js`, `rutas/auth.js` | A07 |
| Límite de intentos por IP y bloqueo de la cuenta 15 min tras 5 fallos | `seguridad/limites.js`, `rutas/auth.js` | A07 |
| Mensajes genéricos (no revelan qué correos existen) y tiempo de respuesta constante | `rutas/auth.js`, `cifrado.js` | A07 |
| Sesión en cookie `HttpOnly` + `Secure` + `SameSite=Strict`; solo se guarda el hash del token | `seguridad/sesiones.js` | A07 |
| Cierre por inactividad (30 min, configurable) y duración máxima (12 h) | `sesiones.js`, `public/js/app.js` | A07 |
| Al cambiar la contraseña, el rol o desactivar a alguien, se cierran sus sesiones | `rutas/auth.js`, `rutas/admin.js` | A01 |
| Recuperación con enlace de un solo uso, que caduca en 30 min | `rutas/auth.js` | A07 |
| **Control de acceso por pestaña y por persona** (ver / editar), comprobado en el servidor en cada petición. Solo un Administrador puede dar permisos de administración o tocar a otro Administrador | `seguridad/permisos.js`, `http.js`, `rutas/admin.js` | A01 |
| Mínimo privilegio: el personal operativo no ve finanzas ni datos de inquilinos | `permisos.js` y cada ruta | A01 |
| **SQL Injection**: todas las consultas con parámetros `?` | `db.js` | A03 |
| **XSS**: plantillas que escapan todo + Content-Security-Policy estricta, sin scripts en línea | `public/js/ui.js`, `http.js` | A03 |
| **CSRF**: token por sesión en cada petición que modifica datos + comprobación de `Origin` + SameSite | `http.js` | A01 |
| Validación de **todas** las entradas (tipos, longitudes, listas cerradas) | `seguridad/validar.js` | A03, A04 |
| Archivos: tipo comprobado por su contenido real, tamaño máximo, guardados fuera de la web con nombre aleatorio y descarga solo con sesión | `rutas/mantenimientos.js` | A04, A08 |
| Cabeceras: CSP, HSTS, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy | `http.js` | A05 |
| Secretos solo en el servidor (`.env`), token de Homming cifrado con AES-256-GCM | `config.js`, `integraciones/index.js` | A02 |
| **Cero dependencias externas** (solo Node.js) → no hay ataques por paquetes de npm | `package.json` | A06 |
| **Auditoría**: accesos, fallos, cambios, descargas e importaciones | `servicios/auditoria.js` | A09 |
| Copias de seguridad automáticas diarias (se conservan 30) | `servicios/copias.js` | — |
| El servidor solo escucha en 127.0.0.1; HTTPS a través de Nginx | `config.js`, README | A05 |
| Integraciones solo con `https://`, con tiempo límite y sin seguir redirecciones | `integraciones/homming.js` | A10 |

## Tareas periódicas (responsable: administrador)

- **Cada mes:**
  - Actualizar Node.js (`sudo apt upgrade nodejs`) y el sistema (`sudo apt upgrade`).
  - Revisar *Administración → Registro de actividad*: intentos fallidos, IP frenadas, descargas.
  - Comprobar que las copias salen del servidor (ver README).
- **Cada 6 meses:** revisar usuarios y roles, y quitar el acceso a quien ya no lo necesite.
- **Si se pierde un móvil con MFA:** *Administración → Usuarios → Reiniciar MFA*.
- **Si se sospecha que se ha filtrado algo:**
  - Cambiar `APP_SECRET`. Esto obliga a reconfigurar el MFA y el token de Homming.
  - Regenerar el token en Homming.
  - Cerrar las sesiones borrando la tabla `sesiones`.

## Antes de usarla con datos reales

- Pasar una **auditoría externa** o, como mínimo, [OWASP ZAP](https://www.zaproxy.org/) contra la web publicada.
- Firmar con Homming y con el hosting los contratos de encargado del tratamiento (RGPD), ya que la plataforma guarda datos personales de inquilinos.
