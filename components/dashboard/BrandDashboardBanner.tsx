import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type BrandDashboardBannerProps = {
  title: ReactNode;
  meta?: ReactNode;
  className?: string;
};

export function BrandDashboardBanner({
  title,
  meta,
  className,
}: BrandDashboardBannerProps) {
  return (
    <section
      className={cn(
        "relative isolate overflow-hidden rounded-2xl border border-accent/25",
        "bg-[linear-gradient(135deg,var(--background),oklch(0.96_0.035_82),oklch(0.99_0.006_80))]",
        "px-5 py-6 shadow-[0_18px_60px_-42px_oklch(0.16_0.03_265_/_45%)] sm:px-7 sm:py-7",
        "animate-fade-in-up",
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_8%_0%,oklch(0.73_0.13_80_/_18%),transparent_28%),linear-gradient(90deg,oklch(0.16_0.03_265_/_5%)_1px,transparent_1px),linear-gradient(0deg,oklch(0.16_0.03_265_/_4%)_1px,transparent_1px)] bg-[length:auto,34px_34px,34px_34px]" />
      <div className="pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-l from-transparent via-accent/70 to-transparent" />
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="mb-3 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.14em] text-accent-foreground/70">
            <span className="h-px w-10 bg-accent/70" />
            <span>Hidur HaSTaM</span>
          </div>
          <h1 className="font-display text-3xl font-bold leading-tight text-foreground sm:text-4xl">
            {title}
          </h1>
          {meta ? <div className="mt-3 text-sm text-muted-foreground">{meta}</div> : null}
        </div>
        <div className="hidden shrink-0 sm:block">
          <div className="grid size-20 place-items-center rounded-2xl border border-accent/25 bg-background/45 text-accent shadow-inner">
            <div className="size-10 rounded-full border border-accent/50 bg-[radial-gradient(circle,oklch(0.73_0.13_80_/_26%),transparent_62%)]" />
          </div>
        </div>
      </div>
    </section>
  );
}
