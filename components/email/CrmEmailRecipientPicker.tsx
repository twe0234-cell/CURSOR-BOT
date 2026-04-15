"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { fetchCrmContacts } from "@/app/crm/actions";
import { addCrmContactToEmailList } from "@/app/email/actions";
import { UserIcon } from "lucide-react";

type CrmRow = { id: string; name: string; email: string | null; phone: string | null };

type Props = {
  /** After a contact is resolved to an email_contacts row, pass its id for campaign selection */
  onEmailContactResolved: (emailContactId: string, email: string) => void;
};

export function CrmEmailRecipientPicker({ onEmailContactResolved }: Props) {
  const [open, setOpen] = useState(false);
  const [contacts, setContacts] = useState<CrmRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);

  const load = () => {
    setLoading(true);
    void fetchCrmContacts().then((r) => {
      setLoading(false);
      if (r.success) {
        setContacts(
          r.contacts.map((c) => ({
            id: c.id,
            name: c.name,
            email: c.email ?? null,
            phone: c.phone ?? null,
          }))
        );
      } else toast.error(r.error);
    });
  };

  useEffect(() => {
    if (open) load();
  }, [open]);

  const filtered = search.trim()
    ? contacts.filter(
        (c) =>
          c.name.toLowerCase().includes(search.toLowerCase()) ||
          (c.email ?? "").toLowerCase().includes(search.toLowerCase())
      )
    : contacts;

  const pick = async (c: CrmRow) => {
    const em = c.email?.trim();
    if (!em) {
      toast.error("לאיש קשר זה אין אימייל ב-CRM");
      return;
    }
    setAdding(true);
    const res = await addCrmContactToEmailList(c.name, em, c.phone);
    setAdding(false);
    if (!res.success) {
      toast.error(res.error);
      return;
    }
    toast.success("הנמען נוסף / עודכן ברשימת הדיוור");
    setOpen(false);
    setSearch("");
    onEmailContactResolved(res.emailContactId ?? "", em);
  };

  return (
    <div className="rounded-xl border border-teal-100 bg-teal-50/30 p-3 space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium text-slate-800">
        <UserIcon className="size-4 text-teal-700" />
        נמען מ-CRM
      </div>
      <p className="text-xs text-muted-foreground">
        בחר איש קשר — המייל ימולא וייסנכרן לרשימת התפוצה לדיוור (אם חסר).
      </p>
      <div className="relative">
        <Button
          type="button"
          variant="outline"
          className="w-full justify-between rounded-lg border-teal-200 bg-white"
          onClick={() => setOpen((v) => !v)}
        >
          {loading ? "טוען…" : "חיפוש איש קשר CRM…"}
        </Button>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
            <div className="absolute top-full right-0 left-0 z-50 mt-1 max-h-52 overflow-y-auto rounded-lg border bg-background shadow-md">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="שם או אימייל…"
                className="m-2 h-9 rounded-lg"
              />
              {filtered.slice(0, 60).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  disabled={adding}
                  onClick={() => void pick(c)}
                  className="flex w-full flex-col items-start px-3 py-2 text-right text-sm hover:bg-muted/70 disabled:opacity-50"
                >
                  <span className="font-medium">{c.name}</span>
                  <span className="text-xs text-muted-foreground">{c.email ?? "—"}</span>
                </button>
              ))}
              {filtered.length === 0 && !loading && (
                <p className="p-3 text-xs text-muted-foreground text-center">לא נמצאו תוצאות</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
