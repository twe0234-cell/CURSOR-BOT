"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import type { TorahQuickProjectOption } from "./actions";
import { submitTorahQuickLedgerLine, type QuickLedgerKind } from "./actions";

const KIND_OPTIONS: { value: QuickLedgerKind; label: string }[] = [
  { value: "scribe_payment", label: "תשלום לסופר" },
  { value: "client_payment", label: "תשלום מלקוח (גבייה)" },
  { value: "parchment_expense", label: "הוצאת קלף" },
  { value: "qa_expense", label: "הוצאת QA / הגהה" },
  { value: "sheet_in", label: "כניסת יריעה (יומן)" },
  { value: "sheet_out", label: "יציאת יריעה (יומן)" },
];

type Props = { initialProjects: TorahQuickProjectOption[] };

export default function QuickEntryClient({ initialProjects }: Props) {
  const [projectId, setProjectId] = useState(initialProjects[0]?.id ?? "");
  const [kind, setKind] = useState<QuickLedgerKind>("scribe_payment");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [txDate, setTxDate] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    const n = Number(String(amount).replace(",", "."));
    if (!projectId) {
      toast.error("בחר פרויקט ס״ת");
      return;
    }
    if (!Number.isFinite(n) || n < 0) {
      toast.error("הזן סכום תקין");
      return;
    }
    startTransition(async () => {
      const res = await submitTorahQuickLedgerLine({
        projectId,
        kind,
        amount: n,
        note: note.trim() || undefined,
        date: txDate.trim() || null,
      });
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      toast.success("נרשם ביומן הפרויקט");
      setAmount("");
      setNote("");
      setTxDate("");
    });
  }

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href="/torah"
          className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent"
        >
          ← לרשימת פרויקטים
        </Link>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">תנועות מהיר — ס״ת</CardTitle>
          <CardDescription>
            רישום ישיר ל־<code className="text-xs">torah_project_transactions</code> ללא כניסה לכרטיס
            הפרויקט. תשלומים מפעילים התראות (מייל/וואטסאפ) כרגיל.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {initialProjects.length === 0 ? (
            <p className="text-sm text-muted-foreground">אין פרויקטים — צור פרויקט מדף הפרויקטים.</p>
          ) : (
            <>
              <div className="space-y-2">
                <span className="text-sm font-medium text-foreground">פרויקט</span>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                >
                  {initialProjects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                      {p.scribe_name ? ` · ${p.scribe_name}` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <span className="text-sm font-medium text-foreground">סוג תנועה</span>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={kind}
                  onChange={(e) => setKind(e.target.value as QuickLedgerKind)}
                >
                  {KIND_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <span className="text-sm font-medium text-foreground">תאריך תנועה</span>
                <Input
                  type="date"
                  value={txDate}
                  onChange={(e) => setTxDate(e.target.value)}
                  className="font-mono text-sm"
                />
                <p className="text-[11px] text-muted-foreground">ריק = היום</p>
              </div>
              <div className="space-y-2">
                <span className="text-sm font-medium text-foreground" id="qe-amount-lbl">
                  סכום (₪)
                </span>
                <Input
                  id="qe-amount"
                  aria-labelledby="qe-amount-lbl"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="לדוגמה: 1800"
                />
              </div>
              <div className="space-y-2">
                <span className="text-sm font-medium text-foreground" id="qe-note-lbl">
                  הערה (אופציונלי)
                </span>
                <Textarea
                  aria-labelledby="qe-note-lbl"
                  id="qe-note"
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="פרטים ליומן / מקור…"
                />
              </div>
              <Button type="button" className="w-full" disabled={pending} onClick={submit}>
                {pending ? "שומר…" : "שמור תנועה"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
