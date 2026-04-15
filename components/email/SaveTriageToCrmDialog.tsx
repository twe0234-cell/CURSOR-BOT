"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  saveGmailTriageToCrm,
  type ContactType,
  type GmailTriageContact,
} from "@/app/email/import/actions";
import { fetchCrmContacts } from "@/app/crm/actions";
import { BookmarkIcon } from "lucide-react";

const CONTACT_TYPES: { value: ContactType; label: string }[] = [
  { value: "Scribe", label: "סופר" },
  { value: "Merchant", label: "סוחר" },
  { value: "End_Customer", label: "לקוח קצה" },
  { value: "Other", label: "אחר" },
];

type CrmMini = { id: string; name: string; email: string | null };

export function SaveTriageToCrmDialog({
  row,
  open,
  onOpenChange,
  onSaved,
}: {
  row: GmailTriageContact | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: (email: string) => void;
}) {
  const [mode, setMode] = useState<"create" | "link">("create");
  const [name, setName] = useState("");
  const [summary, setSummary] = useState("");
  const [contactType, setContactType] = useState<ContactType>("Other");
  const [linkId, setLinkId] = useState<string | null>(null);
  const [crmList, setCrmList] = useState<CrmMini[]>([]);
  const [crmSearch, setCrmSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(false);

  useEffect(() => {
    if (!open || !row) return;
    setName(row.name || row.email.split("@")[0]);
    setSummary("");
    setMode("create");
    setContactType("Other");
    setLinkId(null);
    setCrmSearch("");
  }, [open, row]);

  useEffect(() => {
    if (!open || mode !== "link") return;
    setListLoading(true);
    void fetchCrmContacts().then((r) => {
      setListLoading(false);
      if (r.success) {
        setCrmList(r.contacts.map((c) => ({ id: c.id, name: c.name, email: c.email })));
      }
    });
  }, [open, mode]);

  if (!row) return null;

  const filteredCrm = crmSearch.trim()
    ? crmList.filter(
        (c) =>
          c.name.toLowerCase().includes(crmSearch.toLowerCase()) ||
          (c.email ?? "").toLowerCase().includes(crmSearch.toLowerCase())
      )
    : crmList;

  const handleSubmit = async () => {
    setLoading(true);
    const res = await saveGmailTriageToCrm({
      mode,
      email: row.email,
      name: name.trim() || row.name,
      summary: summary.trim(),
      contactType,
      linkToContactId: mode === "link" ? linkId : null,
    });
    setLoading(false);
    if (res.success) {
      toast.success("נשמר ב-CRM");
      onSaved(row.email);
      onOpenChange(false);
    } else {
      toast.error(res.error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookmarkIcon className="size-5 text-teal-600" />
            שמירה ב-CRM
          </DialogTitle>
          <DialogDescription className="text-right">
            נתונים מייבוא Gmail — ניתן ליצור איש קשר חדש או לקשר למצוין, ולתעד סיכום (AI או ידני).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2 text-sm">
          <div>
            <p className="text-xs text-muted-foreground mb-1">אימייל</p>
            <p className="font-mono text-sm rounded-lg border bg-muted/40 px-3 py-2">{row.email}</p>
          </div>

          <div>
            <label className="text-xs text-muted-foreground">שם</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 rounded-lg" />
          </div>

          <div>
            <label className="text-xs text-muted-foreground">סיכום / הקשר (אופציונלי)</label>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={4}
              placeholder="הדבק סיכום AI או תיאור קצר של השיחה…"
              className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              variant={mode === "create" ? "secondary" : "outline"}
              size="sm"
              className="rounded-lg"
              onClick={() => setMode("create")}
            >
              יצירה חדשה
            </Button>
            <Button
              type="button"
              variant={mode === "link" ? "secondary" : "outline"}
              size="sm"
              className="rounded-lg"
              onClick={() => setMode("link")}
            >
              קישור לקיים
            </Button>
          </div>

          {mode === "create" && (
            <div>
              <label className="text-xs text-muted-foreground">סוג איש קשר</label>
              <select
                value={contactType}
                onChange={(e) => setContactType(e.target.value as ContactType)}
                className="mt-1 flex h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
              >
                {CONTACT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {mode === "link" && (
            <div className="space-y-2">
              <Input
                placeholder="חיפוש איש קשר…"
                value={crmSearch}
                onChange={(e) => setCrmSearch(e.target.value)}
                className="rounded-lg"
              />
              <div className="max-h-36 overflow-y-auto rounded-lg border divide-y">
                {listLoading ? (
                  <p className="p-3 text-xs text-muted-foreground text-center">טוען…</p>
                ) : filteredCrm.length === 0 ? (
                  <p className="p-3 text-xs text-muted-foreground text-center">אין תוצאות</p>
                ) : (
                  filteredCrm.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setLinkId(c.id)}
                      className={`w-full text-right px-3 py-2 text-sm hover:bg-muted/60 ${
                        linkId === c.id ? "bg-teal-50" : ""
                      }`}
                    >
                      <span className="font-medium block">{c.name}</span>
                      <span className="text-xs text-muted-foreground">{c.email ?? "—"}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 flex-row-reverse sm:justify-start">
          <Button type="button" onClick={() => void handleSubmit()} disabled={loading}>
            {loading ? "שומר…" : "שמור ב-CRM"}
          </Button>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            ביטול
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
