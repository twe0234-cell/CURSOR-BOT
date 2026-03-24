"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ScrollText, Plus, Trash2, ImageIcon, X, PencilIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { MarketTorahBookRow } from "./actions";
import {
  createMarketTorahBook,
  updateMarketTorahBook,
  deleteMarketTorahBook,
  uploadHandwritingSample,
} from "./actions";
import { UnifiedScribeSelect } from "@/components/crm/UnifiedScribeSelect";
import { UnifiedDealerSelect } from "@/components/crm/UnifiedDealerSelect";
import { formatMarketPriceK } from "@/lib/market/kPricing";
import { isLikelyImageFile } from "@/lib/broadcast/imageFile";
import { applyNumericTransform } from "@/lib/numericInput";

function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}

type Props = {
  initialRows: MarketTorahBookRow[];
};

function displayOwner(row: MarketTorahBookRow): string {
  if (row.dealer_id && row.dealer_name) return row.dealer_name;
  if (row.sofer_name) return row.sofer_name;
  if (row.external_sofer_name) return row.external_sofer_name;
  return "—";
}

/** SKU badge — subtle, visible only on hover for privacy during screenshots */
function SkuBadge({ sku }: { sku: string | null }) {
  if (!sku) return null;
  return (
    <span
      className="font-mono text-[10px] text-slate-300 opacity-30 hover:opacity-80 transition-opacity select-all cursor-default whitespace-nowrap"
      title={sku}
    >
      {sku}
    </span>
  );
}

const emptyForm = () => ({
  sofer_id: "",
  dealer_id: null as string | null,
  style: "",
  size_cm: "",
  parchment_type: "",
  influencer_style: "",
  current_progress: "",
  asking_price: "",
  target_brokerage_price: "",
  last_contact_date: todayISODate(),
  expected_completion_date: "",
  notes: "",
  negotiation_notes: "",
});

