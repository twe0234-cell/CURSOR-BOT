"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useForm, FormProvider } from "react-hook-form";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  createInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  type InventoryItem,
} from "./actions";
import { toggleInventoryShare } from "./actions-share";
import { fetchDropdownOptions } from "@/app/settings/lists/actions";
import { ScribeCombobox } from "@/components/inventory/ScribeCombobox";
import { ImageGallery } from "@/components/inventory/ImageGallery";
import { DependentCategories } from "@/components/inventory/DependentCategories";
import { CsvActions } from "@/components/shared/CsvActions";
import { PlusIcon, PencilIcon, TrashIcon, SendIcon, Package, Wallet, Image as ImageIcon, Check, Share2Icon, LinkIcon, UnlinkIcon } from "lucide-react";
import type { InventoryItemInput } from "@/lib/validations/inventory";

const STATUSES = ["available", "in_use", "sold", "reserved"];

type Props = {
  initialItems: InventoryItem[];
};

export default function InventoryClient({ initialItems }: Props) {
  const [items, setItems] = useState(initialItems);
  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [categories, setCategories] = useState<string[]>([]);
  const [scriptTypes, setScriptTypes] = useState<string[]>([]);

  useEffect(() => {
    Promise.all([
      fetchDropdownOptions("categories"),
      fetchDropdownOptions("script_types"),
    ]).then(([c, s]) => {
      if (c.success) setCategories(c.options);
      if (s.success) setScriptTypes(s.options);
    });
  }, []);

  const form = useForm<InventoryItemInput & { category_meta?: Record<string, string | number> }>({
    defaultValues: {
      product_category: "",
      category_meta: {},
      script_type: "",
      status: "available",
      quantity: 1,
      cost_price: null,
      amount_paid: 0,
      target_price: null,
      scribe_id: null,
      scribe_code: null,
      images: [],
      description: "",
    },
  });

  const openCreate = () => {
    setEditingId(null);
    form.reset({
      product_category: "",
      category_meta: {},
      script_type: "",
      status: "available",
      quantity: 1,
      cost_price: null,
      amount_paid: 0,
      target_price: null,
      scribe_id: null,
      scribe_code: null,
      images: [],
      description: "",
    });
    setEditOpen(true);
  };

  const openEdit = (item: InventoryItem) => {
    setEditingId(item.id);
    form.reset({
      product_category: item.product_category ?? "",
      category_meta: (item.category_meta ?? {}) as Record<string, string | number>,
      script_type: item.script_type ?? "",
      status: item.status ?? "available",
      quantity: item.quantity ?? 1,
      cost_price: item.cost_price ?? null,
      amount_paid: item.amount_paid ?? 0,
      target_price: item.target_price ?? null,
      scribe_id: item.scribe_id ?? null,
      scribe_code: item.scribe_code ?? null,
      images: item.images ?? [],
      description: item.description ?? "",
    });
    setEditOpen(true);
  };

  const handleSave = form.handleSubmit(async (data) => {
    setLoading(true);
    try {
      const payload: Partial<InventoryItem> = {
        product_category: data.product_category || null,
        category_meta: data.category_meta ?? {},
        script_type: data.script_type || null,
        status: data.status || null,
        quantity: data.quantity ?? 1,
        cost_price: data.cost_price ?? null,
        amount_paid: data.amount_paid ?? 0,
        target_price: data.target_price ?? null,
        scribe_id: data.scribe_id ?? null,
        scribe_code: data.scribe_code ?? null,
        images: data.images ?? [],
        description: data.description || null,
      };

      const res = editingId
        ? await updateInventoryItem(editingId, payload)
        : await createInventoryItem(payload);

      if (res.success) {
        toast.success(editingId ? "עודכן" : "נוסף");
        setEditOpen(false);
        window.location.reload();
      } else {
        toast.error(res.error);
      }
    } catch {
      toast.error("שגיאה");
    } finally {
      setLoading(false);
    }
  });

  const handleShare = async (item: InventoryItem) => {
    if (item.is_public && item.public_slug) {
      const url = `${window.location.origin}/p/${item.public_slug}`;
      await navigator.clipboard.writeText(url);
      toast.success("הקישור הועתק ללוח");
      return;
    }
    const res = await toggleInventoryShare(item.id);
    if (res.success && res.link) {
      const url = `${window.location.origin}${res.link}`;
      await navigator.clipboard.writeText(url);
      toast.success("הקישור הועתק ללוח");
      window.location.reload();
    } else if (res.success) {
      toast.success("שיתוף בוטל");
      window.location.reload();
    } else {
      toast.error(res.error);
    }
  };

  const handleUnshare = async (item: InventoryItem) => {
    if (!item.is_public) return;
    const res = await toggleInventoryShare(item.id);
    if (res.success) {
      toast.success("שיתוף בוטל");
      window.location.reload();
    } else {
      toast.error(res.error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("למחוק?")) return;
    setLoading(true);
    try {
      const res = await deleteInventoryItem(id);
      if (res.success) {
        setItems((prev) => prev.filter((i) => i.id !== id));
        toast.success("נמחק");
        window.location.reload();
      } else {
        toast.error(res.error);
      }
    } catch {
      toast.error("שגיאה");
    } finally {
      setLoading(false);
    }
  };

  const getBroadcastMessage = (item: InventoryItem): string => {
    const type = item.product_category ?? "פריט";
    const script = item.script_type ?? "";
    const price = item.target_price != null ? `מחיר: ${item.target_price} ₪` : "";
    return `פריט חדש! ${type}${script ? `, כתב ${script}` : ""} זמין. ${price}`.trim();
  };

  return (
    <div className="w-full max-w-screen-xl mx-auto px-4 py-6 min-w-0 overflow-hidden bg-slate-50/50 min-h-screen" dir="rtl">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-teal-800">מלאי</h1>
        <div className="flex items-center gap-2">
          <CsvActions
            data={items.map((i) => ({
              id: i.id,
              product_category: i.product_category,
              script_type: i.script_type,
              status: i.status,
              cost_price: i.cost_price,
              target_price: i.target_price,
              scribe_code: i.scribe_code,
              description: i.description,
            }))}
            onImport={(rows) => toast.info(`יובאו ${rows.length} שורות. ייבוא מלאי יתווסף בעדכון.`)}
            filename="inventory"
          />
          <Button onClick={openCreate} className="bg-teal-600 hover:bg-teal-700">
          <PlusIcon className="size-4 ml-2" />
          הוסף פריט
        </Button>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white overflow-x-auto">
        <Table className="min-w-0">
          <TableHeader>
            <TableRow>
              <TableHead>קטגוריה</TableHead>
              <TableHead>כתב</TableHead>
              <TableHead>סטטוס</TableHead>
              <TableHead>מחיר יעד</TableHead>
              <TableHead className="w-40">פעולות</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="truncate max-w-[120px]">{item.product_category ?? "—"}</TableCell>
                <TableCell className="truncate max-w-[80px]">{item.script_type ?? "—"}</TableCell>
                <TableCell>{item.status ?? "—"}</TableCell>
                <TableCell>
                  {item.target_price != null ? `${item.target_price} ₪` : "—"}
                </TableCell>
                <TableCell>
                  {item.is_public ? (
                    <>
                      <Button size="sm" variant="default" onClick={() => handleShare(item)} title="העתק קישור" className="rounded-lg">
                        <LinkIcon className="size-4 ml-1" />
                        העתק קישור
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleUnshare(item)} title="בטל שיתוף" className="rounded-lg text-slate-500">
                        <UnlinkIcon className="size-4" />
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => handleShare(item)} title="שיתוף והעתק קישור" className="rounded-lg">
                      <Share2Icon className="size-4 ml-1" />
                      שיתוף
                    </Button>
                  )}
                  <Link
                    href={`/whatsapp?message=${encodeURIComponent(getBroadcastMessage(item))}`}
                  >
                    <Button size="sm" variant="outline">
                      <SendIcon className="size-4 ml-1" />
                      שידור
                    </Button>
                  </Link>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => openEdit(item)}
                  >
                    <PencilIcon className="size-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDelete(item.id)}
                    disabled={loading}
                  >
                    <TrashIcon className="size-4 text-red-600" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {items.length === 0 && (
        <p className="py-12 text-center text-muted-foreground">
          אין פריטים. לחץ על &quot;הוסף פריט&quot;
        </p>
      )}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto bg-slate-50/30" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editingId ? "עריכת פריט" : "פריט חדש"}</DialogTitle>
          </DialogHeader>
          <FormProvider {...form} key={editingId ?? "create"}>
            <form onSubmit={handleSave} className="space-y-6">
              <Card className="shadow-sm rounded-xl border-slate-200 bg-white">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <Package className="w-5 h-5 text-indigo-500" />
                    <CardTitle className="text-base font-semibold text-slate-700">פרטי המוצר</CardTitle>
                  </div>
                  <CardDescription>קטגוריה ותכונות תלויות</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-sm font-semibold text-slate-800">קטגוריה</label>
                      <select
                        {...form.register("product_category")}
                        className="w-full rounded-xl border border-slate-300 bg-white shadow-sm px-3 py-2.5 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                      >
                        <option value="">בחר</option>
                        {categories.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                    <DependentCategories />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-sm font-semibold text-slate-800">כתב</label>
                      <select
                        {...form.register("script_type")}
                        className="w-full rounded-xl border border-slate-300 bg-white shadow-sm px-3 py-2.5 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                      >
                        <option value="">בחר</option>
                        {scriptTypes.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-sm font-semibold text-slate-800">סטטוס</label>
                      <select
                        {...form.register("status")}
                        className="w-full rounded-xl border border-slate-300 bg-white shadow-sm px-3 py-2.5 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                      >
                        {STATUSES.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-sm rounded-xl border-slate-200 bg-white">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <Wallet className="w-5 h-5 text-emerald-500" />
                    <CardTitle className="text-base font-semibold text-slate-700">ספק ותמחור</CardTitle>
                  </div>
                  <CardDescription>סופר, עלויות ומחיר יעד</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-semibold text-slate-800">שם סופר</label>
                    <ScribeCombobox
                      value={form.watch("scribe_id") ?? null}
                      onChange={(s) => form.setValue("scribe_id", s?.id ?? null)}
                      placeholder="בחר סופר"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-sm font-semibold text-slate-800">כמות</label>
                      <Input
                        type="number"
                        min={1}
                        {...form.register("quantity", { valueAsNumber: true })}
                        placeholder="1"
                        className="rounded-xl"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-sm font-semibold text-slate-800">עלות ליחידה (₪)</label>
                      <Input
                        type="number"
                        min={0}
                        {...form.register("cost_price", { valueAsNumber: true })}
                        placeholder="0"
                        className="rounded-xl"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-sm font-semibold text-slate-800">שולם עד כה (₪)</label>
                      <Input
                        type="number"
                        min={0}
                        {...form.register("amount_paid", { valueAsNumber: true })}
                        placeholder="0"
                        className="rounded-xl"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-sm font-semibold text-slate-800">מחיר יעד למכירה (₪)</label>
                      <Input
                        type="number"
                        min={0}
                        {...form.register("target_price", { valueAsNumber: true })}
                        placeholder="0"
                        className="rounded-xl"
                      />
                    </div>
                  </div>
                  {(() => {
                    const qty = form.watch("quantity") ?? 1;
                    const cost = form.watch("cost_price");
                    const paid = form.watch("amount_paid") ?? 0;
                    const total = cost != null && !Number.isNaN(cost) ? (qty || 1) * cost : null;
                    const remaining = total != null ? total - paid : null;
                    if (total == null) return null;
                    return (
                      <div className="rounded-lg bg-slate-50 p-3 space-y-1 text-sm">
                        <p className="font-medium">סה״כ לתשלום: {total.toLocaleString("he-IL")} ₪</p>
                        <p className={remaining != null && remaining > 0 ? "text-amber-700 font-medium" : "text-muted-foreground"}>
                          יתרה לתשלום: {remaining != null ? remaining.toLocaleString("he-IL") : "—"} ₪
                        </p>
                      </div>
                    );
                  })()}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-semibold text-slate-800">תיאור</label>
                    <Input
                      {...form.register("description")}
                      placeholder="תיאור"
                      className="rounded-xl"
                    />
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-sm rounded-xl border-slate-200 bg-white">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <ImageIcon className="w-5 h-5 text-amber-500" />
                    <CardTitle className="text-base font-semibold text-slate-700">גלריה</CardTitle>
                  </div>
                  <CardDescription>תמונות המוצר</CardDescription>
                </CardHeader>
                <CardContent>
                  <ImageGallery
                    images={form.watch("images") ?? []}
                    onChange={(images) => form.setValue("images", images)}
                  />
                </CardContent>
              </Card>

              <div className="flex gap-3 justify-end pt-2">
                <Button type="button" variant="outline" onClick={() => setEditOpen(false)} className="rounded-xl">
                  ביטול
                </Button>
                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl px-6"
                >
                  <Check className="w-4 h-4 ml-2" />
                  {loading ? "שומר..." : "שמור"}
                </Button>
              </div>
            </form>
          </FormProvider>
        </DialogContent>
      </Dialog>
    </div>
  );
}
