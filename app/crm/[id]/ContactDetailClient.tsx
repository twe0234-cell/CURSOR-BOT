"use client";

import { useEffect, useMemo, useState } from "react";
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
  SendIcon,
  PlusCircleIcon,
} from "lucide-react";
import { isDealDelivered } from "@/src/services/crm.logic";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { CrmContactHistoryEntry } from "@/src/lib/types/crm";
import {
  updateCrmContact,
  addDocument,
  addHistoryEntry,
  upsertSoferProfile,
  mergeCrmContacts,
  fetchCrmContacts,
} from "../actions";
import { updateCrmExtraContacts } from "../galleryActions";
import { addCrmContactToEmailList } from "@/app/email/actions";
import ExtraContactsEditor from "@/components/crm/ExtraContactsEditor";
import { CommunityCreatableSelect } from "@/components/crm/CommunityCreatableSelect";
import { ContactSysEventsBlock } from "@/components/crm/ContactSysEventsBlock";
import ScribeGallery from "@/components/crm/ScribeGallery";
import { StarRating } from "@/components/ui/StarRating";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { SysEvent } from "@/src/lib/types/sys-events";

const PREFERRED_CONTACT_LABELS: Record<string, string> = {
  WhatsApp: "וואטסאפ",
  Email: "אימייל",
  Phone: "טלפון",
};

const PREFERRED_METHOD_OPTIONS = [
  { value: "whatsapp" as const, label: "וואטסאפ" },
  { value: "email" as const, label: "אימייל" },
  { value: "phone" as const, label: "טלפון" },
];

type PreferredMethod = (typeof PREFERRED_METHOD_OPTIONS)[number]["value"];

function preferredMethodFromContact(c: {
  preferred_contact_method: string | null;
  preferred_contact: string;
}): PreferredMethod {
  const m = c.preferred_contact_method;
  if (m === "whatsapp" || m === "email" || m === "phone") return m;
  const legacy = c.preferred_contact;
  if (legacy === "Email") return "email";
  if (legacy === "Phone") return "phone";
  return "whatsapp";
}

function contactPreferredLabel(c: {
  preferred_contact_method: string | null;
  preferred_contact: string;
}): string {
  if (c.preferred_contact_method === "whatsapp") return "וואטסאפ";
  if (c.preferred_contact_method === "email") return "אימייל";
  if (c.preferred_contact_method === "phone") return "טלפון";
  return PREFERRED_CONTACT_LABELS[c.preferred_contact] ?? c.preferred_contact;
}

type Contact = {
  id: string;
  name: string;
  type: string;
  preferred_contact: string;
  preferred_contact_method: string | null;
  wa_chat_id: string | null;
  email: string | null;
  phone: string | null;
  tags: string[];
  notes: string | null;
  certification: string | null;
  phone_type: string | null;
  created_at: string;
  handwriting_image_url: string | null;
  city?: string | null;
  address?: string | null;
  address_city?: string | null;
  address_physical?: string | null;
  community?: string | null;
  extra_phones?: { label: string; value: string }[];
  extra_emails?: { label: string; value: string }[];
};

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

type SoferProfile = {
  writing_style: string | null;
  writing_level: string | null;
  handwriting_quality: number | null;
  daily_page_capacity: number | null;
  pricing_notes: string | null;
  writing_constraints: string | null;
  past_writings: string | null;
  community: string | null;
  sample_image_url: string | null;
} | null;

type Props = {
  contact: Contact;
  soferProfile: SoferProfile;
  transactions: Array<{ id: string; amount: number; type: string; description: string | null; date: string }>;
  documents: Array<{ id: string; file_url: string; doc_type: string; name: string | null }>;
  logs: Array<{ id: string; channel: string; content: string | null; timestamp: string; direction: string | null }>;
  contactHistory: CrmContactHistoryEntry[];
  debtToContact: number;
  debtFromContact: number;
  futureCommitment: number;
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
  sysEvents: SysEvent[];
};

type LegacyCommLog = {
  id: string;
  channel: string;
  content: string | null;
  timestamp: string;
  direction: string | null;
};

