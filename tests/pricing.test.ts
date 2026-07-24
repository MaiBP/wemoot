import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateConfiguredPrice,
  PricingError,
  type DiscountInput,
  type PriceRuleInput,
} from "../lib/pricing/calculate-price.ts";
import { inferRulePeriodIds } from "../lib/pricing/infer-rule-periods.ts";
import {
  getSelectablePriceRules,
  getSelectablePriceScope,
} from "../lib/pricing/package-options.ts";
import type { EventPeriod, EventPriceRule } from "../types/event.ts";

const rules: PriceRuleInput[] = [
  rule("member-1", "member", "period_bundle", 1, 1, "70.00", 10),
  rule("non-member-1", "non_member", "period_bundle", 1, 1, "80.00", 10),
  rule("member-2", "member", "period_bundle", 2, 2, "130.00", 20),
  rule("non-member-2", "non_member", "period_bundle", 2, 2, "150.00", 20),
  rule("member-full", "member", "full_event", 6, 6, "350.00", 30),
  rule("non-member-full", "non_member", "full_event", 6, 6, "400.00", 30),
];

function rule(
  id: string,
  participantType: string,
  pricingType: PriceRuleInput["pricing_type"],
  from: number,
  to: number,
  amount: string,
  priority: number,
): PriceRuleInput {
  return {
    id,
    program_id: "program-1",
    period_id: null,
    participant_type: participantType,
    pricing_type: pricingType,
    quantity_from: from,
    quantity_to: to,
    amount,
    currency: "EUR",
    priority,
    starts_at: null,
    ends_at: null,
    legacy_price_id: null,
    is_active: true,
  };
}

test("infiere semanas sólo cuando reglas y periodos coinciden exactamente", () => {
  const periods = [1, 2, 3].map(
    (position): EventPeriod => ({
      id: `period-${position}`,
      event_id: "event-1",
      label: `Semana ${position}`,
      start_date: `2026-07-${String(position * 7).padStart(2, "0")}`,
      end_date: `2026-07-${String(position * 7 + 4).padStart(2, "0")}`,
      active: true,
      position: position - 1,
    }),
  );
  const priceRules = ["club-1", "club-2", "club-3"].map(
    (id, index): EventPriceRule => ({
      id,
      event_id: "event-1",
      program_id: "program-1",
      period_id: null,
      participant_type: "member",
      pricing_type: "per_period",
      quantity_from: 1,
      quantity_to: 1,
      amount: 60 + index * 10,
      currency: "EUR",
      label: "Precio Club",
      description: null,
      priority: 100 - index,
      starts_at: null,
      ends_at: null,
      legacy_price_id: null,
      is_active: true,
      created_at: `2026-01-0${index + 1}T00:00:00Z`,
      updated_at: `2026-01-0${index + 1}T00:00:00Z`,
    }),
  );
  const inferred = inferRulePeriodIds(priceRules, periods);
  assert.equal(inferred.get("club-1"), "period-1");
  assert.equal(inferred.get("club-2"), "period-2");
  assert.equal(inferred.get("club-3"), "period-3");

  const incomplete = inferRulePeriodIds(priceRules.slice(0, 2), periods);
  assert.equal(incomplete.size, 0);
});

test("un pack semanal por sesiones se aplica a las semanas elegidas", () => {
  const pack = {
    ...rule(
      "pack-2-sesiones",
      "non_member",
      "period_bundle",
      2,
      2,
      "40.00",
      100,
    ),
    label: "Pack Semana (2 sesiones)",
  };
  const result = calculateConfiguredPrice({
    programId: "program-1",
    participantType: "non_member",
    periodIds: ["week-1", "week-2"],
    totalAvailablePeriods: 6,
    rules: [pack],
    discounts: [],
    selectedRuleId: pack.id,
  });
  assert.equal(getSelectablePriceScope(pack), "per_week");
  assert.equal(result.finalAmount, 8_000);
});

