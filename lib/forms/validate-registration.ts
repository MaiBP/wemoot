export interface ValidatableField {
  field_key: string;
  label: string;
  field_type: string;
  required: boolean;
  conditional_logic?: Record<string, unknown> | null;
  section_key?: string;
}

export function isFieldVisible(
  field: ValidatableField,
  answers: Record<string, unknown>,
) {
  const logic = field.conditional_logic as {
    field?: string;
    equals?: unknown;
  } | null;
  return !logic?.field || answers[logic.field] === logic.equals;
}

export function validateRequiredAnswers(
  fields: ValidatableField[],
  answers: Record<string, unknown>,
) {
  return fields.flatMap((field) => {
    if (!isFieldVisible(field, answers) || !field.required) return [];
    const value = answers[field.field_key];
    const missing =
      value == null ||
      value === "" ||
      value === false ||
      (Array.isArray(value) && !value.length);
    return missing ? [`Completa el campo obligatorio: ${field.label}`] : [];
  });
}

export function participantAgeOnDate(
  birthDateValue: string,
  eventDateValue: string,
) {
  const birthDate = new Date(`${birthDateValue}T00:00:00Z`);
  const eventDate = new Date(`${eventDateValue}T00:00:00Z`);
  if (Number.isNaN(birthDate.getTime()) || Number.isNaN(eventDate.getTime()))
    return null;
  let age = eventDate.getUTCFullYear() - birthDate.getUTCFullYear();
  if (
    eventDate.getUTCMonth() < birthDate.getUTCMonth() ||
    (eventDate.getUTCMonth() === birthDate.getUTCMonth() &&
      eventDate.getUTCDate() < birthDate.getUTCDate())
  )
    age--;
  return age;
}

export function validateParticipant({
  birthDate,
  eventDate,
  guardianName,
  minAge,
  maxAge,
}: {
  birthDate: string;
  eventDate: string;
  guardianName?: string;
  minAge?: number | null;
  maxAge?: number | null;
}) {
  const age = participantAgeOnDate(birthDate, eventDate);
  if (age == null)
    return { age: null, errors: ["Fecha de nacimiento no válida"] };
  const errors: string[] = [];
  if ((minAge != null && age < minAge) || (maxAge != null && age > maxAge))
    errors.push("La edad no corresponde a la modalidad seleccionada");
  if (age < 18 && !guardianName?.trim())
    errors.push("Los menores de edad requieren padre, madre o tutor legal");
  return { age, errors };
}

export function withoutSensitiveAnswers(
  fields: ValidatableField[],
  answers: Record<string, unknown>,
) {
  const sensitive = new Set(
    fields
      .filter((field) => field.section_key === "medical")
      .map((field) => field.field_key),
  );
  return Object.fromEntries(
    Object.entries(answers).filter(([key]) => !sensitive.has(key)),
  );
}
