# WeMoot MVP

Asistente conversacional para crear y gestionar eventos de fútbol. Incluye dashboard privado, creación manual, bot de Telegram, inscripción pública, pagos en efectivo o con Stripe Checkout, copy social, CSV y preparación de certificados.

## Puesta en marcha

1. Crea un proyecto en Supabase y ejecuta, en orden, los archivos de `supabase/migrations/` desde el SQL Editor.
2. Copia `.env.example` a `.env.local` y completa las variables. Usa la nueva
   publishable key (`sb_publishable_...`) en el cliente y la secret key
   (`sb_secret_...`) exclusivamente en el servidor.
3. Ejecuta `npm run dev` y abre `http://localhost:3000`.
4. Registra una cuenta desde `/login`.

## Configurar Telegram

1. Crea un bot con BotFather y guarda el token en `TELEGRAM_BOT_TOKEN`.
2. Define un valor aleatorio largo en `TELEGRAM_WEBHOOK_SECRET`.
3. Con la app desplegada en HTTPS, registra el webhook:

```bash
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://TU-DOMINIO/api/telegram/webhook","secret_token":"TU_SECRETO"}'
```

El usuario debe crear primero su cuenta web. Al escribir `/start`, el bot solicitará el email para vincular de forma segura el chat con ese perfil.

### Campus avanzados desde Telegram

WeMoot conserva dos recorridos:

- **Modo rápido:** un evento con un horario, precio y capacidad globales. Puede publicarse directamente desde Telegram.
- **Modo avanzado:** campus con modalidades, semanas y tarifas diferentes. Telegram genera un borrador y obliga a revisar las tablas en el dashboard antes de publicarlo.

Para importar un cartel, envíalo como foto o como archivo de imagen al bot, acompañado opcionalmente de una descripción. El bot acumula la información de varias imágenes, señala contradicciones y extrae modalidades, periodos y tarifas. La imagen se procesa temporalmente y no se almacena en Supabase.

Antes de utilizar este modo en producción, ejecuta `supabase/migrations/002_advanced_events.sql`. El dashboard permite completar o corregir:

- modalidades, turnos, edades, plazas y momento del pago;
- semanas o periodos;
- tarifas para socios, no socios o todos los participantes.

Los importes, la disponibilidad y las condiciones de pago se validan en el backend. La IA sólo prepara el borrador.

### Fase 1 del modelo de eventos complejos

Ejecuta también `supabase/migrations/003_complex_event_phase1.sql` después de la migración 002. Esta fase incorpora el contrato `simple/complex`, metadatos ampliados de modalidades y periodos, y la tabla `event_program_periods` para definir aforo y disponibilidad por cada combinación. El dashboard permite administrar esa matriz y la inscripción pública la valida en el servidor.

La migración conserva y sincroniza los nombres utilizados por el MVP anterior (`event_mode`, `turn`, `active`, `position`), por lo que los eventos y el flujo de Telegram existentes siguen siendo compatibles. El motor de reglas de precios, descuentos, formulario configurable y reservas temporales de Stripe pertenecen a fases posteriores y no forman parte de esta entrega.

## Configurar Stripe

1. Añade `STRIPE_SECRET_KEY` con la clave secreta de Stripe. Para probar usa una clave `sk_test_...`.
2. Crea en Stripe un webhook con la URL `https://TU-DOMINIO/api/stripe/webhook` y escucha estos eventos:
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `checkout.session.expired`
3. Copia el secreto de firma `whsec_...` en `STRIPE_WEBHOOK_SECRET`.
4. Añade ambas variables en Vercel y vuelve a desplegar.

La opción tarjeta redirige al Checkout alojado por Stripe, por lo que no se necesita `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`. En efectivo, la plaza queda reservada y el pago permanece pendiente para que el organizador lo confirme desde el dashboard.

## Claves de Supabase

- `NEXT_PUBLIC_SUPABASE_URL`: URL pública del proyecto.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: clave pública usada por Auth y por las operaciones protegidas con RLS.
- `SUPABASE_SECRET_KEY`: clave privada, utilizada únicamente por el webhook de Telegram para sus operaciones administrativas. Nunca debe llevar el prefijo `NEXT_PUBLIC_`.

No se necesita `SUPABASE_JWKS_URL` en esta aplicación. El SDK de Supabase
valida y renueva las sesiones mediante `auth.getUser()`. La URL JWKS solo sería
necesaria si en el futuro verificamos los JWT localmente con una librería como
`jose`; se deriva como
`<NEXT_PUBLIC_SUPABASE_URL>/auth/v1/.well-known/jwks.json`.

## Decisiones del MVP

- Cada evento publicado dispone de `/events/<slug>/register` como enlace público de inscripción.
- Los pagos con tarjeta se confirman mediante un webhook firmado de Stripe; nunca desde el navegador.
- “Preparar certificados” crea registros pendientes. La generación PDF queda desacoplada para una siguiente iteración.
- Sin `OPENAI_API_KEY`, la creación web sigue funcionando con copy básico; el parser conversacional necesita OpenAI para extraer todos los datos.
