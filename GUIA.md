# App ALKI Rentals: guía del proyecto

App web y móvil (PWA) para **ALKI Rentals**, con tres perfiles: **inquilino**, **propietario** y **equipo ALKI**.
Está hecha con **HTML, CSS y JavaScript puro**: no hace falta instalar nada.

---

## 1. Las dos versiones

| Archivo | Para qué | Datos |
|---|---|---|
| `ALKI-App-clase.html` | Presentar en clase | Pisos, habitaciones, rentas, fechas y estado de pago **reales**; nombres, correos y teléfonos **inventados** |
| `ALKI-App-datos-reales.html` | Presentar a ALKI (uso interno) | **Todo real** (sin DNI ni pasaportes). **No lo subas a internet ni lo compartas**: contiene datos personales (RGPD) |

Cada archivo es **un solo .html**: doble clic y se abre en el navegador (Chrome, Edge o Safari en el ordenador). Las dos versiones guardan sus datos por separado, así que no se mezclan.

**Cómo se entra:**
1. La persona escribe **su correo** (el de su ficha en el programa de gestión).
2. Si es la primera vez, la app le pide **crear su contraseña** (mínimo 8 caracteres). Si ya la tiene, la escribe. Si la olvidó, puede crear una nueva.
3. Si una pareja comparte correo, la app pregunta **quién es**.
4. El equipo ALKI entra con `equipo@alki.es`.

5. En el primer acceso hay que **aceptar la Política de privacidad (RGPD) y los Términos de uso** (obligatorio). Unirse a **ALKI Social** es opcional y se puede cambiar desde el perfil. La app guarda la fecha de cada consentimiento.
6. Después, el inquilino **confirma los datos de su alquiler**: titular, vivienda, habitación, lo que paga al mes, día de pago, fianza y fechas. Si algo no cuadra, lo escribe y le llega a ALKI en *Necesita atención*. En **Personas** se ve qué contratos están confirmados, cuáles hay que revisar y cuáles faltan por confirmar.

Las contraseñas no se guardan tal cual, sino su huella cifrada (SHA-256). Los textos legales (`js/views/legal.js`) son un **borrador**: hay que revisarlos con la asesoría legal antes de usarlos con inquilinos reales. Para probar sin contraseñas, abajo del todo está **Probar con otro perfil**.

> Es un prototipo: no hay servidor, así que lo que se cambia se guarda en el navegador de ese ordenador y la contraseña es la misma para todos. Para que los inquilinos la usen de verdad en su móvil, hace falta un servidor con usuarios reales (ver punto 6).

### Actualizar los datos
En el **Panel de ALKI → Importar CSV**, selecciona a la vez los dos archivos que exportas del programa de gestión (contratos e inquilinos). La app vuelve a cruzarlos y **conserva** lo que hayas hecho: pagos confirmados, incidencias, mensajes y los datos de cada vivienda.

### Cómo se cruzan los datos
- Contrato `Alb20-H1` → vivienda **Alb20** → habitación **H1**.
- Inmueble `025. Albocácer 20 P16 (Alb20) - Antonio` → n.º 025, dirección, código y propietario.
- Los nombres del contrato se buscan en el CSV de inquilinos para sacar el correo, el teléfono y la **solvencia**.
- La solvencia decide el estado de los recibos: *al día* → todo pagado; *pending* → falta el mes actual; *overdue* → faltan el mes anterior y el actual.
- El barrio, el tipo de habitación y la cama salen de alki.es/rooms. Las habitaciones de la web sin contrato aparecen como **libres**.
- **Revisar datos** (en el panel) lista las incoherencias: habitaciones con dos contratos, fichas que no cuadran con su contrato, correos compartidos…

### Lo que no viene en los CSV (se rellena en la app)
En **Viviendas → (piso) → Datos de la vivienda**: la renta al propietario, las fechas del contrato con el propietario, el barrio, el estado y la nota de revisión, el wifi y el día de limpieza. Con la renta al propietario se calcula la rentabilidad de cada piso, y el propietario ve sus ingresos.

## 2. Qué hace cada perfil

### Inquilino
Barra de abajo: **Inicio · Pagos · Incidencias · Social · Más** (en *Más*: Documentos, Mi casa, Embajadores y Mi perfil).
- **Inicio**: su "llavero" con el código de la habitación, el próximo pago, las incidencias abiertas y los avisos de la casa.
- **Pagos**: el estado del mes actual y un **calendario con todos los meses del contrato**, en verde si está pagado, en amarillo si está pendiente, en rojo si está vencido y en blanco si es un mes próximo. Al pulsar un mes se ve el detalle, el recibo o el botón **Ya he pagado**.
- **Incidencias**: reportar una avería con categoría, urgencia y **hasta 6 fotos**. Después se puede seguir el arreglo, añadir comentarios y más fotos, confirmar que está solucionado o reabrirla si vuelve a fallar.
- **ALKI Social**: el muro de la comunidad, con publicaciones con fotos, me gusta y comentarios, para toda la comunidad o solo para su casa. El equipo ALKI puede publicar y borrar.
- **Documentos**: contrato, normas e inventario generados por la app, más sus propios archivos (DNI, nóminas…).
- **Mi casa**: el plano del piso con su habitación marcada, el wifi, el día de limpieza, la fecha de fin del contrato y los botones para **renovar** o **avisar de la salida**.
- **Embajadores**: el código de recomendación y el programa de 30 € (salen del dossier de ALKI).

