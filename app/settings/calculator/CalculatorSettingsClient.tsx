"use client";

import { useState } from "react";
import { toast } from "sonner";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  saveCalculatorConfig,
  type ParchmentPrice,
  type NeviimData,
} from "./actions";
import { CsvActions } from "@/components/shared/CsvActions";
import { PlusIcon, Trash2Icon, SaveIcon } from "lucide-react";

type Props = {
  initialParchmentPrices: ParchmentPrice[];
  initialNeviimData: NeviimData;
};

export default function CalculatorSettingsClient({
  initialParchmentPrices,
  initialNeviimData,
}: Props) {
  const [parchmentPrices, setParchmentPrices] = useState(initialParchmentPrices);
  const [neviimData, setNeviimData] = useState<Record<string, { pages: number; yeriot: number }>>(
    initialNeviimData
  );
  const [saving, setSaving] = useState(false);

  const addParchment = () => {
    setParchmentPrices((prev) => [...prev, { name: "", price: 0 }]);
  };

  const updateParchment = (index: number, field: "name" | "price", value: string | number) => {
    setParchmentPrices((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const removeParchment = (index: number) => {
    setParchmentPrices((prev) => prev.filter((_, i) => i !== index));
  };

  const updateNevi = (key: string, field: "pages" | "yeriot", value: number) => {
    setNeviimData((prev) => {
      const next = { ...prev };
      if (!next[key]) next[key] = { pages: 0, yeriot: 0 };
      next[key] = { ...next[key], [field]: value };
      return next;
    });
  };

  const addNevi = () => {
    const name = prompt("שם הנביא:");
    if (name?.trim()) {
      setNeviimData((prev) => ({
        ...prev,
        [name.trim()]: { pages: 0, yeriot: 0 },
      }));
    }
  };

  const removeNevi = (key: string) => {
    setNeviimData((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const handleParchmentCsvImport = (rows: Record<string, unknown>[]) => {
    const parsed: ParchmentPrice[] = rows
      .map((r) => {
        const name = String(r["name"] ?? r["Name"] ?? r["שם"] ?? "").trim();
        const price = Number(r["price"] ?? r["Price"] ?? r["מחיר"] ?? 0) || 0;
        return name ? { name, price } : null;
      })
      .filter((p): p is ParchmentPrice => p != null);
    if (parsed.length > 0) {
      setParchmentPrices((prev) => {
        const byName = new Map(prev.map((p) => [p.name, p]));
        for (const p of parsed) byName.set(p.name, p);
        return Array.from(byName.values());
      });
      toast.success(`יובאו ${parsed.length} יצרני קלף`);
    } else {
      toast.error("לא נמצאו שורות תקינות (שם, מחיר)");
    }
  };

  const handleNeviimCsvImport = (rows: Record<string, unknown>[]) => {
    const parsed: Array<{ name: string; pages: number; yeriot: number }> = rows
      .map((r) => {
        const name = String(r["name"] ?? r["Name"] ?? r["שם"] ?? Object.values(r)[0] ?? "").trim();
        const pages = Number(r["pages"] ?? r["Pages"] ?? r["דפים"] ?? 0) || 0;
        const yeriot = Number(r["yeriot"] ?? r["Yeriot"] ?? r["יריעות"] ?? 0) || 0;
        return name ? { name, pages, yeriot } : null;
      })
      .filter((p): p is { name: string; pages: number; yeriot: number } => p != null);
    if (parsed.length > 0) {
      setNeviimData((prev) => {
        const next = { ...prev };
        for (const p of parsed) next[p.name] = { pages: p.pages, yeriot: p.yeriot };
        return next;
      });
      toast.success(`יובאו ${parsed.length} נביאים`);
    } else {
      toast.error("לא נמצאו שורות תקינות (שם, דפים, יריעות)");
    }
  };

  const handleSave = async () => {
    const validParchment = parchmentPrices.filter((p) => p.name.trim());
    if (validParchment.length === 0) {
      toast.error("הוסף לפחות יצרן קלף אחד");
      return;
    }

    setSaving(true);
    const res = await saveCalculatorConfig(validParchment, neviimData);
    setSaving(false);
    if (res.success) {
      toast.success("ההגדרות נשמרו");
    } else {
      toast.error(res.error);
    }
  };

  return (
    <div className="space-y-8">
      <Card className="shadow-sm rounded-xl border-slate-200 bg-white overflow-hidden">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold text-slate-700">מחירון קלף</CardTitle>
              <CardDescription>מחירי יריעות לפי יצרן</CardDescription>
            </div>
            <div className="flex gap-2">
              <CsvActions
                data={parchmentPrices.map((p) => ({ name: p.name, price: p.price }))}
                onImport={handleParchmentCsvImport}
                filename="parchment_prices"
                exportLabel="ייצוא CSV"
                importLabel="ייבוא CSV"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={addParchment}
                className="rounded-xl"
              >
                <PlusIcon className="size-4 ml-1" />
                הוסף יצרן קלף
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/80">
                  <TableHead className="font-semibold">שם</TableHead>
                  <TableHead className="font-semibold">מחיר (₪/יריעה)</TableHead>
                  <TableHead className="w-16 font-semibold">פעולות</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {parchmentPrices.map((p, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <Input
                        value={p.name}
                        onChange={(e) => updateParchment(i, "name", e.target.value)}
                        placeholder="שם יצרן"
                        className="rounded-lg max-w-[180px]"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        value={p.price || ""}
                        onChange={(e) =>
                          updateParchment(i, "price", parseInt(e.target.value, 10) || 0)
                        }
                        placeholder="0"
                        className="rounded-lg max-w-[120px]"
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => removeParchment(i)}
                        className="size-8 text-red-600 hover:bg-red-50"
                      >
                        <Trash2Icon className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-sm rounded-xl border-slate-200 bg-white overflow-hidden">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold text-slate-700">הגדרות נביאים</CardTitle>
              <CardDescription>דפים ויריעות לכל נביא</CardDescription>
            </div>
            <div className="flex gap-2">
              <CsvActions
                data={Object.entries(neviimData).map(([name, v]) => ({
                  name,
                  pages: v.pages,
                  yeriot: v.yeriot,
                }))}
                onImport={handleNeviimCsvImport}
                filename="neviim_data"
                exportLabel="ייצוא CSV"
                importLabel="ייבוא CSV"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={addNevi}
                className="rounded-xl"
              >
                <PlusIcon className="size-4 ml-1" />
                הוסף נביא
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/80">
                  <TableHead className="font-semibold">נביא</TableHead>
                  <TableHead className="font-semibold">דפים</TableHead>
                  <TableHead className="font-semibold">יריעות</TableHead>
                  <TableHead className="w-16 font-semibold">פעולות</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(neviimData).map(([key, val]) => (
                  <TableRow key={key}>
                    <TableCell className="font-medium">{key}</TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        value={val.pages ?? ""}
                        onChange={(e) =>
                          updateNevi(key, "pages", parseInt(e.target.value, 10) || 0)
                        }
                        className="rounded-lg max-w-[100px]"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        value={val.yeriot ?? ""}
                        onChange={(e) =>
                          updateNevi(key, "yeriot", parseInt(e.target.value, 10) || 0)
                        }
                        className="rounded-lg max-w-[100px]"
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => removeNevi(key)}
                        className="size-8 text-red-600 hover:bg-red-50"
                      >
                        <Trash2Icon className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button
          onClick={handleSave}
          disabled={saving}
          className="rounded-xl bg-indigo-600 hover:bg-indigo-700"
        >
          <SaveIcon className="size-4 ml-2" />
          {saving ? "שומר..." : "שמור שינויים"}
        </Button>
        <Link href="/calculator">
          <Button variant="outline" className="rounded-xl">
            חזרה למחשבון
          </Button>
        </Link>
      </div>
    </div>
  );
}
