export const eventRoles = [
  "owner",
  "admin",
  "registration_manager",
  "coach",
  "medical_staff",
  "viewer",
] as const;

export type EventRole = (typeof eventRoles)[number];

export interface EventPermissions {
  role: EventRole | null;
  canViewEvent: boolean;
  canManageEvent: boolean;
  canManageRegistrations: boolean;
  canViewRegistrations: boolean;
  canViewPayments: boolean;
  canManageForms: boolean;
  canExportParticipants: boolean;
  canExportMedical: boolean;
  canViewAggregateStats: boolean;
}

export function isEventRole(value: unknown): value is EventRole {
  return eventRoles.includes(value as EventRole);
}

export function resolveEventPermissions(role: unknown): EventPermissions {
  const normalized = isEventRole(role) ? role : null;
  const administrator = normalized === "owner" || normalized === "admin";
  const registrationManager = normalized === "registration_manager";
  const coach = normalized === "coach";
  const medicalStaff = normalized === "medical_staff";

  return {
    role: normalized,
    canViewEvent: normalized !== null,
    canManageEvent: administrator,
    canManageRegistrations: administrator || registrationManager,
    canViewRegistrations:
      administrator || registrationManager || coach || medicalStaff,
    canViewPayments: administrator || registrationManager,
    canManageForms: administrator || registrationManager,
    canExportParticipants: administrator || registrationManager,
    canExportMedical: administrator || medicalStaff,
    canViewAggregateStats: normalized !== null,
  };
}

export const roleLabels: Record<EventRole, string> = {
  owner: "Propietario",
  admin: "Administrador",
  registration_manager: "Gestor de inscripciones",
  coach: "Entrenador",
  medical_staff: "Personal médico",
  viewer: "Solo estadísticas",
};
