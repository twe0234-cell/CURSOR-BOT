"use client";

import { useState, useMemo, useRef, useLayoutEffect, memo, useCallback } from "react";
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
  bulkApplyTags,
  bulkDeleteRecipients,
  deleteRecipient,
  fetchGroupsFromGreenApi,
  saveImportedGroups,
  syncAudience,
  type GreenApiGroup,
} from "./actions";
import {
  CopyIcon,
  TagIcon,
  DownloadIcon,
  SearchIcon,
  UsersIcon,
  CheckCircle2Icon,
  Trash2Icon,
  MoreHorizontalIcon,
  RefreshCwIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useViewMode } from "@/lib/hooks/useViewMode";
import { ViewToggle } from "@/app/components/ViewToggle";

const ImportGroupRow = memo(function ImportGroupRow({
  chatId,
  name,
  checked,
  onToggle,
}: {
  chatId: string;
  name: string;
  checked: boolean;
  onToggle: (chatId: string) => void;
}) {
  return (
    <label
      className="flex cursor-pointer items-center gap-2 border-b border-border px-4 py-3 last:border-b-0 hover:bg-muted/40 transition-colors"
      onClick={(e) => e.stopPropagation()}
    >
      <Checkbox checked={checked} onCheckedChange={() => onToggle(chatId)} />
      <span className="flex-1 truncate font-mono text-xs break-words">{name}</span>
    </label>
  );
});

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
  const [viewMode, setViewMode] = useViewMode("audience");
  const [audience, setAudience] = useState(initialAudience ?? []);
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [copiedTags, setCopiedTags] = useState<string[]>([]);
  const [tagsToAdd, setTagsToAdd] = useState("");
  const [selectedTagsToApply, setSelectedTagsToApply] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteOneId, setDeleteOneId] = useState<string | null>(null);
  const [applyOpen, setApplyOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importGroups, setImportGroups] = useState<GreenApiGroup[]>([]);
  const [importSelected, setImportSelected] = useState<Set<string>>(new Set());
  const [importLoading, setImportLoading] = useState(false);
  const [importSaving, setImportSaving] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const importListScrollRef = useRef<HTMLDivElement>(null);
  const importScrollTopRef = useRef(0);

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

  const handleDeleteOne = async (id: string) => {
    setDeleteOneId(null);
    const res = await deleteRecipient(id);
    if (res.success) {
      setAudience((prev) => prev.filter((r) => r.id !== id));
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      toast.success("הנמען נמחק");
    } else {
      toast.error(res.error);
    }
  };

  const handleBulkDelete = async () => {
    if (selected.size === 0) return;
    const count = selected.size;
    setBulkLoading(true);
    if (count > 100) {
      toast.info(`ממחק ${count} נמענים... עשוי לקחת כמה שניות`, { duration: 3000 });
    }
    const res = await bulkDeleteRecipients([...selected]);
    setBulkLoading(false);
    setDeleteOpen(false);
    if (res.success) {
      setAudience((prev) => prev.filter((r) => !selected.has(r.id)));
      setSelected(new Set());
      toast.success(`${selected.size} נמענים נמחקו`);
    } else {
      toast.error(res.error);
    }
  };

  const handleSync = async () => {
    setActionsOpen(false);
    setSyncing(true);
    const res = await syncAudience();
    setSyncing(false);
    if (res.success) {
      toast.success("הסנכרון הושלם בהצלחה");
      window.location.reload();
    } else {
      toast.error(res.error, { duration: 6000 });
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
            description: "כל הקבוצות מ-WhatsApp כבר קיימות במערכת.",
          });
        }
      } else {
        setImportError(res.error);
        toast.error(res.error, { duration: 6000 });
      }
    } catch {
      setImportError("שגיאה לא צפויה");
      toast.error("שגיאה לא צפויה");
    } finally {
      setImportLoading(false);
    }
    setActionsOpen(false);
  };

  const toggleImportSelect = useCallback((chatId: string) => {
    if (importListScrollRef.current) {
      importScrollTopRef.current = importListScrollRef.current.scrollTop;
    }
    setImportSelected((prev) => {
      const next = new Set(prev);
      if (next.has(chatId)) next.delete(chatId);
      else next.add(chatId);
      return next;
    });
  }, []);

  useLayoutEffect(() => {
    const el = importListScrollRef.current;
    if (el && importScrollTopRef.current > 0) {
      el.scrollTop = importScrollTopRef.current;
      importScrollTopRef.current = 0;
    }
  }, [importSelected]);

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
        toast.success("הקבוצות נשמרו בהצלחה", { description: `${toSave.length} קבוצות` });
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
    <div className="flex flex-wrap items-center gap-2 sm:gap-3 rounded-xl border border-border bg-muted/30 p-3 sm:p-4 shadow-sm">
      <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <CheckCircle2Icon className="size-4" />
        נבחרו {selected.size} נמענים
      </span>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => setApplyOpen(true)}
          disabled={bulkLoading}
          className="border-border hover:bg-muted"
        >
          <TagIcon className="size-4 ml-1" />
          החל תגיות
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={handlePaste}
          disabled={bulkLoading || copiedTags.length === 0}
          className="border-border hover:bg-muted"
        >
          <CopyIcon className="size-4 ml-1" />
          הדבק תגיות
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setDeleteOpen(true)}
          disabled={bulkLoading}
          className="border-red-200 text-red-600 hover:bg-red-50"
        >
          <Trash2Icon className="size-4 ml-1" />
          מחק
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
          בטל בחירה
        </Button>
      </div>
    </div>
  );

  const ApplyTagsModal = () => (
    <Dialog open={applyOpen} onOpenChange={setApplyOpen}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-lg">החלת תגיות מרובות</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {(allowedTags ?? []).length > 0 && (
            <div>
              <p className="mb-2 text-sm font-medium text-foreground">תגיות מערכת</p>
              <div className="flex flex-wrap gap-2">
                {(allowedTags ?? []).map((tag) => (
                  <label
                    key={tag}
                    className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 hover:bg-muted/40 transition-colors"
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
              className="rounded-lg"
            />
          </div>
          <div className="flex gap-2 justify-end pt-2">
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
      <DialogContent className="w-[95vw] max-w-5xl h-[85vh] flex flex-col p-4 max-h-[90vh] overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-lg">ייבוא קבוצות מ-WhatsApp</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col flex-1 min-h-0 space-y-4">
          {importLoading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <div className="size-12 animate-spin rounded-full border-4 border-muted border-t-primary" />
              <p className="text-muted-foreground">טוען קבוצות מ-Green API...</p>
            </div>
          ) : importError ? (
            <div className="rounded-xl bg-red-50 p-6 text-center">
              <p className="text-sm font-medium text-red-700 mb-2">{importError}</p>
              <p className="text-xs text-red-600 mb-4">
                וודא שהגדרת Green API בהגדרות ושהמכשיר מחובר ל-WhatsApp
              </p>
              <Button variant="outline" size="sm" onClick={() => handleImportOpenChange(false)}>
                סגור
              </Button>
            </div>
          ) : importGroups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <div className="flex size-16 items-center justify-center rounded-full bg-muted">
                <UsersIcon className="size-8 text-primary" />
              </div>
              <p className="text-center font-medium">אין קבוצות חדשות לייבא</p>
              <p className="text-center text-sm text-muted-foreground max-w-xs">
                כל הקבוצות מ-WhatsApp כבר קיימות במערכת.
              </p>
              <Button variant="outline" onClick={() => handleImportOpenChange(false)}>
                סגור
              </Button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <label className="flex cursor-pointer items-center gap-2">
                  <Checkbox
                    checked={
                      importSelected.size === importGroups.length && importGroups.length > 0
                    }
                    onCheckedChange={toggleImportSelectAll}
                  />
                  <span className="text-sm font-medium">בחר הכל</span>
                </label>
                <span className="text-sm text-muted-foreground">
                  {importSelected.size} / {importGroups.length} נבחרו
                </span>
              </div>
              <div
                ref={importListScrollRef}
                className="flex-1 overflow-y-auto pr-2 overflow-anchor-none rounded-xl border border-border min-h-[200px] max-h-[50vh]"
                style={{ overflowAnchor: "none" } as React.CSSProperties}
              >
                {importGroups.map((g) => (
                  <ImportGroupRow
                    key={g.chatId}
                    chatId={g.chatId}
                    name={g.name || g.chatId}
                    checked={importSelected.has(g.chatId)}
                    onToggle={toggleImportSelect}
                  />
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
    <div className="w-full max-w-screen-xl mx-auto px-4 py-6 sm:py-8 pb-28 md:pb-8 min-w-0 overflow-hidden">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-2">נמענים</h1>
        <p className="text-muted-foreground">נהל את רשימת הנמענים והייבוא מ-WhatsApp</p>
      </div>

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 min-w-0 max-w-full sm:max-w-sm">
          <SearchIcon className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="חיפוש לפי שם, טלפון או תגית..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pr-10 rounded-xl border-border"
          />
        </div>
        <div className="relative shrink-0">
          <Button
            variant="outline"
            onClick={() => setActionsOpen((o) => !o)}
            disabled={importLoading || syncing}
            className="rounded-xl border-border hover:bg-muted"
          >
            <MoreHorizontalIcon className="size-4 ml-2" />
            פעולות
          </Button>
          {actionsOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setActionsOpen(false)} />
              <div className="absolute left-0 top-full z-50 mt-1 w-48 rounded-xl border border-border bg-card py-1 shadow-lg">
                <button
                  onClick={handleOpenImport}
                  disabled={importLoading}
                  className="flex w-full items-center gap-2 px-4 py-2 text-sm text-right hover:bg-muted disabled:opacity-50"
                >
                  <DownloadIcon className={cn("size-4", importLoading && "animate-spin")} />
                  ייבוא קבוצות
                </button>
                <button
                  onClick={handleSync}
                  disabled={syncing}
                  className="flex w-full items-center gap-2 px-4 py-2 text-sm text-right hover:bg-muted disabled:opacity-50"
                >
                  <RefreshCwIcon className={cn("size-4", syncing && "animate-spin")} />
                  סנכרן מ-WhatsApp
                </button>
              </div>
            </>
          )}
          <ViewToggle mode={viewMode} onChange={setViewMode} className="mr-2" />
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={toggleSelectAll}
          className="rounded-xl border-border hover:bg-muted"
        >
          {selected.size === filtered.length && filtered.length > 0 ? "בטל בחירה" : "בחר הכל"}
        </Button>
        {selected.size > 0 && (
          <span className="text-sm text-muted-foreground">
            נבחרו {selected.size} מתוך {filtered.length}
          </span>
        )}
        {(allTags ?? []).map((tag) => (
          <button
            key={tag}
            onClick={() =>
              setTagFilter((prev) =>
                prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
              )
            }
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-medium transition-all duration-200",
              tagFilter.includes(tag)
                ? "bg-primary text-primary-foreground shadow-md"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            )}
          >
            {tag}
          </button>
        ))}
      </div>

      {selected.size > 0 && (
        <div className="mb-6">
          <BulkActionsBar />
        </div>
      )}

      {viewMode === "list" ? (
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-x-auto">
          <Table className="min-w-0">
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="w-10">
                  <Checkbox
                    checked={selected.size === filtered.length && filtered.length > 0}
                    onCheckedChange={toggleSelectAll}
                  />
                </TableHead>
                <TableHead className="font-semibold">שם</TableHead>
                <TableHead className="font-semibold">מזהה צ&apos;אט</TableHead>
                <TableHead className="font-semibold">תגיות</TableHead>
                <TableHead className="w-28 font-semibold">פעולות</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r, i) => (
                <TableRow key={r.id} className={`hover:bg-muted/20 transition-colors table-row-animate stagger-${Math.min(i + 1, 8) as 1|2|3|4|5|6|7|8}`}>
                  <TableCell>
                    <Checkbox
                      checked={selected.has(r.id)}
                      onCheckedChange={() => toggleSelect(r.id)}
                    />
                  </TableCell>
                  <TableCell className="font-medium">{r.name || "—"}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{r.wa_chat_id}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(r.tags ?? []).map((t) => (
                        <span key={t} className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">
                          {t}
                        </span>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <div className="flex flex-row gap-1">
                      <Button size="icon" variant="ghost" onClick={() => handleCopyTags(r.tags ?? [])} title="העתק תגיות" className="size-8">
                        <CopyIcon className="size-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => setDeleteOneId(r.id)} title="מחק" className="size-8 text-red-600 hover:text-red-700 hover:bg-red-50">
                        <Trash2Icon className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((r, i) => (
            <Card key={r.id} className={cn("border-border overflow-hidden card-interactive", `animate-fade-in-up stagger-${Math.min(i + 1, 8) as 1|2|3|4|5|6|7|8}`)}>
              <CardHeader className="flex flex-row items-center gap-3 p-4">
                <Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggleSelect(r.id)} />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{r.name || "—"}</p>
                  <p className="text-xs text-muted-foreground font-mono truncate">{r.wa_chat_id}</p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="icon" variant="ghost" onClick={() => handleCopyTags(r.tags ?? [])} title="העתק תגיות" className="size-8">
                    <CopyIcon className="size-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => setDeleteOneId(r.id)} title="מחק" className="size-8 text-red-600 hover:text-red-700 hover:bg-red-50">
                    <Trash2Icon className="size-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="flex flex-wrap gap-1">
                  {(r.tags ?? []).map((t) => (
                    <span key={t} className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">
                      {t}
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 rounded-2xl border-2 border-dashed border-border bg-muted/20">
          <div className="flex size-20 items-center justify-center rounded-full bg-muted mb-4">
            <UsersIcon className="size-10 text-primary" />
          </div>
          <h3 className="text-lg font-semibold mb-2">אין נמענים</h3>
          <p className="text-center text-muted-foreground max-w-sm mb-6">
            לחץ על &quot;ייבוא קבוצות&quot; לייבא קבוצות WhatsApp
          </p>
          <Button onClick={handleOpenImport} variant="outline" disabled={importLoading}>
            ייבוא קבוצות
          </Button>
        </div>
      )}

      {selected.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 backdrop-blur p-4 md:hidden">
          <BulkActionsBar />
        </div>
      )}

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-sm max-h-[90vh] overflow-y-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle>מחיקת נמענים</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            האם למחוק {selected.size} נמענים? זה לא ניתן לביטול.
          </p>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>ביטול</Button>
            <Button variant="destructive" onClick={handleBulkDelete} disabled={bulkLoading}>
              {bulkLoading ? "מוחק..." : "מחק"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteOneId} onOpenChange={(o) => !o && setDeleteOneId(null)}>
        <DialogContent className="sm:max-w-sm max-h-[90vh] overflow-y-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle>מחיקת נמען</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            האם אתה בטוח? פעולה זו אינה ניתנת לביטול.
          </p>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setDeleteOneId(null)}>ביטול</Button>
            <Button
              variant="destructive"
              onClick={() => deleteOneId && handleDeleteOne(deleteOneId)}
              disabled={bulkLoading}
            >
              מחק
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {applyOpen && <ApplyTagsModal />}
      {importOpen && <ImportGroupsModal />}
    </div>
  );
}
