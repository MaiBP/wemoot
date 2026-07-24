import { notFound } from "next/navigation";
import { Clock3 } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { InvitationPaymentButton } from "@/components/forms/invitation-payment-button";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";

export default async function InvitationPaymentPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ cancelled?: string }>;
}) {
  const { token } = await params;
  const { cancelled } = await searchParams;
  const admin = createAdminClient();
  const { data: registration } = await admin
    .from("registrations")
    .select(
      "participant_name,total_amount,currency,payment_status,registration_status,payment_expires_at,events(title),registration_programs(event_programs(name))",
    )
    .eq("public_token", token)
    .maybeSingle();
  if (!registration) notFound();
  const event = Array.isArray(registration.events)
    ? registration.events[0]
    : registration.events;
  const programs = (registration.registration_programs ?? [])
    .map((selection) => {
      const program = Array.isArray(selection.event_programs)
        ? selection.event_programs[0]
        : selection.event_programs;
      return program?.name;
    })
    .filter(Boolean);
  const active =
    ["payment_invited", "pending_payment"].includes(
      registration.registration_status,
    ) &&
    Boolean(registration.payment_expires_at);
  const paid = registration.payment_status === "paid";

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,rgba(2,169,234,.18),transparent_42%)] px-4 py-10">
      <Card className="w-full max-w-lg overflow-hidden">
        <div className="h-2 bg-[linear-gradient(90deg,#FF01FB_0_33%,#02A9EA_33%_66%,#FAFF00_66%)]" />
        <CardContent className="space-y-5 p-7 sm:p-10">
          <p className="text-center text-2xl font-black">
            We<span className="text-brand-cyan">Moot</span>
          </p>
          <div>
            <p className="text-sm font-bold uppercase tracking-wide text-brand-cyan">
              Invitación de pago
            </p>
            <h1 className="mt-2 text-2xl font-black">{event?.title}</h1>
            <p className="mt-2 text-brand-black/60">
              {registration.participant_name}
            </p>
          </div>
          {programs.length > 0 && (
            <div className="rounded-xl bg-brand-black/[0.04] p-4 text-sm">
              <strong>Modalidades seleccionadas</strong>
              <p className="mt-1">{programs.join(" + ")}</p>
            </div>
          )}
          <p className="text-3xl font-black">
            {formatCurrency(Number(registration.total_amount ?? 0))}
          </p>
          {cancelled && (
            <p className="rounded-xl bg-brand-yellow/30 p-4 text-sm">
              El pago se canceló. Puedes intentarlo de nuevo mientras siga
              vigente la invitación.
            </p>
          )}
          {paid ? (
            <p className="rounded-xl bg-brand-cyan/10 p-4 font-medium">
              El pago ya está confirmado y tu plaza está reservada.
            </p>
          ) : active ? (
            <>
              <p className="flex gap-2 rounded-xl bg-brand-yellow/25 p-4 text-sm">
                <Clock3 className="size-5 shrink-0" />
                <span>
                  Completa el pago antes del{" "}
                  {new Intl.DateTimeFormat("es-ES", {
                    dateStyle: "long",
                    timeStyle: "short",
                    timeZone: "Europe/Madrid",
                  }).format(new Date(registration.payment_expires_at!))}
                  .
                </span>
              </p>
              <InvitationPaymentButton token={token} />
            </>
          ) : (
            <p className="rounded-xl bg-brand-magenta/10 p-4 text-sm">
              Esta invitación ya no está activa. La plaza ha pasado a la
              siguiente persona de la lista.
            </p>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
