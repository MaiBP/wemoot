import * as React from "react";
import { cn } from "@/lib/utils";
export function Input({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-xl border border-brand-black/15 bg-white px-3 text-sm outline-none placeholder:text-brand-black/40 focus:border-brand-cyan focus:ring-2 focus:ring-brand-cyan/20",
        className,
      )}
      {...props}
    />
  );
}
