import { createAdminClient } from "@/lib/supabase/admin";
import {
  calculateConfiguredPrice,
  PricingError,
  type PriceCalculationResult,
} from "@/lib/pricing/calculate-price";

export interface CalculatePriceInput {
  eventId: string;
  programId: string;
  periodIds: string[];
  participantType: string;
  discountCode?: string;
  selectedExtras?: string[];
  /** Enlace temporal con event_prices mientras el formulario antiguo siga activo. */
  legacyPriceId?: string;
}

export async function calculateRegistrationPrice(
  input: CalculatePriceInput,
  admin = createAdminClient(),
): Promise<PriceCalculationResult> {
  const periodIds = [...new Set(input.periodIds)];
  if (!periodIds.length) {
    throw new PricingError(
      "NO_PERIODS",
      "Selecciona al menos un periodo para calcular el precio.",
    );
  }

  const { data: program } = await admin
    .from("event_programs")
    .select("id")
    .eq("id", input.programId)
    .eq("event_id", input.eventId)
    .eq("active", true)
    .maybeSingle();
  if (!program) {
    throw new PricingError(
      "NO_MATCHING_RULE",
      "La modalidad seleccionada ya no está disponible.",
    );
  }

  const [selectedRelations, availableRelations, rulesResult, discountsResult] =
    await Promise.all([
      admin
        .from("event_program_periods")
        .select("period_id")
        .eq("program_id", input.programId)
        .eq("is_available", true)
        .in("period_id", periodIds),
      admin
        .from("event_program_periods")
        .select("period_id", { count: "exact", head: true })
        .eq("program_id", input.programId)
        .eq("is_available", true),
      admin
        .from("event_price_rules")
        .select("*")
        .eq("event_id", input.eventId)
        .eq("is_active", true)
        .or(`program_id.is.null,program_id.eq.${input.programId}`),
      admin
        .from("event_discounts")
        .select("*")
        .eq("event_id", input.eventId)
        .eq("is_active", true)
        .or(`program_id.is.null,program_id.eq.${input.programId}`),
    ]);

  const queryError =
    selectedRelations.error ||
    availableRelations.error ||
    rulesResult.error ||
    discountsResult.error;
  if (queryError) throw queryError;
  if ((selectedRelations.data ?? []).length !== periodIds.length) {
    throw new PricingError(
      "NO_PERIODS",
      "Una de las semanas seleccionadas ya no está disponible.",
    );
  }

  return calculateConfiguredPrice({
    programId: input.programId,
    periodIds,
    participantType: input.participantType,
    discountCode: input.discountCode,
    legacyPriceId: input.legacyPriceId,
    totalAvailablePeriods: availableRelations.count ?? 0,
    rules: rulesResult.data ?? [],
    discounts: discountsResult.data ?? [],
  });
}
