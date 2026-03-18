"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  ArrowRightIcon,
  MailIcon,
  PhoneIcon,
  MessageCircleIcon,
  FileTextIcon,
  DollarSignIcon,
  PencilIcon,
} from "lucide-react";
import {
  updateCrmContact,
  addTransaction,
  addDocument,
} from "../actions";

type Contact = {
  id: string;
  name: string;
  type: string;
  preferred_contact: string;
  wa_chat_id: string | null;
  email: string | null;
  phone: string | null;
  tags: string[];
  notes: string | null;
  created_at: string;
};

type Props = {
  contact: Contact;
  transactions: Array<{ id: string; amount: number; type: string; description: string | null; date: string }>;
  documents: Array<{ id: string; file_url: string; doc_type: string; name: string | null }>;
  logs: Array<{ id: string; channel: string; content: string | null; timestamp: string }>;
  debtToContact?: number;
  debtFromContact?: number;
  typeLabel?: string;
};

export default function ContactDetailClient({
  contact: initialContact,
  transactions: initialTx,
  documents: initialDocs,
  logs,
  debtToContact = 0,
  debtFromContact = 0,
  typeLabel = "אחר",
}: Props) {
  const [contact, setContact] = useState(initialContact);
  const [transactions, setTransactions] = useState(initialTx);
  const [documents, setDocuments] = useState(initialDocs);

  const totalOwed = transactions.filter((t) => t.type === "Debt").reduce((s, t) => s + t.amount, 0);
  const totalDue = transactions.filter((t) => t.type === "Credit").reduce((s, t) => s + t.amount, 0);
  const [editMode, setEditMode] = useState(false);
  const [editWa, setEditWa] = useState(contact.wa_chat_id ?? "");
  const [editEmail, setEditEmail] = useState(contact.email ?? "");
  const [editPhone, setEditPhone] = useState(contact.phone ?? "");
  const [editTags, setEditTags] = useState(initialContact.tags.join(", "));
  const [newTxAmount, setNewTxAmount] = useState("");
  const [newTxType, setNewTxType] = useState<"Debt" | "Credit">("Debt");
  const [newTxDesc, setNewTxDesc] = useState("");
  const [txLoading, setTxLoading] = useState(false);
  const [docLoading, setDocLoading] = useState(false);

  const handleSaveProfile = async () => {
    const res = await updateCrmContact(contact.id, {
      wa_chat_id: editWa.trim() || undefined,
      email: editEmail.trim() || undefined,
      phone: editPhone.trim() || undefined,
      tags: editTags.split(/[,|\s]+/).map((t) => t.trim()).filter(Boolean),
    });
    if (res.success) {
      setContact((prev) => ({
        ...prev,
        wa_chat_id: editWa.trim() || null,
        email: editEmail.trim() || null,
        phone: editPhone.trim() || null,
        tags: editTags.split(/[,|\s]+/).map((t) => t.trim()).filter(Boolean),
      }));
      setEditMode(false);
      toast.success("נשמר");
    } else toast.error(res.error);
  };

  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(newTxAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("הזן סכום תקין");
      return;
    }
    setTxLoading(true);
    const res = await addTransaction(contact.id, amount, newTxType, newTxDesc);
    setTxLoading(false);
    if (res.success) {
      setTransactions((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          amount,
          type: newTxType,
          description: newTxDesc || null,
          date: new Date().toISOString().slice(0, 10),
        },
      ]);
      setNewTxAmount("");
      setNewTxDesc("");
      toast.success("העסקה נוספה");
    } else toast.error(res.error);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setDocLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const uploadRes = await fetch("/api/crm/upload", {
        method: "POST",
        body: formData,
      });
      if (!uploadRes.ok) throw new Error("העלאה נכשלה");
      const { url } = await uploadRes.json();
      const res = await addDocument(contact.id, url, "Script_Sample", file.name);
      if (res.success) {
        setDocuments((prev) => [...prev, { id: crypto.randomUUID(), file_url: url, doc_type: "Script_Sample", name: file.name }]);
        toast.success("המסמך הועלה");
      } else toast.error(res.error);
    } catch {
      toast.error("שגיאה בהעלאה");
    } finally {
      setDocLoading(false);
      e.target.value = "";
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-6 sm:py-8 min-w-0">
      <Link
        href="/crm"
        className="inline-flex items-center gap-1 text-sm text-teal-600 hover:text-teal-700 mb-6"
      >
        <ArrowRightIcon className="size-4" />
        חזרה לרשימה
      </Link>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border-teal-100">
          <CardHeader className="flex flex-row items-center justify-between">
            <h2 className="text-xl font-bold">כרטסת לקוח חכמה</h2>
            <Button
              variant="outline"
              size="sm"
              onClick={() => (editMode ? handleSaveProfile() : setEditMode(true))}
            >
              <PencilIcon className="size-4 ml-1" />
              {editMode ? "שמור" : "ערוך"}
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-2xl font-semibold">{contact.name}</p>
                <span className="rounded-full bg-teal-100 px-2.5 py-0.5 text-xs font-medium text-teal-800">
                  {typeLabel}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">מזהה: {contact.id.slice(0, 8)}...</p>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-600">חיבור חשבונות</p>
              {editMode ? (
                <>
                  <div>
                    <label className="text-xs text-muted-foreground">WA Chat ID</label>
                    <Input
                      value={editWa}
                      onChange={(e) => setEditWa(e.target.value)}
                      placeholder="1234567890@g.us"
                      className="rounded-lg mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">אימייל</label>
                    <Input
                      type="email"
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                      className="rounded-lg mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">טלפון</label>
                    <Input
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                      className="rounded-lg mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">תגיות</label>
                    <Input
                      value={editTags}
                      onChange={(e) => setEditTags(e.target.value)}
                      placeholder="תגית1, תגית2"
                      className="rounded-lg mt-1"
                    />
                  </div>
                </>
              ) : (
                <div className="space-y-1">
                  {contact.wa_chat_id && (
                    <p className="flex items-center gap-2 text-sm">
                      <MessageCircleIcon className="size-4" />
                      {contact.wa_chat_id}
                    </p>
                  )}
                  {contact.email && (
                    <p className="flex items-center gap-2 text-sm">
                      <MailIcon className="size-4" />
                      {contact.email}
                    </p>
                  )}
                  {contact.phone && (
                    <p className="flex items-center gap-2 text-sm">
                      <PhoneIcon className="size-4" />
                      {contact.phone}
                    </p>
                  )}
                  {contact.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {contact.tags.map((t) => (
                        <span key={t} className="rounded-full bg-teal-100 px-2 py-0.5 text-xs">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="rounded-lg bg-slate-50 p-4 space-y-3">
              <p className="text-sm font-semibold text-slate-700">סיכום פיננסי</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">חוב שלי אליו</p>
                  <p className="text-lg font-bold text-amber-600">₪{debtToContact.toLocaleString("he-IL")}</p>
                  <p className="text-xs text-muted-foreground">מלאי + השקעות</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">חוב שלו אליי</p>
                  <p className="text-lg font-bold text-emerald-600">₪{debtFromContact.toLocaleString("he-IL")}</p>
                  <p className="text-xs text-muted-foreground">מכירות</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">חוב (מגיע לי) – עסקאות</p>
                  <p className="text-lg font-bold text-red-600">₪{totalOwed.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">זכות (מגיע לו) – עסקאות</p>
                  <p className="text-lg font-bold text-green-600">₪{totalDue.toFixed(2)}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="border-teal-100">
            <CardHeader>
              <h3 className="font-semibold flex items-center gap-2">
                <DollarSignIcon className="size-4" />
                עסקאות
              </h3>
            </CardHeader>
            <CardContent className="space-y-4">
              <form onSubmit={handleAddTransaction} className="flex gap-2 flex-wrap">
                <Input
                  type="number"
                  step="0.01"
                  placeholder="סכום"
                  value={newTxAmount}
                  onChange={(e) => setNewTxAmount(e.target.value)}
                  className="w-24 rounded-lg"
                />
                <select
                  value={newTxType}
                  onChange={(e) => setNewTxType(e.target.value as "Debt" | "Credit")}
                  className="rounded-lg border px-3 py-2"
                >
                  <option value="Debt">חוב</option>
                  <option value="Credit">זכות</option>
                </select>
                <Input
                  placeholder="תיאור"
                  value={newTxDesc}
                  onChange={(e) => setNewTxDesc(e.target.value)}
                  className="flex-1 min-w-0 rounded-lg"
                />
                <Button type="submit" disabled={txLoading} size="sm">
                  הוסף
                </Button>
              </form>
              <div className="max-h-48 overflow-y-auto space-y-2">
                {transactions.map((t) => (
                  <div
                    key={t.id}
                    className="flex justify-between items-center py-2 border-b border-slate-100 last:border-0"
                  >
                    <span className="text-sm">{t.description || "—"}</span>
                    <span className={t.type === "Debt" ? "text-red-600" : "text-green-600"}>
                      {t.type === "Debt" ? "+" : "-"}₪{t.amount.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-teal-100">
            <CardHeader>
              <h3 className="font-semibold flex items-center gap-2">
                <FileTextIcon className="size-4" />
                מסמכים
              </h3>
            </CardHeader>
            <CardContent>
              <label className="inline-block">
                <span className="inline-flex h-9 items-center justify-center rounded-lg border border-input bg-background px-4 text-sm font-medium hover:bg-accent cursor-pointer">
                  העלה קובץ
                </span>
                <input
                  type="file"
                  className="hidden"
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                  onChange={handleFileUpload}
                  disabled={docLoading}
                />
              </label>
              <div className="mt-3 space-y-2">
                {documents.map((d) => (
                  <a
                    key={d.id}
                    href={d.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-sm text-teal-600 hover:underline truncate"
                  >
                    {d.name || d.doc_type}
                  </a>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-teal-100">
            <CardHeader>
              <h3 className="font-semibold">היסטוריית תקשורת</h3>
            </CardHeader>
            <CardContent>
              <div className="max-h-32 overflow-y-auto space-y-2">
                {logs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">אין רשומות</p>
                ) : (
                  logs.map((l) => (
                    <div key={l.id} className="text-sm border-b border-slate-100 pb-2 last:border-0">
                      <span className="text-muted-foreground">{l.channel}</span> –{" "}
                      {(l.content ?? "").slice(0, 80)}
                      {l.content && l.content.length > 80 ? "…" : ""}
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
