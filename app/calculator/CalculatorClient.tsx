"use client";

import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";

const CATEGORIES = [
  { id: "sefer_torah", label: "ספר תורה", scribeSheets: 245, parchmentSheets: 62 },
  { id: "neviim", label: "נביא", scribeSheets: 248, parchmentSheets: 62 },
  { id: "megilla", label: "מגילה", scribeSheets: 4, parchmentSheets: 4 },
  { id: "mezuzah", label: "מזוזה", scribeSheets: 1, parchmentSheets: 1 },
  { id: "parshiot", label: "פרשיות", scribeSheets: 54, parchmentSheets: 54 },
] as const;

type CategoryId = (typeof CATEGORIES)[number]["id"];

function getCategorySheets(categoryId: CategoryId) {
  const c = CATEGORIES.find((x) => x.id === categoryId);
  return c ? { scribeSheets: c.scribeSheets, parchmentSheets: c.parchmentSheets } : { scribeSheets: 245, parchmentSheets: 62 };
}

export default function CalculatorClient() {
  const [category, setCategory] = useState<CategoryId>("sefer_torah");
  const [scribePrice, setScribePrice] = useState<number>(0);
  const [parchment, setParchment] = useState<number>(0);
  const [proofreading, setProofreading] = useState<number>(0);
  const [targetPrice, setTargetPrice] = useState<number>(0);
  const [receipt, setReceipt] = useState(false);

  const { scribeSheets, parchmentSheets } = useMemo(
    () => getCategorySheets(category),
    [category]
  );

  const totalCost = useMemo(() => {
    return scribePrice * scribeSheets + parchment * parchmentSheets + proofreading;
  }, [scribePrice, parchment, proofreading, scribeSheets, parchmentSheets]);

  const expectedProfit = useMemo(() => {
    return targetPrice - totalCost;
  }, [targetPrice, totalCost]);

  return (
    <div className="w-full max-w-screen-xl mx-auto px-4 py-6 sm:py-8 min-w-0 overflow-hidden">
      <div className="mb-6">
        <h1 className="text-3xl sm:text-4xl font-bold text-teal-800 mb-2">מחשבון עלויות</h1>
        <p className="text-muted-foreground">חישוב עלות כוללת ורווח צפוי לפי קטגוריה</p>
      </div>

      <Card className="border-teal-100 rounded-2xl shadow-sm overflow-hidden">
        <CardHeader>
          <h2 className="text-lg font-semibold text-teal-800">פרטי חישוב</h2>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">קטגוריה</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as CategoryId)}
              className="w-full rounded-xl border border-slate-300 px-4 py-2"
            >
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              מחיר סופר ליחידה (₪)
            </label>
            <Input
              type="number"
              value={scribePrice || ""}
              onChange={(e) => setScribePrice(Number(e.target.value) || 0)}
              placeholder="0"
              className="rounded-xl"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {category === "sefer_torah" && `× ${scribeSheets} יחידות = ספר תורה`}
              {category === "neviim" && `× ${scribeSheets} יחידות = נביא`}
              {category === "megilla" && `× ${scribeSheets} יחידות = מגילה`}
              {category === "mezuzah" && `× ${scribeSheets} יחידות = מזוזה`}
              {category === "parshiot" && `× ${scribeSheets} יחידות = פרשיות`}
            </p>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              מחיר קלף ליחידה (₪)
            </label>
            <Input
              type="number"
              value={parchment || ""}
              onChange={(e) => setParchment(Number(e.target.value) || 0)}
              placeholder="0"
              className="rounded-xl"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              × {parchmentSheets} יחידות
            </p>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              הגהה (₪)
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
              מחיר יעד (₪)
            </label>
            <Input
              type="number"
              value={targetPrice || ""}
              onChange={(e) => setTargetPrice(Number(e.target.value) || 0)}
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
        <CardContent className="space-y-4">
          <div className="flex justify-between items-center text-lg">
            <span className="font-medium text-slate-700">עלות כוללת</span>
            <span className="font-bold text-teal-800">{totalCost.toLocaleString("he-IL")} ₪</span>
          </div>
          <div className="flex justify-between items-center text-lg">
            <span className="font-medium text-slate-700">רווח צפוי</span>
            <span
              className={`font-bold ${expectedProfit >= 0 ? "text-green-700" : "text-red-600"}`}
            >
              {expectedProfit.toLocaleString("he-IL")} ₪
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
