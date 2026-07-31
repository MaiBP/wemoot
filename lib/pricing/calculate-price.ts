import { getSelectablePriceScope } from "./package-options.ts";

export interface PriceRuleInput {
  id: string;
  program_id: string | null;
  period_id: string | null;
  participant_type: string;
  pricing_type:
    | "fixed"
    | "per_period"
    | "period_bundle"
    | "full_event"
    | "early_bird"
    | "manual";
  quantity_from: number | null;
  quantity_to: number | null;
  amount: number | string;
  label?: string | null;
  currency: string;
  priority: number;
  starts_at: string | null;
  ends_at: string | null;
  legacy_price_id?: string | null;
  is_active: boolean;
}

export interface DiscountInput {
  id: string;
  program_id: string | null;
  code: string | null;
  name: string;
  discount_type:
    "percentage" | "fixed_amount" | "full_event" | "bundle" | "manual";
  discount_value: number | string;
  min_periods: number | null;
  starts_at: string | null;
  ends_at: string | null;
  usage_limit: number | null;
  usage_count: number;
  priority: number;
  is_combinable: boolean;
  is_active: boolean;
}

export interface CalculateConfiguredPriceInput {
  programId: string;
  periodIds: string[];
  participantType: string;
  discountCode?: string;
  legacyPriceId?: string;
  selectedRuleId?: string;
  totalAvailablePeriods: number;
  rules: PriceRuleInput[];
  discounts: DiscountInput[];
  now?: Date;
}

export interface PriceCalculationResult {
  /** Importes expresados en céntimos. */
  baseAmount: number;
  discounts: Array<{ id: string; name: string; amount: number }>;
  extras: Array<{ id: string; name: string; amount: number }>;
  finalAmount: number;
  currency: string;
  appliedRuleIds: string[];
}

export class PricingError extends Error {
  readonly code: "NO_PERIODS" | "NO_MATCHING_RULE" | "INVALID_DISCOUNT";

  constructor(
    code: "NO_PERIODS" | "NO_MATCHING_RULE" | "INVALID_DISCOUNT",
    message: string,
  ) {
    super(message);
    this.name = "PricingError";
    this.code = code;
  }
}

function decimalToScaledInteger(value: number | string, decimals: number) {
  const normalized = String(value).trim().replace(",", ".");
  const match = normalized.match(/^(\d+)(?:\.(\d+))?$/);
  if (!match) throw new Error(`Importe monetario no válido: ${normalized}`);
  const factor = 10 ** decimals;
  const fraction = (match[2] ?? "").padEnd(decimals + 1, "0");
  const truncated = Number(fraction.slice(0, decimals) || "0");
  const rounded = Number(fraction[decimals] ?? "0") >= 5 ? 1 : 0;
  return Number(match[1]) * factor + truncated + rounded;
}

export function eurosToCents(value: number | string) {
  return decimalToScaledInteger(value, 2);
}

function isWithinWindow(
  startsAt: string | null,
  endsAt: string | null,
  now: Date,
) {
  const timestamp = now.getTime();
  return (
    (startsAt == null || Date.parse(startsAt) <= timestamp) &&
    (endsAt == null || Date.parse(endsAt) >= timestamp)
  );
}

function ruleMatches(
  rule: PriceRuleInput,
  input: CalculateConfiguredPriceInput,
  quantity: number,
  now: Date,
) {
  if (!rule.is_active || rule.pricing_type === "manual") return false;
  if (input.selectedRuleId != null && rule.id !== input.selectedRuleId)
    return false;
  if (rule.program_id != null && rule.program_id !== input.programId)
    return false;
  if (
    rule.participant_type !== "general" &&
    rule.participant_type !== input.participantType
  )
    return false;
  const selectedScope =
    input.selectedRuleId === rule.id ? getSelectablePriceScope(rule) : null;
  if (
    selectedScope == null &&
    rule.quantity_from != null &&
    quantity < rule.quantity_from
  )
    return false;
  if (
    selectedScope == null &&
    rule.quantity_to != null &&
    quantity > rule.quantity_to
  )
    return false;
  if (rule.period_id != null && !input.periodIds.includes(rule.period_id))
    return false;
  if (rule.period_id != null && quantity !== 1) return false;
  if (
    selectedScope === "full_event" &&
    (input.totalAvailablePeriods === 0 ||
      quantity !== input.totalAvailablePeriods)
  )
    return false;
  if (
    selectedScope == null &&
    rule.pricing_type === "full_event" &&
    (input.totalAvailablePeriods === 0 ||
      quantity !== input.totalAvailablePeriods)
  )
    return false;
  if (!isWithinWindow(rule.starts_at, rule.ends_at, now)) return false;
  if (
    input.legacyPriceId != null &&
    rule.legacy_price_id !== input.legacyPriceId
  )
    return false;
  return true;
}

function ruleSpecificity(
  rule: PriceRuleInput,
  input: CalculateConfiguredPriceInput,
) {
  return (
    (rule.program_id === input.programId ? 4 : 0) +
    (rule.participant_type === input.participantType ? 2 : 0) +
    (rule.period_id != null ? 1 : 0)
  );
}

