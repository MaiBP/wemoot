import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
export function StatCard({
  label,
  value,
  icon: Icon,
  note,
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  note?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between">
        <div>
          <p className="text-sm text-brand-black/60">{label}</p>
          <p className="mt-2 text-3xl font-bold tracking-tight">{value}</p>
          {note && <p className="mt-1 text-xs text-brand-black/45">{note}</p>}
        </div>
        <span className="rounded-xl bg-brand-yellow p-2.5 text-brand-black">
          <Icon className="size-5" />
        </span>
      </CardContent>
    </Card>
  );
}
