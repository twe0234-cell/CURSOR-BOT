"use client";

import { useState, useTransition, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Trash2Icon, PlusIcon, MessageSquareIcon, LoaderIcon } from "lucide-react";
import {
  fetchMarketContactLogs,
  addMarketContactLog,
  deleteMarketContactLog,
  type MarketContactLogEntry,
} from "./actions";

type Props = { bookId: string };

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function MarketContactLog({ bookId }: Props) {
  const [logs, setLogs] = useState<MarketContactLogEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [note, setNote] = useState("");
  const [contactedAt, setContactedAt] = useState(() => {
    // toISOString() מחזיר UTC — משתמשים בשעה המקומית של הדפדפן
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  });
  const [isPending, startTransition] = useTransition();
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(() => {
    fetchMarketContactLogs(bookId).then((r) => {
      if (r.success) setLogs(r.logs);
      setLoaded(true);
    });
  }, [bookId]);

  useEffect(() => { load(); }, [load]);

  // datetime-local value ("2026-04-12T20:01") has no timezone — parse as local
  // time and let the Date constructor convert to UTC correctly via toISOString().
  function localDtToUtcIso(localDt: string): string {
    const [datePart, timePart] = localDt.split("T");
    const [year, month, day] = (datePart ?? "").split("-").map(Number);
    const [hours, minutes] = (timePart ?? "00:00").split(":").map(Number);
    return new Date(year!, month! - 1, day!, hours!, minutes!).toISOString();
  }

  const onAdd = () => {
    if (!note.trim()) { toast.error("הזן הערה"); return; }
    startTransition(async () => {
      const utcIso = localDtToUtcIso(contactedAt);
      const res = await addMarketContactLog(bookId, note, utcIso);
      if (res.success) {
        toast.success("נרשם");
        setNote("");
        load();
      } else {
        toast.error(res.error);
      }
    });
  };

  const onDelete = async (id: string) => {
    setDeleting(id);
    const res = await deleteMarketContactLog(id);
    setDeleting(null);
    if (res.success) {
      setLogs((p) => p.filter((l) => l.id !== id));
    } else {
      toast.error(res.error);
    }
  };

  return (
    <div className="mt-2 space-y-3">
      {/* הוספת רשומה */}
      <div className="rounded-lg border bg-slate-50 p-3 space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <MessageSquareIcon className="size-4 text-sky-600" />
          <span>הוסף מגע</span>
        </div>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="תוכן השיחה / הגעה / סטטוס מו״מ…"
          rows={2}
          className="text-sm"
        />
        <div className="flex items-center gap-2">
          <Input
            type="datetime-local"
            value={contactedAt}
            onChange={(e) => setContactedAt(e.target.value)}
            className="text-sm max-w-[200px]"
          />
          <Button
            size="sm"
            onClick={onAdd}
            disabled={isPending || !note.trim()}
            className="gap-1"
          >
            {isPending ? <LoaderIcon className="size-3.5 animate-spin" /> : <PlusIcon className="size-3.5" />}
            שמור
          </Button>
        </div>
      </div>

      {/* רשימת רשומות */}
      {!loaded ? (
        <p className="text-sm text-muted-foreground text-center py-2">טוען…</p>
      ) : logs.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-2">אין מגעים רשומים עדיין</p>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
          {logs.map((l) => (
            <div
              key={l.id}
              className="flex gap-2 rounded-lg border bg-white px-3 py-2 text-sm shadow-sm"
            >
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground mb-0.5">
                  {formatDate(l.contacted_at)}
                </p>
                <p className="whitespace-pre-wrap break-words">{l.note}</p>
              </div>
              <button
                type="button"
                onClick={() => onDelete(l.id)}
                disabled={deleting === l.id}
                className="shrink-0 text-red-400 hover:text-red-600 transition-colors mt-0.5"
                title="מחק"
              >
                <Trash2Icon className="size-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
