"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { updateDropdownOptions, type DropdownList } from "./actions";
import { PencilIcon, PlusIcon, TrashIcon } from "lucide-react";

const LIST_LABELS: Record<string, string> = {
  categories: "קטגוריות",
  parchment_types: "סוגי קלף",
  torah_sizes: "גדלי ספר תורה",
  neviim_names: "שמות נביאים",
  megilla_lines: "שורות מגילה",
  script_types: "סוגי כתב",
  statuses: "סטטוסים",
};

type Props = {
  initialLists: DropdownList[];
};

export default function ListsClient({ initialLists }: Props) {
  const [lists, setLists] = useState(initialLists);
  const [editOpen, setEditOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [options, setOptions] = useState<string[]>([]);
  const [newOption, setNewOption] = useState("");
  const [loading, setLoading] = useState(false);

  const openEdit = (list: DropdownList) => {
    setEditingKey(list.list_key);
    setOptions([...list.options]);
    setNewOption("");
    setEditOpen(true);
  };

  const addOption = () => {
    const v = newOption.trim();
    if (!v || options.includes(v)) return;
    setOptions((p) => [...p, v]);
    setNewOption("");
  };

  const removeOption = (idx: number) => {
    setOptions((p) => p.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    if (!editingKey) return;
    setLoading(true);
    try {
      const res = await updateDropdownOptions(editingKey, options);
      if (res.success) {
        setLists((prev) =>
          prev.map((l) => (l.list_key === editingKey ? { ...l, options } : l))
        );
        setEditOpen(false);
        toast.success("נשמר");
      } else {
        toast.error(res.error);
      }
    } catch {
      toast.error("שגיאה");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>רשימה</TableHead>
            <TableHead>אפשרויות</TableHead>
            <TableHead className="w-24">פעולות</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lists.map((list) => (
            <TableRow key={list.list_key}>
              <TableCell className="font-medium">
                {LIST_LABELS[list.list_key] ?? list.list_key}
              </TableCell>
              <TableCell className="text-muted-foreground text-sm">
                {list.options.length} פריטים
              </TableCell>
              <TableCell>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => openEdit(list)}
                >
                  <PencilIcon className="size-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingKey ? LIST_LABELS[editingKey] ?? editingKey : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Input
                value={newOption}
                onChange={(e) => setNewOption(e.target.value)}
                placeholder="הוסף אפשרות"
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addOption())}
              />
              <Button type="button" onClick={addOption} size="sm">
                <PlusIcon className="size-4 ml-1" />
                הוסף
              </Button>
            </div>
            <ul className="max-h-48 overflow-y-auto space-y-1">
              {options.map((opt, idx) => (
                <li
                  key={idx}
                  className="flex items-center justify-between rounded-lg border px-3 py-2"
                >
                  <span>{opt}</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => removeOption(idx)}
                    className="text-destructive hover:text-destructive"
                  >
                    <TrashIcon className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
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
    </div>
  );
}
