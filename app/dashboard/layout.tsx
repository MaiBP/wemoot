import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/dashboard/sidebar";
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
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_right,rgba(2,169,234,0.10)_0,transparent_28%),radial-gradient(circle_at_bottom_left,rgba(255,1,251,0.06)_0,transparent_24%)]">
      <Sidebar />
      <main className="p-5 lg:ml-64 lg:p-8">{children}</main>
    </div>
  );
}
