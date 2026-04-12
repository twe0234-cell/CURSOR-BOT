"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fetchEmailContacts, getGmailStatus } from "@/app/email/actions";
import { sendGmailCampaignAction, fetchCampaignStats, type CampaignStat } from "./actions";
import EmailComposer from "./EmailComposer";
import type { EmailContact } from "@/app/email/actions";
import {
  KeyIcon,
  SparklesIcon,
  SendIcon,
  BarChart2Icon,
  SmartphoneIcon,
  MonitorIcon,
  TabletIcon,
} from "lucide-react";

type Props = {
  initialContacts: EmailContact[];
  signature: string | null;
};

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

export default function CampaignsClient({ initialContacts, signature }: Props) {
  const [contacts, setContacts] = useState(initialContacts);
  const [gmailConnected, setGmailConnected] = useState(false);
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);

  // Confirmation dialog
  const [confirmOpen, setConfirmOpen] = useState(false);

  // AI generator
  const [aiOpen, setAiOpen] = useState(false);
  const [aiContext, setAiContext] = useState("");
  const [aiStyle, setAiStyle] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  // Stats tab
  const [campaigns, setCampaigns] = useState<CampaignStat[]>([]);
  const [statsLoading, setStatsLoading] = useState(false);

  const subscribedContacts = useMemo(
    () => contacts.filter((c) => c.subscribed !== false),
    [contacts]
  );

  useEffect(() => {
    getGmailStatus().then((r) => {
      if (r.success && r.connected) setGmailConnected(true);
    });
    fetchEmailContacts().then((r) => {
      if (r.success) setContacts(r.contacts);
    });
  }, []);

  const loadStats = () => {
    setStatsLoading(true);
    fetchCampaignStats().then((r) => {
      setStatsLoading(false);
      if (r.success) setCampaigns(r.campaigns);
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

  const toggleSelectAll = () => {
    if (selected.size === subscribedContacts.length && subscribedContacts.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(subscribedContacts.map((c) => c.id)));
    }
  };

  const targetIds = selected.size > 0 ? [...selected] : subscribedContacts.map((c) => c.id);
  const targetContacts = contacts.filter((c) => targetIds.includes(c.id));

  // ── Confirm → Send ──────────────────────────────────────────────────
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
      toast.success(`✅ נשלחו ${res.sent} אימיילים${res.failed > 0 ? `, ${res.failed} נכשלו` : ""}`);
      setSubject("");
      setBodyHtml("");
      setAttachments([]);
      setSelected(new Set());
      loadStats();
    } else {
      toast.error(res.error);
    }
  };

  // ── AI Generator ────────────────────────────────────────────────────
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
        body: JSON.stringify({ context: aiContext, style: aiStyle }),
      });
      const data = await res.json() as { html?: string; error?: string };
      if (!res.ok || data.error) {
        toast.error(data.error ?? "שגיאת AI");
      } else if (data.html) {
        setBodyHtml(data.html);
        setAiOpen(false);
        toast.success("טקסט נוצר — בדוק ועצב לפי הצורך");
      }
    } catch {
      toast.error("שגיאת רשת");
    } finally {
      setAiLoading(false);
    }
  };

  if (!gmailConnected) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <KeyIcon className="size-16 text-sky-500" />
        <h3 className="text-lg font-semibold text-slate-700">חיבור Gmail</h3>
        <p className="text-center text-muted-foreground max-w-md">
          לחיבור Gmail – הגדר OAuth בהגדרות
        </p>
        <Link href="/settings">
          <Button variant="outline" className="rounded-xl">הגדרות</Button>
        </Link>
      </div>
    );
  }

  return (
    <>
      <Tabs defaultValue="compose" onValueChange={(v) => v === "stats" && loadStats()}>
        <TabsList className="mb-4">
          <TabsTrigger value="compose">✍️ כתיבה ושליחה</TabsTrigger>
          <TabsTrigger value="stats">📊 היסטוריה וסטטיסטיקות</TabsTrigger>
        </TabsList>

        {/* ── Compose tab ──────────────────────────────────────────── */}
        <TabsContent value="compose">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="shadow-sm rounded-xl border-slate-200">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold">כתיבת קמפיין</CardTitle>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-indigo-600 border-indigo-300 hover:bg-indigo-50"
                    onClick={() => setAiOpen(true)}
                  >
                    <SparklesIcon className="size-3.5" />
                    AI כתיבה
                  </Button>
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
                <CardTitle className="text-base font-semibold">נמענים</CardTitle>
                <CardDescription>בחר אנשי קשר (מנויים בלבד)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button variant="outline" size="sm" onClick={toggleSelectAll} className="rounded-xl">
                  {selected.size === subscribedContacts.length && subscribedContacts.length > 0
                    ? "בטל בחירה"
                    : "בחר את כל המנויים"}
                </Button>
                <p className="text-sm text-muted-foreground">{targetIds.length} נמענים יקבלו</p>
                <div className="max-h-52 overflow-y-auto space-y-1 border rounded-lg p-2">
                  {subscribedContacts.slice(0, 50).map((c) => (
                    <label
                      key={c.id}
                      className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 rounded px-2 py-1"
                    >
                      <Checkbox
                        checked={selected.has(c.id)}
                        onCheckedChange={() => toggleSelect(c.id)}
                      />
                      <span className="text-sm truncate">{c.name ? `${c.name} — ` : ""}{c.email}</span>
                    </label>
                  ))}
                  {subscribedContacts.length > 50 && (
                    <p className="text-xs text-muted-foreground px-2">+{subscribedContacts.length - 50} נוספים</p>
                  )}
                  {subscribedContacts.length === 0 && (
                    <p className="text-xs text-muted-foreground py-4 text-center">אין מנויים פעילים</p>
                  )}
                </div>
                <Button
                  onClick={() => {
                    if (!subject.trim()) { toast.error("הזן נושא"); return; }
                    if (targetIds.length === 0) { toast.error("אין נמענים"); return; }
                    setConfirmOpen(true);
                  }}
                  disabled={sending || !subject.trim() || targetIds.length === 0}
                  className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-700 py-6 gap-2"
                >
                  <SendIcon className="size-4" />
                  {sending ? "שולח..." : "שלח קמפיין"}
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Stats tab ────────────────────────────────────────────── */}
        <TabsContent value="stats">
          {statsLoading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">טוען...</p>
          ) : campaigns.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">לא נשלחו קמפיינים עדיין</p>
          ) : (
            <div className="space-y-3">
              {campaigns.map((c) => (
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
                        <span className="bg-slate-100 text-slate-700 rounded-full px-2.5 py-0.5">{c.sent_count} נשלחו</span>
                        {c.failed_count > 0 && (
                          <span className="bg-red-100 text-red-700 rounded-full px-2.5 py-0.5">{c.failed_count} נכשלו</span>
                        )}
                        <span className="bg-emerald-100 text-emerald-800 rounded-full px-2.5 py-0.5">
                          {c.open_count} נפתחו
                          {c.sent_count > 0 && (
                            <span className="mr-1 opacity-70">
                              ({Math.round((c.open_count / c.sent_count) * 100)}%)
                            </span>
                          )}
                        </span>
                      </div>
                    </div>
                    {(c.mobile_count + c.desktop_count + c.tablet_count) > 0 && (
                      <div className="flex gap-3 mt-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <SmartphoneIcon className="size-3" />{c.mobile_count} מובייל
                        </span>
                        <span className="flex items-center gap-1">
                          <MonitorIcon className="size-3" />{c.desktop_count} מחשב
                        </span>
                        <span className="flex items-center gap-1">
                          <TabletIcon className="size-3" />{c.tablet_count} טאבלט
                        </span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Confirmation Dialog ───────────────────────────────────────── */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>אישור שליחת קמפיין</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-sm">
            <div className="bg-muted/60 rounded-lg p-3 space-y-1">
              <p><span className="text-muted-foreground">נושא: </span><strong>{subject}</strong></p>
              <p><span className="text-muted-foreground">נמענים: </span><strong>{targetIds.length}</strong></p>
            </div>
            <div className="max-h-32 overflow-y-auto space-y-0.5">
              {targetContacts.slice(0, 10).map((c) => (
                <p key={c.id} className="text-xs text-muted-foreground truncate">
                  • {c.name ? `${c.name} ` : ""}&lt;{c.email}&gt;
                </p>
              ))}
              {targetContacts.length > 10 && (
                <p className="text-xs text-muted-foreground">... ועוד {targetContacts.length - 10}</p>
              )}
            </div>
            <p className="text-amber-600 text-xs font-medium">
              ⚠️ לאחר השליחה לא ניתן לבטל. בדוק שהכל תקין לפני אישור.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>חזרה לעריכה</Button>
            <Button
              className="bg-indigo-600 hover:bg-indigo-700"
              onClick={handleConfirmSend}
              disabled={sending}
            >
              <SendIcon className="size-4 ml-1" />
              אישור — שלח עכשיו
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── AI Generator Dialog ────────────────────────────────────────── */}
      <Dialog open={aiOpen} onOpenChange={setAiOpen}>
        <DialogContent className="sm:max-w-lg rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <SparklesIcon className="size-4 text-indigo-500" />
              מחולל טקסט AI
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div>
              <label className="text-sm font-medium block mb-1">הקשר לכתיבה</label>
              <Textarea
                dir="rtl"
                placeholder={"לדוגמה: ספר תורה בגודל 48 ס\"מ, כתב בית יוסף, קלף גסות, מחיר 85,000 ₪. קהל: סוחרים וגבאים."}
                value={aiContext}
                onChange={(e) => setAiContext(e.target.value)}
                rows={4}
                className="resize-none text-sm"
              />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">סגנון (אופציונלי)</label>
              <Textarea
                dir="rtl"
                placeholder="לדוגמה: חמים ואישי, תמציתי, עם קריאה לפעולה חזקה..."
                value={aiStyle}
                onChange={(e) => setAiStyle(e.target.value)}
                rows={2}
                className="resize-none text-sm"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              הטקסט שייווצר יוכנס ישירות לעורך — תוכל לערוך ולשכלל לפי הצורך.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setAiOpen(false)}>ביטול</Button>
            <Button
              className="bg-indigo-600 hover:bg-indigo-700 gap-1.5"
              onClick={handleGenerate}
              disabled={aiLoading || !aiContext.trim()}
            >
              <SparklesIcon className="size-3.5" />
              {aiLoading ? "יוצר..." : "צור טקסט"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
