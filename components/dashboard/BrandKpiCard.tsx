"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type BrandKpiTone = "ink" | "navy" | "gold" | "positive" | "danger";

const toneClasses: Record<BrandKpiTone, string> = {
  ink: "text-foreground border-foreground/10",
  navy: "text-primary border-primary/15",
  gold: "text-accent-foreground border-accent/30",
  positive: "text-emerald-700 border-emerald-200",
  danger: "text-red-700 border-red-200",
};

type BrandKpiCardProps = {
  label: ReactNode;
  value: ReactNode;
  tone?: BrandKpiTone;
  delay?: number;
  className?: string;
};

export function BrandKpiCard({
  label,
  value,
  tone = "navy",
  delay = 0,
  className,
}: BrandKpiCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, delay }}
      whileHover={{ y: -3 }}
      className={className}
    >
      <Card
        className={cn(
          "relative h-full overflow-hidden rounded-2xl border bg-card/95 shadow-sm",
          "transition-shadow duration-300 hover:shadow-[0_16px_44px_-28px_oklch(0.16_0.03_265_/_35%)]",
          toneClasses[tone],
        )}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-l from-transparent via-accent/70 to-transparent" />
        <div className="pointer-events-none absolute -left-8 -top-10 size-24 rounded-full bg-accent/10 blur-2xl" />
        <CardContent className="relative pt-6">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="mt-2 text-2xl font-bold tabular-nums leading-tight sm:text-[1.7rem]">
            {value}
          </p>
        </CardContent>
      </Card>
    </motion.div>
  );
}
