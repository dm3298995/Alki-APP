# Conectar el panel de ALKI a Firebase

Con Firebase, los 4 del equipo trabajáis sobre **los mismos datos**: lo que uno cambia, los demás lo ven al momento en su móvil. Sin Firebase, cada móvil guarda su propia copia (modo demostración).

Es gratis para el uso de ALKI (plan Spark de Firebase). No hace falta tarjeta.

## 1. Crear el proyecto (5 minutos)

1. Entra en <https://console.firebase.google.com> con la cuenta de Google de ALKI.
2. **Crear un proyecto** → nombre `alki-panel` → puedes desactivar Google Analytics → **Crear proyecto**.

## 2. Activar el acceso con correo y contraseña

1. Menú de la izquierda: **Compilación → Authentication → Comenzar**.
2. Pestaña **Método de acceso** → **Correo electrónico/contraseña** → activa el primer interruptor → **Guardar**.
3. Pestaña **Configuración → Dominios autorizados → Agregar dominio** → escribe `dm3298995.github.io` → **Agregar**.
4. (Opcional) Pestaña **Plantillas**: arriba, cambia el idioma de los correos a **Español**.

## 3. Crear la base de datos

1. Menú: **Compilación → Firestore Database → Crear base de datos**.
2. Ubicación: **eur3 (europe-west)** (los datos se quedan en Europa, como pide el RGPD) → **Siguiente**.
3. Elige **Iniciar en modo de producción** → **Crear**.
4. Pestaña **Reglas**: borra todo lo que hay, pega el contenido del archivo [`firestore.rules`](firestore.rules) de este repositorio y pulsa **Publicar**.

## 4. Pasar la configuración a la app

1. Rueda dentada (arriba a la izquierda) → **Configuración del proyecto**.
2. Abajo, en **Tus apps**, pulsa el icono **`</>`** (Web) → apodo `panel` → **Registrar app** (no hace falta Hosting).
3. Aparece un bloque `firebaseConfig` con `apiKey`, `authDomain`, `projectId`, `appId`…
4. Copia esos cuatro valores en `js/config.js`, en la línea `firebase:` (o pásaselos a Claude y lo hace él):

```js
firebase: { apiKey: 'AIza…', authDomain: 'alki-panel.firebaseapp.com', projectId: 'alki-panel', appId: '1:…:web:…' }
```

Estos valores no son secretos: lo que protege los datos son las reglas del paso 3.

## 5. Primer acceso (lo hace el encargado, el primero)

1. Abre <https://dm3298995.github.io/Alki-APP/panel.html>.
2. Pulsa **Es mi primera vez**, escribe tu correo y una contraseña.
3. Te llega un correo de confirmación: pulsa el enlace (mira en Spam) y vuelve al panel → **Ya lo he confirmado**.
4. Como la base de datos está vacía, te pregunta si eres el encargado → **Soy el encargado: activar**. Se suben los datos que haya en ese navegador.
5. Ve a **Datos** e importa los CSV reales de contratos e inquilinos: se guardan en Firebase, nunca en GitHub.

> Importante: el primer correo que activa la base de datos se queda como encargado para siempre. Hazlo tú justo después de pegar la configuración.

## 6. Dar de alta al equipo

En **Equipo → Añadir trabajador**: nombre, correo y permisos. Envíale el enlace del panel (botón «Enviar por WhatsApp»). Él pulsa **Es mi primera vez**, crea su contraseña con ese correo, confirma el correo y entra.

- **Desactivar acceso**: deja de poder entrar, pero sigue en la lista.
- **Eliminar**: desaparece del equipo. Lo que hizo se conserva con su nombre.
- **Cambiar contraseña**: le llega un correo para elegir una nueva.

## Qué protege Firebase y qué no

- Solo entra quien está en el equipo, tiene el acceso activo y ha confirmado su correo. Lo comprueba Firebase, no solo la app.
- Solo el encargado puede dar de alta, cambiar o eliminar a gente del equipo.
- Los permisos por pestaña (ver / editar) los aplica la app. Un trabajador del equipo con conocimientos técnicos podría saltárselos; si eso preocupa, el siguiente paso es llevarlos también a las reglas.
- Las fotos de las incidencias siguen guardándose en cada móvil (Firebase Storage necesita el plan de pago).

## Límites del plan gratuito

50.000 lecturas y 20.000 escrituras al día. Cada vez que alguien abre el panel se leen unos 1.000 registros, así que da para unas 50 aperturas al día entre todos (si alguien vuelve a abrirlo en menos de media hora, solo se leen los cambios). Si se queda corto, el plan de pago (Blaze) cobra céntimos por uso.
