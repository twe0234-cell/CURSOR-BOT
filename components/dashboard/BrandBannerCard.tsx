"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type BrandBannerCardProps = {
  children: ReactNode;
  className?: string;
  variant?: "banner" | "kpi";
  glow?: boolean;
};

export function BrandBannerCard({
  children,
  className,
  variant = "banner",
  glow = false,
}: BrandBannerCardProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border bg-card/95 backdrop-blur-[1px]",
        "shadow-[0_10px_30px_-22px_oklch(0.16_0.03_265_/_55%)]",
        "before:pointer-events-none before:absolute before:inset-0 before:content-['']",
        "before:bg-[radial-gradient(80%_120%_at_100%_0%,oklch(0.73_0.13_80_/_0.12),transparent_60%)]",
        "after:pointer-events-none after:absolute after:inset-x-0 after:top-0 after:h-px after:content-['']",
        "after:bg-gradient-to-l after:from-accent/30 after:via-accent/10 after:to-transparent",
        variant === "banner" && [
          "border-primary/15",
          "bg-[linear-gradient(135deg,oklch(1_0_0)_0%,oklch(0.984_0.006_80)_48%,oklch(0.96_0.014_80)_100%)]",
        ],
        variant === "kpi" && "border-border/80 bg-white",
        glow && "ring-1 ring-accent/20",
        className
      )}
    >
      <div className="relative z-10">{children}</div>
    </div>
  );
}
