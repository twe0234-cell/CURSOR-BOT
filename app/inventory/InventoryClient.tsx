"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
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
import { fetchNextScribeNumber } from "@/app/broadcast/actions";
import { PlusIcon, PencilIcon, TrashIcon, SendIcon } from "lucide-react";

const CATEGORIES = ["ספר תורה", "נביא", "מגילה", "מזוזה", "פרשיות"];
const ITEM_TYPES = ["תפילין", "מזוזה", "ספר תורה"];
const SCRIPT_TYPES = ['אר"י', "בית יוסף"];
const HIDUR_LEVELS = ["A", "B", "C"];
const STATUSES = ["available", "in_use", "sold", "reserved"];

type Props = {
  initialItems: InventoryItem[];
};

export default function InventoryClient({ initialItems }: Props) {
  const [items, setItems] = useState(initialItems);
  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<InventoryItem>>({});
  const [loading, setLoading] = useState(false);
  const [nextScribeNum, setNextScribeNum] = useState(121);
  const [scribeDialogOpen, setScribeDialogOpen] = useState(false);

  useEffect(() => {
    fetchNextScribeNumber().then((r) => {
      if (r.success) setNextScribeNum(r.next);
    });
  }, [editOpen]);

  const openCreate = () => {
    setEditingId(null);
    setForm({
      item_type: "",
      script_type: "",
      hidur_level: "",
      status: "available",
      price: null,
      cost_price: null,
      target_price: null,
      category: "",
      category_meta: {},
      scribe_code: "",
      description: "",
    });
    setEditOpen(true);
    setScribeDialogOpen(false);
  };

  const openEdit = (item: InventoryItem) => {
    setEditingId(item.id);
    setForm({
      item_type: item.item_type ?? item.product_type ?? "",
      script_type: item.script_type ?? "",
      hidur_level: item.hidur_level ?? "",
      status: item.status ?? "available",
      price: item.price ?? null,
      cost_price: item.cost_price ?? null,
      target_price: item.target_price ?? null,
      category: item.category ?? "",
      category_meta: item.category_meta ?? {},
      scribe_code: item.scribe_code ?? "",
      description: item.description ?? "",
    });
    setEditOpen(true);
    setScribeDialogOpen(false);
  };

  const openScribeDialog = () => {
    setScribeDialogOpen(true);
  };

  const applyNextScribe = () => {
    const code = `#${nextScribeNum}`;
    setForm((p) => ({ ...p, scribe_code: code }));
    setNextScribeNum((n) => n + 1);
    setScribeDialogOpen(false);
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const res = editingId
        ? await updateInventoryItem(editingId, form)
        : await createInventoryItem(form);

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
    const type = item.item_type ?? item.product_type ?? "פריט";
    const script = item.script_type ?? "";
    const level = item.hidur_level ?? "";
    const price = item.price != null ? `מחיר: ${item.price} ₪` : "";
    return `פריט חדש! ${type}${script ? `, כתב ${script}` : ""}${level ? `, הידור ${level}` : ""} זמין. ${price}`.trim();
  };

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
              <TableHead>סוג</TableHead>
              <TableHead>כתב</TableHead>
              <TableHead>הידור</TableHead>
              <TableHead>סטטוס</TableHead>
              <TableHead>מחיר</TableHead>
              <TableHead className="w-40">פעולות</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="truncate max-w-[120px]">{item.item_type ?? item.product_type ?? "—"}</TableCell>
                <TableCell className="truncate max-w-[80px]">{item.script_type ?? "—"}</TableCell>
                <TableCell className="truncate max-w-[60px]">{item.hidur_level ?? "—"}</TableCell>
                <TableCell>{item.status ?? "—"}</TableCell>
                <TableCell>
                  {item.price != null ? `${item.price} ₪` : "—"}
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
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">קטגוריה</label>
              <select
                value={form.category ?? ""}
                onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              >
                <option value="">בחר</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">סוג פריט</label>
              <select
                value={form.item_type ?? ""}
                onChange={(e) => setForm((p) => ({ ...p, item_type: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              >
                <option value="">בחר</option>
                {ITEM_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">מק״ט סופר (Ref)</label>
              <div className="flex gap-2">
                <Input
                  value={form.scribe_code ?? ""}
                  onChange={(e) => setForm((p) => ({ ...p, scribe_code: e.target.value }))}
                  placeholder="#121"
                  className="rounded-lg max-w-[120px]"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={openScribeDialog}
                  className="rounded-lg"
                >
                  צור אוטומטי
                </Button>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">כתב</label>
              <select
                value={form.script_type ?? ""}
                onChange={(e) => setForm((p) => ({ ...p, script_type: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              >
                <option value="">בחר</option>
                {SCRIPT_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">הידור</label>
              <select
                value={form.hidur_level ?? ""}
                onChange={(e) => setForm((p) => ({ ...p, hidur_level: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              >
                <option value="">בחר</option>
                {HIDUR_LEVELS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">סטטוס</label>
              <select
                value={form.status ?? ""}
                onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              >
                {STATUSES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium">עלות</label>
                <Input
                  type="number"
                  value={form.cost_price ?? ""}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      cost_price: e.target.value ? Number(e.target.value) : null,
                    }))
                  }
                  placeholder="0"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">מחיר יעד</label>
                <Input
                  type="number"
                  value={form.target_price ?? ""}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      target_price: e.target.value ? Number(e.target.value) : null,
                    }))
                  }
                  placeholder="0"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">מחיר</label>
              <Input
                type="number"
                value={form.price ?? ""}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    price: e.target.value ? Number(e.target.value) : null,
                  }))
                }
                placeholder="0"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">תיאור</label>
              <Input
                value={form.description ?? ""}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                placeholder="תיאור"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setEditOpen(false)}>
                ביטול
              </Button>
              <Button onClick={handleSave} disabled={loading}>
                {loading ? "שומר..." : "שמור"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={scribeDialogOpen} onOpenChange={setScribeDialogOpen}>
        <DialogContent className="sm:max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle>יצירת מק״ט סופר</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mb-4">
            המספר הבא: <strong>#{nextScribeNum}</strong>
          </p>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setScribeDialogOpen(false)}>
              ביטול
            </Button>
            <Button onClick={applyNextScribe}>
              השתמש ב-#{nextScribeNum}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
