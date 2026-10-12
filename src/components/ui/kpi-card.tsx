import { cn } from "@/lib/utils";
import { Money } from "./money";
import type { LucideIcon } from "lucide-react";

export interface KpiCardProps {
  label: string;
  value: number;
  format?: "money" | "number" | "percent";
  sub?: string;
  trend?: "up" | "down" | "neutral";
  variant?: "default" | "hot" | "good" | "bad";
  icon?: LucideIcon;
  loading?: boolean;
}

export function KpiCard({
  label,
  value,
  format = "number",
  sub,
  trend,
  variant = "default",
  icon: Icon,
  loading,
}: KpiCardProps) {
  const variantClasses = {
    default: "bg-white dark:bg-zinc-900",
    hot: "bg-emerald-600 text-white",
    good: "bg-white dark:bg-zinc-900",
    bad: "bg-white dark:bg-zinc-900",
  };

  const valueClasses = {
    default: "text-zinc-900 dark:text-zinc-100",
    hot: "text-white",
    good: "text-emerald-600 dark:text-emerald-400",
    bad: "text-red-600 dark:text-red-400",
  };

  const labelClasses = {
    default: "text-zinc-500 dark:text-zinc-400",
    hot: "text-emerald-100",
    good: "text-zinc-500 dark:text-zinc-400",
    bad: "text-zinc-500 dark:text-zinc-400",
  };

  function renderValue() {
    if (loading) {
      return <div className="skeleton h-8 w-24" aria-hidden="true" />;
    }
    if (format === "money") {
      return <Money amountKobo={value} className="text-2xl font-semibold" />;
    }
    if (format === "percent") {
      return <span className="text-2xl font-semibold">{value}%</span>;
    }
    return <span className="text-2xl font-semibold tabular-nums">{value.toLocaleString()}</span>;
  }

  return (
    <div
      className={cn(
        "rounded-lg border border-zinc-200 p-4 dark:border-zinc-800",
        variantClasses[variant]
      )}
      role="region"
      aria-label={label}
    >
      <div className="flex items-start justify-between">
        <div className={cn("text-sm", labelClasses[variant])}>{label}</div>
        {Icon && (
          <Icon
            className={cn(
              "h-4 w-4",
              variant === "hot" ? "text-emerald-100" : "text-zinc-400"
            )}
            aria-hidden="true"
          />
        )}
      </div>
      <div className={cn("mt-1", valueClasses[variant])}>{renderValue()}</div>
      {(sub || trend) && !loading && (
        <div
          className={cn(
            "mt-1 text-xs",
            trend === "up" && "text-emerald-600 dark:text-emerald-400",
            trend === "down" && "text-red-600 dark:text-red-400",
            !trend && labelClasses[variant]
          )}
        >
          {trend === "up" && "↑ "}
          {trend === "down" && "↓ "}
          {sub}
        </div>
      )}
    </div>
  );
}