export default function MarketClient({ initialRows }: Props) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  useEffect(() => {
    setRows(initialRows);
  }, [initialRows]);

  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState(emptyForm());

  // Edit mode state
  const [editRow, setEditRow] = useState<MarketTorahBookRow | null>(null);
  const [editForm, setEditForm] = useState(emptyForm());
  const [editHwUrl, setEditHwUrl] = useState<string>("");
  const [editHwPreview, setEditHwPreview] = useState<string>("");
  const [editHwUploading, setEditHwUploading] = useState(false);
  const editHwInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editRow) return;
    setEditForm({
      sofer_id: editRow.sofer_id ?? "",
      dealer_id: editRow.dealer_id ?? null,
      style: editRow.style ?? "",
      size_cm: editRow.size_cm != null ? String(editRow.size_cm) : "",
      parchment_type: editRow.parchment_type ?? "",
      influencer_style: editRow.influencer_style ?? "",
      current_progress: editRow.current_progress ?? "",
      asking_price: editRow.asking_price != null ? String(editRow.asking_price) : "",
      target_brokerage_price:
        editRow.target_brokerage_price != null ? String(editRow.target_brokerage_price) : "",
      last_contact_date: editRow.last_contact_date ?? todayISODate(),
      expected_completion_date: editRow.expected_completion_date ?? "",
      notes: editRow.notes ?? "",
      negotiation_notes: editRow.negotiation_notes ?? "",
    });
    setEditHwUrl(editRow.handwriting_image_url ?? "");
    setEditHwPreview(editRow.handwriting_image_url ?? "");
  }, [editRow]);

  const handleEditHwFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("הקובץ חורג ממגבלת 5MB");
      e.target.value = "";
      return;
    }
    setEditHwUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await uploadHandwritingSample(fd);
      if (res.success) {
        setEditHwUrl(res.url);
        setEditHwPreview(URL.createObjectURL(file));
        toast.success("דוגמת הכתב הועלתה");
      } else {
        toast.error(res.error || "שגיאה בהעלאה");
      }
    } catch {
      toast.error("שגיאה בהעלאת הקובץ");
    } finally {
      setEditHwUploading(false);
      e.target.value = "";
    }
  };

  /* handwriting image */
  const [hwFile, setHwFile] = useState<File | null>(null);
  const [hwPreview, setHwPreview] = useState<string>("");
  const [hwUrl, setHwUrl] = useState<string>("");
  const [hwUploading, setHwUploading] = useState(false);
  const hwInputRef = useRef<HTMLInputElement>(null);

  const handleHwFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!isLikelyImageFile(file)) {
      toast.error("נא לבחור קובץ תמונה");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("הקובץ חורג ממגבלת 5MB");
      e.target.value = "";
      return;
    }
    setHwFile(file);
    setHwPreview(URL.createObjectURL(file));
    setHwUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await uploadHandwritingSample(fd);
      if (res.success) {
        setHwUrl(res.url);
        toast.success("דוגמת הכתב הועלתה");
      } else {
        toast.error(res.error || "שגיאה בהעלאה");
        setHwFile(null);
        setHwPreview("");
      }
    } catch {
      toast.error("שגיאה בהעלאת הקובץ");
      setHwFile(null);
      setHwPreview("");
    } finally {
      setHwUploading(false);
      e.target.value = "";
    }
  };

  const clearHw = () => {
    setHwFile(null);
    setHwPreview("");
    setHwUrl("");
    if (hwInputRef.current) hwInputRef.current.value = "";
  };

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (hwFile && !hwUrl && !hwUploading) {
      toast.error("ממתין לסיום העלאת דוגמת הכתב");
      return;
    }
    setLoading(true);
    try {
      const res = await createMarketTorahBook({
        sofer_id: form.sofer_id || null,
        dealer_id: form.dealer_id || null,
        style: form.style.trim() || null,
        size_cm: form.size_cm,
        parchment_type: form.parchment_type.trim() || null,
        influencer_style: form.influencer_style.trim() || null,
        current_progress: form.current_progress.trim() || null,
        asking_price: form.asking_price,
        target_brokerage_price: form.target_brokerage_price,
        currency: "ILS",
        last_contact_date: form.last_contact_date || null,
        expected_completion_date: form.expected_completion_date || null,
        notes: form.notes.trim() || null,
        negotiation_notes: form.negotiation_notes.trim() || null,
        handwriting_image_url: hwUrl || null,
      });
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      toast.success("הרשומה נוספה למאגר");
      setForm(emptyForm());
      clearHw();
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("להסיר את הרשומה מהמאגר?")) return;
    const res = await deleteMarketTorahBook(id);
    if (!res.success) toast.error(res.error);
    else {
      toast.success("הוסר מהמאגר");
      router.refresh();
    }
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editRow) return;
    if (editHwUploading) {
      toast.error("ממתין לסיום העלאת דוגמת הכתב");
      return;
    }
    setLoading(true);
    try {
      const res = await updateMarketTorahBook(editRow.id, {
        sofer_id: editForm.sofer_id || null,
        dealer_id: editForm.dealer_id || null,
        style: editForm.style.trim() || null,
        size_cm: editForm.size_cm,
        parchment_type: editForm.parchment_type.trim() || null,
        influencer_style: editForm.influencer_style.trim() || null,
        current_progress: editForm.current_progress.trim() || null,
        asking_price: editForm.asking_price,
        target_brokerage_price: editForm.target_brokerage_price,
        currency: "ILS",
        last_contact_date: editForm.last_contact_date || null,
        expected_completion_date: editForm.expected_completion_date || null,
        notes: editForm.notes.trim() || null,
        negotiation_notes: editForm.negotiation_notes.trim() || null,
        handwriting_image_url: editHwUrl || null,
      });
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      toast.success("הרשומה עודכנה");
      setEditRow(null);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  const priceInputWrap =
    "flex items-center gap-2 rounded-md border border-input bg-background px-2";
  const priceSuffix = (
    <span className="shrink-0 text-xs font-medium text-muted-foreground whitespace-nowrap">
      אל״ש
    </span>
  );

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8 bg-slate-50/80 min-h-screen">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-sky-700 flex items-center gap-2">
          <ScrollText className="size-7 text-amber-500" />
          מאגר ספרי תורה
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          מעקב תיווך — מחירים בטופס באלפי שקלים (אל״ש). אם נבחר סוחר הוא
          הבעלים; אחרת הבעלים הוא הסופר.
        </p>
      </div>

      <Card className="mb-8 rounded-2xl border border-sky-100 bg-white shadow-sm">
        <CardContent className="pt-6">
          <h2 className="text-lg font-semibold text-sky-800 mb-4">
            הוספה למאגר
          </h2>
          <form
            onSubmit={handleAdd}
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
          >
            {/* Sofer */}
            <div className="sm:col-span-2 lg:col-span-3">
              <p className="text-xs text-muted-foreground mb-1">סופר (CRM)</p>
              <UnifiedScribeSelect
                value={form.sofer_id || null}
                onChange={(s) =>
                  setForm((f) => ({ ...f, sofer_id: s?.id ?? "" }))
                }
                placeholder="בחר סופר"
                className="w-full [&>div]:min-h-10 [&>div]:rounded-md"
              />
            </div>

            {/* Dealer */}
            <div className="sm:col-span-2 lg:col-span-3">
              <p className="text-xs text-muted-foreground mb-1">
                סוחר (CRM) — אם נבחר, הוא הבעלים
              </p>
              <UnifiedDealerSelect
                value={form.dealer_id}
                onChange={(d) =>
                  setForm((f) => ({ ...f, dealer_id: d?.id ?? null }))
                }
                placeholder="— ללא (הבעלים = הסופר) —"
                className="w-full [&>div]:min-h-10 [&>div]:rounded-md"
              />
            </div>

            {/* Size */}
            <div>
              <p className="text-xs text-muted-foreground mb-1">גודל (ס״מ)</p>
              <Input
                type="number"
                min={0}
                step={0.1}
                value={form.size_cm}
                onChange={(e) =>
                  setForm((f) => ({ ...f, size_cm: applyNumericTransform(e.target.value) }))
                }
              />
            </div>

            {/* Parchment */}
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

            {/* Style */}
            <div>
              <p className="text-xs text-muted-foreground mb-1">סגנון</p>
              <Input
                value={form.style}
                onChange={(e) =>
                  setForm((f) => ({ ...f, style: e.target.value }))
                }
                placeholder='אריז"ל, חב"ד...'
              />
            </div>

            {/* Progress */}
            <div>
              <p className="text-xs text-muted-foreground mb-1">
                סטטוס התקדמות
              </p>
              <Input
                value={form.current_progress}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    current_progress: e.target.value,
                  }))
                }
                placeholder="אוחז בבראשית..."
              />
            </div>

            {/* Asking price */}
            <div>
              <p className="text-xs text-muted-foreground mb-1">
                מחיר דורש (באלפי ₪)
              </p>
              <div className={priceInputWrap}>
                <Input
                  type="number"
                  min={0}
                  step={0.1}
                  className="border-0 shadow-none focus-visible:ring-0 px-0"
                  value={form.asking_price}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, asking_price: applyNumericTransform(e.target.value) }))
                  }
                />
                {priceSuffix}
              </div>
            </div>

            {/* Target brokerage price */}
            <div>
              <p className="text-xs text-muted-foreground mb-1">
                מחיר יעד לתיווך (באלפי ₪)
              </p>
              <div className={priceInputWrap}>
                <Input
                  type="number"
                  min={0}
                  step={0.1}
                  className="border-0 shadow-none focus-visible:ring-0 px-0"
                  value={form.target_brokerage_price}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      target_brokerage_price: applyNumericTransform(e.target.value),
                    }))
                  }
                />
                {priceSuffix}
              </div>
            </div>

            {/* Last contact date */}
            <div>
              <p className="text-xs text-muted-foreground mb-1">
                תאריך קשר אחרון
              </p>
              <Input
                type="date"
                value={form.last_contact_date}
                onChange={(e) =>
                  setForm((f) => ({ ...f, last_contact_date: e.target.value }))
                }
              />
            </div>

            {/* Expected completion */}
            <div>
              <p className="text-xs text-muted-foreground mb-1">צפי סיום</p>
              <Input
                type="date"
                value={form.expected_completion_date}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    expected_completion_date: e.target.value,
                  }))
                }
              />
            </div>

            {/* Handwriting sample upload */}
            <div className="sm:col-span-2 lg:col-span-3">
              <p className="text-xs text-muted-foreground mb-1">דוגמת כתב</p>
              <div className="flex items-start gap-3">
                <label
                  className={`flex items-center gap-2 cursor-pointer rounded-md border border-dashed border-sky-300 bg-sky-50 px-3 py-2 text-sm text-sky-700 hover:bg-sky-100 transition-colors ${hwUploading ? "opacity-50 pointer-events-none" : ""}`}
                >
                  <ImageIcon className="size-4 shrink-0" />
                  {hwUploading
                    ? "מעלה..."
                    : hwFile
                      ? "החלף תמונה"
                      : "העלה תמונה"}
                  <input
                    ref={hwInputRef}
                    type="file"
                    accept="image/*,.heic,.heif"
                    className="hidden"
                    onChange={handleHwFileChange}
                    disabled={hwUploading}
                  />
                </label>
                {hwPreview && (
                  <div className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={hwPreview}
                      alt="דוגמת כתב"
                      className="h-14 w-14 rounded-md object-cover border border-slate-200"
                    />
                    <button
                      type="button"
                      onClick={clearHw}
                      className="absolute -top-1.5 -right-1.5 rounded-full bg-red-500 text-white size-4 flex items-center justify-center hover:bg-red-600"
                      aria-label="הסר"
                    >
                      <X className="size-2.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Notes */}
            <div className="sm:col-span-2 lg:col-span-3">
              <p className="text-xs text-muted-foreground mb-1">הערות</p>
              <Textarea
                value={form.notes}
                onChange={(e) =>
                  setForm((f) => ({ ...f, notes: e.target.value }))
                }
                rows={2}
              />
            </div>

            {/* Negotiation notes */}
            <div className="sm:col-span-2 lg:col-span-3">
              <p className="text-xs text-muted-foreground mb-1">
                הערות / יומן משא ומתן (גמישות מחיר וכו׳)
              </p>
              <Textarea
                value={form.negotiation_notes}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    negotiation_notes: e.target.value,
                  }))
                }
                rows={3}
                placeholder="תיעוד שיחות, תנאים, גמישות..."
              />
            </div>

            <div className="sm:col-span-2 lg:col-span-3">
              <Button
                type="submit"
                disabled={loading || hwUploading}
                className="bg-sky-600 hover:bg-sky-700"
              >
                <Plus className="size-4 ml-1" />
                {loading ? "שומר..." : "הוסף למאגר"}
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
                  <TableHead className="text-right">בעלים</TableHead>
                  <TableHead className="text-right hidden sm:table-cell">
                    סופר
                  </TableHead>
                  <TableHead className="text-right hidden md:table-cell">
                    סוחר
                  </TableHead>
                  <TableHead className="text-right hidden lg:table-cell">
                    קשר אחרון
                  </TableHead>
                  <TableHead className="text-right hidden md:table-cell">
                    גודל
                  </TableHead>
                  <TableHead className="text-right hidden lg:table-cell">
                    סוג קלף
                  </TableHead>
                  <TableHead className="text-right">סגנון</TableHead>
                  <TableHead className="text-right hidden xl:table-cell">
                    התקדמות
                  </TableHead>
                  <TableHead className="text-right hidden sm:table-cell">
                    כתב
                  </TableHead>
                  <TableHead className="text-right">מחיר דורש</TableHead>
                  <TableHead className="text-right hidden sm:table-cell">
                    יעד תיווך
                  </TableHead>
                  <TableHead className="text-right hidden md:table-cell">
                    רווח צפוי
                  </TableHead>
                  <TableHead className="text-right w-[72px]">פעולות</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={13}
                      className="text-center text-muted-foreground py-12"
                    >
                      אין רשומות במאגר. הוסף רשומה מהטופס למעלה.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium max-w-[120px]">
                        <div className="truncate">{displayOwner(row)}</div>
                        <SkuBadge sku={row.sku} />
                      </TableCell>
                      <TableCell className="hidden sm:table-cell max-w-[100px] truncate">
                        {row.sofer_name ?? "—"}
                      </TableCell>
                      <TableCell className="hidden md:table-cell max-w-[100px] truncate">
                        {row.dealer_name ?? "—"}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-sm text-muted-foreground whitespace-nowrap">
                        {row.last_contact_date
                          ? new Date(row.last_contact_date).toLocaleDateString(
                              "he-IL"
                            )
                          : "—"}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {row.size_cm != null ? `${row.size_cm} ס״מ` : "—"}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-muted-foreground max-w-[100px] truncate">
                        {row.parchment_type ?? "—"}
                      </TableCell>
                      <TableCell className="max-w-[120px] truncate">
                        {row.style ?? "—"}
                      </TableCell>
                      <TableCell className="hidden xl:table-cell max-w-[140px] truncate text-sm">
                        {row.current_progress ?? "—"}
                      </TableCell>
                      {/* Handwriting sample thumbnail */}
                      <TableCell className="hidden sm:table-cell">
                        {row.handwriting_image_url ? (
                          <a
                            href={row.handwriting_image_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="דוגמת כתב"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={row.handwriting_image_url}
                              alt="דוגמת כתב"
                              className="h-8 w-8 rounded object-cover border border-slate-200 hover:scale-110 transition-transform"
                            />
                          </a>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell className="tabular-nums whitespace-nowrap text-sm">
                        {formatMarketPriceK(row.asking_price)}
                      </TableCell>
                      <TableCell className="tabular-nums whitespace-nowrap hidden sm:table-cell text-sm">
                        {formatMarketPriceK(row.target_brokerage_price)}
                      </TableCell>
                      <TableCell className="tabular-nums whitespace-nowrap hidden md:table-cell text-sm text-emerald-700 font-medium">
                        {formatMarketPriceK(row.potential_profit)}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="text-sky-600 hover:text-sky-700 hover:bg-sky-50"
                            onClick={() => setEditRow(row)}
                            aria-label="ערוך"
                          >
                            <PencilIcon className="size-4" />
                          </Button>
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
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ── Edit Dialog ─────────────────────────────────────────────────── */}
      <Dialog open={!!editRow} onOpenChange={(o) => !o && setEditRow(null)}>
        <DialogContent className="sm:max-w-2xl rounded-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>עריכת רשומה</DialogTitle>
          </DialogHeader>
          {editRow && (
            <form onSubmit={handleSaveEdit} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="sm:col-span-2 lg:col-span-3">
                <p className="text-xs text-muted-foreground mb-1">סופר (CRM)</p>
                <UnifiedScribeSelect
                  value={editForm.sofer_id || null}
                  onChange={(s) => setEditForm((f) => ({ ...f, sofer_id: s?.id ?? "" }))}
                  placeholder="בחר סופר"
                  className="w-full [&>div]:min-h-10 [&>div]:rounded-md"
                />
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <p className="text-xs text-muted-foreground mb-1">סוחר (CRM)</p>
                <UnifiedDealerSelect
                  value={editForm.dealer_id}
                  onChange={(d) => setEditForm((f) => ({ ...f, dealer_id: d?.id ?? null }))}
                  placeholder="— ללא —"
                  className="w-full [&>div]:min-h-10 [&>div]:rounded-md"
                />
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">גודל (ס״מ)</p>
                <Input
                  type="number"
                  min={0}
                  step={0.1}
                  value={editForm.size_cm}
                  onChange={(e) => setEditForm((f) => ({ ...f, size_cm: applyNumericTransform(e.target.value) }))}
                />
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">סוג קלף</p>
                <Input
                  value={editForm.parchment_type}
                  onChange={(e) => setEditForm((f) => ({ ...f, parchment_type: e.target.value }))}
                />
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">סגנון</p>
                <Input
                  value={editForm.style}
                  onChange={(e) => setEditForm((f) => ({ ...f, style: e.target.value }))}
                />
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">סטטוס התקדמות</p>
                <Input
                  value={editForm.current_progress}
                  onChange={(e) => setEditForm((f) => ({ ...f, current_progress: e.target.value }))}
                />
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">מחיר דורש (אל״ש)</p>
                <Input
                  type="number"
                  min={0}
                  step={0.1}
                  value={editForm.asking_price}
                  onChange={(e) => setEditForm((f) => ({ ...f, asking_price: applyNumericTransform(e.target.value) }))}
                />
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">מחיר יעד לתיווך (אל״ש)</p>
                <Input
                  type="number"
                  min={0}
                  step={0.1}
                  value={editForm.target_brokerage_price}
                  onChange={(e) => setEditForm((f) => ({ ...f, target_brokerage_price: applyNumericTransform(e.target.value) }))}
                />
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">תאריך קשר אחרון</p>
                <Input
                  type="date"
                  value={editForm.last_contact_date}
                  onChange={(e) => setEditForm((f) => ({ ...f, last_contact_date: e.target.value }))}
                />
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">צפי סיום</p>
                <Input
                  type="date"
                  value={editForm.expected_completion_date}
                  onChange={(e) => setEditForm((f) => ({ ...f, expected_completion_date: e.target.value }))}
                />
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <p className="text-xs text-muted-foreground mb-1">דוגמת כתב</p>
                <div className="flex items-start gap-3">
                  <label
                    className={`flex items-center gap-2 cursor-pointer rounded-md border border-dashed border-sky-300 bg-sky-50 px-3 py-2 text-sm text-sky-700 hover:bg-sky-100 transition-colors ${editHwUploading ? "opacity-50 pointer-events-none" : ""}`}
                  >
                    <ImageIcon className="size-4 shrink-0" />
                    {editHwUploading ? "מעלה..." : editHwPreview ? "החלף תמונה" : "העלה תמונה"}
                    <input
                      ref={editHwInputRef}
                      type="file"
                      accept="image/*,.heic,.heif"
                      className="hidden"
                      onChange={handleEditHwFileChange}
                      disabled={editHwUploading}
                    />
                  </label>
                  {editHwPreview && (
                    <div className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={editHwPreview}
                        alt="דוגמת כתב"
                        className="h-14 w-14 rounded-md object-cover border border-slate-200"
                      />
                      <button
                        type="button"
                        onClick={() => { setEditHwUrl(""); setEditHwPreview(""); }}
                        className="absolute -top-1.5 -right-1.5 rounded-full bg-red-500 text-white size-4 flex items-center justify-center hover:bg-red-600"
                        aria-label="הסר"
                      >
                        <X className="size-2.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <p className="text-xs text-muted-foreground mb-1">הערות</p>
                <Textarea
                  value={editForm.notes}
                  onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={2}
                />
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <p className="text-xs text-muted-foreground mb-1">יומן משא ומתן</p>
                <Textarea
                  value={editForm.negotiation_notes}
                  onChange={(e) => setEditForm((f) => ({ ...f, negotiation_notes: e.target.value }))}
                  rows={3}
                />
              </div>
              <div className="sm:col-span-2 lg:col-span-3 flex gap-2">
                <Button
                  type="submit"
                  disabled={loading || editHwUploading}
                  className="bg-sky-600 hover:bg-sky-700"
                >
                  {loading ? "שומר..." : "שמור שינויים"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditRow(null)}
                >
                  ביטול
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
