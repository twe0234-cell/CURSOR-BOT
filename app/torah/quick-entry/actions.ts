"use server";

import { createClient } from "@/src/lib/supabase/server";
import { createTorahProjectTransaction } from "@/app/torah/[id]/actions";
import type { TorahLedgerTransactionType } from "@/src/lib/constants/torahLedger";

export type TorahQuickProjectOption = {
  id: string;
  title: string;
  scribe_name: string | null;
};

export async function fetchTorahQuickEntryProjects(): Promise<
  { success: true; projects: TorahQuickProjectOption[] } | { success: false; error: string }
> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { data, error } = await supabase
      .from("torah_projects")
      .select("id, title, scribe_id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) return { success: false, error: error.message };

    const rows = data ?? [];
    const scribeIds = [...new Set(rows.map((r) => r.scribe_id as string).filter(Boolean))];
    let nameById = new Map<string, string>();
    if (scribeIds.length > 0) {
      const { data: scribes } = await supabase
        .from("crm_contacts")
        .select("id, name")
        .eq("user_id", user.id)
        .in("id", scribeIds);
      nameById = new Map((scribes ?? []).map((s) => [s.id as string, String(s.name ?? "").trim()]));
    }

    const projects: TorahQuickProjectOption[] = rows.map((r) => {
      const sid = r.scribe_id as string | null;
      const nm = sid ? nameById.get(sid) : undefined;
      return {
        id: r.id as string,
        title: (r.title as string) ?? "",
        scribe_name: nm && nm.length > 0 ? nm : null,
      };
    });

    return { success: true, projects };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "שגיאה" };
  }
}

export type QuickLedgerKind =
  | "scribe_payment"
  | "client_payment"
  | "parchment_expense"
  | "qa_expense"
  | "sheet_in"
  | "sheet_out";

const KIND_TO_LEDGER: Record<
  Exclude<QuickLedgerKind, "sheet_in" | "sheet_out">,
  TorahLedgerTransactionType
> = {
  scribe_payment: "scribe_payment",
  client_payment: "client_payment",
  parchment_expense: "parchment_expense",
  qa_expense: "qa_expense",
};

export async function submitTorahQuickLedgerLine(input: {
  projectId: string;
  kind: QuickLedgerKind;
  amount: number;
  note?: string;
  /** YYYY-MM-DD — אופציונלי; ברירת מחדל היום */
  date?: string | null;
}): Promise<{ success: true } | { success: false; error: string }> {
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount < 0) {
    return { success: false, error: "סכום לא תקין" };
  }

  let transaction_type: TorahLedgerTransactionType;
  let notes: string | null = input.note?.trim() ? input.note.trim() : null;

  if (input.kind === "sheet_in") {
    transaction_type = "other_expense";
    notes = notes ? `כניסת יריעה · ${notes}` : "כניסת יריעה";
  } else if (input.kind === "sheet_out") {
    transaction_type = "other_expense";
    notes = notes ? `יציאת יריעה · ${notes}` : "יציאת יריעה";
  } else {
    transaction_type = KIND_TO_LEDGER[input.kind];
  }

  let dateVal: Date | string = new Date();
  if (input.date && /^\d{4}-\d{2}-\d{2}$/.test(input.date.trim())) {
    dateVal = `${input.date.trim()}T12:00:00.000Z`;
  }

  return createTorahProjectTransaction({
    projectId: input.projectId,
    transaction_type,
    amount,
    notes,
    date: dateVal,
  });
}
