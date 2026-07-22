import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export const STRIPE_CHECKOUT_MINUTES = 30;
export const CAPACITY_HOLD_MINUTES = 35;

export class CapacityError extends Error {
  constructor(
    public code: "CAPACITY_FULL" | "CAPACITY_UNAVAILABLE" | "CAPACITY_ERROR",
    message: string,
  ) {
    super(message);
    this.name = "CapacityError";
  }
}

function capacityError(error: { message: string }) {
  if (error.message.includes("CAPACITY_FULL"))
    return new CapacityError(
      "CAPACITY_FULL",
      "Una de las semanas seleccionadas está completa.",
    );
  if (
    error.message.includes("CAPACITY_UNAVAILABLE") ||
    error.message.includes("CAPACITY_INVALID_SELECTION")
  )
    return new CapacityError(
      "CAPACITY_UNAVAILABLE",
      "Una semana seleccionada ya no está disponible.",
    );
  return new CapacityError("CAPACITY_ERROR", "No se pudo reservar la plaza.");
}

export async function reserveCapacity(
  admin: SupabaseClient,
  input: {
    eventId: string;
    programId: string;
    periodIds: string[];
    registrationId: string;
    holdMinutes?: number;
  },
) {
  const { data, error } = await admin.rpc("reserve_event_capacity", {
    target_event_id: input.eventId,
    target_program_id: input.programId,
    target_period_ids: input.periodIds,
    target_registration_id: input.registrationId,
    hold_minutes: input.holdMinutes ?? CAPACITY_HOLD_MINUTES,
  });
  if (error) throw capacityError(error);
  return data as Array<{ id: string; expires_at: string }>;
}

export async function confirmCapacity(
  admin: SupabaseClient,
  registrationId: string,
) {
  const { error } = await admin.rpc("confirm_capacity_reservations", {
    target_registration_id: registrationId,
  });
  if (error) throw capacityError(error);
}

export async function cancelCapacity(
  admin: SupabaseClient,
  registrationId: string,
) {
  const { error } = await admin.rpc("cancel_capacity_reservations", {
    target_registration_id: registrationId,
  });
  if (error) throw capacityError(error);
}

export async function attachStripeSession(
  admin: SupabaseClient,
  registrationId: string,
  sessionId: string,
) {
  const { error } = await admin
    .from("capacity_reservations")
    .update({ stripe_session_id: sessionId })
    .eq("registration_id", registrationId)
    .eq("status", "reserved");
  if (error) throw capacityError(error);
}
