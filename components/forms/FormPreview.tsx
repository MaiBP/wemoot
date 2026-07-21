import type {
  RegistrationFormField,
  RegistrationFormSection,
} from "@/types/event";

export function FormPreview({
  sections,
  fields,
}: {
  sections: RegistrationFormSection[];
  fields: RegistrationFormField[];
}) {
  return (
    <div className="space-y-4 rounded-2xl bg-brand-black/[.03] p-4">
      {sections
        .filter((section) => section.is_active)
        .map((section) => (
          <section key={section.id}>
            <h3 className="font-semibold">{section.title}</h3>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {fields
                .filter(
                  (field) => field.section_id === section.id && field.is_active,
                )
                .map((field) => (
                  <div
                    key={field.id}
                    className="rounded-lg border bg-white p-3 text-sm"
                  >
                    {field.label}
                    {field.required && (
                      <span className="text-brand-magenta"> *</span>
                    )}
                  </div>
                ))}
            </div>
          </section>
        ))}
    </div>
  );
}
