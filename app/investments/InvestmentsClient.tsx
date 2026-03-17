"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  fetchInvestments,
  createInvestment,
  addPayment,
  type InvestmentRecord,
} from "./actions";
import { fetchCrmContacts } from "@/app/crm/actions";
import { PlusIcon, WalletIcon } from "lucide-react";

export default function InvestmentsClient() {
  const [investments, setInvestments] = useState<InvestmentRecord[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [contacts, setContacts] = useState<{ id: string; name: string }[]>([]);
  const [newScribeId, setNewScribeId] = useState("");
  const [newItemDetails, setNewItemDetails] = useState("");
  const [newTotalPrice, setNewTotalPrice] = useState("");
  const [newTargetDate, setNewTargetDate] = useState("");
  const [newNotes, setNewNotes] = useState("");

  const loadData = () => {
    fetchInvestments().then((r) => r.success && setInvestments(r.investments));
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (createOpen) {
      fetchCrmContacts().then((r) => {
        if (r.success) setContacts(r.contacts.map((c) => ({ id: c.id, name: c.name })));
      });
    }
  }, [createOpen]);

  const handleCreate = async () => {
    const total = parseFloat(newTotalPrice);
    if (isNaN(total) || total <= 0) {
      toast.error("הזן סכום");
      return;
    }
    setLoading(true);
    const res = await createInvestment(
      newScribeId || null,
      newItemDetails,
      total,
      newTargetDate || undefined,
      newNotes || undefined
    );
    setLoading(false);
    if (res.success) {
      toast.success("ההשקעה נוצרה");
      setCreateOpen(false);
      setNewScribeId("");
      setNewItemDetails("");
      setNewTotalPrice("");
      setNewTargetDate("");
      setNewNotes("");
      loadData();
    } else {
      toast.error(res.error);
    }
  };

  const handleAddPayment = async () => {
    if (!paymentOpen) return;
    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("הזן סכום");
      return;
    }
    setLoading(true);
    const res = await addPayment(paymentOpen, amount);
    setLoading(false);
    if (res.success) {
      toast.success("התשלום נרשם");
      setPaymentOpen(null);
      setPaymentAmount("");
      loadData();
    } else {
      toast.error(res.error);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="shadow-sm rounded-xl border-slate-200">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base font-semibold">תיק השקעות</CardTitle>
            <CardDescription>פרויקטי כתיבה פעילים</CardDescription>
          </div>
          <Button onClick={() => setCreateOpen(true)} className="rounded-xl bg-indigo-600 hover:bg-indigo-700">
            <PlusIcon className="size-4 ml-1" />
            השקעה חדשה
          </Button>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/80">
                  <TableHead className="font-semibold">סופר</TableHead>
                  <TableHead className="font-semibold">פרטי פריט</TableHead>
                  <TableHead className="font-semibold">מחיר מוסכם</TableHead>
                  <TableHead className="font-semibold">שולם</TableHead>
                  <TableHead className="font-semibold">יתרה</TableHead>
                  <TableHead className="font-semibold">התקדמות</TableHead>
                  <TableHead className="font-semibold w-24">פעולות</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {investments.map((inv) => {
                  const pct = inv.total_agreed_price > 0
                    ? Math.min(100, (inv.amount_paid / inv.total_agreed_price) * 100)
                    : 0;
                  return (
                    <TableRow key={inv.id}>
                      <TableCell>{inv.scribe_name ?? "—"}</TableCell>
                      <TableCell className="max-w-[120px] truncate">{inv.item_details ?? "—"}</TableCell>
                      <TableCell>{inv.total_agreed_price.toLocaleString("he-IL")} ₪</TableCell>
                      <TableCell>{inv.amount_paid.toLocaleString("he-IL")} ₪</TableCell>
                      <TableCell className="font-medium">{inv.remaining_balance.toLocaleString("he-IL")} ₪</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 rounded-full bg-slate-200 overflow-hidden">
                            <div
                              className="h-full bg-indigo-500 rounded-full transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground">{pct.toFixed(0)}%</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {inv.status === "active" && inv.remaining_balance > 0 && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setPaymentOpen(inv.id)}
                            className="rounded-lg h-8"
                          >
                            <WalletIcon className="size-4 ml-1" />
                            תשלום
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          {investments.length === 0 && (
            <p className="py-8 text-center text-muted-foreground">אין השקעות</p>
          )}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>השקעה חדשה</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-semibold">סופר</label>
              <select
                value={newScribeId}
                onChange={(e) => setNewScribeId(e.target.value)}
                className="w-full rounded-xl border px-3 py-2"
              >
                <option value="">—</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold">פרטי פריט</label>
              <Input
                value={newItemDetails}
                onChange={(e) => setNewItemDetails(e.target.value)}
                placeholder="ספר תורה, סופר X..."
                className="rounded-xl"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold">מחיר מוסכם (₪)</label>
              <Input
                type="number"
                value={newTotalPrice}
                onChange={(e) => setNewTotalPrice(e.target.value)}
                placeholder="0"
                className="rounded-xl"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold">תאריך יעד</label>
              <Input
                type="date"
                value={newTargetDate}
                onChange={(e) => setNewTargetDate(e.target.value)}
                className="rounded-xl"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold">הערות</label>
              <Input
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                className="rounded-xl"
              />
            </div>
            <Button onClick={handleCreate} disabled={loading} className="w-full rounded-xl">
              {loading ? "שומר..." : "צור השקעה"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!paymentOpen} onOpenChange={(o) => !o && setPaymentOpen(null)}>
        <DialogContent className="sm:max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle>רישום תשלום</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-semibold">סכום (₪)</label>
              <Input
                type="number"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                placeholder="0"
                className="rounded-xl"
              />
            </div>
            <Button onClick={handleAddPayment} disabled={loading} className="w-full rounded-xl">
              {loading ? "שומר..." : "שמור תשלום"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
