"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ScrollText, Plus, Trash2, ImageIcon, X, PencilIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useViewMode } from "@/lib/hooks/useViewMode";
import { ViewToggle } from "@/app/components/ViewToggle";
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
} from "./actions";
import { UnifiedScribeSelect } from "@/components/crm/UnifiedScribeSelect";
import { UnifiedDealerSelect } from "@/components/crm/UnifiedDealerSelect";
// formatMarketPriceK is intentionally NOT imported here.
// mapBookRow in actions.ts already converts DB prices → K units before they
// reach this component, so dividing by 1000 again would produce 0.175 instead
// of 175. Use formatDisplayK (below) for values that are already in K.
import { isLikelyImageFile } from "@/lib/broadcast/imageFile";
import { applyNumericTransform } from "@/lib/numericInput";
import {
  STAM_SEFER_TORAH_SIZES,
  MARKET_PARCHMENT_TYPES,
  STAM_SCRIPT_TYPES,
} from "@/src/lib/stam/catalog";

/** קבוצת המאגר הצפויה — להשוואה מול ההגדרות */
const EXPECTED_WA_MARKET_GROUP_ID = "120363422255767258@g.us";

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

/** Values arrive already in K-units from mapBookRow — no division needed. */
const formatK = (val: number | null | undefined): string => {
  if (val == null) return "—";
  const s = Number.isInteger(val)
    ? val.toLocaleString("he-IL")
    : val.toLocaleString("he-IL", { maximumFractionDigits: 2 });
  return `${s} אל"ש`;
};

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

const selectClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

