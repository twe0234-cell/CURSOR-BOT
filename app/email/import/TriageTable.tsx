"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  createCrmContactFromTriage,
  mergeCrmContactEmail,
  ignoreEmail,
  type GmailTriageContact,
  type ContactType,
} from "./actions";
import { fetchCrmContacts } from "@/app/crm/actions";
import { SaveTriageToCrmDialog } from "@/components/email/SaveTriageToCrmDialog";
import { UserPlusIcon, MergeIcon, BanIcon, BookmarkIcon } from "lucide-react";

const CONTACT_TYPES: { value: ContactType; label: string }[] = [
  { value: "Scribe", label: "סופר" },
  { value: "Merchant", label: "סוחר" },
  { value: "End_Customer", label: "לקוח קצה" },
  { value: "Other", label: "ספק" },
];

type CrmContact = { id: string; name: string; email: string | null };

type Props = {
  initialContacts: GmailTriageContact[];
  onContactsChange?: (contacts: GmailTriageContact[]) => void;
};

function CrmContactCombobox({
  value,
  onChange,
  placeholder,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  placeholder?: string;
}) {
  const [contacts, setContacts] = useState<CrmContact[]>([]);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const loadContacts = () => {
    fetchCrmContacts().then((r) => {
      if (r.success) setContacts(r.contacts.map((c) => ({ id: c.id, name: c.name, email: c.email })));
    });
  };

  const selected = contacts.find((c) => c.id === value);
  const filtered = search.trim()
    ? contacts.filter(
        (c) =>
          c.name.toLowerCase().includes(search.toLowerCase()) ||
          (c.email ?? "").toLowerCase().includes(search.toLowerCase())
      )
    : contacts;

  return (
    <div className="relative">
      <div
        className="flex min-h-8 w-full items-center rounded-lg border border-input bg-transparent px-2.5 py-1"
        onClick={() => {
          setOpen(true);
          loadContacts();
        }}
      >
        <span className="flex-1 truncate text-sm">
          {selected ? `${selected.name}${selected.email ? ` (${selected.email})` : ""}` : placeholder ?? "בחר איש קשר"}
        </span>
      </div>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 right-0 z-50 mt-1 max-h-40 overflow-y-auto rounded-lg border bg-background shadow-lg">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="חיפוש..."
              className="m-2 h-8"
            />
            {filtered.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  onChange(c.id);
                  setOpen(false);
                }}
                className="flex w-full flex-col items-start px-3 py-2 text-right text-sm hover:bg-muted"
              >
                <span>{c.name}</span>
                {c.email && <span className="text-xs text-muted-foreground">{c.email}</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function TriageTable({
  initialContacts,
  onContactsChange,
}: Props) {
  const [contacts, setContacts] = useState(initialContacts);
  useEffect(() => {
    setContacts(initialContacts);
  }, [initialContacts]);
  const [createState, setCreateState] = useState<Record<string, { name: string; type: ContactType }>>({});
  const [mergeState, setMergeState] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState<Record<string, string>>({});
  const [saveDialogRow, setSaveDialogRow] = useState<GmailTriageContact | null>(null);

  const handleCreate = async (email: string) => {
    const state = createState[email];
    if (!state?.name.trim()) {
      toast.error("הזן שם");
      return;
    }
    setLoading((p) => ({ ...p, [email]: "create" }));
    const res = await createCrmContactFromTriage(email, state.name, state.type);
    setLoading((p) => ({ ...p, [email]: "" }));
    if (res.success) {
      const nextContacts = contacts.filter((c) => c.email !== email);
      setContacts(nextContacts);
      onContactsChange?.(nextContacts);
      setCreateState((p) => {
        const next = { ...p };
        delete next[email];
        return next;
      });
      toast.success("נוצר איש קשר");
    } else {
      toast.error(res.error);
    }
  };

  const handleMerge = async (email: string) => {
    const contactId = mergeState[email];
    if (!contactId) {
      toast.error("בחר איש קשר למזג");
      return;
    }
    setLoading((p) => ({ ...p, [email]: "merge" }));
    const res = await mergeCrmContactEmail(contactId, email);
    setLoading((p) => ({ ...p, [email]: "" }));
    if (res.success) {
      const nextContacts = contacts.filter((c) => c.email !== email);
      setContacts(nextContacts);
      onContactsChange?.(nextContacts);
      setMergeState((p) => {
        const next = { ...p };
        delete next[email];
        return next;
      });
      toast.success("אימייל מוזג");
    } else {
      toast.error(res.error);
    }
  };

  const handleIgnore = async (email: string) => {
    setLoading((p) => ({ ...p, [email]: "ignore" }));
    const res = await ignoreEmail(email);
    setLoading((p) => ({ ...p, [email]: "" }));
    if (res.success) {
      const nextContacts = contacts.filter((c) => c.email !== email);
      setContacts(nextContacts);
      onContactsChange?.(nextContacts);
      toast.success("האימייל הועבר לרשימת התעלמות");
    } else {
      toast.error(res.error);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-50/80">
            <TableHead className="font-semibold">אימייל</TableHead>
            <TableHead className="font-semibold">שם</TableHead>
            <TableHead className="font-semibold">יצירה חדשה</TableHead>
            <TableHead className="font-semibold">מיזוג</TableHead>
            <TableHead className="font-semibold w-24">התעלם</TableHead>
            <TableHead className="font-semibold min-w-[7rem]">שמור ב-CRM</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {contacts.map((c) => (
            <TableRow key={c.email}>
              <TableCell className="font-mono text-sm">{c.email}</TableCell>
              <TableCell>{c.name || c.email.split("@")[0]}</TableCell>
              <TableCell>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    placeholder="שם"
                    value={createState[c.email]?.name ?? ""}
                    onChange={(e) =>
                      setCreateState((p) => ({
                        ...p,
                        [c.email]: { ...(p[c.email] ?? { name: "", type: "Other" }), name: e.target.value },
                      }))
                    }
                    className="max-w-[120px] h-8"
                  />
                  <select
                    value={createState[c.email]?.type ?? "Other"}
                    onChange={(e) =>
                      setCreateState((p) => ({
                        ...p,
                        [c.email]: {
                          ...(p[c.email] ?? { name: "", type: "Other" }),
                          type: e.target.value as ContactType,
                        },
                      }))
                    }
                    className="h-8 rounded-lg border px-2 text-sm max-w-[100px]"
                  >
                    {CONTACT_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  <Button
                    size="sm"
                    onClick={() => handleCreate(c.email)}
                    disabled={loading[c.email] === "create"}
                    className="h-8"
                  >
                    <UserPlusIcon className="size-4 ml-1" />
                    שמור
                  </Button>
                </div>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <div className="min-w-[140px]">
                    <CrmContactCombobox
                      value={mergeState[c.email] ?? null}
                      onChange={(id) => setMergeState((p) => ({ ...p, [c.email]: id }))}
                      placeholder="בחר למזג"
                    />
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleMerge(c.email)}
                    disabled={loading[c.email] === "merge"}
                    className="h-8"
                  >
                    <MergeIcon className="size-4 ml-1" />
                    מזג
                  </Button>
                </div>
              </TableCell>
              <TableCell>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleIgnore(c.email)}
                  disabled={loading[c.email] === "ignore"}
                  className="h-8 text-red-600 hover:bg-red-50"
                >
                  <BanIcon className="size-4" />
                </Button>
              </TableCell>
              <TableCell>
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-8 gap-1"
                  onClick={() => setSaveDialogRow(c)}
                >
                  <BookmarkIcon className="size-4" />
                  שמור ב-CRM
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <SaveTriageToCrmDialog
        row={saveDialogRow}
        open={saveDialogRow !== null}
        onOpenChange={(v) => !v && setSaveDialogRow(null)}
        onSaved={(email) => {
          setContacts((prev) => {
            const next = prev.filter((x) => x.email !== email);
            onContactsChange?.(next);
            return next;
          });
          setSaveDialogRow(null);
        }}
      />
    </div>
  );
}
