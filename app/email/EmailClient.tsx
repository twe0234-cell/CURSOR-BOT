"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  fetchEmailContacts,
  importEmailContacts,
  deleteEmailContact,
  bulkDeleteEmailContacts,
  getGmailStatus,
  sendEmailCampaign,
  type EmailContact,
} from "./actions";
import {
  MailIcon,
  UsersIcon,
  Trash2Icon,
  KeyIcon,
  BarChart3Icon,
  UploadIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Tab = "contacts" | "campaigns" | "stats";

type Props = {
  initialContacts: EmailContact[];
};

export default function EmailClient({ initialContacts }: Props) {
  const [contacts, setContacts] = useState(initialContacts ?? []);
  const [tab, setTab] = useState<Tab>("campaigns");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importLoading, setImportLoading] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [gmailConnected, setGmailConnected] = useState(false);
  const [campaignSubject, setCampaignSubject] = useState("");
  const [campaignBody, setCampaignBody] = useState("");
  const [sending, setSending] = useState(false);

  const filtered = useMemo(() => {
    if (!search) return contacts;
    const q = search.toLowerCase();
    return contacts.filter(
      (c) =>
        c.email.toLowerCase().includes(q) ||
        (c.name ?? "").toLowerCase().includes(q) ||
        (c.tags ?? []).some((t) => t.toLowerCase().includes(q))
    );
  }, [contacts, search]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((c) => c.id)));
    }
  };

  const handleImport = async () => {
    const lines = importText.split(/\n/).map((l) => l.trim()).filter(Boolean);
    const rows = lines.map((line) => {
      const parts = line.split(/[,;\t]/).map((p) => p.trim());
      return { email: parts[0] ?? "", name: parts[1], tags: parts[2] ? [parts[2]] : undefined };
    }).filter((r) => r.email);

    if (rows.length === 0) {
      toast.error("הזן אימיילים (שורה אחת לאימייל, או מופרדים בפסיק)");
      return;
    }

    setImportLoading(true);
    const res = await importEmailContacts(rows);
    setImportLoading(false);
    if (res.success) {
      toast.success(`${rows.length} אנשי קשר יובאו`);
      setImportOpen(false);
      setImportText("");
      const updated = await fetchEmailContacts();
      if (updated.success) setContacts(updated.contacts);
    } else {
      toast.error(res.error);
    }
  };

  const handleDeleteOne = async (id: string) => {
    const res = await deleteEmailContact(id);
    if (res.success) {
      setContacts((prev) => prev.filter((c) => c.id !== id));
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      toast.success("איש הקשר נמחק");
    } else toast.error(res.error);
  };

  const handleBulkDelete = async () => {
    if (selected.size === 0) return;
    const res = await bulkDeleteEmailContacts([...selected]);
    setDeleteOpen(false);
    if (res.success) {
      setContacts((prev) => prev.filter((c) => !selected.has(c.id)));
      setSelected(new Set());
      toast.success(`${selected.size} אנשי קשר נמחקו`);
    } else toast.error(res.error);
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      setImportText((prev) => (prev ? prev + "\n" + text : text));
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  useEffect(() => {
    getGmailStatus().then((r) => {
      if (r.success && r.connected) setGmailConnected(true);
    });
  }, []);

  const handleSendCampaign = async () => {
    const ids = selected.size > 0 ? [...selected] : filtered.map((c) => c.id);
    if (ids.length === 0) {
      toast.error("בחר נמענים או עבור ללשונית אנשי קשר");
      return;
    }
    setSending(true);
    const res = await sendEmailCampaign(ids, campaignSubject, campaignBody);
    setSending(false);
    if (res.success) {
      toast.success(`נשלחו ${res.sent} אימיילים${res.failed > 0 ? `, ${res.failed} נכשלו` : ""}`);
      setCampaignSubject("");
      setCampaignBody("");
      setSelected(new Set());
    } else {
      toast.error(res.error);
    }
  };

  const tabs: { id: Tab; label: string; icon: typeof UsersIcon }[] = [
    { id: "campaigns", label: "קמפיינים", icon: MailIcon },
    { id: "contacts", label: "אנשי קשר", icon: UsersIcon },
    { id: "stats", label: "סטטיסטיקות", icon: BarChart3Icon },
  ];

  return (
    <div className="w-full max-w-6xl mx-auto px-4 py-6 sm:py-8 min-w-0 overflow-x-hidden">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-3xl sm:text-4xl font-bold text-teal-800 mb-2">דיוור אימייל</h1>
        <p className="text-muted-foreground">
          ייבוא אנשי קשר, שליחת קמפיינים מ-Gmail ומעקב פתיחות והסרות
        </p>
      </div>

      <div className="flex flex-wrap gap-2 mb-6 border-b border-teal-100 pb-4">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              "flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all",
              tab === id
                ? "bg-teal-600 text-white"
                : "bg-teal-50 text-teal-700 hover:bg-teal-100"
            )}
          >
            <Icon className="size-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === "contacts" && (
        <>
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <Input
              placeholder="חיפוש לפי אימייל, שם או תגית..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm rounded-xl"
            />
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setImportOpen(true)}
                className="rounded-xl border-teal-200 hover:bg-teal-50"
              >
                <UploadIcon className="size-4 ml-2" />
                ייבוא אנשי קשר
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={toggleSelectAll}
                className="rounded-xl"
              >
                {selected.size === filtered.length && filtered.length > 0 ? "בטל בחירה" : "בחר הכל"}
              </Button>
              {selected.size > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDeleteOpen(true)}
                  className="rounded-xl text-red-600 border-red-200 hover:bg-red-50"
                >
                  <Trash2Icon className="size-4 ml-1" />
                  מחק ({selected.size})
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-3">
            {filtered.map((c) => (
              <Card key={c.id} className="border-teal-100 overflow-hidden">
                <CardHeader className="flex flex-row items-center gap-3 p-4">
                  <Checkbox
                    checked={selected.has(c.id)}
                    onCheckedChange={() => toggleSelect(c.id)}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{c.email}</p>
                    {c.name && <p className="text-sm text-muted-foreground truncate">{c.name}</p>}
                  </div>
                  <div className="flex flex-wrap gap-1 shrink-0">
                    {(c.tags ?? []).map((t) => (
                      <span key={t} className="rounded-full bg-teal-100 px-2 py-0.5 text-xs text-teal-700">
                        {t}
                      </span>
                    ))}
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => handleDeleteOne(c.id)}
                    className="size-8 text-red-600 hover:bg-red-50 shrink-0"
                  >
                    <Trash2Icon className="size-4" />
                  </Button>
                </CardHeader>
              </Card>
            ))}
          </div>

          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50">
              <div className="flex size-20 items-center justify-center rounded-full bg-teal-100 mb-4">
                <UsersIcon className="size-10 text-teal-600" />
              </div>
              <h3 className="text-lg font-semibold text-slate-700 mb-2">אין אנשי קשר</h3>
              <p className="text-center text-muted-foreground max-w-sm mb-6">
                ייבא קובץ CSV או הדבק רשימת אימיילים
              </p>
              <Button onClick={() => setImportOpen(true)}>ייבוא אנשי קשר</Button>
            </div>
          )}
        </>
      )}

      {tab === "campaigns" && (
        <Card className="border-teal-100 p-6 sm:p-8">
          {gmailConnected ? (
            <div className="space-y-6">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">נושא</label>
                <Input
                  value={campaignSubject}
                  onChange={(e) => setCampaignSubject(e.target.value)}
                  placeholder="נושא האימייל"
                  className="rounded-xl"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">תוכן (HTML)</label>
                <textarea
                  value={campaignBody}
                  onChange={(e) => setCampaignBody(e.target.value)}
                  placeholder="<p>שלום,</p><p>התוכן כאן...</p>"
                  rows={10}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 font-mono text-sm"
                />
              </div>
              <p className="text-xs text-slate-500">
                נמענים: {selected.size > 0 ? `${selected.size} נבחרו` : `כל ${filtered.length} אנשי הקשר`}
              </p>
              <Button
                onClick={handleSendCampaign}
                disabled={sending || !campaignSubject.trim()}
                className="rounded-xl bg-teal-600 hover:bg-teal-700"
              >
                {sending ? "שולח..." : "שלח קמפיין"}
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <KeyIcon className="size-16 text-teal-600" />
              <h3 className="text-lg font-semibold text-slate-700">חיבור Gmail</h3>
              <p className="text-center text-muted-foreground max-w-md">
                לחיבור Gmail שלך להפעלת שליחת אימיילים – הגדר OAuth בהגדרות. התגובות יגיעו לתיבת הדואר שלך, והמערכת תעקוב אחר פתיחות ובקשות הסרה.
              </p>
              <Link href="/settings">
                <Button variant="outline">הגדרות</Button>
              </Link>
            </div>
          )}
        </Card>
      )}

      {tab === "stats" && (
        <Card className="border-teal-100 p-8">
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <BarChart3Icon className="size-16 text-teal-600" />
            <h3 className="text-lg font-semibold text-slate-700">סטטיסטיקות</h3>
            <p className="text-center text-muted-foreground max-w-md">
              פילוח פתיחות, קליקים ובקשות הסרה – יופיעו כאן לאחר שליחת קמפיינים.
            </p>
          </div>
        </Card>
      )}

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle>ייבוא אנשי קשר</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mb-2">
            הדבק אימיילים (שורה אחת לאימייל) או CSV: אימייל,שם,תגית
          </p>
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder="email@example.com&#10;name@example.com, שם, תגית"
            rows={8}
            className="w-full rounded-xl border px-4 py-3 font-mono text-sm"
          />
          <div className="flex gap-2">
            <label htmlFor="email-import-file" className="cursor-pointer">
              <span className="inline-flex h-8 items-center justify-center rounded-lg border border-input bg-background px-2.5 text-sm font-medium hover:bg-muted">
                העלה קובץ
              </span>
            </label>
            <input id="email-import-file" type="file" accept=".csv,.txt" onChange={handleFileImport} className="hidden" />
            <Button onClick={handleImport} disabled={importLoading}>
              {importLoading ? "מייבא..." : "ייבוא"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-sm max-h-[90vh] overflow-y-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle>מחיקת אנשי קשר</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            האם למחוק {selected.size} אנשי קשר?
          </p>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>ביטול</Button>
            <Button variant="destructive" onClick={handleBulkDelete}>מחק</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
