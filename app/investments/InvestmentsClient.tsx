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
  bulkImportInvestments,
  updateInvestment,
  getShareLink,
  moveInvestmentToInventory,
  type InvestmentRecord,
} from "./actions";
import { fetchScribes } from "@/app/crm/actions";
import { AddScribeModal, type NewScribe } from "@/components/inventory/AddScribeModal";
import { CsvActions } from "@/components/shared/CsvActions";
import { PaymentModal } from "@/components/payments/PaymentModal";
import { PlusIcon, WalletIcon, Share2Icon, FileUpIcon, SettingsIcon, PackageIcon } from "lucide-react";

export default function InvestmentsClient() {
  const [investments, setInvestments] = useState<InvestmentRecord[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [scribes, setScribes] = useState<{ id: string; name: string }[]>([]);
  const [addScribeOpen, setAddScribeOpen] = useState(false);
  const [newScribeId, setNewScribeId] = useState("");
  const [newItemDetails, setNewItemDetails] = useState("");
  const [newQuantity, setNewQuantity] = useState("1");
  const [newCostPerUnit, setNewCostPerUnit] = useState("");
  const [newTargetDate, setNewTargetDate] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [detailOpen, setDetailOpen] = useState<string | null>(null);
  const [detailDeductions, setDetailDeductions] = useState("");
  const [detailDocLoading, setDetailDocLoading] = useState(false);
  const [movingToInventoryId, setMovingToInventoryId] = useState<string | null>(null);

  const loadData = () => {
    fetchInvestments().then((r) => {
      if (r.success) {
        setInvestments(r.investments);
      } else {
        toast.error(r.error);
        setInvestments([]);
      }
    });
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

  const openDetail = (inv: InvestmentRecord) => {
    setDetailOpen(inv.id);
    setDetailDeductions(String(inv.deductions ?? 0));
  };

  const handleSaveDeductions = async () => {
    if (!detailOpen) return;
    const val = parseFloat(detailDeductions);
    if (isNaN(val) || val < 0) {
      toast.error("הזן ערך תקין");
      return;
    }
    setLoading(true);
    const res = await updateInvestment(detailOpen, { deductions: val });
    setLoading(false);
    if (res.success) {
      toast.success("נשמר");
      loadData();
    } else toast.error(res.error);
  };

  const handleUploadDoc = async (e: React.ChangeEvent<HTMLInputElement>, inv: InvestmentRecord) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setDetailDocLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/investments/upload", { method: "POST", body: formData });
      if (!res.ok) throw new Error("העלאה נכשלה");
      const { url } = await res.json();
      const docs = [...(inv.documents ?? []), url];
      const updateRes = await updateInvestment(inv.id, { documents: docs });
      if (updateRes.success) {
        toast.success("המסמך הועלה");
        loadData();
      } else toast.error(updateRes.error);
    } catch {
      toast.error("שגיאה בהעלאה");
    } finally {
      setDetailDocLoading(false);
      e.target.value = "";
    }
  };

  const handleShare = async (inv: InvestmentRecord) => {
    const res = await getShareLink(inv.id);
    if (res.success) {
      const fullUrl = res.url.startsWith("http") ? res.url : `${window.location.origin}${res.url}`;
      await navigator.clipboard.writeText(fullUrl);
      toast.success("הקישור הועתק ללוח");
    } else toast.error(res.error);
  };

  const handleMoveToInventory = async (invId: string) => {
    setMovingToInventoryId(invId);
    const res = await moveInvestmentToInventory(invId);
    setMovingToInventoryId(null);
    if (res.success) {
      toast.success("הפריט נוצר במלאי וההשקעה סומנה כנמסרה");
      loadData();
    } else {
      toast.error(res.error);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="shadow-sm rounded-xl border-border">
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
            <Button onClick={() => setCreateOpen(true)} className="rounded-xl bg-primary text-primary-foreground hover:bg-primary/90">
              <PlusIcon className="size-4 ml-1" />
              השקעה חדשה
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
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
                  const ms = Array.isArray(inv.milestones) ? inv.milestones : [];
                  const doneCount = ms.filter((m) => m && m.done === true).length;
                  const hasMilestones = ms.length > 0;
                  const pct = hasMilestones
                    ? (ms.length > 0 ? (doneCount / ms.length) * 100 : 0)
                    : inv.total_agreed_price > 0
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
                          inv.status === "delivered_to_inventory" ? "bg-sky-100 text-sky-800" :
                          "bg-slate-100 text-slate-600"
                        }`}>
                          {inv.status === "active"
                            ? "פעיל"
                            : inv.status === "completed"
                              ? "הושלם"
                              : inv.status === "delivered_to_inventory"
                                ? "נמסר למלאי"
                                : "בוטל"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 rounded-full bg-slate-200 overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground">{pct.toFixed(0)}%</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 flex-wrap items-center">
                          {inv.status === "active" && (
                            <Button
                              size="sm"
                              className="rounded-lg h-8 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-sm"
                              disabled={movingToInventoryId === inv.id}
                              onClick={() => handleMoveToInventory(inv.id)}
                            >
                              <PackageIcon className="size-4 ml-1" />
                              {movingToInventoryId === inv.id ? "מעביר..." : "העבר למלאי"}
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openDetail(inv)}
                            className="rounded-lg h-8"
                            title="פרטי פרויקט"
                          >
                            <SettingsIcon className="size-4" />
                          </Button>
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
                        </div>
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
            <Button type="button" onClick={handleCreate} disabled={loading} className="w-full rounded-xl">
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

      <PaymentModal
        open={!!paymentOpen}
        onOpenChange={(o) => !o && setPaymentOpen(null)}
        entityId={paymentOpen}
        entityType="investment"
        title="רישום תשלום — השקעה"
        onSuccess={loadData}
      />

      <Dialog open={!!detailOpen} onOpenChange={(o) => !o && setDetailOpen(null)}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>פרטי פרויקט</DialogTitle>
          </DialogHeader>
          {detailOpen && (() => {
            const inv = investments.find((i) => i.id === detailOpen);
            if (!inv) {
              return (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  טוען נתונים… אם הבעיה נמשכת, סגור ופתח שוב.
                </p>
              );
            }
            return (
              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-semibold">ניכויים (₪) – מפחיתים מתשלום הסופר</label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      min={0}
                      value={detailDeductions}
                      onChange={(e) => setDetailDeductions(e.target.value)}
                      placeholder="0"
                      className="rounded-xl"
                    />
                    <Button onClick={handleSaveDeductions} disabled={loading} className="rounded-xl">
                      שמור
                    </Button>
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-semibold">מסמכים / חוזים</label>
                  <label className="inline-flex items-center gap-2 rounded-xl border border-dashed px-4 py-3 cursor-pointer hover:bg-slate-50">
                    <FileUpIcon className="size-4" />
                    העלה קובץ
                    <input
                      type="file"
                      className="hidden"
                      accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                      onChange={(e) => handleUploadDoc(e, inv)}
                      disabled={detailDocLoading}
                    />
                  </label>
                  {inv.documents && inv.documents.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {inv.documents.map((url, idx) => (
                        <li key={idx}>
                          <a href={url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline truncate block">
                            מסמך {idx + 1}
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <Button
                    variant="outline"
                    onClick={() => handleShare(inv)}
                    className="w-full rounded-xl"
                  >
                    <Share2Icon className="size-4 ml-1" />
                    העתק קישור פורטל לקוח
                  </Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
