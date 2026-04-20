"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { TorahProjectDetailView, TorahSheetGridRow } from "@/src/lib/types/torah";
import {
  estimateTorahProjectProfitability,
  summarizeTorahLedger,
  computeTorahProjectNetCashflowFromLedger,
  sumTorahLedgerPayments,
} from "@/src/services/crm.logic";
import { estimateTorahScrollWritingCompletionDate } from "@/src/services/torahCompletionForecast";
import {
  TORAH_LEDGER_TRANSACTION_TYPES,
  type TorahLedgerTransactionType,
} from "@/src/lib/constants/torahLedger";
import {
  createTorahPaymentSchedule,
  createTorahProjectTransaction,
  deleteTorahPaymentSchedule,
  fetchTorahPaymentSchedules,
  fetchTorahProjectTransactions,
  fetchTorahProjectSysEvents,
  markTorahPaymentSchedulePaid,
  updateTorahPaymentSchedule,
  type TorahPaymentScheduleRow,
  type TorahProjectTransactionRow,
  type TorahSysEventView,
} from "./actions";
import { applyNumericTransform } from "@/lib/numericInput";
import { Paperclip } from "lucide-react";
import { cn } from "@/lib/utils";

const TX_LABELS: Record<string, string> = {
  client_payment: "תשלום מלקוח",
  scribe_payment: "תשלום לסופר",
  fix_deduction: "ניכוי תיקון",
  qa_expense: "הוצאת הגהה",
  parchment_expense: "הוצאת קלף",
  other_expense: "הוצאה אחרת",
};

const PARTY_LABELS: Record<TorahPaymentScheduleRow["party"], string> = {
  client: "לקוח",
  scribe: "סופר",
};

