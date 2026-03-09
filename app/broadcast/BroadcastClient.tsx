"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  fetchTargetsByTags,
  dispatchBroadcast,
} from "./actions";
import { SendIcon, VariableIcon } from "lucide-react";
import { cn } from "@/lib/utils";

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
  const [loading, setLoading] = useState(false);
  const [targetCount, setTargetCount] = useState<number | null>(null);

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

    setLoading(true);
    try {
      const res = await dispatchBroadcast(
        [...selectedTags],
        messageText.trim(),
        imageUrl.trim() || undefined
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
    <div className="container mx-auto max-w-3xl px-4 py-6">
      <h1 className="mb-6 text-2xl font-bold text-teal-800">שידור הודעות</h1>

      <Card className="mb-6 border-teal-100">
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

      <Card className="mb-6 border-teal-100">
        <CardHeader>
          <h2 className="text-lg font-semibold text-teal-800">הודעה</h2>
          <div className="flex gap-2">
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
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              טקסט
            </label>
            <textarea
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              placeholder="שלום {Name}, ..."
              rows={5}
              className="w-full rounded-lg border border-slate-300 px-4 py-2 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              קישור לתמונה (אופציונלי)
            </label>
            <Input
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://"
            />
          </div>
        </CardContent>
      </Card>

      <Button
        onClick={handleSend}
        disabled={loading || selectedTags.size === 0}
        className="w-full bg-teal-600 hover:bg-teal-700"
      >
        <SendIcon className={cn("size-4 ml-2", loading && "animate-pulse")} />
        {loading ? "שולח..." : "שלח שידור"}
      </Button>
    </div>
  );
}
