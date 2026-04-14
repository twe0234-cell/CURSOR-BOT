"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HScrollBar } from "@/components/ui/HScrollBar";
import { cn } from "@/lib/utils";
import {
  fetchEmailContacts,
  getGmailStatus,
  saveEmailCampaignTagPresets,
  type EmailContact,
} from "@/app/email/actions";
import { sendGmailCampaignAction, fetchCampaignStats, saveCampaignSignatureAction, type CampaignStat } from "./actions";
import EmailComposer from "./EmailComposer";
import {
  KeyIcon,
  SparklesIcon,
  SendIcon,
  SmartphoneIcon,
  MonitorIcon,
  TabletIcon,
  TagsIcon,
  SaveIcon,
  PenSquareIcon,
  RocketIcon,
  WandSparklesIcon,
} from "lucide-react";

type Props = {
  initialContacts: EmailContact[];
  signature: string | null;
  /** תגיות מוצעות לקמפיין אימייל בלבד (לא תגיות קהל וואטסאפ) */
  initialEmailTagPresets: string[];
};

/** תבניות פילוח — התגיות נשמרות ב־email_contacts.tags; ניתן לנהל בכרטיסייה ״אנשי קשר״ */
const SEGMENT_PRESETS: { label: string; tags: string[] }[] = [
  { label: "VIP", tags: ["VIP"] },
  { label: "סוחרים קרים", tags: ["סוחרים_קרים"] },
  { label: "לקוחות פעילים", tags: ["לקוחות_פעילים"] },
  { label: "גבאים", tags: ["גבאים"] },
  { label: "סוחרים", tags: ["סוחרים"] },
];

function fileToBase64(file: File): Promise<{ filename: string; contentBase64: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1] ?? "";
      resolve({ filename: file.name, contentBase64: base64 });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function stripHtmlRough(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 1200);
}

