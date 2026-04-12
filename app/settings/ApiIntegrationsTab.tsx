"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { saveUserSettings, disconnectGmail } from "./actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PencilIcon, ChevronDownIcon, ChevronUpIcon, KeyIcon, MailIcon, ClipboardCopyIcon, CheckIcon } from "lucide-react";

type Props = {
  defaultGreenApiId: string;
  defaultGreenApiToken: string;
  defaultWaMarketGroupId: string;
  defaultAllowedTags: string[];
  gmailConnected?: boolean;
  gmailEmail?: string | null;
};

function maskToken(token: string): string {
  if (!token || token.length < 4) return "••••••••";
  return "••••••••" + token.slice(-4);
}

export default function ApiIntegrationsTab({
  defaultGreenApiId,
  defaultGreenApiToken,
  defaultWaMarketGroupId,
  defaultAllowedTags,
  gmailConnected = false,
  gmailEmail = null,
}: Props) {
  const [greenApiId, setGreenApiId] = useState(defaultGreenApiId);
  const [greenApiToken, setGreenApiToken] = useState(defaultGreenApiToken);
  const [waMarketGroupId, setWaMarketGroupId] = useState(defaultWaMarketGroupId);
  const [allowedTags, setAllowedTags] = useState<string[]>(
    Array.isArray(defaultAllowedTags) ? defaultAllowedTags : []
  );
  const [newTag, setNewTag] = useState("");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [credentialsEditOpen, setCredentialsEditOpen] = useState(false);
  const [gmailOpen, setGmailOpen] = useState(true);
  const searchParams = useSearchParams();

  useEffect(() => {
    setWaMarketGroupId(defaultWaMarketGroupId);
  }, [defaultWaMarketGroupId]);

  useEffect(() => {
    const gmail = searchParams.get("gmail");
    const err = searchParams.get("gmail_error");
    if (gmail === "connected") {
      setMessage({ type: "success", text: "Gmail מחובר בהצלחה" });
      setGmailOpen(true);
    } else if (err) {
      const errMsg: Record<string, string> = {
        config: "חסרים GOOGLE_CLIENT_ID או GOOGLE_CLIENT_SECRET",
        no_refresh: "לא התקבל refresh token – נסה שוב",
        token_exchange: "שגיאה בהחלפת קוד",
        invalid_state: "פג תוקף – נסה שוב",
      };
      setMessage({ type: "error", text: errMsg[err] ?? `שגיאה: ${err}` });
      setGmailOpen(true);
    }
  }, [searchParams]);

  const isConfigured = !!(greenApiId?.trim() && greenApiToken?.trim());
  const [copied, setCopied] = useState(false);

  const webhookBaseUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/whatsapp-webhook?token=`
      : "/api/whatsapp-webhook?token=";

  function copyWebhookUrl() {
    navigator.clipboard.writeText(webhookBaseUrl + "YOUR_WEBHOOK_SECRET").then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setLoading(true);
    try {
      const result = await saveUserSettings(
        greenApiId,
        greenApiToken,
        allowedTags,
        waMarketGroupId
      );
      if (result.success) {
        setMessage({ type: "success", text: "ההגדרות נשמרו בהצלחה" });
        setCredentialsEditOpen(false);
      } else {
        setMessage({ type: "error", text: result.error });
      }
    } catch {
      setMessage({ type: "error", text: "שגיאה לא צפויה" });
    } finally {
      setLoading(false);
    }
  }

  const addTag = () => {
    const t = newTag.trim();
    if (t && !allowedTags.includes(t)) {
      setAllowedTags((prev) => [...prev, t].sort());
      setNewTag("");
    }
  };

  const removeTag = (tag: string) => {
    setAllowedTags((prev) => prev.filter((x) => x !== tag));
  };

  return (
    <div className="space-y-8">
      {message && (
        <div className={`rounded-lg p-3 text-sm ${message.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>
          {message.text}
        </div>
      )}

      <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <KeyIcon className="size-5 text-accent" />
            <div>
              <p className="font-semibold text-foreground">Green API</p>
              <p className="text-sm text-muted-foreground">
                Instance: {greenApiId ? maskToken(greenApiId) : "—"} · Token: {greenApiToken ? maskToken(greenApiToken) : "—"}
              </p>
              {waMarketGroupId && (
                <p className="text-xs text-muted-foreground">קבוצה: {waMarketGroupId}</p>
              )}
            </div>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${isConfigured ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-600"}`}>
              {isConfigured ? "🟢 מוגדר" : "⚪ לא מוגדר"}
            </span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setCredentialsEditOpen(true)}
            className="rounded-xl"
          >
            <PencilIcon className="size-4 ml-1" />
            ערוך
          </Button>
        </div>

        {/* Webhook URL guidance */}
        <div className="border-t border-border px-4 py-3 bg-muted/30">
          <p className="text-xs font-medium text-foreground mb-1">
            ⚙️ URL לשדה Webhook ב-Green API (הגדרות האינסטנס):
          </p>
          <div className="flex items-center gap-2 rounded-lg bg-background border border-border px-3 py-2 font-mono text-xs text-muted-foreground overflow-x-auto" dir="ltr">
            <span className="flex-1 select-all truncate">{webhookBaseUrl}<span className="text-amber-600 font-semibold">YOUR_WEBHOOK_SECRET</span></span>
            <button
              type="button"
              onClick={copyWebhookUrl}
              className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
              title="העתק URL"
            >
              {copied ? <CheckIcon className="size-4 text-green-600" /> : <ClipboardCopyIcon className="size-4" />}
            </button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            החלף <code className="bg-muted px-1 rounded text-amber-600">YOUR_WEBHOOK_SECRET</code> בערך של <code className="bg-muted px-1 rounded">WEBHOOK_SECRET</code> מהגדרות Vercel.
          </p>
          <p className="text-xs mt-1 font-medium text-amber-700 bg-amber-50 rounded px-2 py-1">
            ⚠️ ב-Green API → Notifications: הפעל גם <strong>Incoming messages</strong> וגם <strong>Outgoing messages</strong>.
            אם אתה שולח מהמכשיר שלך בלבד (קבוצה עצמית) — חייב להפעיל <strong>Outgoing</strong>.
          </p>
        </div>
      </div>

      <Dialog open={credentialsEditOpen} onOpenChange={setCredentialsEditOpen}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle>עריכת מפתחות Green API</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-sm text-muted-foreground mb-4">
              <a href="https://green-api.com" target="_blank" rel="noopener noreferrer" className="text-teal-600 hover:underline">green-api.com</a>
            </p>
            <div>
              <label htmlFor="green_api_id" className="mb-2 block text-sm font-medium text-slate-700">Instance ID (idInstance)</label>
              <input
                id="green_api_id"
                type="text"
                value={greenApiId}
                onChange={(e) => setGreenApiId(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-4 py-2.5 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                placeholder="הזן את ה-Instance ID"
              />
            </div>
            <div>
              <label htmlFor="green_api_token" className="mb-2 block text-sm font-medium text-slate-700">API Token (apiTokenInstance)</label>
              <input
                id="green_api_token"
                type="password"
                value={greenApiToken}
                onChange={(e) => setGreenApiToken(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-4 py-2.5 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                placeholder="הזן את ה-API Token"
              />
            </div>
            <div>
              <label
                htmlFor="wa_market_group_id"
                className="mb-2 block text-sm font-medium text-slate-700"
              >
                קבוצת וואטסאפ למאגר (Chat ID)
              </label>

              <input
                id="wa_market_group_id"
                type="text"
                value={waMarketGroupId}
                onChange={(e) => setWaMarketGroupId(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-4 py-2.5 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                dir="ltr"
                placeholder="למשל xxxxx@g.us"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">תגיות מערכת</label>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  placeholder="הוסף תגית"
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
                  className="flex-1 rounded-xl border border-slate-300 px-3 py-2"
                />
                <Button type="button" variant="outline" onClick={addTag} size="sm" className="rounded-xl">+</Button>
              </div>
              {allowedTags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {allowedTags.map((tag) => (
                    <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-secondary text-secondary-foreground px-2 py-0.5 text-sm">
                      {tag}
                      <button type="button" onClick={() => removeTag(tag)} className="hover:text-red-600">×</button>
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button type="button" variant="outline" onClick={() => setCredentialsEditOpen(false)}>ביטול</Button>
              <Button type="submit" disabled={loading}>{loading ? "שומר..." : "שמור"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
        <button
          type="button"
          onClick={() => setGmailOpen((o) => !o)}
          className="flex w-full items-center justify-between p-4 text-right hover:bg-muted/50 transition-colors"
        >
          <span className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <MailIcon className="size-5 text-accent" />
            חיבור Gmail (דיוור אימייל)
          </span>
          {gmailOpen ? <ChevronUpIcon className="size-5" /> : <ChevronDownIcon className="size-5" />}
        </button>
        {gmailOpen && (
          <div className="border-t border-border p-6 space-y-4">
            <p className="text-sm text-muted-foreground">
              לשליחת אימיילים דרך Gmail – התגובות יגיעו לתיבת הדואר, והמערכת תעקוב אחר פתיחות, קליקים ובקשות הסרה.
            </p>
            {gmailConnected ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
                  <span>🟢 מחובר</span>
                  {gmailEmail && <span className="text-green-600">({gmailEmail})</span>}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-xl text-red-600 border-red-200 hover:bg-red-50 w-fit"
                  onClick={async () => {
                    const res = await disconnectGmail();
                    if (res.success) {
                      setMessage({ type: "success", text: "Gmail נותק" });
                      window.location.reload();
                    } else {
                      setMessage({ type: "error", text: res.error });
                    }
                  }}
                >
                  נתק Gmail
                </Button>
              </div>
            ) : (
              <a href="/api/auth/gmail">
                <Button type="button" variant="outline" className="rounded-xl">
                  חבר Gmail (OAuth)
                </Button>
              </a>
            )}
          </div>
        )}
      </div>

    </div>
  );
}
