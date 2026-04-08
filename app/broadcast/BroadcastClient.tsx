"use client";

import { useState, useRef, useEffect, useTransition } from "react";
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
  deleteBroadcastLog,
  type BroadcastLog,
  type QueueItem,
} from "./actions";
import { SendIcon, VariableIcon, SmileIcon, HistoryIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { isImageFile } from "@/lib/upload";
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
  const [isPending, startTransition] = useTransition();
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
    if (!isImageFile(file)) {
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
        console.error("[BroadcastClient] uploadMedia failed:", res.error);
        toast.error(res.error || "העלאה נכשלה");
        setImageFile(null);
        setImageUrl("");
      }
    } catch (err) {
      console.error("[BroadcastClient] uploadMedia exception:", err);
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

  const handleSend = () => {
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

    startTransition(() => {
      void (async () => {
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

      const progressInterval = 5;
      for (let i = 0; i < targets.length; i++) {
        if (i % progressInterval === 0 || i === targets.length - 1) {
          setSendProgress({ current: i + 1, total });
        }
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
          await new Promise((r) => setTimeout(r, 3000 + Math.floor(Math.random() * 2001)));
        }
      }

      setSendProgress(null);
      await insertBroadcastLog(
        sent,
        failed,
        errors,
        [...selectedTags],
        finalScribe,
        internalNotes.trim() || undefined,
        messageText.trim()
      );
      toast.success(
        `שידור הושלם! נשלח בהצלחה: ${sent}, נכשלו: ${failed}`,
        { duration: failed > 0 ? 6000 : 4000 }
      );
      setScribeCode("");
      setInternalNotes("");
      setSelectedGroups(new Set());
      setSelectedTags(new Set());
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
      })();
    });
  };

  const formatDateTime = (s: string) => {
    const d = new Date(s);
    return d.toLocaleString("he-IL", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="w-full max-w-screen-xl mx-auto px-4 py-6 sm:py-8 min-w-0 overflow-hidden">
      <div className="mb-6">
        <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-2">שידור הודעות</h1>
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
      <Card className="mb-6 border-border rounded-2xl shadow-sm overflow-hidden">
        <CardHeader>
          <h2 className="text-lg font-semibold text-foreground">בחירת קהל יעד</h2>
          <p className="text-sm text-muted-foreground">
            בחר תגיות כדי לסנן נמענים
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {(allTags ?? []).map((tag) => (
              <label
                key={tag}
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 hover:bg-muted/40"
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
              <p className="mb-2 text-sm font-medium text-foreground">קבוצות ספציפיות</p>
              <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                {groups.map((g) => (
                  <label
                    key={g.wa_chat_id}
                    className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 hover:bg-muted/40"
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

      <Card className="mb-6 border-border rounded-2xl shadow-sm overflow-hidden">
        <CardHeader>
          <h2 className="text-lg font-semibold text-foreground">הודעה</h2>
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
            <label className="mb-2 block text-sm font-medium text-foreground">
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
            <label className="mb-2 block text-sm font-medium text-foreground">
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
            <label className="mb-2 block text-sm font-medium text-foreground">
              טקסט
            </label>
            <textarea
              ref={textareaRef}
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              placeholder="שלום {Name}, ..."
              rows={5}
              className="w-full rounded-xl border border-input px-4 py-3 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-foreground">
              תמונה (אופציונלי)
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              disabled={uploading}
              className="block w-full text-sm text-muted-foreground file:mr-4 file:rounded-lg file:border-0 file:bg-primary/10 file:px-4 file:py-2 file:text-sm file:font-medium file:text-primary hover:file:bg-primary/20"
            />
            {uploading && (
              <p className="mt-2 text-sm text-muted-foreground">מעלה...</p>
            )}
            {imageUrl && !uploading && (
              <div className="mt-3 space-y-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageUrl}
                  alt="תצוגה מקדימה"
                  className="max-h-48 w-auto max-w-full rounded-lg border border-border object-contain bg-card"
                  onError={() => {
                    toast.error("לא ניתן לטעון תצוגה מקדימה — בדוק את קישור האחסון");
                  }}
                />
                <p className="text-sm text-primary truncate" title={imageUrl}>
                  {imageFile?.name || "תמונה הועלתה"}
                </p>
                <p className="text-xs text-muted-foreground break-all">{imageUrl}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Button
        onClick={handleSend}
        disabled={loading || isPending || (selectedTags.size === 0 && selectedGroups.size === 0) || uploading}
        className="w-full rounded-xl bg-primary py-6 text-base font-semibold hover:bg-primary/90 hover:shadow-lg"
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
          <Card className="border-border rounded-2xl shadow-sm overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-foreground">היסטוריית שידורים</h2>
                <p className="text-sm text-muted-foreground">סיכום לפי שידור — הצלחות / כשלונות</p>
              </div>
              <Button variant="outline" size="sm" onClick={refreshLogs} className="rounded-xl">
                רענן
              </Button>
            </CardHeader>
            <CardContent>
              {queueItems.length === 0 && logs.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">אין עדיין שידורים</p>
              ) : (
                <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
                  {queueItems.length > 0 && (
                    <p className="text-xs font-medium text-muted-foreground">תור רקע (סיכום)</p>
                  )}
                  {queueItems.map((item) => (
                    <div
                      key={item.id}
                      className="grid grid-cols-1 sm:grid-cols-[minmax(0,9rem)_1fr_auto_auto] gap-2 items-center rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm"
                    >
                      <span className="text-muted-foreground tabular-nums">{formatDateTime(item.created_at)}</span>
                      <span className="text-muted-foreground truncate" title={item.payload?.tags?.join(", ") ?? ""}>
                        {item.payload?.tags?.length ? `תגיות: ${item.payload.tags.join(", ")}` : "שידור מתוזמן"}
                      </span>
                      <span className="text-green-700 font-medium tabular-nums">
                        ✓ {item.result?.sent ?? 0}
                      </span>
                      <span className="text-red-600 font-medium tabular-nums">
                        ✗ {item.result?.failed ?? 0}
                      </span>
                    </div>
                  ))}
                  {logs.length > 0 && (
                    <p className="text-xs font-medium text-muted-foreground pt-2">שידורים ידניים</p>
                  )}
                  {logs.map((log) => {
                    const snippet =
                      log.message_snippet?.trim() ||
                      log.internal_notes?.trim() ||
                      (log.tags.length ? `תגיות: ${log.tags.join(", ")}` : "—");
                    return (
                      <div
                        key={`log-${log.id}`}
                        className="grid grid-cols-1 sm:grid-cols-[minmax(0,9rem)_1fr_auto_auto_auto] gap-2 items-center rounded-lg border border-border bg-card px-4 py-3 text-sm shadow-sm"
                      >
                        <span className="text-muted-foreground tabular-nums shrink-0">
                          {formatDateTime(log.created_at)}
                        </span>
                        <p className="text-foreground min-w-0 line-clamp-2" title={snippet}>
                          {snippet}
                        </p>
                        <span className="text-green-700 font-semibold tabular-nums whitespace-nowrap">
                          הצלחות: {log.sent}
                        </span>
                        <span className="text-red-600 font-semibold tabular-nums whitespace-nowrap">
                          כשלונות: {log.failed}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          className="shrink-0 border-red-200 text-red-700 hover:bg-red-50"
                          type="button"
                          onClick={async () => {
                            const res = await deleteBroadcastLog(log.id);
                            if (res.success) {
                              setLogs((prev) => prev.filter((l) => l.id !== log.id));
                              toast.success("נמחק");
                            } else {
                              toast.error("שגיאה במחיקה: " + res.error);
                            }
                          }}
                        >
                          🗑️ מחיקה
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
