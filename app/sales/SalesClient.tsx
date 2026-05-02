"use client";

import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { handleNumericChange } from "@/lib/numericInput";
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
import { ScrollToTop } from "@/components/ui/ScrollToTop";
import {
  fetchSales,
  createSale,
  fetchExpenses,
  createExpense,
  deleteExpense,
  bulkImportSales,
  fetchInventoryForSales,
  updateSaleCoreDetails,
  type SaleRecord,
  type ExpenseRecord,
  type InventorySaleOption,
} from "./actions";
import { fetchInvestments } from "@/app/investments/actions";
import { fetchCrmContacts } from "@/app/crm/actions";
import { CsvActions } from "@/components/shared/CsvActions";
import { AddClientModal } from "@/components/shared/AddClientModal";
import { PaymentModal } from "@/components/payments/PaymentModal";
import { PlusIcon, ShoppingCartIcon, ReceiptIcon, SearchIcon, BanknoteIcon, PencilIcon, MessageCircleIcon, CalendarIcon, MailIcon, ScanLineIcon } from "lucide-react";
import dynamic from "next/dynamic";

const BarcodeScanner = dynamic(
  () => import("@/components/scanner/BarcodeScanner").then((m) => m.BarcodeScanner),
  { ssr: false }
);

/**
 * Extract a usable inventory search token from a raw scanner payload.
 * Supports both raw SKUs (`HD-XXXXXXXX`) and the shared label QR payload
 * (`BB|inventory|sku=HD-XXXXXXXX`). Falls back to the raw value.
 */
function extractScannedToken(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  if (t.startsWith("BB|")) {
    for (const part of t.split("|")) {
      const eq = part.indexOf("=");
      if (eq < 0) continue;
      const key = part.slice(0, eq);
      const val = part.slice(eq + 1);
      if (key === "sku" && val) return val;
    }
  }
  return t;
}
import { buildPaymentRequestText, buildCalendarEventUrl, mailtoPaymentHref } from "@/lib/sales/paymentRequest";
import {
  computeMediationCommissionDisplay,
  computeSaleRowDisplay,
} from "@/src/services/crm.logic";
import { cn } from "@/lib/utils";
import { useViewMode } from "@/lib/hooks/useViewMode";
import { ViewToggle } from "@/app/components/ViewToggle";

const SALE_TYPES = ["ממלאי", "תיווך", "פרויקט חדש"] as const;
type SaleType = (typeof SALE_TYPES)[number];

const EXPENSE_CATEGORIES = ["משלוח", "פרסום", "הגהה", "תפירה", "אחר"];

