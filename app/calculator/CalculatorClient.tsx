"use client";

import { useForm } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import type { ParchmentPrice, NeviimData } from "./actions";
import { CalculatorIcon, WalletIcon, TrendingUpIcon } from "lucide-react";
import { useMemo } from "react";

const TORAH_DATA = { pages: 245, yeriot: 62 };

type ProductType = "torah" | "nevi";

type FormValues = {
  productType: ProductType;
  nevi: string;
  scribePricePerPage: number;
  parchmentType: string;
  pricePerYeria: number;
  additionalCosts: number;
  targetSalePrice: number;
  receipt: boolean;
};

type Props = {
  parchmentPrices: ParchmentPrice[];
  neviimData: NeviimData;
};

export default function CalculatorClient({ parchmentPrices, neviimData }: Props) {
  const parchmentMap = useMemo(
    () => Object.fromEntries(parchmentPrices.map((p) => [p.name, p.price])),
    [parchmentPrices]
  );
  const neviimKeys = useMemo(() => Object.keys(neviimData), [neviimData]);
  const firstParchment = parchmentPrices[0];
  const firstNevi = neviimKeys[0];

  const form = useForm<FormValues>({
    defaultValues: {
      productType: "torah",
      nevi: firstNevi ?? "",
      scribePricePerPage: 0,
      parchmentType: firstParchment?.name ?? "",
      pricePerYeria: firstParchment?.price ?? 0,
      additionalCosts: 0,
      targetSalePrice: 0,
      receipt: false,
    },
  });

  const productType = form.watch("productType");
  const nevi = form.watch("nevi");
  const scribePricePerPage = form.watch("scribePricePerPage");
  const parchmentType = form.watch("parchmentType");
  const pricePerYeria = form.watch("pricePerYeria");
  const additionalCosts = form.watch("additionalCosts");
  const targetSalePrice = form.watch("targetSalePrice");
  const receipt = form.watch("receipt");

  const handleParchmentChange = (value: string) => {
    form.setValue("parchmentType", value);
    const price = parchmentMap[value];
    if (price != null) {
      form.setValue("pricePerYeria", price);
    }
  };

  const { pages, yeriot } = useMemo(() => {
    if (productType === "torah") {
      return { pages: TORAH_DATA.pages, yeriot: TORAH_DATA.yeriot };
    }
    const data = neviimData[nevi];
    return data ? { pages: data.pages, yeriot: data.yeriot } : { pages: 0, yeriot: 0 };
  }, [productType, nevi, neviimData]);

  const results = useMemo(() => {
    const totalParchmentCost = yeriot * (pricePerYeria || 0);
    const totalScribeCost = pages * (scribePricePerPage || 0);
    const totalCost = totalParchmentCost + totalScribeCost + (additionalCosts || 0);
    const netSalePrice = receipt ? (targetSalePrice || 0) * 0.96 : (targetSalePrice || 0);
    const netProfit = netSalePrice - totalCost;
    const roi = totalCost > 0 ? (netProfit / totalCost) * 100 : 0;

    return {
      totalParchmentCost,
      totalScribeCost,
      totalCost,
      netSalePrice,
      netProfit,
      roi,
    };
  }, [
    yeriot,
    pricePerYeria,
    pages,
    scribePricePerPage,
    additionalCosts,
    targetSalePrice,
    receipt,
  ]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 w-full max-w-6xl mx-auto">
      <Card className="shadow-sm rounded-xl border-slate-200 bg-white overflow-hidden order-2 lg:order-1">
        <CardHeader>
          <div className="flex items-center gap-2">
            <CalculatorIcon className="w-5 h-5 text-indigo-500" />
            <CardTitle className="text-base font-semibold text-slate-700">הזנת נתונים</CardTitle>
          </div>
          <CardDescription>בחר סוג מוצר, קלף ועלויות</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold text-slate-800">סוג מוצר</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => form.setValue("productType", "torah")}
                className={`flex-1 rounded-xl border px-4 py-2.5 text-sm font-medium transition-all ${
                  productType === "torah"
                    ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                ספר תורה
              </button>
              <button
                type="button"
                onClick={() => form.setValue("productType", "nevi")}
                className={`flex-1 rounded-xl border px-4 py-2.5 text-sm font-medium transition-all ${
                  productType === "nevi"
                    ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                נביא
              </button>
            </div>
          </div>

          {productType === "nevi" && neviimKeys.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-semibold text-slate-800">נביא</label>
              <select
                value={nevi}
                onChange={(e) => form.setValue("nevi", e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white shadow-sm px-3 py-2.5 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              >
                {neviimKeys.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold text-slate-800">
              מחיר סופר לעמוד (₪)
            </label>
            <Input
              type="number"
              min={0}
              step={1}
              {...form.register("scribePricePerPage", { valueAsNumber: true })}
              placeholder="0"
              className="rounded-xl"
            />
          </div>

          {parchmentPrices.length > 0 && (
            <>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-semibold text-slate-800">סוג קלף</label>
                <select
                  value={parchmentType}
                  onChange={(e) => handleParchmentChange(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white shadow-sm px-3 py-2.5 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                >
                  {parchmentPrices.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.name} ({p.price} ₪/יריעה)
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-semibold text-slate-800">
                  מחיר ליריעה (₪) – ניתן לעריכה
                </label>
                <Input
                  type="number"
                  min={0}
                  step={1}
                  {...form.register("pricePerYeria", { valueAsNumber: true })}
                  placeholder="0"
                  className="rounded-xl"
                />
              </div>
            </>
          )}

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold text-slate-800">
              עלויות נוספות (₪) – הגהה, תפירה וכו׳
            </label>
            <Input
              type="number"
              min={0}
              step={1}
              {...form.register("additionalCosts", { valueAsNumber: true })}
              placeholder="0"
              className="rounded-xl"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold text-slate-800">
              מחיר סופי ללקוח (₪)
            </label>
            <Input
              type="number"
              min={0}
              step={1}
              {...form.register("targetSalePrice", { valueAsNumber: true })}
              placeholder="0"
              className="rounded-xl"
            />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="receipt"
              checked={receipt}
              onCheckedChange={(checked) => form.setValue("receipt", !!checked)}
            />
            <label
              htmlFor="receipt"
              className="text-sm font-medium text-slate-700 cursor-pointer"
            >
              קבלה (ניכוי 4%)
            </label>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-sm rounded-xl border-slate-200 bg-white overflow-hidden order-1 lg:order-2">
        <CardHeader>
          <div className="flex items-center gap-2">
            <WalletIcon className="w-5 h-5 text-emerald-500" />
            <CardTitle className="text-base font-semibold text-slate-700">תוצאות</CardTitle>
          </div>
          <CardDescription>פירוט עלויות ורווח</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">עלות קלף</span>
              <span className="font-medium">{results.totalParchmentCost.toLocaleString("he-IL")} ₪</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">עלות סופר</span>
              <span className="font-medium">{results.totalScribeCost.toLocaleString("he-IL")} ₪</span>
            </div>
            <div className="flex justify-between text-sm font-semibold border-t border-slate-200 pt-3">
              <span>הון נדרש</span>
              <span>{results.totalCost.toLocaleString("he-IL")} ₪</span>
            </div>
          </div>

          <div className="rounded-xl bg-slate-50/80 p-4 space-y-2">
            <p className="text-xs text-muted-foreground">
              {receipt ? "מחיר נטו (אחרי ניכוי 4%)" : "מחיר מכירה"}
            </p>
            <p className="text-lg font-medium">
              {results.netSalePrice.toLocaleString("he-IL")} ₪
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <TrendingUpIcon className="w-5 h-5 text-slate-500" />
              <span className="text-sm font-medium text-slate-700">רווח</span>
            </div>
            <p
              className={`text-4xl font-bold ${
                results.netProfit >= 0 ? "text-emerald-600" : "text-red-600"
              }`}
            >
              {results.netProfit.toLocaleString("he-IL")} ₪
            </p>
          </div>

          <div className="space-y-2">
            <span className="text-sm font-medium text-slate-700">אחוז תשואה (ROI)</span>
            <p
              className={`text-4xl font-bold ${
                results.roi >= 0 ? "text-emerald-600" : "text-red-600"
              }`}
            >
              {results.roi.toFixed(1)}%
            </p>
          </div>

          <p className="text-xs text-muted-foreground pt-2">
            {pages} עמודים • {yeriot} יריעות
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
