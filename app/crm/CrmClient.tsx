"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  fetchCrmContacts,
  importGmailContacts,
  createCrmContact,
  type CrmContact,
} from "./actions";
import {
  UsersIcon,
  DownloadIcon,
  PlusIcon,
  SearchIcon,
  MailIcon,
  PhoneIcon,
} from "lucide-react";

type Props = {
  initialContacts: CrmContact[];
  gmailConnected: boolean;
};

export default function CrmClient({
  initialContacts,
  gmailConnected,
}: Props) {
  const [contacts, setContacts] = useState(initialContacts);
  const [search, setSearch] = useState("");
  const [importLoading, setImportLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [createLoading, setCreateLoading] = useState(false);

  const filtered = contacts.filter(
    (c) =>
      !search ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.email ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (c.phone ?? "").includes(search) ||
      (c.tags ?? []).some((t) => t.toLowerCase().includes(search.toLowerCase()))
  );

  const handleImportGmail = async () => {
    setImportLoading(true);
    const res = await importGmailContacts();
    setImportLoading(false);
    if (res.success) {
      toast.success(`יובאו ${res.imported} אנשי קשר מ-Gmail`);
      const refreshed = await fetchCrmContacts();
      if (refreshed.success) setContacts(refreshed.contacts);
    } else {
      toast.error(res.error);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) {
      toast.error("הזן שם");
      return;
    }
    setCreateLoading(true);
    const res = await createCrmContact({
      name: newName.trim(),
      email: newEmail.trim() || undefined,
      phone: newPhone.trim() || undefined,
    });
    setCreateLoading(false);
    if (res.success) {
      toast.success("איש הקשר נוצר");
      setCreateOpen(false);
      setNewName("");
      setNewEmail("");
      setNewPhone("");
      const refreshed = await fetchCrmContacts();
      if (refreshed.success) setContacts(refreshed.contacts);
    } else {
      toast.error(res.error);
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto px-4 py-6 sm:py-8 min-w-0 overflow-x-hidden">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-3xl sm:text-4xl font-bold text-teal-800 mb-2">CRM – אנשי קשר</h1>
        <p className="text-muted-foreground">
          כרטסת לקוח חכמה – ניהול אנשי קשר, עסקאות ומסמכים
        </p>
      </div>

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 min-w-0 max-w-sm">
          <SearchIcon className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="חיפוש..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pr-10 rounded-xl"
          />
        </div>
        <div className="flex gap-2">
          {gmailConnected && (
            <Button
              variant="outline"
              onClick={handleImportGmail}
              disabled={importLoading}
              className="rounded-xl"
            >
              <DownloadIcon className="size-4 ml-2" />
              ייבוא מ-Gmail
            </Button>
          )}
          <Button
            onClick={() => setCreateOpen(true)}
            className="rounded-xl bg-teal-600 hover:bg-teal-700"
          >
            <PlusIcon className="size-4 ml-2" />
            איש קשר חדש
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map((c) => (
          <Link key={c.id} href={`/crm/${c.id}`}>
            <Card className="border-teal-100 hover:border-teal-200 hover:shadow-md transition-all cursor-pointer h-full">
              <CardHeader className="pb-2">
                <p className="font-semibold truncate">{c.name}</p>
                <p className="text-xs text-muted-foreground">{c.type}</p>
              </CardHeader>
              <CardContent className="pt-0 space-y-1">
                {c.email && (
                  <p className="flex items-center gap-1 text-xs truncate">
                    <MailIcon className="size-3 shrink-0" />
                    {c.email}
                  </p>
                )}
                {c.phone && (
                  <p className="flex items-center gap-1 text-xs truncate">
                    <PhoneIcon className="size-3 shrink-0" />
                    {c.phone}
                  </p>
                )}
                {(c.tags ?? []).length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {(c.tags ?? []).slice(0, 3).map((t) => (
                      <span
                        key={t}
                        className="rounded-full bg-teal-100 px-2 py-0.5 text-xs text-teal-700"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50">
          <UsersIcon className="size-16 text-teal-600 mb-4" />
          <h3 className="text-lg font-semibold text-slate-700 mb-2">אין אנשי קשר</h3>
          <p className="text-center text-muted-foreground max-w-sm mb-6">
            {gmailConnected
              ? "ייבא מ-Gmail או צור איש קשר חדש"
              : "חבר Gmail בהגדרות לייבוא, או צור איש קשר חדש"}
          </p>
          <div className="flex gap-2">
            {gmailConnected && (
              <Button variant="outline" onClick={handleImportGmail} disabled={importLoading}>
                ייבוא מ-Gmail
              </Button>
            )}
            <Button onClick={() => setCreateOpen(true)}>איש קשר חדש</Button>
          </div>
        </div>
      )}

      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-md rounded-2xl">
            <CardHeader className="flex flex-row items-center justify-between">
              <h3 className="text-lg font-semibold">איש קשר חדש</h3>
              <Button variant="ghost" size="icon" onClick={() => setCreateOpen(false)}>
                ×
              </Button>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium">שם *</label>
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="שם מלא"
                    className="rounded-xl"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">אימייל</label>
                  <Input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="email@example.com"
                    className="rounded-xl"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">טלפון</label>
                  <Input
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    placeholder="050-1234567"
                    className="rounded-xl"
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                    ביטול
                  </Button>
                  <Button type="submit" disabled={createLoading}>
                    {createLoading ? "יוצר..." : "צור"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
