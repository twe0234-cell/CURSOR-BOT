"use client";

import { useState, useMemo } from "react";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { syncAudience, bulkApplyTags } from "./actions";
import { CopyIcon, RefreshCwIcon, TagIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Recipient = {
  id: string;
  name: string | null;
  wa_chat_id: string;
  tags: string[];
  active: boolean | null;
};

type Props = {
  initialAudience: Recipient[];
  allTags: string[];
};

export default function AudienceClient({ initialAudience, allTags }: Props) {
  const [audience, setAudience] = useState(initialAudience);
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [copiedTags, setCopiedTags] = useState<string[]>([]);
  const [tagsToAdd, setTagsToAdd] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);

  const filtered = useMemo(() => {
    let list = audience;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (r) =>
          (r.name ?? "").toLowerCase().includes(q) ||
          r.wa_chat_id.toLowerCase().includes(q) ||
          (r.tags ?? []).some((t) => t.toLowerCase().includes(q))
      );
    }
    if (tagFilter.length > 0) {
      list = list.filter((r) =>
        tagFilter.every((t) => (r.tags ?? []).includes(t))
      );
    }
    return list;
  }, [audience, search, tagFilter]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((r) => r.id)));
    }
  };

  const handleCopyTags = (tags: string[]) => {
    setCopiedTags(tags);
    toast.success("התגיות הועתקו", { description: `${tags.length} תגיות` });
  };

  const handlePaste = async () => {
    if (selected.size === 0 || copiedTags.length === 0) {
      toast.error("בחר נמענים והעתק תגיות קודם");
      return;
    }
    setBulkLoading(true);
    const res = await bulkApplyTags([...selected], copiedTags);
    setBulkLoading(false);
    if (res.success) {
      setAudience((prev) =>
        prev.map((r) =>
          selected.has(r.id)
            ? { ...r, tags: [...new Set([...(r.tags ?? []), ...copiedTags])] }
            : r
        )
      );
      setSelected(new Set());
      toast.success("התגיות הודבקו", { description: `ל־${selected.size} נמענים` });
      setApplyOpen(false);
    } else {
      toast.error(res.error);
    }
  };

  const handleApplyTags = async () => {
    const tags = tagsToAdd
      .split(/[,|\s]+/)
      .map((t) => t.trim())
      .filter(Boolean);
    if (selected.size === 0 || tags.length === 0) {
      toast.error("בחר נמענים והזן תגיות");
      return;
    }
    setBulkLoading(true);
    const res = await bulkApplyTags([...selected], tags);
    setBulkLoading(false);
    if (res.success) {
      setAudience((prev) =>
        prev.map((r) =>
          selected.has(r.id)
            ? { ...r, tags: [...new Set([...(r.tags ?? []), ...tags])] }
            : r
        )
      );
      setSelected(new Set());
      setTagsToAdd("");
      toast.success("התגיות הוחלו", { description: `ל־${selected.size} נמענים` });
      setApplyOpen(false);
    } else {
      toast.error(res.error);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    const res = await syncAudience();
    setSyncing(false);
    if (res.success) {
      toast.success("הסנכרון הושלם");
      window.location.reload();
    } else {
      toast.error(res.error);
    }
  };

  const BulkActionsBar = () => (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-teal-200 bg-teal-50/50 p-3">
      <span className="text-sm font-medium text-teal-800">
        נבחרו {selected.size} נמענים
      </span>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setApplyOpen(true)}
        disabled={bulkLoading}
      >
        <TagIcon className="size-4 ml-1" />
        החל תגיות
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={handlePaste}
        disabled={bulkLoading || copiedTags.length === 0}
      >
        <CopyIcon className="size-4 ml-1" />
        הדבק תגיות
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => setSelected(new Set())}
      >
        בטל בחירה
      </Button>
    </div>
  );

  const ApplyTagsModal = () => (
    <Dialog open={applyOpen} onOpenChange={setApplyOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>החלת תגיות</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            הזן תגיות (מופרדות בפסיק או רווח)
          </p>
          <Input
            value={tagsToAdd}
            onChange={(e) => setTagsToAdd(e.target.value)}
            placeholder="תגית1, תגית2, תגית3"
          />
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setApplyOpen(false)}>
              ביטול
            </Button>
            <Button onClick={handleApplyTags} disabled={bulkLoading}>
              {bulkLoading ? "מעבד..." : "החל"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );

  return (
    <div className="container mx-auto max-w-6xl px-4 py-6 pb-24 md:pb-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-teal-800">נמענים</h1>
        <Button
          onClick={handleSync}
          disabled={syncing}
          className="bg-teal-600 hover:bg-teal-700"
        >
          <RefreshCwIcon className={cn("size-4 ml-2", syncing && "animate-spin")} />
          {syncing ? "מסנכרן..." : "סנכרן מ-Green API"}
        </Button>
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <Input
          placeholder="חיפוש לפי שם, טלפון או תגית..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <div className="flex flex-wrap gap-2">
          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() =>
                setTagFilter((prev) =>
                  prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
                )
              }
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                tagFilter.includes(tag)
                  ? "bg-teal-600 text-white"
                  : "bg-teal-100 text-teal-700 hover:bg-teal-200"
              )}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      {selected.size > 0 && (
        <div className="mb-4">
          <BulkActionsBar />
        </div>
      )}

      <div className="hidden md:block">
        <div className="rounded-lg border border-slate-200 bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={selected.size === filtered.length && filtered.length > 0}
                    onCheckedChange={toggleSelectAll}
                  />
                </TableHead>
                <TableHead>שם</TableHead>
                <TableHead>מזהה צ'אט</TableHead>
                <TableHead>תגיות</TableHead>
                <TableHead className="w-24">פעולות</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <Checkbox
                      checked={selected.has(r.id)}
                      onCheckedChange={() => toggleSelect(r.id)}
                    />
                  </TableCell>
                  <TableCell>{r.name || "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{r.wa_chat_id}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(r.tags ?? []).map((t) => (
                        <span
                          key={t}
                          className="rounded bg-teal-100 px-2 py-0.5 text-xs text-teal-700"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      onClick={() => handleCopyTags(r.tags ?? [])}
                      title="העתק תגיות"
                    >
                      <CopyIcon className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="mb-4 md:hidden space-y-3">
        {filtered.map((r) => (
          <Card key={r.id} className="border-teal-100">
            <CardHeader className="flex flex-row items-center gap-2 p-3">
              <Checkbox
                checked={selected.has(r.id)}
                onCheckedChange={() => toggleSelect(r.id)}
              />
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{r.name || "—"}</p>
                <p className="text-xs text-muted-foreground font-mono truncate">
                  {r.wa_chat_id}
                </p>
              </div>
              <Button
                size="icon-xs"
                variant="ghost"
                onClick={() => handleCopyTags(r.tags ?? [])}
              >
                <CopyIcon className="size-4" />
              </Button>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <div className="flex flex-wrap gap-1">
                {(r.tags ?? []).map((t) => (
                  <span
                    key={t}
                    className="rounded bg-teal-100 px-2 py-0.5 text-xs text-teal-700"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="text-center py-12 text-muted-foreground">
          אין נמענים. לחץ על &quot;סנכרן מ-Green API&quot; כדי לטעון צ'אטים.
        </p>
      )}

      {selected.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-teal-200 bg-white p-4 md:hidden">
          <BulkActionsBar />
        </div>
      )}

      {applyOpen && <ApplyTagsModal />}
    </div>
  );
}
