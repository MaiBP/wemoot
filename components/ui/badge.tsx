import { cn } from "@/lib/utils";

export function Badge({
  children,
  className,
  variant = "neutral",
}: {
  children: React.ReactNode;
  className?: string;
  variant?: "neutral" | "success" | "warning" | "danger";
}) {
  const colors = {
    neutral: "bg-brand-black/[0.06] text-brand-black/75",
    success: "bg-brand-cyan/20 text-brand-black",
    warning: "bg-brand-yellow text-brand-black",
    danger: "bg-brand-magenta/20 text-brand-black",
  };
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",
        colors[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
