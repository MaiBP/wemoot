"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  CalendarDays,
  LayoutDashboard,
  LogOut,
  Plus,
  Users,
  UserCog,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
const links = [
  { href: "/dashboard", label: "Resumen", icon: LayoutDashboard },
  { href: "/dashboard/events", label: "Eventos", icon: CalendarDays },
  { href: "/dashboard/participants", label: "Inscritos", icon: Users },
  { href: "/dashboard/team", label: "Equipo", icon: UserCog },
];
export function Sidebar() {
  const path = usePathname();
  const router = useRouter();
  return (
    <aside className="flex w-full flex-col border-b border-white/10 bg-brand-black p-4 text-white shadow-xl shadow-black/10 lg:fixed lg:inset-y-0 lg:w-64 lg:border-b-0 lg:border-r lg:p-5">
      <Link
        href="/dashboard"
        className="mb-5 text-3xl font-black tracking-[-0.06em] lg:mb-10"
      >
        We<span className="text-brand-cyan">Moot</span>
      </Link>
      <Button asChild className="mb-5">
        <Link href="/dashboard/events/new">
          <Plus className="size-4" /> Nuevo evento
        </Link>
      </Button>
      <nav className="flex gap-1 overflow-auto lg:flex-col">
        {links.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-3 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm font-medium text-white/70 hover:bg-white/10 hover:text-white",
              path === href &&
                "bg-brand-magenta text-brand-black shadow-lg shadow-brand-magenta/20",
            )}
          >
            <Icon className="size-4" />
            {label}
          </Link>
        ))}
      </nav>
      <button
        className="mt-auto hidden items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-white/50 hover:bg-white/10 hover:text-white lg:flex"
        onClick={async () => {
          await createClient().auth.signOut();
          router.push("/login");
          router.refresh();
        }}
      >
        <LogOut className="size-4" />
        Cerrar sesión
      </button>
    </aside>
  );
}
