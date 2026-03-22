"use client";

import { useEffect, useState, useRef } from "react";
import { useFormContext } from "react-hook-form";
import { fetchDropdownOptions } from "@/app/settings/lists/actions";
import { DROPDOWN_FALLBACKS } from "@/lib/constants";
import { PITUM_HAKETORET_CATEGORY } from "@/lib/validations/inventory";

type FormValues = {
  product_category?: string | null;
  category_meta?: Record<string, string | number>;
  has_lamnatzeach?: boolean;
  size?: string | null;
};

export function DependentCategories() {
  const { watch, setValue, register } = useFormContext<FormValues>();
  const category = watch("product_category");
  const categoryMeta = watch("category_meta") ?? {};
  const prevCategoryRef = useRef<string | null | undefined>(undefined);

  const [torahSizes, setTorahSizes] = useState<string[]>([]);
  const [neviimNames, setNeviimNames] = useState<string[]>([]);
  const [megillaLines, setMegillaLines] = useState<string[]>([]);
  const [mezuzahSizes, setMezuzahSizes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (prevCategoryRef.current !== undefined && prevCategoryRef.current !== category) {
      setValue("category_meta", {});
    }
    prevCategoryRef.current = category ?? undefined;
  }, [category, setValue]);

  useEffect(() => {
    if (category === "ספר תורה") {
      queueMicrotask(() => setLoading(true));
      fetchDropdownOptions("torah_sizes")
        .then((r) => setTorahSizes(r.success && r.options.length > 0 ? r.options : DROPDOWN_FALLBACKS.torah_sizes))
        .catch(() => setTorahSizes(DROPDOWN_FALLBACKS.torah_sizes))
        .finally(() => setLoading(false));
    } else if (category === "נביא") {
      queueMicrotask(() => setLoading(true));
      fetchDropdownOptions("neviim_names")
        .then((r) => setNeviimNames(r.success && r.options.length > 0 ? r.options : DROPDOWN_FALLBACKS.neviim_names))
        .catch(() => setNeviimNames(DROPDOWN_FALLBACKS.neviim_names))
        .finally(() => setLoading(false));
    } else if (category === "מגילה") {
      queueMicrotask(() => setLoading(true));
      fetchDropdownOptions("megilla_lines")
        .then((r) => setMegillaLines(r.success && r.options.length > 0 ? r.options : DROPDOWN_FALLBACKS.megilla_lines))
        .catch(() => setMegillaLines(DROPDOWN_FALLBACKS.megilla_lines))
        .finally(() => setLoading(false));
    } else if (category === "מזוזה") {
      queueMicrotask(() => setLoading(true));
      fetchDropdownOptions("mezuzah_sizes")
        .then((r) => setMezuzahSizes(r.success && r.options.length > 0 ? r.options : DROPDOWN_FALLBACKS.mezuzah_sizes))
        .catch(() => setMezuzahSizes(DROPDOWN_FALLBACKS.mezuzah_sizes))
        .finally(() => setLoading(false));
    }
  }, [category]);

  const showTorahSize = category === "ספר תורה";
  const showNavi = category === "נביא";
  const showLines = category === "מגילה";
  const showMezuzahSize = category === "מזוזה";
  const showPitum = category === PITUM_HAKETORET_CATEGORY;
  const pitumSizeVal = watch("size") ?? "";
  const pitumIsPreset = ["15", "20", "25"].includes(String(pitumSizeVal).trim());
  const [pitumOtherOpen, setPitumOtherOpen] = useState(false);

  useEffect(() => {
    if (!showPitum) {
      setPitumOtherOpen(false);
      return;
    }
    const s = String(pitumSizeVal ?? "").trim();
    if (s && !["15", "20", "25"].includes(s)) {
      setPitumOtherOpen(true);
    }
  }, [showPitum, pitumSizeVal]);

  const pitumSelectValue = pitumIsPreset
    ? String(pitumSizeVal).trim()
    : pitumOtherOpen || String(pitumSizeVal ?? "").trim()
      ? "אחר"
      : "";

  if (!showTorahSize && !showNavi && !showLines && !showMezuzahSize && !showPitum) return null;

  const selectClass =
    "w-full rounded-xl border border-slate-300 bg-white shadow-sm px-3 py-2.5 focus:border-sky-500 focus:ring-1 focus:ring-sky-500";

  return (
    <>
      {showTorahSize && (
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-semibold text-slate-800">גודל</label>
          {loading ? (
            <div className="h-10 rounded-xl bg-slate-200 animate-pulse" />
          ) : (
          <select
            value={String(categoryMeta.size ?? "")}
            onChange={(e) =>
              setValue("category_meta", {
                ...categoryMeta,
                size: e.target.value,
              })
            }
            className={selectClass}
          >
            <option value="">בחר</option>
            {torahSizes.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          )}
        </div>
      )}

      {showMezuzahSize && (
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-semibold text-slate-800">מידה</label>
          {loading ? (
            <div className="h-10 rounded-xl bg-slate-200 animate-pulse" />
          ) : (
          <select
            value={String(categoryMeta.size ?? "")}
            onChange={(e) =>
              setValue("category_meta", {
                ...categoryMeta,
                size: e.target.value,
              })
            }
            className={selectClass}
          >
            <option value="">בחר</option>
            {mezuzahSizes.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          )}
        </div>
      )}

      {showNavi && (
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-semibold text-slate-800">נביא</label>
          {loading ? (
            <div className="h-10 rounded-xl bg-slate-200 animate-pulse" />
          ) : (
          <select
            value={String(categoryMeta.navi ?? "")}
            onChange={(e) =>
              setValue("category_meta", {
                ...categoryMeta,
                navi: e.target.value,
              })
            }
            className={selectClass}
          >
            <option value="">בחר</option>
            {neviimNames.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          )}
        </div>
      )}

      {showLines && (
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-semibold text-slate-800">שורות</label>
          {loading ? (
            <div className="h-10 rounded-xl bg-slate-200 animate-pulse" />
          ) : (
          <select
            value={String(categoryMeta.lines ?? "")}
            onChange={(e) =>
              setValue("category_meta", {
                ...categoryMeta,
                lines: e.target.value,
              })
            }
            className={selectClass}
          >
            <option value="">בחר</option>
            {megillaLines.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
          )}
        </div>
      )}

      {showPitum && (
        <div className="flex flex-col gap-4 md:col-span-2">
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
            <input
              type="checkbox"
              id="has_lamnatzeach"
              className="size-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
              {...register("has_lamnatzeach")}
            />
            <label htmlFor="has_lamnatzeach" className="text-sm font-semibold text-slate-800 cursor-pointer">
              כולל למנצח
            </label>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold text-slate-800">גודל (ס״מ)</label>
            <select
              value={pitumSelectValue}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "אחר") {
                  setPitumOtherOpen(true);
                  setValue("size", "");
                } else {
                  setPitumOtherOpen(false);
                  setValue("size", v);
                }
              }}
              className={selectClass}
            >
              <option value="">בחר</option>
              <option value="15">15</option>
              <option value="20">20</option>
              <option value="25">25</option>
              <option value="אחר">אחר</option>
            </select>
            {pitumOtherOpen && (
              <input
                type="text"
                placeholder="הזן גודל (ס״מ) או פירוט"
                value={pitumIsPreset ? "" : String(pitumSizeVal)}
                onChange={(e) => setValue("size", e.target.value)}
                className={selectClass}
              />
            )}
          </div>
        </div>
      )}
    </>
  );
}
