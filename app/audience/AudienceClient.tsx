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
} from "@/components/ui/dialog";
import {
  syncAudience,
  bulkApplyTags,
  fetchGroupsFromGreenApi,
  saveImportedGroups,
  type GreenApiGroup,
} from "./actions";
import { CopyIcon, RefreshCwIcon, TagIcon, DownloadIcon } from "lucide-react";
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
  allowedTags: string[];
};

export default function AudienceClient({
  initialAudience,
  allTags,
  allowedTags,
}: Props) {
  const [audience, setAudience] = useState(initialAudience ?? []);
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [copiedTags, setCopiedTags] = useState<string[]>([]);
  const [tagsToAdd, setTagsToAdd] = useState("");
  const [selectedTagsToApply, setSelectedTagsToApply] = useState<Set<string>>(new Set());
  const [syncing, setSyncing] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importGroups, setImportGroups] = useState<GreenApiGroup[]>([]);
  const [importSelected, setImportSelected] = useState<Set<string>>(new Set());
  const [importLoading, setImportLoading] = useState(false);
  const [importSaving, setImportSaving] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

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
    const safeTags = Array.isArray(tags) ? tags : [];
    setCopiedTags(safeTags);
    toast.success("התגיות הועתקו", { description: `${safeTags.length} תגיות` });
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
    const fromCheckboxes = [...selectedTagsToApply];
    const fromInput = tagsToAdd
      .split(/[,|\s]+/)
      .map((t) => t.trim())
      .filter(Boolean);
    const tags = [...new Set([...fromCheckboxes, ...fromInput])];

    if (selected.size === 0 || tags.length === 0) {
      toast.error("בחר נמענים ובחר/הזן תגיות");
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
      setSelectedTagsToApply(new Set());
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

  const handleOpenImport = async () => {
    setImportOpen(true);
    setImportLoading(true);
    setImportError(null);
    setImportGroups([]);
    setImportSelected(new Set());
    try {
      const res = await fetchGroupsFromGreenApi();
      if (res.success) {
        setImportGroups(res.groups ?? []);
        setImportError(null);
        if ((res.groups ?? []).length === 0) {
          toast.info("אין קבוצות חדשות לייבא", {
            description: "כל הקבוצות כבר קיימות במערכת",
          });
        }
      } else {
        setImportError(res.error);
        toast.error(res.error);
      }
    } catch {
      setImportError("שגיאה לא צפויה");
      toast.error("שגיאה לא צפויה");
    } finally {
      setImportLoading(false);
    }
  };

  const toggleImportSelect = (chatId: string) => {
    setImportSelected((prev) => {
      const next = new Set(prev);
      if (next.has(chatId)) next.delete(chatId);
      else next.add(chatId);
      return next;
    });
  };

  const toggleImportSelectAll = () => {
    if (importSelected.size === importGroups.length) {
      setImportSelected(new Set());
    } else {
      setImportSelected(new Set(importGroups.filter((g) => g?.chatId).map((g) => g.chatId)));
    }
  };

  const handleSaveImported = async () => {
    if (importSelected.size === 0) {
      toast.error("בחר קבוצות לשמירה");
      return;
    }
    setImportSaving(true);
    try {
      const toSave = importGroups
        .filter((g) => g?.chatId && importSelected.has(g.chatId))
        .map((g) => ({ wa_chat_id: g.chatId, name: g.name ?? g.chatId }));
      const res = await saveImportedGroups(toSave);
      if (res.success) {
        setImportSelected(new Set());
        setImportError(null);
        toast.success("הקבוצות נשמרו", { description: `${toSave.length} קבוצות` });
        setImportOpen(false);
        window.location.reload();
      } else {
        toast.error(res.error);
      }
    } catch {
      toast.error("שגיאה לא צפויה");
    } finally {
      setImportSaving(false);
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>החלת תגיות מרובות</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {(allowedTags ?? []).length > 0 && (
            <div>
              <p className="mb-2 text-sm font-medium text-slate-700">
                תגיות מערכת
              </p>
              <div className="flex flex-wrap gap-2">
                {(allowedTags ?? []).map((tag) => (
                  <label
                    key={tag}
                    className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 hover:bg-slate-50"
                  >
                    <Checkbox
                      checked={selectedTagsToApply.has(tag)}
                      onCheckedChange={(checked) => {
                        setSelectedTagsToApply((prev) => {
                          const next = new Set(prev);
                          if (checked) next.add(tag);
                          else next.delete(tag);
                          return next;
                        });
                      }}
                    />
                    <span className="text-sm">{tag}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
          <div>
            <p className="mb-2 text-sm text-muted-foreground">
              או הזן תגיות (מופרדות בפסיק או רווח)
            </p>
            <Input
              value={tagsToAdd}
              onChange={(e) => setTagsToAdd(e.target.value)}
              placeholder="תגית1, תגית2, תגית3"
            />
          </div>
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

  const handleImportOpenChange = (open: boolean) => {
    setImportOpen(open);
    if (!open) setImportError(null);
  };

  const ImportGroupsModal = () => (
    <Dialog open={importOpen} onOpenChange={handleImportOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>ייבוא קבוצות מ-Green API</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {importLoading ? (
            <p className="py-8 text-center text-muted-foreground">
              טוען קבוצות...
            </p>
          ) : importError ? (
            <div className="rounded-lg bg-red-50 p-4 text-center text-sm text-red-600">
              {importError}
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => handleImportOpenChange(false)}
              >
                סגור
              </Button>
            </div>
          ) : importGroups.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">
              אין קבוצות חדשות לייבא
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <label className="flex cursor-pointer items-center gap-2">
                  <Checkbox
                    checked={
                      importSelected.size === importGroups.length &&
                      importGroups.length > 0
                    }
                    onCheckedChange={toggleImportSelectAll}
                  />
                  <span className="text-sm font-medium">בחר הכל</span>
                </label>
                <span className="text-sm text-muted-foreground">
                  {importSelected.size} / {importGroups.length} נבחרו
                </span>
              </div>
              <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200">
                {importGroups.map((g) => (
                  <label
                    key={g.chatId}
                    className="flex cursor-pointer items-center gap-2 border-b border-slate-100 px-3 py-2 last:border-b-0 hover:bg-slate-50"
                  >
                    <Checkbox
                      checked={importSelected.has(g.chatId)}
                      onCheckedChange={() => toggleImportSelect(g.chatId)}
                    />
                    <span className="flex-1 truncate font-mono text-xs">
                      {g.chatId}
                    </span>
                  </label>
                ))}
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => handleImportOpenChange(false)}>
                  ביטול
                </Button>
                <Button
                  onClick={handleSaveImported}
                  disabled={importSaving || importSelected.size === 0}
                >
                  {importSaving ? "שומר..." : `שמור נבחרים (${importSelected.size})`}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );

  return (
    <div className="container mx-auto max-w-6xl px-4 py-6 pb-24 md:pb-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-teal-800">נמענים</h1>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={handleOpenImport}
            variant="outline"
            disabled={importLoading}
          >
            <DownloadIcon className={cn("size-4 ml-2", importLoading && "animate-spin")} />
            ייבוא קבוצות
          </Button>
          <Button
            onClick={handleSync}
            disabled={syncing}
            className="bg-teal-600 hover:bg-teal-700"
          >
            <RefreshCwIcon className={cn("size-4 ml-2", syncing && "animate-spin")} />
            {syncing ? "מסנכרן..." : "סנכרן מ-Green API"}
          </Button>
        </div>
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <Input
          placeholder="חיפוש לפי שם, טלפון או תגית..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <div className="flex flex-wrap gap-2">
          {(allTags ?? []).map((tag) => (
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
                <TableHead>מזהה צ&apos;אט</TableHead>
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
                title="העתק תגיות"
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
          אין נמענים. לחץ על &quot;ייבוא קבוצות&quot; או &quot;סנכרן מ-Green API&quot; כדי לטעון.
        </p>
      )}

      {selected.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-teal-200 bg-white p-4 md:hidden">
          <BulkActionsBar />
        </div>
      )}

      {applyOpen && <ApplyTagsModal />}
      {importOpen && <ImportGroupsModal />}
    </div>
  );
}
