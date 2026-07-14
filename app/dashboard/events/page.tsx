import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { EventList } from "@/components/events/event-list";
import { Button } from "@/components/ui/button";
export default async function EventsPage() {
  const supabase = await createClient();
  const { data: events = [] } = await supabase
    .from("events")
    .select("*")
    .order("created_at", { ascending: false });
  const ids = (events ?? []).map((e) => e.id);
  const { data: regs = [] } = ids.length
    ? await supabase
        .from("registrations")
        .select("event_id")
        .in("event_id", ids)
    : { data: [] };
  const counts = (regs ?? []).reduce<Record<string, number>>(
    (a, r) => ({ ...a, [r.event_id]: (a[r.event_id] ?? 0) + 1 }),
    {},
  );
  return (
    <div className="mx-auto max-w-7xl">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Eventos</h1>
          <p className="mt-1 text-brand-black/60">
            Gestiona todos tus eventos desde un solo lugar.
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/events/new">
            <Plus className="size-4" />
            Nuevo evento
          </Link>
        </Button>
      </header>
      <EventList events={events ?? []} counts={counts} />
    </div>
  );
}