export default function SalesClient() {
  const [viewMode, setViewMode] = useViewMode("sales");
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [saleOpen, setSaleOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saleType, setSaleType] = useState<SaleType>("ממלאי");
  const [inventoryItems, setInventoryItems] = useState<InventorySaleOption[]>([]);
  const [investments, setInvestments] = useState<{ id: string; item_details: string | null; status: string }[]>([]);
  const [contacts, setContacts] = useState<{ id: string; name: string }[]>([]);
  const [inventorySearch, setInventorySearch] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [newSaleItemId, setNewSaleItemId] = useState("");
  const [newSaleBuyerId, setNewSaleBuyerId] = useState("");
  const [newSaleSellerId, setNewSaleSellerId] = useState("");
  const [newSaleInvestmentId, setNewSaleInvestmentId] = useState("");
  const [newSaleItemDescription, setNewSaleItemDescription] = useState("");
  const [newSaleQuantity, setNewSaleQuantity] = useState("");
  const [newSalePrice, setNewSalePrice] = useState("");
  const [newSaleAmountPaid, setNewSaleAmountPaid] = useState("");
  const [newSaleCommission, setNewSaleCommission] = useState("");
  const [newSaleNotes, setNewSaleNotes] = useState("");
  const [newExpCategory, setNewExpCategory] = useState("");
  const [newExpAmount, setNewExpAmount] = useState("");
  const [newExpNotes, setNewExpNotes] = useState("");
  const [addClientOpen, setAddClientOpen] = useState(false);
  const [addClientTarget, setAddClientTarget] = useState<"buyer" | "seller">("buyer");
  const [buyerSearch, setBuyerSearch] = useState("");
  const [sellerSearch, setSellerSearch] = useState("");
  const [paymentSaleId, setPaymentSaleId] = useState<string | null>(null);
  const [editSale, setEditSale] = useState<SaleRecord | null>(null);
  const [editSaleDate, setEditSaleDate] = useState("");
  const [editSalePrice, setEditSalePrice] = useState("");
  const [editQuantity, setEditQuantity] = useState("1");
  const [editNotes, setEditNotes] = useState("");

  const loadData = () => {
    fetchSales().then((r) => r.success && setSales(r.sales));
    fetchExpenses().then((r) => r.success && setExpenses(r.expenses));
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (saleOpen || editSale) {
      fetchInventoryForSales().then((r) => {
        if (r.success) setInventoryItems(r.items);
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
  }, [saleOpen, editSale]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!editSale) return;
    setEditSaleDate(editSale.sale_date ? editSale.sale_date.slice(0, 10) : "");
    const qty = editSale.quantity ?? 1;
    setEditSalePrice(String(editSale.sale_price));
    setEditQuantity(String(qty));
    setEditNotes(editSale.notes ?? "");
  }, [editSale]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const filteredInventory = inventorySearch.trim()
    ? inventoryItems.filter((i) => {
        const q = inventorySearch.toLowerCase();
        return (
          i.display_label.toLowerCase().includes(q) ||
          (i.product_category ?? "").toLowerCase().includes(q) ||
          (i.sku ?? "").toLowerCase().includes(q) ||
          (i.barcode ?? "").toLowerCase().includes(q) ||
          (i.scribe_name ?? "").toLowerCase().includes(q) ||
          (i.size ?? "").toLowerCase().includes(q)
        );
      })
    : inventoryItems;

  const selectedInventoryLine = inventoryItems.find((i) => i.id === newSaleItemId);
  const maxQtyToSell = selectedInventoryLine?.quantity ?? 1;
  const filteredBuyerContacts = useMemo(() => {
    const q = buyerSearch.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((c) => c.name.toLowerCase().includes(q));
  }, [buyerSearch, contacts]);
  const filteredSellerContacts = useMemo(() => {
    const q = sellerSearch.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((c) => c.name.toLowerCase().includes(q));
  }, [sellerSearch, contacts]);

  const handleCreateSale = async () => {
    if (saleType === "ממלאי") {
      const unitPrice = parseFloat(newSalePrice);
      const qty = parseInt(newSaleQuantity, 10);
      const amountPaid = parseFloat(newSaleAmountPaid) || 0;
      if (!newSaleItemId || !Number.isFinite(qty) || qty <= 0 || isNaN(unitPrice) || unitPrice <= 0) {
        toast.error("בחר פריט והזן כמות ומחיר ליחידה");
        return;
      }
      if (qty > maxQtyToSell) {
        toast.error(`הכמות המקסימלית הזמינה היא ${maxQtyToSell}`);
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
        actual_commission_received: commission,
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
    setNewSaleQuantity("");
    setNewSalePrice("");
    setNewSaleAmountPaid("");
    setNewSaleCommission("");
    setNewSaleNotes("");
    setInventorySearch("");
    setBuyerSearch("");
    setSellerSearch("");
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

  const handleSaveEditSale = async () => {
    if (!editSale) return;
    const salePrice = parseFloat(editSalePrice);
    const qty = Math.max(1, parseInt(editQuantity, 10) || 1);
    if (Number.isNaN(salePrice) || salePrice < 0) {
      toast.error("הזן מחיר ליחידה תקין");
      return;
    }
    setLoading(true);
    const res = await updateSaleCoreDetails(editSale.id, {
      sale_price: salePrice,
      quantity: qty,
      notes: editNotes.trim() || undefined,
      sale_date: editSaleDate || undefined,
    });
    setLoading(false);
    if (res.success) {
      toast.success("המכירה עודכנה");
      setEditSale(null);
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

  const paymentSale = useMemo(
    () => (paymentSaleId ? sales.find((s) => s.id === paymentSaleId) ?? null : null),
    [paymentSaleId, sales]
  );

  return (
    <div className="space-y-4">
      <Tabs defaultValue="sales" className="w-full">
        <TabsList className="mb-4 h-9 rounded-lg bg-muted px-1 py-0.5">
          <TabsTrigger value="sales" className="h-8 rounded-md px-2.5 text-xs sm:text-sm data-[state=active]:bg-card data-[state=active]:shadow-sm">
            <ShoppingCartIcon className="size-4 ml-1" />
            ניהול מכירות
          </TabsTrigger>
          <TabsTrigger value="expenses" className="h-8 rounded-md px-2.5 text-xs sm:text-sm data-[state=active]:bg-card data-[state=active]:shadow-sm">
            <ReceiptIcon className="size-4 ml-1" />
            הוצאות ותזרים
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sales" className="mt-0">
          <Card className="rounded-lg border-border shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between px-4 py-3">
              <div>
                <CardTitle className="text-sm font-semibold sm:text-base">מכירות</CardTitle>
                <CardDescription className="text-xs sm:text-sm">היסטוריית מכירות – ממלאי, תיווך, פרויקטים</CardDescription>
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2">
                <ViewToggle mode={viewMode} onChange={setViewMode} />
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
                <Button onClick={() => setSaleOpen(true)} className="h-8 rounded-lg bg-primary px-3 text-xs text-primary-foreground hover:bg-primary/90 sm:h-9 sm:text-sm">
                  <PlusIcon className="size-4 ml-1" />
                  מכירה חדשה
                </Button>
              </div>
            </CardHeader>
            <CardContent className="px-3 pb-3 pt-0 sm:px-4">
              {viewMode === "grid" ? (
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {sales.map((s, i) => {
                    const { totalDeal, paid, balance, paidPct: pct } = computeSaleRowDisplay(s);
                    const isMediation = s.sale_type === "תיווך";
                    const mediation = isMediation ? computeMediationCommissionDisplay(s) : null;
                    return (
                      <div
                        key={s.id}
                        className={cn(
                          "card-interactive rounded-lg border border-border bg-card p-3 space-y-2",
                          `animate-scale-in stagger-${Math.min(i + 1, 8) as 1|2|3|4|5|6|7|8}`
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">
                            {s.sale_type ?? "ממלאי"}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(s.sale_date).toLocaleDateString("he-IL")}
                          </span>
                        </div>
                        <p className="text-sm font-semibold leading-tight">{getSaleDisplay(s)}</p>
                        {s.buyer_name && (
                          <p className="text-xs text-muted-foreground">קונה: {s.buyer_name}</p>
                        )}
                        {isMediation && mediation && (
                          <div className="rounded-md border border-sky-100 bg-sky-50/50 p-1.5 text-[11px] leading-[1.1rem]">
                            <p className="font-semibold text-sky-900">
                              סטטוס עמלה: {mediation.status}
                            </p>
                            <p className="text-slate-700">
                              צפוי: {mediation.expectedCommission.toLocaleString("he-IL")} ₪ · התקבל:{" "}
                              {mediation.receivedCommission.toLocaleString("he-IL")} ₪ · יתרה:{" "}
                              {mediation.remainingCommission.toLocaleString("he-IL")} ₪
                            </p>
                          </div>
                        )}
                        <div className="space-y-0.5">
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">שולם</span>
                            <span className="font-medium">{paid.toLocaleString("he-IL")} / {totalDeal.toLocaleString("he-IL")} ₪</span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full bg-primary transition-all duration-500"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className={cn("font-medium", balance > 0 ? "text-amber-700" : "text-emerald-600")}>
                            {balance > 0 ? `יתרה: ${balance.toLocaleString("he-IL")} ₪` : "שולם במלואו"}
                          </span>
                          {s.profit != null && (
                            <span className={s.profit >= 0 ? "text-emerald-600" : "text-red-600"}>
                              רווח: {s.profit.toLocaleString("he-IL")} ₪
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1 pt-0.5">
                          <Button type="button" variant="outline" size="sm" className="h-7 flex-1 rounded-md text-[11px]" onClick={() => setEditSale(s)}>
                            <PencilIcon className="size-3.5 ml-1" />ערוך
                          </Button>
                          <Button type="button" variant="outline" size="sm" className="h-7 flex-1 rounded-md text-[11px]" onClick={() => setPaymentSaleId(s.id)}>
                            <BanknoteIcon className="size-3.5 ml-1" />
                            {isMediation ? "רשום קבלת עמלה" : "תשלום"}
                          </Button>
                          {/* שלח לאישור — WA */}
                          <a
                            href={`/whatsapp?message=${encodeURIComponent(buildPaymentRequestText({ buyerName: s.buyer_name ?? null, itemDescription: getSaleDisplay(s), totalPrice: s.total_price ?? s.sale_price, totalPaid: s.total_paid ?? 0, remainingBalance: s.remaining_balance ?? 0, saleDate: s.sale_date, notes: s.notes }))}`}
                            title="שלח בקשת תשלום בוואטסאפ"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background text-emerald-600 transition-colors hover:bg-emerald-50 text-xs"
                          >
                            <MessageCircleIcon className="size-3.5" />
                          </a>
                          {/* שלח במייל */}
                          <a
                            href={mailtoPaymentHref({ buyerName: s.buyer_name ?? null, itemDescription: getSaleDisplay(s), totalPrice: s.total_price ?? s.sale_price, totalPaid: s.total_paid ?? 0, remainingBalance: s.remaining_balance ?? 0, saleDate: s.sale_date, notes: s.notes })}
                            title="שלח בקשת תשלום במייל"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background text-blue-600 transition-colors hover:bg-blue-50 text-xs"
                          >
                            <MailIcon className="size-3.5" />
                          </a>
                          {/* הוסף ליומן */}
                          <a
                            href={buildCalendarEventUrl({ title: `תשלום: ${getSaleDisplay(s)}`, date: s.sale_date, details: `קונה: ${s.buyer_name ?? "—"}\nסכום: ${(s.total_price ?? s.sale_price).toLocaleString("he-IL")} ₪\nיתרה: ${(s.remaining_balance ?? 0).toLocaleString("he-IL")} ₪` })}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="הוסף תזכורת ליומן Google"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background text-indigo-600 transition-colors hover:bg-indigo-50 text-xs"
                          >
                            <CalendarIcon className="size-3.5" />
                          </a>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="overflow-x-auto rounded-lg border">
                  <Table className="text-xs lg:text-sm">
                    <TableHeader>
                      <TableRow className="bg-muted/40">
                        <TableHead className="h-9 whitespace-nowrap px-2 py-1.5 font-semibold">סוג</TableHead>
                        <TableHead className="h-9 whitespace-nowrap px-2 py-1.5 font-semibold">תאריך</TableHead>
                        <TableHead className="h-9 whitespace-nowrap px-2 py-1.5 font-semibold">פריט</TableHead>
                        <TableHead className="h-9 whitespace-nowrap px-2 py-1.5 font-semibold">קונה</TableHead>
                        <TableHead className="h-9 whitespace-nowrap px-2 py-1.5 font-semibold">סה״כ עסקה</TableHead>
                        <TableHead className="h-9 whitespace-nowrap px-2 py-1.5 font-semibold">סה״כ שולם</TableHead>
                        <TableHead className="h-9 whitespace-nowrap px-2 py-1.5 font-semibold">יתרת חוב</TableHead>
                        <TableHead className="h-9 whitespace-nowrap px-2 py-1.5 font-semibold">רווח על הנייר</TableHead>
                        <TableHead className="h-9 whitespace-nowrap px-2 py-1.5 font-semibold">רווח מוכר</TableHead>
                        <TableHead className="h-9 whitespace-nowrap px-2 py-1.5 font-semibold">סטטוס עמלה</TableHead>
                        <TableHead className="h-9 w-28 whitespace-nowrap px-2 py-1.5 font-semibold">פעולות</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sales.map((s, i) => {
                        const { totalDeal, paid, balance } = computeSaleRowDisplay(s);
                        const isMediation = s.sale_type === "תיווך";
                        const mediation = isMediation ? computeMediationCommissionDisplay(s) : null;
                        return (
                          <TableRow key={s.id} className={`table-row-animate h-10 align-middle stagger-${Math.min(i + 1, 8) as 1|2|3|4|5|6|7|8}`}>
                            <TableCell className="whitespace-nowrap px-2 py-1.5">
                              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px]">
                                {s.sale_type ?? "ממלאי"}
                              </span>
                            </TableCell>
                            <TableCell className="whitespace-nowrap px-2 py-1.5">{new Date(s.sale_date).toLocaleDateString("he-IL")}</TableCell>
                            <TableCell className="max-w-[200px] truncate px-2 py-1.5">{getSaleDisplay(s)}</TableCell>
                            <TableCell className="max-w-[160px] truncate px-2 py-1.5">{s.buyer_name ?? "—"}</TableCell>
                            <TableCell className="whitespace-nowrap px-2 py-1.5">{totalDeal.toLocaleString("he-IL")} ₪</TableCell>
                            <TableCell className="whitespace-nowrap px-2 py-1.5">{paid.toLocaleString("he-IL")} ₪</TableCell>
                            <TableCell className={cn("whitespace-nowrap px-2 py-1.5", balance > 0 ? "font-medium text-amber-700" : "")}>
                              {balance.toLocaleString("he-IL")} ₪
                            </TableCell>
                            <TableCell className={cn("whitespace-nowrap px-2 py-1.5", s.profit != null && s.profit >= 0 ? "text-emerald-600" : "text-red-600")}>
                              {s.profit != null ? `${s.profit.toLocaleString("he-IL")} ₪` : "—"}
                            </TableCell>
                            <TableCell className="whitespace-nowrap px-2 py-1.5 text-xs lg:text-sm">
                              {s.realized_recovery_profit != null
                                ? `${s.realized_recovery_profit.toLocaleString("he-IL")} ₪`
                                : "—"}
                            </TableCell>
                            <TableCell className="px-2 py-1.5 text-[11px] lg:text-xs">
                              {mediation ? (
                                <div className="space-y-1">
                                  <p className="font-semibold">{mediation.status}</p>
                                  <p>
                                    צפוי {mediation.expectedCommission.toLocaleString("he-IL")} ₪ · התקבל{" "}
                                    {mediation.receivedCommission.toLocaleString("he-IL")} ₪ · יתרה{" "}
                                    {mediation.remainingCommission.toLocaleString("he-IL")} ₪
                                  </p>
                                </div>
                              ) : (
                                "—"
                              )}
                            </TableCell>
                            <TableCell className="px-2 py-1.5">
                              <div className="flex flex-wrap gap-1">
                                <Button type="button" variant="outline" size="sm" className="h-7 rounded-md text-[11px]" onClick={() => setEditSale(s)}>
                                  <PencilIcon className="size-3.5 ml-1" />ערוך
                                </Button>
                                <Button type="button" variant="outline" size="sm" className="h-7 rounded-md text-[11px]" onClick={() => setPaymentSaleId(s.id)}>
                                  <BanknoteIcon className="size-3.5 ml-1" />
                                  {isMediation ? "רשום קבלת עמלה" : "תשלום"}
                                </Button>
                                <a
                                  href={`/whatsapp?message=${encodeURIComponent(buildPaymentRequestText({ buyerName: s.buyer_name ?? null, itemDescription: getSaleDisplay(s), totalPrice: s.total_price ?? s.sale_price, totalPaid: s.total_paid ?? 0, remainingBalance: s.remaining_balance ?? 0, saleDate: s.sale_date, notes: s.notes }))}`}
                                  title="שלח בקשת תשלום בוואטסאפ"
                                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background text-emerald-600 transition-colors hover:bg-emerald-50"
                                ><MessageCircleIcon className="size-3.5" /></a>
                                <a
                                  href={mailtoPaymentHref({ buyerName: s.buyer_name ?? null, itemDescription: getSaleDisplay(s), totalPrice: s.total_price ?? s.sale_price, totalPaid: s.total_paid ?? 0, remainingBalance: s.remaining_balance ?? 0, saleDate: s.sale_date, notes: s.notes })}
                                  title="שלח בקשת תשלום במייל"
                                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background text-blue-600 transition-colors hover:bg-blue-50"
                                ><MailIcon className="size-3.5" /></a>
                                <a
                                  href={buildCalendarEventUrl({ title: `תשלום: ${getSaleDisplay(s)}`, date: s.sale_date, details: `קונה: ${s.buyer_name ?? "—"}\nסכום: ${(s.total_price ?? s.sale_price).toLocaleString("he-IL")} ₪` })}
                                  target="_blank" rel="noopener noreferrer"
                                  title="הוסף ליומן Google"
                                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background text-indigo-600 transition-colors hover:bg-indigo-50"
                                ><CalendarIcon className="size-3.5" /></a>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
              {sales.length === 0 && (
                <p className="py-8 text-center text-muted-foreground">אין מכירות</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="expenses" className="mt-0">
          <Card className="rounded-lg border-border shadow-sm">
            <CardHeader className="px-4 py-3">
              <CardTitle className="text-base font-semibold">הוצאות</CardTitle>
              <CardDescription>רישום הוצאות יומי</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 px-3 pb-3 pt-0 sm:px-4">
              <div className="flex flex-wrap gap-2 rounded-lg border border-border bg-muted/50 p-2.5">
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
                  onChange={handleNumericChange(setNewExpAmount)}
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
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
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
                      saleType === t ? "border-primary bg-primary/10 text-primary" : "border-border"
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
                  <div className="relative mb-2 flex gap-2">
                    <div className="relative grow">
                      <SearchIcon className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                      <Input
                        value={inventorySearch}
                        onChange={(e) => setInventorySearch(e.target.value)}
                        placeholder="סרוק ברקוד / הקלד מק״ט, קטגוריה או סופר..."
                        className="rounded-xl pr-10"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setScannerOpen(true)}
                      className="shrink-0 rounded-xl"
                      title="סרוק ברקוד"
                    >
                      <ScanLineIcon className="size-4 ml-1" />
                      סרוק
                    </Button>
                  </div>
                  {scannerOpen ? (
                    <BarcodeScanner
                      onClose={() => setScannerOpen(false)}
                      onDecoded={(raw) => {
                        const token = extractScannedToken(raw);
                        if (token) {
                          setInventorySearch(token);
                          toast.success(`נסרק: ${token}`);
                        }
                        setScannerOpen(false);
                      }}
                    />
                  ) : null}
                  <select
                    value={newSaleItemId}
                    onChange={(e) => {
                      setNewSaleItemId(e.target.value);
                      setNewSaleQuantity("");
                    }}
                    className="w-full rounded-xl border px-3 py-2 text-sm"
                  >
                    <option value="">בחר פריט</option>
                    {filteredInventory.map((i) => (
                      <option key={i.id} value={i.id}>{i.display_label}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-semibold">כמות למכירה (מקס׳ {maxQtyToSell})</label>
                    <Input
                      type="number"
                      min={1}
                      max={maxQtyToSell}
                      value={newSaleQuantity}
                      onChange={handleNumericChange(setNewSaleQuantity)}
                      placeholder="לדוגמה: 1"
                      className="rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-semibold">מחיר ליחידה (₪)</label>
                    <Input
                      type="number"
                      min={0}
                      value={newSalePrice}
                      onChange={handleNumericChange(setNewSalePrice)}
                      placeholder="לדוגמה: 250"
                      className="rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-semibold">שולם עד כה (₪)</label>
                    <Input
                      type="number"
                      min={0}
                      value={newSaleAmountPaid}
                      onChange={handleNumericChange(setNewSaleAmountPaid)}
                      placeholder="ריק = לא שולם עדיין"
                      className="rounded-xl"
                    />
                  </div>
                </div>
                {(() => {
                  const qty = parseInt(newSaleQuantity, 10);
                  const unitPrice = parseFloat(newSalePrice);
                  const paid = parseFloat(newSaleAmountPaid) || 0;
                  const total = Number.isFinite(qty) && qty > 0 && !isNaN(unitPrice) && unitPrice >= 0 ? qty * unitPrice : null;
                  const remaining = total != null ? total - paid : null;
                  if (total == null) return null;
                  return (
                    <div className="rounded-lg bg-muted/50 p-3 space-y-1 text-sm">
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
                  <label className="mb-1.5 block text-sm font-semibold">בעלים מקורי (אופציונלי)</label>
                  <div className="space-y-2">
                    <Input
                      value={sellerSearch}
                      onChange={(e) => setSellerSearch(e.target.value)}
                      placeholder="חפש בעלים לפי שם..."
                      className="rounded-xl"
                    />
                    <div className="flex gap-2">
                      <select
                        value={newSaleSellerId}
                        onChange={(e) => setNewSaleSellerId(e.target.value)}
                        className="flex-1 rounded-xl border px-3 py-2"
                      >
                        <option value="">—</option>
                        {filteredSellerContacts.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setAddClientTarget("seller");
                          setAddClientOpen(true);
                        }}
                        className="rounded-xl shrink-0"
                      >
                        <PlusIcon className="size-4 ml-1" />
                        צור איש קשר חדש
                      </Button>
                    </div>
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-semibold">עמלה בפועל שהתקבלה (₪)</label>
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    value={newSaleCommission}
                    onChange={handleNumericChange(setNewSaleCommission)}
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
                    onChange={handleNumericChange(setNewSalePrice)}
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
                    onChange={handleNumericChange(setNewSaleAmountPaid)}
                    placeholder="0"
                    className="rounded-xl"
                  />
                </div>
              </>
            )}

            <div>
              <label className="mb-1.5 block text-sm font-semibold">קונה (אופציונלי)</label>
              <div className="space-y-2">
                <Input
                  value={buyerSearch}
                  onChange={(e) => setBuyerSearch(e.target.value)}
                  placeholder="חפש קונה לפי שם..."
                  className="rounded-xl"
                />
                <div className="flex gap-2">
                  <select
                    value={newSaleBuyerId}
                    onChange={(e) => setNewSaleBuyerId(e.target.value)}
                    className="flex-1 rounded-xl border px-3 py-2"
                  >
                    <option value="">—</option>
                    {filteredBuyerContacts.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setAddClientTarget("buyer");
                      setAddClientOpen(true);
                    }}
                    className="rounded-xl shrink-0"
                  >
                    <PlusIcon className="size-4 ml-1" />
                    צור איש קשר חדש
                  </Button>
                </div>
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

      <Dialog
        open={!!editSale}
        onOpenChange={(o) => {
          if (!o) setEditSale(null);
        }}
      >
        <DialogContent className="sm:max-w-md rounded-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>עריכת מכירה</DialogTitle>
          </DialogHeader>
          {editSale && (
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                סוג: <span className="font-medium text-foreground">{editSale.sale_type ?? "ממלאי"}</span>
                {" · "}
                פריט: <span className="font-medium text-foreground">{getSaleDisplay(editSale)}</span>
              </p>

              <div>
                <label className="mb-1 block font-semibold">תאריך מכירה</label>
                <Input
                  type="date"
                  value={editSaleDate}
                  onChange={(e) => setEditSaleDate(e.target.value)}
                  className="rounded-xl"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block font-semibold">
                    {editSale.sale_type === "תיווך" ? "עמלה (₪)" : "מחיר ליחידה (₪)"}
                  </label>
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                  value={editSalePrice}
                  onChange={handleNumericChange(setEditSalePrice)}
                  className="rounded-xl"
                />
                </div>
                <div>
                  <label className="mb-1 block font-semibold">כמות</label>
                  <Input
                    type="number"
                    min={1}
                    step={1}
                    value={editQuantity}
                    onChange={handleNumericChange(setEditQuantity)}
                    className="rounded-xl"
                    disabled={editSale.sale_type === "תיווך" || editSale.sale_type === "פרויקט חדש"}
                  />
                </div>
              </div>
              {(() => {
                const p = parseFloat(editSalePrice);
                const q = parseInt(editQuantity, 10) || 1;
                if (Number.isNaN(p) || p < 0) return null;
                return (
                  <p className="text-xs text-muted-foreground rounded-lg bg-muted/50 px-3 py-2">
                    סה״כ עסקה: <span className="font-semibold text-foreground">{(p * q).toLocaleString("he-IL")} ₪</span>
                    {editSale.sale_type === "תיווך" && " (יסונכרן לשדות עמלה)"}
                  </p>
                );
              })()}

              <div>
                <label className="mb-1 block font-semibold">הערות</label>
                <Input
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="הערות אופציונליות"
                  className="rounded-xl"
                />
              </div>

              <Button onClick={() => void handleSaveEditSale()} disabled={loading} className="w-full rounded-xl">
                {loading ? "שומר..." : "שמור שינויים"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <PaymentModal
        open={!!paymentSaleId}
        onOpenChange={(o) => !o && setPaymentSaleId(null)}
        entityId={paymentSaleId}
        entityType="sale"
        title={
          paymentSale?.sale_type === "תיווך"
            ? `רשום קבלת עמלה${paymentSale.buyer_name ? ` · משלם: ${paymentSale.buyer_name}` : ""}`
            : "רישום תשלום — מכירה"
        }
        onSuccess={loadData}
      />

      <AddClientModal
        open={addClientOpen}
        onOpenChange={setAddClientOpen}
        onSuccess={(c) => {
          setContacts((prev) => [...prev, c]);
          if (addClientTarget === "seller") {
            setNewSaleSellerId(c.id);
            setSellerSearch("");
          } else {
            setNewSaleBuyerId(c.id);
            setBuyerSearch("");
          }
        }}
      />

      <ScrollToTop />
    </div>
  );
}
