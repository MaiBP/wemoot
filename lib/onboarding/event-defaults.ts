export function buildEventDefaults(status: {
  profile: Record<string, unknown>;
  organization?: Record<string, unknown> | null;
  defaultLocation?: Record<string, unknown> | null;
}) {
  return {
    organizer_name:
      stringValue(status.organization?.name) ||
      stringValue(status.profile.full_name),
    contact_email:
      stringValue(status.organization?.contact_email) ||
      stringValue(status.profile.email),
    contact_phone:
      stringValue(status.organization?.contact_phone) ||
      stringValue(status.profile.phone),
    city:
      stringValue(status.defaultLocation?.city) ||
      stringValue(status.profile.city),
    location: stringValue(status.defaultLocation?.name),
    location_id: stringValue(status.defaultLocation?.id),
    organization_id: stringValue(status.organization?.id),
  };
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}
