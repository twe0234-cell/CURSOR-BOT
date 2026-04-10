"use client";

/**
 * HScrollBar – Horizontal scrollable strip with subtle arrow buttons.
 *
 * RTL-aware: the RIGHT button goes back to the start (right edge in RTL),
 * the LEFT button reveals overflow content hidden off the left edge.
 *
 * Usage:
 *   <HScrollBar>
 *     {chips...}
 *   </HScrollBar>
 *
 *   <HScrollBar contentClassName="flex gap-3 flex-nowrap pb-4">
 *     {kanbanColumns...}
 *   </HScrollBar>
 */

import { useRef, useCallback, useEffect, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { cn } from "@/lib/utils";

function getScrollState(el: HTMLElement) {
  const maxScroll = el.scrollWidth - el.clientWidth;
  if (maxScroll < 5) return { canLeft: false, canRight: false };
  // RTL (dir="rtl"): scrollLeft is 0 at right-start, negative when scrolled left.
  // Math.abs normalises both Chrome and Firefox behaviour.
  const dist = Math.abs(el.scrollLeft);
  return {
    canLeft: dist < maxScroll - 4,  // more content off the left edge
    canRight: dist > 4,             // can scroll back towards the right start
  };
}

const BTN =
  "shrink-0 flex items-center justify-center size-7 rounded-full bg-white border border-border shadow-sm hover:bg-muted text-slate-500 transition-all duration-150";

type Props = {
  children: React.ReactNode;
  className?: string;
  /** Tailwind classes for the inner scroll container. Defaults to flex chip row. */
  contentClassName?: string;
};

export function HScrollBar({ children, className, contentClassName }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [{ canLeft, canRight }, setState] = useState({ canLeft: false, canRight: false });

  const update = useCallback(() => {
    if (ref.current) setState(getScrollState(ref.current));
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [update]);

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      {/* RIGHT button — physically right in RTL, goes back to start */}
      <button
        onClick={() => ref.current?.scrollBy({ left: 200, behavior: "smooth" })}
        className={cn(BTN, canRight ? "opacity-100" : "opacity-0 pointer-events-none")}
        aria-label="חזור לתחילה"
        tabIndex={canRight ? 0 : -1}
      >
        <ChevronRightIcon className="size-4" />
      </button>

      <div
        ref={ref}
        className={cn(
          "overflow-x-auto scrollbar-hide flex-1",
          contentClassName ?? "flex gap-2 items-center flex-nowrap"
        )}
      >
        {children}
      </div>

      {/* LEFT button — physically left in RTL, reveals hidden content */}
      <button
        onClick={() => ref.current?.scrollBy({ left: -200, behavior: "smooth" })}
        className={cn(BTN, canLeft ? "opacity-100" : "opacity-0 pointer-events-none")}
        aria-label="עוד"
        tabIndex={canLeft ? 0 : -1}
      >
        <ChevronLeftIcon className="size-4" />
      </button>
    </div>
  );
}
