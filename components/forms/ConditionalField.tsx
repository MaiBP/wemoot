"use client";
import type { ReactNode } from "react";
export function ConditionalField({
  logic,
  answers,
  children,
}: {
  logic: Record<string, unknown>;
  answers: Record<string, unknown>;
  children: ReactNode;
}) {
  const field = typeof logic.field === "string" ? logic.field : null;
  if (field && answers[field] !== logic.equals) return null;
  return children;
}