export default function CampaignsClient({ initialContacts, signature, initialEmailTagPresets }: Props) {
  const [contacts, setContacts] = useState(initialContacts);
  const [gmailConnected, setGmailConnected] = useState(false);
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [approvalRead, setApprovalRead] = useState(false);
  const [confirmCountTyped, setConfirmCountTyped] = useState("");

  const [aiOpen, setAiOpen] = useState(false);
  const [aiContext, setAiContext] = useState("");
  const [aiStyle, setAiStyle] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [subjectAiLoading, setSubjectAiLoading] = useState(false);

  const [filterSegmentTags, setFilterSegmentTags] = useState<string[]>([]);
  const [segmentMode, setSegmentMode] = useState<"or" | "and">("or");

  const [campaigns, setCampaigns] = useState<CampaignStat[]>([]);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const contactsError: string | null = null;
  const [signatureDraft, setSignatureDraft] = useState(signature ?? "");
  const [savingSignature, setSavingSignature] = useState(false);
  const [campaignTagInput, setCampaignTagInput] = useState("");
  const [emailTagPresets, setEmailTagPresets] = useState<string[]>(
    [...new Set((initialEmailTagPresets ?? []).map((t) => t.trim()).filter(Boolean))]
  );
  const [savingAllowedTags, setSavingAllowedTags] = useState(false);

  const subscribedContacts = useMemo(
    () => contacts.filter((c) => c.subscribed !== false),
    [contacts]
  );

  const allDiscoveredTags = useMemo(() => {
    const s = new Set<string>();
    subscribedContacts.forEach((c) => (c.tags ?? []).forEach((t) => t && s.add(t)));
    return [...s].sort((a, b) => a.localeCompare(b, "he"));
  }, [subscribedContacts]);

  const basePool = useMemo(() => {
    if (filterSegmentTags.length === 0) return subscribedContacts;
    return subscribedContacts.filter((c) => {
      const tags = c.tags ?? [];
      return segmentMode === "or"
        ? filterSegmentTags.some((t) => tags.includes(t))
        : filterSegmentTags.every((t) => tags.includes(t));
    });
  }, [subscribedContacts, filterSegmentTags, segmentMode]);

  const targetIds = useMemo(() => {
    const poolSet = new Set(basePool.map((c) => c.id));
    if (selected.size === 0) {
      return basePool.map((c) => c.id);
    }
    const picked = [...selected].filter((id) => poolSet.has(id));
    return picked;
  }, [basePool, selected]);

  const targetContacts = useMemo(
    () => contacts.filter((c) => targetIds.includes(c.id)),
    [contacts, targetIds]
  );

  const expectedRecipientCount = targetIds.length;

  useEffect(() => {
    getGmailStatus().then((r) => {
      if (r.success) setGmailConnected(r.connected);
    });
  }, []);

  const loadStats = () => {
    setStatsLoading(true);
    setStatsError(null);
    fetchCampaignStats().then((r) => {
      setStatsLoading(false);
      if (r.success) {
        setCampaigns(r.campaigns);
      } else {
        setStatsError(r.error);
        toast.error(`שגיאה בטעינת היסטוריה: ${r.error}`);
      }
    });
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allPoolSelected =
    basePool.length > 0 && basePool.every((c) => selected.has(c.id));

  const toggleSelectAllInPool = () => {
    if (allPoolSelected) {
      setSelected((prev) => {
        const next = new Set(prev);
        basePool.forEach((c) => next.delete(c.id));
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        basePool.forEach((c) => next.add(c.id));
        return next;
      });
    }
  };

  const toggleFilterSegmentTag = (tag: string) => {
    setFilterSegmentTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const applyPreset = (tags: string[]) => {
    setFilterSegmentTags(tags);
    setSegmentMode("or");
    toast.message("סינון הוחל — בחר נמענים או שלח לכל הקבוצה המסוננת");
  };

  const quickStartSuggested = useMemo(() => {
    const preferred = ["VIP", "לקוחות_פעילים", "סוחרים"];
    return preferred.filter((t) => allDiscoveredTags.includes(t)).slice(0, 2);
  }, [allDiscoveredTags]);

  const applyQuickStart = () => {
    const tags = quickStartSuggested;
    if (tags.length > 0) {
      setFilterSegmentTags(tags);
      setSegmentMode("or");
    }
    if (!subject.trim()) {
      setSubject("הצעה חדשה - הידור הסת\"ם");
    }
    toast.success("הגדרת פתיחה מהירה הוחלה");
  };

  const addCampaignTag = () => {
    const value = campaignTagInput.trim();
    if (!value) return;
    if (emailTagPresets.includes(value)) {
      setCampaignTagInput("");
      return;
    }
    setEmailTagPresets((prev) => [...prev, value]);
    setCampaignTagInput("");
  };

  const removeCampaignTag = (tag: string) => {
    setEmailTagPresets((prev) => prev.filter((t) => t !== tag));
    setFilterSegmentTags((prev) => prev.filter((t) => t !== tag));
  };

  const saveEmailTagPresetsFromCampaign = async () => {
    setSavingAllowedTags(true);
    const res = await saveEmailCampaignTagPresets(emailTagPresets);
    setSavingAllowedTags(false);
    if (res.success) toast.success("תגיות מוצעות לאימייל נשמרו");
    else toast.error(res.error);
  };

  const saveSignatureInline = async () => {
    setSavingSignature(true);
    const res = await saveCampaignSignatureAction(signatureDraft);
    setSavingSignature(false);
    if (res.success) toast.success("חתימת המייל נשמרה");
    else toast.error(res.error);
  };

  const openConfirmDialog = () => {
    if (!subject.trim()) {
      toast.error("הזן נושא");
      return;
    }
    if (targetIds.length === 0) {
      toast.error("אין נמענים — בדוק פילוח תגיות או בחר אנשי קשר מהרשימה");
      return;
    }
    setApprovalRead(false);
    setConfirmCountTyped("");
    setConfirmOpen(true);
  };

  const handleConfirmSend = async () => {
    setConfirmOpen(false);
    setSending(true);

    let attPayload: { filename: string; contentBase64: string }[] = [];
    try {
      attPayload = await Promise.all(attachments.map(fileToBase64));
    } catch {
      toast.error("שגיאה בקריאת קבצים");
      setSending(false);
      return;
    }

    const res = await sendGmailCampaignAction(subject, bodyHtml, targetIds, attPayload);
    setSending(false);

    if (res.success) {
      toast.success(`נשלחו ${res.sent} אימיילים${res.failed > 0 ? `, ${res.failed} נכשלו` : ""}`);
      setSubject("");
      setBodyHtml("");
      setAttachments([]);
      setSelected(new Set());
      setFilterSegmentTags([]);
      loadStats();
    } else {
      toast.error(res.error);
    }
  };

  const handleGenerate = async () => {
    if (!aiContext.trim()) {
      toast.error("הזן הקשר לכתיבה");
      return;
    }
    setAiLoading(true);
    try {
      const res = await fetch("/api/email/ai-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context: aiContext, style: aiStyle, kind: "html_body" }),
      });
      const data = (await res.json()) as { html?: string; error?: string };
      if (!res.ok || data.error) {
        toast.error(data.error ?? "שגיאת AI");
      } else if (data.html) {
        setBodyHtml(data.html);
        setAiOpen(false);
        toast.success("טקסט נוצר — בדוק לפני שליחה");
      }
    } catch {
      toast.error("שגיאת רשת");
    } finally {
      setAiLoading(false);
    }
  };

  const handleSuggestSubject = useCallback(async () => {
    const ctx =
      [subject.trim(), stripHtmlRough(bodyHtml)].filter(Boolean).join("\n") ||
      aiContext.trim();
    if (!ctx) {
      toast.error("הזן נושא או תוכן, או פתח AI והזן הקשר");
      return;
    }
    setSubjectAiLoading(true);
    try {
      const res = await fetch("/api/email/ai-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context: ctx, style: aiStyle, kind: "subject" }),
      });
      const data = (await res.json()) as { subject?: string; error?: string };
      if (!res.ok || data.error) toast.error(data.error ?? "שגיאת AI");
      else if (data.subject) {
        setSubject(data.subject);
        toast.success("נושא הוצע — ערוך לפי הצורך");
      }
    } catch {
      toast.error("שגיאת רשת");
    } finally {
      setSubjectAiLoading(false);
    }
  }, [subject, bodyHtml, aiContext, aiStyle]);

  const countMatches =
    confirmCountTyped.trim() === String(expectedRecipientCount) &&
    expectedRecipientCount > 0;

  const canFinalSend = approvalRead && countMatches;

  if (!gmailConnected) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <KeyIcon className="size-16 text-sky-500" />
        <h3 className="text-lg font-semibold text-slate-700">חיבור Gmail</h3>
        <p className="text-center text-muted-foreground max-w-md">
          לחיבור Gmail – הגדר OAuth בהגדרות
        </p>
        <Link href="/settings">
          <Button variant="outline" className="rounded-xl">
            הגדרות
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <>
      <Tabs defaultValue="compose" onValueChange={(v) => v === "stats" && loadStats()}>
        <TabsList className="mb-4">
          <TabsTrigger value="compose">כתיבה ושליחה</TabsTrigger>
          <TabsTrigger value="stats">היסטוריה ומעקב פתיחות</TabsTrigger>
        </TabsList>

        <TabsContent value="compose">
        {contactsError && (
          <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            שגיאה בטעינת אנשי קשר: {contactsError}
          </div>
        )}
        {filterSegmentTags.length === 0 && selected.size === 0 && subscribedContacts.length > 0 && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50/60 px-4 py-2 text-xs text-amber-900">
            לא נבחרו אנשי קשר ידנית — המייל ישלח לכל{" "}
            <strong>{subscribedContacts.length}</strong> המנויים הפעילים. כדי לצמצם, בחר תגית סינון
            או אנשי קשר ספציפיים.
          </div>
        )}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="shadow-sm rounded-xl border-slate-200">
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="text-base font-semibold">כתיבת קמפיין</CardTitle>
                  <div className="flex flex-wrap gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1 text-indigo-600 border-indigo-300"
                      onClick={() => setAiOpen(true)}
                    >
                      <SparklesIcon className="size-3.5" />
                      AI גוף מייל
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1 text-violet-600 border-violet-300"
                      onClick={() => void handleSuggestSubject()}
                      disabled={subjectAiLoading}
                    >
                      <SparklesIcon className="size-3.5" />
                      {subjectAiLoading ? "…" : "AI נושא"}
                    </Button>
                  </div>
                </div>
                <CardDescription>נושא, תוכן וקבצים מצורפים</CardDescription>
              </CardHeader>
              <CardContent>
                <EmailComposer
                  subject={subject}
                  onSubjectChange={setSubject}
                  bodyHtml={bodyHtml}
                  onBodyChange={setBodyHtml}
                  signature={signature}
                  attachments={attachments}
                  onAttachmentsChange={setAttachments}
                />
              </CardContent>
            </Card>

            <Card className="shadow-sm rounded-xl border-slate-200">
              <CardHeader>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <TagsIcon className="size-4 text-sky-600" />
                  נמענים ורשימות תפוצה
                </CardTitle>
                <CardDescription>
                  תגיות מוגדרות לכל איש קשר. סננו לפי תג (או כמה תגיות), או בחרו ידנית. ללא בחירה — נשלח לכל
                  המסוננים.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <p className="text-xs font-medium text-slate-600">פילוח מהיר</p>
                  <div className="flex flex-wrap gap-1.5">
                    {SEGMENT_PRESETS.map((p) => (
                      <Button
                        key={p.label}
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 rounded-full text-xs"
                        onClick={() => applyPreset(p.tags)}
                      >
                        {p.label}
                      </Button>
                    ))}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => setFilterSegmentTags([])}
                    >
                      נקה סינון
                    </Button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-muted-foreground">לוגיקה:</span>
                  <Button
                    type="button"
                    variant={segmentMode === "or" ? "secondary" : "ghost"}
                    size="sm"
                    className="h-7"
                    onClick={() => setSegmentMode("or")}
                  >
                    OR (אחת מהתגיות)
                  </Button>
                  <Button
                    type="button"
                    variant={segmentMode === "and" ? "secondary" : "ghost"}
                    size="sm"
                    className="h-7"
                    onClick={() => setSegmentMode("and")}
                  >
                    AND (כל התגיות)
                  </Button>
                </div>

                {allDiscoveredTags.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-slate-600">תגיות קיימות במערכת</p>
                    <HScrollBar contentClassName="flex gap-1.5 flex-nowrap pb-1">
                      {allDiscoveredTags.map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => toggleFilterSegmentTag(tag)}
                          className={cn(
                            "shrink-0 rounded-full border px-2.5 py-1 text-xs transition-colors",
                            filterSegmentTags.includes(tag)
                              ? "bg-sky-600 text-white border-sky-600"
                              : "bg-muted/50 border-border hover:bg-muted"
                          )}
                        >
                          {tag}
                        </button>
                      ))}
                    </HScrollBar>
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={toggleSelectAllInPool} className="rounded-xl">
                    {allPoolSelected ? "בטל בחירה בקבוצה" : "בחר הכל בקבוצה המסוננת"}
                  </Button>
                </div>

                <p className="text-sm text-muted-foreground">
                  <strong className="text-foreground">{expectedRecipientCount}</strong> נמענים יקבלו
                  {filterSegmentTags.length > 0 && (
                    <span className="mr-1"> (אחרי פילוח: {basePool.length} במאגר המסונן)</span>
                  )}
                </p>

                <div className="max-h-52 overflow-y-auto space-y-1 border rounded-lg p-2">
                  {basePool.slice(0, 80).map((c) => (
                    <label
                      key={c.id}
                      className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 rounded px-2 py-1"
                    >
                      <Checkbox
                        checked={selected.has(c.id)}
                        onCheckedChange={() => toggleSelect(c.id)}
                      />
                      <span className="text-sm truncate flex-1">
                        {c.name ? `${c.name} — ` : ""}
                        {c.email}
                      </span>
                      <span className="text-[10px] text-muted-foreground truncate max-w-[120px]">
                        {(c.tags ?? []).slice(0, 2).join(",")}
                      </span>
                    </label>
                  ))}
                  {basePool.length > 80 && (
                    <p className="text-xs text-muted-foreground px-2">+{basePool.length - 80} נוספים</p>
                  )}
                  {basePool.length === 0 && (
                    <p className="text-xs text-muted-foreground py-4 text-center">
                      אין נמענים בפילוח — שנה תגיות או ייבא אנשי קשר
                    </p>
                  )}
                </div>

                <Button
                  onClick={openConfirmDialog}
                  disabled={sending || !subject.trim() || expectedRecipientCount === 0}
                  className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-700 py-6 gap-2"
                >
                  <SendIcon className="size-4" />
                  {sending ? "שולח…" : "המשך לאישור שליחה (בטיחות)"}
                </Button>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
            <Card className="shadow-sm rounded-xl border-slate-200">
              <CardHeader>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <RocketIcon className="size-4 text-indigo-600" />
                  קמפיין ראשון - פתיחה מהירה
                </CardTitle>
                <CardDescription>מגדיר נושא וסגמנט מומלץ בלחיצה אחת.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  מומלץ למייל ראשון: סגמנט OR עם {quickStartSuggested.length > 0 ? quickStartSuggested.join(", ") : "כל המנויים"}.
                </p>
                <Button variant="outline" className="rounded-xl gap-2" onClick={applyQuickStart}>
                  <WandSparklesIcon className="size-4" />
                  החל הגדרת פתיחה מהירה
                </Button>
              </CardContent>
            </Card>

            <Card className="shadow-sm rounded-xl border-slate-200">
              <CardHeader>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <PenSquareIcon className="size-4 text-sky-600" />
                  חתימת מייל בתוך המודול
                </CardTitle>
                <CardDescription>החתימה תצורף אוטומטית לכל קמפיין.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea
                  dir="rtl"
                  rows={4}
                  value={signatureDraft}
                  onChange={(e) => setSignatureDraft(e.target.value)}
                  placeholder="בברכה, הידור הסת״ם..."
                />
                <Button onClick={() => void saveSignatureInline()} disabled={savingSignature} className="rounded-xl gap-2">
                  <SaveIcon className="size-4" />
                  {savingSignature ? "שומר..." : "שמור חתימה"}
                </Button>
              </CardContent>
            </Card>
          </div>

          <Card className="shadow-sm rounded-xl border-slate-200 mt-6">
            <CardHeader>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <TagsIcon className="size-4 text-emerald-600" />
                תגיות מוצעות לקמפיין אימייל
              </CardTitle>
              <CardDescription>
                תגיות לפילוח קמפיינים — ניהול ושמירה ללא יציאה ממסך זה
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input
                  value={campaignTagInput}
                  onChange={(e) => setCampaignTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addCampaignTag();
                    }
                  }}
                  placeholder="הוסף תגית (למשל VIP, גבאים)..."
                  className="rounded-xl"
                />
                <Button type="button" variant="outline" onClick={addCampaignTag} className="rounded-xl">
                  הוסף
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {emailTagPresets.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => removeCampaignTag(tag)}
                    className="rounded-full border px-3 py-1 text-xs bg-muted/40 hover:bg-muted"
                    title="לחץ להסרה"
                  >
                    {tag} ×
                  </button>
                ))}
                {emailTagPresets.length === 0 && (
                  <p className="text-xs text-muted-foreground">אין תגיות מוצעות — הוסף או הסתמך על התגיות שמופיעות אצל אנשי הקשר.</p>
                )}
              </div>
              <Button
                type="button"
                onClick={() => void saveEmailTagPresetsFromCampaign()}
                disabled={savingAllowedTags}
                className="rounded-xl gap-2"
              >
                <SaveIcon className="size-4" />
                {savingAllowedTags ? "שומר..." : "שמור תגיות מוצעות"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="stats">
          <Card className="mb-4 border-amber-100 bg-amber-50/40 rounded-xl">
            <CardContent className="py-3 text-xs text-amber-900/90 leading-relaxed">
              <strong>מעקב פתיחות:</strong> האחוז מחושב לפי פיקסל עקיפה בגוף המייל. לקוחות עם חסימת תמונות או
              תצוגה מקדימה ללא הורדה עלולים שלא להיספר. ספירת מכשיר (מובייל/מחשב) מתעדכנת בפתיחה ראשונה.
            </CardContent>
          </Card>
          {statsLoading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">טוען...</p>
          ) : statsError ? (
            <p className="text-sm text-destructive py-8 text-center">שגיאה: {statsError}</p>
          ) : campaigns.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">לא נשלחו קמפיינים עדיין</p>
          ) : (
            <div className="space-y-3">
              {campaigns.map((c) => {
                const denom = Math.max(1, c.sent_count - c.failed_count);
                const openRate = c.sent_count > 0 ? Math.round((c.open_count / denom) * 100) : 0;
                return (
                  <Card key={c.id} className="rounded-xl border shadow-sm">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="min-w-0">
                          <p className="font-semibold text-sm truncate">{c.subject}</p>
                          <p className="text-xs text-muted-foreground">
                            {c.sent_at ? new Date(c.sent_at).toLocaleString("he-IL") : "—"}
                          </p>
                        </div>
                        <div className="flex gap-2 flex-wrap shrink-0 text-xs font-medium">
                          <span className="bg-slate-100 text-slate-700 rounded-full px-2.5 py-0.5">
                            {c.sent_count} נשלחו
                          </span>
                          {c.failed_count > 0 && (
                            <span className="bg-red-100 text-red-700 rounded-full px-2.5 py-0.5">
                              {c.failed_count} נכשלו
                            </span>
                          )}
                          <span className="bg-emerald-100 text-emerald-800 rounded-full px-2.5 py-0.5">
                            שיעור פתיחה משוער: {openRate}% ({c.open_count} פתיחות)
                          </span>
                        </div>
                      </div>
                      {(c.mobile_count + c.desktop_count + c.tablet_count) > 0 && (
                        <div className="flex gap-3 mt-2 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <SmartphoneIcon className="size-3" />
                            {c.mobile_count} מובייל
                          </span>
                          <span className="flex items-center gap-1">
                            <MonitorIcon className="size-3" />
                            {c.desktop_count} מחשב
                          </span>
                          <span className="flex items-center gap-1">
                            <TabletIcon className="size-3" />
                            {c.tablet_count} טאבלט
                          </span>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog
        open={confirmOpen}
        onOpenChange={(o) => {
          setConfirmOpen(o);
          if (!o) {
            setApprovalRead(false);
            setConfirmCountTyped("");
          }
        }}
      >
        <DialogContent className="sm:max-w-lg rounded-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle>אישור שליחה — שני שלבים</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 text-sm">
            <div className="bg-muted/60 rounded-lg p-3 space-y-1">
              <p>
                <span className="text-muted-foreground">נושא: </span>
                <strong>{subject}</strong>
              </p>
              <p>
                <span className="text-muted-foreground">נמענים בשליחה: </span>
                <strong className="text-lg text-indigo-700">{expectedRecipientCount}</strong>
              </p>
            </div>
            <div className="max-h-28 overflow-y-auto space-y-0.5 border rounded-md p-2 bg-background">
              {targetContacts.slice(0, 12).map((c) => (
                <p key={c.id} className="text-xs text-muted-foreground truncate">
                  • {c.name ? `${c.name} · ` : ""}
                  {c.email}
                </p>
              ))}
              {targetContacts.length > 12 && (
                <p className="text-xs text-muted-foreground">…ועוד {targetContacts.length - 12}</p>
              )}
            </div>

            <label className="flex items-start gap-2 cursor-pointer">
              <Checkbox checked={approvalRead} onCheckedChange={(v) => setApprovalRead(!!v)} />
              <span className="text-sm leading-snug">
                אישרתי את הנושא, התוכן ורשימת הנמענים. אני מבין שלא ניתן לבטל לאחר השליחה.
              </span>
            </label>

            <div className="space-y-1">
              <label htmlFor="confirm-count" className="text-xs font-medium">
                הקלד את <strong>מספר הנמענים</strong> לאישור סופי ({expectedRecipientCount})
              </label>
              <Input
                id="confirm-count"
                dir="ltr"
                className="text-center font-mono"
                placeholder={String(expectedRecipientCount)}
                value={confirmCountTyped}
                onChange={(e) => setConfirmCountTyped(e.target.value.replace(/\D/g, ""))}
                autoComplete="off"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 flex-col sm:flex-row">
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              חזרה לעריכה
            </Button>
            <Button
              className="bg-indigo-600 hover:bg-indigo-700"
              onClick={() => void handleConfirmSend()}
              disabled={sending || !canFinalSend}
            >
              <SendIcon className="size-4 ml-1" />
              שלח עכשיו
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={aiOpen} onOpenChange={setAiOpen}>
        <DialogContent className="sm:max-w-lg rounded-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <SparklesIcon className="size-4 text-indigo-500" />
              מחולל טקסט AI (יישור לימין)
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div>
              <label className="text-sm font-medium block mb-1">הקשר לכתיבה</label>
              <Textarea
                dir="rtl"
                className="resize-none text-sm text-right"
                placeholder='לדוגמה: ספר תורה בגודל 48, כתב בית יוסף, מחיר 85,000 ₪. קהל: סוחרים.'
                value={aiContext}
                onChange={(e) => setAiContext(e.target.value)}
                rows={4}
              />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">סגנון (אופציונלי)</label>
              <Textarea
                dir="rtl"
                className="resize-none text-sm text-right"
                placeholder="חמים ומקצועי, תמציתי, קריאה לפעולה…"
                value={aiStyle}
                onChange={(e) => setAiStyle(e.target.value)}
                rows={2}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              הפלט יוזן לעורך עם יישור לימין. תמיד עברו על הניסוח לפני אישור השליחה.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setAiOpen(false)}>
              ביטול
            </Button>
            <Button
              className="bg-indigo-600 hover:bg-indigo-700 gap-1.5"
              onClick={() => void handleGenerate()}
              disabled={aiLoading || !aiContext.trim()}
            >
              <SparklesIcon className="size-3.5" />
              {aiLoading ? "יוצר…" : "צור גוף מייל"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
