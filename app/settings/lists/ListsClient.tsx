"use client";

import { useState } from "react";
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
import { CsvActions } from "@/components/shared/CsvActions";
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

const MAIN_SECTIONS: { listKey: string; title: string; subtitle: string }[] = [
  { listKey: "categories", title: "סוגי מוצרים", subtitle: "קטגוריות מוצרים (ספר תורה, נביא, מגילה וכו')" },
  { listKey: "torah_sizes", title: "מידות ס\"ת", subtitle: "גדלי ספר תורה (17, 24, 30 וכו')" },
  { listKey: "megilla_lines", title: "שורות מגילה", subtitle: "מספר שורות במגילה (11, 21, 28 וכו')" },
];

function extractValuesFromCsvRows(rows: Record<string, unknown>[]): string[] {
  const values: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const val = (row["value"] ?? row["name"] ?? row["שם"] ?? row["option"] ?? Object.values(row)[0]) as string | undefined;
    const trimmed = typeof val === "string" ? val.trim() : String(val ?? "").trim();
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed);
      values.push(trimmed);
    }
  }
  return values;
}

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

  const getList = (listKey: string) => lists.find((l) => l.list_key === listKey);

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

  const handleCsvImport = async (listKey: string, rows: Record<string, unknown>[]) => {
    const list = getList(listKey);
    if (!list) return;
    const newValues = extractValuesFromCsvRows(rows);
    if (newValues.length === 0) {
      toast.error("לא נמצאו ערכים תקינים ב-CSV");
      return;
    }
    const merged = [...list.options];
    for (const v of newValues) {
      if (!merged.includes(v)) merged.push(v);
    }
    const res = await updateDropdownOptions(listKey, merged);
    if (res.success) {
      setLists((prev) =>
        prev.map((l) => (l.list_key === listKey ? { ...l, options: merged } : l))
      );
      toast.success(`נוספו ${newValues.length} פריטים`);
    } else {
      toast.error(res.error);
    }
  };

  return (
    <div className="space-y-6">
      {MAIN_SECTIONS.map(({ listKey, title, subtitle }) => {
        const list = getList(listKey);
        if (!list) return null;
        const exportData = list.options.map((o) => ({ value: o }));
        return (
          <Card key={listKey} className="rounded-xl border-slate-200 bg-white overflow-hidden">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-lg font-semibold text-slate-800">{title}</CardTitle>
                  <CardDescription>{subtitle}</CardDescription>
                </div>
                <div className="flex gap-2">
                  <CsvActions
                    data={exportData}
                    onImport={(rows) => handleCsvImport(listKey, rows)}
                    filename={`${listKey}_export`}
                    exportLabel="ייצוא CSV"
                    importLabel="ייבוא CSV"
                  />
                  <Button size="sm" variant="outline" onClick={() => openEdit(list)} className="rounded-xl">
                    <PencilIcon className="size-4 ml-1" />
                    עריכה
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border border-slate-200 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/80">
                      <TableHead className="font-semibold">אפשרויות ({list.options.length})</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {list.options.length === 0 ? (
                      <TableRow>
                        <TableCell className="text-muted-foreground text-sm">אין פריטים</TableCell>
                      </TableRow>
                    ) : (
                      list.options.map((opt, idx) => (
                        <TableRow key={idx}>
                          <TableCell>{opt}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        );
      })}

      <Card className="rounded-xl border-slate-200 bg-white overflow-hidden">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-slate-700">רשימות נוספות</CardTitle>
          <CardDescription>סוגי קלף, נביאים, סוגי כתב, סטטוסים</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>רשימה</TableHead>
                <TableHead>אפשרויות</TableHead>
                <TableHead className="w-24">פעולות</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lists
                .filter((l) => !MAIN_SECTIONS.some((s) => s.listKey === l.list_key))
                .map((list) => (
                  <TableRow key={list.list_key}>
                    <TableCell className="font-medium">
                      {LIST_LABELS[list.list_key] ?? list.list_key}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {list.options.length} פריטים
                    </TableCell>
                    <TableCell>
                      <Button size="sm" variant="ghost" onClick={() => openEdit(list)}>
                        <PencilIcon className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

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
