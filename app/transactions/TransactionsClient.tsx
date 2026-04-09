"use client";

import { useState, useTransition, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  ArrowDownCircleIcon,
  ArrowUpCircleIcon,
  CalendarIcon,
  LoaderIcon,
} from "lucide-react";
import {
  fetchOpenEntities,
  recordQuickPayment,
  fetchRecentPayments,
  type EntityOption,
  type QuickTxRow,
} from "./actions";

type Direction = "incoming" | "outgoing";

const METHODS = ["מזומן", "העברה בנקאית", "ביט", "פייבוקס", "שיק", "אחר"];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function formatAmount(n: number, dir: string) {
  const s = n.toLocaleString("he-IL");
  return dir === "incoming" ? `+₪${s}` : `-₪${s}`;
}

export default function TransactionsClient() {
  const [entities, setEntities] = useState<EntityOption[]>([]);
  const [payments, setPayments] = useState<QuickTxRow[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  const [direction, setDirection] = useState<Direction>("incoming");
  const [entityId, setEntityId] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState("");
  const [notes, setNotes] = useState("");
  const [entitySearch, setEntitySearch] = useState("");
  const [isPending, startTransition] = useTransition();

  const load = () => {
    setLoadingData(true);
    Promise.all([fetchOpenEntities(), fetchRecentPayments()]).then(([e, p]) => {
      if (e.success) setEntities(e.entities);
      if (p.success) setPayments(p.payments);
      setLoadingData(false);
    });
  };

  useEffect(() => { load(); }, []);

  const filteredEntities = entities.filter((e) => {
    const matchDir = direction === "incoming" ? e.type === "sale" : e.type === "investment";
    const matchSearch = !entitySearch || e.label.toLowerCase().includes(entitySearch.toLowerCase());
    return matchDir && matchSearch;
  });

  const selectedEntity = entities.find((e) => e.id === entityId);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!entityId) { toast.error("בחר מכירה / השקעה"); return; }
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { toast.error("הזן סכום חיובי"); return; }

    startTransition(async () => {
      const res = await recordQuickPayment({
        entityId,
        entityType: selectedEntity?.type ?? (direction === "incoming" ? "sale" : "investment"),
        amount: amt,
        paymentDate,
        method: method || null,
        notes: notes || null,
        direction,
      });
      if (res.success) {
        toast.success(direction === "incoming" ? "💰 תשלום נכנס נרשם" : "💸 תשלום יצא נרשם");
        setAmount("");
        setNotes("");
        setEntityId("");
        setEntitySearch("");
        load();
      } else {
        toast.error(res.error);
      }
    });
  };

  return (
    <div className="w-full max-w-3xl mx-auto px-4 py-6 sm:py-8" dir="rtl">
      <h1 className="text-3xl font-bold text-slate-800 mb-1">תנועות מהירות</h1>
      <p className="text-muted-foreground mb-8">רישום תשלומים כנגד מכירות והשקעות בלחיצה אחת</p>

      {/* כפתורי כיוון */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <button
          type="button"
          onClick={() => { setDirection("incoming"); setEntityId(""); }}
          className={cn(
            "flex flex-col items-center gap-2 rounded-2xl border-2 p-4 font-semibold transition-all",
            direction === "incoming"
              ? "border-emerald-500 bg-emerald-50 text-emerald-800 shadow-md"
              : "border-slate-200 bg-white text-slate-600 hover:border-emerald-300"
          )}
        >
          <ArrowDownCircleIcon className="size-8 text-emerald-500" />
          <span>💰 תשלום שהתקבל</span>
          <span className="text-xs font-normal text-muted-foreground">כסף נכנס — כנגד מכירה</span>
        </button>
        <button
          type="button"
          onClick={() => { setDirection("outgoing"); setEntityId(""); }}
          className={cn(
            "flex flex-col items-center gap-2 rounded-2xl border-2 p-4 font-semibold transition-all",
            direction === "outgoing"
              ? "border-rose-500 bg-rose-50 text-rose-800 shadow-md"
              : "border-slate-200 bg-white text-slate-600 hover:border-rose-300"
          )}
        >
          <ArrowUpCircleIcon className="size-8 text-rose-500" />
          <span>💸 תשלום לסופר</span>
          <span className="text-xs font-normal text-muted-foreground">כסף יצא — כנגד השקעה</span>
        </button>
      </div>

      {/* טופס */}
      <Card className="border-slate-200 shadow-sm mb-8">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">
            {direction === "incoming" ? "רישום תשלום שהתקבל" : "רישום תשלום לסופר"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            {/* חיפוש וסינון ישות */}
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1 block">
                {direction === "incoming" ? "מכירה" : "השקעה / פרויקט"}
              </label>
              <Input
                placeholder="חיפוש…"
                value={entitySearch}
                onChange={(e) => setEntitySearch(e.target.value)}
                className="mb-2"
              />
              <select
                className="w-full rounded-lg border px-3 py-2 text-sm"
                value={entityId}
                onChange={(e) => setEntityId(e.target.value)}
                required
              >
                <option value="">— בחר —</option>
                {filteredEntities.map((e) => (
                  <option key={e.id} value={e.id}>{e.label}</option>
                ))}
              </select>
            </div>

            {/* סכום */}
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
                  <CalendarIcon className="size-3.5 inline-block ml-1" />
                  תאריך
                </label>
                <Input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  required
                />
              </div>
            </div>

            {/* אמצעי תשלום */}
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
                      method === m
                        ? "border-sky-500 bg-sky-100 text-sky-800"
                        : "border-slate-200 hover:border-slate-400"
                    )}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {/* הערות */}
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1 block">הערה (אופציונלי)</label>
              <Input
                placeholder="פרטים נוספים…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            <Button
              type="submit"
              disabled={isPending || !entityId || !amount}
              className={cn(
                "w-full h-12 text-base font-bold",
                direction === "incoming"
                  ? "bg-emerald-600 hover:bg-emerald-700"
                  : "bg-rose-600 hover:bg-rose-700"
              )}
            >
              {isPending
                ? <LoaderIcon className="size-5 animate-spin" />
                : direction === "incoming"
                  ? "✅ אשר קבלת תשלום"
                  : "✅ אשר שליחת תשלום"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* תנועות אחרונות */}
      <h2 className="text-xl font-semibold text-slate-700 mb-3">30 תנועות אחרונות</h2>
      {loadingData ? (
        <p className="text-muted-foreground text-sm text-center py-6">טוען…</p>
      ) : payments.length === 0 ? (
        <p className="text-muted-foreground text-sm text-center py-6">אין תנועות עדיין</p>
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
                <span className="font-medium">
                  {p.entity_label}
                </span>
                {p.method && <span className="text-muted-foreground mr-2">• {p.method}</span>}
                {p.notes && <span className="text-muted-foreground mr-2 truncate">— {p.notes}</span>}
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-xs text-muted-foreground">{formatDate(p.payment_date)}</span>
                <span className={cn(
                  "font-bold tabular-nums",
                  p.direction === "incoming" ? "text-emerald-700" : "text-rose-700"
                )}>
                  {formatAmount(p.amount, p.direction)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
