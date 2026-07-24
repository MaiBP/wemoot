import type { EventPeriod, EventPriceRule } from "@/types/event";

export function inferRulePeriodIds(
  rules: EventPriceRule[],
  periods: EventPeriod[],
) {
  const inferred = new Map<string, string>();
  if (!periods.length) return inferred;

  const orderedPeriods = [...periods].sort(
    (left, right) => left.position - right.position,
  );
  const groups = new Map<string, EventPriceRule[]>();
  for (const rule of rules) {
    if (rule.pricing_type !== "per_period" || rule.period_id) continue;
    const key = `${rule.program_id ?? "event"}|${rule.participant_type}`;
    groups.set(key, [...(groups.get(key) ?? []), rule]);
  }

  for (const group of groups.values()) {
    if (group.length !== orderedPeriods.length) continue;
    group.forEach((rule, index) => {
      inferred.set(rule.id, orderedPeriods[index].id);
    });
  }
  return inferred;
}
