"use client";

import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  NEVIIM_DATA,
  PARCHMENT_PRICES,
  SEFER_TORAH_PAGES,
  SEFER_TORAH_YERIOT,
  NEVIIM_LIST,
} from "@/src/lib/constants/stam";

type CalcType = "ספר תורה" | "נביא";

const PARCHMENT_OPTIONS = Object.keys(PARCHMENT_PRICES);

export default function CalculatorClient() {
  const [calcType, setCalcType] = useState<CalcType>("ספר תורה");
  const [scribePricePerPage, setScribePricePerPage] = useState<number>(0);
  const [parchmentManufacturer, setParchmentManufacturer] = useState<string>("");
  const [parchmentPricePerYeria, setParchmentPricePerYeria] = useState<number>(0);
  const [proofreading, setProofreading] = useState<number>(0);
  const [targetSalePrice, setTargetSalePrice] = useState<number>(0);
  const [receipt, setReceipt] = useState(false);
  const [navi, setNavi] = useState<string>("");

  const effectiveParchmentPrice = useMemo(() => {
    if (parchmentManufacturer && PARCHMENT_PRICES[parchmentManufacturer] != null) {
      return parchmentPricePerYeria || PARCHMENT_PRICES[parchmentManufacturer];
    }
    return parchmentPricePerYeria;
  }, [parchmentManufacturer, parchmentPricePerYeria]);

  const { pages, yeriot } = useMemo(() => {
    if (calcType === "ספר תורה") {
      return { pages: SEFER_TORAH_PAGES, yeriot: SEFER_TORAH_YERIOT };
    }
    const data = navi ? NEVIIM_DATA[navi] : null;
    return data
      ? { pages: data.pages, yeriot: data.yeriot }
      : { pages: 0, yeriot: 0 };
  }, [calcType, navi]);

  const totalCost = useMemo(() => {
    return (
      scribePricePerPage * pages +
      effectiveParchmentPrice * yeriot +
      proofreading
    );
  }, [scribePricePerPage, effectiveParchmentPrice, yeriot, proofreading, pages]);

  const netSalePrice = useMemo(() => {
    return receipt ? targetSalePrice * 0.96 : targetSalePrice;
  }, [targetSalePrice, receipt]);

  const profit = useMemo(() => {
    return netSalePrice - totalCost;
  }, [netSalePrice, totalCost]);

  const handleParchmentSelect = (m: string) => {
    setParchmentManufacturer(m);
    if (PARCHMENT_PRICES[m] != null) {
      setParchmentPricePerYeria(PARCHMENT_PRICES[m]);
    }
  };

  return (
    <div className="w-full max-w-screen-xl mx-auto px-4 py-6 sm:py-8 min-w-0 overflow-hidden">
      <div className="mb-6">
        <h1 className="text-3xl sm:text-4xl font-bold text-teal-800 mb-2">מחשבון עלויות</h1>
        <p className="text-muted-foreground">חישוב עלות כוללת ורווח צפוי</p>
      </div>

      <Card className="border-teal-100 rounded-2xl shadow-sm overflow-hidden">
        <CardHeader>
          <h2 className="text-lg font-semibold text-teal-800">פרטי חישוב</h2>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">סוג</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="calcType"
                  checked={calcType === "ספר תורה"}
                  onChange={() => {
                    setCalcType("ספר תורה");
                    setNavi("");
                  }}
                  className="rounded"
                />
                <span>ספר תורה</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="calcType"
                  checked={calcType === "נביא"}
                  onChange={() => setCalcType("נביא")}
                  className="rounded"
                />
                <span>נביא</span>
              </label>
            </div>
          </div>

          {calcType === "נביא" && (
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">נביא</label>
              <select
                value={navi}
                onChange={(e) => setNavi(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-4 py-2"
              >
                <option value="">בחר נביא</option>
                {NEVIIM_LIST.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              מחיר סופר לעמוד (₪)
            </label>
            <Input
              type="number"
              value={scribePricePerPage || ""}
              onChange={(e) => setScribePricePerPage(Number(e.target.value) || 0)}
              placeholder="0"
              className="rounded-xl"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              יצרן קלף
            </label>
            <select
              value={parchmentManufacturer}
              onChange={(e) => handleParchmentSelect(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-2"
            >
              <option value="">בחר יצרן</option>
              {PARCHMENT_OPTIONS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              מחיר קלף ליריעה (₪)
            </label>
            <Input
              type="number"
              value={effectiveParchmentPrice || ""}
              onChange={(e) => setParchmentPricePerYeria(Number(e.target.value) || 0)}
              placeholder="0"
              className="rounded-xl"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              הגהה ותפירה (₪)
            </label>
            <Input
              type="number"
              value={proofreading || ""}
              onChange={(e) => setProofreading(Number(e.target.value) || 0)}
              placeholder="0"
              className="rounded-xl"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              מחיר יעד למכירה (₪)
            </label>
            <Input
              type="number"
              value={targetSalePrice || ""}
              onChange={(e) => setTargetSalePrice(Number(e.target.value) || 0)}
              placeholder="0"
              className="rounded-xl"
            />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="receipt"
              checked={receipt}
              onCheckedChange={(c) => setReceipt(!!c)}
            />
            <label htmlFor="receipt" className="text-sm font-medium cursor-pointer">
              קבלה
            </label>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6 border-teal-200 bg-teal-50/50 rounded-2xl shadow-sm overflow-hidden">
        <CardHeader>
          <h2 className="text-lg font-semibold text-teal-800">תוצאות</h2>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex justify-between items-center text-xl">
            <span className="font-medium text-slate-700">עלות כוללת</span>
            <span className="font-bold text-teal-800 text-2xl">
              {totalCost.toLocaleString("he-IL")} ₪
            </span>
          </div>
          <div className="flex justify-between items-center text-xl">
            <span className="font-medium text-slate-700">רווח נקי</span>
            <span
              className={`font-bold text-2xl ${profit >= 0 ? "text-green-700" : "text-red-600"}`}
            >
              {profit.toLocaleString("he-IL")} ₪
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
