# Cómo compartir ALKI sin tocar código

En este repositorio hay tres cosas:

| Qué | Para quién | Dónde está |
|---|---|---|
| **App de inquilinos y propietarios** (versión de prueba) | Inquilinos que la quieran probar | https://dm3298995.github.io/Alki-APP/ |
| **Panel de demostración** (versión sencilla, sin servidor) | Para enseñarlo | https://dm3298995.github.io/Alki-APP/panel.html |
| **Plataforma del equipo** (la completa, con usuarios, permisos y datos compartidos) | Los 4 de ALKI | Carpeta `plataforma/` → se publica en Render (abajo) |

Las dos primeras se publican solas con GitHub Pages cada vez que cambia el repositorio. Cada persona que las abre ve **su propia copia** de los datos, guardada en su móvil. Todo son **datos ficticios**.

## 1. Probar la app con inquilinos

1. Envía el enlace de la app. En el iPhone se instala desde Safari con **Compartir → Añadir a pantalla de inicio**.
2. En la app aparece la franja **«Versión de prueba · Tu opinión»**. Con ese botón, los inquilinos te mandan su puntuación y sus comentarios por correo, a `daniel@alki.casa`.
3. Si prefieres recoger las opiniones en un **Google Forms** o un **Tally**, crea el formulario y pega su enlace en `js/config.js`, en `opinionUrl`, desde la web de GitHub: abre el archivo, pulsa el lápiz ✏️, cambia el texto y pulsa **Commit changes**.

## 2. Estadísticas de uso (Google Analytics)

1. Entra en https://analytics.google.com con tu cuenta de Google.
2. Pulsa **Administrar → Crear → Propiedad** y ponle de nombre «ALKI App».
3. Elige **Web**, pon la dirección `https://dm3298995.github.io/Alki-APP/` y crea el flujo de datos.
4. Copia el **ID de medición**, que tiene esta forma: `G-ABC123XYZ`.
5. Pégalo en `js/config.js`, donde pone `analitica: { proveedor: 'ga4', id: '' }`, entre las comillas de `id`. Haz **Commit changes**. También me lo puedes pasar a mí y lo pongo yo.

A partir de ahí:
- La app pide permiso antes de medir (aviso de cookies, obligatorio en España). Si alguien dice que no, no se le mide.
- En Google Analytics verás, en **Informes**:
  - **Tiempo real**: quién está usando la app ahora.
  - **Interacción → Páginas y pantallas**: qué pantallas se usan y el **tiempo medio** en cada una.
  - **Usuarios**: cuántas personas, desde qué dispositivo y de dónde.
  - **Eventos**: `opinion_abierta` y `opinion_enviada`.
- Cada pantalla de la app cuenta como una página, por ejemplo `/app/inicio`, `/app/pagos` o `/app/incidencias`.

¿Prefieres no usar cookies ni mostrar aviso? Cambia `proveedor` a `'umami'` o `'cloudflare'` y usa el código de Umami Cloud o de Cloudflare Web Analytics. Las dos son gratis.

## 3. Publicar la plataforma del equipo (Render)

Así los 4 trabajáis a la vez con los mismos datos, cada uno con su usuario y sus permisos.

1. Entra en https://render.com y crea una cuenta con **«Sign in with GitHub»**.
2. Pulsa **New → Blueprint** y elige el repositorio **Alki-APP**.
3. Render lee el archivo `render.yaml` y lo prepara todo. Pulsa **Apply**. Es el plan *Starter* con 1 GB de disco, unos 7–8 $/mes; el plan gratuito no sirve porque borra los datos.
4. Espera 2–3 minutos. Te dará una dirección como `https://alki-plataforma.onrender.com`.
5. Abre el servicio en Render, pulsa **Logs** y busca la línea **«Elige la tuya aquí»**: es tu enlace para crear la contraseña de `daniel@alki.casa`. Ábrelo y configura la verificación en dos pasos con Google Authenticator.
6. Dentro, ve a **Configuración → Accesos y usuarios → Añadir persona** e invita a tus 3 compañeros. Les llega un correo, o puedes reenviarles el enlace. Con el interruptor de cada pestaña decides qué ve cada uno.

Más cosas útiles:
- **Datos de demostración:** la primera vez se carga la demo con datos ficticios. La contraseña de los usuarios de prueba (`gestion@demo.alki`, `operativo@demo.alki`…) está en Render → **Environment → DEMO_CLAVE**.
- **Para empezar con vuestros datos reales:** cambia `DEMO_AL_INICIAR` a `0` y borra el disco, o crea un servicio nuevo. Después importa el CSV de Homming en **Configuración → Importar datos**.
- **Estadísticas del equipo:** están en **Configuración → Uso de la plataforma** (quién entra, cuánto tiempo y qué usa). No se envía nada a Google.
- **Actualizaciones:** cada vez que se cambie el repositorio, Render vuelve a publicar solo y los datos se mantienen.

> ⚠️ No compartas el enlace de la plataforma con inquilinos: es la herramienta interna, con cifras de la empresa. A ellos dales solo la app.
