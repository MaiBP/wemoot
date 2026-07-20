import { CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { getStripe } from "@/lib/stripe";

export default async function RegistrationSuccessPage({ searchParams }: { searchParams: Promise<{ method?: string; session_id?: string }> }) {
  const { method, session_id: sessionId } = await searchParams;
  const cash = method === "cash";
  const free = method === "free";
  const reserve = method === "reserve";
  let cardPaid = false;
  if (sessionId?.startsWith("cs_")) {
    try {
      const session = await getStripe().checkout.sessions.retrieve(sessionId);
      cardPaid = session.payment_status === "paid";
    } catch {
      cardPaid = false;
    }
  }
  const confirmed = cash || free || reserve || cardPaid;
  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,rgba(2,169,234,.18),transparent_40%)] px-4">
      <Card className="w-full max-w-lg text-center">
        <div className="h-2 rounded-t-2xl bg-[linear-gradient(90deg,#FF01FB_0_33%,#02A9EA_33%_66%,#FAFF00_66%)]" />
        <CardContent className="p-8 sm:p-12">
          <CheckCircle2 className="mx-auto size-14 text-brand-cyan" />
          <p className="mt-5 text-3xl font-black">{confirmed ? "¡Inscripción completada!" : "Estamos confirmando tu pago"}</p>
          <p className="mt-3 leading-6 text-brand-black/60">
            {cash ? "Tu plaza está reservada. Recuerda realizar el pago en efectivo al organizador." : free ? "Tu plaza ha quedado reservada correctamente." : reserve ? "Hemos recibido tu solicitud. El organizador confirmará la plaza y te indicará cuándo realizar el pago." : cardPaid ? "Tu pago se ha procesado y tu plaza ha quedado reservada." : "Stripe está procesando la operación. El organizador verá el estado actualizado automáticamente cuando se confirme."}
          </p>
          <p className="mt-8 text-2xl font-black">We<span className="text-brand-cyan">Moot</span></p>
        </CardContent>
      </Card>
    </main>
  );
}