function discountMatches(
  discount: DiscountInput,
  input: CalculateConfiguredPriceInput,
  quantity: number,
  now: Date,
) {
  if (!discount.is_active || discount.discount_type === "manual") return false;
  if (discount.program_id != null && discount.program_id !== input.programId)
    return false;
  if (discount.min_periods != null && quantity < discount.min_periods)
    return false;
  if (
    discount.usage_limit != null &&
    discount.usage_count >= discount.usage_limit
  )
    return false;
  if (!isWithinWindow(discount.starts_at, discount.ends_at, now)) return false;
  if (
    discount.discount_type === "full_event" &&
    (input.totalAvailablePeriods === 0 ||
      quantity !== input.totalAvailablePeriods)
  )
    return false;
  const requestedCode = input.discountCode?.trim().toLowerCase();
  return discount.code == null || discount.code.toLowerCase() === requestedCode;
}

function calculateDiscountAmount(discount: DiscountInput, remaining: number) {
  if (discount.discount_type === "percentage") {
    const basisPoints = decimalToScaledInteger(discount.discount_value, 2);
    return Math.min(remaining, Math.round((remaining * basisPoints) / 10_000));
  }
  return Math.min(remaining, eurosToCents(discount.discount_value));
}

export function calculateConfiguredPrice(
  input: CalculateConfiguredPriceInput,
): PriceCalculationResult {
  const periodIds = [...new Set(input.periodIds)];
  if (!periodIds.length) {
    throw new PricingError(
      "NO_PERIODS",
      "Selecciona al menos un periodo para calcular el precio.",
    );
  }
  const quantity = periodIds.length;
  const now = input.now ?? new Date();
  const periodRules =
    input.selectedRuleId == null
      ? periodIds.flatMap((periodId) => {
          const periodRule = input.rules
            .filter(
              (item) =>
                item.period_id === periodId &&
                ruleMatches(
                  item,
                  {
                    ...input,
                    selectedRuleId: undefined,
                    periodIds: [periodId],
                  },
                  1,
                  now,
                ),
            )
            .sort(
              (a, b) =>
                b.priority - a.priority ||
                ruleSpecificity(b, input) - ruleSpecificity(a, input),
            )[0];
          return periodRule ? [periodRule] : [];
        })
      : [];
  const hasCompletePeriodPricing =
    periodRules.length === periodIds.length &&
    new Set(periodRules.map((periodRule) => periodRule.period_id)).size ===
      periodIds.length;
  const aggregatedPeriodRule: PriceRuleInput | null =
    hasCompletePeriodPricing && periodRules[0]
      ? {
          ...periodRules[0],
          id: periodRules.map((periodRule) => periodRule.id).join(","),
          period_id: null,
          pricing_type: "fixed",
          amount:
            periodRules.reduce(
              (total, periodRule) => total + eurosToCents(periodRule.amount),
              0,
            ) / 100,
          priority: Math.max(
            ...periodRules.map((periodRule) => periodRule.priority),
          ),
        }
      : null;
  const candidateRules = aggregatedPeriodRule
    ? [aggregatedPeriodRule]
    : input.rules;
  const rule = candidateRules
    .filter((item) => ruleMatches(item, { ...input, periodIds }, quantity, now))
    .sort(
      (a, b) =>
        b.priority - a.priority ||
        ruleSpecificity(b, input) - ruleSpecificity(a, input),
    )[0];
  if (!rule) {
    throw new PricingError(
      "NO_MATCHING_RULE",
      "No existe una regla de precio para esta selección.",
    );
  }

  const unitAmount = eurosToCents(rule.amount);
  const selectedScope =
    input.selectedRuleId === rule.id ? getSelectablePriceScope(rule) : null;
  const baseAmount =
    rule.pricing_type === "per_period" || selectedScope === "per_week"
      ? unitAmount * quantity
      : unitAmount;
  const matchingDiscounts = input.discounts
    .filter((item) => discountMatches(item, input, quantity, now))
    .sort((a, b) => b.priority - a.priority);
  if (
    input.discountCode &&
    !matchingDiscounts.some(
      (item) =>
        item.code?.toLowerCase() === input.discountCode?.trim().toLowerCase(),
    )
  ) {
    throw new PricingError(
      "INVALID_DISCOUNT",
      "El código de descuento no es válido o ha caducado.",
    );
  }

  const candidates = matchingDiscounts[0]?.is_combinable
    ? matchingDiscounts.filter((item) => item.is_combinable)
    : matchingDiscounts.slice(0, 1);
  let finalAmount = baseAmount;
  const appliedDiscounts = candidates.flatMap((discount) => {
    const amount = calculateDiscountAmount(discount, finalAmount);
    if (amount <= 0) return [];
    finalAmount -= amount;
    return [{ id: discount.id, name: discount.name, amount }];
  });

  return {
    baseAmount,
    discounts: appliedDiscounts,
    extras: [],
    finalAmount,
    currency: rule.currency.toUpperCase(),
    appliedRuleIds: hasCompletePeriodPricing
      ? periodRules.map((periodRule) => periodRule.id)
      : [rule.id],
  };
}
