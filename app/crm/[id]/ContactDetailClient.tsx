"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowRightIcon,
  MailIcon,
  PhoneIcon,
  MessageCircleIcon,
  FileTextIcon,
  DollarSignIcon,
  PencilIcon,
  ChevronDown,
  ChevronUp,
  UserIcon,
  ScrollTextIcon,
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { isLikelyImageFile } from "@/lib/broadcast/imageFile";
import { handleNumericChange } from "@/lib/numericInput";
import {
  updateCrmContact,
  addTransaction,
  addDocument,
  addContactHistoryNote,
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
  certification: string | null;
  phone_type: string | null;
  created_at: string;
  handwriting_image_url: string | null;
};

export type ContactHistoryRow = { id: string; body: string; created_at: string };

export type LedgerPaymentRow = {
  id: string;
  amount: number;
  payment_date: string;
  entity_type: string;
  entity_id: string;
  direction: string;
  method: string | null;
  notes: string | null;
  summary: string;
};

type Props = {
  contact: Contact;
  transactions: Array<{ id: string; amount: number; type: string; description: string | null; date: string }>;
  documents: Array<{ id: string; file_url: string; doc_type: string; name: string | null }>;
  logs: Array<{ id: string; channel: string; content: string | null; timestamp: string }>;
  debtToContact: number;
  debtFromContact: number;
  netMutual: number;
  typeLabel: string;
  ledgerPayments: LedgerPaymentRow[];
  buyerSales: Array<{
    id: string;
    sale_type: string;
    sale_date: string;
    total_price: number;
    total_paid: number;
    label: string;
  }>;
  sellerSales: Array<{
    id: string;
    sale_type: string;
    sale_date: string;
    total_price: number;
    total_paid: number;
    label: string;
  }>;
  investments: Array<{
    id: string;
    item_details: string | null;
    status: string;
    total_agreed_price: number;
    amount_paid: number;
    target_date: string | null;
  }>;
  contactHistory: ContactHistoryRow[];
};

function ledgerEntityTypeHe(t: string): string {
  if (t === "sale") return "מכירה";
  if (t === "investment") return "השקעה";
  return t;
}

/**
 * Builds coloured role badges from both `type` and `tags`.
 * A contact can now carry multiple roles (e.g. Scribe + Merchant), so we union
 * both sources and deduplicate via a Set before emitting badges.
 */
function roleBadges(type: string, tags: string[]) {
  const roles = new Set([type, ...tags]);
  const badges: { key: string; label: string; className: string }[] = [];
  if (roles.has("End_Customer"))
    badges.push({ key: "c", label: "לקוח", className: "bg-emerald-100 text-emerald-900" });
  if (roles.has("Scribe"))
    badges.push({ key: "s", label: "סופר", className: "bg-violet-100 text-violet-900" });
  if (roles.has("Merchant"))
    badges.push({ key: "m", label: "סוחר", className: "bg-amber-100 text-amber-900" });
  if (badges.length === 0)
    badges.push({ key: "o", label: "אחר", className: "bg-slate-100 text-slate-700" });
  return badges;
}

