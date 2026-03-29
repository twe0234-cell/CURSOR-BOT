"use client";

import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  value: number | null | undefined;
  onChange?: (next: number) => void;
  /** כשאין onChange — תצוגה בלבד */
  readOnly?: boolean;
  className?: string;
  size?: "sm" | "md";
};

function clampHalfStep(n: number): number {
  const x = Math.round(n * 2) / 2;
  return Math.min(5, Math.max(0, x));
}

/**
 * 1–5 stars with half-star display; two click zones per star (LTR geometry).
 */
export function StarRating({
  value,
  onChange,
  readOnly = false,
  className,
  size = "md",
}: Props) {
  const v = value == null || Number.isNaN(value) ? 0 : clampHalfStep(Number(value));
  const iconSize = size === "sm" ? "size-4" : "size-5";
  const editable = Boolean(onChange) && !readOnly;

  return (
    <div
      dir="ltr"
      className={cn("inline-flex items-center gap-0.5", className)}
      role="group"
      aria-label="דירוג כוכבים"
    >
      {[0, 1, 2, 3, 4].map((i) => {
        const starNum = i + 1;
        const full = v >= starNum;
        const half = !full && v >= starNum - 0.5;
        return (
          <div key={i} className="relative inline-flex shrink-0">
            <Star
              className={cn(
                iconSize,
                "text-amber-200",
                full && "fill-amber-400 text-amber-500"
              )}
              strokeWidth={1.5}
            />
            {half && (
              <Star
                className={cn(
                  iconSize,
                  "absolute left-0 top-0 fill-amber-400 text-amber-500"
                )}
                style={{ clipPath: "inset(0 50% 0 0)" }}
                strokeWidth={1.5}
              />
            )}
            {editable && (
              <div className="absolute inset-0 flex">
                <button
                  type="button"
                  className="w-1/2 h-full min-h-[1.25rem] border-0 bg-transparent cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded opacity-0"
                  aria-label={`${starNum - 0.5} כוכבים`}
                  onClick={() => onChange!(clampHalfStep(starNum - 0.5))}
                />
                <button
                  type="button"
                  className="w-1/2 h-full min-h-[1.25rem] border-0 bg-transparent cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded opacity-0"
                  aria-label={`${starNum} כוכבים`}
                  onClick={() => onChange!(clampHalfStep(starNum))}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
