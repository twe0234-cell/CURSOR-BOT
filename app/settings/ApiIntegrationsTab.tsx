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
import { PencilIcon, ChevronDownIcon, ChevronUpIcon, KeyIcon, MailIcon } from "lucide-react";

type Props = {
  defaultGreenApiId: string;
  defaultGreenApiToken: string;
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
  defaultAllowedTags,
  gmailConnected = false,
  gmailEmail = null,
}: Props) {
  const [greenApiId, setGreenApiId] = useState(defaultGreenApiId);
  const [greenApiToken, setGreenApiToken] = useState(defaultGreenApiToken);
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setLoading(true);
    try {
      const result = await saveUserSettings(greenApiId, greenApiToken, allowedTags);
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
