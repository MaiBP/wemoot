import { notFound } from "next/navigation";
import { CalendarDays, MapPin, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EventActions } from "@/components/events/event-actions";
import { CopyBox } from "@/components/events/copy-box";
import { RegistrationManager } from "@/components/events/registration-manager";
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
  const { data: registrations = [] } = await supabase
    .from("registrations")
    .select("*")
    .eq("event_id", id)
    .order("created_at", { ascending: false });
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
          </div>
          <h1 className="text-3xl font-bold tracking-tight">{event.title}</h1>
          <p className="mt-2 text-sm text-brand-black/60">
            Creado desde{" "}
            {event.created_from === "telegram" ? "Telegram" : "la web"}
          </p>
        </div>
        <EventActions id={event.id} status={event.status} />
      </header>
      <div className="grid gap-6 xl:grid-cols-[1.4fr_.8fr]">
        <div className="space-y-6">
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
              <RegistrationManager
                eventId={event.id}
                eventTitle={event.title}
                registrations={registrations ?? []}
              />
            </CardContent>
          </Card>
        </div>
        <aside className="space-y-6">
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
              <p className="text-sm font-medium">Enlace interno</p>
              <CopyBox
                text={`${process.env.NEXT_PUBLIC_APP_URL}/dashboard/events/${event.id}`}
              />
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
