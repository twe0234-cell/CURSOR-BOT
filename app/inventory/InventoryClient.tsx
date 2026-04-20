"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useForm, FormProvider } from "react-hook-form";
import { numericRegisterOptions, integerRegisterOptions } from "@/lib/numericInput";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollToTop } from "@/components/ui/ScrollToTop";
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
import { fetchDropdownOptions } from "@/app/settings/lists/actions";
import { SCRIPT_TYPES } from "@/lib/constants";
import { UnifiedScribeSelect } from "@/components/crm/UnifiedScribeSelect";
import { ImageGallery } from "@/components/inventory/ImageGallery";
import { DependentCategories } from "@/components/inventory/DependentCategories";
import { CsvActions } from "@/components/shared/CsvActions";
import { BarcodePrint } from "@/components/inventory/BarcodePrint";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { PlusIcon, PencilIcon, TrashIcon, SendIcon, Package, Wallet, Image as ImageIcon, Check, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { useViewMode } from "@/lib/hooks/useViewMode";
import { ViewToggle } from "@/app/components/ViewToggle";
import type { InventoryItemInput } from "@/lib/validations/inventory";
import { INVENTORY_CATEGORY_OPTIONS } from "@/lib/validations/inventory";
import { isInventorySoldStatus, inventoryStatusLabelHe } from "@/lib/inventory/status";

const STATUSES = ["available", "proofreading", "reserved", "sold"] as const;

type Props = {
  initialItems: InventoryItem[];
  /** Server-side fetch failed (e.g. schema mismatch); list may be empty. */
  loadError?: string | null;
};

export default function InventoryClient({ initialItems, loadError }: Props) {
  const [items, setItems] = useState(initialItems);
  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [categories, setCategories] = useState<string[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [viewMode, setViewMode] = useViewMode("inventory");
  const [sortKey, setSortKey] = useState<
    "scribe_name" | "product_category" | "script_type" | "status" | "target_price"
  >("product_category");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const filteredActive = items
    .filter((i) => !isInventorySoldStatus(i.status))
    .filter((i) => !categoryFilter || (i.product_category ?? "") === categoryFilter);
  const filteredArchive = items
    .filter((i) => isInventorySoldStatus(i.status))
    .filter((i) => !categoryFilter || (i.product_category ?? "") === categoryFilter);

  const sortItems = <
    T extends {
      scribe_name?: string | null;
      product_category?: string | null;
      script_type?: string | null;
      status?: string | null;
      target_price?: number | null;
    },
  >(
    arr: T[]
  ) => {
    return [...arr].sort((a, b) => {
      let va: string | number = "";
      let vb: string | number = "";
      if (sortKey === "target_price") {
        va = a.target_price ?? 0;
        vb = b.target_price ?? 0;
      } else {
        va = String(a[sortKey as keyof T] ?? "");
        vb = String(b[sortKey as keyof T] ?? "");
      }
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
  };

  const handleSort = (key: typeof sortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const activeItems = sortItems(filteredActive);
  const archiveItems = sortItems(filteredArchive);

  useEffect(() => {
    if (loadError) {
      toast.error(`טעינת מלאי: ${loadError}`);
    }
  }, [loadError]);

  useEffect(() => {
    fetchDropdownOptions("categories")
      .then((r) => {
        if (r.success && r.options.length > 0) setCategories(r.options);
        else setCategories([...INVENTORY_CATEGORY_OPTIONS]);
      })
      .catch(() => setCategories([...INVENTORY_CATEGORY_OPTIONS]))
      .finally(() => setCategoriesLoading(false));
  }, []);

  type FormValues = Omit<InventoryItemInput, "script_type"> & { script_type?: string | null };
  const form = useForm<FormValues>({
    defaultValues: {
      product_category: "",
      purchase_date: "",
      category_meta: {},
      script_type: "" as string | null,
      status: "available",
      quantity: 1,
      cost_price: null,
      amount_paid: 0,
      target_price: null,
      scribe_id: null,
      scribe_code: null,
      images: [],
      description: "",
      parchment_type: null,
      computer_proofread: false,
      human_proofread: false,
      is_sewn: false,
      has_lamnatzeach: false,
      size: "",
    },
  });

  const openCreate = () => {
    setEditingId(null);
    form.reset({
      product_category: "",
      purchase_date: "",
      category_meta: {},
      script_type: "" as string | null,
      status: "available",
      quantity: 1,
      cost_price: null,
      amount_paid: 0,
      target_price: null,
      scribe_id: null,
      scribe_code: null,
      images: [],
      description: "",
      parchment_type: null,
      computer_proofread: false,
      human_proofread: false,
      is_sewn: false,
      has_lamnatzeach: false,
      size: "",
      megillah_type: "אסתר",
    });
    setEditOpen(true);
  };

  const openEdit = (item: InventoryItem) => {
    setEditingId(item.id);
    const rawMeta = { ...(item.category_meta ?? {}) } as Record<string, string | number>;
    const legacySize =
      rawMeta.size != null && rawMeta.size !== ""
        ? String(rawMeta.size)
        : "";
    delete rawMeta.size;
    const rootSize = (item.size && String(item.size).trim()) || legacySize || "";

    form.reset({
      product_category: item.product_category ?? "",
      purchase_date: item.purchase_date ?? "",
      category_meta: rawMeta,
      script_type: item.script_type && SCRIPT_TYPES.includes(item.script_type as (typeof SCRIPT_TYPES)[number]) ? item.script_type : ("" as string | null),
      status: item.status ?? "available",
      quantity: item.quantity ?? 1,
      cost_price: item.cost_price ?? null,
      amount_paid: item.amount_paid ?? 0,
      target_price: item.target_price ?? null,
      scribe_id: item.scribe_id ?? null,
      scribe_code: item.scribe_code ?? null,
      images: item.images ?? [],
      description: item.description ?? "",
      parchment_type: item.parchment_type ?? null,
      computer_proofread: item.computer_proofread ?? false,
      human_proofread: item.human_proofread ?? false,
      is_sewn: item.is_sewn ?? false,
      has_lamnatzeach: item.has_lamnatzeach ?? false,
      size: rootSize,
      megillah_type: item.megillah_type ?? "אסתר",
    });
    setEditOpen(true);
  };

  const handleSave = form.handleSubmit(async (data) => {
    setLoading(true);
    try {
      const metaPayload = { ...(data.category_meta ?? {}) } as Record<string, unknown>;
      delete metaPayload.size;

      const payload: Partial<InventoryItem> = {
        product_category: data.product_category || null,
        purchase_date: data.purchase_date || null,
        category_meta: metaPayload as InventoryItem["category_meta"],
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
        parchment_type: data.parchment_type || null,
        computer_proofread: data.computer_proofread ?? false,
        human_proofread: data.human_proofread ?? false,
        is_sewn: data.is_sewn ?? false,
        has_lamnatzeach: data.has_lamnatzeach ?? false,
        size: data.size?.trim() || null,
        megillah_type: data.megillah_type ?? null,
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

  return (
    <div className="w-full max-w-screen-xl mx-auto px-4 py-6 min-w-0 overflow-hidden min-h-screen" dir="rtl">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-foreground">מלאי</h1>
        <div className="flex items-center gap-2">
          <CsvActions
            data={items.map((i) => ({
              id: i.id,
              sku: i.sku ?? i.id.slice(0, 8),
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
          <ViewToggle mode={viewMode} onChange={setViewMode} />
          <Button onClick={openCreate} className="bg-primary hover:bg-primary/90 text-primary-foreground">
          <PlusIcon className="size-4 ml-2" />
          הוסף פריט
        </Button>
        </div>
      </div>

      <Tabs defaultValue="active" className="w-full">
        <TabsList className="mb-4 rounded-xl">
          <TabsTrigger value="active" className="rounded-lg">מלאי זמין ({activeItems.length})</TabsTrigger>
          <TabsTrigger value="archive" className="rounded-lg">ארכיון (נמכר) ({archiveItems.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="active" className="mt-0">
          <div className="mb-3 flex items-center gap-2 flex-wrap">
            <label className="text-sm font-medium text-muted-foreground">סינון קטגוריה:</label>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="rounded-lg border border-border px-3 py-1.5 text-sm bg-background"
            >
              <option value="">הכל</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {viewMode === "grid" ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {activeItems.map((item, i) => (
                <div key={item.id} className={cn("animate-scale-in", i < 12 && `stagger-${Math.min(i + 1, 8) as 1|2|3|4|5|6|7|8}`)}>
                  <Card className="border-border bg-card card-interactive overflow-hidden">
                    <div className="relative h-36 bg-muted flex items-center justify-center overflow-hidden">
                      {item.images?.[0] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.images[0]} alt="" className="h-full w-full object-cover" loading="lazy" />
                      ) : (
                        <Package className="size-12 text-muted-foreground/30" />
                      )}
                      {item.status !== "available" && (
                        <span className="absolute top-2 right-2 rounded-full px-2 py-0.5 text-[11px] font-medium bg-background/90 border border-border">
                          {inventoryStatusLabelHe(item.status)}
                        </span>
                      )}
                    </div>
                    <CardContent className="p-3 space-y-1.5">
                      <p className="font-semibold text-sm truncate">{item.product_category ?? "—"}</p>
                      <p className="text-xs text-muted-foreground truncate">{item.scribe_name?.trim() || "—"}</p>
                      {item.script_type && <p className="text-xs text-muted-foreground">{item.script_type}</p>}
                      {item.target_price != null && (
                        <p className="text-sm font-bold text-primary">{item.target_price.toLocaleString("he-IL")} ₪</p>
                      )}
                      <div className="flex gap-1 pt-1">
                        <Link href={`/whatsapp?message=${encodeURIComponent(getBroadcastMessage(item))}`} className="flex-1">
                          <Button size="sm" variant="outline" className="w-full h-7 text-xs">
                            <SendIcon className="size-3 ml-1" />שידור
                          </Button>
                        </Link>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEdit(item)}>
                          <PencilIcon className="size-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => handleDelete(item.id)} disabled={loading}>
                          <TrashIcon className="size-3.5 text-destructive" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-card overflow-x-auto">
              <Table className="min-w-0">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12"></TableHead>
                    <TableHead className="min-w-[100px]">
                      <button type="button" onClick={() => { setSortKey("scribe_name"); setSortDir((d) => (d === "asc" ? "desc" : "asc")); }} className="hover:underline font-semibold">
                        סופר {sortKey === "scribe_name" && (sortDir === "asc" ? "↑" : "↓")}
                      </button>
                    </TableHead>
                    <TableHead>
                      <button type="button" onClick={() => { setSortKey("product_category"); setSortDir((d) => (d === "asc" ? "desc" : "asc")); }} className="hover:underline font-semibold">
                        קטגוריה {sortKey === "product_category" && (sortDir === "asc" ? "↑" : "↓")}
                      </button>
                    </TableHead>
                    <TableHead>
                      <button type="button" onClick={() => { setSortKey("script_type"); setSortDir((d) => (d === "asc" ? "desc" : "asc")); }} className="hover:underline font-semibold">
                        כתב {sortKey === "script_type" && (sortDir === "asc" ? "↑" : "↓")}
                      </button>
                    </TableHead>
                    <TableHead>
                      <button type="button" onClick={() => { setSortKey("status"); setSortDir((d) => (d === "asc" ? "desc" : "asc")); }} className="hover:underline font-semibold">
                        סטטוס {sortKey === "status" && (sortDir === "asc" ? "↑" : "↓")}
                      </button>
                    </TableHead>
                    <TableHead>
                      <button type="button" onClick={() => handleSort("target_price")} className="hover:underline font-semibold">
                        מחיר יעד {sortKey === "target_price" && (sortDir === "asc" ? "↑" : "↓")}
                      </button>
                    </TableHead>
                    <TableHead className="w-32">פעולות</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeItems.map((item, i) => (
                    <TableRow key={item.id} className={cn("group table-row-animate", i < 8 && `stagger-${Math.min(i + 1, 8) as 1|2|3|4|5|6|7|8}`)}>
                      <TableCell className="p-1.5">
                        {item.images?.[0] ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={item.images[0]}
                            alt=""
                            className="w-10 h-10 rounded-md object-cover border border-border"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-10 h-10" />
                        )}
                      </TableCell>
                      <TableCell className="truncate max-w-[140px] text-sm">
                        {item.scribe_name?.trim() || "—"}
                      </TableCell>
                      <TableCell className="truncate max-w-[120px]">{item.product_category ?? "—"}</TableCell>
                      <TableCell className="truncate max-w-[80px]">{item.script_type ?? "—"}</TableCell>
                      <TableCell>
                        {item.status !== "available"
                          ? <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-800">{inventoryStatusLabelHe(item.status)}</span>
                          : null}
                      </TableCell>
                      <TableCell>
                        {item.target_price != null ? `${item.target_price} ₪` : "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Link href={`/whatsapp?message=${encodeURIComponent(getBroadcastMessage(item))}`}>
                            <Button size="sm" variant="outline" className="rounded-lg">
                              <SendIcon className="size-4 ml-1" />
                              שידור
                            </Button>
                          </Link>
                          <Button size="sm" variant="ghost" onClick={() => openEdit(item)}>
                            <PencilIcon className="size-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => handleDelete(item.id)} disabled={loading}>
                            <TrashIcon className="size-4 text-red-600" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {activeItems.length === 0 && (
            <p className="py-12 text-center text-muted-foreground">
              אין פריטים. לחץ על &quot;הוסף פריט&quot;
            </p>
          )}
        </TabsContent>
        <TabsContent value="archive" className="mt-0">
          <div className="mb-3 flex items-center gap-2">
            <label className="text-sm font-medium text-slate-600">סינון קטגוריה:</label>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="rounded-lg border border-border px-3 py-1.5 text-sm"
            >
              <option value="">הכל</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="rounded-lg border border-border bg-card overflow-x-auto">
            <Table className="min-w-0">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12"></TableHead>
                  <TableHead className="min-w-[100px]">
                    <button type="button" onClick={() => { setSortKey("scribe_name"); setSortDir((d) => (d === "asc" ? "desc" : "asc")); }} className="hover:underline font-semibold">
                      סופר {sortKey === "scribe_name" && (sortDir === "asc" ? "↑" : "↓")}
                    </button>
                  </TableHead>
                  <TableHead>
                    <button type="button" onClick={() => { setSortKey("product_category"); setSortDir((d) => (d === "asc" ? "desc" : "asc")); }} className="hover:underline font-semibold">
                      קטגוריה {sortKey === "product_category" && (sortDir === "asc" ? "↑" : "↓")}
                    </button>
                  </TableHead>
                  <TableHead>
                    <button type="button" onClick={() => { setSortKey("script_type"); setSortDir((d) => (d === "asc" ? "desc" : "asc")); }} className="hover:underline font-semibold">
                      כתב {sortKey === "script_type" && (sortDir === "asc" ? "↑" : "↓")}
                    </button>
                  </TableHead>
                  <TableHead>
                    <button type="button" onClick={() => { setSortKey("status"); setSortDir((d) => (d === "asc" ? "desc" : "asc")); }} className="hover:underline font-semibold">
                      סטטוס {sortKey === "status" && (sortDir === "asc" ? "↑" : "↓")}
                    </button>
                  </TableHead>
                  <TableHead>
                    <button type="button" onClick={() => handleSort("target_price")} className="hover:underline font-semibold">
                      מחיר יעד {sortKey === "target_price" && (sortDir === "asc" ? "↑" : "↓")}
                    </button>
                  </TableHead>
                  <TableHead className="w-20">פעולות</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {archiveItems.map((item) => (
                  <TableRow key={item.id} className="group bg-muted/30 opacity-90">
                    <TableCell className="p-1.5">
                      {item.images?.[0] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.images[0]}
                          alt=""
                          className="w-10 h-10 rounded-md object-cover border border-border grayscale"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-10 h-10" />
                      )}
                    </TableCell>
                    <TableCell className="truncate max-w-[140px] text-sm text-slate-600">
                      {item.scribe_name?.trim() || "—"}
                    </TableCell>
                    <TableCell className="truncate max-w-[120px] text-slate-600">{item.product_category ?? "—"}</TableCell>
                    <TableCell className="text-slate-600">{item.script_type ?? "—"}</TableCell>
                    <TableCell>
                      {item.status && !["available", "sold", "נמכר"].includes(item.status)
                        ? <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground">{inventoryStatusLabelHe(item.status)}</span>
                        : <span className="text-xs text-slate-400">{inventoryStatusLabelHe(item.status)}</span>}
                    </TableCell>
                    <TableCell className="text-slate-600">
                      {item.target_price != null ? `${item.target_price} ₪` : "—"}
                    </TableCell>
                    <TableCell>
                      <Button size="sm" variant="ghost" onClick={() => openEdit(item)} title="צפייה בלבד">
                        <PencilIcon className="size-4 text-slate-500" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {archiveItems.length === 0 && (
            <p className="py-12 text-center text-muted-foreground">
              אין פריטים בארכיון
            </p>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto bg-muted/20" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editingId ? "עריכת פריט" : "פריט חדש"}</DialogTitle>
            {editingId && isInventorySoldStatus(items.find((i) => i.id === editingId)?.status) && (
              <p className="text-sm text-amber-600 font-medium">פריט בארכיון – צפייה ועריכה מוגבלת</p>
            )}
          </DialogHeader>
          <FormProvider {...form} key={editingId ?? "create"}>
            <form onSubmit={handleSave} className="space-y-6">
              {editingId ? (
                <div className="rounded-xl border border-border bg-card p-4 flex flex-col items-center gap-2">
                  <p className="text-xs font-medium text-slate-500">מק״ט והדפסת תווית (Nimbot B1)</p>
                  {(() => {
                    const currentItem = items.find((i) => i.id === editingId);
                    const title =
                      currentItem?.megillah_type?.trim() ||
                      currentItem?.product_category?.trim() ||
                      "פריט מלאי";
                    const subtitle =
                      currentItem?.description?.trim() ||
                      currentItem?.script_type?.trim() ||
                      undefined;
                    const priceText =
                      currentItem?.target_price != null
                        ? `מחיר צרכן: ${currentItem.target_price.toLocaleString("he-IL")} ₪`
                        : undefined;
                    return (
                  <BarcodePrint
                        value={currentItem?.sku ?? editingId.slice(0, 8)}
                        title={title}
                        subtitle={subtitle}
                        priceText={priceText}
                  />
                    );
                  })()}
                </div>
              ) : null}
              <Card className="shadow-sm rounded-xl border-border bg-card">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <Package className="w-5 h-5 text-amber-500" />
                    <CardTitle className="text-base font-semibold text-slate-700">פרטי המוצר</CardTitle>
                  </div>
                  <CardDescription>קטגוריה ותכונות תלויות</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-col gap-1.5 w-full">
                    <label className="font-bold text-slate-800 text-right">תאריך קנייה</label>
                    <Input
                      type="date"
                      {...form.register("purchase_date")}
                      className="rounded-xl"
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5 w-full">
                      <label className="font-bold text-slate-800 text-right">קטגוריה</label>
                      {categoriesLoading ? (
                        <div className="h-10 rounded-xl bg-slate-200 animate-pulse" />
                      ) : (
                      <select
                        {...form.register("product_category")}
                        className="w-full rounded-xl border border-border bg-cardshadow-sm px-3 py-2.5 focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                      >
                        <option value="">בחר</option>
                        {categories.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                      )}
                    </div>
                    <DependentCategories />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5 w-full">
                      <label className="font-bold text-slate-800 text-right">כתב</label>
                      <select
                        {...form.register("script_type")}
                        className="w-full rounded-xl border border-border bg-cardshadow-sm px-3 py-2.5 focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                      >
                        <option value="">בחר</option>
                        {SCRIPT_TYPES.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-col gap-1.5 w-full">
                      <label className="font-bold text-slate-800 text-right">סטטוס</label>
                      <select
                        {...form.register("status")}
                        className="w-full rounded-xl border border-border bg-cardshadow-sm px-3 py-2.5 focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                      >
                        {STATUSES.map((t) => (
                          <option key={t} value={t}>{inventoryStatusLabelHe(t)}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-sm rounded-xl border-border bg-card">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <Wallet className="w-5 h-5 text-amber-500" />
                    <CardTitle className="text-base font-semibold text-slate-700">ספק ותמחור</CardTitle>
                  </div>
                  <CardDescription>סופר, עלויות ומחיר יעד</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-col gap-1.5 w-full">
                    <label className="font-bold text-slate-800 text-right">שם סופר</label>
                    <UnifiedScribeSelect
                      value={form.watch("scribe_id") ?? null}
                      onChange={(s) => form.setValue("scribe_id", s?.id ?? null)}
                      placeholder="בחר סופר"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5 w-full">
                      <label className="font-bold text-slate-800 text-right">כמות יחידות</label>
                      <Input
                        type="number"
                        min={1}
                        {...form.register("quantity", integerRegisterOptions(1))}
                        placeholder="1"
                        className="rounded-xl"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5 w-full">
                      <label className="font-bold text-slate-800 text-right">עלות ליחידה (₪)</label>
                      <Input
                        type="number"
                        min={0}
                        {...form.register("cost_price", numericRegisterOptions(0))}
                        placeholder="0"
                        className="rounded-xl"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5 w-full">
                      <label className="font-bold text-slate-800 text-right">שולם עד כה (₪)</label>
                      <Input
                        type="number"
                        min={0}
                        {...form.register("amount_paid", numericRegisterOptions(0))}
                        placeholder="0"
                        className="rounded-xl"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5 w-full">
                      <label className="font-bold text-slate-800 text-right">מחיר מומלץ למכירה (₪)</label>
                      <Input
                        type="number"
                        min={0}
                        {...form.register("target_price", numericRegisterOptions(0))}
                        placeholder="0"
                        className="rounded-xl"
                      />
                      {(() => {
                        const q = form.watch("quantity") ?? 1;
                        const tp = form.watch("target_price");
                        const totalTarget = tp != null && !Number.isNaN(tp) ? (q || 1) * tp : null;
                        if (totalTarget == null || totalTarget <= 0) return null;
                        return (
                          <p className="text-sm text-emerald-700 font-medium mt-1">
                            סה״כ צפי הכנסה: ₪{totalTarget.toLocaleString("he-IL")}
                          </p>
                        );
                      })()}
                    </div>
                  </div>
                  {(() => {
                    const qty = form.watch("quantity") ?? 1;
                    const cost = form.watch("cost_price");
                    const paid = form.watch("amount_paid") ?? 0;
                    const total = cost != null && !Number.isNaN(cost) ? (qty || 1) * cost : null;
                    if (total == null) return null;
                    const balanceToScribe = total - paid;
                    return (
                      <div className="rounded-lg bg-amber-100/50 p-3 space-y-1 text-sm">
                        <p className="font-medium text-slate-800">עלות: {total.toLocaleString("he-IL")} ₪</p>
                        <p className="font-medium">שולם: {paid.toLocaleString("he-IL")} ₪</p>
                        <p className={balanceToScribe > 0 ? "text-amber-700 font-medium" : "text-muted-foreground"}>
                          יתרה לסופר: {balanceToScribe.toLocaleString("he-IL")} ₪
                        </p>
                      </div>
                    );
                  })()}
                  <div className="flex flex-col gap-1.5 w-full">
                    <label className="font-bold text-slate-800 text-right">תיאור</label>
                    <Input
                      {...form.register("description")}
                      placeholder="תיאור"
                      className="rounded-xl"
                    />
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-sm rounded-xl border-border bg-card">
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

              <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen} className="rounded-xl border border-border bg-card overflow-hidden">
                <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-3 text-right hover:bg-muted/50 transition-colors">
                  <span className="font-semibold text-slate-700">הגדרות מתקדמות</span>
                  {advancedOpen ? <ChevronUp className="size-4 text-slate-500" /> : <ChevronDown className="size-4 text-slate-500" />}
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="px-4 pb-4 pt-2 space-y-4 border-t border-slate-100">
                    <div className="flex flex-col gap-1.5 w-full">
                      <label className="font-bold text-slate-800 text-right">סוג קלף</label>
                      <Input
                        {...form.register("parchment_type")}
                        placeholder="גולדמאן, נפרשטק..."
                        className="rounded-xl"
                      />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="computer_proofread"
                          {...form.register("computer_proofread")}
                          className="rounded border-border"
                        />
                        <label htmlFor="computer_proofread" className="text-sm font-medium">בדיקת מחשב</label>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="human_proofread"
                          {...form.register("human_proofread")}
                          className="rounded border-border"
                        />
                        <label htmlFor="human_proofread" className="text-sm font-medium">בדיקה אנושית</label>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="is_sewn"
                          {...form.register("is_sewn")}
                          className="rounded border-border"
                        />
                        <label htmlFor="is_sewn" className="text-sm font-medium">תפור</label>
                      </div>
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>

              <div className="flex gap-3 justify-end pt-2">
                <Button type="button" variant="outline" onClick={() => setEditOpen(false)} className="rounded-xl">
                  ביטול
                </Button>
                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full sm:w-auto bg-sky-600 hover:bg-sky-700 text-white rounded-xl px-6"
                >
                  <Check className="w-4 h-4 ml-2" />
                  {loading ? "שומר..." : "שמור"}
                </Button>
              </div>
            </form>
          </FormProvider>
        </DialogContent>
      </Dialog>

      <ScrollToTop />
    </div>
  );
}
