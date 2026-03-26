"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckSquare, Square, Layers } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { TorahProjectDetailView, TorahSheetGridRow, TorahSheetStatus } from "@/src/lib/types/torah";
import {
  TORAH_SHEET_COUNT,
  TORAH_SHEET_STATUS_LABELS,
  TORAH_PROJECT_STATUS_LABELS,
} from "@/src/lib/types/torah";
import { calculateTorahProjectFinancials } from "@/src/services/crm.logic";
import { updateSheet, batchUpdateSheetStatuses } from "./actions";
import { cn } from "@/lib/utils";

function formatShekels(n: number): string {
  return `${n.toLocaleString("he-IL", { maximumFractionDigits: 2 })} ₪`;
}

const SHEET_CELL_STYLES: Record<TorahSheetStatus, string> = {
  not_started: "bg-slate-200 text-slate-700 border-slate-300 hover:bg-slate-300/70",
  written: "bg-sky-200 text-sky-900 border-sky-400 hover:bg-sky-300",
  in_qa: "bg-amber-200 text-amber-950 border-amber-400 hover:bg-amber-300",
  needs_fixing: "bg-red-200 text-red-900 border-red-400 hover:bg-red-300",
  approved: "bg-emerald-300 text-emerald-950 border-emerald-500 hover:bg-emerald-400",
  sewn: "bg-emerald-500 text-white border-emerald-600 hover:bg-emerald-600",
};

const LEGEND: { status: TorahSheetStatus; label: string }[] = [
  { status: "not_started", label: TORAH_SHEET_STATUS_LABELS.not_started },
  { status: "written", label: TORAH_SHEET_STATUS_LABELS.written },
  { status: "in_qa", label: TORAH_SHEET_STATUS_LABELS.in_qa },
  { status: "needs_fixing", label: TORAH_SHEET_STATUS_LABELS.needs_fixing },
  { status: "approved", label: TORAH_SHEET_STATUS_LABELS.approved },
  { status: "sewn", label: TORAH_SHEET_STATUS_LABELS.sewn },
];

type Props = {
  projectId: string;
  project: TorahProjectDetailView;
  initialSheets: TorahSheetGridRow[];
};

