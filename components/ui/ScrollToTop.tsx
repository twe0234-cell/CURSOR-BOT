"use client";

/**
 * ScrollToTop — כפתור צף שמופיע אחרי גלילה מטה, מחזיר לראש הדף.
 * מוסיף לעצמו את ה-listener ומסיר בעת unmount.
 */

import { useEffect, useState } from "react";
import { ChevronUpIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const SHOW_AFTER_PX = 320;

export function ScrollToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > SHOW_AFTER_PX);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="חזור לראש הדף"
      className={cn(
        "fixed bottom-6 left-6 z-50 flex items-center justify-center",
        "size-11 rounded-full shadow-lg border border-border",
        "bg-white/90 backdrop-blur-sm text-slate-600",
        "hover:bg-primary hover:text-primary-foreground hover:border-primary",
        "transition-all duration-200",
        visible
          ? "opacity-100 translate-y-0 pointer-events-auto"
          : "opacity-0 translate-y-4 pointer-events-none"
      )}
    >
      <ChevronUpIcon className="size-5" />
    </button>
  );
}
