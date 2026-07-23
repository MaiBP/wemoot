import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/dashboard/sidebar";
import Link from "next/link";
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarding_status")
    .eq("id", user.id)
    .maybeSingle();
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_right,rgba(2,169,234,0.10)_0,transparent_28%),radial-gradient(circle_at_bottom_left,rgba(255,1,251,0.06)_0,transparent_24%)]">
      <Sidebar />
      <main className="p-5 lg:ml-64 lg:p-8">
        {profile?.onboarding_status !== "completed" && (
          <div className="mx-auto mb-5 max-w-7xl rounded-2xl border-l-4 border-brand-yellow bg-brand-yellow/20 px-4 py-3 text-sm">
            Completa tu perfil para reutilizar organización, contacto y
            ubicación en tus eventos.{" "}
            <Link href="/onboarding" className="font-bold underline">
              Continuar onboarding
            </Link>
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
