import { notFound } from "next/navigation";
import { CalendarDays, MapPin, Users } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatCurrency, formatDate } from "@/lib/utils";
import { PublicRegistrationForm } from "@/components/forms/public-registration-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function RegistrationPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ payment?: string }> }) {
  const { slug } = await params;
  const { payment } = await searchParams;
  const admin = createAdminClient();
  const { data: event } = await admin.from("events").select("*").eq("slug", slug).eq("status", "published").maybeSingle();
  if (!event) notFound();

  const { count } = await admin.from("registrations").select("id", { count: "exact", head: true }).eq("event_id", event.id).neq("payment_status", "cancelled");
  const remaining = Math.max(0, event.capacity - (count ?? 0));
  const price = Number(event.price);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(2,169,234,.16),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(255,1,251,.10),transparent_35%)] px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-3xl">
        <p className="mb-6 text-center text-3xl font-black tracking-tight">We<span className="text-brand-cyan">Moot</span></p>
        <Card className="overflow-hidden">
          <div className="h-2 bg-[linear-gradient(90deg,#FF01FB_0_33%,#02A9EA_33%_66%,#FAFF00_66%)]" />
          <CardHeader className="p-6 pb-3 sm:p-8 sm:pb-3">
            <p className="mb-2 text-sm font-bold uppercase tracking-wider text-brand-cyan">Inscripción abierta</p>
            <CardTitle className="text-2xl sm:text-3xl">{event.title}</CardTitle>
            {event.description && <p className="mt-3 leading-6 text-brand-black/65">{event.description}</p>}
          </CardHeader>
          <CardContent className="p-6 pt-4 sm:p-8 sm:pt-5">
            <div className="mb-8 grid gap-4 rounded-2xl bg-brand-black/[0.035] p-5 sm:grid-cols-2">
              <p className="flex gap-3"><CalendarDays className="mt-0.5 size-5 shrink-0 text-brand-cyan" /><span><strong className="block">{formatDate(event.start_date)}{event.end_date !== event.start_date ? ` – ${formatDate(event.end_date)}` : ""}</strong><span className="text-sm text-brand-black/55">{event.schedule || "Horario por confirmar"}</span></span></p>
              <p className="flex gap-3"><MapPin className="mt-0.5 size-5 shrink-0 text-brand-magenta" /><span><strong className="block">{event.city}</strong><span className="text-sm text-brand-black/55">{event.location || "Ubicación por confirmar"}</span></span></p>
              <p className="flex gap-3"><Users className="mt-0.5 size-5 shrink-0 text-brand-cyan" /><span><strong className="block">{remaining} plazas disponibles</strong><span className="text-sm text-brand-black/55">{event.age_range || "Todas las edades"}</span></span></p>
              <p><strong className="block text-xl">{price === 0 ? "Gratuito" : formatCurrency(price)}</strong><span className="text-sm text-brand-black/55">Precio por participante</span></p>
            </div>
            {payment === "cancelled" && <p className="mb-5 rounded-xl bg-brand-yellow/35 p-4 text-sm">El pago con tarjeta se canceló. Tu plaza no se confirmó; puedes intentarlo de nuevo o elegir efectivo.</p>}
            {remaining > 0 ? <PublicRegistrationForm eventId={event.id} price={price} /> : <div className="rounded-xl bg-brand-yellow/35 p-5 text-center"><strong>El evento está completo</strong><p className="mt-1 text-sm text-brand-black/60">Ya no quedan plazas disponibles.</p></div>}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
