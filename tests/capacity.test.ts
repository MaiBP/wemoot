import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateAvailableCapacity,
  canReserveCapacity,
  type CapacityReservationState,
} from "../lib/capacity/domain.ts";

const now = new Date("2026-07-22T10:00:00.000Z");
const reservation = (
  status: CapacityReservationState["status"],
  expiresAt = "2026-07-22T10:35:00.000Z",
): CapacityReservationState => ({ quantity: 1, status, expiresAt });

test("permite reservar cuando queda una plaza", () => {
  assert.equal(canReserveCapacity(2, [reservation("confirmed")], 1, now), true);
});

test("rechaza un programa completo", () => {
  assert.equal(
    canReserveCapacity(1, [reservation("confirmed")], 1, now),
    false,
  );
});

test("rechaza una semana completa por plazas confirmadas y temporales", () => {
  assert.equal(
    canReserveCapacity(
      2,
      [reservation("confirmed"), reservation("reserved")],
      1,
      now,
    ),
    false,
  );
});

test("una reserva temporal ocupa la plaza", () => {
  assert.equal(
    calculateAvailableCapacity(1, [reservation("reserved")], now),
    0,
  );
});

test("un pago confirmado conserva la plaza", () => {
  assert.equal(
    calculateAvailableCapacity(2, [reservation("confirmed")], now),
    1,
  );
});

test("una reserva caducada libera la plaza", () => {
  assert.equal(
    calculateAvailableCapacity(
      1,
      [reservation("reserved", "2026-07-22T09:59:59.000Z")],
      now,
    ),
    1,
  );
});

test("una reserva cancelada no consume capacidad", () => {
  assert.equal(
    calculateAvailableCapacity(1, [reservation("cancelled")], now),
    1,
  );
});
