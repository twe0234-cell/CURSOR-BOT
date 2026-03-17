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
  type SaleRecord,
  type ExpenseRecord,
} from "./actions";
import { fetchInventory } from "@/app/inventory/actions";
import { fetchCrmContacts } from "@/app/crm/actions";
import { PlusIcon, ShoppingCartIcon, ReceiptIcon } from "lucide-react";

const EXPENSE_CATEGORIES = ["משלוח", "פרסום", "הגהה", "תפירה", "אחר"];

export default function SalesClient() {
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [saleOpen, setSaleOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [inventoryItems, setInventoryItems] = useState<{ id: string; product_category: string | null; status: string | null }[]>([]);
  const [contacts, setContacts] = useState<{ id: string; name: string }[]>([]);
  const [newSaleItemId, setNewSaleItemId] = useState("");
  const [newSaleBuyerId, setNewSaleBuyerId] = useState("");
  const [newSalePrice, setNewSalePrice] = useState("");
  const [newSaleNotes, setNewSaleNotes] = useState("");
  const [newExpCategory, setNewExpCategory] = useState("");
  const [newExpAmount, setNewExpAmount] = useState("");
  const [newExpNotes, setNewExpNotes] = useState("");

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
      fetchCrmContacts().then((r) => {
        if (r.success) setContacts(r.contacts.map((c) => ({ id: c.id, name: c.name })));
      });
    }
  }, [saleOpen]);

  const handleCreateSale = async () => {
    const price = parseFloat(newSalePrice);
    if (!newSaleItemId || isNaN(price) || price <= 0) {
      toast.error("בחר פריט והזן מחיר");
      return;
    }
    setLoading(true);
    const res = await createSale(
      newSaleItemId,
      newSaleBuyerId || null,
      price,
      newSaleNotes || undefined
    );
    setLoading(false);
    if (res.success) {
      toast.success("המכירה נרשמה");
      setSaleOpen(false);
      setNewSaleItemId("");
      setNewSaleBuyerId("");
      setNewSalePrice("");
      setNewSaleNotes("");
      loadData();
    } else {
      toast.error(res.error);
    }
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
    } else {
      toast.error(res.error);
    }
  };

  const handleDeleteExpense = async (id: string) => {
    const res = await deleteExpense(id);
    if (res.success) {
      toast.success("ההוצאה נמחקה");
      loadData();
    } else toast.error(res.error);
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
                <CardDescription>היסטוריית מכירות</CardDescription>
              </div>
              <Button onClick={() => setSaleOpen(true)} className="rounded-xl bg-indigo-600 hover:bg-indigo-700">
                <PlusIcon className="size-4 ml-1" />
                מכירה חדשה
              </Button>
            </CardHeader>
            <CardContent>
              <div className="rounded-xl border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/80">
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
                        <TableCell>{new Date(s.sale_date).toLocaleDateString("he-IL")}</TableCell>
                        <TableCell>{s.item_category ?? "—"}</TableCell>
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

      <Dialog open={saleOpen} onOpenChange={setSaleOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>מכירה חדשה</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-semibold">פריט</label>
              <select
                value={newSaleItemId}
                onChange={(e) => setNewSaleItemId(e.target.value)}
                className="w-full rounded-xl border px-3 py-2"
              >
                <option value="">בחר פריט</option>
                {inventoryItems.map((i) => (
                  <option key={i.id} value={i.id}>{i.product_category ?? i.id}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold">קונה (אופציונלי)</label>
              <select
                value={newSaleBuyerId}
                onChange={(e) => setNewSaleBuyerId(e.target.value)}
                className="w-full rounded-xl border px-3 py-2"
              >
                <option value="">—</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold">מחיר מכירה (₪)</label>
              <Input
                type="number"
                value={newSalePrice}
                onChange={(e) => setNewSalePrice(e.target.value)}
                placeholder="0"
                className="rounded-xl"
              />
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
    </div>
  );
}
