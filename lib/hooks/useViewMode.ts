"use client";
import { useEffect, useState } from "react";

export type ViewMode = "grid" | "list";

export function useViewMode(moduleKey: string) {
  const [mode, setMode] = useState<ViewMode>("list"); // SSR-safe default

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const saved = localStorage.getItem(`viewMode:${moduleKey}`);
    if (saved === "grid" || saved === "list") {
      setMode(saved);
    } else {
      setMode(window.innerWidth < 768 ? "grid" : "list");
    }
  }, [moduleKey]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const set = (m: ViewMode) => {
    setMode(m);
    localStorage.setItem(`viewMode:${moduleKey}`, m);
  };

  return [mode, set] as const;
}
