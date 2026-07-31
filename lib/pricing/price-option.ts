import type { EventPeriod, EventPriceRule, EventProgram } from "@/types/event";

export type PriceOptionType =
  | "individual_periods"
  | "full_event"
  | "weekly_sessions"
  | "full_sessions"
  | "single_event";

export interface PriceOptionInput {
  option_type: PriceOptionType;
  program_id: string;
  period_ids: string[];
  sessions_per_week?: number | null;
  member_amount: number;
  non_member_amount: number;
  currency: string;
}

interface PeriodReference {
  id: string;
  label: string;
}

const plural = (amount: number, singular: string, pluralValue: string) =>
  amount === 1 ? singular : pluralValue;

export function priceOptionName(input: PriceOptionInput, totalPeriods: number) {
  const sessions = input.sessions_per_week ?? 1;
  if (input.option_type === "individual_periods") return "Semana suelta";
  if (input.option_type === "full_event") return "Campus completo";
  if (input.option_type === "weekly_sessions")
    return `Pack Semana (${sessions} ${plural(sessions, "sesión", "sesiones")})`;
  if (input.option_type === "full_sessions")
    return `Bono Completo (${totalPeriods} semanas · ${sessions} ${plural(sessions, "sesión semanal", "sesiones semanales")})`;
  return "Evento completo";
}

export function buildPriceOptionRules(
  input: PriceOptionInput,
  periods: PeriodReference[],
) {
  const selectedPeriods =
    input.option_type === "individual_periods"
      ? periods.filter((period) => input.period_ids.includes(period.id))
      : [{ id: null, label: priceOptionName(input, periods.length) }];
  const pricingType =
    input.option_type === "full_event" || input.option_type === "full_sessions"
      ? "full_event"
      : input.option_type === "weekly_sessions"
        ? "period_bundle"
        : input.option_type === "individual_periods"
          ? "per_period"
          : "fixed";
  return selectedPeriods.flatMap((period) => {
    const baseLabel =
      input.option_type === "individual_periods"
        ? `Semana suelta · ${period.label}`
        : priceOptionName(input, periods.length);
    return [
      {
        program_id: input.program_id,
        period_id: period.id,
        participant_type: "member" as const,
        pricing_type: pricingType,
        quantity_from: input.option_type === "single_event" ? 1 : null,
        quantity_to: input.option_type === "single_event" ? 1 : null,
        amount: input.member_amount,
        currency: input.currency.toUpperCase(),
        label: `${baseLabel} Club`,
        description: "Creada con el asistente de opciones de inscripción.",
        priority: 500,
        starts_at: null,
        ends_at: null,
        is_active: true,
      },
      {
        program_id: input.program_id,
        period_id: period.id,
        participant_type: "non_member" as const,
        pricing_type: pricingType,
        quantity_from: input.option_type === "single_event" ? 1 : null,
        quantity_to: input.option_type === "single_event" ? 1 : null,
        amount: input.non_member_amount,
        currency: input.currency.toUpperCase(),
        label: `${baseLabel} No Club`,
        description: "Creada con el asistente de opciones de inscripción.",
        priority: 500,
        starts_at: null,
        ends_at: null,
        is_active: true,
      },
    ];
  });
}

const withoutAudience = (label: string | null) =>
  (label ?? "Tarifa").replace(/\s+No Club$/i, "").replace(/\s+Club$/i, "");

export interface PriceOptionSummary {
  key: string;
  programName: string;
  label: string;
  periodLabel: string;
  memberAmount: number | null;
  nonMemberAmount: number | null;
  needsReview: boolean;
}

export function summarizePriceOptions(
  rules: EventPriceRule[],
  programs: EventProgram[],
  periods: EventPeriod[],
) {
  const summaries = new Map<string, PriceOptionSummary>();
  for (const rule of rules.filter((item) => item.is_active)) {
    const label = withoutAudience(rule.label);
    const key = [
      rule.program_id ?? "event",
      rule.period_id ?? "all",
      rule.pricing_type,
      label.toLowerCase(),
    ].join("|");
    const current = summaries.get(key) ?? {
      key,
      programName:
        programs.find((program) => program.id === rule.program_id)?.name ??
        "Todo el evento",
      label,
      periodLabel:
        periods.find((period) => period.id === rule.period_id)?.label ??
        (rule.pricing_type === "full_event"
          ? "Todos los periodos"
          : "Periodo a elegir"),
      memberAmount: null,
      nonMemberAmount: null,
      needsReview: false,
    };
    if (rule.participant_type === "member")
      current.memberAmount = Number(rule.amount);
    else if (rule.participant_type === "non_member")
      current.nonMemberAmount = Number(rule.amount);
    else current.needsReview = true;
    summaries.set(key, current);
  }
  return [...summaries.values()];
}
