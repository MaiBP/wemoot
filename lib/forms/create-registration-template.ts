import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  basicRegistrationTemplate,
  campusTemplate,
  type TemplateSection,
} from "@/lib/forms/campus-template";

export type RegistrationTemplateKey =
  "football_campus_full" | "basic" | "blank";

const templates: Record<
  Exclude<RegistrationTemplateKey, "blank">,
  { name: string; description: string; sections: TemplateSection[] }
> = {
  football_campus_full: {
    name: "Campus de fútbol completo",
    description: "Plantilla completa editable para campus de fútbol.",
    sections: campusTemplate,
  },
  basic: {
    name: "Formulario básico",
    description: "Participante, actividad y autorizaciones provisionales.",
    sections: basicRegistrationTemplate,
  },
};

export async function createRegistrationTemplate(
  supabase: SupabaseClient,
  eventId: string,
  templateKey: RegistrationTemplateKey,
) {
  const template = templateKey === "blank" ? null : templates[templateKey];
  const { data: form, error } = await supabase
    .from("registration_forms")
    .insert({
      event_id: eventId,
      name: template?.name ?? "Formulario personalizado",
      description: template?.description ?? null,
      template_key: templateKey === "blank" ? null : templateKey,
      settings: { local_draft: true, multi_step: true },
    })
    .select()
    .single();
  if (error) throw error;
  if (!template) return form;

  try {
    const { data: sections, error: sectionError } = await supabase
      .from("registration_form_sections")
      .insert(
        template.sections.map((section, index) => ({
          form_id: form.id,
          title: section.title,
          description: section.description ?? null,
          section_key: section.key,
          sort_order: index,
        })),
      )
      .select();
    if (sectionError) throw sectionError;
    const sectionIds = new Map(
      (sections ?? []).map((section) => [section.section_key, section.id]),
    );
    const fields = template.sections.flatMap((section) =>
      section.fields.map((field, index) => ({
        form_id: form.id,
        section_id: sectionIds.get(section.key),
        field_key: field.key,
        label: field.label,
        placeholder: field.placeholder ?? null,
        field_type: field.type,
        required: field.required ?? false,
        options: field.options ?? [],
        validation_rules: field.validation ?? {},
        conditional_logic: field.conditional ?? {},
        sort_order: index,
      })),
    );
    if (fields.length) {
      const { error: fieldError } = await supabase
        .from("registration_form_fields")
        .insert(fields);
      if (fieldError) throw fieldError;
    }
    return form;
  } catch (error) {
    await supabase.from("registration_forms").delete().eq("id", form.id);
    throw error;
  }
}
