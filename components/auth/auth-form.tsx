"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AuthForm() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  async function submit(formData: FormData) {
    setLoading(true);
    setError("");
    setMessage("");
    const supabase = createClient();
    const email = String(formData.get("email"));
    const password = String(formData.get("password"));
    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) setError(error.message);
      else {
        router.push("/dashboard");
        router.refresh();
      }
    } else {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: String(formData.get("full_name")),
            role: String(formData.get("role")),
            language: "es",
          },
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) setError(error.message);
      else setMessage("Revisa tu correo para confirmar la cuenta.");
    }
    setLoading(false);
  }
  return (
    <form action={submit} className="space-y-4">
      {mode === "signup" && (
        <>
          <div>
            <Label htmlFor="full_name">Nombre completo</Label>
            <Input
              id="full_name"
              name="full_name"
              required
              autoComplete="name"
            />
          </div>
          <div>
            <Label htmlFor="role">Perfil</Label>
            <select
              id="role"
              name="role"
              className="h-10 w-full rounded-xl border border-brand-black/15 bg-white px-3 text-sm"
            >
              <option value="organizer">Organizador</option>
              <option value="club">Club</option>
              <option value="academy">Academia</option>
              <option value="coach">Entrenador</option>
            </select>
          </div>
        </>
      )}
      <div>
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
        />
      </div>
      <div>
        <Label htmlFor="password">Contraseña</Label>
        <Input
          id="password"
          name="password"
          type="password"
          minLength={8}
          required
          autoComplete={mode === "login" ? "current-password" : "new-password"}
        />
      </div>
      {error && (
        <p className="rounded-lg border-l-4 border-brand-magenta bg-brand-magenta/10 p-3 text-sm text-brand-black">
          {error}
        </p>
      )}
      {message && (
        <p className="rounded-lg border-l-4 border-brand-cyan bg-brand-cyan/10 p-3 text-sm text-brand-black">
          {message}
        </p>
      )}
      <Button className="w-full" size="lg" disabled={loading}>
        {loading ? "Procesando…" : mode === "login" ? "Entrar" : "Crear cuenta"}
      </Button>
      <button
        type="button"
        className="w-full text-sm font-semibold text-brand-black underline decoration-brand-magenta decoration-2 underline-offset-4"
        onClick={() => setMode(mode === "login" ? "signup" : "login")}
      >
        {mode === "login" ? "¿No tienes cuenta? Regístrate" : "Ya tengo cuenta"}
      </button>
    </form>
  );
}