### Propietario
- **Mis viviendas**: el estado de cada piso con su plano (ocupada / libre / en reforma), las revisiones y las incidencias.
- **Detalle de vivienda**: el informe de revisión, el contrato con ALKI, las reformas con sus pasos y las incidencias del inmueble.
- **Ingresos**: lo que ALKI le transfiere cada mes y un resumen imprimible para la declaración de la renta.
- **Documentos** y **Mensajes** con su gestor.
- **Privacidad (RGPD)**: el propietario **no ve** nombres ni datos de los inquilinos, porque en Rent to Rent su contrato es con ALKI.

### Equipo ALKI
- **Panel**: ocupación, habitaciones libres, cobrado del mes y recibos vencidos, más una lista de "Necesita atención" (pagos por confirmar, incidencias urgentes, solicitudes).
- **Rentabilidad por vivienda**: ingresos menos la renta al propietario, calculada como *diferencia inicial* (no es el beneficio neto, igual que en el dossier).
- **Viviendas**: el plano con el nombre de cada residente, y las habitaciones que se pueden pasar a reforma o marcar como listas para alquilar.
- **Incidencias**: registrar las que llegan por WhatsApp, cambiar el estado, asignar un proveedor y un coste, responder al inquilino con **fotos del arreglo** y decidir si la ve el propietario.
- **Social**: publicar novedades y moderar la comunidad.
- **Cobros**: confirmar pagos y marcar recibos como cobrados.
- **Personas**: la ficha de cada residente y de cada propietario.
- **Mensajes** con los propietarios y **Publicar aviso** para los residentes.

**Prueba para la presentación:** entra como un inquilino y reporta una incidencia. Luego entra como equipo ALKI, cámbiala a "En curso" con un mensaje y vuelve a entrar como ese inquilino: verás el seguimiento actualizado.

---

## 3. Estructura de archivos

```
alki-app/
├── index.html          ← única página HTML; carga los estilos y los scripts
├── manifest.json       ← datos de la PWA (nombre, icono, colores)
├── sw.js               ← service worker: permite usarla sin conexión
├── css/styles.css      ← todo el diseño (colores, tipografías, componentes)
├── assets/             ← iconos y tipografías
└── js/
    ├── demo-csv.js     ← CSV de ALKI con nombres inventados (versión de clase)
    ├── data.js         ← importador de CSV: cruza contratos, inquilinos y pisos
    ├── views/legal.js  ← política de privacidad (RGPD) y términos de uso
    ├── store.js        ← guardar, leer y modificar datos (localStorage)
    ├── ui.js           ← piezas reutilizables: euros, fechas, iconos, modales, plano
    ├── app.js          ← navegación (router) y estructura con menús
    └── views/
        ├── login.js        ← pantalla de acceso
        ├── comunes.js      ← documentos, perfil y subida de archivos
        ├── inquilino.js    ← pantallas del inquilino
        ├── propietario.js  ← pantallas del propietario
        └── admin.js        ← panel del equipo ALKI
```

---

## 4. Cómo funciona por dentro (para explicarlo en clase)

**Es una SPA (Single Page Application).** Solo hay un `index.html`. Lo que va detrás de la `#` en la dirección (`#/inquilino/pagos`) dice qué pantalla mostrar. `app.js` escucha el evento `hashchange` y pinta la vista que corresponde.

**Cada pantalla es una función** que devuelve:
- `html`: el contenido en texto HTML.
- `montar`: una función que conecta los botones y formularios (`addEventListener`) después de pintar.

**Los datos se guardan en `localStorage`**, el almacenamiento del navegador, con `JSON.stringify` y `JSON.parse`. `store.js` es la única pieza que lo toca. Si en el futuro se conecta un servidor real, solo habría que cambiar ese archivo.

**Roles y permisos.** Al iniciar sesión se guarda el rol del usuario. El router comprueba que cada ruta sea de ese rol; si no, lo redirige a su inicio.

**Modelo de datos.** Las "tablas" se relacionan con identificadores, igual que en una base de datos:

```
Propietario → Vivienda → Habitación ← Contrato → Inquilino
                  │                      │
            Incidencias, Reformas      Pagos
```

Un **pago va ligado a un contrato**, no a una habitación. Así, si un inquilino se cambia de habitación (como pasó con los cambios de H1 y H4 del dossier), su historial no se mezcla con el de otra persona.

**Seguridad básica.** Todo lo que escribe el usuario pasa por `esc()` antes de mostrarse, para que nadie pueda meter HTML o JavaScript (ataque XSS).

