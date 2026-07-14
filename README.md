# WeMoot MVP

Asistente conversacional para crear y gestionar eventos de fútbol. Incluye dashboard privado, creación manual, bot de Telegram, parser con OpenAI, inscritos, pagos manuales, copy social, CSV y preparación de certificados.

## Puesta en marcha

1. Crea un proyecto en Supabase y ejecuta `supabase/migrations/001_initial_schema.sql` en el SQL Editor.
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

- No existen páginas públicas de eventos.
- Los pagos son manuales; la tabla `payments` permite integrar Stripe después.
- “Preparar certificados” crea registros pendientes. La generación PDF queda desacoplada para una siguiente iteración.
- Sin `OPENAI_API_KEY`, la creación web sigue funcionando con copy básico; el parser conversacional necesita OpenAI para extraer todos los datos.
