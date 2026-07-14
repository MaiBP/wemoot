import { Card, CardContent } from "@/components/ui/card";
import { EventForm } from "@/components/forms/event-form";
export default function NewEventPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-7">
        <h1 className="text-3xl font-bold tracking-tight">Nuevo evento</h1>
        <p className="mt-1 text-brand-black/60">
          Crea un borrador manualmente como alternativa al asistente.
        </p>
      </header>
      <Card>
        <CardContent>
          <EventForm />
        </CardContent>
      </Card>
    </div>
  );
}