function HistoryTimelineBubble({ row }: { row: CrmContactHistoryEntry }) {
  const subject =
    typeof row.metadata?.subject === "string" ? row.metadata.subject : null;
  const isWa = row.source === "whatsapp";
  const isGmail = row.source === "gmail";
  const isManual = row.source === "manual";
  const isSystem = row.source === "system";
  const incoming = row.direction === "in";
  const outgoing = row.direction === "out";

  let align = "self-center max-w-[92%]";
  let boxClass =
    "rounded-xl border bg-slate-100 text-slate-800 border-slate-200";

  if (isWa) {
    if (incoming) {
      align = "self-start max-w-[88%]";
      boxClass =
        "rounded-xl border bg-emerald-50 text-emerald-950 border-emerald-200";
    } else if (outgoing) {
      align = "self-end max-w-[88%]";
      boxClass =
        "rounded-xl border bg-emerald-700 text-white border-emerald-800";
    }
  } else if (isGmail) {
    boxClass =
      "rounded-xl border bg-sky-50 text-sky-950 border-sky-200";
  } else if (isManual || isSystem) {
    boxClass =
      "rounded-xl border bg-slate-100 text-slate-800 border-slate-200 text-center";
  }

  const Icon =
    isWa ? MessageCircleIcon : isGmail ? MailIcon : FileTextIcon;

  return (
    <div className={align}>
      <div className={`${boxClass} p-3 text-sm shadow-sm`}>
        <div
          className={`flex items-center gap-2 mb-1 text-xs font-medium opacity-90 ${isManual || isSystem ? "justify-center" : ""}`}
        >
          <Icon className="size-3.5 shrink-0" />
          <span>
            {row.source === "whatsapp"
              ? "וואטסאפ"
              : row.source === "gmail"
                ? "דוא״ל"
                : row.source === "manual"
                  ? "הערה ידנית"
                  : "מערכת"}
            {row.direction === "in"
              ? " · נכנס"
              : row.direction === "out"
                ? " · יוצא"
                : row.direction === "internal"
                  ? " · פנימי"
                  : ""}
          </span>
        </div>
        {subject && (
          <p className="text-xs font-semibold mb-1 break-words">{subject}</p>
        )}
        <p className="whitespace-pre-wrap break-words">{row.body}</p>
        <div className="mt-2 flex flex-wrap justify-between gap-3 text-[11px] opacity-75">
          <span>{new Date(row.created_at).toLocaleString("he-IL")}</span>
          {row.follow_up_date && (
            <span className="font-medium text-blue-600">
              מעקב: {new Date(row.follow_up_date).toLocaleDateString("he-IL")}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function LegacyLogBubble({ log }: { log: LegacyCommLog }) {
  const ch = log.channel;
  const isWa = ch === "WhatsApp";
  const isEmail = ch === "Email";
  const incoming = log.direction === "inbound";
  const outgoing = log.direction === "outbound";

  let align = "self-center max-w-[92%]";
  let boxClass = "rounded-xl border bg-slate-100 text-slate-800 border-slate-200";

  if (isWa) {
    if (outgoing) {
      align = "self-end max-w-[88%]";
      boxClass =
        "rounded-xl border bg-emerald-700 text-white border-emerald-800";
    } else {
      align = "self-start max-w-[88%]";
      boxClass =
        "rounded-xl border bg-emerald-50 text-emerald-950 border-emerald-200";
    }
  } else if (isEmail) {
    boxClass =
      "rounded-xl border bg-sky-50 text-sky-950 border-sky-200";
  }

  const Icon = isWa ? MessageCircleIcon : MailIcon;
  const desc = (log.content ?? "").slice(0, 2000);

  return (
    <div className={align}>
      <div className={`${boxClass} p-3 text-sm shadow-sm`}>
        <div className="mb-1 flex items-center gap-2 text-xs font-medium opacity-90">
          <Icon className="size-3.5 shrink-0" />
          <span>
            {ch}
            {outgoing ? " · יוצא" : incoming ? " · נכנס" : " · יומן ישן"}
          </span>
        </div>
        <p className="break-words whitespace-pre-wrap">{desc}</p>
        <p className="mt-2 text-[11px] opacity-70">
          {new Date(log.timestamp).toLocaleString("he-IL")}
        </p>
      </div>
    </div>
  );
}

function ledgerEntityTypeHe(t: string): string {
  if (t === "sale") return "מכירה";
  if (t === "investment") return "השקעה";
  return t;
}

function roleBadges(type: string) {
  const badges: { key: string; label: string; className: string }[] = [];
  if (type === "End_Customer") badges.push({ key: "c", label: "לקוח", className: "bg-emerald-100 text-emerald-900" });
  if (type === "Scribe") badges.push({ key: "s", label: "סופר", className: "bg-violet-100 text-violet-900" });
  if (type === "Merchant") badges.push({ key: "m", label: "סוחר", className: "bg-amber-100 text-amber-900" });
  if (badges.length === 0) badges.push({ key: "o", label: "אחר", className: "bg-slate-100 text-slate-700" });
  return badges;
}

export default function ContactDetailClient({
  contact: initialContact,
  soferProfile: initialSoferProfile,
  transactions: initialTx,
  documents: initialDocs,
  logs,
  contactHistory: initialHistory,
  debtToContact,
  debtFromContact,
  futureCommitment,
  netMutual,
  typeLabel,
  ledgerPayments,
  buyerSales,
  sellerSales,
  investments,
  sysEvents,
}: Props) {
  const router = useRouter();
  const [contact, setContact] = useState(initialContact);
  const [transactions] = useState(initialTx);
  const [documents, setDocuments] = useState(initialDocs);
  const [history, setHistory] = useState(initialHistory);
  const [soferProfile, setSoferProfile] = useState(initialSoferProfile);
  const [editSofer, setEditSofer] = useState(false);
  const [soferForm, setSoferForm] = useState({
    writing_style: initialSoferProfile?.writing_style ?? "",
    writing_level: initialSoferProfile?.writing_level ?? "",
    handwriting_quality: initialSoferProfile?.handwriting_quality ?? null as number | null,
    daily_page_capacity: initialSoferProfile?.daily_page_capacity?.toString() ?? "",
    pricing_notes: initialSoferProfile?.pricing_notes ?? "",
    writing_constraints: initialSoferProfile?.writing_constraints ?? "",
    past_writings: initialSoferProfile?.past_writings ?? "",
    community: initialSoferProfile?.community ?? "",
    sample_image_url: initialSoferProfile?.sample_image_url ?? "",
  });
  const [soferLoading, setSoferLoading] = useState(false);
  const [addToEmailListLoading, setAddToEmailListLoading] = useState(false);

  const handleAddToEmailList = async () => {
    if (!contact.email) return;
    setAddToEmailListLoading(true);
    const res = await addCrmContactToEmailList(contact.name, contact.email, contact.phone);
    setAddToEmailListLoading(false);
    if (res.success) {
      toast.success("נוסף לרשימת תפוצה");
    } else {
      toast.error(res.error);
    }
  };

  const totalOwed = transactions.filter((t) => t.type === "Debt").reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const totalDue = transactions.filter((t) => t.type === "Credit").reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const [editMode, setEditMode] = useState(false);
  const [editWa, setEditWa] = useState(contact.wa_chat_id ?? "");
  const [editEmail, setEditEmail] = useState(contact.email ?? "");
  const [editPhone, setEditPhone] = useState(contact.phone ?? "");
  const [editPreferredMethod, setEditPreferredMethod] = useState<PreferredMethod>(() =>
    preferredMethodFromContact(initialContact)
  );
  const [editTags, setEditTags] = useState(initialContact.tags.join(", "));
  const [editNotes, setEditNotes] = useState(contact.notes ?? "");
  const [editCertification, setEditCertification] = useState(contact.certification ?? "");
  const [editPhoneType, setEditPhoneType] = useState(contact.phone_type ?? "");
  const [editAddressCity, setEditAddressCity] = useState(
    (initialContact.address_city ?? initialContact.city) ?? ""
  );
  const [editAddressPhysical, setEditAddressPhysical] = useState(
    (initialContact.address_physical ?? initialContact.address) ?? ""
  );
  const [editCommunity, setEditCommunity] = useState(initialContact.community ?? "");
  const [extraPhones, setExtraPhones] = useState<{ label: string; value: string }[]>(
    contact.extra_phones ?? []
  );
  const [extraEmails, setExtraEmails] = useState<{ label: string; value: string }[]>(
    contact.extra_emails ?? []
  );
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [docLoading, setDocLoading] = useState(false);
  const [noteBody, setNoteBody] = useState("");
  const [noteFollowUp, setNoteFollowUp] = useState("");
  const [noteLoading, setNoteLoading] = useState(false);

  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeList, setMergeList] = useState<
    { id: string; name: string; email: string | null; phone: string | null }[]
  >([]);
  const [mergeLoading, setMergeLoading] = useState(false);
  const [mergeSearch, setMergeSearch] = useState("");
  const [mergeSelectedId, setMergeSelectedId] = useState<string | null>(null);
  const [mergeSubmitting, setMergeSubmitting] = useState(false);

  useEffect(() => {
    setContact(initialContact);
  }, [initialContact]);

  useEffect(() => {
    if (!mergeOpen) return;
    setMergeLoading(true);
    setMergeSearch("");
    setMergeSelectedId(null);
    void fetchCrmContacts().then((r) => {
      setMergeLoading(false);
      if (r.success) {
        setMergeList(
          r.contacts
            .filter((c) => c.id !== contact.id)
            .map((c) => ({
              id: c.id,
              name: c.name,
              email: c.email ?? null,
              phone: c.phone ?? null,
            }))
        );
      } else toast.error(r.error);
    });
  }, [mergeOpen, contact.id]);

  const badges = roleBadges(contact.type);

  type TimelineItem =
    | { kind: "history"; at: string; data: CrmContactHistoryEntry }
    | { kind: "legacy"; at: string; data: LegacyCommLog };

  const timeline = useMemo(() => {
    const items: TimelineItem[] = [
      ...history.map((data) => ({
        kind: "history" as const,
        at: data.created_at,
        data,
      })),
      ...logs.map((data) => ({
        kind: "legacy" as const,
        at: data.timestamp,
        data,
      })),
    ];
    items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    return items;
  }, [history, logs]);

  const mergeFiltered = useMemo(() => {
    const q = mergeSearch.trim().toLowerCase();
    if (!q) return mergeList;
    return mergeList.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.email?.toLowerCase().includes(q) ?? false) ||
        (c.phone?.replace(/\D/g, "").includes(q.replace(/\D/g, "")) ?? false)
    );
  }, [mergeList, mergeSearch]);

  const handleMergeContact = async () => {
    if (!mergeSelectedId) return;
    setMergeSubmitting(true);
    const res = await mergeCrmContacts(contact.id, [mergeSelectedId]);
    setMergeSubmitting(false);
    if (res.success) {
      toast.success("האנשי קשר מוזגו בהצלחה");
      setMergeOpen(false);
      router.refresh();
    } else {
      toast.error(res.error);
    }
  };

  const handleSaveProfile = async () => {
    const nextTags = editTags.split(/[,\s]+/).map((t) => t.trim()).filter(Boolean);
    const cityLine = editAddressCity.trim();
    const physicalLine = editAddressPhysical.trim();
    const [res, extraRes] = await Promise.all([
      updateCrmContact(contact.id, {
        wa_chat_id: editWa.trim() || undefined,
        email: editEmail.trim() || undefined,
        phone: editPhone.trim() || undefined,
        preferred_contact_method: editPreferredMethod,
        tags: nextTags,
        notes: editNotes.trim() || undefined,
        certification: editCertification.trim() || undefined,
        phone_type: editPhoneType.trim() || undefined,
        address_city: cityLine || null,
        address_physical: physicalLine || null,
        city: cityLine || null,
        address: physicalLine || null,
        community: editCommunity.trim() || null,
      }),
      updateCrmExtraContacts(contact.id, extraPhones, extraEmails),
    ]);
    if (!res.success) { toast.error(res.error); return; }
    if (!extraRes.success) toast.warning?.(`פרטי קשר נוספים: ${extraRes.error}`);
    const legacyPreferred =
      editPreferredMethod === "email"
        ? "Email"
        : editPreferredMethod === "phone"
          ? "Phone"
          : "WhatsApp";
    setContact((prev) => ({
      ...prev,
      wa_chat_id: editWa.trim() || null,
      email: editEmail.trim() || null,
      phone: editPhone.trim() || null,
      preferred_contact: legacyPreferred,
      preferred_contact_method: editPreferredMethod,
      tags: nextTags,
      notes: editNotes.trim() || null,
      certification: editCertification.trim() || null,
      phone_type: editPhoneType.trim() || null,
      city: cityLine || null,
      address: physicalLine || null,
      address_city: cityLine || null,
      address_physical: physicalLine || null,
      community: editCommunity.trim() || null,
      extra_phones: extraPhones,
      extra_emails: extraEmails,
    }));
    setEditMode(false);
    toast.success("נשמר");
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteBody.trim()) return;
    setNoteLoading(true);
    const res = await addHistoryEntry(contact.id, {
      body: noteBody.trim(),
      follow_up_date: noteFollowUp || null,
      direction: "internal",
      source: "manual",
    });
    setNoteLoading(false);
    if (res.success) {
      setHistory((prev) => [res.entry, ...prev]);
      setNoteBody("");
      setNoteFollowUp("");
      toast.success("הערה נשמרה");
    } else toast.error(res.error);
  };

  const handleSaveSofer = async (e: React.FormEvent) => {
    e.preventDefault();
    setSoferLoading(true);
    const res = await upsertSoferProfile(contact.id, {
      writing_style: soferForm.writing_style || null,
      writing_level: soferForm.writing_level || null,
      handwriting_quality: soferForm.handwriting_quality,
      daily_page_capacity: soferForm.daily_page_capacity ? Number(soferForm.daily_page_capacity) : null,
      pricing_notes: soferForm.pricing_notes || null,
      writing_constraints: soferForm.writing_constraints || null,
      past_writings: soferForm.past_writings || null,
      community: soferForm.community || null,
      sample_image_url: soferForm.sample_image_url || null,
    });
    setSoferLoading(false);
    if (res.success) {
      setSoferProfile({
        writing_style: soferForm.writing_style || null,
        writing_level: soferForm.writing_level || null,
        handwriting_quality: soferForm.handwriting_quality,
        daily_page_capacity: soferForm.daily_page_capacity ? Number(soferForm.daily_page_capacity) : null,
        pricing_notes: soferForm.pricing_notes || null,
        writing_constraints: soferForm.writing_constraints || null,
        past_writings: soferForm.past_writings || null,
        community: soferForm.community || null,
        sample_image_url: soferForm.sample_image_url || null,
      });
      setEditSofer(false);
      toast.success("פרופיל סופר עודכן");
    } else toast.error(res.error);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("הקובץ חורג ממגבלת 10MB");
      e.target.value = "";
      return;
    }
    setDocLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const uploadRes = await fetch("/api/crm/upload", {
        method: "POST",
        body: formData,
      });
      const data = await uploadRes.json();
      if (!uploadRes.ok) {
        toast.error(data?.error || "העלאה נכשלה");
        return;
      }
      const res = await addDocument(contact.id, data.url, "Script_Sample", file.name);
      if (res.success) {
        setDocuments((prev) => [...prev, { id: res.id, file_url: data.url, doc_type: "Script_Sample", name: file.name }]);
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
              מועדף: {contactPreferredLabel(contact)} · מזהה:{" "}
              {contact.id.slice(0, 8)}…
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
            {(contact.address_city || contact.city || contact.address_physical || contact.address || contact.community) && (
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {(contact.address_city || contact.city) && (
                  <span>עיר: {contact.address_city ?? contact.city}</span>
                )}
                {(contact.address_physical || contact.address) && (
                  <span>כתובת: {contact.address_physical ?? contact.address}</span>
                )}
                {contact.community && <span>קהילה: {contact.community}</span>}
              </div>
            )}
            {contact.email && (
              <div className="flex flex-wrap gap-2 pt-1">
                <a
                  href={`mailto:${contact.email}`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-700 hover:bg-sky-100 transition-colors"
                >
                  <SendIcon className="size-3.5" />
                  שלח מייל
                </a>
                <button
                  type="button"
                  onClick={() => void handleAddToEmailList()}
                  disabled={addToEmailListLoading}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 transition-colors disabled:opacity-50"
                >
                  <PlusCircleIcon className="size-3.5" />
                  {addToEmailListLoading ? "מוסיף..." : "הוסף לרשימת תפוצה"}
                </button>
                <a
                  href={`/email/campaigns?preselect=${encodeURIComponent(contact.email)}`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-100 transition-colors"
                >
                  <MailIcon className="size-3.5" />
                  קמפיין אישי
                </a>
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <Button variant="outline" size="sm" type="button" onClick={() => setMergeOpen(true)}>
              מיזוג איש קשר
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (editMode) void handleSaveProfile();
                else {
                  setEditTags(contact.tags.join(", "));
                  setEditWa(contact.wa_chat_id ?? "");
                  setEditEmail(contact.email ?? "");
                  setEditPhone(contact.phone ?? "");
                  setEditPreferredMethod(preferredMethodFromContact(contact));
                  setEditNotes(contact.notes ?? "");
                  setEditCertification(contact.certification ?? "");
                  setEditPhoneType(contact.phone_type ?? "");
                  setEditAddressCity((contact.address_city ?? contact.city) ?? "");
                  setEditAddressPhysical((contact.address_physical ?? contact.address) ?? "");
                  setEditCommunity(contact.community ?? "");
                  setExtraPhones(contact.extra_phones ?? []);
                  setExtraEmails(contact.extra_emails ?? []);
                  setEditMode(true);
                }
              }}
            >
              <PencilIcon className="size-4 ml-1" />
              {editMode ? "שמור" : "ערוך פרופיל"}
            </Button>
          </div>
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
                {(contact.address_city || contact.city) && (
                  <p>עיר: {contact.address_city ?? contact.city}</p>
                )}
                {(contact.address_physical || contact.address) && (
                  <p>כתובת מלאה: {contact.address_physical ?? contact.address}</p>
                )}
                {contact.community && <p>קהילה / מוסד: {contact.community}</p>}
                {contact.notes && <p>הערות: {contact.notes}</p>}
                {!contact.certification &&
                  !contact.phone_type &&
                  !contact.notes &&
                  !(contact.address_city || contact.city) &&
                  !(contact.address_physical || contact.address) &&
                  !contact.community && <p>אין נתונים נוספים</p>}
              </CollapsibleContent>
            </Collapsible>
          </CardContent>
        )}
        {editMode && (
          <CardContent className="border-t pt-4 space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="text-xs text-muted-foreground">אמצעי קשר מועדף</label>
                <select
                  value={editPreferredMethod}
                  onChange={(e) =>
                    setEditPreferredMethod(e.target.value as PreferredMethod)
                  }
                  className="mt-1 flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {PREFERRED_METHOD_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
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
              <CollapsibleContent className="mt-3 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Input
                    value={editAddressCity}
                    onChange={(e) => setEditAddressCity(e.target.value)}
                    placeholder="עיר"
                    className="rounded-lg"
                  />
                  <Input
                    value={editAddressPhysical}
                    onChange={(e) => setEditAddressPhysical(e.target.value)}
                    placeholder="כתובת (רחוב ומספר)"
                    className="rounded-lg"
                  />
                </div>
                <CommunityCreatableSelect
                  value={editCommunity}
                  onChange={setEditCommunity}
                />
                <ExtraContactsEditor
                  title="טלפונים נוספים"
                  placeholder="05X-XXXXXXX"
                  labelPlaceholder="סוג (נייד/בית…)"
                  items={extraPhones}
                  onChange={setExtraPhones}
                />
                <ExtraContactsEditor
                  title="מיילים נוספים"
                  placeholder="email@example.com"
                  labelPlaceholder="סוג (עסקי/אישי…)"
                  items={extraEmails}
                  onChange={setExtraEmails}
                />
                <Input value={editCertification} onChange={(e) => setEditCertification(e.target.value)} placeholder="תעודה" className="rounded-lg" />
                <Input value={editPhoneType} onChange={(e) => setEditPhoneType(e.target.value)} placeholder="סוג טלפון" className="rounded-lg" />
                <Input value={editNotes} onChange={(e) => setEditNotes(e.target.value)} placeholder="הערות" className="rounded-lg" />
              </CollapsibleContent>
            </Collapsible>
          </CardContent>
        )}
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
          {contact.type === "Scribe" && (
            <TabsTrigger value="sofer" className="rounded-lg data-[state=active]:bg-white">
              <PencilIcon className="size-4 ml-1" />
              פרופיל סופר
            </TabsTrigger>
          )}
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
              {/* יתרת חוב מידי — actual debt: work done, money owed NOW → red */}
              <div className={`rounded-xl p-4 border ${debtToContact > 0 ? "bg-red-50 border-red-200" : "bg-slate-50 border-slate-200"}`}>
                <p className={`text-xs font-medium ${debtToContact > 0 ? "text-red-900/80" : "text-slate-600"}`}>
                  יתרת חוב מידי
                </p>
                <p className={`text-2xl font-bold ${debtToContact > 0 ? "text-red-700" : "text-slate-500"}`}>
                  ₪{debtToContact.toLocaleString("he-IL")}
                </p>
                <p className="text-xs text-muted-foreground mt-1">עבודה שהסתיימה + מלאי — מגיע לו עכשיו</p>
              </div>
              {/* שריון כספים — future commitment: work in progress → amber/yellow neutral */}
              {futureCommitment > 0 && (
                <div className="rounded-xl bg-amber-50 border border-amber-200 p-4">
                  <p className="text-xs text-amber-900/80 font-medium">שריון כספים</p>
                  <p className="text-2xl font-bold text-amber-700">₪{futureCommitment.toLocaleString("he-IL")}</p>
                  <p className="text-xs text-muted-foreground mt-1">עבודה בתהליך — ישולם עם סיום</p>
                </div>
              )}
              <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-4">
                <p className="text-xs text-emerald-900/80 font-medium">הוא חייב לנו</p>
                <p className="text-2xl font-bold text-emerald-800">₪{debtFromContact.toLocaleString("he-IL")}</p>
                <p className="text-xs text-muted-foreground mt-1">מכירות כקונה</p>
              </div>
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
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
                      {investments.map((i) => {
                        const remaining = Math.max(0, i.total_agreed_price - i.amount_paid);
                        const delivered = isDealDelivered(i.status);
                        const isActualDebt = remaining > 0 && delivered;
                        const isFutureCommitment = remaining > 0 && !delivered;
                        return (
                          <TableRow key={i.id}>
                            <TableCell className="max-w-[200px] truncate">{i.item_details ?? "—"}</TableCell>
                            <TableCell>{invStatusHe(i.status)}</TableCell>
                            <TableCell>₪{i.total_agreed_price.toLocaleString("he-IL")}</TableCell>
                            <TableCell>₪{i.amount_paid.toLocaleString("he-IL")}</TableCell>
                            <TableCell>
                              {remaining > 0 ? (
                                <span className={`inline-flex flex-col gap-0.5`}>
                                  <span className={`font-semibold ${isActualDebt ? "text-red-600" : "text-amber-600"}`}>
                                    ₪{remaining.toLocaleString("he-IL")}
                                  </span>
                                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full w-fit ${
                                    isActualDebt
                                      ? "bg-red-100 text-red-700"
                                      : isFutureCommitment
                                        ? "bg-amber-100 text-amber-700"
                                        : ""
                                  }`}>
                                    {isActualDebt ? "חוב מידי" : "שריון"}
                                  </span>
                                </span>
                              ) : (
                                <span className="text-emerald-600 font-medium">שולם</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {i.target_date ? new Date(i.target_date).toLocaleDateString("he-IL") : "—"}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notes" className="space-y-4">
          <ContactSysEventsBlock events={sysEvents} />

          {/* Add Note */}
          <Card className="border-teal-100">
            <CardHeader>
              <h3 className="font-semibold">הוסף הערה</h3>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleAddNote} className="space-y-3">
                <textarea
                  value={noteBody}
                  onChange={(e) => setNoteBody(e.target.value)}
                  placeholder="תוכן ההערה / תיעוד שיחה..."
                  rows={3}
                  className="w-full rounded-lg border px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-teal-300"
                />
                <div className="flex gap-3 items-center flex-wrap">
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-muted-foreground whitespace-nowrap">תאריך מעקב:</label>
                    <Input
                      type="date"
                      value={noteFollowUp}
                      onChange={(e) => setNoteFollowUp(e.target.value)}
                      className="rounded-lg text-sm w-40"
                    />
                  </div>
                  <Button type="submit" disabled={noteLoading || !noteBody.trim()} size="sm">
                    {noteLoading ? "שומר..." : "שמור הערה"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Unified communication timeline */}
          <Card className="border-teal-100">
            <CardHeader>
              <h3 className="font-semibold">ציר זמן מאוחד ({timeline.length})</h3>
              <p className="text-xs text-muted-foreground">
                הערות, מערכת, ועתידית: דוא״ל ווואטסאפ — לפי כיוון ומקור
              </p>
            </CardHeader>
            <CardContent>
              {timeline.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  אין פעילות מתועדת
                </p>
              ) : (
                <div
                  dir="ltr"
                  className="flex max-h-[520px] flex-col gap-3 overflow-y-auto px-1"
                >
                  {timeline.map((item) =>
                    item.kind === "history" ? (
                      <HistoryTimelineBubble key={`h-${item.data.id}`} row={item.data} />
                    ) : (
                      <LegacyLogBubble key={`l-${item.data.id}`} log={item.data} />
                    )
                  )}
                </div>
              )}
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
        <TabsContent value="sofer" className="space-y-4">
          <Card className="border-teal-100">
            <CardHeader className="flex flex-row items-center justify-between">
              <h3 className="font-semibold">פרופיל מקצועי — סופר</h3>
              <Button variant="outline" size="sm" onClick={() => setEditSofer((v) => !v)}>
                <PencilIcon className="size-4 ml-1" />
                {editSofer ? "ביטול" : "ערוך"}
              </Button>
            </CardHeader>
            <CardContent>
              {editSofer ? (
                <form onSubmit={handleSaveSofer} className="space-y-3">
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground">סגנון כתיבה</label>
                      <Input value={soferForm.writing_style} onChange={(e) => setSoferForm((f) => ({ ...f, writing_style: e.target.value }))} className="mt-1" />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-xs text-muted-foreground">רמת כתב (כוכבים)</label>
                      <div className="mt-2 flex flex-wrap items-center gap-3">
                        <StarRating
                          value={soferForm.handwriting_quality}
                          onChange={(v) => setSoferForm((f) => ({ ...f, handwriting_quality: v }))}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-xs h-8"
                          onClick={() => setSoferForm((f) => ({ ...f, handwriting_quality: null }))}
                        >
                          נקה דירוג
                        </Button>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">תיאור רמה (טקסט)</label>
                      <Input value={soferForm.writing_level} onChange={(e) => setSoferForm((f) => ({ ...f, writing_level: e.target.value }))} className="mt-1" placeholder="מהודר, תיוג..." />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">קיבולת יומית (עמודים)</label>
                      <Input type="number" value={soferForm.daily_page_capacity} onChange={(e) => setSoferForm((f) => ({ ...f, daily_page_capacity: e.target.value }))} className="mt-1" />
                    </div>
                  <div>
                    <label className="text-xs text-muted-foreground">הערות תמחור</label>
                    <Input value={soferForm.pricing_notes} onChange={(e) => setSoferForm((f) => ({ ...f, pricing_notes: e.target.value }))} className="mt-1" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">קהילה / מוסד</label>
                    <Input value={soferForm.community} onChange={(e) => setSoferForm((f) => ({ ...f, community: e.target.value }))} className="mt-1" placeholder="ישיבה, בית כנסת..." />
                  </div>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">דוגמת כתב (URL תמונה)</label>
                    <Input value={soferForm.sample_image_url} onChange={(e) => setSoferForm((f) => ({ ...f, sample_image_url: e.target.value }))} className="mt-1 font-mono text-xs" placeholder="https://..." dir="ltr" />
                    <p className="mt-1 text-xs text-muted-foreground">להעלאת תמונות רבות — השתמש בגלריה מטה</p>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">אילוצי כתיבה</label>
                    <textarea value={soferForm.writing_constraints} onChange={(e) => setSoferForm((f) => ({ ...f, writing_constraints: e.target.value }))} rows={2} className="w-full mt-1 rounded-lg border px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-teal-300" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">כתבי עבר</label>
                    <textarea value={soferForm.past_writings} onChange={(e) => setSoferForm((f) => ({ ...f, past_writings: e.target.value }))} rows={3} className="w-full mt-1 rounded-lg border px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-teal-300" />
                  </div>
                  <Button type="submit" disabled={soferLoading} size="sm">
                    {soferLoading ? "שומר..." : "שמור"}
                  </Button>
                </form>
              ) : (
                <div className="grid sm:grid-cols-2 gap-4 text-sm">
                  <div><span className="text-xs text-muted-foreground">סגנון כתיבה</span><p className="font-medium">{soferProfile?.writing_style ?? "—"}</p></div>
                  <div>
                    <span className="text-xs text-muted-foreground block mb-1">רמת כתב (כוכבים)</span>
                    <StarRating value={soferProfile?.handwriting_quality} readOnly size="md" />
                  </div>
                  <div className="sm:col-span-2"><span className="text-xs text-muted-foreground">תיאור רמה</span><p className="font-medium">{soferProfile?.writing_level ?? "—"}</p></div>
                  <div><span className="text-xs text-muted-foreground">קיבולת יומית</span><p className="font-medium">{soferProfile?.daily_page_capacity ?? "—"} עמ׳</p></div>
                  <div><span className="text-xs text-muted-foreground">הערות תמחור</span><p className="font-medium">{soferProfile?.pricing_notes ?? "—"}</p></div>
                  {soferProfile?.community && (
                    <div><span className="text-xs text-muted-foreground">קהילה / מוסד</span><p className="font-medium">{soferProfile.community}</p></div>
                  )}
                  {soferProfile?.sample_image_url && (
                    <div className="col-span-2">
                      <span className="text-xs text-muted-foreground block mb-1">דוגמת כתב ראשית</span>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={soferProfile.sample_image_url} alt="דוגמת כתב" className="max-h-36 rounded-lg border object-contain bg-white" />
                    </div>
                  )}
                  {soferProfile?.writing_constraints && (
                    <div className="col-span-2"><span className="text-xs text-muted-foreground">אילוצי כתיבה</span><p className="whitespace-pre-wrap">{soferProfile.writing_constraints}</p></div>
                  )}
                  {soferProfile?.past_writings && (
                    <div className="col-span-2"><span className="text-xs text-muted-foreground">כתבי עבר</span><p className="whitespace-pre-wrap">{soferProfile.past_writings}</p></div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* גלריית כתב יד ותמונות */}
          <Card className="border-teal-100">
            <CardHeader>
              <h3 className="font-semibold">גלריית כתב יד ותמונות</h3>
              <p className="text-xs text-muted-foreground">מספר תמונות בלתי מוגבל — מאורגן לפי סדר עלייה</p>
            </CardHeader>
            <CardContent>
              <ScribeGallery contactId={contact.id} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={mergeOpen} onOpenChange={setMergeOpen}>
        <DialogContent className="sm:max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle>מיזוג איש קשר</DialogTitle>
            <DialogDescription className="text-right">
              נבחר איש קשר נוסף שיימזג <span className="font-semibold text-foreground">אל תוך</span>{" "}
              {contact.name}. הרשומות המקושרות יועברו לאיש קשר זה, והכפילות תסומן כמוזגת.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Input
              placeholder="חיפוש לפי שם, טלפון או אימייל…"
              value={mergeSearch}
              onChange={(e) => setMergeSearch(e.target.value)}
              className="rounded-lg"
            />
            <div className="max-h-[240px] overflow-y-auto rounded-lg border border-border/60 divide-y">
              {mergeLoading ? (
                <p className="p-4 text-sm text-muted-foreground text-center">טוען…</p>
              ) : mergeFiltered.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground text-center">לא נמצאו אנשי קשר</p>
              ) : (
                mergeFiltered.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setMergeSelectedId(c.id)}
                    className={`w-full text-right px-3 py-2.5 text-sm hover:bg-muted/60 transition-colors ${
                      mergeSelectedId === c.id ? "bg-teal-50" : ""
                    }`}
                  >
                    <span className="font-medium block">{c.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {[c.phone, c.email].filter(Boolean).join(" · ") || c.id.slice(0, 8)}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0 flex-row-reverse">
            <Button
              type="button"
              variant="destructive"
              disabled={!mergeSelectedId || mergeSubmitting}
              onClick={() => void handleMergeContact()}
            >
              {mergeSubmitting ? "ממזג…" : "מזג לתוך איש קשר זה"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setMergeOpen(false)}>
              ביטול
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
