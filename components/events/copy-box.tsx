"use client";
import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
export function CopyBox({
  text,
  whatsapp = false,
}: {
  text: string;
  whatsapp?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <div className="rounded-xl bg-brand-black/[0.03] p-4">
      <p className="whitespace-pre-wrap text-sm leading-6 text-brand-black/75">
        {text}
      </p>
      <div className="mt-3 flex gap-2">
        <Button size="sm" variant="outline" onClick={copy}>
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? "Copiado" : "Copiar"}
        </Button>
        {whatsapp && (
          <Button asChild size="sm" variant="secondary">
            <a
              target="_blank"
              rel="noreferrer"
              href={`https://wa.me/?text=${encodeURIComponent(text)}`}
            >
              Compartir por WhatsApp
            </a>
          </Button>
        )}
      </div>
    </div>
  );
}
