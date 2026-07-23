interface RegistrationFieldForPrivacy {
  id: string;
  field_key: string;
  registration_form_sections?: { section_key?: string | null } | null;
}

export function partitionRegistrationAnswers(
  registrationId: string,
  answers: Record<string, unknown>,
  fields: RegistrationFieldForPrivacy[],
) {
  const fieldMap = new Map(fields.map((field) => [field.field_key, field]));
  const general: Array<{
    registration_id: string;
    field_id: string;
    field_key: string;
    answer: unknown;
  }> = [];
  const sensitive: typeof general = [];

  for (const [fieldKey, answer] of Object.entries(answers)) {
    const field = fieldMap.get(fieldKey);
    if (!field) continue;
    const row = {
      registration_id: registrationId,
      field_id: field.id,
      field_key: fieldKey,
      answer,
    };
    if (field.registration_form_sections?.section_key === "medical")
      sensitive.push(row);
    else general.push(row);
  }

  return { general, sensitive };
}
