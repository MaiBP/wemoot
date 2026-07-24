"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function InvitationPaymentButton({ token }: { token: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function pay() {
    setBusy(true);
    setError("");
    const response = await fetch("/api/public/payments/invitation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const result = await response.json();
    if (!response.ok) {
      setError(result.error ?? "No se pudo abrir el pago");
      setBusy(false);
      return;
    }
    window.location.assign(result.checkout_url);
  }

  return (
    <div>
      <Button className="w-full" disabled={busy} onClick={pay}>
        {busy && <Loader2 className="size-4 animate-spin" />}
        Pagar ahora
      </Button>
      {error && (
        <p className="mt-3 rounded-xl bg-brand-magenta/10 p-3 text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
