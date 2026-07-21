import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { FormBuilder } from "@/components/forms/FormBuilder";
import type {
  RegistrationFormField,
  RegistrationFormRecord,
  RegistrationFormSection,
} from "@/types/event";

export default async function RegistrationFormPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: event } = await supabase
    .from("events")
    .select("id,title")
    .eq("id", id)
    .maybeSingle();
  if (!event) notFound();
  const { data: form } = await supabase
    .from("registration_forms")
    .select("*")
    .eq("event_id", id)
    .maybeSingle();
  const [{ data: sections = [] }, { data: fields = [] }] = form
    ? await Promise.all([
        supabase
          .from("registration_form_sections")
          .select("*")
          .eq("form_id", form.id)
          .order("sort_order"),
        supabase
          .from("registration_form_fields")
          .select("*")
          .eq("form_id", form.id)
          .order("sort_order"),
      ])
    : [{ data: [] }, { data: [] }];
  return (
    <div className="mx-auto max-w-6xl">
      <Link
        href={`/dashboard/events/${id}`}
        className="mb-5 inline-flex items-center gap-2 text-sm text-brand-black/55"
      >
        <ArrowLeft className="size-4" /> Volver a {event.title}
      </Link>
      <FormBuilder
        eventId={id}
        form={(form as RegistrationFormRecord | null) ?? null}
        sections={(sections ?? []) as RegistrationFormSection[]}
        fields={(fields ?? []) as RegistrationFormField[]}
      />
    </div>
  );
}