test("un bono completo por sesiones exige todos los periodos", () => {
  const full = {
    ...rule(
      "bono-completo-2",
      "non_member",
      "period_bundle",
      12,
      12,
      "190.00",
      100,
    ),
    label: "Bono Completo (6 semanas 2 sesiones semanales)",
  };
  const result = calculateConfiguredPrice({
    programId: "program-1",
    participantType: "non_member",
    periodIds: ["1", "2", "3", "4", "5", "6"],
    totalAvailablePeriods: 6,
    rules: [full],
    discounts: [],
    selectedRuleId: full.id,
  });
  assert.equal(getSelectablePriceScope(full), "full_event");
  assert.equal(result.finalAmount, 19_000);
});

test("sólo muestra los packs del tipo de participante elegido", () => {
  const priceRules = [
    {
      ...rule("club", "member", "full_event", 6, 6, "350.00", 100),
      event_id: "event-1",
      label: "Campus completo Club",
      description: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
    {
      ...rule("no-club", "non_member", "full_event", 6, 6, "400.00", 100),
      event_id: "event-1",
      label: "Campus completo No Club",
      description: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
  ] as EventPriceRule[];
  assert.deepEqual(
    getSelectablePriceRules(priceRules, "program-1", "member").map(
      (item) => item.id,
    ),
    ["club"],
  );
});

function discount(overrides: Partial<DiscountInput> = {}): DiscountInput {
  return {
    id: "discount-1",
    program_id: null,
    code: "VERANO10",
    name: "Promoción verano",
    discount_type: "percentage",
    discount_value: "10.00",
    min_periods: 1,
    starts_at: "2026-01-01T00:00:00.000Z",
    ends_at: "2026-12-31T23:59:59.000Z",
    usage_limit: null,
    usage_count: 0,
    priority: 10,
    is_combinable: false,
    is_active: true,
    ...overrides,
  };
}

function calculate(
  participantType: string,
  periodIds: string[],
  discounts: DiscountInput[] = [],
  discountCode?: string,
) {
  return calculateConfiguredPrice({
    programId: "program-1",
    participantType,
    periodIds,
    totalAvailablePeriods: 6,
    rules,
    discounts,
    discountCode,
    now: new Date("2026-07-01T12:00:00.000Z"),
  });
}

test("calcula una semana para socio", () => {
  const result = calculate("member", ["week-1"]);
  assert.equal(result.baseAmount, 7_000);
  assert.equal(result.finalAmount, 7_000);
});

test("calcula una semana para no socio", () => {
  assert.equal(calculate("non_member", ["week-1"]).finalAmount, 8_000);
});

test("aplica la tarifa cerrada de dos semanas", () => {
  const result = calculate("member", ["week-1", "week-2"]);
  assert.equal(result.finalAmount, 13_000);
  assert.deepEqual(result.appliedRuleIds, ["member-2"]);
});

test("aplica la tarifa de campus completo", () => {
  const weeks = Array.from({ length: 6 }, (_, index) => `week-${index + 1}`);
  assert.equal(calculate("member", weeks).finalAmount, 35_000);
});

test("aplica un descuento válido en céntimos", () => {
  const result = calculate("member", ["week-1"], [discount()], "verano10");
  assert.equal(result.discounts[0]?.amount, 700);
  assert.equal(result.finalAmount, 6_300);
});

test("rechaza un descuento vencido", () => {
  assert.throws(
    () =>
      calculate(
        "member",
        ["week-1"],
        [discount({ ends_at: "2026-06-01T00:00:00.000Z" })],
        "VERANO10",
      ),
    (error) =>
      error instanceof PricingError && error.code === "INVALID_DISCOUNT",
  );
});

test("ignora cualquier precio manipulado por el cliente", () => {
  const browserPayload = {
    programId: "program-1",
    participantType: "member",
    periodIds: ["week-1"],
    totalAvailablePeriods: 6,
    rules,
    discounts: [],
    clientAmount: 1,
  };
  const result = calculateConfiguredPrice(browserPayload);
  assert.equal(result.finalAmount, 7_000);
});