export default function ContactDetailClient({
  contact: initialContact,
  transactions: initialTx,
  documents: initialDocs,
  logs,
  debtToContact,
  debtFromContact,
  netMutual,
  typeLabel,
  ledgerPayments,
  buyerSales,
  sellerSales,
  investments,
  contactHistory: initialHistory,
}: Props) {
  const router = useRouter();
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
  const [editNotes, setEditNotes] = useState(contact.notes ?? "");
  const [editCertification, setEditCertification] = useState(contact.certification ?? "");
  const [editPhoneType, setEditPhoneType] = useState(contact.phone_type ?? "");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [newTxAmount, setNewTxAmount] = useState("");
  const [newTxType, setNewTxType] = useState<"Debt" | "Credit">("Debt");
  const [newTxDesc, setNewTxDesc] = useState("");
  const [txLoading, setTxLoading] = useState(false);
  const [docLoading, setDocLoading] = useState(false);
  const [historyList, setHistoryList] = useState<ContactHistoryRow[]>(initialHistory);
  const [historyNote, setHistoryNote] = useState("");
  const [historyLoading, setHistoryLoading] = useState(false);
  const [hwUploading, setHwUploading] = useState(false);

  useEffect(() => {
    setHistoryList(initialHistory);
  }, [initialHistory]);

  useEffect(() => {
    setContact((prev) => ({
      ...prev,
      handwriting_image_url: initialContact.handwriting_image_url ?? null,
    }));
  }, [initialContact.handwriting_image_url]);

  const badges = roleBadges(contact.type, contact.tags);

  const handleSaveProfile = async () => {
    const res = await updateCrmContact(contact.id, {
      wa_chat_id: editWa.trim() || undefined,
      email: editEmail.trim() || undefined,
      phone: editPhone.trim() || undefined,
      tags: editTags.split(/[,|\s]+/).map((t) => t.trim()).filter(Boolean),
      notes: editNotes.trim() || undefined,
      certification: editCertification.trim() || undefined,
      phone_type: editPhoneType.trim() || undefined,
    });
    if (res.success) {
      setContact((prev) => ({
        ...prev,
        wa_chat_id: editWa.trim() || null,
        email: editEmail.trim() || null,
        phone: editPhone.trim() || null,
        tags: editTags.split(/[,|\s]+/).map((t) => t.trim()).filter(Boolean),
        notes: editNotes.trim() || null,
        certification: editCertification.trim() || null,
        phone_type: editPhoneType.trim() || null,
      }));
      setEditMode(false);
      toast.success("נשמר");
      router.refresh();
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

  const handleHandwritingUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!isLikelyImageFile(file)) {
      toast.error("נא לבחור קובץ תמונה (כולל HEIC)");
      e.target.value = "";
      return;
    }
    setHwUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("contactId", contact.id);
      const uploadRes = await fetch("/api/crm/upload/handwriting", {
        method: "POST",
        body: fd,
      });
      const json = await uploadRes.json();
      if (!uploadRes.ok) {
        toast.error(json.error ?? "שגיאה בהעלאה");
        return;
      }
      setContact((prev) => ({ ...prev, handwriting_image_url: json.url }));
      toast.success("דוגמת הכתב נשמרה");
      router.refresh();
    } catch {
      toast.error("שגיאה בהעלאה");
    } finally {
      setHwUploading(false);
      e.target.value = "";
    }
  };

  const handleClearHandwriting = async () => {
    const res = await updateCrmContact(contact.id, { handwriting_image_url: null });
    if (res.success) {
      setContact((prev) => ({ ...prev, handwriting_image_url: null }));
      toast.success("הוסרה דוגמת הכתב");
      router.refresh();
    } else toast.error(res.error);
  };

  const handleAddHistoryNote = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const text = historyNote.trim();
    if (!text) {
      toast.error("הזן תוכן");
      return;
    }
    setHistoryLoading(true);
    const res = await addContactHistoryNote(contact.id, text);
    setHistoryLoading(false);
    if (res.success) {
      setHistoryList((prev) => [
        { id: crypto.randomUUID(), body: text, created_at: new Date().toISOString() },
        ...prev,
      ]);
      setHistoryNote("");
      toast.success("נוספה הערה ליומן");
      router.refresh();
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
      const uploadJson = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(uploadJson.error ?? "העלאה נכשלה");
      const { url } = uploadJson;
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

  const invStatusHe = (s: string) =>
    s === "active"
      ? "פעיל"
      : s === "completed"
        ? "הושלם"
        : s === "delivered_to_inventory"
          ? "נמסר למלאי"
          : s === "cancelled"
            ? "בוטל"
            : s;

  return (
    <div className="w-full max-w-6xl mx-auto px-4 py-6 sm:py-8 min-w-0">
      <Link
        href="/crm"
        className="inline-flex items-center gap-1 text-sm text-teal-600 hover:text-teal-700 mb-6"
      >
        <ArrowRightIcon className="size-4" />
        חזרה לרשימה
      </Link>

      <Card className="border-teal-100 mb-6">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-2 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <UserIcon className="size-6 text-teal-700 shrink-0" />
              <h1 className="text-2xl font-bold truncate">{contact.name}</h1>
              {badges.map((b) => (
                <span key={b.key} className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${b.className}`}>
                  {b.label}
                </span>
              ))}
              <span className="rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-medium text-teal-800 border border-teal-100">
                {typeLabel}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              מועדף: {contact.preferred_contact} · מזהה: {contact.id.slice(0, 8)}…
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {contact.phone && (
                <span className="inline-flex items-center gap-1">
                  <PhoneIcon className="size-4" /> {contact.phone}
                </span>
              )}
              {contact.email && (
                <span className="inline-flex items-center gap-1">
                  <MailIcon className="size-4" /> {contact.email}
                </span>
              )}
              {contact.wa_chat_id && (
                <span className="inline-flex items-center gap-1">
                  <MessageCircleIcon className="size-4" /> {contact.wa_chat_id}
                </span>
              )}
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => (editMode ? handleSaveProfile() : setEditMode(true))}>
            <PencilIcon className="size-4 ml-1" />
            {editMode ? "שמור" : "ערוך פרופיל"}
          </Button>
        </CardHeader>
        {!editMode && (
          <CardContent className="border-t pt-4 space-y-2">
            {contact.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {contact.tags.map((t) => (
                  <span key={t} className="rounded-full bg-teal-100 px-2 py-0.5 text-xs">
                    {t}
                  </span>
                ))}
              </div>
            )}
            <Collapsible>
              <CollapsibleTrigger className="flex w-full items-center justify-between text-sm font-medium text-slate-600">
                פרטים מתקדמים
                <ChevronDown className="size-4" />
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2 space-y-1 text-sm text-muted-foreground">
                {contact.certification && <p>תעודה: {contact.certification}</p>}
                {contact.phone_type && <p>סוג טלפון: {contact.phone_type}</p>}
                {contact.notes && <p>הערות: {contact.notes}</p>}
                {!contact.certification && !contact.phone_type && !contact.notes && <p>אין נתונים נוספים</p>}
              </CollapsibleContent>
            </Collapsible>
          </CardContent>
        )}
        {editMode && (
          <CardContent className="border-t pt-4 space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">WA Chat ID</label>
                <Input value={editWa} onChange={(e) => setEditWa(e.target.value)} className="rounded-lg mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">אימייל</label>
                <Input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} className="rounded-lg mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">טלפון</label>
                <Input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} className="rounded-lg mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">תגיות</label>
                <Input value={editTags} onChange={(e) => setEditTags(e.target.value)} className="rounded-lg mt-1" />
              </div>
            </div>
            <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
              <CollapsibleTrigger className="flex w-full items-center justify-between text-sm font-medium text-slate-600">
                הגדרות מתקדמות
                {advancedOpen ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-3 space-y-2">
                <Input value={editCertification} onChange={(e) => setEditCertification(e.target.value)} placeholder="תעודה" className="rounded-lg" />
                <Input value={editPhoneType} onChange={(e) => setEditPhoneType(e.target.value)} placeholder="סוג טלפון" className="rounded-lg" />
                <Input value={editNotes} onChange={(e) => setEditNotes(e.target.value)} placeholder="הערות" className="rounded-lg" />
              </CollapsibleContent>
            </Collapsible>
          </CardContent>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2 mb-6">
        <Card className="border-teal-100">
          <CardHeader>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <DollarSignIcon className="size-5 text-teal-700" />
              תזרים ומאזן
            </h2>
            <p className="text-sm text-muted-foreground">
              סיכום כספי לפי מכירות, השקעות ומלאי מקושר לאיש קשר זה (מפורט בטאב &quot;יתרות וספר תשלומים&quot;).
            </p>
          </CardHeader>
          <CardContent className="grid sm:grid-cols-3 gap-3">
            <div className="rounded-lg bg-amber-50 border border-amber-100 p-3">
              <p className="text-xs text-amber-900/80">אנחנו חייבים לו</p>
              <p className="text-lg font-bold text-amber-800">₪{debtToContact.toLocaleString("he-IL")}</p>
            </div>
            <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-3">
              <p className="text-xs text-emerald-900/80">הוא חייב לנו</p>
              <p className="text-lg font-bold text-emerald-800">₪{debtFromContact.toLocaleString("he-IL")}</p>
            </div>
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 sm:col-span-1">
              <p className="text-xs text-slate-600">מאזן נטו</p>
              <p className={`text-lg font-bold ${netMutual >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                ₪{netMutual.toLocaleString("he-IL")}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-teal-100">
          <CardHeader>
            <h2 className="text-lg font-semibold">דוגמת כתב</h2>
            <p className="text-sm text-muted-foreground">נשמר ב-bucket media ומקושר לאיש הקשר</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {contact.handwriting_image_url ? (
              <div className="space-y-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={contact.handwriting_image_url}
                  alt="דוגמת כתב"
                  className="max-h-56 w-auto max-w-full rounded-lg border object-contain bg-white"
                />
                <div className="flex flex-wrap gap-2">
                  <label className="inline-flex h-9 cursor-pointer items-center rounded-lg border border-input bg-background px-3 text-sm font-medium hover:bg-accent">
                    החלף תמונה
                    <input
                      type="file"
                      className="hidden"
                      accept="image/*,.heic,.heif"
                      onChange={handleHandwritingUpload}
                      disabled={hwUploading}
                    />
                  </label>
                  <Button type="button" variant="outline" size="sm" onClick={() => void handleClearHandwriting()}>
                    הסר
                  </Button>
                </div>
              </div>
            ) : (
              <label className="flex min-h-[120px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50 px-4 py-6 hover:border-teal-200">
                <span className="text-sm text-muted-foreground mb-1">
                  {hwUploading ? "מעלה..." : "לחץ לבחירת תמונה או HEIC"}
                </span>
                <input
                  type="file"
                  className="hidden"
                  accept="image/*,.heic,.heif"
                  onChange={handleHandwritingUpload}
                  disabled={hwUploading}
                />
              </label>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-teal-100 mb-6">
        <CardHeader>
          <h2 className="text-lg font-semibold">יומן התקשרות</h2>
          <p className="text-sm text-muted-foreground">הערות עם חותמת זמן (נפרד מיומן המערכת האוטומטי)</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleAddHistoryNote} className="flex flex-col sm:flex-row gap-2">
            <Input
              value={historyNote}
              onChange={(e) => setHistoryNote(e.target.value)}
              placeholder="תיעוד שיחה, סיכום, משימה הבאה..."
              className="rounded-lg flex-1"
            />
            <Button type="submit" disabled={historyLoading} size="sm" className="shrink-0">
              {historyLoading ? "שומר..." : "הוסף הערה"}
            </Button>
          </form>
          <div className="max-h-64 overflow-y-auto space-y-3 border rounded-lg p-3 bg-slate-50/30">
            {historyList.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">אין הערות ביומן</p>
            ) : (
              historyList.map((h) => (
                <div key={h.id} className="border-b border-slate-100 pb-3 last:border-0 text-sm">
                  <p className="text-xs text-muted-foreground mb-1">
                    {new Date(h.created_at).toLocaleString("he-IL")}
                  </p>
                  <p className="whitespace-pre-wrap">{h.body}</p>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="ledger" className="w-full">
        <TabsList className="mb-4 flex flex-wrap h-auto gap-1 bg-slate-100 p-1 rounded-xl">
          <TabsTrigger value="ledger" className="rounded-lg data-[state=active]:bg-white">
            <DollarSignIcon className="size-4 ml-1" />
            יתרות וספר תשלומים
          </TabsTrigger>
          <TabsTrigger value="transactions" className="rounded-lg data-[state=active]:bg-white">
            <ScrollTextIcon className="size-4 ml-1" />
            היסטוריית עסקאות
          </TabsTrigger>
          <TabsTrigger value="notes" className="rounded-lg data-[state=active]:bg-white">
            <FileTextIcon className="size-4 ml-1" />
            הערות ויומן
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ledger" className="space-y-4">
          <Card className="border-teal-100">
            <CardHeader>
              <h2 className="text-lg font-semibold">יתרה הדדית (ERP)</h2>
              <p className="text-sm text-muted-foreground">
                חוב שלנו אליו (מלאי/השקעות פעילות) מול חוב שלו אלינו (מכירות כקונה). נטו חיובי = הוא חייב לנו יותר ממה שאנחנו חייבים לו.
              </p>
            </CardHeader>
            <CardContent className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="rounded-xl bg-amber-50 border border-amber-100 p-4">
                <p className="text-xs text-amber-900/80 font-medium">אנחנו חייבים לו</p>
                <p className="text-2xl font-bold text-amber-800">₪{debtToContact.toLocaleString("he-IL")}</p>
                <p className="text-xs text-muted-foreground mt-1">מלאי (סופר) + פרויקטים פעילים</p>
              </div>
              <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-4">
                <p className="text-xs text-emerald-900/80 font-medium">הוא חייב לנו</p>
                <p className="text-2xl font-bold text-emerald-800">₪{debtFromContact.toLocaleString("he-IL")}</p>
                <p className="text-xs text-muted-foreground mt-1">מכירות כקונה</p>
              </div>
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 sm:col-span-2 lg:col-span-2">
                <p className="text-xs text-slate-600 font-medium">יתרה נטו (חיובי = לטובתנו)</p>
                <p className={`text-2xl font-bold ${netMutual >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                  ₪{netMutual.toLocaleString("he-IL")}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-teal-100">
            <CardHeader>
              <h3 className="font-semibold">ספר תשלומים (מכירות והשקעות מקושרות)</h3>
            </CardHeader>
            <CardContent>
              {ledgerPayments.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">אין תשלומים במערכת עבור איש קשר זה</p>
              ) : (
                <div className="rounded-lg border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40">
                        <TableHead>תאריך</TableHead>
                        <TableHead>סוג ישות</TableHead>
                        <TableHead>כיוון</TableHead>
                        <TableHead>סכום</TableHead>
                        <TableHead>אמצעי תשלום</TableHead>
                        <TableHead>הערות</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ledgerPayments.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="whitespace-nowrap">
                            {p.payment_date ? new Date(p.payment_date).toLocaleString("he-IL") : "—"}
                          </TableCell>
                          <TableCell className="text-sm max-w-[200px]">
                            <span className="text-xs text-muted-foreground">{ledgerEntityTypeHe(p.entity_type)}</span>
                            <br />
                            {p.summary}
                          </TableCell>
                          <TableCell>{p.direction === "outgoing" ? "יוצא" : "נכנס"}</TableCell>
                          <TableCell className="font-medium">₪{p.amount.toLocaleString("he-IL")}</TableCell>
                          <TableCell>{p.method ?? "—"}</TableCell>
                          <TableCell className="text-sm text-muted-foreground max-w-[180px] truncate">{p.notes ?? "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-teal-100">
            <CardHeader>
              <h3 className="font-semibold">כרטסת ידנית (חוב/זכות)</h3>
            </CardHeader>
            <CardContent className="grid sm:grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1">חוב (מגיע לי) – רשומות ישנות</p>
                <p className="text-lg font-bold text-red-600">₪{totalOwed.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">זכות (מגיע לו)</p>
                <p className="text-lg font-bold text-green-600">₪{totalDue.toFixed(2)}</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="transactions" className="space-y-6">
          <Card className="border-teal-100">
            <CardHeader>
              <h3 className="font-semibold">מכירות כקונה</h3>
            </CardHeader>
            <CardContent>
              {buyerSales.length === 0 ? (
                <p className="text-sm text-muted-foreground">אין מכירות</p>
              ) : (
                <div className="rounded-lg border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>תאריך</TableHead>
                        <TableHead>סוג</TableHead>
                        <TableHead>פריט</TableHead>
                        <TableHead>סה״כ</TableHead>
                        <TableHead>שולם</TableHead>
                        <TableHead>יתרה</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {buyerSales.map((s) => (
                        <TableRow key={s.id}>
                          <TableCell>{new Date(s.sale_date).toLocaleDateString("he-IL")}</TableCell>
                          <TableCell>{s.sale_type}</TableCell>
                          <TableCell className="max-w-[200px] truncate">{s.label}</TableCell>
                          <TableCell>₪{s.total_price.toLocaleString("he-IL")}</TableCell>
                          <TableCell>₪{s.total_paid.toLocaleString("he-IL")}</TableCell>
                          <TableCell>₪{Math.max(0, s.total_price - s.total_paid).toLocaleString("he-IL")}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-teal-100">
            <CardHeader>
              <h3 className="font-semibold">מכירות כבעלים / תיווך</h3>
            </CardHeader>
            <CardContent>
              {sellerSales.length === 0 ? (
                <p className="text-sm text-muted-foreground">אין רשומות</p>
              ) : (
                <div className="rounded-lg border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>תאריך</TableHead>
                        <TableHead>סוג</TableHead>
                        <TableHead>פריט</TableHead>
                        <TableHead>סה״כ</TableHead>
                        <TableHead>שולם</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sellerSales.map((s) => (
                        <TableRow key={s.id}>
                          <TableCell>{new Date(s.sale_date).toLocaleDateString("he-IL")}</TableCell>
                          <TableCell>{s.sale_type}</TableCell>
                          <TableCell className="max-w-[200px] truncate">{s.label}</TableCell>
                          <TableCell>₪{s.total_price.toLocaleString("he-IL")}</TableCell>
                          <TableCell>₪{s.total_paid.toLocaleString("he-IL")}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-teal-100">
            <CardHeader>
              <h3 className="font-semibold">פרויקטי כתיבה (השקעות)</h3>
            </CardHeader>
            <CardContent>
              {investments.length === 0 ? (
                <p className="text-sm text-muted-foreground">אין השקעות כסופר</p>
              ) : (
                <div className="rounded-lg border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>פרטים</TableHead>
                        <TableHead>סטטוס</TableHead>
                        <TableHead>הסכם</TableHead>
                        <TableHead>שולם</TableHead>
                        <TableHead>יתרה</TableHead>
                        <TableHead>יעד</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {investments.map((i) => (
                        <TableRow key={i.id}>
                          <TableCell className="max-w-[200px] truncate">{i.item_details ?? "—"}</TableCell>
                          <TableCell>{invStatusHe(i.status)}</TableCell>
                          <TableCell>₪{i.total_agreed_price.toLocaleString("he-IL")}</TableCell>
                          <TableCell>₪{i.amount_paid.toLocaleString("he-IL")}</TableCell>
                          <TableCell>
                            ₪{Math.max(0, i.total_agreed_price - i.amount_paid).toLocaleString("he-IL")}
                          </TableCell>
                          <TableCell>
                            {i.target_date ? new Date(i.target_date).toLocaleDateString("he-IL") : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notes" className="space-y-6">
          <Card className="border-teal-100">
            <CardHeader>
              <h3 className="font-semibold">הערות ותקשורת</h3>
            </CardHeader>
            <CardContent className="space-y-4">
              <form onSubmit={handleAddTransaction} className="flex gap-2 flex-wrap items-end">
                <div>
                  <label className="text-xs text-muted-foreground">סכום ידני</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={newTxAmount}
                    onChange={handleNumericChange(setNewTxAmount)}
                    className="w-28 rounded-lg mt-1"
                  />
                </div>
                <select
                  value={newTxType}
                  onChange={(e) => setNewTxType(e.target.value as "Debt" | "Credit")}
                  className="rounded-lg border px-3 py-2 h-10"
                >
                  <option value="Debt">חוב</option>
                  <option value="Credit">זכות</option>
                </select>
                <Input
                  placeholder="תיאור"
                  value={newTxDesc}
                  onChange={(e) => setNewTxDesc(e.target.value)}
                  className="flex-1 min-w-[120px] rounded-lg"
                />
                <Button type="submit" disabled={txLoading} size="sm">
                  הוסף
                </Button>
              </form>
              <div className="max-h-40 overflow-y-auto space-y-2 border rounded-lg p-2">
                {transactions.map((t) => (
                  <div key={t.id} className="flex justify-between text-sm border-b border-slate-100 pb-2 last:border-0">
                    <span>{t.description || "—"}</span>
                    <span className={t.type === "Debt" ? "text-red-600" : "text-green-600"}>
                      {t.type === "Debt" ? "+" : "-"}₪{t.amount.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
              <div>
                <h4 className="text-sm font-semibold mb-2">יומן תקשורת</h4>
                <div className="max-h-48 overflow-y-auto space-y-2 text-sm">
                  {logs.length === 0 ? (
                    <p className="text-muted-foreground">אין רשומות</p>
                  ) : (
                    logs.map((l) => (
                      <div key={l.id} className="border-b border-slate-100 pb-2">
                        <span className="text-muted-foreground">{l.channel}</span> ·{" "}
                        {new Date(l.timestamp).toLocaleString("he-IL")}
                        <p className="mt-1">{(l.content ?? "").slice(0, 200)}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-teal-100">
            <CardHeader>
              <h3 className="font-semibold">מסמכים</h3>
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
              <ul className="mt-3 space-y-1">
                {documents.map((d) => (
                  <li key={d.id}>
                    <a
                      href={d.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-teal-600 hover:underline truncate block"
                    >
                      {d.name || d.doc_type}
                    </a>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
