"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckSquare, Square, Layers, PackageCheck, PlusCircle, RotateCcw, Pencil, Inbox, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import {
  calculateTorahProjectFinancials,
  computeTorahScribePace,
} from "@/src/services/crm.logic";
import {
  updateSheet,
  batchUpdateSheetStatuses,
  updateTorahProject,
  updateProjectPayments,
  receiveSheetsFromScribe,
  deleteTorahProject,
} from "./actions";
import { createCrmContact } from "@/app/crm/actions";
import { applyNumericTransform } from "@/lib/numericInput";
import { createQaBatch, returnQaBatch, fetchQaBatches, type QaBatchRow } from "./qa-actions";
import { cn } from "@/lib/utils";
import { TORAH_CONTRACT_PARCHMENT_TYPES } from "@/src/lib/stam/catalog";

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function formatShekels(n: number): string {
  return `${n.toLocaleString("he-IL", { maximumFractionDigits: 2 })} ₪`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "2-digit" });
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

// Statuses eligible to be added to a QA batch
const QA_ELIGIBLE: TorahSheetStatus[] = ["written", "needs_fixing"];

// ─────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────

type Props = {
  projectId: string;
  project: TorahProjectDetailView;
  initialSheets: TorahSheetGridRow[];
};

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

export default function TorahDetailClient({ projectId, project, initialSheets }: Props) {
  const router = useRouter();
  const [sheets, setSheets] = useState<TorahSheetGridRow[]>(initialSheets);

  // Sheet grid state
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [editing, setEditing] = useState<TorahSheetGridRow | null>(null);
  const [editStatus, setEditStatus] = useState<TorahSheetStatus>("not_started");
  const [editCols, setEditCols] = useState<string>("4");
  const [saving, setSaving] = useState(false);
  const [receivingSaving, setReceivingSaving] = useState(false);
  const [bulkStatus, setBulkStatus] = useState<TorahSheetStatus>("written");

  // QA state
  const [batches, setBatches] = useState<QaBatchRow[]>([]);
  const [batchesLoaded, setBatchesLoaded] = useState(false);
  const [createBatchOpen, setCreateBatchOpen] = useState(false);
  const [batchMagiahId, setBatchMagiahId] = useState("");
  const [batchSheetIds, setBatchSheetIds] = useState<Set<string>>(() => new Set());
  const [batchNotes, setBatchNotes] = useState("");
  const [batchSaving, setBatchSaving] = useState(false);
  const [returningId, setReturningId] = useState<string | null>(null);
  const [contacts, setContacts] = useState<{ id: string; name: string }[]>([]);

  const [editProjectOpen, setEditProjectOpen] = useState(false);
  const [editTitle, setEditTitle] = useState(project.title);
  const [editTarget, setEditTarget] = useState(project.target_date ?? "");
  const [editTotalAgreed, setEditTotalAgreed] = useState(String(project.total_agreed_price));
  const [editColumnsPerDay, setEditColumnsPerDay] = useState(String(project.columns_per_day));
  const [editQaWeeks, setEditQaWeeks] = useState(String(project.qa_weeks_buffer));
  const [editGavraQa, setEditGavraQa] = useState(String(project.gavra_qa_count));
  const [editComputerQa, setEditComputerQa] = useState(String(project.computer_qa_count));
  const [editRequiresTagging, setEditRequiresTagging] = useState(project.requires_tagging);
  const [editPricePerColumn, setEditPricePerColumn] = useState(
    String(project.price_per_column ?? 0)
  );
  const [editParchmentType, setEditParchmentType] = useState(project.parchment_type ?? "");
  const [editIncludesAccessories, setEditIncludesAccessories] = useState(
    project.includes_accessories
  );
  const [editSaving, setEditSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [paymentsOpen, setPaymentsOpen] = useState(false);
  const [payClientStr, setPayClientStr] = useState(String(project.amount_paid_by_client));
  const [payScribeStr, setPayScribeStr] = useState(String(project.amount_paid_to_scribe));
  const [paySaving, setPaySaving] = useState(false);

  const [newMagiahOpen, setNewMagiahOpen] = useState(false);
  const [newMagiahName, setNewMagiahName] = useState("");
  const [creatingMagiah, setCreatingMagiah] = useState(false);

  useEffect(() => { setSheets(initialSheets); }, [initialSheets]);

  useEffect(() => {
    setEditTitle(project.title);
    setEditTarget(project.target_date ?? "");
    setEditTotalAgreed(String(project.total_agreed_price));
    setEditColumnsPerDay(String(project.columns_per_day));
    setEditQaWeeks(String(project.qa_weeks_buffer));
    setEditGavraQa(String(project.gavra_qa_count));
    setEditComputerQa(String(project.computer_qa_count));
    setEditRequiresTagging(project.requires_tagging);
    setEditPricePerColumn(String(project.price_per_column ?? 0));
    setEditParchmentType(project.parchment_type ?? "");
    setEditIncludesAccessories(project.includes_accessories);
    setPayClientStr(String(project.amount_paid_by_client));
    setPayScribeStr(String(project.amount_paid_to_scribe));
  }, [project]);

  const loadBatches = useCallback(async () => {
    const res = await fetchQaBatches(projectId);
    if (res.success) setBatches(res.batches);
    setBatchesLoaded(true);
  }, [projectId]);

  const loadContacts = useCallback(async () => {
    const { fetchCrmContactsForSelect } = await import("../actions");
    const res = await fetchCrmContactsForSelect();
    if (res.success) setContacts(res.contacts);
  }, []);

  const sheetByNumber = useMemo(() => {
    const m = new Map<number, TorahSheetGridRow>();
    for (const s of sheets) m.set(s.sheet_number, s);
    return m;
  }, [sheets]);

  const financials = useMemo(
    () => calculateTorahProjectFinancials(project.total_agreed_price, sheets),
    [project.total_agreed_price, sheets]
  );

  const scribePace = useMemo(
    () =>
      computeTorahScribePace({
        startDate: project.start_date,
        targetDate: project.target_date,
        columnsPerDay: project.columns_per_day,
        sheets,
      }),
    [project.start_date, project.target_date, project.columns_per_day, sheets]
  );

  const eligibleSheets = useMemo(
    () => sheets.filter((s) => QA_ELIGIBLE.includes(s.status)),
    [sheets]
  );

  // ── Sheet grid handlers ──────────────────────────────────

  const openEdit = useCallback((row: TorahSheetGridRow) => {
    setEditing(row);
    setEditStatus(row.status);
    setEditCols(String(row.columns_count));
  }, []);

  const handleCellClick = (row: TorahSheetGridRow | null, sheetNumber: number) => {
    if (!row) { toast.message(`יריעה ${sheetNumber} חסרה במסד`); return; }
    if (bulkMode) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.has(row.id) ? next.delete(row.id) : next.add(row.id);
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
      const res = await updateSheet(editing.id, { status: editStatus, columns_count: cols }, projectId);
      if (!res.success) { toast.error(res.error); return; }
      setSheets((prev) => prev.map((s) => s.id === editing.id ? { ...s, status: editStatus, columns_count: cols } : s));
      toast.success("היריעה עודכנה");
      setEditing(null);
      router.refresh();
    } finally { setSaving(false); }
  }

  async function applyBulk() {
    const ids = [...selectedIds];
    if (ids.length === 0) { toast.error("לא נבחרו יריעות"); return; }
    setSaving(true);
    try {
      const res = await batchUpdateSheetStatuses(ids, bulkStatus, projectId);
      if (!res.success) { toast.error(res.error); return; }
      setSheets((prev) => prev.map((s) => selectedIds.has(s.id) ? { ...s, status: bulkStatus } : s));
      toast.success(`עודכנו ${res.updated} יריעות`);
      setSelectedIds(new Set());
      setBulkMode(false);
      router.refresh();
    } finally { setSaving(false); }
  }

  async function handleReceiveFromScribe() {
    const ids = [...selectedIds];
    if (ids.length === 0) {
      toast.error("לא נבחרו יריעות");
      return;
    }
    setReceivingSaving(true);
    try {
      const res = await receiveSheetsFromScribe(projectId, ids);
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      setSheets((prev) =>
        prev.map((s) => (ids.includes(s.id) ? { ...s, status: "written" as const } : s))
      );
      const paceLabel =
        res.pace.status === "delayed"
          ? "קצב: באיחור"
          : res.pace.status === "on_track"
            ? "קצב: בעקבות היעד"
            : "קצב: לא מוגדר";
      toast.success(`קולטו ${res.updated} יריעות — ${paceLabel}`);
      setSelectedIds(new Set());
      setBulkMode(false);
      router.refresh();
    } finally {
      setReceivingSaving(false);
    }
  }

  // ── QA handlers ─────────────────────────────────────────

  async function handleCreateBatch() {
    if (!batchMagiahId) { toast.error("בחר מגיה"); return; }
    if (batchSheetIds.size === 0) { toast.error("בחר לפחות יריעה אחת"); return; }
    setBatchSaving(true);
    try {
      const res = await createQaBatch(projectId, batchMagiahId, [...batchSheetIds], batchNotes || null);
      if (!res.success) { toast.error(res.error); return; }
      toast.success("שקית ההגהה נוצרה");
      setCreateBatchOpen(false);
      setBatchMagiahId("");
      setBatchSheetIds(new Set());
      setBatchNotes("");
      setSheets((prev) => prev.map((s) => batchSheetIds.has(s.id) ? { ...s, status: "in_qa" } : s));
      await loadBatches();
      router.refresh();
    } finally { setBatchSaving(false); }
  }

  async function handleSaveProjectEdit() {
    setEditSaving(true);
    try {
      const res = await updateTorahProject(projectId, {
        title: editTitle.trim(),
        target_date: editTarget === "" ? null : editTarget,
        total_agreed_price: editTotalAgreed === "" ? 0 : Number(editTotalAgreed),
        columns_per_day: editColumnsPerDay === "" ? 0 : Number(editColumnsPerDay),
        qa_weeks_buffer:
          editQaWeeks === "" ? 0 : Math.max(0, Math.floor(Number(editQaWeeks))),
        gavra_qa_count:
          editGavraQa === "" ? 0 : Math.max(0, Math.floor(Number(editGavraQa))),
        computer_qa_count:
          editComputerQa === "" ? 0 : Math.max(0, Math.floor(Number(editComputerQa))),
        requires_tagging: editRequiresTagging,
        price_per_column: editPricePerColumn === "" ? 0 : Number(editPricePerColumn),
        includes_accessories: editIncludesAccessories,
        parchment_type: editParchmentType.trim() || null,
      });
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      toast.success("הפרויקט עודכן");
      setEditProjectOpen(false);
      router.refresh();
    } finally {
      setEditSaving(false);
    }
  }

  async function handleSavePayments() {
    setPaySaving(true);
    try {
      const res = await updateProjectPayments(projectId, {
        clientPaid: payClientStr === "" ? 0 : Number(payClientStr),
        scribePaid: payScribeStr === "" ? 0 : Number(payScribeStr),
      });
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      toast.success("תשלומים עודכנו");
      setPaymentsOpen(false);
      router.refresh();
    } finally {
      setPaySaving(false);
    }
  }

  async function handleCreateMagiah() {
    const name = newMagiahName.trim();
    if (!name) {
      toast.error("הזן שם מגיה");
      return;
    }
    setCreatingMagiah(true);
    try {
      const res = await createCrmContact({
        name,
        type: "Other",
        tags: ["Magiah", "מגיה"],
      });
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      const magiahId = res.id;
      if (!magiahId) {
        toast.error("לא התקבל מזהה איש קשר");
        return;
      }
      setContacts((prev) =>
        [...prev, { id: magiahId, name }].sort((a, b) => a.name.localeCompare(b.name, "he"))
      );
      setBatchMagiahId(magiahId);
      toast.success("מגיה נוצר ונבחר");
      setNewMagiahName("");
      setNewMagiahOpen(false);
    } finally {
      setCreatingMagiah(false);
    }
  }

  async function handleReturnBatch(batchId: string) {
    setReturningId(batchId);
    try {
      const res = await returnQaBatch(batchId, projectId);
      if (!res.success) { toast.error(res.error); return; }
      toast.success("השקית סומנה כחזרה מהגהה");
      await loadBatches();
      router.refresh();
    } finally { setReturningId(null); }
  }

  const toggleBatchSheet = (id: string) => {
    setBatchSheetIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const targetStr = project.target_date ? new Date(project.target_date).toLocaleDateString("he-IL") : "—";
  const startStr = project.start_date ? new Date(project.start_date).toLocaleDateString("he-IL") : "—";
  const showBulkBar = bulkMode && selectedIds.size > 0;

  // ─────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────

  return (
    <div className={cn("pb-28", showBulkBar && "pb-36")}>
      <div className="container mx-auto max-w-6xl px-3 sm:px-4 py-6 sm:py-8">

        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-800 truncate">{project.title}</h1>
            <p className="text-xs text-muted-foreground mt-1 font-mono truncate">{project.id}</p>
            <p className="text-sm text-slate-600 mt-3 flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground">סטטוס פרויקט:</span>{" "}
              {TORAH_PROJECT_STATUS_LABELS[project.status]}
              {project.requires_tagging && (
                <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold bg-amber-100 text-amber-900 border border-amber-200">
                  שלב תיוג בחוזה
                </span>
              )}
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
                  scribePace.status === "on_track" && "bg-emerald-100 text-emerald-800",
                  scribePace.status === "delayed" && "bg-red-100 text-red-800",
                  scribePace.status === "unknown" && "bg-slate-100 text-slate-600"
                )}
                title={
                  scribePace.status === "unknown"
                    ? "הגדר קצב סופר ותאריך התחלה לחישוב"
                    : `עמודות בפועל ${scribePace.actualColumns} / צפוי ${Math.round(scribePace.expectedColumns)} (סה״כ ${scribePace.totalColumns})`
                }
              >
                סטטוס קצב:{" "}
                {scribePace.status === "on_track"
                  ? "בעקבות היעד"
                  : scribePace.status === "delayed"
                    ? "באיחור לעומת הקצב"
                    : "לא מחושב"}
              </span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="rounded-lg text-red-600 hover:text-red-700 hover:bg-red-50"
              title="מחק פרויקט"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="size-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-lg"
              onClick={() => setEditProjectOpen(true)}
            >
              <Pencil className="size-3.5 ml-1" />
              ערוך פרויקט
            </Button>
            <Button
              type="button"
              variant={bulkMode ? "default" : "outline"}
              size="sm"
              className={cn(bulkMode && "bg-sky-600 hover:bg-sky-700")}
              onClick={() => { setBulkMode((m) => !m); setSelectedIds(new Set()); }}
            >
              {bulkMode
                ? <><CheckSquare className="size-4 ml-1" />ביטול בחירה מרובה</>
                : <><Square className="size-4 ml-1" />בחירה מרובה</>}
            </Button>
          </div>
        </div>

        {/* Cash tracking */}
        <Card className="mb-6 rounded-xl border border-slate-200 bg-white shadow-sm">
          <CardContent className="p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-2 sm:flex-row sm:gap-8 text-sm">
              <p>
                <span className="text-muted-foreground">שולם מהלקוח: </span>
                <strong className="tabular-nums text-slate-900">
                  {formatShekels(project.amount_paid_by_client)}
                </strong>
              </p>
              <p>
                <span className="text-muted-foreground">שולם לסופר: </span>
                <strong className="tabular-nums text-slate-900">
                  {formatShekels(project.amount_paid_to_scribe)}
                </strong>
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0 self-start sm:self-auto"
              onClick={() => {
                setPayClientStr(String(project.amount_paid_by_client));
                setPayScribeStr(String(project.amount_paid_to_scribe));
                setPaymentsOpen(true);
              }}
            >
              עדכן
            </Button>
          </CardContent>
        </Card>

        {/* Meta cards */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-6">
          {[
            { label: "סופר", val: project.scribe_name ?? "—" },
            { label: "לקוח", val: project.client_name ?? "—" },
            { label: "תחילה", val: startStr },
            { label: "יעד", val: targetStr },
          ].map(({ label, val }) => (
            <Card key={label} className="rounded-xl border-slate-200">
              <CardContent className="p-4 text-sm">
                <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
                <p className="font-medium text-slate-800">{val}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Financials */}
        <Card className="rounded-2xl border-sky-100 bg-white shadow-sm mb-6">
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center gap-2 mb-4">
              <Layers className="size-5 text-sky-600" />
              <h2 className="text-lg font-semibold text-sky-900">סיכום כספי (לפי עמודות)</h2>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              מחיר מוסכם:{" "}
              <span className="font-medium text-slate-700">{formatShekels(project.total_agreed_price)}</span>
              {" · "}{financials.totalColumns} עמודות{" · "}{formatShekels(financials.pricePerColumn)} לעמודה
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-red-200 bg-red-50/80 p-4">
                <p className="text-xs font-medium text-red-800 mb-1">חוב אקטיבי ממומש</p>
                <p className="text-2xl font-bold text-red-700 tabular-nums">{formatShekels(financials.actualDebt)}</p>
                <p className="text-xs text-red-600/80 mt-1">{financials.completedColumns} עמודות באושר / תפור</p>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50/90 p-4">
                <p className="text-xs font-medium text-amber-900 mb-1">יתרה לשריון</p>
                <p className="text-2xl font-bold text-amber-800 tabular-nums">{formatShekels(financials.futureCommitment)}</p>
                <p className="text-xs text-amber-800/80 mt-1">יתרת חוזה שלא הומרה לחוב ממומש</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── TABS ─────────────────────────────────────────── */}
        <Tabs
          defaultValue="sheets"
          onValueChange={(v) => { if (v === "qa" && !batchesLoaded) { loadBatches(); loadContacts(); } }}
        >
          <TabsList className="mb-4">
            <TabsTrigger value="sheets">לוח יריעות</TabsTrigger>
            <TabsTrigger value="qa">מערכת הגהות</TabsTrigger>
          </TabsList>

          {/* ── TAB 1: Sheet grid ────────────────────────── */}
          <TabsContent value="sheets">
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

            <div className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-4 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">
                יריעות ({sheets.length} / {TORAH_SHEET_COUNT})
              </h3>
              <div className="grid grid-cols-5 sm:grid-cols-7 md:grid-cols-10 gap-1.5 sm:gap-2">
                {Array.from({ length: TORAH_SHEET_COUNT }, (_, i) => {
                  const n = i + 1;
                  const row = sheetByNumber.get(n) ?? null;
                  const selected = row ? selectedIds.has(row.id) : false;
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
                        <span className="absolute top-0.5 right-0.5 size-2.5 rounded-full bg-sky-600 ring-2 ring-white" aria-hidden />
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
          </TabsContent>

          {/* ── TAB 2: QA Batches ────────────────────────── */}
          <TabsContent value="qa">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
                <PackageCheck className="size-5 text-amber-600" />
                שקיות הגהה
              </h2>
              <Button
                size="sm"
                className="rounded-xl bg-amber-600 hover:bg-amber-700 text-white"
                onClick={() => { loadContacts(); setCreateBatchOpen(true); }}
              >
                <PlusCircle className="size-4 ml-1" />
                צור שקית הגהה
              </Button>
            </div>

            {!batchesLoaded ? (
              <p className="text-sm text-muted-foreground py-8 text-center">טוען...</p>
            ) : batches.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-sm text-muted-foreground">
                אין עדיין שקיות הגהה לפרויקט זה
              </div>
            ) : (
              <div className="space-y-3">
                {batches.map((b) => (
                  <Card key={b.id} className={cn(
                    "rounded-xl border",
                    b.status === "sent" ? "border-amber-200 bg-amber-50/50" : "border-slate-200 bg-slate-50/50"
                  )}>
                    <CardContent className="p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={cn(
                              "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                              b.status === "sent" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"
                            )}>
                              {b.status === "sent" ? "בהגהה" : "חזרה מהגהה"}
                            </span>
                            <span className="text-xs text-muted-foreground font-mono">{b.id.slice(0, 8)}…</span>
                          </div>
                          <p className="text-sm font-medium text-slate-800">
                            מגיה: {b.magiah_name ?? b.magiah_id.slice(0, 8)}
                          </p>
                          <p className="text-xs text-slate-600">
                            נשלח: {formatDate(b.sent_date)}
                            {b.returned_date && <> · חזר: {formatDate(b.returned_date)}</>}
                          </p>
                          <p className="text-xs text-slate-500">
                            יריעות ({b.sheet_numbers.length}): {b.sheet_numbers.join(", ") || "—"}
                          </p>
                          {b.notes && <p className="text-xs text-slate-500 italic">{b.notes}</p>}
                        </div>
                        <div className="flex flex-wrap gap-2 shrink-0">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="rounded-lg"
                            onClick={() =>
                              window.open(
                                `/torah/${projectId}/print-batch/${b.id}`,
                                "_blank",
                                "noopener,noreferrer"
                              )
                            }
                          >
                            🖨️ הדפס מדבקה
                          </Button>
                          {b.status === "sent" && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="rounded-lg border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                              disabled={returningId === b.id}
                              onClick={() => handleReturnBatch(b.id)}
                            >
                              <RotateCcw className="size-3.5 ml-1" />
                              {returningId === b.id ? "מעדכן..." : "סמן כחזר מהגהה"}
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-red-700">מחיקת פרויקט</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            למחוק לצמיתות את «{project.title}» ואת כל 62 היריעות והשקיות? פעולה זו אינה הפיכה.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setDeleteOpen(false)}>
              ביטול
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleting}
              onClick={async () => {
                setDeleting(true);
                try {
                  const res = await deleteTorahProject(projectId);
                  if (!res.success) {
                    toast.error(res.error);
                    return;
                  }
                  toast.success("הפרויקט נמחק");
                  router.push("/torah");
                  router.refresh();
                } finally {
                  setDeleting(false);
                  setDeleteOpen(false);
                }
              }}
            >
              {deleting ? "מוחק..." : "מחק"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Edit project dialog ──────────────────────────── */}
      <Dialog open={editProjectOpen} onOpenChange={setEditProjectOpen}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle>עריכת פרויקט</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <p className="text-xs text-muted-foreground mb-1">כותרת</p>
              <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">תאריך יעד</p>
              <Input type="date" value={editTarget} onChange={(e) => setEditTarget(e.target.value)} />
            </div>

            <div className="border-t border-slate-100 pt-3 space-y-3">
              <p className="text-xs font-semibold text-foreground">פרטי חוזה</p>
              <div>
                <p className="text-xs text-muted-foreground mb-1">מחיר מוסכם כולל (₪)</p>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={editTotalAgreed}
                  onChange={(e) => setEditTotalAgreed(applyNumericTransform(e.target.value))}
                />
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">מחיר לעמודה (₪)</p>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={editPricePerColumn}
                  onChange={(e) => setEditPricePerColumn(applyNumericTransform(e.target.value))}
                />
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">סוג קלף</p>
                <select
                  value={editParchmentType}
                  onChange={(e) => setEditParchmentType(e.target.value)}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">— לא צוין —</option>
                  {TORAH_CONTRACT_PARCHMENT_TYPES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={editIncludesAccessories}
                  onChange={(e) => setEditIncludesAccessories(e.target.checked)}
                  className="size-4 rounded border-input"
                />
                כולל אביזרים בחוזה
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">הגהות גו״ר מוסכמות</p>
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    value={editGavraQa}
                    onChange={(e) => setEditGavraQa(applyNumericTransform(e.target.value))}
                  />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">הגהות מחשב מוסכמות</p>
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    value={editComputerQa}
                    onChange={(e) => setEditComputerQa(applyNumericTransform(e.target.value))}
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={editRequiresTagging}
                  onChange={(e) => setEditRequiresTagging(e.target.checked)}
                  className="size-4 rounded border-input"
                />
                נדרש שלב תיוג חיצוני בחוזה
              </label>
            </div>

            <div className="border-t border-slate-100 pt-3 space-y-3">
              <p className="text-xs font-medium text-slate-700">הגדרות תהליך</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">קצב סופר — עמודות ליום</p>
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    value={editColumnsPerDay}
                    onChange={(e) => setEditColumnsPerDay(applyNumericTransform(e.target.value))}
                  />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">מאגר שבועות ל‑QA לפני היעד</p>
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    value={editQaWeeks}
                    onChange={(e) => setEditQaWeeks(applyNumericTransform(e.target.value))}
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <Button
                type="button"
                className="flex-1 bg-sky-600 hover:bg-sky-700"
                disabled={editSaving || !editTitle.trim()}
                onClick={handleSaveProjectEdit}
              >
                {editSaving ? "שומר..." : "שמור"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setEditProjectOpen(false)}>
                ביטול
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Project payments dialog ─────────────────────────── */}
      <Dialog open={paymentsOpen} onOpenChange={setPaymentsOpen}>
        <DialogContent className="sm:max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base">תשלומי פרויקט</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <p className="text-xs text-muted-foreground mb-1">שולם מהלקוח (₪)</p>
              <Input
                type="number"
                min={0}
                step={0.01}
                value={payClientStr}
                onChange={(e) => setPayClientStr(applyNumericTransform(e.target.value))}
              />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">שולם לסופר (₪)</p>
              <Input
                type="number"
                min={0}
                step={0.01}
                value={payScribeStr}
                onChange={(e) => setPayScribeStr(applyNumericTransform(e.target.value))}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" size="sm" onClick={() => setPaymentsOpen(false)}>
                ביטול
              </Button>
              <Button
                type="button"
                size="sm"
                className="bg-sky-600 hover:bg-sky-700"
                disabled={paySaving}
                onClick={handleSavePayments}
              >
                {paySaving ? "שומר..." : "שמור"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── New Magiah dialog ─────────────────────────────── */}
      <Dialog open={newMagiahOpen} onOpenChange={setNewMagiahOpen}>
        <DialogContent className="sm:max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base">מגיה חדש</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <Input
              autoFocus
              placeholder="שם מלא"
              value={newMagiahName}
              onChange={(e) => setNewMagiahName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleCreateMagiah();
                }
              }}
            />
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" size="sm" onClick={() => setNewMagiahOpen(false)}>
                ביטול
              </Button>
              <Button
                type="button"
                size="sm"
                className="bg-amber-600 hover:bg-amber-700"
                disabled={creatingMagiah}
                onClick={handleCreateMagiah}
              >
                {creatingMagiah ? "יוצר..." : "צור ובחר"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Single-sheet dialog ──────────────────────────── */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>
              יריעה {editing?.sheet_number}
              {editing?.sku && (
                <span className="block text-xs font-normal text-muted-foreground mt-1 font-mono">{editing.sku}</span>
              )}
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
                  <option key={k} value={k}>{TORAH_SHEET_STATUS_LABELS[k]}</option>
                ))}
              </select>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">מספר עמודות (1–12)</p>
              <Input type="number" min={1} max={12} value={editCols} onChange={(e) => setEditCols(e.target.value)} />
            </div>
            <div className="flex gap-2 pt-2">
              <Button type="button" className="flex-1 bg-sky-600 hover:bg-sky-700" disabled={saving} onClick={saveEdit}>
                {saving ? "שומר..." : "שמור"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>ביטול</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Create QA Batch dialog ───────────────────────── */}
      <Dialog open={createBatchOpen} onOpenChange={(o) => !o && setCreateBatchOpen(false)}>
        <DialogContent className="sm:max-w-lg rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PackageCheck className="size-5 text-amber-600" />
              צור שקית הגהה
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">מגיה</p>
              <div className="flex gap-2 items-end">
                <select
                  value={batchMagiahId}
                  onChange={(e) => setBatchMagiahId(e.target.value)}
                  className="h-10 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">— בחר מגיה —</option>
                  {contacts.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-10 shrink-0 whitespace-nowrap px-2.5 text-xs"
                  onClick={() => setNewMagiahOpen(true)}
                >
                  ➕ מגיה חדש
                </Button>
              </div>
            </div>

            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">
                יריעות לשליחה ({batchSheetIds.size} נבחרו)
              </p>
              {eligibleSheets.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">
                  אין יריעות הניתנות לשליחה להגהה (נכתבו / לתיקון)
                </p>
              ) : (
                <div className="rounded-md border border-input bg-background p-2 max-h-52 overflow-y-auto space-y-1">
                  <label className="flex items-center gap-2 text-xs text-muted-foreground px-1 pb-1 border-b cursor-pointer">
                    <input
                      type="checkbox"
                      checked={batchSheetIds.size === eligibleSheets.length && eligibleSheets.length > 0}
                      onChange={(e) => {
                        if (e.target.checked) setBatchSheetIds(new Set(eligibleSheets.map((s) => s.id)));
                        else setBatchSheetIds(new Set());
                      }}
                    />
                    בחר הכל ({eligibleSheets.length})
                  </label>
                  {eligibleSheets.map((s) => (
                    <label key={s.id} className="flex items-center gap-2 text-sm px-1 py-0.5 rounded hover:bg-muted cursor-pointer">
                      <input
                        type="checkbox"
                        checked={batchSheetIds.has(s.id)}
                        onChange={() => toggleBatchSheet(s.id)}
                      />
                      <span>יריעה {s.sheet_number}</span>
                      <span className={cn(
                        "mr-auto text-[10px] rounded px-1.5 py-0.5 font-medium",
                        s.status === "written" ? "bg-sky-100 text-sky-700" : "bg-red-100 text-red-700"
                      )}>
                        {TORAH_SHEET_STATUS_LABELS[s.status]}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">הערות למגיה (אופציונלי)</p>
              <textarea
                value={batchNotes}
                onChange={(e) => setBatchNotes(e.target.value)}
                maxLength={500}
                rows={3}
                placeholder="הוראות מיוחדות, שאלות..."
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div className="flex gap-2 pt-1">
              <Button
                type="button"
                className="flex-1 bg-amber-600 hover:bg-amber-700"
                disabled={batchSaving || batchSheetIds.size === 0 || !batchMagiahId}
                onClick={handleCreateBatch}
              >
                {batchSaving ? "שולח..." : `שלח ${batchSheetIds.size > 0 ? batchSheetIds.size + " " : ""}יריעות להגהה`}
              </Button>
              <Button type="button" variant="outline" onClick={() => setCreateBatchOpen(false)}>ביטול</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Bulk sticky bar ──────────────────────────────── */}
      {showBulkBar && (
        <div className="fixed bottom-0 inset-x-0 z-50 border-t border-slate-200 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 shadow-[0_-4px_24px_rgba(0,0,0,0.08)] px-3 py-3 sm:py-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto flex max-w-6xl flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-center sm:gap-4">
            <p className="text-center text-sm text-slate-600 sm:text-right">
              נבחרו <strong>{selectedIds.size}</strong> יריעות
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:flex-wrap sm:justify-center">
              <Button
                type="button"
                variant="outline"
                className="whitespace-nowrap border-emerald-300 text-emerald-800 hover:bg-emerald-50"
                disabled={receivingSaving || saving}
                onClick={handleReceiveFromScribe}
              >
                <Inbox className="size-4 ml-1" />
                {receivingSaving ? "מקליט..." : "קלוט יריעות מהסופר"}
              </Button>
              <select
                value={bulkStatus}
                onChange={(e) => setBulkStatus(e.target.value as TorahSheetStatus)}
                className="h-10 w-full sm:w-56 rounded-md border border-input bg-background px-3 text-sm"
              >
                {(Object.keys(TORAH_SHEET_STATUS_LABELS) as TorahSheetStatus[]).map((k) => (
                  <option key={k} value={k}>{TORAH_SHEET_STATUS_LABELS[k]}</option>
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
