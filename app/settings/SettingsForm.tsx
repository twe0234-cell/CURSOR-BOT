"use client";

import { useState } from "react";
import { saveUserSettings } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { XIcon, PlusIcon, ChevronDownIcon, ChevronUpIcon, KeyIcon, MailIcon } from "lucide-react";

type Props = {
  defaultGreenApiId: string;
  defaultGreenApiToken: string;
  defaultAllowedTags: string[];
};

export default function SettingsForm({
  defaultGreenApiId,
  defaultGreenApiToken,
  defaultAllowedTags,
}: Props) {
  const [greenApiId, setGreenApiId] = useState(defaultGreenApiId);
  const [greenApiToken, setGreenApiToken] = useState(defaultGreenApiToken);
  const [allowedTags, setAllowedTags] = useState<string[]>(
    Array.isArray(defaultAllowedTags) ? defaultAllowedTags : []
  );
  const [newTag, setNewTag] = useState("");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [apiKeysOpen, setApiKeysOpen] = useState(false);
  const [gmailOpen, setGmailOpen] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setLoading(true);
    try {
      const result = await saveUserSettings(greenApiId, greenApiToken, allowedTags);
      if (result.success) {
        setMessage({ type: "success", text: "ההגדרות נשמרו בהצלחה" });
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
    <form onSubmit={handleSubmit} className="space-y-8">
      <div className="rounded-2xl border border-teal-100 bg-white shadow-sm overflow-hidden">
        <button
          type="button"
          onClick={() => setApiKeysOpen((o) => !o)}
          className="flex w-full items-center justify-between p-4 text-right hover:bg-slate-50 transition-colors"
        >
          <span className="flex items-center gap-2 text-lg font-semibold text-teal-800">
            <KeyIcon className="size-5 text-teal-600" />
            מפתחות Green API
          </span>
          {apiKeysOpen ? <ChevronUpIcon className="size-5" /> : <ChevronDownIcon className="size-5" />}
        </button>
        {apiKeysOpen && (
          <div className="border-t border-teal-100 p-6 space-y-4">
            <p className="text-sm text-muted-foreground">
              הזן את פרטי הגישה מ־<a href="https://green-api.com" target="_blank" rel="noopener noreferrer" className="text-teal-600 hover:underline">green-api.com</a>
            </p>
            <div>
              <label htmlFor="green_api_id" className="mb-2 block text-sm font-medium text-slate-700">Instance ID</label>
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
              <label htmlFor="green_api_token" className="mb-2 block text-sm font-medium text-slate-700">API Token</label>
              <input
                id="green_api_token"
                type="password"
                value={greenApiToken}
                onChange={(e) => setGreenApiToken(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-4 py-2.5 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                placeholder="הזן את ה-API Token"
              />
            </div>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-teal-100 bg-white shadow-sm overflow-hidden">
        <button
          type="button"
          onClick={() => setGmailOpen((o) => !o)}
          className="flex w-full items-center justify-between p-4 text-right hover:bg-slate-50 transition-colors"
        >
          <span className="flex items-center gap-2 text-lg font-semibold text-teal-800">
            <MailIcon className="size-5 text-teal-600" />
            חיבור Gmail (דיוור אימייל)
          </span>
          {gmailOpen ? <ChevronUpIcon className="size-5" /> : <ChevronDownIcon className="size-5" />}
        </button>
        {gmailOpen && (
          <div className="border-t border-teal-100 p-6 space-y-4">
            <p className="text-sm text-muted-foreground">
              לשליחת אימיילים דרך Gmail שלך – התגובות יגיעו לתיבת הדואר, והמערכת תעקוב אחר פתיחות, קליקים ובקשות הסרה.
            </p>
            <p className="text-xs text-slate-500">
              נדרש הגדרת OAuth 2.0 ב־Google Cloud Console. בשלב זה התשתית מוכנה – חיבור Gmail יופעל בגרסה הבאה.
            </p>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-teal-100 bg-white p-6 shadow-sm">
        <h3 className="mb-2 text-lg font-semibold text-teal-800">
          תגיות מערכת
        </h3>
        <p className="mb-3 text-xs text-slate-500">
          תגיות אלה יהיו זמינות לבחירה בדף הנמענים
        </p>
        <div className="flex gap-2 mb-3">
          <Input
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            placeholder="הוסף תגית חדשה"
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
            className="rounded-xl"
          />
          <Button type="button" variant="outline" onClick={addTag} size="icon" className="rounded-xl">
            <PlusIcon className="size-4" />
          </Button>
        </div>
        {allowedTags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {allowedTags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 rounded-full bg-teal-100 px-3 py-1.5 text-sm font-medium text-teal-800"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  className="rounded-full p-0.5 hover:bg-teal-200"
                  aria-label={`הסר ${tag}`}
                >
                  <XIcon className="size-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {message && (
        <div
          className={`rounded-lg p-3 text-sm ${
            message.type === "success"
              ? "bg-green-50 text-green-700"
              : "bg-red-50 text-red-600"
          }`}
        >
          {message.text}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-xl bg-teal-600 px-4 py-3 font-semibold text-white transition-all hover:bg-teal-700 disabled:opacity-50 hover:shadow-lg"
      >
        {loading ? "שומר..." : "שמור הגדרות"}
      </button>
    </form>
  );
}
