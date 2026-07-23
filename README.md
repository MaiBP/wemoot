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

La migración conserva y sincroniza los nombres utilizados por el MVP anterior (`event_mode`, `turn`, `active`, `position`), por lo que los eventos y el flujo de Telegram existentes siguen siendo compatibles.

### Fase 2: precios deterministas

Después de la migración 003, ejecuta `supabase/migrations/004_pricing_engine_phase2.sql`. Esta migración crea reglas de precio, descuentos, snapshots de cálculo y el control de usos de cada promoción. Las tarifas anteriores se migran y continúan sincronizadas para no romper el formulario público ni Telegram.

El servicio `lib/pricing/calculate-registration-price.ts` recalcula siempre en el servidor. Los importes se convierten a céntimos antes de operar, se selecciona una regla por prioridad y se validan códigos, vigencia, límites y compatibilidad de descuentos. El navegador no decide el importe enviado a Stripe. Ejecuta `npm test` para comprobar los casos mínimos del motor.

### Fase 3: formularios configurables

Ejecuta `supabase/migrations/005_registration_forms_phase3.sql` después de la migración 004. Desde cada evento complejo se puede abrir `/dashboard/events/<id>/registration-form`, aplicar la plantilla “Campus de fútbol completo”, añadir secciones y campos, cambiar su orden, activar requisitos, previsualizar y publicar el formulario.

Cuando existe un formulario publicado, el enlace público utiliza un recorrido multipaso con borrador local, lógica condicional, varias semanas, precio server-side, respuestas dinámicas y snapshot de consentimientos provisionales. Los eventos simples y los complejos sin formulario publicado conservan temporalmente el formulario anterior.

### Fase 4: Stripe y reserva de plazas

Ejecuta `supabase/migrations/006_capacity_reservations_phase4.sql` después de la migración 005. La selección de cada modalidad y periodo se reserva mediante una función transaccional de PostgreSQL, evitando que dos pagos ocupen simultáneamente la última plaza. Las inscripciones existentes se migran como plazas confirmadas.

Stripe Checkout caduca a los 30 minutos, que es el mínimo admitido por Stripe. WeMoot mantiene la reserva interna durante 35 minutos para dar margen a la entrega del webhook. Un pago firmado confirma la plaza; cancelar o expirar Checkout la libera. Los flujos gratuito, efectivo y pago diferido confirman la capacidad sin pasar por Stripe.

### Fase 5: asistente de campus en Telegram

Ejecuta `supabase/migrations/007_telegram_complex_flow_phase5.sql` después de la migración 006. Esta migración registra el último `update_id` procesado para que los reintentos de Telegram no dupliquen pasos ni estructuras.

Al detectar un evento complejo, el bot abre un menú para crear programas, generar o introducir semanas, interpretar precios, importar más información y elegir el formulario. Las tarifas interpretadas por OpenAI siempre se presentan para confirmación; sólo después se convierten en reglas deterministas. Las plantillas disponibles son Campus completo, Formulario básico y Formulario personalizado. El resultado se guarda como borrador y se publica desde el dashboard después de revisar su configuración.

### Fase 6: privacidad, equipos y comunicaciones

Ejecuta `supabase/migrations/008_privacy_permissions_phase6.sql` después de la migración 007. La migración crea un equipo predeterminado para cada propietario, incorpora los roles propietario, administrador, gestor de inscripciones, entrenador, personal médico y visor, y aplica permisos RLS según la responsabilidad.

Las respuestas médicas se almacenan separadas de los datos generales. Sólo propietarios, administradores y personal médico pueden exportarlas; cada exportación queda auditada. El dashboard permite gestionar el equipo, filtrar inscripciones y descargar CSV generados en el servidor. Los emails de inscripción y pago usan una cola idempotente y nunca incluyen información médica.

Para activar los emails transaccionales configura `RESEND_API_KEY` y `EMAIL_FROM` en Vercel. `EMAIL_FROM` debe utilizar un dominio validado en Resend, por ejemplo `WeMoot <notificaciones@wemoot.com>`. Si no se configuran todavía, la inscripción y el pago continúan funcionando y el envío queda en cola.

### Onboarding unificado

Ejecuta `supabase/migrations/009_unified_onboarding.sql` después de la migración 008. Añade el tipo de perfil, progreso de onboarding, datos profesionales, información ampliada de organizaciones, ubicaciones reutilizables y la relación opcional entre una ubicación y un evento.

La ruta `/onboarding` guarda cada paso en Supabase y permite completarlo o editarlo posteriormente. Telegram inicia el mismo flujo con `/start` cuando la cuenta está vinculada pero el perfil sigue incompleto. El teléfono y la ubicación son opcionales y pueden compartirse directamente desde Telegram.

Al crear eventos desde la web o Telegram se reutilizan como sugerencias la organización, el contacto, la ciudad y la instalación predeterminada. El evento conserva además el nombre y la dirección como snapshot para que los cambios futuros del perfil no alteren eventos históricos.

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
- `RESEND_API_KEY`: clave privada para enviar confirmaciones de inscripción y pago.
- `EMAIL_FROM`: remitente validado, incluyendo opcionalmente el nombre visible.

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
