"use client";

import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  fetchTargetsByTags,
  fetchTargetsByGroupIds,
  uploadMedia,
  fetchBroadcastLogs,
  fetchBroadcastQueueItems,
  fetchNextScribeNumber,
  sendSingleMessage,
  insertBroadcastLog,
  type BroadcastLog,
  type QueueItem,
} from "./actions";
import { SendIcon, VariableIcon, SmileIcon, CheckCircleIcon, XCircleIcon, HistoryIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import dynamic from "next/dynamic";

const EmojiPicker = dynamic(
  () => import("emoji-picker-react").then((mod) => mod.default),
  { ssr: false }
);

const VARIABLES = [
  { key: "Name", label: "שם הנמען" },
  { key: "name", label: "שם (alternate)" },
];

type GroupOption = { wa_chat_id: string; name: string | null };

type Props = {
  allTags: string[];
  prefilledMessage?: string;
  groups?: GroupOption[];
};

export default function BroadcastClient({
  allTags,
  prefilledMessage = "",
  groups = [],
}: Props) {
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [messageText, setMessageText] = useState(prefilledMessage);
  const [imageUrl, setImageUrl] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [targetCount, setTargetCount] = useState<number | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [logs, setLogs] = useState<BroadcastLog[]>([]);
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [activeTab, setActiveTab] = useState("compose");
  const [scribeCode, setScribeCode] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [nextScribeNum, setNextScribeNum] = useState(121);
  const [sendProgress, setSendProgress] = useState<{ current: number; total: number } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetchNextScribeNumber().then((res) => {
      if (res.success) setNextScribeNum(res.next);
    });
    fetchBroadcastLogs().then((res) => {
      if (res.success) setLogs(res.logs);
    });
    fetchBroadcastQueueItems().then((res) => {
      if (res.success) setQueueItems(res.items);
    });
  }, []);

  const refreshLogs = () => {
    fetchBroadcastLogs().then((res) => {
      if (res.success) setLogs(res.logs);
    });
    fetchBroadcastQueueItems().then((res) => {
      if (res.success) setQueueItems(res.items);
    });
  };

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
    setTargetCount(null);
  };

  const toggleGroup = (waChatId: string) => {
    setSelectedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(waChatId)) next.delete(waChatId);
      else next.add(waChatId);
      return next;
    });
    setTargetCount(null);
  };

  const insertVariable = (key: string) => {
    setMessageText((prev) => prev + `{${key}}`);
  };

  const insertAtCursor = (text: string) => {
    const ta = textareaRef.current;
    if (ta) {
      const start = ta.selectionStart ?? 0;
      const end = ta.selectionEnd ?? start;
      const before = messageText.slice(0, start);
      const after = messageText.slice(end);
      setMessageText(before + text + after);
      setTimeout(() => {
        ta.focus();
        ta.setSelectionRange(start + text.length, start + text.length);
      }, 0);
    } else {
      setMessageText((prev) => prev + text);
    }
    setEmojiOpen(false);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("נא לבחור קובץ תמונה");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("התמונה חורגת ממגבלת 5MB");
      e.target.value = "";
      return;
    }
    setImageFile(file);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await uploadMedia(fd);
      if (res.success) {
        setImageUrl(res.url);
        toast.success("התמונה הועלתה");
      } else {
        toast.error(res.error);
        setImageFile(null);
      }
    } catch {
      toast.error("שגיאה בהעלאת התמונה");
      setImageFile(null);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handlePreviewCount = async () => {
    if (selectedTags.size === 0 && selectedGroups.size === 0) {
      toast.error("בחר לפחות תגית אחת או קבוצה");
      return;
    }
    const tagTargets = selectedTags.size > 0
      ? await fetchTargetsByTags([...selectedTags])
      : { success: true as const, targets: [] };
    const groupTargets = selectedGroups.size > 0
      ? await fetchTargetsByGroupIds([...selectedGroups])
      : { success: true as const, targets: [] };
    if (!tagTargets.success) {
      toast.error(tagTargets.error);
      return;
    }
    if (!groupTargets.success) {
      toast.error(groupTargets.error);
      return;
    }
    const seen = new Set<string>();
    const combined = [...tagTargets.targets, ...groupTargets.targets].filter((t) => {
      if (seen.has(t.wa_chat_id)) return false;
      seen.add(t.wa_chat_id);
      return true;
    });
    setTargetCount(combined.length);
    toast.info(`נמענים: ${combined.length}`);
  };

  const handleSend = async () => {
    if (selectedTags.size === 0 && selectedGroups.size === 0) {
      toast.error("בחר לפחות תגית אחת או קבוצה");
      return;
    }
    if (!messageText.trim()) {
      toast.error("הזן טקסט להודעה");
      return;
    }

    const finalImageUrl = imageUrl.trim();
    if (imageFile && !finalImageUrl && uploading === false) {
      toast.error("ממתין להעלאת התמונה");
      return;
    }

    setLoading(true);
    try {
      const tagRes = selectedTags.size > 0
        ? await fetchTargetsByTags([...selectedTags])
        : { success: true as const, targets: [] };
      const groupRes = selectedGroups.size > 0
        ? await fetchTargetsByGroupIds([...selectedGroups])
        : { success: true as const, targets: [] };
      if (!tagRes.success) {
        toast.error(tagRes.error);
        setLoading(false);
        return;
      }
      if (!groupRes.success) {
        toast.error(groupRes.error);
        setLoading(false);
        return;
      }
      const seen = new Set<string>();
      const targets = [...tagRes.targets, ...groupRes.targets].filter((t) => {
        if (seen.has(t.wa_chat_id)) return false;
        seen.add(t.wa_chat_id);
        return true;
      });
      if (targets.length === 0) {
        toast.error("אין נמענים התואמים לתגיות או לקבוצות שנבחרו");
        setLoading(false);
        return;
      }

      const total = targets.length;
      let sent = 0;
      let failed = 0;
      const errors: string[] = [];
      const finalScribe = scribeCode.trim() || undefined;

      for (let i = 0; i < targets.length; i++) {
        setSendProgress({ current: i + 1, total });
        const target = targets[i];
        try {
          const vars = { Name: target.name ?? "", name: target.name ?? "" };
          let msg = messageText.trim();
          msg = msg.replace(/\{Name\}/gi, vars.Name).replace(/\{name\}/gi, vars.name);

          const res = await sendSingleMessage(
            target.wa_chat_id,
            msg,
            finalImageUrl || undefined,
            finalScribe
          );
          if (res.success) {
            sent++;
          } else {
            failed++;
            errors.push(`${target.wa_chat_id}: ${res.error}`);
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : "שגיאה לא צפויה";
          console.error(`Failed for ${target.wa_chat_id}`, err);
          failed++;
          errors.push(`${target.wa_chat_id}: ${msg}`);
        }
        if (i < targets.length - 1) {
          await new Promise((r) => setTimeout(r, 2000));
        }
      }

      setSendProgress(null);
      await insertBroadcastLog(
        sent,
        failed,
        errors,
        [...selectedTags],
        finalScribe,
        internalNotes.trim() || undefined
      );
      toast.success(
        `שידור הושלם! נשלח בהצלחה: ${sent}, נכשלו: ${failed}`,
        { duration: failed > 0 ? 6000 : 4000 }
      );
      setScribeCode("");
      setInternalNotes("");
      setSelectedGroups(new Set());
      fetchNextScribeNumber().then((r) => {
        if (r.success) setNextScribeNum(r.next);
      });
      refreshLogs();
    } catch {
      setSendProgress(null);
      toast.error("שגיאה לא צפויה");
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (s: string) => {
    const d = new Date(s);
    return d.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  };

  const renderLogDetails = (item: QueueItem) => {
    const details = item.log_details as Array<{ chatId?: string; ok?: boolean; error?: string; response?: unknown }> | null;
    if (!details || !Array.isArray(details)) return null;
    const failed = details.filter((d) => !d.ok);
    if (failed.length === 0) return null;
    return (
      <ul className="mt-2 space-y-1 text-xs text-red-600 max-h-32 overflow-y-auto">
        {failed.map((d, i) => (
          <li key={i} className="break-words">
            {d.chatId && <span className="font-mono">{d.chatId}: </span>}
            {d.error ?? (typeof d.response === "object" ? JSON.stringify(d.response) : String(d.response))}
          </li>
        ))}
      </ul>
    );
  };

  return (
    <div className="w-full max-w-screen-xl mx-auto px-4 py-6 sm:py-8 min-w-0 overflow-hidden">
      <div className="mb-6">
        <h1 className="text-3xl sm:text-4xl font-bold text-teal-800 mb-2">שידור הודעות</h1>
        <p className="text-muted-foreground">שלח הודעות WhatsApp לנמענים לפי תגיות</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="mb-6 w-full sm:w-auto">
          <TabsTrigger value="compose">שידור חדש</TabsTrigger>
          <TabsTrigger value="logs">
            <HistoryIcon className="size-4 ml-1" />
            היסטוריית שידורים
          </TabsTrigger>
        </TabsList>

        <TabsContent value="compose" className="mt-0">
      <Card className="mb-6 border-teal-100 rounded-2xl shadow-sm overflow-hidden">
        <CardHeader>
          <h2 className="text-lg font-semibold text-teal-800">בחירת קהל יעד</h2>
          <p className="text-sm text-muted-foreground">
            בחר תגיות כדי לסנן נמענים
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {(allTags ?? []).map((tag) => (
              <label
                key={tag}
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 hover:bg-slate-50"
              >
                <Checkbox
                  checked={selectedTags.has(tag)}
                  onCheckedChange={() => toggleTag(tag)}
                />
                <span className="text-sm">{tag}</span>
              </label>
            ))}
          </div>
          {groups.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-sm font-medium text-slate-700">קבוצות ספציפיות</p>
              <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                {groups.map((g) => (
                  <label
                    key={g.wa_chat_id}
                    className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 hover:bg-slate-50"
                  >
                    <Checkbox
                      checked={selectedGroups.has(g.wa_chat_id)}
                      onCheckedChange={() => toggleGroup(g.wa_chat_id)}
                    />
                    <span className="text-sm truncate max-w-[180px]">{g.name || g.wa_chat_id}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
          {(allTags.length === 0 && groups.length === 0) && (
            <p className="text-sm text-muted-foreground">
              הוסף תגיות בהגדרות או בנמענים
            </p>
          )}
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={handlePreviewCount}
            disabled={selectedTags.size === 0 && selectedGroups.size === 0}
          >
            {targetCount !== null ? `נמענים: ${targetCount}` : "צפה במספר נמענים"}
          </Button>
        </CardContent>
      </Card>

      <Card className="mb-6 border-teal-100 rounded-2xl shadow-sm overflow-hidden">
        <CardHeader>
          <h2 className="text-lg font-semibold text-teal-800">הודעה</h2>
          <div className="flex flex-wrap gap-2">
            {VARIABLES.map((v) => (
              <Button
                key={v.key}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => insertVariable(v.key)}
              >
                <VariableIcon className="size-4 ml-1" />
                {`{${v.key}}`}
              </Button>
            ))}
            <div className="relative">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEmojiOpen((o) => !o)}
              >
                <SmileIcon className="size-4 ml-1" />
                אמוג&apos;י
              </Button>
              {emojiOpen && (
                <div className="absolute left-0 top-full z-50 mt-1">
                  <EmojiPicker
                    onEmojiClick={(emojiData) => insertAtCursor(emojiData.emoji)}
                  />
                </div>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              מק״ט סופר (Ref)
            </label>
            <div className="flex gap-2 mb-2">
              <Input
                value={scribeCode}
                onChange={(e) => setScribeCode(e.target.value)}
                placeholder="#121"
                className="rounded-xl max-w-[120px]"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setScribeCode(`#${nextScribeNum}`)}
                className="rounded-xl"
              >
                צור אוטומטי
              </Button>
            </div>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              הערות פנימיות
            </label>
            <Input
              value={internalNotes}
              onChange={(e) => setInternalNotes(e.target.value)}
              placeholder="שם סופר, מחיר מוסכם, תאריך..."
              className="rounded-xl"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              טקסט
            </label>
            <textarea
              ref={textareaRef}
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              placeholder="שלום {Name}, ..."
              rows={5}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              תמונה (אופציונלי)
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              disabled={uploading}
              className="block w-full text-sm text-slate-500 file:mr-4 file:rounded-lg file:border-0 file:bg-teal-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-teal-700 hover:file:bg-teal-100"
            />
            {uploading && (
              <p className="mt-2 text-sm text-muted-foreground">מעלה...</p>
            )}
            {imageUrl && !uploading && (
              <p className="mt-2 text-sm text-teal-600 truncate">
                {imageFile?.name || "תמונה הועלתה"}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Button
        onClick={handleSend}
        disabled={loading || (selectedTags.size === 0 && selectedGroups.size === 0) || uploading}
        className="w-full rounded-xl bg-teal-600 py-6 text-base font-semibold hover:bg-teal-700 hover:shadow-lg"
      >
        <SendIcon className={cn("size-4 ml-2", loading && "animate-pulse")} />
        {loading && sendProgress
          ? `שולח ${sendProgress.current}/${sendProgress.total}...`
          : loading
            ? "שולח..."
            : "שלח שידור"}
      </Button>
        </TabsContent>

        <TabsContent value="logs" className="mt-0">
          <Card className="border-teal-100 rounded-2xl shadow-sm overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-teal-800">היסטוריית שידורים</h2>
                <p className="text-sm text-muted-foreground">סטטוס ותגובות API מפורטות</p>
              </div>
              <Button variant="outline" size="sm" onClick={refreshLogs} className="rounded-xl">
                רענן
              </Button>
            </CardHeader>
            <CardContent>
              {queueItems.length === 0 && logs.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8">אין עדיין שידורים</p>
              ) : (
                <div className="space-y-4 max-h-[70vh] overflow-y-auto">
                  {queueItems.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-lg border border-slate-200 bg-slate-50/50 p-4 space-y-2"
                    >
                      <div className="flex flex-wrap items-center gap-2 sm:gap-4">
                        <span className="text-xs text-muted-foreground">{formatDate(item.created_at)}</span>
                        <span
                          className={cn(
                            "rounded-full px-2.5 py-0.5 text-xs font-medium",
                            item.status === "completed"
                              ? "bg-green-100 text-green-700"
                              : "bg-red-100 text-red-700"
                          )}
                        >
                          {item.status === "completed" ? "הושלם" : "נכשל"}
                        </span>
                        {item.result && (
                          <>
                            <span className="flex items-center gap-1 text-green-600">
                              <CheckCircleIcon className="size-4" />
                              {item.result.sent ?? 0}
                            </span>
                            <span className="flex items-center gap-1 text-red-600">
                              <XCircleIcon className="size-4" />
                              {item.result.failed ?? 0}
                            </span>
                          </>
                        )}
                      </div>
                      {item.result?.errors && item.result.errors.length > 0 && (
                        <details className="text-xs">
                          <summary className="cursor-pointer text-muted-foreground">שגיאות (result)</summary>
                          <ul className="mt-1 space-y-1 text-red-600">
                            {item.result.errors.slice(0, 5).map((e, i) => (
                              <li key={i} className="break-words">{e}</li>
                            ))}
                            {item.result.errors.length > 5 && <li>+{item.result.errors.length - 5} נוספות</li>}
                          </ul>
                        </details>
                      )}
                      {renderLogDetails(item)}
                    </div>
                  ))}
                  {logs.map((log) => (
                    <div
                      key={`log-${log.id}`}
                      className="rounded-lg border border-slate-100 bg-slate-50/30 p-3"
                    >
                      <div className="flex flex-wrap items-center gap-2 sm:gap-4">
                        <span className="text-xs text-muted-foreground">{formatDate(log.created_at)}</span>
                        <span className="flex items-center gap-1 text-green-600">
                          <CheckCircleIcon className="size-4" />
                          {log.sent}
                        </span>
                        <span className="flex items-center gap-1 text-red-600">
                          <XCircleIcon className="size-4" />
                          {log.failed}
                        </span>
                      </div>
                      {log.errors.length > 0 && (
                        <details className="mt-2 text-xs">
                          <summary className="cursor-pointer text-muted-foreground">שגיאות</summary>
                          <ul className="mt-1 space-y-1 text-red-600">
                            {log.errors.slice(0, 5).map((e, i) => (
                              <li key={i} className="break-words">{e}</li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
