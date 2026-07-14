import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const variants = cva(
  "inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-all disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-magenta focus-visible:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "bg-brand-cyan text-brand-black shadow-sm shadow-brand-cyan/20 hover:brightness-95 hover:shadow-md hover:shadow-brand-cyan/25",
        secondary: "bg-brand-yellow text-brand-black hover:brightness-95",
        outline:
          "border border-brand-black/15 bg-white text-brand-black hover:border-brand-cyan hover:bg-brand-cyan/5",
        ghost: "text-brand-black hover:bg-brand-black/[0.06]",
        destructive: "bg-brand-magenta text-brand-black hover:brightness-95",
      },
      size: {
        default: "h-10 px-4",
        sm: "h-8 px-3",
        lg: "h-12 px-6",
        icon: "size-10",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);
export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof variants> {
  asChild?: boolean;
}
export function Button({
  className,
  variant,
  size,
  asChild,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp className={cn(variants({ variant, size }), className)} {...props} />
  );
}
