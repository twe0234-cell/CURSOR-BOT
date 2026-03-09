"use client";

import { useState, useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  fetchTargetsByTags,
  dispatchBroadcast,
  uploadMedia,
} from "./actions";
import { SendIcon, VariableIcon, SmileIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import dynamic from "next/dynamic";

const EmojiPicker = dynamic(
  () => import("emoji-picker-react").then((mod) => mod.default),
  { ssr: false }
);

const VARIABLES = [
  { key: "Name", label: "שם הנמען" },
  { key: "name", label: "שם (alternate)" },
];

type Props = {
  allTags: string[];
  prefilledMessage?: string;
};

export default function BroadcastClient({
  allTags,
  prefilledMessage = "",
}: Props) {
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [messageText, setMessageText] = useState(prefilledMessage);
  const [imageUrl, setImageUrl] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [targetCount, setTargetCount] = useState<number | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
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
    if (selectedTags.size === 0) {
      toast.error("בחר לפחות תגית אחת");
      return;
    }
    const res = await fetchTargetsByTags([...selectedTags]);
    if (res.success) {
      setTargetCount(res.targets.length);
      toast.info(`נמענים: ${res.targets.length}`);
    } else {
      toast.error(res.error);
    }
  };

  const handleSend = async () => {
    if (selectedTags.size === 0) {
      toast.error("בחר לפחות תגית אחת");
      return;
    }
    if (!messageText.trim()) {
      toast.error("הזן טקסט להודעה");
      return;
    }

    let finalImageUrl = imageUrl.trim();
    if (imageFile && !finalImageUrl && uploading === false) {
      toast.error("ממתין להעלאת התמונה");
      return;
    }

    setLoading(true);
    try {
      const res = await dispatchBroadcast(
        [...selectedTags],
        messageText.trim(),
        finalImageUrl || undefined
      );

      if (res.success) {
        toast.success(
          `נשלח בהצלחה`,
          { description: `${res.sent} נשלחו, ${res.failed} נכשלו` }
        );
        if (res.errors.length > 0) {
          console.error("Broadcast errors:", res.errors);
        }
      } else {
        toast.error(res.error);
      }
    } catch {
      toast.error("שגיאה לא צפויה");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-teal-800 mb-2">שידור הודעות</h1>
        <p className="text-muted-foreground">שלח הודעות WhatsApp לנמענים לפי תגיות</p>
      </div>

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
          {allTags.length === 0 && (
            <p className="text-sm text-muted-foreground">
              הוסף תגיות בהגדרות או בנמענים
            </p>
          )}
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={handlePreviewCount}
            disabled={selectedTags.size === 0}
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
        disabled={loading || selectedTags.size === 0 || uploading}
        className="w-full rounded-xl bg-teal-600 py-6 text-base font-semibold hover:bg-teal-700 hover:shadow-lg"
      >
        <SendIcon className={cn("size-4 ml-2", loading && "animate-pulse")} />
        {loading ? "שולח..." : "שלח שידור"}
      </Button>
    </div>
  );
}
