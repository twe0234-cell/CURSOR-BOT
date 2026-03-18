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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  fetchSales,
  createSale,
  fetchExpenses,
  createExpense,
  deleteExpense,
  bulkImportSales,
  type SaleRecord,
  type ExpenseRecord,
} from "./actions";
import { fetchInventory } from "@/app/inventory/actions";
import { fetchInvestments } from "@/app/investments/actions";
import { fetchCrmContacts } from "@/app/crm/actions";
import { CsvActions } from "@/components/shared/CsvActions";
import { AddClientModal } from "@/components/shared/AddClientModal";
import { PlusIcon, ShoppingCartIcon, ReceiptIcon, SearchIcon } from "lucide-react";

const SALE_TYPES = ["ממלאי", "תיווך", "פרויקט חדש"] as const;
type SaleType = (typeof SALE_TYPES)[number];

const EXPENSE_CATEGORIES = ["משלוח", "פרסום", "הגהה", "תפירה", "אחר"];

export default function SalesClient() {
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [saleOpen, setSaleOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saleType, setSaleType] = useState<SaleType>("ממלאי");
  const [inventoryItems, setInventoryItems] = useState<{ id: string; product_category: string | null; status: string | null }[]>([]);
  const [investments, setInvestments] = useState<{ id: string; item_details: string | null; status: string }[]>([]);
  const [contacts, setContacts] = useState<{ id: string; name: string }[]>([]);
  const [inventorySearch, setInventorySearch] = useState("");
  const [newSaleItemId, setNewSaleItemId] = useState("");
  const [newSaleBuyerId, setNewSaleBuyerId] = useState("");
  const [newSaleSellerId, setNewSaleSellerId] = useState("");
  const [newSaleInvestmentId, setNewSaleInvestmentId] = useState("");
  const [newSaleItemDescription, setNewSaleItemDescription] = useState("");
  const [newSaleQuantity, setNewSaleQuantity] = useState("1");
  const [newSalePrice, setNewSalePrice] = useState("");
  const [newSaleAmountPaid, setNewSaleAmountPaid] = useState("0");
  const [newSaleCommission, setNewSaleCommission] = useState("");
  const [newSaleNotes, setNewSaleNotes] = useState("");
  const [newExpCategory, setNewExpCategory] = useState("");
  const [newExpAmount, setNewExpAmount] = useState("");
  const [newExpNotes, setNewExpNotes] = useState("");
  const [addClientOpen, setAddClientOpen] = useState(false);

  const loadData = () => {
    fetchSales().then((r) => r.success && setSales(r.sales));
    fetchExpenses().then((r) => r.success && setExpenses(r.expenses));
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (saleOpen) {
      fetchInventory().then((r) => {
        if (r.success) {
          setInventoryItems(r.items.filter((i) => i.status !== "sold").map((i) => ({
            id: i.id,
            product_category: i.product_category,
            status: i.status,
          })));
        }
      });
      fetchInvestments().then((r) => {
        if (r.success) {
          setInvestments(r.investments.filter((i) => i.status === "active").map((i) => ({
            id: i.id,
            item_details: i.item_details,
            status: i.status,
          })));
        }
      });
      fetchCrmContacts().then((r) => {
        if (r.success) setContacts(r.contacts.map((c) => ({ id: c.id, name: c.name })));
      });
    }
  }, [saleOpen]);

  const filteredInventory = inventorySearch.trim()
    ? inventoryItems.filter((i) =>
        (i.product_category ?? "").toLowerCase().includes(inventorySearch.toLowerCase())
      )
    : inventoryItems;

  const handleCreateSale = async () => {
    if (saleType === "ממלאי") {
      const unitPrice = parseFloat(newSalePrice);
      const qty = parseInt(newSaleQuantity, 10) || 1;
      const amountPaid = parseFloat(newSaleAmountPaid) || 0;
      if (!newSaleItemId || isNaN(unitPrice) || unitPrice <= 0) {
        toast.error("בחר פריט והזן מחיר ליחידה");
        return;
      }
      setLoading(true);
      const res = await createSale({
        sale_type: "ממלאי",
        item_id: newSaleItemId,
        buyer_id: newSaleBuyerId || null,
        quantity: qty,
        sale_price: unitPrice,
        amount_paid: amountPaid,
        notes: newSaleNotes || undefined,
      });
      setLoading(false);
      if (res.success) {
        toast.success("המכירה נרשמה");
        resetSaleForm();
        setSaleOpen(false);
        loadData();
      } else toast.error(res.error);
    } else if (saleType === "תיווך") {
      const commission = parseFloat(newSaleCommission);
      if (!newSaleItemDescription.trim() || isNaN(commission) || commission <= 0) {
        toast.error("הזן תיאור פריט ועמלת תיווך");
        return;
      }
      setLoading(true);
      const res = await createSale({
        sale_type: "תיווך",
        item_description: newSaleItemDescription,
        buyer_id: newSaleBuyerId || null,
        seller_id: newSaleSellerId || null,
        commission_profit: commission,
        notes: newSaleNotes || undefined,
      });
      setLoading(false);
      if (res.success) {
        toast.success("עמלת התיווך נרשמה");
        resetSaleForm();
        setSaleOpen(false);
        loadData();
      } else toast.error(res.error);
    } else if (saleType === "פרויקט חדש") {
      const price = parseFloat(newSalePrice);
      const amountPaid = parseFloat(newSaleAmountPaid) || 0;
      if (!newSaleInvestmentId || isNaN(price) || price <= 0) {
        toast.error("בחר השקעה והזן מחיר מכירה");
        return;
      }
      setLoading(true);
      const res = await createSale({
        sale_type: "פרויקט חדש",
        investment_id: newSaleInvestmentId,
        buyer_id: newSaleBuyerId || null,
        sale_price: price,
        amount_paid: amountPaid,
        notes: newSaleNotes || undefined,
      });
      setLoading(false);
      if (res.success) {
        toast.success("מכירת הפרויקט נרשמה");
        resetSaleForm();
        setSaleOpen(false);
        loadData();
      } else toast.error(res.error);
    }
  };

  const resetSaleForm = () => {
    setNewSaleItemId("");
    setNewSaleBuyerId("");
    setNewSaleSellerId("");
    setNewSaleInvestmentId("");
    setNewSaleItemDescription("");
    setNewSaleQuantity("1");
    setNewSalePrice("");
    setNewSaleAmountPaid("0");
    setNewSaleCommission("");
    setNewSaleNotes("");
    setInventorySearch("");
  };

  const handleAddExpense = async () => {
    const amount = parseFloat(newExpAmount);
    const cat = newExpCategory.trim() || EXPENSE_CATEGORIES[0];
    if (isNaN(amount) || amount <= 0) {
      toast.error("הזן סכום");
      return;
    }
    setLoading(true);
    const res = await createExpense(cat, amount, undefined, newExpNotes || undefined);
    setLoading(false);
    if (res.success) {
      toast.success("ההוצאה נרשמה");
      setNewExpCategory("");
      setNewExpAmount("");
      setNewExpNotes("");
      loadData();
    } else toast.error(res.error);
  };

  const handleDeleteExpense = async (id: string) => {
    const res = await deleteExpense(id);
    if (res.success) {
      toast.success("ההוצאה נמחקה");
      loadData();
    } else toast.error(res.error);
  };

  const getSaleDisplay = (s: SaleRecord) => {
    if (s.sale_type === "תיווך") return s.item_description ?? "—";
    if (s.sale_type === "פרויקט חדש") return s.investment_details ?? "פרויקט";
    return s.item_category ?? "—";
  };

  return (
    <div className="space-y-6">
      <Tabs defaultValue="sales" className="w-full">
        <TabsList className="mb-6 rounded-xl bg-slate-100 p-1">
          <TabsTrigger value="sales" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <ShoppingCartIcon className="size-4 ml-1" />
            ניהול מכירות
          </TabsTrigger>
          <TabsTrigger value="expenses" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <ReceiptIcon className="size-4 ml-1" />
            הוצאות ותזרים
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sales" className="mt-0">
          <Card className="shadow-sm rounded-xl border-slate-200">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base font-semibold">מכירות</CardTitle>
                <CardDescription>היסטוריית מכירות – ממלאי, תיווך, פרויקטים</CardDescription>
              </div>
              <div className="flex gap-2">
                <CsvActions
                  data={sales.map((s) => ({
                    sale_type: s.sale_type ?? "ממלאי",
                    sale_date: s.sale_date,
                    item: getSaleDisplay(s),
                    buyer_name: s.buyer_name,
                    seller_name: s.seller_name,
                    sale_price: s.sale_price,
                    profit: s.profit,
                    commission_profit: s.commission_profit,
                  }))}
                  onImport={async (rows) => {
                    const res = await bulkImportSales(rows);
                    if (res.success) {
                      toast.success(`יובאו ${res.imported} מכירות`);
                      if (res.errors.length > 0) toast.warning(res.errors.slice(0, 3).join("; "));
                      loadData();
                    } else toast.error(res.error);
                  }}
                  filename="sales"
                  exportLabel="ייצוא CSV"
                  importLabel="ייבוא CSV"
                />
                <Button onClick={() => setSaleOpen(true)} className="rounded-xl bg-indigo-600 hover:bg-indigo-700">
                  <PlusIcon className="size-4 ml-1" />
                  מכירה חדשה
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-xl border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/80">
                      <TableHead className="font-semibold">סוג</TableHead>
                      <TableHead className="font-semibold">תאריך</TableHead>
                      <TableHead className="font-semibold">פריט</TableHead>
                      <TableHead className="font-semibold">קונה</TableHead>
                      <TableHead className="font-semibold">מחיר</TableHead>
                      <TableHead className="font-semibold">רווח</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sales.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100">
                            {s.sale_type ?? "ממלאי"}
                          </span>
                        </TableCell>
                        <TableCell>{new Date(s.sale_date).toLocaleDateString("he-IL")}</TableCell>
                        <TableCell>{getSaleDisplay(s)}</TableCell>
                        <TableCell>{s.buyer_name ?? "—"}</TableCell>
                        <TableCell>{s.sale_price.toLocaleString("he-IL")} ₪</TableCell>
                        <TableCell className={s.profit != null && s.profit >= 0 ? "text-emerald-600" : "text-red-600"}>
                          {s.profit != null ? `${s.profit.toLocaleString("he-IL")} ₪` : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {sales.length === 0 && (
                <p className="py-8 text-center text-muted-foreground">אין מכירות</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="expenses" className="mt-0">
          <Card className="shadow-sm rounded-xl border-slate-200">
            <CardHeader>
              <CardTitle className="text-base font-semibold">הוצאות</CardTitle>
              <CardDescription>רישום הוצאות יומי</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2 p-3 rounded-xl bg-slate-50 border border-slate-200">
                <select
                  value={newExpCategory}
                  onChange={(e) => setNewExpCategory(e.target.value)}
                  className="rounded-lg border px-3 py-2 text-sm min-w-[100px]"
                >
                  {EXPENSE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <Input
                  type="number"
                  placeholder="סכום (₪)"
                  value={newExpAmount}
                  onChange={(e) => setNewExpAmount(e.target.value)}
                  className="max-w-[120px] rounded-lg"
                />
                <Input
                  placeholder="הערות"
                  value={newExpNotes}
                  onChange={(e) => setNewExpNotes(e.target.value)}
                  className="max-w-[180px] rounded-lg"
                />
                <Button onClick={handleAddExpense} disabled={loading} size="sm" className="rounded-lg">
                  הוסף
                </Button>
              </div>
              <div className="rounded-xl border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/80">
                      <TableHead className="font-semibold">תאריך</TableHead>
                      <TableHead className="font-semibold">קטגוריה</TableHead>
                      <TableHead className="font-semibold">סכום</TableHead>
                      <TableHead className="font-semibold">הערות</TableHead>
                      <TableHead className="w-16"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {expenses.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell>{new Date(e.expense_date).toLocaleDateString("he-IL")}</TableCell>
                        <TableCell>{e.category}</TableCell>
                        <TableCell>{e.amount.toLocaleString("he-IL")} ₪</TableCell>
                        <TableCell>{e.notes ?? "—"}</TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteExpense(e.id)}
                            className="text-red-600 h-8"
                          >
                            מחק
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {expenses.length === 0 && (
                <p className="py-8 text-center text-muted-foreground">אין הוצאות</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={saleOpen} onOpenChange={(o) => { setSaleOpen(o); if (!o) resetSaleForm(); }}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>מכירה חדשה</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-semibold">סוג מכירה</label>
              <div className="flex gap-2">
                {SALE_TYPES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setSaleType(t)}
                    className={`flex-1 rounded-xl border px-3 py-2 text-sm font-medium ${
                      saleType === t ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-slate-200"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {saleType === "ממלאי" && (
              <>
                <div>
                  <label className="mb-1.5 block text-sm font-semibold">פריט ממלאי</label>
                  <div className="relative">
                    <SearchIcon className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                    <Input
                      value={inventorySearch}
                      onChange={(e) => setInventorySearch(e.target.value)}
                      placeholder="חפש לפי קטגוריה..."
                      className="rounded-xl pr-10 mb-2"
                    />
                  </div>
                  <select
                    value={newSaleItemId}
                    onChange={(e) => setNewSaleItemId(e.target.value)}
                    className="w-full rounded-xl border px-3 py-2"
                  >
                    <option value="">בחר פריט</option>
                    {filteredInventory.map((i) => (
                      <option key={i.id} value={i.id}>{i.product_category ?? i.id}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-semibold">כמות</label>
                    <Input
                      type="number"
                      min={1}
                      value={newSaleQuantity}
                      onChange={(e) => setNewSaleQuantity(e.target.value)}
                      placeholder="1"
                      className="rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-semibold">מחיר ליחידה (₪)</label>
                    <Input
                      type="number"
                      min={0}
                      value={newSalePrice}
                      onChange={(e) => setNewSalePrice(e.target.value)}
                      placeholder="0"
                      className="rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-semibold">שולם עד כה (₪)</label>
                    <Input
                      type="number"
                      min={0}
                      value={newSaleAmountPaid}
                      onChange={(e) => setNewSaleAmountPaid(e.target.value)}
                      placeholder="0"
                      className="rounded-xl"
                    />
                  </div>
                </div>
                {(() => {
                  const qty = parseInt(newSaleQuantity, 10) || 1;
                  const unitPrice = parseFloat(newSalePrice);
                  const paid = parseFloat(newSaleAmountPaid) || 0;
                  const total = !isNaN(unitPrice) && unitPrice >= 0 ? qty * unitPrice : null;
                  const remaining = total != null ? total - paid : null;
                  if (total == null) return null;
                  return (
                    <div className="rounded-lg bg-slate-50 p-3 space-y-1 text-sm">
                      <p className="font-medium">סה״כ עסקה: {total.toLocaleString("he-IL")} ₪</p>
                      <p className={remaining != null && remaining > 0 ? "text-amber-700 font-medium" : "text-muted-foreground"}>
                        יתרת חוב של הלקוח: {remaining != null ? remaining.toLocaleString("he-IL") : "—"} ₪
                      </p>
                    </div>
                  );
                })()}
              </>
            )}

            {saleType === "תיווך" && (
              <>
                <div>
                  <label className="mb-1.5 block text-sm font-semibold">תיאור הפריט</label>
                  <Input
                    value={newSaleItemDescription}
                    onChange={(e) => setNewSaleItemDescription(e.target.value)}
                    placeholder="ספר תורה, מגילה..."
                    className="rounded-xl"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-semibold">מוכר (אופציונלי)</label>
                  <select
                    value={newSaleSellerId}
                    onChange={(e) => setNewSaleSellerId(e.target.value)}
                    className="w-full rounded-xl border px-3 py-2"
                  >
                    <option value="">—</option>
                    {contacts.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-semibold">עמלת תיווך (₪)</label>
                  <Input
                    type="number"
                    value={newSaleCommission}
                    onChange={(e) => setNewSaleCommission(e.target.value)}
                    placeholder="0"
                    className="rounded-xl"
                  />
                </div>
              </>
            )}

            {saleType === "פרויקט חדש" && (
              <>
                <div>
                  <label className="mb-1.5 block text-sm font-semibold">השקעה (פרויקט)</label>
                  <select
                    value={newSaleInvestmentId}
                    onChange={(e) => setNewSaleInvestmentId(e.target.value)}
                    className="w-full rounded-xl border px-3 py-2"
                  >
                    <option value="">בחר השקעה</option>
                    {investments.map((i) => (
                      <option key={i.id} value={i.id}>{i.item_details ?? i.id}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-semibold">מחיר מכירה (₪)</label>
                  <Input
                    type="number"
                    min={0}
                    value={newSalePrice}
                    onChange={(e) => setNewSalePrice(e.target.value)}
                    placeholder="0"
                    className="rounded-xl"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-semibold">שולם עד כה (₪)</label>
                  <Input
                    type="number"
                    min={0}
                    value={newSaleAmountPaid}
                    onChange={(e) => setNewSaleAmountPaid(e.target.value)}
                    placeholder="0"
                    className="rounded-xl"
                  />
                </div>
              </>
            )}

            <div>
              <label className="mb-1.5 block text-sm font-semibold">קונה (אופציונלי)</label>
              <div className="flex gap-2">
                <select
                  value={newSaleBuyerId}
                  onChange={(e) => setNewSaleBuyerId(e.target.value)}
                  className="flex-1 rounded-xl border px-3 py-2"
                >
                  <option value="">—</option>
                  {contacts.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setAddClientOpen(true)}
                  className="rounded-xl shrink-0"
                >
                  <PlusIcon className="size-4 ml-1" />
                  הוסף
                </Button>
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-semibold">הערות</label>
              <Input
                value={newSaleNotes}
                onChange={(e) => setNewSaleNotes(e.target.value)}
                placeholder="אופציונלי"
                className="rounded-xl"
              />
            </div>
            <Button onClick={handleCreateSale} disabled={loading} className="w-full rounded-xl">
              {loading ? "שומר..." : "שמור מכירה"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AddClientModal
        open={addClientOpen}
        onOpenChange={setAddClientOpen}
        onSuccess={(c) => {
          setContacts((prev) => [...prev, c]);
          setNewSaleBuyerId(c.id);
        }}
      />
    </div>
  );
}
