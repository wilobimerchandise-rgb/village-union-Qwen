"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Building2,
  Users,
  Receipt,
  CheckSquare,
  BarChart3,
  Settings,
  X,
} from "lucide-react";

interface SidebarProps {
  associationName: string;
  userName: string;
  userRole: string;
  onClose?: () => void;
}

const allNavItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["all"] },
  { href: "/dashboard/units", label: "Units", icon: Building2, roles: ["admin", "secretary", "treasurer"] },
  { href: "/dashboard/members", label: "Members", icon: Users, roles: ["admin", "secretary", "treasurer"] },
  { href: "/dashboard/bills", label: "Bills", icon: Receipt, roles: ["all"] },
  { href: "/dashboard/payments", label: "Payments", icon: CheckSquare, roles: ["all"] },
  { href: "/dashboard/reports", label: "Reports", icon: BarChart3, roles: ["admin", "treasurer", "financial_secretary", "president"] },
  { href: "/dashboard/settings", label: "Settings", icon: Settings, roles: ["admin", "president"] },
];

export function Sidebar({ associationName, userName, userRole, onClose }: SidebarProps) {
  const pathname = usePathname();

  const visibleItems = allNavItems.filter(
    (item) => item.roles.includes("all") || item.roles.includes(userRole)
  );

  return (
    <div className="flex h-full flex-col border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex h-14 items-center justify-between border-b border-zinc-200 px-4 dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-emerald-600" aria-hidden="true" />
          <span className="font-semibold text-zinc-900 dark:text-zinc-100">ASSOCIET</span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="rounded p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 lg:hidden"
            aria-label="Close sidebar"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      <div className="border-b border-zinc-200 p-4 dark:border-zinc-800">
        <div className="text-xs text-zinc-500 dark:text-zinc-400">Current Association</div>
        <div className="mt-1 truncate font-medium text-zinc-900 dark:text-zinc-100">
          {associationName}
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto p-2" aria-label="Main navigation">
        <ul className="space-y-1">
          {visibleItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onClose}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                      : "text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  )}
                  aria-current={isActive ? "page" : undefined}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-zinc-200 p-4 dark:border-zinc-800">
        <div className="flex items-center gap-3">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-200 text-xs font-medium text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300"
            aria-hidden="true"
          >
            {userName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
              {userName}
            </div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400">
              {userRole.replace("_", " ")}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
