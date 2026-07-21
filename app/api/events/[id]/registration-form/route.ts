import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { campusTemplate } from "@/lib/forms/campus-template";
import {
  registrationFormFieldSchema,
  registrationFormSectionSchema,
} from "@/lib/validations";

async function context(eventId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, event: null, unauthorized: true };
  const { data: event } = await supabase
    .from("events")
    .select("id")
    .eq("id", eventId)
    .eq("owner_id", user.id)
    .maybeSingle();
  return { supabase, event, unauthorized: false };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: eventId } = await params;
  const { supabase, event, unauthorized } = await context(eventId);
  if (unauthorized)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!event)
    return NextResponse.json(
      { error: "Evento no encontrado" },
      { status: 404 },
    );
  const body = await request.json();

  if (body.action === "create_campus_template") {
    const { data: existing } = await supabase
      .from("registration_forms")
      .select("id")
      .eq("event_id", eventId)
      .maybeSingle();
    if (existing)
      return NextResponse.json(
        { error: "El evento ya tiene un formulario" },
        { status: 409 },
      );
    const { data: form, error } = await supabase
      .from("registration_forms")
      .insert({
        event_id: eventId,
        name: "Campus de fútbol completo",
        description: "Plantilla completa editable para campus de fútbol.",
        template_key: "football_campus_full",
        settings: { local_draft: true, multi_step: true },
      })
      .select()
      .single();
    if (error)
      return NextResponse.json({ error: error.message }, { status: 400 });
    try {
      const { data: sections, error: sectionError } = await supabase
        .from("registration_form_sections")
        .insert(
          campusTemplate.map((section, index) => ({
            form_id: form.id,
            title: section.title,
            description: section.description ?? null,
            section_key: section.key,
            sort_order: index,
          })),
        )
        .select();
      if (sectionError) throw sectionError;
      const ids = new Map(
        (sections ?? []).map((section) => [section.section_key, section.id]),
      );
      const fields = campusTemplate.flatMap((section) =>
        section.fields.map((field, index) => ({
          form_id: form.id,
          section_id: ids.get(section.key),
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
      return NextResponse.json({ form }, { status: 201 });
    } catch (cause) {
      await supabase.from("registration_forms").delete().eq("id", form.id);
      return NextResponse.json(
        {
          error:
            cause instanceof Error
              ? cause.message
              : "No se pudo crear la plantilla",
        },
        { status: 400 },
      );
    }
  }

  if (body.action === "create_blank") {
    const { data: existing } = await supabase
      .from("registration_forms")
      .select("id")
      .eq("event_id", eventId)
      .maybeSingle();
    if (existing)
      return NextResponse.json(
        { error: "El evento ya tiene un formulario" },
        { status: 409 },
      );
    const { data: form, error } = await supabase
      .from("registration_forms")
      .insert({
        event_id: eventId,
        name: "Formulario personalizado",
        settings: { local_draft: true, multi_step: true },
      })
      .select()
      .single();
    return NextResponse.json(error ? { error: error.message } : { form }, {
      status: error ? 400 : 201,
    });
  }

  const { data: form } = await supabase
    .from("registration_forms")
    .select("id")
    .eq("event_id", eventId)
    .maybeSingle();
  if (!form)
    return NextResponse.json(
      { error: "Crea primero un formulario" },
      { status: 400 },
    );
  if (body.action === "add_section") {
    const parsed = registrationFormSectionSchema.safeParse(body.data);
    if (!parsed.success)
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message },
        { status: 400 },
      );
    const { count } = await supabase
      .from("registration_form_sections")
      .select("id", { count: "exact", head: true })
      .eq("form_id", form.id);
    const { error } = await supabase
      .from("registration_form_sections")
      .insert({ ...parsed.data, form_id: form.id, sort_order: count ?? 0 });
    return NextResponse.json(error ? { error: error.message } : { ok: true }, {
      status: error ? 400 : 201,
    });
  }
  if (body.action === "add_field") {
    const parsed = registrationFormFieldSchema.safeParse(body.data);
    if (!parsed.success)
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message },
        { status: 400 },
      );
    const { data: section } = await supabase
      .from("registration_form_sections")
      .select("id")
      .eq("id", parsed.data.section_id)
      .eq("form_id", form.id)
      .maybeSingle();
    if (!section)
      return NextResponse.json({ error: "Sección no válida" }, { status: 400 });
    const { count } = await supabase
      .from("registration_form_fields")
      .select("id", { count: "exact", head: true })
      .eq("section_id", section.id);
    const { error } = await supabase
      .from("registration_form_fields")
      .insert({ ...parsed.data, form_id: form.id, sort_order: count ?? 0 });
    return NextResponse.json(error ? { error: error.message } : { ok: true }, {
      status: error ? 400 : 201,
    });
  }
  return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: eventId } = await params;
  const { supabase, event, unauthorized } = await context(eventId);
  if (unauthorized)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!event)
    return NextResponse.json(
      { error: "Evento no encontrado" },
      { status: 404 },
    );
  const body = await request.json();
  const { data: form } = await supabase
    .from("registration_forms")
    .select("id")
    .eq("event_id", eventId)
    .maybeSingle();
  if (!form)
    return NextResponse.json(
      { error: "Formulario no encontrado" },
      { status: 404 },
    );
  if (body.entity === "form") {
    const status = ["draft", "published", "archived"].includes(body.status)
      ? body.status
      : null;
    if (!status)
      return NextResponse.json({ error: "Estado no válido" }, { status: 400 });
    if (status === "published") {
      const [{ count: fields }, { count: selectionSections }] =
        await Promise.all([
          supabase
            .from("registration_form_fields")
            .select("id", { count: "exact", head: true })
            .eq("form_id", form.id)
            .eq("is_active", true),
          supabase
            .from("registration_form_sections")
            .select("id", { count: "exact", head: true })
            .eq("form_id", form.id)
            .eq("section_key", "program_selection")
            .eq("is_active", true),
        ]);
      if (!fields || !selectionSections)
        return NextResponse.json(
          {
            error:
              "El formulario necesita campos activos y una sección program_selection",
          },
          { status: 400 },
        );
    }
    const { error } = await supabase
      .from("registration_forms")
      .update({ status })
      .eq("id", form.id);
    return NextResponse.json(error ? { error: error.message } : { ok: true }, {
      status: error ? 400 : 200,
    });
  }
  const table =
    body.entity === "section"
      ? "registration_form_sections"
      : body.entity === "field"
        ? "registration_form_fields"
        : null;
  if (!table || !body.id)
    return NextResponse.json({ error: "Datos no válidos" }, { status: 400 });
  const allowed =
    body.entity === "section"
      ? ["title", "description", "is_active", "sort_order"]
      : [
          "label",
          "description",
          "placeholder",
          "required",
          "options",
          "validation_rules",
          "conditional_logic",
          "is_active",
          "sort_order",
        ];
  const changes = Object.fromEntries(
    Object.entries(body.changes ?? {}).filter(([key]) => allowed.includes(key)),
  );
  const { error } = await supabase
    .from(table)
    .update(changes)
    .eq("id", body.id)
    .eq("form_id", form.id);
  return NextResponse.json(error ? { error: error.message } : { ok: true }, {
    status: error ? 400 : 200,
  });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: eventId } = await params;
  const { supabase, event, unauthorized } = await context(eventId);
  if (unauthorized)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!event)
    return NextResponse.json(
      { error: "Evento no encontrado" },
      { status: 404 },
    );
  const url = new URL(request.url);
  const entity = url.searchParams.get("entity");
  const recordId = url.searchParams.get("id");
  const { data: form } = await supabase
    .from("registration_forms")
    .select("id")
    .eq("event_id", eventId)
    .maybeSingle();
  const table =
    entity === "section"
      ? "registration_form_sections"
      : entity === "field"
        ? "registration_form_fields"
        : null;
  if (!form || !table || !recordId)
    return NextResponse.json({ error: "Datos no válidos" }, { status: 400 });
  const { error } = await supabase
    .from(table)
    .delete()
    .eq("id", recordId)
    .eq("form_id", form.id);
  return NextResponse.json(error ? { error: error.message } : { ok: true }, {
    status: error ? 400 : 200,
  });
}
