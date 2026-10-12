"use client";

import * as React from "react";
import { Menu, Search } from "lucide-react";
import { Button } from "@/components/ui/button";

interface TopbarProps {
  onMenuClick?: () => void;
  showMenuButton?: boolean;
  breadcrumbs?: Array<{ label: string; href?: string }>;
  title?: string;
  onCommandPalette?: () => void;
}

export function Topbar({
  onMenuClick,
  showMenuButton = false,
  breadcrumbs,
  title,
  onCommandPalette,
}: TopbarProps) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-zinc-200 bg-white/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-white/60 dark:border-zinc-800 dark:bg-zinc-950/95 dark:supports-[backdrop-filter]:bg-zinc-950/60 sm:px-6">
      {showMenuButton && (
        <Button
          variant="ghost"
          size="icon"
          onClick={onMenuClick}
          className="lg:hidden"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </Button>
      )}

      <div className="flex-1 min-w-0">
        {title ? (
          <h1 className="truncate text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            {title}
          </h1>
        ) : breadcrumbs && breadcrumbs.length > 0 ? (
          <nav aria-label="Breadcrumb">
            <ol className="flex items-center gap-2 text-sm">
              {breadcrumbs.map((crumb, i) => (
                <li key={i} className="flex items-center gap-2">
                  {i > 0 && <span className="text-zinc-400" aria-hidden="true">/</span>}
                  {crumb.href ? (
                    <a href={crumb.href} className="text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
                      {crumb.label}
                    </a>
                  ) : (
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">{crumb.label}</span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
        ) : null}
      </div>

      <Button variant="outline" size="sm" onClick={onCommandPalette} className="hidden sm:inline-flex">
        <Search className="h-4 w-4" />
        <span className="ml-2">Search</span>
        <kbd className="ml-2 rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-xs dark:border-zinc-700 dark:bg-zinc-800">
          ⌘K
        </kbd>
      </Button>
    </header>
  );
}
