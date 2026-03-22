"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ScrollText, Plus, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { MarketTorahBookRow } from "./actions";
import { createMarketTorahBook, deleteMarketTorahBook } from "./actions";
import { UnifiedScribeSelect } from "@/components/crm/UnifiedScribeSelect";

type Props = {
  initialRows: MarketTorahBookRow[];
};

export default function MarketClient({ initialRows }: Props) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  useEffect(() => {
    setRows(initialRows);
  }, [initialRows]);

  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    sofer_id: "",
    external_sofer_name: "",
    style: "",
    size_cm: "",
    parchment_type: "",
    influencer_style: "",
    current_progress: "",
    asking_price: "",
    target_brokerage_price: "",
    expected_completion_date: "",
    notes: "",
  });

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await createMarketTorahBook({
        sofer_id: form.sofer_id || null,
        external_sofer_name: form.external_sofer_name.trim() || null,
        style: form.style.trim() || null,
        size_cm: form.size_cm,
        parchment_type: form.parchment_type.trim() || null,
        influencer_style: form.influencer_style.trim() || null,
        current_progress: form.current_progress.trim() || null,
        asking_price: form.asking_price,
        target_brokerage_price: form.target_brokerage_price,
        currency: "ILS",
        expected_completion_date: form.expected_completion_date || null,
        notes: form.notes.trim() || null,
      });
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      toast.success("הספר נוסף למעקב");
      setForm({
        sofer_id: "",
        external_sofer_name: "",
        style: "",
        size_cm: "",
        parchment_type: "",
        influencer_style: "",
        current_progress: "",
        asking_price: "",
        target_brokerage_price: "",
        expected_completion_date: "",
        notes: "",
      });
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("להסיר את הרשומה מהמעקב?")) return;
    const res = await deleteMarketTorahBook(id);
    if (!res.success) toast.error(res.error);
    else {
      toast.success("הוסר מהמעקב");
      router.refresh();
    }
  }

  function displaySofer(row: MarketTorahBookRow) {
    if (row.sofer_name) return row.sofer_name;
    if (row.external_sofer_name) return row.external_sofer_name;
    return "—";
  }

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8 bg-slate-50/80 min-h-screen">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-sky-700 flex items-center gap-2">
          <ScrollText className="size-7 text-amber-500" />
          רדאר שוק לתיווך
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          מעקב אחר הזדמנויות תיווך (ספרי תורה בשוק) — מחיר דורש מול מחיר יעד לתיווך, לא רכישה למלאי
        </p>
      </div>

      <Card className="mb-8 rounded-2xl border border-sky-100 bg-white shadow-sm">
        <CardContent className="pt-6">
          <h2 className="text-lg font-semibold text-sky-800 mb-4">הוסף הזדמנות תיווך</h2>
          <form onSubmit={handleAdd} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="sm:col-span-2 lg:col-span-3">
              <p className="text-xs text-muted-foreground mb-1">סופר מקושר (CRM)</p>
              <UnifiedScribeSelect
                value={form.sofer_id || null}
                onChange={(s) => setForm((f) => ({ ...f, sofer_id: s?.id ?? "" }))}
                placeholder="— ללא / חיצוני —"
                className="w-full [&>div]:min-h-10 [&>div]:rounded-md"
              />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">שם סופר חיצוני</p>
              <Input
                value={form.external_sofer_name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, external_sofer_name: e.target.value }))
                }
                placeholder="אם אין ב-CRM"
              />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">גודל (ס״מ)</p>
              <Input
                type="number"
                min={0}
                step={0.1}
                value={form.size_cm}
                onChange={(e) => setForm((f) => ({ ...f, size_cm: e.target.value }))}
              />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">סוג קלף</p>
              <Input
                value={form.parchment_type}
                onChange={(e) =>
                  setForm((f) => ({ ...f, parchment_type: e.target.value }))
                }
                placeholder="שליל, עבודת יד..."
              />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">סגנון</p>
              <Input
                value={form.style}
                onChange={(e) => setForm((f) => ({ ...f, style: e.target.value }))}
                placeholder='אריז"ל, חב"ד...'
              />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">השפעה / כתב</p>
              <Input
                value={form.influencer_style}
                onChange={(e) =>
                  setForm((f) => ({ ...f, influencer_style: e.target.value }))
                }
                placeholder="כתב, דוגמה..."
              />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">סטטוס התקדמות</p>
              <Input
                value={form.current_progress}
                onChange={(e) =>
                  setForm((f) => ({ ...f, current_progress: e.target.value }))
                }
                placeholder='אוחז בבראשית...'
              />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">מחיר דורש — מה שהסופר/המוכר מבקש (₪)</p>
              <Input
                type="number"
                min={0}
                step={1}
                value={form.asking_price}
                onChange={(e) => setForm((f) => ({ ...f, asking_price: e.target.value }))}
              />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">מחיר יעד לתיווך — למה מתכוונים להציע (₪)</p>
              <Input
                type="number"
                min={0}
                step={1}
                value={form.target_brokerage_price}
                onChange={(e) =>
                  setForm((f) => ({ ...f, target_brokerage_price: e.target.value }))
                }
              />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">צפי סיום</p>
              <Input
                type="date"
                value={form.expected_completion_date}
                onChange={(e) =>
                  setForm((f) => ({ ...f, expected_completion_date: e.target.value }))
                }
              />
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <p className="text-xs text-muted-foreground mb-1">הערות</p>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={2}
              />
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <Button
                type="submit"
                disabled={loading}
                className="bg-sky-600 hover:bg-sky-700"
              >
                <Plus className="size-4 ml-1" />
                {loading ? "שומר..." : "הוסף לרדאר"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border border-sky-100 bg-white shadow-sm overflow-hidden">
        <CardContent className="p-0 sm:p-6">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/90">
                  <TableHead className="text-right">סופר</TableHead>
                  <TableHead className="text-right hidden md:table-cell">גודל</TableHead>
                  <TableHead className="text-right hidden md:table-cell">סוג קלף</TableHead>
                  <TableHead className="text-right">סגנון</TableHead>
                  <TableHead className="text-right hidden lg:table-cell">השפעה</TableHead>
                  <TableHead className="text-right">התקדמות</TableHead>
                  <TableHead className="text-right">מחיר דורש</TableHead>
                  <TableHead className="text-right hidden sm:table-cell">יעד תיווך</TableHead>
                  <TableHead className="text-right hidden md:table-cell">רווח צפוי</TableHead>
                  <TableHead className="text-right w-[72px]">פעולות</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-muted-foreground py-12">
                      אין רשומות ברדאר. הוסף הזדמנות תיווך מהטופס למעלה.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">{displaySofer(row)}</TableCell>
                      <TableCell className="hidden md:table-cell">
                        {row.size_cm != null ? `${row.size_cm} ס״מ` : "—"}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-muted-foreground">
                        {row.parchment_type ?? "—"}
                      </TableCell>
                      <TableCell className="max-w-[140px] truncate">{row.style ?? "—"}</TableCell>
                      <TableCell className="hidden lg:table-cell max-w-[160px] truncate">
                        {row.influencer_style ?? "—"}
                      </TableCell>
                      <TableCell className="max-w-[180px] text-sm">
                        {row.current_progress ?? "—"}
                      </TableCell>
                      <TableCell className="tabular-nums whitespace-nowrap">
                        {row.asking_price != null
                          ? `${row.asking_price.toLocaleString("he-IL")} ₪`
                          : "—"}
                      </TableCell>
                      <TableCell className="tabular-nums whitespace-nowrap hidden sm:table-cell">
                        {row.target_brokerage_price != null
                          ? `${row.target_brokerage_price.toLocaleString("he-IL")} ₪`
                          : "—"}
                      </TableCell>
                      <TableCell className="tabular-nums whitespace-nowrap hidden md:table-cell text-emerald-700 font-medium">
                        {row.potential_profit != null
                          ? `${row.potential_profit.toLocaleString("he-IL")} ₪`
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => handleDelete(row.id)}
                          aria-label="מחק"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
