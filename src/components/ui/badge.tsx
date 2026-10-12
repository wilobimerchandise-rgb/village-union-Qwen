import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  XCircle,
  Clock,
  Ban,
  AlertCircle,
  Circle,
} from "lucide-react";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
  {
    variants: {
      variant: {
        pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
        verified: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
        rejected: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
        void: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
        active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
        inactive: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
        info: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
      },
    },
    defaultVariants: {
      variant: "pending",
    },
  }
);

const iconMap = {
  pending: Clock,
  verified: CheckCircle2,
  rejected: XCircle,
  void: Ban,
  active: CheckCircle2,
  inactive: Circle,
  info: AlertCircle,
};

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  showIcon?: boolean;
}

export function Badge({
  className,
  variant,
  showIcon = true,
  children,
  ...props
}: BadgeProps) {
  const Icon = variant ? iconMap[variant] : null;
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {showIcon && Icon && <Icon className="h-3 w-3" aria-hidden="true" />}
      {children}
    </span>
  );
}
