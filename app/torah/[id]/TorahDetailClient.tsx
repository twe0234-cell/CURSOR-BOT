"use client";

import {
  useEffect,
  useMemo,
  useState,
  useCallback,
  type ReactNode,
  type ChangeEvent,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CheckSquare,
  Square,
  Layers,
  PackageCheck,
  PlusCircle,
  RotateCcw,
  Pencil,
  Inbox,
  Trash2,
  ExternalLink,
  FileText,
  Warehouse,
  ClipboardList,
  Wrench,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { estimateTorahScrollWritingCompletionDate } from "@/src/services/torahCompletionForecast";
import {
  getTorahColumnsForSheet,
  uniqueParshiyotOnSheet,
} from "@/src/lib/constants/torahPages";
import { TorahFinancialsTab } from "./TorahFinancialsTab";
import { TorahOverviewTab } from "./TorahOverviewTab";
import { TorahProjectWorkflowSummary } from "@/components/torah/TorahProjectWorkflowSummary";
import {
  updateSheet,
  batchUpdateSheetStatuses,
  updateTorahProject,
  receiveSheetsFromScribe,
  markTorahSheetsReceived,
  deleteTorahProject,
  type TorahProjectWorkflowSummaryData,
} from "./actions";
import { createCrmContact } from "@/app/crm/actions";
import { applyNumericTransform } from "@/lib/numericInput";
import {
  createQaBatch,
  returnQaBatch,
  fetchQaBatches,
  fetchQaBatchSheetRows,
  resolveTorahSheetQa,
  bulkResolveOpenQaBatchSheets,
  fetchTorahFixTasks,
  createTorahFixTaskAction,
  completeTorahFixTaskAction,
  type QaBatchRow,
  type QaBatchSheetRow,
  type TorahFixTaskRow,
} from "./qa-actions";
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

function formatSheetStatusLabel(st: string): string {
  const keys = Object.keys(TORAH_SHEET_STATUS_LABELS) as TorahSheetStatus[];
  if (keys.includes(st as TorahSheetStatus)) {
    return TORAH_SHEET_STATUS_LABELS[st as TorahSheetStatus];
  }
  return st;
}

const QA_KIND_LABELS: Record<"gavra" | "computer" | "repair" | "other", string> = {
  gavra: "גב״ר",
  computer: "מחשב",
  repair: "תיקון",
  other: "אחר",
};

type FixCompletionRoute =
  | "computer_review"
  | "gavra_review"
  | "return_to_sofer"
  | "approve";

const SHEET_CELL_STYLES: Record<TorahSheetStatus, string> = {
  not_started: "bg-slate-200 text-slate-700 border-slate-300 hover:bg-slate-300/70",
  written: "bg-sky-200 text-sky-900 border-sky-400 hover:bg-sky-300",
  reported_written: "bg-sky-100 text-sky-900 border-sky-300 hover:bg-sky-200",
  received: "bg-teal-200 text-teal-950 border-teal-400 hover:bg-teal-300",
  in_qa: "bg-amber-200 text-amber-950 border-amber-400 hover:bg-amber-300",
  needs_fixing: "bg-red-200 text-red-900 border-red-400 hover:bg-red-300",
  approved: "bg-emerald-300 text-emerald-950 border-emerald-500 hover:bg-emerald-400",
  sewn: "bg-emerald-500 text-white border-emerald-600 hover:bg-emerald-600",
};

/** ריחוף — פרשות ייחודיות ביריעה (מיפוי עמודים) */
function SheetGridCellWithTooltip({
  sheetNumber,
  children,
}: {
  sheetNumber: number;
  children: ReactNode;
}) {
  const parshiyot = uniqueParshiyotOnSheet(sheetNumber);
  const tip = parshiyot.length > 0 ? parshiyot.join(" · ") : "—";
  return (
    <span className="group relative block aspect-square min-h-[2.5rem] w-full">
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-[60] mb-1.5 w-max max-w-[min(17rem,calc(100vw-2rem))] -translate-x-1/2 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-[10px] leading-snug text-white shadow-xl opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
      >
        <span className="font-semibold text-slate-300">פרשות:</span> {tip}
      </span>
    </span>
  );
}

const LEGEND: { status: TorahSheetStatus; label: string }[] = [
  { status: "not_started", label: TORAH_SHEET_STATUS_LABELS.not_started },
  { status: "written", label: TORAH_SHEET_STATUS_LABELS.written },
  { status: "reported_written", label: TORAH_SHEET_STATUS_LABELS.reported_written },
  { status: "received", label: TORAH_SHEET_STATUS_LABELS.received },
  { status: "in_qa", label: TORAH_SHEET_STATUS_LABELS.in_qa },
  { status: "needs_fixing", label: TORAH_SHEET_STATUS_LABELS.needs_fixing },
  { status: "approved", label: TORAH_SHEET_STATUS_LABELS.approved },
  { status: "sewn", label: TORAH_SHEET_STATUS_LABELS.sewn },
];

// Statuses eligible to be added to a QA batch (כולל מצבי מסלול חדשים ללא שבירת יריעות legacy "written")
const QA_ELIGIBLE: TorahSheetStatus[] = [
  "written",
  "reported_written",
  "received",
  "needs_fixing",
];

// ─────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────

type Props = {
  projectId: string;
  project: TorahProjectDetailView;
  initialSheets: TorahSheetGridRow[];
  workflowSummary: TorahProjectWorkflowSummaryData;
  parchmentLabels: string[];
};

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

export default function TorahDetailClient({
  projectId,
  project,
  initialSheets,
  workflowSummary,
  parchmentLabels,
}: Props) {
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
  const [batchCheckerId, setBatchCheckerId] = useState("");
  const [batchQaKind, setBatchQaKind] = useState<"" | "gavra" | "computer" | "repair" | "other">("");
  const [batchCost, setBatchCost] = useState("");
  const [batchReportUrl, setBatchReportUrl] = useState<string | null>(null);
  const [batchReportUploading, setBatchReportUploading] = useState(false);
  const [batchSaving, setBatchSaving] = useState(false);
  const [returningId, setReturningId] = useState<string | null>(null);
  const [contacts, setContacts] = useState<{ id: string; name: string }[]>([]);

  const [fixTasks, setFixTasks] = useState<TorahFixTaskRow[]>([]);
  const [fixTasksLoaded, setFixTasksLoaded] = useState(false);
  const [resolvePanelBatchId, setResolvePanelBatchId] = useState<string | null>(null);
  const [resolveRows, setResolveRows] = useState<QaBatchSheetRow[]>([]);
  const [resolveLoading, setResolveLoading] = useState(false);
  const [resolvingSheetId, setResolvingSheetId] = useState<string | null>(null);
  const [resolvingBatchId, setResolvingBatchId] = useState<string | null>(null);

  const [fixTaskTarget, setFixTaskTarget] = useState<{
    sheet: QaBatchSheetRow;
    qaBatchId: string;
  } | null>(null);
  const [fixTaskSaving, setFixTaskSaving] = useState(false);

  const [completeFixTarget, setCompleteFixTarget] = useState<TorahFixTaskRow | null>(null);
  const [completeActualCost, setCompleteActualCost] = useState("");
  const [completeRoute, setCompleteRoute] = useState<FixCompletionRoute>("computer_review");
  const [completeSaving, setCompleteSaving] = useState(false);

  const [warehouseSaving, setWarehouseSaving] = useState(false);

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
  const [editClientContractUrl, setEditClientContractUrl] = useState(
    project.client_contract_url ?? ""
  );
  const [editScribeContractUrl, setEditScribeContractUrl] = useState(
    project.scribe_contract_url ?? ""
  );
  const [editPlannedParchment, setEditPlannedParchment] = useState(
    project.planned_parchment_budget != null ? String(project.planned_parchment_budget) : ""
  );
  const [editPlannedScribe, setEditPlannedScribe] = useState(
    project.planned_scribe_budget != null ? String(project.planned_scribe_budget) : ""
  );
  const [editPlannedProofreading, setEditPlannedProofreading] = useState(
    project.planned_proofreading_budget != null ? String(project.planned_proofreading_budget) : ""
  );
  const [editEstimatedExpensesTotal, setEditEstimatedExpensesTotal] = useState(
    project.estimated_expenses_total != null ? String(project.estimated_expenses_total) : ""
  );
  const [editIncludesAccessories, setEditIncludesAccessories] = useState(
    project.includes_accessories
  );
  const [editSaving, setEditSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
    setEditClientContractUrl(project.client_contract_url ?? "");
    setEditScribeContractUrl(project.scribe_contract_url ?? "");
    setEditPlannedParchment(
      project.planned_parchment_budget != null ? String(project.planned_parchment_budget) : ""
    );
    setEditPlannedScribe(
      project.planned_scribe_budget != null ? String(project.planned_scribe_budget) : ""
    );
    setEditPlannedProofreading(
      project.planned_proofreading_budget != null
        ? String(project.planned_proofreading_budget)
        : ""
    );
    setEditEstimatedExpensesTotal(
      project.estimated_expenses_total != null ? String(project.estimated_expenses_total) : ""
    );
    setEditIncludesAccessories(project.includes_accessories);
  }, [project]);

  const parchmentSelectOptions = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const p of parchmentLabels) {
      const t = p.trim();
      if (t && !seen.has(t)) {
        seen.add(t);
        out.push(t);
      }
    }
    if (out.length === 0) {
      for (const p of TORAH_CONTRACT_PARCHMENT_TYPES) out.push(p);
    }
    return out;
  }, [parchmentLabels]);

  const loadBatches = useCallback(async () => {
    const res = await fetchQaBatches(projectId);
    if (res.success) setBatches(res.batches);
    setBatchesLoaded(true);
  }, [projectId]);

  const loadFixTasks = useCallback(async () => {
    const res = await fetchTorahFixTasks(projectId);
    if (res.success) setFixTasks(res.tasks);
    setFixTasksLoaded(true);
  }, [projectId]);

  const loadContacts = useCallback(async () => {
    const { fetchCrmContactsForSelect } = await import("../actions");
    const res = await fetchCrmContactsForSelect();
    if (res.success) setContacts(res.contacts);
  }, []);

  useEffect(() => {
    if (!resolvePanelBatchId) {
      setResolveRows([]);
      return;
    }
    let cancelled = false;
    setResolveLoading(true);
    void fetchQaBatchSheetRows(projectId, resolvePanelBatchId).then((res) => {
      if (cancelled) return;
      if (res.success) setResolveRows(res.sheets);
      else toast.error(res.error);
      setResolveLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [resolvePanelBatchId, projectId]);

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

  const writingCompletionForecast = useMemo(
    () =>
      estimateTorahScrollWritingCompletionDate({
        sheets,
        columnsPerDay: project.columns_per_day,
        startDate: project.start_date,
      }),
    [sheets, project.columns_per_day, project.start_date]
  );

  const [openBatchResolving, setOpenBatchResolving] = useState<string | null>(null);

  async function handleBulkOpenBatch(batchId: string, outcome: "approved" | "needs_fixing") {
    setOpenBatchResolving(batchId);
    try {
      const res = await bulkResolveOpenQaBatchSheets(projectId, batchId, outcome);
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      const next = outcome === "approved" ? ("approved" as const) : ("needs_fixing" as const);
      const nums = new Set(batches.find((b) => b.id === batchId)?.sheet_numbers ?? []);
      setSheets((prev) =>
        prev.map((s) =>
          nums.has(s.sheet_number) && s.status === "in_qa" ? { ...s, status: next } : s
        )
      );
      toast.success(
        outcome === "approved" ? "כל יריעות השקית אושרו" : "כל יריעות השקית סומנו לתיקון"
      );
      await loadBatches();
      router.refresh();
    } finally {
      setOpenBatchResolving(null);
    }
  }

  const eligibleSheets = useMemo(
    () => sheets.filter((s) => QA_ELIGIBLE.includes(s.status)),
    [sheets]
  );

  const selectedSheetRows = useMemo(
    () => sheets.filter((s) => selectedIds.has(s.id)),
    [sheets, selectedIds]
  );
  const allSelectedReportedWritten =
    selectedSheetRows.length > 0 &&
    selectedSheetRows.every((s) => s.status === "reported_written");

  const canSubmitQaBatch =
    batchSheetIds.size > 0 &&
    (Boolean(batchMagiahId) || Boolean(batchCheckerId) || batchQaKind === "computer");

  const openFixTasks = useMemo(
    () => fixTasks.filter((t) => t.status === "open"),
    [fixTasks]
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
        prev.map((s) => (ids.includes(s.id) ? { ...s, status: "reported_written" as const } : s))
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

  async function handleMarkWarehouseReceived() {
    const ids = [...selectedIds];
    if (ids.length === 0) {
      toast.error("לא נבחרו יריעות");
      return;
    }
    setWarehouseSaving(true);
    try {
      const res = await markTorahSheetsReceived(projectId, ids);
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      setSheets((prev) =>
        prev.map((s) => (ids.includes(s.id) ? { ...s, status: "received" as const } : s))
      );
      toast.success(`קליטת מחסן: ${res.updated} יריעות`);
      setSelectedIds(new Set());
      setBulkMode(false);
      router.refresh();
    } finally {
      setWarehouseSaving(false);
    }
  }

  async function handleBatchReportFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBatchReportUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/market/upload", { method: "POST", body: fd });
      const j = (await r.json()) as { url?: string; error?: string };
      if (!r.ok || !j.url) {
        toast.error(j.error ?? "העלאה נכשלה");
        return;
      }
      setBatchReportUrl(j.url);
      toast.success("הקובץ הועלה");
    } finally {
      setBatchReportUploading(false);
      e.target.value = "";
    }
  }

  // ── QA handlers ─────────────────────────────────────────

  async function handleCreateBatch() {
    if (!canSubmitQaBatch) {
      toast.error("בחר יריעות, ומגיה או בודק, או סמן סוג «מחשב»");
      return;
    }
    const costRaw = batchCost.trim().replace(",", ".");
    const costNum = costRaw === "" ? undefined : Number(costRaw);
    if (costRaw !== "" && (!Number.isFinite(costNum) || (costNum as number) < 0)) {
      toast.error("עלות לא תקינה");
      return;
    }
    setBatchSaving(true);
    try {
      const sheetIdsSnapshot = [...batchSheetIds];
      const res = await createQaBatch({
        projectId,
        sheetIds: sheetIdsSnapshot,
        magiahId: batchMagiahId.trim() ? batchMagiahId : null,
        checkerId: batchCheckerId.trim() ? batchCheckerId : null,
        qaKind: batchQaKind || null,
        costAmount: costNum,
        reportUrl: batchReportUrl && batchReportUrl.trim() ? batchReportUrl.trim() : null,
        notes: batchNotes.trim() ? batchNotes : null,
      });
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      toast.success("שקית ההגהה נוצרה");
      setCreateBatchOpen(false);
      setBatchMagiahId("");
      setBatchCheckerId("");
      setBatchQaKind("");
      setBatchCost("");
      setBatchReportUrl(null);
      setBatchSheetIds(new Set());
      setBatchNotes("");
      setSheets((prev) =>
        prev.map((s) =>
          sheetIdsSnapshot.includes(s.id) ? { ...s, status: "in_qa" as const } : s
        )
      );
      await loadBatches();
      await loadFixTasks();
      router.refresh();
    } finally {
      setBatchSaving(false);
    }
  }

  async function handleResolveSheetQa(sheetId: string, outcome: "approved" | "needs_fixing") {
    setResolvingSheetId(sheetId);
    try {
      const res = await resolveTorahSheetQa(projectId, sheetId, outcome);
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      toast.success(outcome === "approved" ? "היריעה אושרה" : "סומנה לתיקון");
      const nextStatus = outcome === "approved" ? ("approved" as const) : ("needs_fixing" as const);
      setSheets((prev) =>
        prev.map((s) => (s.id === sheetId ? { ...s, status: nextStatus } : s))
      );
      setResolveRows((prev) =>
        prev.map((r) => (r.id === sheetId ? { ...r, status: nextStatus } : r))
      );
      await loadFixTasks();
      router.refresh();
    } finally {
      setResolvingSheetId(null);
    }
  }

  async function handleResolveBatchQa(
    batchId: string,
    outcome: "approved" | "needs_fixing"
  ) {
    const rows = resolveRows.filter((r) => r.status === "in_qa");
    if (rows.length === 0) {
      toast.message("אין יריעות פתוחות להחלטה בסבב הזה");
      return;
    }
    setResolvingBatchId(batchId);
    try {
      for (const row of rows) {
        const res = await resolveTorahSheetQa(projectId, row.id, outcome);
        if (!res.success) {
          toast.error(`יריעה ${row.sheet_number}: ${res.error}`);
          return;
        }
      }
      const nextStatus = outcome === "approved" ? ("approved" as const) : ("needs_fixing" as const);
      const idSet = new Set(rows.map((r) => r.id));
      setSheets((prev) => prev.map((s) => (idSet.has(s.id) ? { ...s, status: nextStatus } : s)));
      setResolveRows((prev) =>
        prev.map((r) => (idSet.has(r.id) ? { ...r, status: nextStatus } : r))
      );
      await loadFixTasks();
      toast.success(
        outcome === "approved"
          ? `אושרו ${rows.length} יריעות בסבב`
          : `סומנו ${rows.length} יריעות לתיקון`
      );
      router.refresh();
    } finally {
      setResolvingBatchId(null);
    }
  }

  async function handleSubmitCreateFixTask() {
    if (!fixTaskTarget) return;
    setFixTaskSaving(true);
    try {
      const res = await createTorahFixTaskAction({
        projectId,
        sheetId: fixTaskTarget.sheet.id,
        qaBatchId: fixTaskTarget.qaBatchId,
        description: null,
        costAmount: 0,
      });
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      toast.success("משימת תיקון נוצרה");
      setFixTaskTarget(null);
      await loadFixTasks();
      router.refresh();
    } finally {
      setFixTaskSaving(false);
    }
  }

  async function handleSubmitCompleteFix() {
    if (!completeFixTarget) return;
    const raw = completeActualCost.trim().replace(",", ".");
    let ac: number | null = null;
    if (raw !== "") {
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) {
        toast.error("עלות בפועל לא תקינה");
        return;
      }
      ac = n;
    }
    const nextSheetStatus =
      completeRoute === "approve"
        ? "approved"
        : completeRoute === "return_to_sofer"
          ? "reported_written"
          : "in_qa";
    setCompleteSaving(true);
    try {
      const res = await completeTorahFixTaskAction({
        projectId,
        fixTaskId: completeFixTarget.id,
        actualCost: ac,
        nextSheetStatus,
      });
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      toast.success("משימת התיקון נסגרה");
      setCompleteFixTarget(null);
      setCompleteActualCost("");
      setCompleteRoute("computer_review");
      setSheets((prev) =>
        prev.map((s) =>
          s.id === completeFixTarget.sheet_id
            ? { ...s, status: nextSheetStatus }
            : s
        )
      );
      await loadFixTasks();
      if (resolvePanelBatchId) {
        const r = await fetchQaBatchSheetRows(projectId, resolvePanelBatchId);
        if (r.success) setResolveRows(r.sheets);
      }
      router.refresh();
    } finally {
      setCompleteSaving(false);
    }
  }

  async function handleSaveProjectEdit() {
    const optMoney = (s: string): number | null => {
      const t = s.trim().replace(/,/g, ".");
      if (t === "") return null;
      const n = Number(t);
      if (!Number.isFinite(n) || n < 0) return null;
      return n;
    };
    const pp = optMoney(editPlannedParchment);
    const ps = optMoney(editPlannedScribe);
    const pr = optMoney(editPlannedProofreading);
    const et = optMoney(editEstimatedExpensesTotal);
    if (
      (editPlannedParchment.trim() !== "" && pp === null) ||
      (editPlannedScribe.trim() !== "" && ps === null) ||
      (editPlannedProofreading.trim() !== "" && pr === null) ||
      (editEstimatedExpensesTotal.trim() !== "" && et === null)
    ) {
      toast.error("ערכי תקציב לא תקינים");
      return;
    }
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
        client_contract_url: editClientContractUrl.trim() || null,
        scribe_contract_url: editScribeContractUrl.trim() || null,
        planned_parchment_budget: pp,
        planned_scribe_budget: ps,
        planned_proofreading_budget: pr,
        estimated_expenses_total: et,
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
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      toast.success("השקית הוחזרה — ההוצאה נרשמה לפי עלות הסבב");
      await loadBatches();
      await loadFixTasks();
      router.refresh();
    } finally {
      setReturningId(null);
    }
  }

  const toggleBatchSheet = (id: string) => {
    setBatchSheetIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
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
            {(project.client_contract_url || project.scribe_contract_url) && (
              <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                {project.client_contract_url && (
                  <a
                    href={project.client_contract_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sky-600 hover:text-sky-800 hover:underline"
                  >
                    <FileText className="size-3.5 shrink-0" />
                    חוזה לקוח
                    <ExternalLink className="size-3 opacity-70" />
                  </a>
                )}
                {project.scribe_contract_url && (
                  <a
                    href={project.scribe_contract_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sky-600 hover:text-sky-800 hover:underline"
                  >
                    <FileText className="size-3.5 shrink-0" />
                    חוזה סופר
                    <ExternalLink className="size-3 opacity-70" />
                  </a>
                )}
              </div>
            )}
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
            <Link
              href={`/torah/${projectId}/print-labels`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center justify-center whitespace-nowrap rounded-lg border border-input bg-background px-3 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              🖨️ הדפס גליל מדבקות
            </Link>
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

        <TorahProjectWorkflowSummary
          project={project}
          sheets={sheets}
          summary={workflowSummary}
        />

        {/* Cash tracking — מקור אמת: יומן תנועות (לשונית פיננסים) */}
        <Card className="mb-6 rounded-xl border border-slate-200 bg-white shadow-sm">
          <CardContent className="p-4 flex flex-col gap-2 sm:flex-row sm:gap-8 text-sm">
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
          <Card className="rounded-xl border-sky-200 bg-sky-50/40 sm:col-span-2 lg:col-span-2">
            <CardContent className="p-4 text-sm">
              <p className="text-xs text-sky-900 font-medium mb-0.5">תחזית סיום כתיבה (ימי עבודה עבריים)</p>
              {writingCompletionForecast.ok ? (
                <p className="font-medium text-slate-900">
                  {writingCompletionForecast.workDaysRemaining === 0
                    ? "כל היריעות בקצב כתיבה — אין יתרה לפי הסטטוסים"
                    : `סיום משוער: ${formatDate(writingCompletionForecast.completionDateIso)} · ימי עבודה נדרשים: ${writingCompletionForecast.workDaysRemaining}`}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">{writingCompletionForecast.reason}</p>
              )}
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
          onValueChange={(v) => {
            if (v === "qa") {
              if (!batchesLoaded) void loadBatches();
              if (!fixTasksLoaded) void loadFixTasks();
              void loadContacts();
            }
          }}
        >
          <TabsList className="mb-4 flex flex-wrap h-auto gap-1">
            <TabsTrigger value="sheets">לוח יריעות</TabsTrigger>
            <TabsTrigger value="overview">סקירה וציר זמן</TabsTrigger>
            <TabsTrigger value="qa">מערכת הגהות</TabsTrigger>
            <TabsTrigger value="financials">פיננסים ותקציב</TabsTrigger>
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
                    <SheetGridCellWithTooltip key={n} sheetNumber={n}>
                      <button
                        type="button"
                        onClick={() => handleCellClick(row, n)}
                        className={cn(
                          "relative flex h-full min-h-[2.5rem] w-full flex-col items-center justify-center rounded-md border text-[10px] sm:text-xs font-semibold transition-all",
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
                    </SheetGridCellWithTooltip>
                  );
                })}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="overview">
            <TorahOverviewTab projectId={projectId} project={project} sheets={sheets} />
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
                onClick={() => {
                  void loadContacts();
                  setCreateBatchOpen(true);
                }}
              >
                <PlusCircle className="size-4 ml-1" />
                צור שקית הגהה
              </Button>
            </div>

            {fixTasksLoaded && openFixTasks.length > 0 && (
              <Card className="rounded-xl border-violet-200 bg-violet-50/40 mb-4">
                <CardContent className="p-4">
                  <h3 className="text-sm font-semibold text-violet-900 flex items-center gap-2 mb-3">
                    <Wrench className="size-4 shrink-0" />
                    משימות תיקון פתוחות ({openFixTasks.length})
                  </h3>
                  <div className="space-y-2">
                    {openFixTasks.map((t) => (
                      <div
                        key={t.id}
                        className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-lg border border-violet-100 bg-white/90 px-3 py-2 text-sm"
                      >
                        <div className="min-w-0">
                          <span className="font-medium text-slate-800">
                            יריעה {t.sheet_number ?? "—"}
                          </span>
                          {t.description && (
                            <span className="text-muted-foreground mr-2"> — {t.description}</span>
                          )}
                          <span className="text-xs text-slate-600 mr-2 tabular-nums">
                            (משוער {formatShekels(t.cost_amount)})
                          </span>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="shrink-0 border-violet-300"
                          onClick={() => {
                            setCompleteFixTarget(t);
                            setCompleteActualCost(
                              t.cost_amount > 0 ? String(t.cost_amount) : ""
                            );
                            setCompleteRoute("computer_review");
                          }}
                        >
                          <ClipboardList className="size-3.5 ml-1" />
                          סגור משימה
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {!batchesLoaded ? (
              <p className="text-sm text-muted-foreground py-8 text-center">טוען...</p>
            ) : batches.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-sm text-muted-foreground">
                אין עדיין שקיות הגהה לפרויקט זה
              </div>
            ) : (
              <div className="space-y-3">
                {batches.map((b) => (
                  <Card
                    key={b.id}
                    className={cn(
                      "rounded-xl border",
                      b.status === "sent"
                        ? "border-amber-200 bg-amber-50/50"
                        : "border-slate-200 bg-slate-50/50"
                    )}
                  >
                    <CardContent className="p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={cn(
                                "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                                b.status === "sent"
                                  ? "bg-amber-100 text-amber-800"
                                  : "bg-emerald-100 text-emerald-800"
                              )}
                            >
                              {b.status === "sent" ? "בהגהה" : "חזרה מהגהה"}
                            </span>
                            <span className="text-xs text-muted-foreground font-mono">
                              {b.id.slice(0, 8)}…
                            </span>
                          </div>
                          <p className="text-sm font-medium text-slate-800">
                            מגיה:{" "}
                            {b.magiah_name ??
                              b.vendor_label ??
                              (b.magiah_id ? `${b.magiah_id.slice(0, 8)}…` : "—")}
                            {b.checker_name && (
                              <span className="text-muted-foreground font-normal">
                                {" "}
                                · בודק: {b.checker_name}
                              </span>
                            )}
                            {b.qa_kind != null && (
                              <span className="text-muted-foreground font-normal">
                                {" "}
                                ({QA_KIND_LABELS[b.qa_kind]})
                              </span>
                            )}
                            {typeof b.cost_amount === "number" && b.cost_amount > 0 && (
                              <span className="text-muted-foreground font-normal">
                                {" "}
                                · {b.cost_amount.toLocaleString("he-IL")} ₪
                              </span>
                            )}
                          </p>
                          {b.report_url && (
                            <p className="text-xs">
                              <a
                                href={b.report_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sky-600 hover:underline inline-flex items-center gap-1"
                              >
                                <FileText className="size-3.5" />
                                דוח / קובץ מצורף
                                <ExternalLink className="size-3 opacity-70" />
                              </a>
                            </p>
                          )}
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
                            <>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="rounded-lg border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                                disabled={returningId === b.id}
                                onClick={() => void handleReturnBatch(b.id)}
                              >
                                <RotateCcw className="size-3.5 ml-1" />
                                {returningId === b.id ? "מעדכן..." : "החזר שקית (סגירת סבב)"}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="rounded-lg border-sky-300 text-sky-900"
                                disabled={openBatchResolving === b.id}
                                onClick={() => void handleBulkOpenBatch(b.id, "approved")}
                              >
                                {openBatchResolving === b.id ? "מעדכן..." : "אשר כל השקית (נשלח)"}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="rounded-lg border-amber-300 text-amber-950"
                                disabled={openBatchResolving === b.id}
                                onClick={() => void handleBulkOpenBatch(b.id, "needs_fixing")}
                              >
                                {openBatchResolving === b.id ? "מעדכן..." : "כל השקית לתיקון"}
                              </Button>
                            </>
                          )}
                        </div>
                      </div>

                      {b.status === "returned" && (
                        <div className="mt-4 border-t border-slate-200 pt-3 space-y-3">
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            className="rounded-lg"
                            onClick={() =>
                              setResolvePanelBatchId((prev) => (prev === b.id ? null : b.id))
                            }
                          >
                            {resolvePanelBatchId === b.id
                              ? "הסתר פתרון יריעות"
                              : "פתרון יריעות אחרי החזרה"}
                          </Button>

                          {resolvePanelBatchId === b.id && (
                            <div className="rounded-lg border border-slate-200 bg-white p-3">
                              <div className="mb-3 flex flex-wrap gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-8 text-xs border-emerald-300 text-emerald-800"
                                  disabled={resolvingBatchId === b.id || resolveLoading}
                                  onClick={() => void handleResolveBatchQa(b.id, "approved")}
                                >
                                  אשר את כל השקית
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-8 text-xs border-amber-300 text-amber-900"
                                  disabled={resolvingBatchId === b.id || resolveLoading}
                                  onClick={() => void handleResolveBatchQa(b.id, "needs_fixing")}
                                >
                                  העבר את כל השקית לתיקון
                                </Button>
                              </div>
                              {resolveLoading ? (
                                <p className="text-sm text-muted-foreground py-4 text-center">
                                  טוען יריעות...
                                </p>
                              ) : resolveRows.length === 0 ? (
                                <p className="text-sm text-muted-foreground">אין יריעות מקושרות</p>
                              ) : (
                                <div className="overflow-x-auto">
                                  <Table>
                                    <TableHeader>
                                      <TableRow className="bg-slate-50">
                                        <TableHead className="text-right text-xs">יריעה</TableHead>
                                        <TableHead className="text-right text-xs">סטטוס</TableHead>
                                        <TableHead className="text-right text-xs w-[1%]">
                                          פעולות
                                        </TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {resolveRows.map((row) => {
                                        const openTask = openFixTasks.find(
                                          (x) => x.sheet_id === row.id
                                        );
                                        return (
                                          <TableRow key={row.id}>
                                            <TableCell className="tabular-nums font-medium">
                                              {row.sheet_number}
                                            </TableCell>
                                            <TableCell className="text-xs">
                                              {formatSheetStatusLabel(row.status)}
                                            </TableCell>
                                            <TableCell>
                                              <div className="flex flex-wrap gap-1 justify-end">
                                                {row.status === "in_qa" && (
                                                  <>
                                                    <Button
                                                      type="button"
                                                      size="sm"
                                                      variant="outline"
                                                      className="h-8 text-xs border-emerald-300 text-emerald-800"
                                                      disabled={resolvingSheetId === row.id}
                                                      onClick={() =>
                                                        void handleResolveSheetQa(
                                                          row.id,
                                                          "approved"
                                                        )
                                                      }
                                                    >
                                                      אשר
                                                    </Button>
                                                    <Button
                                                      type="button"
                                                      size="sm"
                                                      variant="outline"
                                                      className="h-8 text-xs border-amber-300 text-amber-900"
                                                      disabled={resolvingSheetId === row.id}
                                                      onClick={() =>
                                                        void handleResolveSheetQa(
                                                          row.id,
                                                          "needs_fixing"
                                                        )
                                                      }
                                                    >
                                                      לתיקון
                                                    </Button>
                                                  </>
                                                )}
                                                {row.status === "needs_fixing" && !openTask && (
                                                  <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="secondary"
                                                    className="h-8 text-xs"
                                                    onClick={() =>
                                                      setFixTaskTarget({
                                                        sheet: row,
                                                        qaBatchId: b.id,
                                                      })
                                                    }
                                                  >
                                                    משימת תיקון
                                                  </Button>
                                                )}
                                                {row.status === "needs_fixing" && openTask && (
                                                  <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="outline"
                                                    className="h-8 text-xs"
                                                    onClick={() => {
                                                      setCompleteFixTarget(openTask);
                                                      setCompleteActualCost(
                                                        openTask.cost_amount > 0
                                                          ? String(openTask.cost_amount)
                                                          : ""
                                                      );
                                                      setCompleteRoute("computer_review");
                                                    }}
                                                  >
                                                    סגור תיקון
                                                  </Button>
                                                )}
                                              </div>
                                            </TableCell>
                                          </TableRow>
                                        );
                                      })}
                                    </TableBody>
                                  </Table>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="financials">
            <TorahFinancialsTab projectId={projectId} project={project} sheets={sheets} />
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
                  {editParchmentType &&
                    !parchmentSelectOptions.includes(editParchmentType) && (
                      <option value={editParchmentType}>{editParchmentType} (ערך קיים)</option>
                    )}
                  {parchmentSelectOptions.map((p) => (
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
              <div className="grid gap-3 sm:grid-cols-1">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">קישור חוזה לקוח (URL)</p>
                  <Input
                    dir="ltr"
                    className="font-mono text-xs"
                    value={editClientContractUrl}
                    onChange={(e) => setEditClientContractUrl(e.target.value)}
                    placeholder="https://..."
                  />
                  {project.client_contract_url && (
                    <a
                      href={project.client_contract_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-xs text-sky-600 hover:underline"
                    >
                      <ExternalLink className="size-3" />
                      פתח קישור שמור
                    </a>
                  )}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">קישור חוזה סופר (URL)</p>
                  <Input
                    dir="ltr"
                    className="font-mono text-xs"
                    value={editScribeContractUrl}
                    onChange={(e) => setEditScribeContractUrl(e.target.value)}
                    placeholder="https://..."
                  />
                  {project.scribe_contract_url && (
                    <a
                      href={project.scribe_contract_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-xs text-sky-600 hover:underline"
                    >
                      <ExternalLink className="size-3" />
                      פתח קישור שמור
                    </a>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 space-y-3">
                <p className="text-xs font-semibold text-slate-700">תקציבים מתוכננים (דשבורד פיננסי)</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">תקציב קלף מתוכנן (₪)</p>
                    <Input
                      inputMode="decimal"
                      value={editPlannedParchment}
                      onChange={(e) => setEditPlannedParchment(applyNumericTransform(e.target.value))}
                      placeholder="ריק = לפי צילום מחשבון"
                    />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">תקציב סופר מתוכנן (₪)</p>
                    <Input
                      inputMode="decimal"
                      value={editPlannedScribe}
                      onChange={(e) => setEditPlannedScribe(applyNumericTransform(e.target.value))}
                      placeholder="אופציונלי"
                    />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">תקציב הגהות מתוכנן (₪)</p>
                    <Input
                      inputMode="decimal"
                      value={editPlannedProofreading}
                      onChange={(e) => setEditPlannedProofreading(applyNumericTransform(e.target.value))}
                      placeholder="אופציונלי"
                    />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">סה״כ עלויות מתוכננות (₪)</p>
                    <Input
                      inputMode="decimal"
                      value={editEstimatedExpensesTotal}
                      onChange={(e) =>
                        setEditEstimatedExpensesTotal(applyNumericTransform(e.target.value))
                      }
                      placeholder="דוחף על סכום מהצילום"
                    />
                  </div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">מספר הגהות גברא שסוכמו</p>
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    value={editGavraQa}
                    onChange={(e) => setEditGavraQa(applyNumericTransform(e.target.value))}
                  />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">מספר הגהות מחשב שסוכמו</p>
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
                  <p className="text-xs text-muted-foreground mb-1">מספר שבועות נדרש להכנה</p>
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
        <DialogContent className="sm:max-w-lg rounded-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              יריעה {editing?.sheet_number}
              {editing?.sku && (
                <span className="block text-xs font-normal text-muted-foreground mt-1 font-mono">{editing.sku}</span>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {editing && (
              <div className="rounded-xl border border-sky-200 bg-sky-50/50 p-3 space-y-2">
                <p className="text-xs font-semibold text-sky-900">
                  מיפוי עמודות ביריעה — פרשות:{" "}
                  {uniqueParshiyotOnSheet(editing.sheet_number).join(" · ") || "—"}
                </p>
                <div className="rounded-lg border border-sky-100/80 bg-white/90 overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50">
                        <TableHead className="text-right text-xs font-semibold w-[4.5rem]">
                          מספר עמוד
                        </TableHead>
                        <TableHead className="text-right text-xs font-semibold">פרשה</TableHead>
                        <TableHead className="text-right text-xs font-semibold">מילה ראשונה</TableHead>
                        <TableHead className="text-right text-xs font-semibold">מילה אחרונה</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {getTorahColumnsForSheet(editing.sheet_number).map((c) => (
                        <TableRow key={`${c.sheet}-${c.column}`}>
                          <TableCell className="tabular-nums text-xs font-medium">{c.column}</TableCell>
                          <TableCell className="text-xs">{c.parsha}</TableCell>
                          <TableCell className="text-xs text-slate-700">{c.firstWord}</TableCell>
                          <TableCell className="text-xs text-slate-700">{c.lastWord}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
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
            {editing?.status === "reported_written" && (
              <div className="rounded-lg border border-teal-200 bg-teal-50/60 p-3 space-y-2">
                <p className="text-xs font-medium text-teal-900">מעבר מהיר אחרי קליטה מהסופר</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full border-teal-400 text-teal-900 hover:bg-teal-100"
                  disabled={saving || warehouseSaving}
                  onClick={async () => {
                    if (!editing) return;
                    setWarehouseSaving(true);
                    try {
                      const res = await markTorahSheetsReceived(projectId, [editing.id]);
                      if (!res.success) {
                        toast.error(res.error);
                        return;
                      }
                      setSheets((prev) =>
                        prev.map((s) =>
                          s.id === editing.id ? { ...s, status: "received" as const } : s
                        )
                      );
                      toast.success("היריעה סומנה כהתקבלה במחסן");
                      setEditing(null);
                      router.refresh();
                    } finally {
                      setWarehouseSaving(false);
                    }
                  }}
                >
                  <Warehouse className="size-4 ml-2" />
                  {warehouseSaving ? "מעדכן..." : "קליטה במחסן (התקבל)"}
                </Button>
              </div>
            )}
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
      <Dialog
        open={createBatchOpen}
        onOpenChange={(o) => {
          setCreateBatchOpen(o);
          if (!o) {
            setBatchMagiahId("");
            setBatchCheckerId("");
            setBatchQaKind("");
            setBatchCost("");
            setBatchReportUrl(null);
            setBatchSheetIds(new Set());
            setBatchNotes("");
          }
        }}
      >
        <DialogContent className="sm:max-w-lg rounded-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PackageCheck className="size-5 text-amber-600" />
              צור שקית הגהה
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-xs text-muted-foreground leading-relaxed">
              נדרש לפחות אחד: מגיה, בודק, או סוג «מחשב» (הגהת מחשב ללא מגיה אנושי).
            </p>
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
              <p className="text-xs font-medium text-muted-foreground mb-1.5">בודק (אופציונלי)</p>
              <select
                value={batchCheckerId}
                onChange={(e) => setBatchCheckerId(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">— בחר בודק —</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">סוג סבב</p>
              <select
                value={batchQaKind}
                onChange={(e) =>
                  setBatchQaKind(
                    e.target.value as "" | "gavra" | "computer" | "repair" | "other"
                  )
                }
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">— לא צוין —</option>
                <option value="gavra">{QA_KIND_LABELS.gavra}</option>
                <option value="computer">{QA_KIND_LABELS.computer}</option>
                <option value="repair">{QA_KIND_LABELS.repair}</option>
                <option value="other">{QA_KIND_LABELS.other}</option>
              </select>
            </div>

            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">
                עלות סבב (₪, אופציונלי)
              </p>
              <Input
                inputMode="decimal"
                placeholder="0"
                value={batchCost}
                onChange={(e) => setBatchCost(e.target.value)}
              />
            </div>

            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">
                דוח / תמונה (PDF או תמונה, עד 5MB)
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex h-10 cursor-pointer items-center rounded-md border border-input bg-background px-3 text-sm hover:bg-muted">
                  <input
                    type="file"
                    accept="application/pdf,image/*"
                    className="sr-only"
                    disabled={batchReportUploading}
                    onChange={handleBatchReportFileChange}
                  />
                  {batchReportUploading ? "מעלה..." : "בחר קובץ"}
                </label>
                {batchReportUrl && (
                  <a
                    href={batchReportUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-sky-600 hover:underline truncate max-w-[12rem]"
                  >
                    קובץ מצורף
                  </a>
                )}
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
                        s.status === "needs_fixing" ? "bg-red-100 text-red-700" : "bg-sky-100 text-sky-700"
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
                disabled={batchSaving || !canSubmitQaBatch}
                onClick={() => void handleCreateBatch()}
              >
                {batchSaving
                  ? "שולח..."
                  : `שלח ${batchSheetIds.size > 0 ? `${batchSheetIds.size} ` : ""}יריעות להגהה`}
              </Button>
              <Button type="button" variant="outline" onClick={() => setCreateBatchOpen(false)}>
                ביטול
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!fixTaskTarget}
        onOpenChange={(o) => {
          if (!o) {
            setFixTaskTarget(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md rounded-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wrench className="size-5 text-violet-600" />
              משימת תיקון — יריעה {fixTaskTarget?.sheet.sheet_number}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <p className="text-xs text-muted-foreground">
              משימה זו תסמן את היריעה לתיקון כשלב עבודה בלבד. את העלות בפועל מזינים בסגירת המשימה.
            </p>
            <div className="flex gap-2 justify-end pt-2">
              <Button type="button" variant="outline" onClick={() => setFixTaskTarget(null)}>
                ביטול
              </Button>
              <Button
                type="button"
                className="bg-violet-600 hover:bg-violet-700"
                disabled={fixTaskSaving}
                onClick={() => void handleSubmitCreateFixTask()}
              >
                {fixTaskSaving ? "שומר..." : "צור משימה"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!completeFixTarget}
        onOpenChange={(o) => {
          if (!o) {
            setCompleteFixTarget(null);
            setCompleteActualCost("");
            setCompleteRoute("computer_review");
          }
        }}
      >
        <DialogContent className="sm:max-w-md rounded-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="size-5 text-violet-600" />
              סגירת משימת תיקון — יריעה {completeFixTarget?.sheet_number ?? "—"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <p className="text-xs text-muted-foreground">
              סכום בפועל לניכוי מהסופר. אם תשאיר ריק — יילקח מהמשוער.
            </p>
            <div>
              <p className="text-xs text-muted-foreground mb-1">עלות בפועל (₪)</p>
              <Input
                inputMode="decimal"
                value={completeActualCost}
                onChange={(e) => setCompleteActualCost(e.target.value)}
                placeholder="0"
              />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">יעד המשך אחרי סגירת התיקון</p>
              <select
                value={completeRoute}
                onChange={(e) => setCompleteRoute(e.target.value as FixCompletionRoute)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="computer_review">שליחה להגהת מחשב נוספת</option>
                <option value="gavra_review">שליחה להגהת גברא</option>
                <option value="return_to_sofer">החזרה לסופר להשלמה</option>
                <option value="approve">סימון כאושר</option>
              </select>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button type="button" variant="outline" onClick={() => setCompleteFixTarget(null)}>
                ביטול
              </Button>
              <Button
                type="button"
                className="bg-violet-600 hover:bg-violet-700"
                disabled={completeSaving}
                onClick={() => void handleSubmitCompleteFix()}
              >
                {completeSaving ? "סוגר..." : "סגור והחל"}
              </Button>
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
                disabled={receivingSaving || saving || warehouseSaving}
                onClick={() => void handleReceiveFromScribe()}
              >
                <Inbox className="size-4 ml-1" />
                {receivingSaving ? "מקליט..." : "דווח נכתב (מהסופר)"}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="whitespace-nowrap border-teal-300 text-teal-900 hover:bg-teal-50"
                disabled={
                  warehouseSaving || saving || receivingSaving || !allSelectedReportedWritten
                }
                title={
                  allSelectedReportedWritten
                    ? "מעבר לקליטה במחסן"
                    : "בחר יריעות בסטטוס «דווח נכתב» בלבד"
                }
                onClick={() => void handleMarkWarehouseReceived()}
              >
                <Warehouse className="size-4 ml-1" />
                {warehouseSaving ? "מעדכן..." : "קליטה במחסן (התקבל)"}
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
                disabled={saving || warehouseSaving || receivingSaving}
                onClick={() => void applyBulk()}
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
