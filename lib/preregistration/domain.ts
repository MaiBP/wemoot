export const waitingRegistrationStatuses = [
  "preregistered",
  "waitlisted",
] as const;
export const invitedRegistrationStatuses = [
  "payment_invited",
  "pending_payment",
] as const;

export function calculateInvitationExpiry(
  invitedAt: Date,
  invitationHours: number,
) {
  if (
    !Number.isInteger(invitationHours) ||
    invitationHours < 1 ||
    invitationHours > 24
  )
    throw new Error("Las invitaciones deben durar entre 1 y 24 horas.");
  return new Date(invitedAt.getTime() + invitationHours * 60 * 60 * 1000);
}

export function summarizePreregistrations(
  registrations: Array<{
    queue_position?: number | null;
    registration_status?: string | null;
  }>,
) {
  const queued = registrations.filter(
    (registration) => registration.queue_position != null,
  );
  return {
    total: queued.length,
    waiting: queued.filter((registration) =>
      waitingRegistrationStatuses.includes(
        registration.registration_status as (typeof waitingRegistrationStatuses)[number],
      ),
    ).length,
    invited: queued.filter((registration) =>
      invitedRegistrationStatuses.includes(
        registration.registration_status as (typeof invitedRegistrationStatuses)[number],
      ),
    ).length,
    confirmed: queued.filter(
      (registration) => registration.registration_status === "confirmed",
    ).length,
    expired: queued.filter(
      (registration) => registration.registration_status === "expired",
    ).length,
  };
}
