import Link from "next/link";
import { CalendarCheck, CircleDollarSign, Clock3, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency, formatDate } from "@/lib/utils";
import { StatCard } from "@/components/dashboard/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: events = [] } = await supabase
    .from("events")
    .select("*")
    .order("start_date", { ascending: true });
  const stats = await Promise.all(
    (events ?? []).map(async (event) => {
      const { data } = await supabase.rpc("get_event_registration_stats", {
        target_event_id: event.id,
      });
      return data?.[0] ?? { total: 0, pending: 0, revenue: 0 };
    }),
  );
  const totals = stats.reduce(
    (result, item) => ({
      registrations: result.registrations + Number(item.total ?? 0),
      pending: result.pending + Number(item.pending ?? 0),
      revenue: result.revenue + Number(item.revenue ?? 0),
    }),
    { registrations: 0, pending: 0, revenue: 0 },
  );
  return (
    <div className="mx-auto max-w-7xl">
      <header className="mb-8 flex items-end justify-between">
        <div>
          <p className="border-l-4 border-brand-magenta pl-3 text-sm font-semibold text-brand-black">
            PANEL DE ORGANIZACIÓN
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">Resumen</h1>
        </div>
        <Button asChild className="hidden sm:inline-flex">
          <Link href="/dashboard/events/new">Crear evento</Link>
        </Button>
      </header>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Eventos activos"
          value={(events ?? []).filter((e) => e.status === "published").length}
          icon={CalendarCheck}
        />
        <StatCard
          label="Total inscritos"
          value={totals.registrations}
          icon={Users}
        />
        <StatCard
          label="Pagos pendientes"
          value={totals.pending}
          icon={Clock3}
        />
        <StatCard
          label="Ingresos confirmados"
          value={formatCurrency(totals.revenue)}
          icon={CircleDollarSign}
        />
      </section>
      <Card className="mt-7">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Próximos eventos</CardTitle>
          <Button asChild variant="ghost" size="sm">
            <Link href="/dashboard/events">Ver todos</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {!events?.length ? (
            <div className="py-14 text-center">
              <p className="font-medium">Todavía no hay eventos</p>
              <p className="mt-1 text-sm text-brand-black/60">
                Crea el primero desde el formulario o Telegram.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-brand-black/10">
              {events.slice(0, 5).map((event) => (
                <Link
                  href={`/dashboard/events/${event.id}`}
                  key={event.id}
                  className="flex items-center justify-between py-4 hover:bg-brand-cyan/5"
                >
                  <div>
                    <p className="font-semibold">{event.title}</p>
                    <p className="mt-1 text-sm text-brand-black/60">
                      {event.city} · {formatDate(event.start_date)}
                    </p>
                  </div>
                  <Badge
                    variant={
                      event.status === "published" ? "success" : "warning"
                    }
                  >
                    {event.status === "published" ? "Publicado" : "Borrador"}
                  </Badge>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
