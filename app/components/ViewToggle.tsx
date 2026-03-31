"use client";
import { LayoutGrid, LayoutList } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ViewMode } from "@/lib/hooks/useViewMode";

interface Props {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
  className?: string;
}

export function ViewToggle({ mode, onChange, className }: Props) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-0.5 rounded-lg bg-muted p-0.5",
        className
      )}
      role="group"
      aria-label="מצב תצוגה"
    >
      <button
        type="button"
        onClick={() => onChange("grid")}
        title="תצוגת רשת"
        aria-pressed={mode === "grid"}
        className={cn(
          "flex items-center justify-center rounded-md p-1.5 transition-all duration-200",
          mode === "grid"
            ? "bg-card text-foreground shadow-sm ring-1 ring-border/50"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        <LayoutGrid className="size-4" />
      </button>
      <button
        type="button"
        onClick={() => onChange("list")}
        title="תצוגת רשימה"
        aria-pressed={mode === "list"}
        className={cn(
          "flex items-center justify-center rounded-md p-1.5 transition-all duration-200",
          mode === "list"
            ? "bg-card text-foreground shadow-sm ring-1 ring-border/50"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        <LayoutList className="size-4" />
      </button>
    </div>
  );
}