export default function TorahDetailClient({ projectId, project, initialSheets }: Props) {
  const router = useRouter();
  const [sheets, setSheets] = useState<TorahSheetGridRow[]>(initialSheets);
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [editing, setEditing] = useState<TorahSheetGridRow | null>(null);
  const [editStatus, setEditStatus] = useState<TorahSheetStatus>("not_started");
  const [editCols, setEditCols] = useState<string>("4");
  const [saving, setSaving] = useState(false);
  const [bulkStatus, setBulkStatus] = useState<TorahSheetStatus>("written");

  useEffect(() => {
    setSheets(initialSheets);
  }, [initialSheets]);

  const sheetByNumber = useMemo(() => {
    const m = new Map<number, TorahSheetGridRow>();
    for (const s of sheets) m.set(s.sheet_number, s);
    return m;
  }, [sheets]);

  const financials = useMemo(
    () =>
      calculateTorahProjectFinancials(project.total_agreed_price, sheets),
    [project.total_agreed_price, sheets]
  );

  const openEdit = useCallback((row: TorahSheetGridRow) => {
    setEditing(row);
    setEditStatus(row.status);
    setEditCols(String(row.columns_count));
  }, []);

  const handleCellClick = (row: TorahSheetGridRow | null, sheetNumber: number) => {
    if (!row) {
      toast.message(`יריעה ${sheetNumber} חסרה במסד`);
      return;
    }
    if (bulkMode) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(row.id)) next.delete(row.id);
        else next.add(row.id);
        return next;
      });
      return;
    }
    openEdit(row);
  };

  async function saveEdit() {
    if (!editing) return;
    const cols = Math.min(12, Math.max(1, Math.floor(Number(editCols) || 4)));
    setSaving(true);
    try {
      const res = await updateSheet(
        editing.id,
        { status: editStatus, columns_count: cols },
        projectId
      );
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      setSheets((prev) =>
        prev.map((s) =>
          s.id === editing.id ? { ...s, status: editStatus, columns_count: cols } : s
        )
      );
      toast.success("היריעה עודכנה");
      setEditing(null);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function applyBulk() {
    const ids = [...selectedIds];
    if (ids.length === 0) {
      toast.error("לא נבחרו יריעות");
      return;
    }
    setSaving(true);
    try {
      const res = await batchUpdateSheetStatuses(ids, bulkStatus, projectId);
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      setSheets((prev) =>
        prev.map((s) => (selectedIds.has(s.id) ? { ...s, status: bulkStatus } : s))
      );
      toast.success(`עודכנו ${res.updated} יריעות`);
      setSelectedIds(new Set());
      setBulkMode(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  const targetStr = project.target_date
    ? new Date(project.target_date).toLocaleDateString("he-IL")
    : "—";
  const startStr = project.start_date
    ? new Date(project.start_date).toLocaleDateString("he-IL")
    : "—";

  const showBulkBar = bulkMode && selectedIds.size > 0;

  return (
    <div className={cn("pb-28", showBulkBar && "pb-36")}>
      <div className="container mx-auto max-w-6xl px-3 sm:px-4 py-6 sm:py-8">
        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-800 truncate">
              {project.title}
            </h1>
            <p className="text-xs text-muted-foreground mt-1 font-mono truncate">
              {project.id}
            </p>
            <p className="text-sm text-slate-600 mt-3">
              <span className="text-muted-foreground">סטטוס פרויקט:</span>{" "}
              {TORAH_PROJECT_STATUS_LABELS[project.status]}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Button
              type="button"
              variant={bulkMode ? "default" : "outline"}
              size="sm"
              className={cn(bulkMode && "bg-sky-600 hover:bg-sky-700")}
              onClick={() => {
                setBulkMode((m) => !m);
                setSelectedIds(new Set());
              }}
            >
              {bulkMode ? (
                <>
                  <CheckSquare className="size-4 ml-1" />
                  ביטול בחירה מרובה
                </>
              ) : (
                <>
                  <Square className="size-4 ml-1" />
                  בחירה מרובה
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Meta row */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-6">
          <Card className="rounded-xl border-slate-200">
            <CardContent className="p-4 text-sm">
              <p className="text-xs text-muted-foreground mb-0.5">סופר</p>
              <p className="font-medium text-slate-800">{project.scribe_name ?? "—"}</p>
            </CardContent>
          </Card>
          <Card className="rounded-xl border-slate-200">
            <CardContent className="p-4 text-sm">
              <p className="text-xs text-muted-foreground mb-0.5">לקוח</p>
              <p className="font-medium text-slate-800">{project.client_name ?? "—"}</p>
            </CardContent>
          </Card>
          <Card className="rounded-xl border-slate-200">
            <CardContent className="p-4 text-sm">
              <p className="text-xs text-muted-foreground mb-0.5">תחילה</p>
              <p className="font-medium text-slate-800">{startStr}</p>
            </CardContent>
          </Card>
          <Card className="rounded-xl border-slate-200">
            <CardContent className="p-4 text-sm">
              <p className="text-xs text-muted-foreground mb-0.5">יעד</p>
              <p className="font-medium text-slate-800">{targetStr}</p>
            </CardContent>
          </Card>
        </div>

        {/* Financials */}
        <Card className="rounded-2xl border-sky-100 bg-white shadow-sm mb-6">
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center gap-2 mb-4">
              <Layers className="size-5 text-sky-600" />
              <h2 className="text-lg font-semibold text-sky-900">סיכום כספי (לפי עמודות)</h2>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              מחיר מוסכם: <span className="font-medium text-slate-700">{formatShekels(project.total_agreed_price)}</span>
              {" · "}
              {financials.totalColumns} עמודות בסך הכל
              {" · "}
              {formatShekels(financials.pricePerColumn)} לעמודה
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-red-200 bg-red-50/80 p-4">
                <p className="text-xs font-medium text-red-800 mb-1">חוב אקטיבי ממומש</p>
                <p className="text-2xl font-bold text-red-700 tabular-nums">
                  {formatShekels(financials.actualDebt)}
                </p>
                <p className="text-xs text-red-600/80 mt-1">
                  {financials.completedColumns} עמודות באושר / תפור
                </p>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50/90 p-4">
                <p className="text-xs font-medium text-amber-900 mb-1">יתרה לשריון</p>
                <p className="text-2xl font-bold text-amber-800 tabular-nums">
                  {formatShekels(financials.futureCommitment)}
                </p>
                <p className="text-xs text-amber-800/80 mt-1">יתרת חוזה שלא הומרה לחוב ממומש</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Legend */}
        <div className="flex flex-wrap gap-2 mb-4">
          {LEGEND.map(({ status, label }) => (
            <span
              key={status}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] sm:text-xs font-medium",
                SHEET_CELL_STYLES[status]
              )}
            >
              <span className="size-2 rounded-sm bg-current opacity-60" />
              {label}
            </span>
          ))}
        </div>

        {/* 62 grid */}
        <div className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">
            יריעות ({sheets.length} / {TORAH_SHEET_COUNT})
          </h3>
          <div className="grid grid-cols-5 sm:grid-cols-7 md:grid-cols-10 gap-1.5 sm:gap-2">
            {Array.from({ length: TORAH_SHEET_COUNT }, (_, i) => {
              const n = i + 1;
              const row = sheetByNumber.get(n) ?? null;
              const selected = row && selectedIds.has(row.id);
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => handleCellClick(row, n)}
                  className={cn(
                    "relative flex aspect-square min-h-[2.5rem] flex-col items-center justify-center rounded-md border text-[10px] sm:text-xs font-semibold transition-all",
                    row
                      ? SHEET_CELL_STYLES[row.status]
                      : "border-dashed border-slate-300 bg-slate-50 text-slate-400",
                    selected && "ring-2 ring-sky-600 ring-offset-2 z-10",
                    bulkMode && row && "cursor-cell"
                  )}
                >
                  {bulkMode && row && selected && (
                    <span
                      className="absolute top-0.5 right-0.5 size-2.5 rounded-full bg-sky-600 ring-2 ring-white"
                      aria-hidden
                    />
                  )}
                  <span>{n}</span>
                  {row && row.columns_count < 4 && (
                    <span className="mt-0.5 rounded bg-black/20 px-0.5 text-[8px] sm:text-[9px] leading-tight">
                      {row.columns_count} עמ&apos;
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Single-sheet dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>
              יריעה {editing?.sheet_number}
              {editing?.sku ? (
                <span className="block text-xs font-normal text-muted-foreground mt-1 font-mono">
                  {editing.sku}
                </span>
              ) : null}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <p className="text-xs text-muted-foreground mb-1">סטטוס</p>
              <select
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value as TorahSheetStatus)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {(Object.keys(TORAH_SHEET_STATUS_LABELS) as TorahSheetStatus[]).map((k) => (
                  <option key={k} value={k}>
                    {TORAH_SHEET_STATUS_LABELS[k]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">מספר עמודות (1–12)</p>
              <Input
                type="number"
                min={1}
                max={12}
                value={editCols}
                onChange={(e) => setEditCols(e.target.value)}
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                className="flex-1 bg-sky-600 hover:bg-sky-700"
                disabled={saving}
                onClick={saveEdit}
              >
                {saving ? "שומר..." : "שמור"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                ביטול
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk sticky bar */}
      {showBulkBar && (
        <div className="fixed bottom-0 inset-x-0 z-50 border-t border-slate-200 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 shadow-[0_-4px_24px_rgba(0,0,0,0.08)] px-3 py-3 sm:py-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto flex max-w-6xl flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-center sm:gap-4">
            <p className="text-center text-sm text-slate-600 sm:text-right">
              נבחרו <strong>{selectedIds.size}</strong> יריעות
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <select
                value={bulkStatus}
                onChange={(e) => setBulkStatus(e.target.value as TorahSheetStatus)}
                className="h-10 w-full sm:w-56 rounded-md border border-input bg-background px-3 text-sm"
              >
                {(Object.keys(TORAH_SHEET_STATUS_LABELS) as TorahSheetStatus[]).map((k) => (
                  <option key={k} value={k}>
                    {TORAH_SHEET_STATUS_LABELS[k]}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                className="bg-sky-600 hover:bg-sky-700 whitespace-nowrap"
                disabled={saving}
                onClick={applyBulk}
              >
                החל על {selectedIds.size} יריעות
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
