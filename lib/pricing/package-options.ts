import type { EventPriceRule } from "@/types/event";

export type SelectablePriceScope = "per_week" | "full_event";

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

export function getSelectablePriceScope(
  rule: {
    label?: string | null;
    pricing_type: EventPriceRule["pricing_type"];
  },
): SelectablePriceScope | null {
  const label = normalize(rule.label ?? "");
  const sessionPackage = /\bsesion(?:es)?\b/.test(label);
  if (sessionPackage && /\bpack\s+semana\b/.test(label)) return "per_week";
  if (sessionPackage && /\bbono\s+completo\b/.test(label))
    return "full_event";
  return rule.pricing_type === "full_event" ? "full_event" : null;
}

export function getSelectablePriceRules(
  rules: EventPriceRule[],
  programId: string,
  participantType: string,
) {
  const applicable = rules.filter(
    (rule) =>
      rule.is_active &&
      (rule.program_id == null || rule.program_id === programId) &&
      (rule.participant_type === "general" ||
        rule.participant_type === participantType) &&
      getSelectablePriceScope(rule) != null,
  );
  const specific = applicable.filter(
    (rule) => rule.participant_type === participantType,
  );
  return (specific.length ? specific : applicable).sort(
    (left, right) => right.priority - left.priority,
  );
}

export function hasIndividualPriceRules(
  rules: EventPriceRule[],
  programId: string,
  participantType: string,
) {
  return rules.some(
    (rule) =>
      rule.is_active &&
      (rule.program_id == null || rule.program_id === programId) &&
      (rule.participant_type === "general" ||
        rule.participant_type === participantType) &&
      rule.pricing_type !== "manual" &&
      getSelectablePriceScope(rule) == null,
  );
}
