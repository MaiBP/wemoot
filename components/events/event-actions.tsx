"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
export function EventActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function update(next: string) {
    setBusy(true);
    await fetch("/api/events", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: next }),
    });
    router.refresh();
    setBusy(false);
  }
  return (
    <div className="flex gap-2">
      {status === "draft" && (
        <Button disabled={busy} onClick={() => update("published")}>
          Publicar evento
        </Button>
      )}
      {status === "published" && (
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => update("draft")}
        >
          Pasar a borrador
        </Button>
      )}
    </div>
  );
}
