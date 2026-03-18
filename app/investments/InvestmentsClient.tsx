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
  bulkImportInvestments,
  type InvestmentRecord,
} from "./actions";
import { fetchScribes } from "@/app/crm/actions";
import { AddScribeModal, type NewScribe } from "@/components/inventory/AddScribeModal";
import { CsvActions } from "@/components/shared/CsvActions";
import { PlusIcon, WalletIcon } from "lucide-react";

export default function InvestmentsClient() {
  const [investments, setInvestments] = useState<InvestmentRecord[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [scribes, setScribes] = useState<{ id: string; name: string }[]>([]);
  const [addScribeOpen, setAddScribeOpen] = useState(false);
  const [newScribeId, setNewScribeId] = useState("");
  const [newItemDetails, setNewItemDetails] = useState("");
  const [newQuantity, setNewQuantity] = useState("1");
  const [newCostPerUnit, setNewCostPerUnit] = useState("");
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
      fetchScribes().then((r) => {
        if (r.success) setScribes(r.scribes);
      });
    }
  }, [createOpen]);

  const handleAddScribeSuccess = (scribe: NewScribe) => {
    setScribes((prev) => [...prev, { id: scribe.id, name: scribe.name }]);
    setNewScribeId(scribe.id);
  };

  const handleCreate = async () => {
    const qty = parseFloat(newQuantity);
    const cpu = parseFloat(newCostPerUnit);
    if (isNaN(qty) || qty <= 0 || isNaN(cpu) || cpu < 0) {
      toast.error("הזן כמות ועלות ליחידה");
      return;
    }
    setLoading(true);
    const res = await createInvestment(
      newScribeId || null,
      newItemDetails,
      newTargetDate || undefined,
      newNotes || undefined,
      qty,
      cpu
    );
    setLoading(false);
    if (res.success) {
      toast.success("ההשקעה נוצרה");
      setCreateOpen(false);
      setNewScribeId("");
      setNewItemDetails("");
      setNewQuantity("1");
      setNewCostPerUnit("");
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
          <div className="flex gap-2">
            <CsvActions
              data={investments.map((inv) => ({
                scribe: inv.scribe_name ?? "",
                item_details: inv.item_details ?? "",
                quantity: inv.quantity,
                cost_per_unit: inv.cost_per_unit ?? "",
                total_agreed_price: inv.total_agreed_price,
                amount_paid: inv.amount_paid,
                target_date: inv.target_date ?? "",
                status: inv.status,
                notes: inv.notes ?? "",
              }))}
              onImport={async (rows) => {
                const res = await bulkImportInvestments(rows);
                if (res.success) {
                  toast.success(`יובאו ${res.imported} השקעות`);
                  if (res.errors.length > 0) toast.warning(res.errors.slice(0, 3).join("; "));
                  loadData();
                } else toast.error(res.error);
              }}
              filename="investments"
              exportLabel="ייצוא CSV"
              importLabel="ייבוא CSV"
            />
            <Button onClick={() => setCreateOpen(true)} className="rounded-xl bg-indigo-600 hover:bg-indigo-700">
              <PlusIcon className="size-4 ml-1" />
              השקעה חדשה
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/80">
                  <TableHead className="font-semibold">סופר</TableHead>
                  <TableHead className="font-semibold">פרטי פריט</TableHead>
                  <TableHead className="font-semibold">כמות</TableHead>
                  <TableHead className="font-semibold">עלות ליחידה</TableHead>
                  <TableHead className="font-semibold">ס״ה השקעה</TableHead>
                  <TableHead className="font-semibold">שולם</TableHead>
                  <TableHead className="font-semibold">יתרה</TableHead>
                  <TableHead className="font-semibold">תאריך יעד</TableHead>
                  <TableHead className="font-semibold">סטטוס</TableHead>
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
                      <TableCell>{inv.quantity}</TableCell>
                      <TableCell>
                        {inv.cost_per_unit != null
                          ? `${inv.cost_per_unit.toLocaleString("he-IL")} ₪`
                          : "—"}
                      </TableCell>
                      <TableCell>{inv.total_agreed_price.toLocaleString("he-IL")} ₪</TableCell>
                      <TableCell>{inv.amount_paid.toLocaleString("he-IL")} ₪</TableCell>
                      <TableCell className="font-medium">{inv.remaining_balance.toLocaleString("he-IL")} ₪</TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {inv.target_date ? new Date(inv.target_date).toLocaleDateString("he-IL") : "—"}
                      </TableCell>
                      <TableCell>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          inv.status === "active" ? "bg-amber-100 text-amber-800" :
                          inv.status === "completed" ? "bg-emerald-100 text-emerald-800" :
                          "bg-slate-100 text-slate-600"
                        }`}>
                          {inv.status === "active" ? "פעיל" : inv.status === "completed" ? "הושלם" : "בוטל"}
                        </span>
                      </TableCell>
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
              <div className="flex gap-2">
                <select
                  value={newScribeId}
                  onChange={(e) => setNewScribeId(e.target.value)}
                  className="flex-1 rounded-xl border px-3 py-2"
                >
                  <option value="">—</option>
                  {scribes.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setAddScribeOpen(true)}
                  className="rounded-xl shrink-0"
                >
                  <PlusIcon className="size-4 ml-1" />
                  הוסף חדש
                </Button>
              </div>
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
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-sm font-semibold">כמות</label>
                <Input
                  type="number"
                  min={0.01}
                  step={0.01}
                  value={newQuantity}
                  onChange={(e) => setNewQuantity(e.target.value)}
                  placeholder="1"
                  className="rounded-xl"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-semibold">עלות ליחידה (₪)</label>
                <Input
                  type="number"
                  min={0}
                  value={newCostPerUnit}
                  onChange={(e) => setNewCostPerUnit(e.target.value)}
                  placeholder="0"
                  className="rounded-xl"
                />
              </div>
            </div>
            {(() => {
              const q = parseFloat(newQuantity);
              const c = parseFloat(newCostPerUnit);
              if (!isNaN(q) && !isNaN(c) && q > 0 && c >= 0) {
                return (
                  <p className="text-sm font-medium text-slate-700">
                    ס״ה השקעה: {(q * c).toLocaleString("he-IL")} ₪
                  </p>
                );
              }
              return null;
            })()}
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

      <AddScribeModal
        open={addScribeOpen}
        onOpenChange={setAddScribeOpen}
        onSuccess={handleAddScribeSuccess}
      />

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
