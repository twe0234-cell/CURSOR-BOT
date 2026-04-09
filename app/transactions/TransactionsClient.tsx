"use client";

import { useState, useTransition, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  ArrowDownCircleIcon,
  ArrowUpCircleIcon,
  BookOpenIcon,
  CalendarIcon,
  LoaderIcon,
  SearchIcon,
} from "lucide-react";
import {
  fetchOpenEntities,
  recordQuickPayment,
  fetchRecentPayments,
  fetchMarketBooksForTx,
  recordMarketBookNote,
  type EntityOption,
  type MarketBookOption,
  type QuickTxRow,
} from "./actions";

type Mode = "incoming" | "outgoing" | "market";
const METHODS = ["מזומן", "העברה בנקאית", "ביט", "פייבוקס", "שיק", "אחר"];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

// ── Entity picker ─────────────────────────────────────────────────────────────

function EntityPicker({
  entities,
  selectedId,
  onSelect,
}: {
  entities: EntityOption[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const [search, setSearch] = useState("");

  const filtered = entities.filter(
    (e) => !search || e.label.toLowerCase().includes(search.toLowerCase()) ||
      e.subLabel.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-2">
      <div className="relative">
        <SearchIcon className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="חפש לפי שם / תיאור…"
          className="pr-9"
        />
      </div>
      <div className="max-h-60 overflow-y-auto space-y-1 rounded-lg border p-1 bg-slate-50">
        {filtered.length === 0 && (
          <p className="py-4 text-center text-sm text-muted-foreground">אין תוצאות</p>
        )}
        {filtered.map((e) => {
          const isSelected = e.id === selectedId;
          const categoryColor =
            e.category === "sale_brokerage" ? "text-violet-700 bg-violet-50 border-violet-200" :
            e.category === "sale_regular"   ? "text-sky-700 bg-sky-50 border-sky-200" :
                                              "text-amber-700 bg-amber-50 border-amber-200";
          const categoryLabel =
            e.category === "sale_brokerage" ? "🤝 תיווך" :
            e.category === "sale_regular"   ? "🛒 מכירה" :
                                              "✍️ סופר";
          return (
            <button
              key={e.id}
              type="button"
              onClick={() => onSelect(e.id)}
              className={cn(
                "w-full text-right rounded-lg border px-3 py-2 transition-all",
                isSelected
                  ? "border-sky-500 bg-sky-100 shadow-sm"
                  : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{e.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{e.subLabel}</p>
                </div>
                <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium", categoryColor)}>
                  {categoryLabel}
                </span>
              </div>
              {e.remaining > 0 && (
                <div className="mt-1.5 h-1.5 rounded-full bg-slate-200 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-emerald-500"
                    style={{ width: `${Math.min(100, 100 - (e.remaining / (e.remaining + 1)) * 100)}%` }}
                  />
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Market book picker ────────────────────────────────────────────────────────

function MarketBookPicker({
  books,
  selectedId,
  onSelect,
}: {
  books: MarketBookOption[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const filtered = books.filter(
    (b) => !search || b.label.toLowerCase().includes(search.toLowerCase())
  );
  return (
    <div className="space-y-2">
      <div className="relative">
        <SearchIcon className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="חפש ספר תורה…"
          className="pr-9"
        />
      </div>
      <div className="max-h-52 overflow-y-auto space-y-1 rounded-lg border p-1 bg-slate-50">
        {filtered.map((b) => (
          <button
            key={b.id}
            type="button"
            onClick={() => onSelect(b.id)}
            className={cn(
              "w-full text-right rounded-lg border px-3 py-2 text-sm transition-all",
              selectedId === b.id
                ? "border-sky-500 bg-sky-100"
                : "border-slate-200 bg-white hover:bg-slate-50"
            )}
          >
            <p className="font-medium">{b.label}</p>
            <p className="text-xs text-muted-foreground">{b.subLabel}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function TransactionsClient() {
  const [mode, setMode] = useState<Mode>("incoming");
  const [entities, setEntities] = useState<EntityOption[]>([]);
  const [marketBooks, setMarketBooks] = useState<MarketBookOption[]>([]);
  const [payments, setPayments] = useState<QuickTxRow[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  const [entityId, setEntityId] = useState("");
  const [marketBookId, setMarketBookId] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState("");
  const [notes, setNotes] = useState("");
  const [isPending, startTransition] = useTransition();

  const load = useCallback(async () => {
    setLoadingData(true);
    const [e, m, p] = await Promise.all([
      fetchOpenEntities(),
      fetchMarketBooksForTx(),
      fetchRecentPayments(),
    ]);
    if (e.success) setEntities(e.entities);
    if (m.success) setMarketBooks(m.books);
    if (p.success) setPayments(p.payments);
    setLoadingData(false);
  }, []);

  useEffect(() => {
    void load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // סינון ישויות לפי mode
  const filteredEntities = entities.filter((e) => {
    if (mode === "incoming") return e.entityType === "sale";
    if (mode === "outgoing") return e.entityType === "investment";
    return false;
  });

  const reset = () => {
    setEntityId("");
    setMarketBookId("");
    setAmount("");
    setNotes("");
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { toast.error("הזן סכום חיובי"); return; }

    if (mode === "market") {
      if (!marketBookId) { toast.error("בחר ספר תורה"); return; }
      startTransition(async () => {
        const res = await recordMarketBookNote({
          bookId: marketBookId,
          note: notes || `תשלום ₪${amt.toLocaleString("he-IL")}`,
          amount: amt,
          paymentDate,
        });
        if (res.success) {
          toast.success("✅ נרשם ביומן המאגר");
          reset();
          load();
        } else toast.error(res.error);
      });
      return;
    }

    if (!entityId) { toast.error("בחר עסקה"); return; }
    const selected = entities.find((e) => e.id === entityId);
    if (!selected) return;

    startTransition(async () => {
      const res = await recordQuickPayment({
        entityId,
        entityType: selected.entityType,
        amount: amt,
        paymentDate,
        method: method || null,
        notes: notes || null,
        direction: mode === "incoming" ? "incoming" : "outgoing",
      });
      if (res.success) {
        toast.success(mode === "incoming" ? "💰 תשלום נכנס נרשם" : "💸 תשלום יצא נרשם");
        reset();
        load();
      } else toast.error(res.error);
    });
  };

  const modeConfig = {
    incoming: {
      label: "💰 כסף נכנס",
      sub: "תשלום מלקוח / תיווך",
      border: "border-emerald-500 bg-emerald-50 text-emerald-800",
      btnClass: "bg-emerald-600 hover:bg-emerald-700",
      btnLabel: "✅ אשר קבלת תשלום",
    },
    outgoing: {
      label: "💸 כסף יצא",
      sub: "תשלום לסופר / ספק",
      border: "border-rose-500 bg-rose-50 text-rose-800",
      btnClass: "bg-rose-600 hover:bg-rose-700",
      btnLabel: "✅ אשר שליחת תשלום",
    },
    market: {
      label: "📋 מאגר ס״ת",
      sub: "הערת מו״מ / תשלום עצמאי",
      border: "border-sky-500 bg-sky-50 text-sky-800",
      btnClass: "bg-sky-600 hover:bg-sky-700",
      btnLabel: "✅ שמור ביומן המאגר",
    },
  };

  const cfg = modeConfig[mode];

  return (
    <div className="w-full max-w-2xl mx-auto px-4 py-6 sm:py-8" dir="rtl">
      <h1 className="text-3xl font-bold text-slate-800 mb-1">תנועות מהירות</h1>
      <p className="text-muted-foreground mb-6">
        רישום תשלומים, מכירות, תיווך ומאגר ספרי תורה בלחיצה אחת
      </p>

      {/* בחירת סוג */}
      <div className="grid grid-cols-3 gap-2 mb-6">
        {(["incoming", "outgoing", "market"] as Mode[]).map((m) => {
          const c = modeConfig[m];
          return (
            <button
              key={m}
              type="button"
              onClick={() => { setMode(m); reset(); }}
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-2xl border-2 p-3 font-semibold text-sm transition-all",
                mode === m
                  ? c.border + " shadow-md"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
              )}
            >
              <span className="text-lg">{c.label.slice(0, 2)}</span>
              <span className="font-bold">{c.label.slice(2).trim()}</span>
              <span className="text-[11px] font-normal text-center leading-tight opacity-80">{c.sub}</span>
            </button>
          );
        })}
      </div>

      {/* טופס */}
      <Card className="border-slate-200 shadow-sm mb-8">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{cfg.label} — {cfg.sub}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">

            {/* בחירת ישות */}
            {mode !== "market" ? (
              <div>
                <label className="text-sm font-medium text-slate-700 mb-2 block">
                  {mode === "incoming" ? "בחר מכירה / תיווך" : "בחר פרויקט סופר"}
                </label>
                <EntityPicker
                  entities={filteredEntities}
                  selectedId={entityId}
                  onSelect={setEntityId}
                />
              </div>
            ) : (
              <div>
                <label className="text-sm font-medium text-slate-700 mb-2 block">
                  בחר ספר תורה מהמאגר
                </label>
                <MarketBookPicker
                  books={marketBooks}
                  selectedId={marketBookId}
                  onSelect={setMarketBookId}
                />
              </div>
            )}

            {/* סכום + תאריך */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-slate-700 mb-1 block">סכום (₪)</label>
                <Input
                  type="number"
                  min={1}
                  step={1}
                  placeholder="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                  className="text-lg font-bold"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 mb-1 block">
                  <CalendarIcon className="size-3.5 inline-block ml-1" />תאריך
                </label>
                <Input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  required
                />
              </div>
            </div>

            {/* אמצעי תשלום (רק לתשלומים כספיים) */}
            {mode !== "market" && (
              <div>
                <label className="text-sm font-medium text-slate-700 mb-1 block">אמצעי תשלום</label>
                <div className="flex flex-wrap gap-2">
                  {METHODS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMethod(method === m ? "" : m)}
                      className={cn(
                        "rounded-full border px-3 py-1 text-sm transition-all",
                        method === m ? "border-sky-500 bg-sky-100 text-sky-800" : "border-slate-200 hover:border-slate-400"
                      )}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* הערה */}
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1 block">
                {mode === "market" ? "הערת מו״מ / תיאור" : "הערה (אופציונלי)"}
              </label>
              <Input
                placeholder={mode === "market" ? "למשל: קיבלתי מקדמה, סיכמנו על…" : "פרטים נוספים…"}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                required={mode === "market"}
              />
            </div>

            <Button
              type="submit"
              disabled={isPending || !amount || (mode !== "market" && !entityId) || (mode === "market" && !marketBookId)}
              className={cn("w-full h-12 text-base font-bold", cfg.btnClass)}
            >
              {isPending ? <LoaderIcon className="size-5 animate-spin" /> : cfg.btnLabel}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* תנועות אחרונות */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xl font-semibold text-slate-700">50 תנועות אחרונות</h2>
        <BookOpenIcon className="size-5 text-muted-foreground" />
      </div>
      {loadingData ? (
        <p className="text-sm text-center text-muted-foreground py-6">טוען…</p>
      ) : payments.length === 0 ? (
        <p className="text-sm text-center text-muted-foreground py-6">אין תנועות עדיין</p>
      ) : (
        <div className="space-y-2">
          {payments.map((p) => (
            <div
              key={p.id}
              className={cn(
                "flex items-center justify-between rounded-xl border px-4 py-3 text-sm",
                p.direction === "incoming"
                  ? "border-emerald-100 bg-emerald-50"
                  : "border-rose-100 bg-rose-50"
              )}
            >
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{p.entity_label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {p.category_label}
                  {p.method && ` · ${p.method}`}
                  {p.notes && ` · ${p.notes.slice(0, 40)}`}
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0 mr-2">
                <span className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(p.payment_date)}</span>
                <span className={cn(
                  "font-bold tabular-nums whitespace-nowrap",
                  p.direction === "incoming" ? "text-emerald-700" : "text-rose-700"
                )}>
                  {p.direction === "incoming" ? "+" : "−"}₪{p.amount.toLocaleString("he-IL")}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
