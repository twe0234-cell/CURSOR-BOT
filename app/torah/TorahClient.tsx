"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BookOpen, Plus, ScrollText, CalendarDays, UserRound, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { UnifiedScribeSelect } from "@/components/crm/UnifiedScribeSelect";
import {
  createTorahProject,
  fetchCrmContactsForSelect,
} from "./actions";
import { createCrmContact } from "@/app/crm/actions";
import type { TorahProjectWithNames, TorahProjectStatus } from "@/src/lib/types/torah";
import {
  TORAH_PROJECT_STATUS_LABELS,
  TORAH_SHEET_COUNT,
} from "@/src/lib/types/torah";
import { cn } from "@/lib/utils";
import { applyNumericTransform } from "@/lib/numericInput";

// ── Status badge ──────────────────────────────────────────────

const STATUS_COLORS: Record<TorahProjectStatus, string> = {
  contract:  "bg-blue-100 text-blue-700",
  writing:   "bg-amber-100 text-amber-700",
  qa:        "bg-purple-100 text-purple-700",
  completed: "bg-green-100 text-green-700",
  delivered: "bg-slate-100 text-slate-600",
};

function StatusBadge({ status }: { status: TorahProjectStatus }) {
  return (
    <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium", STATUS_COLORS[status])}>
      {TORAH_PROJECT_STATUS_LABELS[status]}
    </span>
  );
}

// ── Progress bar ──────────────────────────────────────────────

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{value} / {max} יריעות אושרו</span>
        <span>{pct}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500",
            pct === 100 ? "bg-green-500" : pct > 50 ? "bg-sky-500" : "bg-amber-400"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ── New Project modal form ────────────────────────────────────

type FormState = {
  title: string;
  scribe_id: string;
  scribe_name: string;
  client_id: string;
  target_date: string;
  total_agreed_price: string;
  columns_per_day: string;
  qa_weeks_buffer: string;
  gavra_qa_count: string;
  computer_qa_count: string;
  requires_tagging: boolean;
};

const emptyForm = (): FormState => ({
  title: "",
  scribe_id: "",
  scribe_name: "",
  client_id: "",
  target_date: "",
  total_agreed_price: "",
  columns_per_day: "0",
  qa_weeks_buffer: "3",
  gavra_qa_count: "1",
  computer_qa_count: "1",
  requires_tagging: false,
});

function NewProjectDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState<FormState>(emptyForm());
  const [loading, setLoading] = useState(false);
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [newClientOpen, setNewClientOpen] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [creatingClient, setCreatingClient] = useState(false);

  useEffect(() => {
    if (!open) return;
    fetchCrmContactsForSelect().then((r) => {
      if (r.success) setClients(r.contacts);
    });
  }, [open]);

  const handleClose = () => {
    setForm(emptyForm());
    setNewClientName("");
    setNewClientOpen(false);
    onOpenChange(false);
  };

  async function handleCreateClient() {
    const name = newClientName.trim();
    if (!name) {
      toast.error("הזן שם לקוח");
      return;
    }
    setCreatingClient(true);
    try {
      const res = await createCrmContact({ name, type: "End_Customer" });
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      const clientId = res.id;
      if (!clientId) {
        toast.error("לא התקבל מזהה איש קשר");
        return;
      }
      setClients((prev) =>
        [...prev, { id: clientId, name }].sort((a, b) => a.name.localeCompare(b.name, "he"))
      );
      setForm((f) => ({ ...f, client_id: clientId }));
      toast.success("לקוח נוצר ונבחר");
      setNewClientName("");
      setNewClientOpen(false);
    } finally {
      setCreatingClient(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.scribe_id) {
      toast.error("יש לבחור סופר");
      return;
    }
    setLoading(true);
    try {
      const res = await createTorahProject({
        title: form.title,
        scribe_id: form.scribe_id,
        client_id: form.client_id || null,
        target_date: form.target_date || null,
        total_agreed_price: form.total_agreed_price === "" ? 0 : Number(form.total_agreed_price),
        columns_per_day: form.columns_per_day === "" ? 0 : Number(form.columns_per_day),
        qa_weeks_buffer: form.qa_weeks_buffer === "" ? 3 : Number(form.qa_weeks_buffer),
        gavra_qa_count: form.gavra_qa_count === "" ? 1 : Number(form.gavra_qa_count),
        computer_qa_count: form.computer_qa_count === "" ? 1 : Number(form.computer_qa_count),
        requires_tagging: form.requires_tagging,
      });
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      toast.success("פרויקט נוצר — 62 יריעות נוצרו בהצלחה");
      handleClose();
      onCreated();
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="sm:max-w-lg rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sky-800">
            <BookOpen className="size-5 text-amber-500" />
            פרויקט ספר תורה חדש
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {/* Title */}
          <div>
            <p className="text-xs text-muted-foreground mb-1">שם הפרויקט *</p>
            <Input
              required
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder='ס"ת לבר מצווה - משפחת כהן'
            />
          </div>

          {/* Scribe */}
          <div>
            <p className="text-xs text-muted-foreground mb-1">סופר *</p>
            <UnifiedScribeSelect
              value={form.scribe_id || null}
              onChange={(s) =>
                setForm((f) => ({
                  ...f,
                  scribe_id: s?.id ?? "",
                  scribe_name: s?.name ?? "",
                }))
              }
              placeholder="בחר סופר"
              className="w-full [&>div]:min-h-10 [&>div]:rounded-md"
            />
          </div>

          {/* Client (all CRM contacts) */}
          <div>
            <p className="text-xs text-muted-foreground mb-1">לקוח מזמין (אופציונלי)</p>
            <div className="flex gap-2 items-end">
              <select
                value={form.client_id}
                onChange={(e) => setForm((f) => ({ ...f, client_id: e.target.value }))}
                className="h-10 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">— ללא לקוח —</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-10 shrink-0 whitespace-nowrap px-3 text-sm font-semibold border-2 border-dashed border-sky-300 bg-sky-50 text-sky-800 hover:bg-sky-100"
                onClick={() => setNewClientOpen(true)}
              >
                ➕ לקוח חדש
              </Button>
            </div>
          </div>

          {/* Target date */}
          <div>
            <p className="text-xs text-muted-foreground mb-1">תאריך יעד (אופציונלי)</p>
            <Input
              type="date"
              value={form.target_date}
              onChange={(e) => setForm((f) => ({ ...f, target_date: e.target.value }))}
            />
          </div>

          {/* Total agreed price */}
          <div>
            <p className="text-xs text-muted-foreground mb-1">מחיר כולל מוסכם (₪)</p>
            <Input
              type="number"
              min={0}
              step={0.01}
              inputMode="decimal"
              value={form.total_agreed_price}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  total_agreed_price: applyNumericTransform(e.target.value),
                }))
              }
              placeholder="0"
            />
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
                  inputMode="decimal"
                  value={form.columns_per_day}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      columns_per_day: applyNumericTransform(e.target.value),
                    }))
                  }
                  placeholder="0"
                />
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">מאגר שבועות ל‑QA לפני היעד</p>
                <Input
                  type="number"
                  min={0}
                  step={1}
                  value={form.qa_weeks_buffer}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      qa_weeks_buffer: applyNumericTransform(e.target.value),
                    }))
                  }
                />
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">מספר הגהות גו״ר (אדם)</p>
                <Input
                  type="number"
                  min={0}
                  step={1}
                  value={form.gavra_qa_count}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      gavra_qa_count: applyNumericTransform(e.target.value),
                    }))
                  }
                />
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">מספר הגהות מחשב</p>
                <Input
                  type="number"
                  min={0}
                  step={1}
                  value={form.computer_qa_count}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      computer_qa_count: applyNumericTransform(e.target.value),
                    }))
                  }
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.requires_tagging}
                onChange={(e) => setForm((f) => ({ ...f, requires_tagging: e.target.checked }))}
                className="size-4 rounded border-input"
              />
              נדרש תיוג חיצוני
            </label>
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              type="submit"
              disabled={loading}
              className="bg-sky-600 hover:bg-sky-700 flex-1"
            >
              {loading ? "יוצר פרויקט..." : "צור פרויקט + 62 יריעות"}
            </Button>
            <Button type="button" variant="outline" onClick={handleClose}>
              ביטול
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>

      <Dialog open={newClientOpen} onOpenChange={setNewClientOpen}>
        <DialogContent className="sm:max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base">לקוח חדש</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <Input
              autoFocus
              placeholder="שם מלא"
              value={newClientName}
              onChange={(e) => setNewClientName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleCreateClient())}
            />
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" size="sm" onClick={() => setNewClientOpen(false)}>
                ביטול
              </Button>
              <Button
                type="button"
                size="sm"
                className="bg-sky-600 hover:bg-sky-700"
                disabled={creatingClient}
                onClick={handleCreateClient}
              >
                {creatingClient ? "יוצר..." : "צור ובחר"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Project card ──────────────────────────────────────────────

function ProjectCard({ project }: { project: TorahProjectWithNames }) {
  const router = useRouter();
  const targetDisplay = project.target_date
    ? new Date(project.target_date).toLocaleDateString("he-IL")
    : null;

  return (
    <Card
      className="rounded-2xl border border-sky-100 bg-white shadow-sm hover:shadow-md hover:border-sky-200 transition-all cursor-pointer group"
      onClick={() => router.push(`/torah/${project.id}`)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && router.push(`/torah/${project.id}`)}
    >
      <CardContent className="p-5 space-y-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-semibold text-slate-800 truncate group-hover:text-sky-700 transition-colors">
              {project.title}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {project.id.slice(0, 8)}
            </p>
          </div>
          <StatusBadge status={project.status} />
        </div>

        {/* Progress bar */}
        <ProgressBar value={project.sheets_approved} max={TORAH_SHEET_COUNT} />

        {/* Meta */}
        <div className="space-y-1.5 text-sm">
          <div className="flex items-center gap-2 text-slate-600">
            <UserRound className="size-3.5 text-sky-500 shrink-0" />
            <span className="truncate">סופר: {project.scribe_name ?? "—"}</span>
          </div>
          {project.client_name && (
            <div className="flex items-center gap-2 text-slate-600">
              <Users className="size-3.5 text-emerald-500 shrink-0" />
              <span className="truncate">לקוח: {project.client_name}</span>
            </div>
          )}
          {targetDisplay && (
            <div className="flex items-center gap-2 text-slate-500">
              <CalendarDays className="size-3.5 text-amber-500 shrink-0" />
              <span>יעד: {targetDisplay}</span>
            </div>
          )}
        </div>

        {/* Sheet count footer */}
        <div className="pt-1 border-t border-slate-100 flex items-center justify-between text-xs text-muted-foreground">
          <span>{project.sheets_created} / {TORAH_SHEET_COUNT} יריעות במערכת</span>
          <span className="text-sky-500 font-medium group-hover:underline">פרטים ←</span>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main client component ─────────────────────────────────────

type Props = {
  initialProjects: TorahProjectWithNames[];
};

export default function TorahClient({ initialProjects }: Props) {
  const router = useRouter();
  const [projects, setProjects] = useState(initialProjects);
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleCreated = () => {
    router.refresh();
  };

  // Stats summary
  const total = projects.length;
  const active = projects.filter((p) => p.status === "writing" || p.status === "qa").length;
  const sheetsApprovedTotal = projects.reduce((s, p) => s + p.sheets_approved, 0);
  const sheetsPossible = total * TORAH_SHEET_COUNT;

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8 min-h-screen bg-slate-50/60">
      {/* Page header */}
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-sky-700 flex items-center gap-2">
            <ScrollText className="size-7 text-amber-500" />
            פרויקטי ספרי תורה
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            ניהול מעקב כתיבה — יריעה ליריעה
          </p>
        </div>
        <Button
          onClick={() => setDialogOpen(true)}
          className="bg-sky-600 hover:bg-sky-700 shrink-0"
        >
          <Plus className="size-4 ml-1" />
          פרויקט חדש
        </Button>
      </div>

      {/* Summary cards */}
      {total > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8">
          <Card className="rounded-xl border-sky-100">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-sky-700">{total}</p>
              <p className="text-xs text-muted-foreground mt-1">פרויקטים</p>
            </CardContent>
          </Card>
          <Card className="rounded-xl border-amber-100">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-amber-600">{active}</p>
              <p className="text-xs text-muted-foreground mt-1">בתהליך פעיל</p>
            </CardContent>
          </Card>
          <Card className="rounded-xl border-green-100 col-span-2 sm:col-span-1">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-green-600">
                {sheetsPossible > 0
                  ? Math.round((sheetsApprovedTotal / sheetsPossible) * 100)
                  : 0}%
              </p>
              <p className="text-xs text-muted-foreground mt-1">יריעות אושרו (כולל)</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Projects grid */}
      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <BookOpen className="size-12 text-sky-200 mb-4" />
          <h2 className="text-lg font-semibold text-slate-500">אין עדיין פרויקטים</h2>
          <p className="text-sm text-muted-foreground mt-1 mb-6">
            לחץ על &quot;פרויקט חדש&quot; כדי להתחיל לעקוב אחרי כתיבת ספר תורה
          </p>
          <Button onClick={() => setDialogOpen(true)} className="bg-sky-600 hover:bg-sky-700">
            <Plus className="size-4 ml-1" />
            פרויקט ראשון
          </Button>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
        </div>
      )}

      <NewProjectDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={handleCreated}
      />
    </div>
  );
}
