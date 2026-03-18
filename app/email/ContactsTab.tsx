"use client";

import { useState, useMemo } from "react";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  fetchEmailContacts,
  importEmailContacts,
  importGmailContactsForEmail,
  deleteEmailContact,
  bulkDeleteEmailContacts,
  type EmailContact,
} from "./actions";
import { CsvActions } from "@/components/shared/CsvActions";
import { UsersIcon, Trash2Icon, UploadIcon, DownloadIcon } from "lucide-react";

type Props = {
  initialContacts: EmailContact[];
};

export default function ContactsTab({ initialContacts }: Props) {
  const [contacts, setContacts] = useState(initialContacts ?? []);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importLoading, setImportLoading] = useState(false);
  const [gmailImportLoading, setGmailImportLoading] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const filtered = useMemo(() => {
    if (!search) return contacts;
    const q = search.toLowerCase();
    return contacts.filter(
      (c) =>
        c.email.toLowerCase().includes(q) ||
        (c.name ?? "").toLowerCase().includes(q) ||
        (c.phone ?? "").toLowerCase().includes(q) ||
        (c.tags ?? []).some((t) => t.toLowerCase().includes(q))
    );
  }, [contacts, search]);

  const subscribedCount = useMemo(
    () => filtered.filter((c) => c.subscribed !== false).length,
    [filtered]
  );

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const selectable = filtered.filter((c) => c.subscribed !== false);
    if (selected.size === selectable.length && selectable.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(selectable.map((c) => c.id)));
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

  const handleGmailImport = async () => {
    setGmailImportLoading(true);
    const res = await importGmailContactsForEmail();
    setGmailImportLoading(false);
    if (res.success) {
      toast.success(`יובאו ${res.imported} אנשי קשר מ-Gmail`);
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

  const handleCsvImport = async (rows: Record<string, unknown>[]) => {
    const mapped = rows.map((r) => ({
      email: String(r.email ?? r.Email ?? r.אימייל ?? "").trim(),
      name: String(r.name ?? r.Name ?? r.שם ?? "").trim() || undefined,
      tags: (r.tags ?? r.Tags ?? r.תגיות) ? [String(r.tags ?? r.Tags ?? r.תגיות).trim()] : undefined,
    })).filter((r) => r.email);
    if (mapped.length === 0) {
      toast.error("לא נמצאו אימיילים תקינים בקובץ");
      return;
    }
    setImportLoading(true);
    const res = await importEmailContacts(mapped);
    setImportLoading(false);
    if (res.success) {
      toast.success(`יובאו ${mapped.length} אנשי קשר`);
      const updated = await fetchEmailContacts();
      if (updated.success) setContacts(updated.contacts);
    } else {
      toast.error(res.error);
    }
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

  return (
    <div className="space-y-6">
      <Card className="shadow-sm rounded-xl border-slate-200 bg-white overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <UsersIcon className="w-5 h-5 text-indigo-500" />
            <div>
              <h2 className="text-base font-semibold text-slate-700">אנשי קשר</h2>
              <p className="text-sm text-muted-foreground">ניהול אנשי קשר לייבוא וקמפיינים</p>
            </div>
          </div>
          <div className="flex gap-2">
            <CsvActions
              data={contacts.map((c) => ({ email: c.email, name: c.name, phone: c.phone, tags: c.tags?.join(",") }))}
              onImport={handleCsvImport}
              filename="email-contacts"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={handleGmailImport}
              disabled={gmailImportLoading}
              className="rounded-xl"
            >
              <DownloadIcon className="size-4 ml-1" />
              ייבוא מ-Gmail
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setImportOpen(true)}
              className="rounded-xl"
            >
              <UploadIcon className="size-4 ml-1" />
              ייבוא ידני
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative max-w-sm">
            <Input
              placeholder="חיפוש לפי אימייל, שם, טלפון או תגית..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="rounded-xl pr-10"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={toggleSelectAll}
              className="rounded-xl"
            >
              {selected.size === filtered.filter((c) => c.subscribed !== false).length && filtered.filter((c) => c.subscribed !== false).length > 0
                ? "בטל בחירה"
                : "בחר הכל"}
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
            <span className="text-sm text-muted-foreground">
              {subscribedCount} מנויים פעילים
            </span>
          </div>

          {contacts.length > 0 ? (
            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                    <TableHead className="w-10">
                      <Checkbox
                        checked={
                          selected.size === filtered.filter((c) => c.subscribed !== false).length &&
                          filtered.filter((c) => c.subscribed !== false).length > 0
                        }
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
                    <TableHead className="font-semibold">שם</TableHead>
                    <TableHead className="font-semibold">אימייל</TableHead>
                    <TableHead className="font-semibold">טלפון</TableHead>
                    <TableHead className="font-semibold">תגיות</TableHead>
                    <TableHead className="w-10 font-semibold">פעולות</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((c) => (
                    <TableRow key={c.id} className="hover:bg-slate-50/50">
                      <TableCell>
                        {c.subscribed !== false && (
                          <Checkbox
                            checked={selected.has(c.id)}
                            onCheckedChange={() => toggleSelect(c.id)}
                          />
                        )}
                      </TableCell>
                      <TableCell className="font-medium">{c.name || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{c.email}</TableCell>
                      <TableCell className="text-muted-foreground">{c.phone || "—"}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {(c.tags ?? []).map((t) => (
                            <span
                              key={t}
                              className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs text-indigo-700"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleDeleteOne(c.id)}
                          className="size-8 text-red-600 hover:bg-red-50"
                        >
                          <Trash2Icon className="size-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50">
              <UsersIcon className="size-12 text-slate-400 mb-4" />
              <h3 className="text-lg font-semibold text-slate-700 mb-2">אין אנשי קשר</h3>
              <p className="text-center text-muted-foreground max-w-sm mb-4">
                ייבא מ-Gmail או הדבק רשימת אימיילים
              </p>
              <div className="flex gap-2">
                <Button onClick={handleGmailImport} variant="outline" disabled={gmailImportLoading} className="rounded-xl">
                  ייבוא מ-Gmail
                </Button>
                <Button onClick={() => setImportOpen(true)}>ייבוא ידני</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

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
