"use client";

import { useEffect, useState, useRef } from "react";
import { useFormContext } from "react-hook-form";
import { fetchDropdownOptions } from "@/app/settings/lists/actions";

type FormValues = {
  product_category?: string | null;
  category_meta?: Record<string, string | number>;
};

export function DependentCategories() {
  const { watch, setValue } = useFormContext<FormValues>();
  const category = watch("product_category");
  const categoryMeta = watch("category_meta") ?? {};
  const prevCategoryRef = useRef<string | null | undefined>(undefined);

  const [torahSizes, setTorahSizes] = useState<string[]>([]);
  const [neviimNames, setNeviimNames] = useState<string[]>([]);
  const [megillaLines, setMegillaLines] = useState<string[]>([]);

  useEffect(() => {
    if (prevCategoryRef.current !== undefined && prevCategoryRef.current !== category) {
      setValue("category_meta", {});
    }
    prevCategoryRef.current = category ?? undefined;
  }, [category, setValue]);

  useEffect(() => {
    if (category === "ספר תורה") {
      fetchDropdownOptions("torah_sizes").then((r) => r.success && setTorahSizes(r.options));
    } else if (category === "נביא") {
      fetchDropdownOptions("neviim_names").then((r) => r.success && setNeviimNames(r.options));
    } else if (category === "מגילה") {
      fetchDropdownOptions("megilla_lines").then((r) => r.success && setMegillaLines(r.options));
    }
  }, [category]);

  const showSize = category === "ספר תורה";
  const showNavi = category === "נביא";
  const showLines = category === "מגילה";

  if (!showSize && !showNavi && !showLines) return null;

  return (
    <>
      {showSize && (
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-slate-700">גודל</label>
          <select
            value={String(categoryMeta.size ?? "")}
            onChange={(e) =>
              setValue("category_meta", {
                ...categoryMeta,
                size: e.target.value,
              })
            }
            className="w-full rounded-xl border border-slate-300 px-3 py-2.5 bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
          >
            <option value="">בחר</option>
            {torahSizes.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      )}

      {showNavi && (
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-slate-700">נביא</label>
          <select
            value={String(categoryMeta.navi ?? "")}
            onChange={(e) =>
              setValue("category_meta", {
                ...categoryMeta,
                navi: e.target.value,
              })
            }
            className="w-full rounded-xl border border-slate-300 px-3 py-2.5 bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
          >
            <option value="">בחר</option>
            {neviimNames.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
      )}

      {showLines && (
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-slate-700">שורות</label>
          <select
            value={String(categoryMeta.lines ?? "")}
            onChange={(e) =>
              setValue("category_meta", {
                ...categoryMeta,
                lines: e.target.value,
              })
            }
            className="w-full rounded-xl border border-slate-300 px-3 py-2.5 bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
          >
            <option value="">בחר</option>
            {megillaLines.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </div>
      )}
    </>
  );
}