function formatShekels(n: number): string {
  return `${n.toLocaleString("he-IL", { maximumFractionDigits: 2 })} ₪`;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDueDate(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00`);
  return Number.isNaN(d.getTime()) ? ymd : d.toLocaleDateString("he-IL");
}

const NOTE_CLAMP_LEN = 120;

function LedgerNotesCell({ notes }: { notes: string | null }) {
  const [expanded, setExpanded] = useState(false);
  if (!notes?.trim()) {
    return <span className="text-muted-foreground">—</span>;
  }
  const long = notes.length > NOTE_CLAMP_LEN;
  return (
    <div className="max-w-[min(14rem,40vw)] text-xs text-slate-700">
      <p className={cn(!expanded && long && "line-clamp-3 whitespace-pre-wrap break-words")}>
        {notes}
      </p>
      {long && (
        <button
          type="button"
          className="mt-1 text-[11px] font-medium text-sky-600 hover:underline"
          onClick={() => setExpanded((e) => !e)}
        >
          {expanded ? "צמצם" : "הרחב"}
        </button>
      )}
    </div>
  );
}

type Props = {
  projectId: string;
  project: TorahProjectDetailView;
  sheets: TorahSheetGridRow[];
};

export function TorahFinancialsTab({ projectId, project, sheets }: Props) {
  const router = useRouter();
  const [transactions, setTransactions] = useState<TorahProjectTransactionRow[]>([]);
  const [schedules, setSchedules] = useState<TorahPaymentScheduleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [txType, setTxType] = useState<TorahLedgerTransactionType>("client_payment");
  const [amountStr, setAmountStr] = useState("");
  const [dateStr, setDateStr] = useState("");
  const [notes, setNotes] = useState("");
  const [attachmentUrl, setAttachmentUrl] = useState("");
  const [receiptSent, setReceiptSent] = useState(false);

  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleParty, setScheduleParty] = useState<"client" | "scribe">("client");
  const [scheduleAmountStr, setScheduleAmountStr] = useState("");
  const [scheduleDue, setScheduleDue] = useState("");
  const [scheduleSaving, setScheduleSaving] = useState(false);

  const [editSchedule, setEditSchedule] = useState<TorahPaymentScheduleRow | null>(null);
  const [editParty, setEditParty] = useState<"client" | "scribe">("client");
  const [editAmountStr, setEditAmountStr] = useState("");
  const [editDue, setEditDue] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const [markingId, setMarkingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [sysEvents, setSysEvents] = useState<TorahSysEventView[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const [txRes, schRes, evRes] = await Promise.all([
      fetchTorahProjectTransactions(projectId),
      fetchTorahPaymentSchedules(projectId),
      fetchTorahProjectSysEvents(projectId),
    ]);
    if (!txRes.success) {
      toast.error(txRes.error);
      setTransactions([]);
    } else {
      setTransactions(txRes.transactions);
    }
    if (!schRes.success) {
      toast.error(schRes.error);
      setSchedules([]);
    } else {
      setSchedules(schRes.schedules);
    }
    if (!evRes.success) {
      setSysEvents([]);
    } else {
      setSysEvents(evRes.events);
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const ledgerLines = useMemo(
    () => transactions.map((t) => ({ transaction_type: t.transaction_type, amount: t.amount })),
    [transactions]
  );

  const { totalFixDeduction, totalQaExpense, totalParchmentExpense, totalOtherExpense } = useMemo(
    () => summarizeTorahLedger(ledgerLines),
    [ledgerLines]
  );

  const profitability = useMemo(
    () =>
      estimateTorahProjectProfitability({
        amountPaidByClient: project.amount_paid_by_client,
        amountPaidToScribe: project.amount_paid_to_scribe,
        ledgerLines,
      }),
    [project.amount_paid_by_client, project.amount_paid_to_scribe, ledgerLines]
  );

  const netCashflow = useMemo(
    () => computeTorahProjectNetCashflowFromLedger(ledgerLines),
    [ledgerLines]
  );

  const eventByTxId = useMemo(() => {
    const m = new Map<string, TorahSysEventView>();
    for (const e of sysEvents) {
      if (e.entity_type === "torah_project_transaction") m.set(e.entity_id, e);
    }
    return m;
  }, [sysEvents]);

  const writingCompletionForecast = useMemo(
    () =>
      estimateTorahScrollWritingCompletionDate({
        sheets,
        columnsPerDay: project.columns_per_day,
        startDate: project.start_date,
      }),
    [sheets, project.columns_per_day, project.start_date]
  );

  const projectedFinalClientPaymentDate = useMemo(() => {
    const pending = schedules.filter((s) => s.party === "client" && s.status === "pending");
    if (pending.length === 0) return null;
    return pending.reduce((a, b) => (a.due_date >= b.due_date ? a : b)).due_date;
  }, [schedules]);

  const scribeLedgerSummary = useMemo(() => {
    const { totalScribePayments } = sumTorahLedgerPayments(ledgerLines);
    const { totalFixDeduction, totalQaExpense } = summarizeTorahLedger(ledgerLines);
    return {
      totalScribePayments,
      totalFixDeduction,
      netScribeFromLedger: Math.max(0, totalScribePayments - totalFixDeduction),
      totalQaExpense,
    };
  }, [ledgerLines]);

  const resetTxForm = () => {
    setTxType("client_payment");
    setAmountStr("");
    setDateStr("");
    setNotes("");
    setAttachmentUrl("");
    setReceiptSent(false);
  };

  const handleSubmitTx = async () => {
    const amount = Number(amountStr.replace(/,/g, "."));
    if (!Number.isFinite(amount) || amount < 0) {
      toast.error("סכום לא תקין");
      return;
    }
    setSaving(true);
    try {
      const res = await createTorahProjectTransaction({
        projectId,
        transaction_type: txType,
        amount,
        date: dateStr.trim() || undefined,
        notes: notes.trim() || undefined,
        attachment_url: attachmentUrl.trim() || undefined,
        receipt_sent: receiptSent,
      });
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      toast.success("התנועה נרשמה");
      setAddOpen(false);
      resetTxForm();
      await load();
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  const resetScheduleForm = () => {
    setScheduleParty("client");
    setScheduleAmountStr("");
    setScheduleDue("");
  };

  const handleCreateSchedule = async () => {
    const amount = Number(scheduleAmountStr.replace(/,/g, "."));
    if (!Number.isFinite(amount) || amount < 0) {
      toast.error("סכום לא תקין");
      return;
    }
    if (!scheduleDue.trim()) {
      toast.error("בחר תאריך יעד");
      return;
    }
    setScheduleSaving(true);
    try {
      const res = await createTorahPaymentSchedule({
        projectId,
        party: scheduleParty,
        amount,
        due_date: scheduleDue,
        status: "pending",
      });
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      toast.success("מועד התשלום נוסף");
      setScheduleOpen(false);
      resetScheduleForm();
      await load();
      router.refresh();
    } finally {
      setScheduleSaving(false);
    }
  };

  const openEditSchedule = (s: TorahPaymentScheduleRow) => {
    if (s.status !== "pending") return;
    setEditSchedule(s);
    setEditParty(s.party);
    setEditAmountStr(String(s.amount));
    setEditDue(s.due_date);
  };

  const handleSaveEditSchedule = async () => {
    if (!editSchedule) return;
    const amount = Number(editAmountStr.replace(/,/g, "."));
    if (!Number.isFinite(amount) || amount < 0) {
      toast.error("סכום לא תקין");
      return;
    }
    if (!editDue.trim()) {
      toast.error("תאריך חובה");
      return;
    }
    setEditSaving(true);
    try {
      const res = await updateTorahPaymentSchedule({
        scheduleId: editSchedule.id,
        party: editParty,
        amount,
        due_date: editDue,
      });
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      toast.success("המועד עודכן");
      setEditSchedule(null);
      await load();
      router.refresh();
    } finally {
      setEditSaving(false);
    }
  };

  const handleMarkPaid = async (scheduleId: string) => {
    setMarkingId(scheduleId);
    try {
      const res = await markTorahPaymentSchedulePaid(scheduleId);
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      toast.success("נרשמה תנועה והמועד סומן כשולם");
      await load();
      router.refresh();
    } finally {
      setMarkingId(null);
    }
  };

  const handleDeleteSchedule = async (scheduleId: string) => {
    if (!window.confirm("למחוק את מועד התשלום?")) return;
    setDeletingId(scheduleId);
    try {
      const res = await deleteTorahPaymentSchedule(scheduleId);
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      toast.success("נמחק");
      await load();
      router.refresh();
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="rounded-xl border-slate-200">
          <CardContent className="p-4 text-sm">
            <p className="text-xs text-muted-foreground mb-1">מחיר חוזה כולל</p>
            <p className="text-xl font-bold tabular-nums">{formatShekels(project.total_agreed_price)}</p>
          </CardContent>
        </Card>
        <Card className="rounded-xl border-emerald-100 bg-emerald-50/40">
          <CardContent className="p-4 text-sm">
            <p className="text-xs text-emerald-900/80 mb-1">שולם ע״י לקוח (מהיומן)</p>
            <p className="text-xl font-bold tabular-nums text-emerald-900">
              {formatShekels(project.amount_paid_by_client)}
            </p>
          </CardContent>
        </Card>
        <Card className="rounded-xl border-sky-100 bg-sky-50/40">
          <CardContent className="p-4 text-sm">
            <p className="text-xs text-sky-900/80 mb-1">שולם לסופר (מהיומן)</p>
            <p className="text-xl font-bold tabular-nums text-sky-900">
              {formatShekels(project.amount_paid_to_scribe)}
            </p>
          </CardContent>
        </Card>
        <Card className="rounded-xl border-amber-100 bg-amber-50/50">
          <CardContent className="p-4 text-sm">
            <p className="text-xs text-amber-900/80 mb-1">ניכויים לתיקונים (מהיומן)</p>
            <p className="text-xl font-bold tabular-nums text-amber-900">{formatShekels(totalFixDeduction)}</p>
          </CardContent>
        </Card>
        <Card className="rounded-xl border-violet-100 bg-violet-50/40 sm:col-span-2 lg:col-span-2">
          <CardContent className="p-4 text-sm">
            <p className="text-xs text-violet-900/80 mb-1">הערכת רווחיות נוכחית</p>
            <p className="text-xl font-bold tabular-nums text-violet-900">{formatShekels(profitability)}</p>
            <p className="text-[10px] text-muted-foreground mt-1">
              לקוח פחות סופר (אחרי ניכוי תיקונים) פחות הגהה ({formatShekels(totalQaExpense)}), קלף (
              {formatShekels(totalParchmentExpense)}) ואחרות ({formatShekels(totalOtherExpense)})
            </p>
          </CardContent>
        </Card>
        <Card className="rounded-xl border-teal-100 bg-teal-50/40 sm:col-span-2 lg:col-span-3">
          <CardContent className="p-4 text-sm">
            <p className="text-xs text-teal-900/80 mb-1">יתרה תזרימית (סכום מתנועות היומן)</p>
            <p className="text-xl font-bold tabular-nums text-teal-900">
              {formatShekels(netCashflow.netCashPosition)}
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">
              כניסות (תשלומי לקוח) {formatShekels(netCashflow.totalCashIn)} · יציאות (סופר, תיקונים, הגהה וכו׳){" "}
              {formatShekels(netCashflow.totalCashOut)}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Card className="rounded-xl border-slate-200 lg:col-span-1">
          <CardContent className="p-4 text-sm space-y-2">
            <p className="text-xs font-semibold text-slate-800">תחזית סיום כתיבה</p>
            {writingCompletionForecast.ok ? (
              <p className="text-lg font-bold tabular-nums text-slate-900">
                {new Date(writingCompletionForecast.completionDateIso).toLocaleDateString("he-IL")}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">{writingCompletionForecast.reason}</p>
            )}
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              לפי קצב עמודות ליום וימי עבודה (ללא שבת וי״ט)
            </p>
          </CardContent>
        </Card>
        <Card className="rounded-xl border-amber-100 bg-amber-50/30 lg:col-span-1">
          <CardContent className="p-4 text-sm space-y-2">
            <p className="text-xs font-semibold text-amber-950">תאריך תשלום לקוח אחרון (מתוכנן)</p>
            {projectedFinalClientPaymentDate ? (
              <p className="text-lg font-bold tabular-nums text-amber-950">
                {formatDueDate(projectedFinalClientPaymentDate)}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">אין מועדי לקוח ממתינים</p>
            )}
            <p className="text-[10px] text-amber-900/80 leading-relaxed">
              לפי מועדי תשלום לקוח בסטטוס «ממתין» בלבד
            </p>
          </CardContent>
        </Card>
        <Card className="rounded-xl border-slate-200 lg:col-span-1">
          <CardContent className="p-4 text-sm space-y-2">
            <p className="text-xs font-semibold text-slate-800">יומן סופר והגהות</p>
            <ul className="space-y-1 text-xs text-slate-700 tabular-nums">
              <li className="flex justify-between gap-2">
                <span>תשלומי סופר (יומן)</span>
                <span className="font-medium">{formatShekels(scribeLedgerSummary.totalScribePayments)}</span>
              </li>
              <li className="flex justify-between gap-2">
                <span>ניכויי תיקון (יומן)</span>
                <span className="font-medium">{formatShekels(scribeLedgerSummary.totalFixDeduction)}</span>
              </li>
              <li className="flex justify-between gap-2 border-t border-slate-100 pt-1">
                <span>נטו לסופר (שולם − ניכוי)</span>
                <span className="font-semibold text-slate-900">
                  {formatShekels(scribeLedgerSummary.netScribeFromLedger)}
                </span>
              </li>
              <li className="flex justify-between gap-2">
                <span>הוצאות הגהה (יומן)</span>
                <span className="font-medium">{formatShekels(scribeLedgerSummary.totalQaExpense)}</span>
              </li>
            </ul>
            <p className="text-[10px] text-muted-foreground leading-relaxed pt-1">
              תשלומים דרך <span className="font-mono">erp_payments</span> יוצגו כשנקשרת עסקת מכירה לפרויקט.
            </p>
          </CardContent>
        </Card>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground py-6 text-center">טוען...</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-base font-semibold text-slate-800">מועדי תשלום</h3>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="rounded-xl border-amber-200 text-amber-900 hover:bg-amber-50"
                onClick={() => {
                  resetScheduleForm();
                  setScheduleOpen(true);
                }}
              >
                ➕ הוסף מועד תשלום
              </Button>
            </div>
            {schedules.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-muted-foreground">
                אין מועדים מתוכננים
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-right text-xs text-muted-foreground">
                      <th className="p-3 font-medium">תאריך יעד</th>
                      <th className="p-3 font-medium">צד</th>
                      <th className="p-3 font-medium">סכום</th>
                      <th className="p-3 font-medium">סטטוס</th>
                      <th className="p-3 font-medium w-[1%]">פעולות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {schedules.map((s) => (
                      <tr key={s.id} className="border-b border-slate-100 last:border-0">
                        <td className="p-3 tabular-nums whitespace-nowrap">{formatDueDate(s.due_date)}</td>
                        <td className="p-3">{PARTY_LABELS[s.party]}</td>
                        <td className="p-3 tabular-nums font-medium">{formatShekels(s.amount)}</td>
                        <td className="p-3">
                          {s.status === "paid" ? (
                            <span className="text-emerald-700 font-medium">שולם</span>
                          ) : (
                            <span className="text-amber-800">ממתין</span>
                          )}
                        </td>
                        <td className="p-3">
                          <div className="flex flex-wrap gap-1 justify-end">
                            {s.status === "pending" && (
                              <>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-8 text-xs rounded-lg border-emerald-300 text-emerald-800"
                                  disabled={markingId === s.id}
                                  onClick={() => void handleMarkPaid(s.id)}
                                >
                                  {markingId === s.id ? "..." : "סמן שולם"}
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 text-xs rounded-lg"
                                  onClick={() => openEditSchedule(s)}
                                >
                                  ערוך
                                </Button>
                              </>
                            )}
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-8 text-xs rounded-lg text-red-600 hover:text-red-700"
                              disabled={deletingId === s.id}
                              onClick={() => void handleDeleteSchedule(s.id)}
                            >
                              מחק
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-base font-semibold text-slate-800">יומן תנועות</h3>
              <Button
                type="button"
                size="sm"
                className="rounded-xl bg-sky-600 hover:bg-sky-700"
                onClick={() => {
                  resetTxForm();
                  setAddOpen(true);
                }}
              >
                ➕ הוסף תנועה
              </Button>
            </div>
            {transactions.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-muted-foreground">
                אין תנועות — הוסיפו תשלום או ניכוי תיקון
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-right text-xs text-muted-foreground">
                      <th className="p-3 font-medium">תאריך</th>
                      <th className="p-3 font-medium">סוג</th>
                      <th className="p-3 font-medium">סכום</th>
                      <th className="p-3 font-medium">אירוע מערכת</th>
                      <th className="p-3 font-medium">קבלה נשלחה</th>
                      <th className="p-3 font-medium w-[1%]">אסמכתא</th>
                      <th className="p-3 font-medium min-w-[8rem]">פירוט / הערות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((t) => (
                      <tr key={t.id} className="border-b border-slate-100 last:border-0">
                        <td className="p-3 tabular-nums whitespace-nowrap">{formatDateTime(t.date)}</td>
                        <td className="p-3">{TX_LABELS[t.transaction_type] ?? t.transaction_type}</td>
                        <td className="p-3 tabular-nums font-medium">{formatShekels(t.amount)}</td>
                        <td className="p-3 align-top text-[11px] text-slate-600">
                          {(() => {
                            const ev = eventByTxId.get(t.id);
                            if (!ev) return <span className="text-muted-foreground">—</span>;
                            return (
                              <div className="space-y-0.5">
                                <div className="tabular-nums whitespace-nowrap">
                                  {formatDateTime(ev.created_at)}
                                </div>
                                <div className="text-muted-foreground break-words max-w-[10rem]">
                                  {ev.action}
                                </div>
                              </div>
                            );
                          })()}
                        </td>
                        <td className="p-3">{t.receipt_sent ? "כן" : "לא"}</td>
                        <td className="p-3 align-top">
                          {t.attachment_url ? (
                            <a
                              href={t.attachment_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex rounded-md p-1.5 text-sky-600 hover:bg-sky-50"
                              title="פתח אסמכתא"
                            >
                              <Paperclip className="size-4" />
                            </a>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </td>
                        <td className="p-3 align-top">
                          <LedgerNotesCell notes={t.notes} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={(o) => !o && setAddOpen(false)}>
        <DialogContent className="sm:max-w-lg rounded-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>הוספת תנועה</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div>
              <p className="text-xs text-muted-foreground mb-1">סוג</p>
              <select
                value={txType}
                onChange={(e) => setTxType(e.target.value as TorahLedgerTransactionType)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {TORAH_LEDGER_TRANSACTION_TYPES.map((k) => (
                  <option key={k} value={k}>
                    {TX_LABELS[k]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">סכום (₪)</p>
              <Input
                inputMode="decimal"
                value={amountStr}
                onChange={(e) => setAmountStr(applyNumericTransform(e.target.value))}
                placeholder="0"
              />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">תאריך (ריק = עכשיו)</p>
              <Input type="datetime-local" value={dateStr} onChange={(e) => setDateStr(e.target.value)} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">פירוט התשלום / הערות</p>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="פירוט מלא — סעיפים, מקדמות, ניכויים..."
                rows={5}
                className="min-h-[100px] resize-y text-sm"
              />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">קישור אסמכתא (קבלה / מסמך)</p>
              <Input
                dir="ltr"
                className="font-mono text-xs"
                value={attachmentUrl}
                onChange={(e) => setAttachmentUrl(e.target.value)}
                placeholder="https://..."
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={receiptSent}
                onChange={(e) => setReceiptSent(e.target.checked)}
                className="rounded border-input"
              />
              קבלה נשלחה ללקוח
            </label>
            <div className="flex gap-2 pt-2">
              <Button type="button" className="flex-1 bg-sky-600 hover:bg-sky-700" disabled={saving} onClick={handleSubmitTx}>
                {saving ? "שומר..." : "שמור"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>
                ביטול
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={scheduleOpen} onOpenChange={(o) => !o && setScheduleOpen(false)}>
        <DialogContent className="sm:max-w-md rounded-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle>מועד תשלום חדש</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div>
              <p className="text-xs text-muted-foreground mb-1">צד</p>
              <select
                value={scheduleParty}
                onChange={(e) => setScheduleParty(e.target.value as "client" | "scribe")}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="client">לקוח</option>
                <option value="scribe">סופר</option>
              </select>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">סכום (₪)</p>
              <Input
                inputMode="decimal"
                value={scheduleAmountStr}
                onChange={(e) => setScheduleAmountStr(applyNumericTransform(e.target.value))}
              />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">תאריך יעד</p>
              <Input type="date" value={scheduleDue} onChange={(e) => setScheduleDue(e.target.value)} />
            </div>
            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                className="flex-1 bg-amber-600 hover:bg-amber-700"
                disabled={scheduleSaving}
                onClick={() => void handleCreateSchedule()}
              >
                {scheduleSaving ? "שומר..." : "שמור"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setScheduleOpen(false)}>
                ביטול
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editSchedule} onOpenChange={(o) => !o && setEditSchedule(null)}>
        <DialogContent className="sm:max-w-md rounded-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle>עריכת מועד תשלום</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div>
              <p className="text-xs text-muted-foreground mb-1">צד</p>
              <select
                value={editParty}
                onChange={(e) => setEditParty(e.target.value as "client" | "scribe")}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="client">לקוח</option>
                <option value="scribe">סופר</option>
              </select>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">סכום (₪)</p>
              <Input
                inputMode="decimal"
                value={editAmountStr}
                onChange={(e) => setEditAmountStr(applyNumericTransform(e.target.value))}
              />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">תאריך יעד</p>
              <Input type="date" value={editDue} onChange={(e) => setEditDue(e.target.value)} />
            </div>
            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                className="flex-1 bg-sky-600 hover:bg-sky-700"
                disabled={editSaving}
                onClick={() => void handleSaveEditSchedule()}
              >
                {editSaving ? "שומר..." : "שמור"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setEditSchedule(null)}>
                ביטול
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