const emptyForm = () => ({
  sofer_id: "",
  dealer_id: null as string | null,
  script_type: "",
  torah_size: "",
  parchment_type: "",
  influencer_style: "",
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

  // ── Filters ──────────────────────────────────────────────────────────────
  const [filterText, setFilterText] = useState("");
  const [filterParchment, setFilterParchment] = useState("");
  const [filterTorahSize, setFilterTorahSize] = useState("");
  const [viewMode, setViewMode] = useViewMode("market");

  const parchmentOptions = [...new Set(
    rows.map((r) => r.parchment_type).filter(Boolean) as string[]
  )].sort();

  const filteredRows = rows.filter((row) => {
    if (filterText) {
      const q = filterText.toLowerCase();
      const hit = [row.sofer_name, row.dealer_name, row.external_sofer_name, row.script_type]
        .some((v) => v?.toLowerCase().includes(q));
      if (!hit) return false;
    }
    if (filterParchment && row.parchment_type !== filterParchment) return false;
    if (filterTorahSize && row.torah_size !== filterTorahSize) return false;
    return true;
  });
  // ─────────────────────────────────────────────────────────────────────────

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
      script_type: editRow.script_type ?? "",
      torah_size: editRow.torah_size ?? "",
      parchment_type: editRow.parchment_type ?? "",
      influencer_style: editRow.influencer_style ?? "",
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
      const res = await fetch("/api/market/upload", { method: "POST", body: fd });
      const json = await res.json() as { url?: string; error?: string };
      if (res.ok && json.url) {
        setEditHwUrl(json.url);
        setEditHwPreview(URL.createObjectURL(file));
        toast.success("דוגמת הכתב הועלתה");
      } else {
        toast.error(json.error || "שגיאה בהעלאה");
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
      const res = await fetch("/api/market/upload", { method: "POST", body: fd });
      const json = await res.json() as { url?: string; error?: string };
      if (res.ok && json.url) {
        setHwUrl(json.url);
        toast.success("דוגמת הכתב הועלתה");
      } else {
        toast.error(json.error || "שגיאה בהעלאה");
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
        script_type: form.script_type.trim() || null,
        torah_size: form.torah_size.trim() || null,
        parchment_type: form.parchment_type.trim() || null,
        influencer_style: form.influencer_style.trim() || null,
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
        script_type: editForm.script_type.trim() || null,
        torah_size: editForm.torah_size.trim() || null,
        parchment_type: editForm.parchment_type.trim() || null,
        influencer_style: editForm.influencer_style.trim() || null,
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
    <div className="container mx-auto max-w-6xl px-4 py-8 min-h-screen">
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

      <Card className="mb-8 rounded-2xl border border-border bg-card shadow-sm">
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

            {/* Torah size (inventory codes) */}
            <div>
              <p className="text-xs text-muted-foreground mb-1">גודל ס״ת</p>
              <select
                value={form.torah_size}
                onChange={(e) => setForm((f) => ({ ...f, torah_size: e.target.value }))}
                className={selectClass}
              >
                <option value="">— לא צוין —</option>
                {STAM_SEFER_TORAH_SIZES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            {/* Parchment */}
            <div>
              <p className="text-xs text-muted-foreground mb-1">סוג קלף</p>
              <select
                value={form.parchment_type}
                onChange={(e) => setForm((f) => ({ ...f, parchment_type: e.target.value }))}
                className={selectClass}
              >
                <option value="">— לא צוין —</option>
                {MARKET_PARCHMENT_TYPES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>

            {/* Script (כתב) */}
            <div>
              <p className="text-xs text-muted-foreground mb-1">כתב</p>
              <select
                value={form.script_type}
                onChange={(e) => setForm((f) => ({ ...f, script_type: e.target.value }))}
                className={selectClass}
              >
                <option value="">— לא צוין —</option>
                {STAM_SCRIPT_TYPES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
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
                      className="h-14 w-14 rounded-md object-cover border border-border"
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

      {/* ── Filter bar ─────────────────────────────────────────────────── */}
      <div className="mb-4 flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[180px]">
          <p className="text-xs text-muted-foreground mb-1">חיפוש (סוחר / סופר / כתב)</p>
          <Input
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="חיפוש חופשי..."
            className="h-9"
          />
        </div>
        <div className="min-w-[150px]">
          <p className="text-xs text-muted-foreground mb-1">סוג קלף</p>
          <select
            value={filterParchment}
            onChange={(e) => setFilterParchment(e.target.value)}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="">הכל</option>
            {parchmentOptions.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
        <div className="min-w-[120px]">
          <p className="text-xs text-muted-foreground mb-1">גודל ס״ת</p>
          <select
            value={filterTorahSize}
            onChange={(e) => setFilterTorahSize(e.target.value)}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="">הכל</option>
            {STAM_SEFER_TORAH_SIZES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        {(filterText || filterParchment || filterTorahSize) && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 self-end text-slate-500"
            onClick={() => { setFilterText(""); setFilterParchment(""); setFilterTorahSize(""); }}
          >
            <X className="size-3.5 ml-1" />
            נקה
          </Button>
        )}
        {filteredRows.length !== rows.length && (
          <span className="self-end text-xs text-muted-foreground pb-1.5">
            {filteredRows.length} / {rows.length} רשומות
          </span>
        )}
        <ViewToggle mode={viewMode} onChange={setViewMode} className="self-end" />
      </div>

      {viewMode === "grid" ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredRows.map((row, i) => (
            <div key={row.id} className={cn("animate-scale-in", i < 12 && `stagger-${Math.min(i + 1, 8) as 1|2|3|4|5|6|7|8}`)}>
              <Card className="border-border bg-card card-interactive overflow-hidden">
                <div
                  className="relative h-40 bg-muted flex items-center justify-center overflow-hidden cursor-pointer"
                  onClick={() => row.handwriting_image_url && window.open(row.handwriting_image_url, "_blank")}
                >
                  {row.handwriting_image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={row.handwriting_image_url} alt="כתב יד" className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <ScrollText className="size-12 text-muted-foreground/30" />
                  )}
                  {row.torah_size && (
                    <span className="absolute top-2 right-2 rounded-full px-2 py-0.5 text-xs font-bold bg-background/90 border border-border">
                      {row.torah_size} ס&quot;מ
                    </span>
                  )}
                </div>
                <CardContent className="p-3 space-y-1.5">
                  <p className="font-semibold text-sm truncate">{displayOwner(row)}</p>
                  {row.sofer_name && <p className="text-xs text-muted-foreground">סופר: {row.sofer_name}</p>}
                  <div className="flex gap-1 text-xs flex-wrap">
                    {row.parchment_type && <span className="bg-muted rounded px-1.5 py-0.5 text-muted-foreground">{row.parchment_type}</span>}
                    {row.script_type && <span className="bg-muted rounded px-1.5 py-0.5 text-muted-foreground">{row.script_type}</span>}
                  </div>
                  {row.asking_price != null && (
                    <p className="text-sm font-bold text-primary">{formatK(row.asking_price)}</p>
                  )}
                  {row.potential_profit != null && (
                    <p className="text-xs text-emerald-600">רווח: {formatK(row.potential_profit)}</p>
                  )}
                  <div className="flex gap-1 pt-1">
                    <Button variant="outline" size="sm" className="flex-1 h-7 text-xs" onClick={() => setEditRow(row)}>
                      <PencilIcon className="size-3 ml-1" />ערוך
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10" onClick={() => handleDelete(row.id)}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          ))}
        </div>
      ) : (
      <Card className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 border-b border-border">
                  <TableHead className="text-right py-3 px-4 w-[150px]">בעלים</TableHead>
                  <TableHead className="text-right py-3 px-4 hidden sm:table-cell w-[120px]">סופר</TableHead>
                  <TableHead className="text-right py-3 px-4 hidden md:table-cell w-[120px]">סוחר</TableHead>
                  <TableHead className="text-right py-3 px-4 hidden lg:table-cell w-[110px]">קשר אחרון</TableHead>
                  <TableHead className="text-right py-3 px-4 hidden md:table-cell w-[72px]">גודל</TableHead>
                  <TableHead className="text-right py-3 px-4 hidden lg:table-cell w-[110px]">סוג קלף</TableHead>
                  <TableHead className="text-right py-3 px-4 w-[100px]">כתב</TableHead>
                  <TableHead className="text-right py-3 px-4 hidden sm:table-cell w-[52px]">כתב</TableHead>
                  <TableHead className="text-right py-3 px-4 w-[100px]">מחיר דורש</TableHead>
                  <TableHead className="text-right py-3 px-4 hidden sm:table-cell w-[100px]">יעד תיווך</TableHead>
                  <TableHead className="text-right py-3 px-4 hidden md:table-cell w-[100px]">רווח צפוי</TableHead>
                  <TableHead className="text-right py-3 px-4 w-[76px]">פעולות</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={12}
                      className="text-center text-muted-foreground py-14"
                    >
                      {rows.length === 0
                        ? "אין רשומות במאגר. הוסף רשומה מהטופס למעלה."
                        : "אין תוצאות לפי הסינון שנבחר."}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRows.map((row) => (
                    <TableRow key={row.id} className="hover:bg-muted/40 transition-colors">
                      <TableCell className="py-3 px-4 font-medium">
                        <div className="truncate max-w-[138px]">{displayOwner(row)}</div>
                        <SkuBadge sku={row.sku} />
                      </TableCell>
                      <TableCell className="py-3 px-4 hidden sm:table-cell text-sm text-slate-700 truncate max-w-[108px]">
                        {row.sofer_name ?? "—"}
                      </TableCell>
                      <TableCell className="py-3 px-4 hidden md:table-cell text-sm text-slate-700 truncate max-w-[108px]">
                        {row.dealer_name ?? "—"}
                      </TableCell>
                      <TableCell className="py-3 px-4 hidden lg:table-cell text-sm text-muted-foreground whitespace-nowrap">
                        {row.last_contact_date
                          ? new Date(row.last_contact_date).toLocaleDateString("he-IL")
                          : "—"}
                      </TableCell>
                      <TableCell className="py-3 px-4 hidden md:table-cell text-sm whitespace-nowrap">
                        {row.torah_size ?? "—"}
                      </TableCell>
                      <TableCell className="py-3 px-4 hidden lg:table-cell text-sm text-muted-foreground truncate max-w-[100px]">
                        {row.parchment_type ?? "—"}
                      </TableCell>
                      <TableCell className="py-3 px-4 text-sm truncate max-w-[108px]">
                        {row.script_type ?? "—"}
                      </TableCell>
                      <TableCell className="py-3 px-4 hidden sm:table-cell">
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
                              className="h-8 w-8 rounded object-cover border border-border hover:scale-110 transition-transform"
                            />
                          </a>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell className="py-3 px-4 tabular-nums whitespace-nowrap text-sm font-medium">
                        {formatK(row.asking_price)}
                      </TableCell>
                      <TableCell className="py-3 px-4 tabular-nums whitespace-nowrap hidden sm:table-cell text-sm">
                        {formatK(row.target_brokerage_price)}
                      </TableCell>
                      <TableCell className="py-3 px-4 tabular-nums whitespace-nowrap hidden md:table-cell text-sm text-emerald-700 font-semibold">
                        {formatK(row.potential_profit)}
                      </TableCell>
                      <TableCell className="py-3 px-4">
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
      )}

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
                <p className="text-xs text-muted-foreground mb-1">גודל ס״ת</p>
                <select
                  value={editForm.torah_size}
                  onChange={(e) => setEditForm((f) => ({ ...f, torah_size: e.target.value }))}
                  className={selectClass}
                >
                  <option value="">— לא צוין —</option>
                  {STAM_SEFER_TORAH_SIZES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">סוג קלף</p>
                <select
                  value={editForm.parchment_type}
                  onChange={(e) => setEditForm((f) => ({ ...f, parchment_type: e.target.value }))}
                  className={selectClass}
                >
                  <option value="">— לא צוין —</option>
                  {MARKET_PARCHMENT_TYPES.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">כתב</p>
                <select
                  value={editForm.script_type}
                  onChange={(e) => setEditForm((f) => ({ ...f, script_type: e.target.value }))}
                  className={selectClass}
                >
                  <option value="">— לא צוין —</option>
                  {STAM_SCRIPT_TYPES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
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
                        className="h-14 w-14 rounded-md object-cover border border-border"
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
