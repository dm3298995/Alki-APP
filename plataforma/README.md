# ALKI Gestión: plataforma interna

Plataforma privada para ver de un vistazo cómo están los pisos de ALKI:

- qué habitaciones están ocupadas, cuáles están libres y cuáles quedan libres pronto;
- cómo van los pagos;
- cuánto cuesta realmente mantener cada inmueble.

Está hecha con **Node.js sin librerías externas**, **SQLite** como base de datos y **HTML, CSS y JavaScript** en el navegador.

## Qué incluye

| Sección | Qué hace |
|---|---|
| **Incidencias** | Tablero compartido por todo el equipo (Nueva → En curso → Esperando → Resuelta), en el que se arrastran las tarjetas de una columna a otra. Cada incidencia se asigna a una persona y tiene prioridad, fecha límite, comentarios, fotos e historial de cambios. Al registrar su coste se crea un mantenimiento enlazado, que pasa a los gastos del piso. En el menú se ve cuántas incidencias tiene asignadas cada uno. |
| **Ingresos** | Botón **«Nuevo ingreso»** para registrar a mano lo que entra fuera de los recibos (penalizaciones, cargos por daños o llaves, reembolsos del seguro, estancias cortas, ventas…): fecha, quién paga, importe, concepto, método, piso y habitación si corresponde, y observaciones. Suman en el panel, las estadísticas y la rentabilidad. Historial filtrable por fechas, piso, persona y concepto, que puede incluir también los cobros de recibos. |
| **Facturas** | Todas las facturas adjuntas a gastos y mantenimientos, con filtro y descarga. Es un permiso aparte. |
| **Beneficios (Rentabilidad)** | Beneficio real de cada piso: ingresos menos alquiler, suministros, limpieza, mantenimiento, impuestos y tasas, seguros, comisiones y la parte que le toca de los gastos generales de la empresa. Muestra también el impuesto sobre beneficios estimado, el margen y el beneficio por habitación. Incluye una **calculadora** para simular un piso (real o nuevo para captar) con la ocupación mínima para no perder dinero. |
| **Panel** | Habitaciones totales, ocupadas, disponibles, reservadas y que se liberan pronto. Tabla de **próximas habitaciones a desocupar** con los días restantes en colores. Alertas, pagos y gastos del mes, y ocupación por inmueble. |
| **Inmuebles** | Ficha de cada piso: sus habitaciones y su estado, próximas salidas, coste real de los últimos 12 meses, en qué se va el dinero, gastos fijos y mantenimientos. |
| **Contratos** | Activos, que terminan en ≤ 60 días, pendientes de renovación, próximos inicios, renovaciones y finalizados. Cada contrato tiene su ficha con línea de tiempo de la habitación, pagos, botón de renovar y documentos de ejemplo (contrato, normas e inventario) imprimibles. |
| **Habitaciones** | Pestañas: todas, disponibles, ocupadas, próximas a desocuparse y reservadas. Cada habitación tiene su ficha con el contrato, el historial de contratos, los pagos y los mantenimientos. |
| **Pagos** | Recibidos, pendientes, parciales y atrasados. Marcar un recibo como cobrado, o **varios a la vez**: casillas para seleccionarlos y botón «Marcar todos los recibos vencidos como pagados», siempre con ventana de confirmación. Se ve cuántos recibos hay vencidos y cuánto falta por cobrar. Los recibos de cada mes se generan solos. |
| **Gastos y costes** | Coste real por inmueble **mensual, trimestral, semestral o anual**, comparado con el periodo anterior y con el mismo periodo del año anterior, con su evolución y desglose. Coste por categoría (alquiler, luz, agua, gas, internet, limpieza, mantenimiento, reparaciones, impuestos y tasas, seguros, comisiones y otros). Pestaña **«Subir gastos del mes»** para escribir las facturas de todos los pisos en una sola tabla, e **importación desde CSV/Excel**. Suministros, gastos fijos que se apuntan solos y facturas adjuntas. |
| **Mantenimientos** | Registro completo: inmueble, habitación o zona, trabajo, categoría, fecha, coste, proveedor, estado y facturas. Su coste se suma automáticamente a los gastos. Ranking de los pisos y habitaciones que más dan que hacer. |
| **Estadísticas** | Evolución de la ocupación, entradas y salidas, libres por inmueble, próximas desocupaciones, ingresos mensuales e incidencias de pago, y gastos por mes, por categoría y por inmueble. Periodos: este mes, 3 o 6 meses, este año, 12 meses o personalizado. |
| **Configuración** | **Accesos y usuarios**: para cada persona, interruptores de «Acceso» y «Puede modificar» en cada pestaña. La información financiera (ingresos, cobros, gastos, facturas, beneficios) está agrupada y se puede quitar de golpe. Lo que está apagado no aparece en el menú, no se abre escribiendo la dirección y sus cifras no salen en ninguna otra pantalla. Hay plantillas por rol con plantillas por rol (Administrador, Dirección, Gestión y Personal operativo) y una tabla de «quién puede ver qué». El Administrador tiene siempre todo y es el único que puede dar permisos de administración. También: integración con Homming, importación del CSV, ajustes, copias de seguridad y registro de actividad. |

