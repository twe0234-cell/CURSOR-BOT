"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addSalePayment } from "@/app/sales/actions";
import { addInvestmentLedgerPayment } from "@/app/investments/actions";
import type { LedgerDirection, LedgerEntityType } from "@/app/payments/actions";
import { toast } from "sonner";

const METHOD_OPTIONS = ["מזומן", "העברה בנקאית", "שיק", "כרטיס אשראי", "אחר"];

export type PaymentModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Sale or investment row id */
  entityId: string | null;
  entityType: LedgerEntityType;
  /** Default flow: incoming = we receive money */
  defaultDirection?: LedgerDirection;
  title?: string;
  onSuccess?: () => void;
};

export function PaymentModal({
  open,
  onOpenChange,
  entityId,
  entityType,
  defaultDirection = "incoming",
  title = "רישום תשלום",
  onSuccess,
}: PaymentModalProps) {
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState(METHOD_OPTIONS[0]);
  const [direction, setDirection] = useState<LedgerDirection>(defaultDirection);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setAmount("");
      setPaymentDate(new Date().toISOString().slice(0, 10));
      setMethod(METHOD_OPTIONS[0]);
      setDirection(defaultDirection);
      setNotes("");
    }
  }, [open, defaultDirection]);

  const handleSubmit = async () => {
    if (!entityId) return;
    const n = parseFloat(amount);
    if (isNaN(n) || n <= 0) {
      toast.error("הזן סכום חיובי");
      return;
    }
    setLoading(true);
    const res =
      entityType === "sale"
        ? await addSalePayment(entityId, n, paymentDate, notes.trim() || undefined, {
            method: method || null,
            direction,
          })
        : await addInvestmentLedgerPayment(entityId, n, paymentDate, method || null, notes.trim() || null, direction);
    setLoading(false);
    if (res.success) {
      toast.success(direction === "incoming" ? "התקבל תשלום" : "התשלום יוצא נרשם");
      onOpenChange(false);
      onSuccess?.();
    } else {
      toast.error(res.error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-semibold">כיוון</label>
            <select
              value={direction}
              onChange={(e) => setDirection(e.target.value as LedgerDirection)}
              className="w-full rounded-xl border px-3 py-2 text-sm"
            >
              <option value="incoming">נכנס (התקבל אצלנו)</option>
              <option value="outgoing">יוצא (שילמנו)</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold">סכום (₪)</label>
            <Input
              type="number"
              min={0}
              step={0.01}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              className="rounded-xl"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold">תאריך</label>
            <Input
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              className="rounded-xl"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold">אמצעי תשלום</label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="w-full rounded-xl border px-3 py-2 text-sm"
            >
              {METHOD_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold">הערות</label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="אופציונלי"
              className="rounded-xl"
            />
          </div>
          <Button type="button" onClick={handleSubmit} disabled={loading || !entityId} className="w-full rounded-xl">
            {loading ? "שומר..." : "שמור לספר התשלומים"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
