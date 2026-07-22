-- Fase 5: idempotencia del asistente conversacional de Telegram.

alter table public.conversation_states
  add column if not exists last_update_id bigint;

create index if not exists conversation_states_last_update_idx
  on public.conversation_states(telegram_chat_id, last_update_id);