La seguridad está explicada en [`docs/SEGURIDAD.md`](docs/SEGURIDAD.md) y la investigación sobre Homming en [`docs/HOMMING.md`](docs/HOMMING.md).

---

## 1. Probarla en tu ordenador

Necesitas **Node.js 22.13 o superior** ([nodejs.org](https://nodejs.org), versión LTS).

```bash
cd plataforma
npm run demo      # (opcional) carga pisos y datos INVENTADOS para probar
npm start
```

1. En la consola aparece un **enlace para el administrador** (`daniel@alki.casa`). Ábrelo y elige tu contraseña.
2. Entra en <http://localhost:3000> con tu correo y contraseña.
3. Configura la **verificación en dos pasos**. Necesitas una app como Google Authenticator o Microsoft Authenticator.

### La demo realista

`npm run demo` simula ALKI funcionando desde 2022, con **datos 100 % ficticios**:

- **Cartera:** 26 pisos en 19 barrios de Valencia, de 3 a 7 habitaciones (115 en total). Hay habitaciones estándar, grandes, dobles y suites con baño, cada una con su precio según zona y características (350–700 €/mes).
- **Historial:** unos 460 contratos desde 2022 (activos, renovados, rescindidos, finalizados y próximos inicios) y unos 8.500 recibos. Cada inquilino tiene su forma de pagar: hay pagos con retraso, parciales y atrasados.
- **Gastos:**
  - alquiler a la propiedad con subida del IPC cada año;
  - luz y gas según la estación y los ocupantes de cada mes;
  - agua bimestral, limpieza semanal e internet;
  - seguro anual y unos 480 mantenimientos irregulares, con facturas PDF de ejemplo.
- **Situación de hoy:** salidas en menos de 15, 30 y 60 días, renovaciones pendientes, habitaciones en mantenimiento y entradas de la semana. También dos facturas de suministros anómalas, ligadas a una incidencia real del piso.

Todo cuadra entre sí: los números del panel, las fichas, los pagos, los gastos y las estadísticas salen de los mismos datos. La simulación se calcula **a partir de la fecha del día**. Si pasan semanas y quieres que vuelva a verse «al día», regenérala:

```bash
npm run demo -- --forzar
```

Usuarios de prueba, todos con la contraseña `Demo-ALKI-2026!`: `gestion@demo.alki` (Marta Soriano), `operativo@demo.alki` (Javier Peris) y `direccion@demo.alki` (Lucía Andreu). Sirven para ver qué ve cada rol.

Si el enlace caduca: `npm run enlace-admin`.

### Cargar los datos reales de Homming

En Homming exporta el listado de contratos en CSV. Después, en la plataforma, ve a **Administración → Importar datos** y súbelo. Se puede repetir las veces que quieras: no duplica nada.

> Usa una carpeta `data/` nueva, sin la demo: borra `data/` antes de empezar con datos reales.

## 2. Compartirla con el equipo

`localhost` solo funciona en el ordenador donde está arrancada. Para que los 4 del equipo entréis cada uno desde su móvil u ordenador, la plataforma tiene que estar en un servidor con HTTPS: el servidor virtual de ALKI, con los pasos de abajo.

**Prueba rápida en la oficina (misma WiFi, solo para probar):** arranca con `HOST=0.0.0.0 npm start`. Los demás pueden abrir `http://IP-de-tu-ordenador:3000`. No lo uses con datos reales: sin HTTPS las contraseñas viajan sin cifrar.

## 3. Ponerla en el servidor virtual de ALKI (VPS con Ubuntu)

```bash
# 1. Node.js 22 LTS
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs nginx certbot python3-certbot-nginx

# 2. Usuario sin privilegios y carpeta
sudo useradd --system --create-home --home-dir /opt/alki alki
sudo cp -r plataforma/* /opt/alki/ && sudo chown -R alki:alki /opt/alki

# 3. Configuración
sudo -u alki cp /opt/alki/.env.example /opt/alki/.env
sudo -u alki nano /opt/alki/.env      # rellena APP_ORIGIN, APP_SECRET y SMTP
sudo chmod 600 /opt/alki/.env
```

**Servicio** (`/etc/systemd/system/alki.service`): arranca solo y se reinicia si falla.

```ini
[Unit]
Description=ALKI Gestión
After=network.target

[Service]
User=alki
WorkingDirectory=/opt/alki
ExecStart=/usr/bin/node server/index.js
Restart=always
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/opt/alki/data
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now alki
sudo journalctl -u alki -f     # aquí aparece el enlace del administrador
```

**Nginx con HTTPS** (`/etc/nginx/sites-available/alki`). Cambia `gestion.alki.casa` por el subdominio que uséis:

```nginx
server {
  server_name gestion.alki.casa;
  client_max_body_size 12m;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/alki /etc/nginx/sites-enabled/
sudo certbot --nginx -d gestion.alki.casa     # certificado HTTPS gratuito y automático
sudo ufw allow 'Nginx Full' && sudo ufw allow OpenSSH && sudo ufw enable
```

### Copias fuera del servidor (muy importante)

La plataforma hace una copia diaria en `/opt/alki/data/copias/`. Para que sobrevivan si el servidor se estropea, cópialas a otro sitio cada noche, por ejemplo con `rclone` a un almacenamiento externo. Guarda también **`APP_SECRET`** (o `data/secret.key`) en un lugar seguro: sin esa clave no se pueden leer los secretos cifrados.

### Actualizar

Sustituye los archivos, sin tocar `data/` ni `.env`, y ejecuta `sudo systemctl restart alki`.

## 4. Estructura del código

```
plataforma/
├── server/                  ← el servidor (Node.js)
│   ├── index.js             arranque y tareas periódicas
│   ├── http.js              rutas, cabeceras de seguridad, CSRF, archivos
│   ├── config.js            lee .env
│   ├── db.js · esquema.sql  base de datos (todas las tablas comentadas)
│   ├── seguridad/           contraseñas, MFA, sesiones, permisos, límites, validación
│   ├── servicios/           ocupación, costes, cobros, correo, auditoría, copias
│   ├── rutas/               API: auth, panel, inmuebles, contratos, finanzas, mantenimientos, incidencias, rentabilidad, estadísticas, admin
│   ├── integraciones/       Homming (API y CSV) y programador de sincronizaciones
│   └── scripts/             demo, enlace-admin, copia
├── public/                  ← lo que ve el navegador
│   ├── index.html · css/app.css
│   └── js/                  app (rutas y sesión), api, ui, gráficos y vistas/
├── docs/                    seguridad e integración con Homming
├── test/                    pruebas automáticas (npm test)
└── data/                    base de datos, documentos y copias (NO se sube a git)
```

### Cómo crecer

- **Más integraciones** (servidor propio, contabilidad…): crea un archivo en `server/integraciones/`, siguiendo el modelo de `homming.js`, y regístralo en `integraciones/index.js`.
- **PostgreSQL:** si algún día hace falta, el esquema usa SQL estándar y todas las consultas pasan por `db.js`, así que basta con cambiar ese archivo.
- **Tiempo real:** el webhook de Homming ya lanza una sincronización en cuanto hay cambios.
