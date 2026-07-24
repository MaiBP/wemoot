import { notFound } from "next/navigation";
import { CalendarDays, MapPin, Users } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatCurrency, formatDate } from "@/lib/utils";
import { PublicRegistrationForm } from "@/components/forms/public-registration-form";
import { DynamicRegistrationForm } from "@/components/forms/DynamicRegistrationForm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  EventIncludedItem,
  EventPriceRule,
  EventProgramPeriod,
  RegistrationFormField,
  RegistrationFormRecord,
  RegistrationFormSection,
} from "@/types/event";

export default async function RegistrationPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ payment?: string }>;
}) {
  const { slug } = await params;
  const { payment } = await searchParams;
  const admin = createAdminClient();
  const { data: event } = await admin
    .from("events")
    .select("*")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  if (!event) notFound();

  const preregistration = event.registration_mode === "preregistration";
  let countQuery = admin
    .from("registrations")
    .select("id", { count: "exact", head: true })
    .eq("event_id", event.id);
  countQuery = preregistration
    ? countQuery.in("registration_status", [
        "preregistered",
        "waitlisted",
        "payment_invited",
        "pending_payment",
        "confirmed",
      ])
    : countQuery.neq("payment_status", "cancelled");
  const { count } = await countQuery;
  const advanced = event.event_mode === "advanced";
  const [
    { data: programs = [] },
    { data: periods = [] },
    { data: prices = [] },
  ] = advanced
    ? await Promise.all([
        admin
          .from("event_programs")
          .select("*")
          .eq("event_id", event.id)
          .eq("active", true)
          .order("position"),
        admin
          .from("event_periods")
          .select("*")
          .eq("event_id", event.id)
          .eq("active", true)
          .order("position"),
        admin
          .from("event_prices")
          .select("*")
          .eq("event_id", event.id)
          .eq("active", true)
          .order("position"),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];
  const remaining = Math.max(0, event.capacity - (count ?? 0));
  const price = Number(event.price);
  const { data: registrationForm } = advanced
    ? await admin
        .from("registration_forms")
        .select("*")
        .eq("event_id", event.id)
        .eq("status", "published")
        .maybeSingle()
    : { data: null };
  const [
    { data: formSections = [] },
    { data: formFields = [] },
    { data: programPeriods = [] },
    { data: includedItems = [] },
    { data: activeReservations = [] },
    { data: priceRules = [] },
  ] = registrationForm
    ? await Promise.all([
        admin
          .from("registration_form_sections")
          .select("*")
          .eq("form_id", registrationForm.id)
          .eq("is_active", true)
          .order("sort_order"),
        admin
          .from("registration_form_fields")
          .select("*")
          .eq("form_id", registrationForm.id)
          .eq("is_active", true)
          .order("sort_order"),
        admin
          .from("event_program_periods")
          .select("*")
          .in(
            "program_id",
            (programs ?? []).map((program) => program.id),
          ),
        admin.from("event_included_items").select("*").eq("event_id", event.id),
        admin
          .from("capacity_reservations")
          .select("program_id,period_id,quantity")
          .eq("event_id", event.id)
          .eq("status", "reserved")
          .gt("expires_at", new Date().toISOString()),
        admin
          .from("event_price_rules")
          .select("*")
          .eq("event_id", event.id)
          .eq("is_active", true)
          .order("priority", { ascending: false }),
      ])
    : [
        { data: [] },
        { data: [] },
        { data: [] },
        { data: [] },
        { data: [] },
        { data: [] },
      ];
  const liveProgramPeriods = (programPeriods ?? []).map((relation) => ({
    ...relation,
    capacity:
      relation.capacity ??
      (programs ?? []).find((program) => program.id === relation.program_id)
        ?.capacity ??
      null,
    reserved_count: (activeReservations ?? [])
      .filter(
        (reservation) =>
          reservation.program_id === relation.program_id &&
          reservation.period_id === relation.period_id,
      )
      .reduce((total, reservation) => total + reservation.quantity, 0),
  }));
  const preregistrationRemaining =
    event.preregistration_limit == null
      ? null
      : Math.max(0, event.preregistration_limit - (count ?? 0));
  const acceptingRegistrations = preregistration
    ? preregistrationRemaining == null || preregistrationRemaining > 0
    : advanced
      ? liveProgramPeriods.some(
          (relation) =>
            relation.is_available &&
            (relation.capacity == null ||
              relation.registered_count + relation.reserved_count <
                relation.capacity),
        )
      : remaining > 0;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(2,169,234,.16),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(255,1,251,.10),transparent_35%)] px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-3xl">
        <p className="mb-6 text-center text-3xl font-black tracking-tight">
          We<span className="text-brand-cyan">Moot</span>
        </p>
        <Card className="overflow-hidden">
          <div className="h-2 bg-[linear-gradient(90deg,#FF01FB_0_33%,#02A9EA_33%_66%,#FAFF00_66%)]" />
          <CardHeader className="p-6 pb-3 sm:p-8 sm:pb-3">
            <p className="mb-2 text-sm font-bold uppercase tracking-wider text-brand-cyan">
              {preregistration
                ? "Preinscripciones abiertas"
                : "Inscripción abierta"}
            </p>
            <CardTitle className="text-2xl sm:text-3xl">
              {event.title}
            </CardTitle>
            {event.description && (
              <p className="mt-3 leading-6 text-brand-black/65">
                {event.description}
              </p>
            )}
          </CardHeader>
          <CardContent className="p-6 pt-4 sm:p-8 sm:pt-5">
            <div className="mb-8 grid gap-4 rounded-2xl bg-brand-black/[0.035] p-5 sm:grid-cols-2">
              <p className="flex gap-3">
                <CalendarDays className="mt-0.5 size-5 shrink-0 text-brand-cyan" />
                <span>
                  <strong className="block">
                    {formatDate(event.start_date)}
                    {event.end_date !== event.start_date
                      ? ` – ${formatDate(event.end_date)}`
                      : ""}
                  </strong>
                  <span className="text-sm text-brand-black/55">
                    {event.schedule || "Horario por confirmar"}
                  </span>
                </span>
              </p>
              <p className="flex gap-3">
                <MapPin className="mt-0.5 size-5 shrink-0 text-brand-magenta" />
                <span>
                  <strong className="block">{event.city}</strong>
                  <span className="text-sm text-brand-black/55">
                    {event.location || "Ubicación por confirmar"}
                  </span>
                </span>
              </p>
              <p className="flex gap-3">
                <Users className="mt-0.5 size-5 shrink-0 text-brand-cyan" />
                <span>
                  <strong className="block">
                    {preregistration
                      ? preregistrationRemaining == null
                        ? "Preinscripciones disponibles"
                        : `${preregistrationRemaining} preinscripciones disponibles`
                      : `${remaining} plazas disponibles`}
                  </strong>
                  <span className="text-sm text-brand-black/55">
                    {event.age_range || "Todas las edades"}
                  </span>
                </span>
              </p>
              <p>
                <strong className="block text-xl">
                  {price === 0
                    ? "Gratuito"
                    : advanced
                      ? `Desde ${formatCurrency(price)}`
                      : formatCurrency(price)}
                </strong>
                <span className="text-sm text-brand-black/55">
                  Precio por participante
                </span>
              </p>
            </div>
            {preregistration && (
              <div className="mb-6 rounded-xl bg-brand-yellow/25 p-5 text-sm leading-6">
                <strong>El pago todavía no está habilitado.</strong>
                <p>
                  Completa el formulario para reservar tu posición por orden de
                  llegada. Te avisaremos cuando puedas realizar el pago. La
                  preinscripción no garantiza una plaza.
                </p>
              </div>
            )}
            {payment === "cancelled" && (
              <p className="mb-5 rounded-xl bg-brand-yellow/35 p-4 text-sm">
                El pago con tarjeta se canceló. Tu plaza no se confirmó; puedes
                intentarlo de nuevo o elegir efectivo.
              </p>
            )}
            {acceptingRegistrations ? (
              registrationForm ? (
                <DynamicRegistrationForm
                  eventId={event.id}
                  form={registrationForm as RegistrationFormRecord}
                  sections={(formSections ?? []) as RegistrationFormSection[]}
                  fields={(formFields ?? []) as RegistrationFormField[]}
                  programs={programs ?? []}
                  periods={periods ?? []}
                  relations={liveProgramPeriods as EventProgramPeriod[]}
                  priceRules={(priceRules ?? []) as EventPriceRule[]}
                  includedItems={(includedItems ?? []) as EventIncludedItem[]}
                  registrationMode={
                    preregistration ? "preregistration" : "direct"
                  }
                  allowMultiplePrograms={event.allow_multiple_programs ?? true}
                  allowIndividualPeriods={
                    (
                      event.general_settings as
                        | { allow_individual_periods?: boolean }
                        | null
                    )?.allow_individual_periods !== false
                  }
                />
              ) : (
                <PublicRegistrationForm
                  eventId={event.id}
                  price={price}
                  programs={programs ?? []}
                  periods={periods ?? []}
                  prices={prices ?? []}
                />
              )
            ) : (
              <div className="rounded-xl bg-brand-yellow/35 p-5 text-center">
                <strong>
                  {preregistration
                    ? "Se alcanzó el límite de preinscripciones"
                    : "El evento está completo"}
                </strong>
                <p className="mt-1 text-sm text-brand-black/60">
                  {preregistration
                    ? "No se admiten nuevas solicitudes en este momento."
                    : "Ya no quedan plazas disponibles."}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
