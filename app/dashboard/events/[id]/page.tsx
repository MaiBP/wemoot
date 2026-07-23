import { notFound } from "next/navigation";
import Link from "next/link";
import { CalendarDays, MapPin, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EventActions } from "@/components/events/event-actions";
import { CopyBox } from "@/components/events/copy-box";
import { RegistrationManager } from "@/components/events/registration-manager";
import { AdvancedEventManager } from "@/components/events/advanced-event-manager";
import { PricingRulesManager } from "@/components/events/pricing-rules-manager";
import { resolveEventPermissions, roleLabels } from "@/lib/auth/permissions";
import type {
  EventDiscount,
  EventPriceRule,
  EventProgramPeriod,
  RegistrationRecord,
} from "@/types/event";
export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: event } = await supabase
    .from("events")
    .select("*")
    .eq("id", id)
    .single();
  if (!event) notFound();
  const [{ data: role }, { data: statsRows }] = await Promise.all([
    supabase.rpc("get_event_role", { target_event_id: id }),
    supabase.rpc("get_event_registration_stats", { target_event_id: id }),
  ]);
  const permissions = resolveEventPermissions(role);
  const stats = statsRows?.[0] ?? {
    total: 0,
    paid: 0,
    pending: 0,
    cancelled: 0,
    revenue: 0,
  };
  const advanced = event.event_mode === "advanced";
  const registrationsResult = !permissions.canViewRegistrations
    ? { data: [] }
    : advanced
      ? await supabase
          .from("registrations")
          .select(
            "*, event_programs(name), registration_periods(event_periods(label)), registration_items(amount, event_programs(name), event_periods(label), event_prices(label))",
          )
          .eq("event_id", id)
          .order("created_at", { ascending: false })
      : await supabase
          .from("registrations")
          .select("*")
          .eq("event_id", id)
          .order("created_at", { ascending: false });
  const registrations = (registrationsResult.data ??
    []) as RegistrationRecord[];
  const [{ data: programs = [] }, { data: periods = [] }] = advanced
    ? await Promise.all([
        supabase
          .from("event_programs")
          .select("*")
          .eq("event_id", id)
          .order("position"),
        supabase
          .from("event_periods")
          .select("*")
          .eq("event_id", id)
          .order("position"),
      ])
    : [{ data: [] }, { data: [] }];
  const programIds = (programs ?? []).map((program) => program.id);
  const { data: programPeriods = [] } =
    advanced && programIds.length
      ? await supabase
          .from("event_program_periods")
          .select("*")
          .in("program_id", programIds)
          .order("created_at")
      : { data: [] };
  const [{ data: priceRules = [] }, { data: discounts = [] }] = advanced
    ? await Promise.all([
        supabase
          .from("event_price_rules")
          .select("*")
          .eq("event_id", id)
          .order("priority", { ascending: false }),
        supabase
          .from("event_discounts")
          .select("*")
          .eq("event_id", id)
          .order("priority", { ascending: false }),
      ])
    : [{ data: [] }, { data: [] }];
  return (
    <div className="mx-auto max-w-7xl">
      <header className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex gap-2">
            <Badge>{event.event_type}</Badge>
            <Badge
              variant={event.status === "published" ? "success" : "warning"}
            >
              {event.status}
            </Badge>
            {permissions.role && <Badge>{roleLabels[permissions.role]}</Badge>}
          </div>
          <h1 className="text-3xl font-bold tracking-tight">{event.title}</h1>
          <p className="mt-2 text-sm text-brand-black/60">
            Creado desde{" "}
            {event.created_from === "telegram" ? "Telegram" : "la web"}
          </p>
        </div>
        {permissions.canManageEvent && (
          <EventActions id={event.id} status={event.status} />
        )}
      </header>
      <div className="grid gap-6 xl:grid-cols-[1.4fr_.8fr]">
        <div className="space-y-6">
          {advanced && permissions.canManageEvent && (
            <Card>
              <CardHeader>
                <CardTitle>Configuración avanzada del campus</CardTitle>
              </CardHeader>
              <CardContent>
                <AdvancedEventManager
                  eventId={event.id}
                  programs={programs ?? []}
                  periods={periods ?? []}
                  programPeriods={
                    (programPeriods ?? []) as EventProgramPeriod[]
                  }
                />
              </CardContent>
            </Card>
          )}
          {advanced && permissions.canManageEvent && (
            <Card>
              <CardHeader>
                <CardTitle>Precios y descuentos</CardTitle>
              </CardHeader>
              <CardContent>
                <PricingRulesManager
                  eventId={event.id}
                  programs={programs ?? []}
                  periods={periods ?? []}
                  rules={(priceRules ?? []) as EventPriceRule[]}
                  discounts={(discounts ?? []) as EventDiscount[]}
                />
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader>
              <CardTitle>Información del evento</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-5 sm:grid-cols-2">
                <p className="flex gap-3">
                  <CalendarDays className="size-5 text-brand-cyan" />
                  <span>
                    <strong className="block">
                      {formatDate(event.start_date)} –{" "}
                      {formatDate(event.end_date)}
                    </strong>
                    <span className="text-sm text-brand-black/60">
                      {event.schedule || "Horario por confirmar"}
                    </span>
                  </span>
                </p>
                <p className="flex gap-3">
                  <MapPin className="size-5 text-brand-cyan" />
                  <span>
                    <strong className="block">{event.city}</strong>
                    <span className="text-sm text-brand-black/60">
                      {event.location || "Ubicación por confirmar"}
                    </span>
                  </span>
                </p>
                <p className="flex gap-3">
                  <Users className="size-5 text-brand-cyan" />
                  <span>
                    <strong className="block">
                      {registrations?.length ?? 0} / {event.capacity} plazas
                    </strong>
                    <span className="text-sm text-brand-black/60">
                      {event.age_range
                        ? `Edades: ${event.age_range}`
                        : "Todas las edades"}
                    </span>
                  </span>
                </p>
                <p>
                  <strong className="block text-xl">
                    {formatCurrency(event.price)}
                  </strong>
                  <span className="text-sm text-brand-black/60">
                    Pago manual
                  </span>
                </p>
              </div>
              {event.description && (
                <p className="mt-6 border-t pt-5 text-sm leading-6 text-brand-black/70">
                  {event.description}
                </p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Inscritos y pagos</CardTitle>
            </CardHeader>
            <CardContent>
              {permissions.canViewRegistrations ? (
                <RegistrationManager
                  eventId={event.id}
                  eventTitle={event.title}
                  registrations={registrations ?? []}
                  canManage={permissions.canManageRegistrations}
                  canViewPayments={permissions.canViewPayments}
                  canExportParticipants={permissions.canExportParticipants}
                  canExportMedical={permissions.canExportMedical}
                />
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Stat label="Inscripciones" value={stats.total} />
                  <Stat label="Pagadas" value={stats.paid} />
                  <Stat label="Pendientes" value={stats.pending} />
                  <Stat label="Canceladas" value={stats.cancelled} />
                </div>
              )}
            </CardContent>
          </Card>
        </div>
        <aside className="space-y-6">
          {advanced && permissions.canManageForms && (
            <Card>
              <CardHeader>
                <CardTitle>Formulario de inscripción</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="mb-4 text-sm text-brand-black/55">
                  Configura secciones, campos obligatorios y la plantilla
                  pública.
                </p>
                <Button asChild className="w-full">
                  <Link
                    href={`/dashboard/events/${event.id}/registration-form`}
                  >
                    Abrir constructor
                  </Link>
                </Button>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader>
              <CardTitle>Copy para redes</CardTitle>
            </CardHeader>
            <CardContent>
              <CopyBox
                text={
                  event.social_copy ||
                  "El copy se generará al configurar OpenAI."
                }
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Mensaje de WhatsApp</CardTitle>
            </CardHeader>
            <CardContent>
              <CopyBox
                whatsapp
                text={
                  event.whatsapp_message ||
                  `Inscripciones abiertas para ${event.title}.`
                }
              />
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <p className="text-sm font-medium">Enlace de inscripción</p>
              <CopyBox
                text={`${process.env.NEXT_PUBLIC_APP_URL}/events/${event.slug}/register`}
              />
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-brand-black/[0.04] p-4">
      <span className="block text-xs uppercase tracking-wide text-brand-black/50">
        {label}
      </span>
      <strong className="mt-1 block text-2xl">{value}</strong>
    </div>
  );
}
