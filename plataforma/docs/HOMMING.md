# Integración con Homming — qué sabemos y qué falta

Investigación hecha el 5 de noviembre de 2026.

## Las 5 preguntas del enunciado

| # | Pregunta | Respuesta | Fuente |
|---|---|---|---|
| 1 | ¿Tiene API pública o privada? | **Sí, tiene API.** Aparece como «API para integraciones» en los planes **Starter, Advanced y Enterprise**. No es una API abierta al público: va ligada a tu cuenta. | Página de precios de homming.com |
| 2 | ¿Qué autenticación usa? | **Token de acceso** que se genera en Homming → *Ajustes de la cuenta* → *Conexiones*. Solo se muestra una vez. Lo normal es enviarlo como `Authorization: Bearer <token>`, pero **hay que confirmarlo**. | Centro de ayuda: «Genera un token de acceso a la API» |
| 3 | ¿Qué información se puede consultar? | **No está publicado.** Homming anuncia que su API sirve para conectar portales, contabilidad y ERP. Lo lógico es que cubra inmuebles, unidades, inquilinos, contratos y cobros, pero **hay que pedir la lista de endpoints**. | — |
| 4 | Límites de uso | **No publicados.** El conector ya respeta la respuesta `429` y la cabecera `Retry-After`, y espera más entre intentos si algo falla. | — |
| 5 | ¿Documentación oficial o programa de partners? | Hay una sección de **Integraciones** en el centro de ayuda (Mobilia, Inmovilla, Zenova) y **webhooks** para recibir avisos. También tiene acuerdos con Qlip, Finaer, TUIO y TaxDown. La documentación técnica de la API no es pública. | help.homming.com → Integraciones |

> Desde el servidor de desarrollo no se pudo abrir help.homming.com (estaba bloqueado por la red), así que los datos salen de los resultados de búsqueda. Conviene comprobarlos entrando con la cuenta de ALKI.

## Qué hay que pedir a Homming (correo a soporte o a tu gestor de cuenta)

1. La documentación de la API: URL base, endpoints, formato JSON y paginación.
2. Confirmar si el plan actual de ALKI incluye la API.
3. Los límites de uso (peticiones por minuto o por día).
4. Si se puede obtener **pagos/cobros** y **unidades/habitaciones** por la API.
5. Cómo funcionan los **webhooks**: qué eventos envían y si firman las peticiones.
6. Si existe un entorno de pruebas (sandbox).

## Cómo está preparada la plataforma

- **Ya funciona sin API:** en *Administración → Importar* se sube el CSV de contratos que exporta Homming. Se probó con el export real de ALKI y salieron 25 inmuebles, 96 habitaciones y 484 contratos.
- **Conector configurable** (`server/integraciones/homming.js`): la URL base, las rutas y la cabecera se cambian desde *Administración → Integraciones*. Cuando haya documentación, solo hay que ajustar el objeto `MAPEO`, que dice cómo se llama cada campo en Homming.
- **Seguridad:**
  - El token se guarda cifrado (AES-256-GCM) y no vuelve nunca al navegador.
  - Solo se admite `https://`.
  - Hay un tiempo límite de 20 s por petición y reintentos con espera.
- **Resiliencia:**
  - Primero se descarga todo y luego se guarda en una sola transacción. Si Homming falla a mitad, no se cambia nada.
  - Tras varios fallos seguidos, espera cada vez más entre intentos (×2, ×4, ×8, ×16).
  - Avisa en el panel cuando la sincronización falla.
  - La plataforma sigue funcionando con los últimos datos guardados.
- **Webhook:** `POST /api/integraciones/homming/webhook?clave=…`. La URL se genera en la plataforma. Cuando Homming avisa de un cambio, se lanza una sincronización.
- **Sin duplicados:** cada registro guarda su `external_id` de Homming.
