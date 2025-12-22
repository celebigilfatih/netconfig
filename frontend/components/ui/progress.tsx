import React from "react";
import { cn } from "../../lib/utils";

type Props = { value: number; variant?: "primary" | "success" | "danger" | "warning" | "neutral"; className?: string };

export function Progress({ value, variant = "primary", className }: Props) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  const color =
    variant === "success"
      ? "bg-green-600"
      : variant === "danger"
      ? "bg-red-600"
      : variant === "warning"
      ? "bg-yellow-500"
      : variant === "neutral"
      ? "bg-gray-400"
      : "bg-primary";
  return (
    <div className={cn("h-2 w-full rounded-full bg-muted", className)}>
      <div className={cn("h-2 rounded-full transition-all duration-300", color)} style={{ width: `${v}%` }} />
    </div>
  );
}
