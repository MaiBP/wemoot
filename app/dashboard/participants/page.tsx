import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { resolveEventPermissions } from "@/lib/auth/permissions";
export default async function ParticipantsPage() {
  const supabase = await createClient();
  const { data: events = [] } = await supabase
    .from("events")
    .select("id,title");
  const accessEntries = await Promise.all(
    (events ?? []).map(async (event) => {
      const { data: role } = await supabase.rpc("get_event_role", {
        target_event_id: event.id,
      });
      return [event.id, resolveEventPermissions(role)] as const;
    }),
  );
  const access = new Map(accessEntries);
  const ids = (events ?? [])
    .filter((event) => access.get(event.id)?.canViewRegistrations)
    .map((event) => event.id);
  const { data: registrations = [] } = ids.length
    ? await supabase
        .from("registrations")
        .select("*")
        .in("event_id", ids)
        .order("created_at", { ascending: false })
    : { data: [] };
  const names = Object.fromEntries((events ?? []).map((e) => [e.id, e.title]));
  return (
    <div className="mx-auto max-w-7xl">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Inscritos</h1>
        <p className="mt-1 text-brand-black/60">
          Vista global de participantes y cobros.
        </p>
      </header>
      <Card>
        <CardContent>
          {!registrations?.length ? (
            <p className="py-14 text-center text-brand-black/60">
              Todavía no hay inscritos.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b text-xs uppercase text-brand-black/45">
                  <tr>
                    <th className="py-3">Participante</th>
                    <th>Evento</th>
                    <th>Contacto</th>
                    <th>Pago</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {registrations.map((r) => (
                    <tr key={r.id}>
                      <td className="py-4 font-medium">{r.participant_name}</td>
                      <td>{names[r.event_id]}</td>
                      <td className="text-brand-black/60">
                        {access.get(r.event_id)?.canManageRegistrations
                          ? r.participant_email || r.participant_phone || "—"
                          : "Acceso restringido"}
                      </td>
                      <td>
                        {access.get(r.event_id)?.canViewPayments ? (
                          <Badge
                            variant={
                              r.payment_status === "paid"
                                ? "success"
                                : r.payment_status === "cancelled"
                                  ? "danger"
                                  : "warning"
                            }
                          >
                            {r.payment_status}
                          </Badge>
                        ) : (
                          <span className="text-brand-black/45">
                            Restringido
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
