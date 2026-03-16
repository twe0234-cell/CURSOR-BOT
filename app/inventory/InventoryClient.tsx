"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
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
  createInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  type InventoryItem,
} from "./actions";
import { fetchDropdownOptions } from "@/app/settings/lists/actions";
import { ScribeCombobox } from "@/components/inventory/ScribeCombobox";
import { ImageGallery } from "@/components/inventory/ImageGallery";
import { PlusIcon, PencilIcon, TrashIcon, SendIcon } from "lucide-react";
import type { InventoryItemInput } from "@/lib/validations";

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
  const [torahSizes, setTorahSizes] = useState<string[]>([]);
  const [neviimNames, setNeviimNames] = useState<string[]>([]);
  const [megillaLines, setMegillaLines] = useState<string[]>([]);
  const [scriptTypes, setScriptTypes] = useState<string[]>([]);

  useEffect(() => {
    Promise.all([
      fetchDropdownOptions("categories"),
      fetchDropdownOptions("torah_sizes"),
      fetchDropdownOptions("neviim_names"),
      fetchDropdownOptions("megilla_lines"),
      fetchDropdownOptions("script_types"),
    ]).then(([c, t, n, m, s]) => {
      if (c.success) setCategories(c.options);
      if (t.success) setTorahSizes(t.options);
      if (n.success) setNeviimNames(n.options);
      if (m.success) setMegillaLines(m.options);
      if (s.success) setScriptTypes(s.options);
    });
  }, []);

  const form = useForm<InventoryItemInput & { category_meta?: Record<string, string | number> }>({
    defaultValues: {
      product_category: "",
      category_meta: {},
      script_type: "",
      status: "available",
      cost_price: null,
      target_price: null,
      scribe_id: null,
      scribe_code: null,
      images: [],
      description: "",
    },
  });

  const productCategory = form.watch("product_category");
  const categoryMeta = form.watch("category_meta") ?? {};
  const prevCategoryRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (!editOpen) return;
    if (prevCategoryRef.current !== undefined && prevCategoryRef.current !== productCategory) {
      form.setValue("category_meta", {});
    }
    prevCategoryRef.current = productCategory;
  }, [productCategory, editOpen, form]);

  const openCreate = () => {
    setEditingId(null);
    prevCategoryRef.current = undefined;
    form.reset({
      product_category: "",
      category_meta: {},
      script_type: "",
      status: "available",
      cost_price: null,
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
    prevCategoryRef.current = undefined;
    form.reset({
      product_category: item.product_category ?? "",
      category_meta: (item.category_meta ?? {}) as Record<string, string | number>,
      script_type: item.script_type ?? "",
      status: item.status ?? "available",
      cost_price: item.cost_price ?? null,
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
        cost_price: data.cost_price ?? null,
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

  const showSize = productCategory === "ספר תורה";
  const showNavi = productCategory === "נביא";
  const showLines = productCategory === "מגילה";

  return (
    <div className="w-full max-w-screen-xl mx-auto px-4 py-6 min-w-0 overflow-hidden">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-teal-800">מלאי</h1>
        <Button onClick={openCreate} className="bg-teal-600 hover:bg-teal-700">
          <PlusIcon className="size-4 ml-2" />
          הוסף פריט
        </Button>
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
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "עריכת פריט" : "פריט חדש"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">קטגוריה</label>
              <select
                {...form.register("product_category")}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              >
                <option value="">בחר</option>
                {categories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {showSize && (
              <div>
                <label className="mb-1 block text-sm font-medium">גודל</label>
                <select
                  value={String(categoryMeta.size ?? "")}
                  onChange={(e) =>
                    form.setValue("category_meta", {
                      ...categoryMeta,
                      size: e.target.value,
                    })
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                >
                  <option value="">בחר</option>
                  {torahSizes.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            )}

            {showNavi && (
              <div>
                <label className="mb-1 block text-sm font-medium">נביא</label>
                <select
                  value={String(categoryMeta.navi ?? "")}
                  onChange={(e) =>
                    form.setValue("category_meta", {
                      ...categoryMeta,
                      navi: e.target.value,
                    })
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                >
                  <option value="">בחר</option>
                  {neviimNames.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
            )}

            {showLines && (
              <div>
                <label className="mb-1 block text-sm font-medium">שורות</label>
                <select
                  value={String(categoryMeta.lines ?? "")}
                  onChange={(e) =>
                    form.setValue("category_meta", {
                      ...categoryMeta,
                      lines: e.target.value,
                    })
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                >
                  <option value="">בחר</option>
                  {megillaLines.map((l) => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="mb-1 block text-sm font-medium">שם סופר</label>
              <ScribeCombobox
                value={form.watch("scribe_id") ?? null}
                onChange={(s) => form.setValue("scribe_id", s?.id ?? null)}
                placeholder="בחר סופר"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">כתב</label>
              <select
                {...form.register("script_type")}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              >
                <option value="">בחר</option>
                {scriptTypes.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">סטטוס</label>
              <select
                {...form.register("status")}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              >
                {STATUSES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">תמונות</label>
              <ImageGallery
                images={form.watch("images") ?? []}
                onChange={(images) => form.setValue("images", images)}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium">עלות קנייה</label>
                <Input
                  type="number"
                  {...form.register("cost_price", { valueAsNumber: true })}
                  placeholder="0"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">מחיר יעד למכירה</label>
                <Input
                  type="number"
                  {...form.register("target_price", { valueAsNumber: true })}
                  placeholder="0"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">תיאור</label>
              <Input
                {...form.register("description")}
                placeholder="תיאור"
              />
            </div>

            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
                ביטול
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "שומר..." : "שמור"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