**Diseño mobile first.** El CSS está pensado primero para el móvil (barra de pestañas abajo) y, desde 960 px, muestra una barra lateral. Se usan **CSS Grid** (el plano del piso se dibuja con `grid-template-areas`), **Flexbox** y **variables CSS** con los colores de alki.es (azul marino #062637 y el azul del logo #91B6FF).

**PWA.** Con `manifest.json` y `sw.js` la web se puede instalar en el móvil y funciona sin conexión. Esto solo se activa cuando la app está publicada en internet (ver el punto siguiente).

**Accesibilidad.** Tiene etiquetas en los formularios, foco visible con el teclado, textos alternativos, `aria-current` en el menú y respeta la opción del sistema "reducir movimiento".

---

## 5. Usarla en el móvil (publicarla gratis)

Hay dos opciones:
- **Netlify Drop**: entra en `app.netlify.com/drop` y arrastra la carpeta `alki-app`. Te da un enlace al momento.
- **GitHub Pages**: sube la carpeta a un repositorio y activa *Settings → Pages*.

Abre el enlace en el móvil y, en el menú del navegador, elige **Añadir a pantalla de inicio**.

---

## 6. Siguientes pasos posibles

- **Backend real** (Supabase o Firebase). Es imprescindible para que los datos se compartan entre dispositivos: así cada inquilino entra desde su móvil, ALKI Social es la misma para todos y el correo de primer acceso llega de verdad. Las fotos se guardarían en el almacenamiento de Supabase.
- **Notificaciones push** cuando cambie el estado de una incidencia o se acerque un pago.
- **Pago online** del recibo (Stripe o Redsys).
- **Asistente con IA** para preguntas frecuentes de los inquilinos (sección 14 del dossier).
- **Calendario de visitas** para habitaciones libres.

---

## 7. ALKI Panel (herramienta interna del equipo)

Es una app **aparte** (`panel.html`), solo para los trabajadores de ALKI. Usa los mismos datos que la app de inquilinos: si las dos se abren en el mismo navegador, lo que reporta un inquilino aparece en el panel y lo que responde el equipo lo ve el inquilino.

### Acceso
- El encargado (Daniel) entra con su correo y crea su contraseña. Tiene **acceso total**.
- En **Equipo** da de alta a cada trabajador con su correo. La primera vez que entra, el trabajador crea su contraseña y acepta el compromiso de confidencialidad (RGPD).
- Si alguien olvida su contraseña, el encargado la **restablece**. También puede **desactivar** el acceso de una persona.

### Permisos por pestaña
Cada persona tiene, para cada pestaña, **Sin acceso** (no la ve), **Solo ver** (la consulta sin poder cambiar nada) o **Editar**. Hay perfiles de partida (Mantenimiento, Administración y cobros, Comercial, Atención al inquilino, Acceso total) que luego se ajustan casilla a casilla. *Equipo* y *Actividad* son solo del encargado.

### Pestañas
| Pestaña | Qué hace |
|---|---|
| Resumen | Cifras del día, lo que necesita atención y mis incidencias |
| Incidencias | **Tablero compartido** (Abiertas, En curso, Resueltas), asignar responsable, responder con fotos; cada respuesta lleva el nombre de quien la escribe |
| Viviendas | Pisos, habitaciones y datos de cada vivienda (renta al propietario, wifi…) |
| Costes | **Gastos de cada piso y beneficio real** (ver abajo) |
| Cobros | Recibos de los inquilinos |
| Inquilinos | Contratos, residentes, propietarios y confirmación de datos |
| Comunicación | Mensajes con propietarios, ALKI Social y avisos |
| Datos | Importar los CSV, revisar incoherencias, copias de seguridad |
| Equipo | Alta de trabajadores y permisos |
| Actividad | Registro de todo lo que hace cada persona |

### Costes y beneficio real
- **Añadir gasto**: vivienda (o «General» si es de la empresa), categoría (suministros, mantenimiento, limpieza, comunidad, seguros, impuestos y tasas, gestión, mobiliario, otros), importe, fecha, si se repite y foto de la factura.
- **Gastos que se repiten**: *puntual* cuenta en su mes; *cada mes* cuenta todos los meses; *trimestral* y *anual* se reparten por meses (un IBI de 540 € cuenta 45 € al mes).
- **Importar gastos desde CSV** con la plantilla (`vivienda;categoria;concepto;importe;fecha;recurrencia;hasta`). Útil para pasar de golpe las facturas de luz, agua e internet.
- **Beneficio = ingresos − renta al propietario − gastos − coste de las incidencias.** Se puede ver por mes o por año, con los ingresos *previstos* (según contratos) o *cobrados* (recibos pagados).
- **Calculadora**: simula un piso cambiando ocupación, precios y costes, y dice cuántas habitaciones hacen falta para no perder dinero.

### Lo que falta para usarlo de verdad entre los 4
Ahora cada navegador guarda sus datos. Para que el equipo comparta incidencias y gastos desde distintos ordenadores y móviles hace falta un **servidor** (por ejemplo Supabase). Con el servidor, además, los permisos se comprueban también en el servidor, que es lo seguro de verdad.
