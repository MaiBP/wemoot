export type CapacityReservationStatus =
  "reserved" | "confirmed" | "expired" | "cancelled";

export interface CapacityReservationState {
  quantity: number;
  status: CapacityReservationStatus;
  expiresAt: string;
}

export function isActiveReservation(
  reservation: CapacityReservationState,
  now = new Date(),
) {
  return (
    reservation.status === "confirmed" ||
    (reservation.status === "reserved" &&
      new Date(reservation.expiresAt).getTime() > now.getTime())
  );
}

export function calculateAvailableCapacity(
  capacity: number,
  reservations: CapacityReservationState[],
  now = new Date(),
) {
  const occupied = reservations
    .filter((reservation) => isActiveReservation(reservation, now))
    .reduce((total, reservation) => total + reservation.quantity, 0);
  return Math.max(0, capacity - occupied);
}

export function canReserveCapacity(
  capacity: number,
  reservations: CapacityReservationState[],
  quantity = 1,
  now = new Date(),
) {
  return calculateAvailableCapacity(capacity, reservations, now) >= quantity;
}
