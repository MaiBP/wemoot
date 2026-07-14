import Link from "next/link";
import { MapPin, Users } from "lucide-react";
import type { EventRecord } from "@/types/event";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
export function EventList({
  events,
  counts = {},
}: {
  events: EventRecord[];
  counts?: Record<string, number>;
}) {
  if (!events.length)
    return (
      <Card>
        <CardContent className="py-16 text-center text-brand-black/60">
          No hay eventos todavía.
        </CardContent>
      </Card>
    );
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {events.map((event) => (
        <Link href={`/dashboard/events/${event.id}`} key={event.id}>
          <Card className="h-full transition hover:-translate-y-0.5 hover:shadow-md">
            <CardContent>
              <div className="mb-4 flex items-center justify-between">
                <Badge>{event.event_type}</Badge>
                <Badge
                  variant={
                    event.status === "published"
                      ? "success"
                      : event.status === "cancelled"
                        ? "danger"
                        : "warning"
                  }
                >
                  {event.status}
                </Badge>
              </div>
              <h2 className="text-lg font-bold">{event.title}</h2>
              <p className="mt-2 text-sm text-brand-black/60">
                {formatDate(event.start_date)} – {formatDate(event.end_date)}
              </p>
              <p className="mt-3 flex items-center gap-1.5 text-sm text-brand-black/70">
                <MapPin className="size-4" />
                {event.city}
                {event.location ? ` · ${event.location}` : ""}
              </p>
              <div className="mt-5 flex items-center justify-between border-t border-brand-black/10 pt-4 text-sm">
                <span className="flex items-center gap-1.5">
                  <Users className="size-4" />
                  {counts[event.id] ?? 0} / {event.capacity}
                </span>
                <strong>{formatCurrency(event.price)}</strong>
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
