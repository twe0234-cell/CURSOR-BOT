"use client";

import Link from "next/link";
import { useState, useCallback, useLayoutEffect, memo, useRef } from "react";
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
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  fetchGroupsFromGreenApi,
  saveImportedGroups,
  syncAudience,
  type GreenApiGroup,
} from "@/app/audience/actions";
import { DownloadIcon, UsersIcon, RefreshCwIcon } from "lucide-react";
import { cn } from "@/lib/utils";

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
      className="flex cursor-pointer items-center gap-2 border-b border-slate-100 px-4 py-3 last:border-b-0 hover:bg-slate-50 transition-colors"
      onClick={(e) => e.stopPropagation()}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={() => onToggle(chatId)}
        className="rounded border-slate-300"
      />
      <span className="flex-1 truncate font-mono text-xs break-words">{name}</span>
    </label>
  );
});

type GroupRow = { id: string; wa_chat_id: string; name: string | null };

type Props = {
  initialGroups: GroupRow[];
};

export default function GroupManagementTab({ initialGroups }: Props) {
  const groups = initialGroups;
  const [importOpen, setImportOpen] = useState(false);
  const [importGroups, setImportGroups] = useState<GreenApiGroup[]>([]);
  const [importSelected, setImportSelected] = useState<Set<string>>(new Set());
  const [importLoading, setImportLoading] = useState(false);
  const [importSaving, setImportSaving] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const importListScrollRef = useRef<HTMLDivElement>(null);
  const importScrollTopRef = useRef(0);

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

  const handleSync = async () => {
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

  const handleImportOpenChange = (open: boolean) => {
    setImportOpen(open);
    if (!open) setImportError(null);
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-sky-100 bg-sky-50/40 px-4 py-3 text-sm text-slate-700">
        <strong className="text-slate-800">כאן רק קבוצות:</strong> ייבוא וסנכרון לרשימת קבוצות לשידור.
        לנמענים יחידים, תגיות ופילוח מלא —{" "}
        <Link href="/audience" className="font-medium text-sky-700 underline underline-offset-2">
          מסך ניהול קהל
        </Link>
        . אותו ייבוא קבוצות קיים גם שם תחת &quot;פעולות&quot; — אין צורך לבצע פעמיים.
      </div>
      <Card className="shadow-sm rounded-xl border-slate-200 bg-white overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <UsersIcon className="w-5 h-5 text-sky-500" />
            <div>
              <h2 className="text-base font-semibold text-slate-700">קבוצות WhatsApp</h2>
              <p className="text-sm text-muted-foreground">ייבוא מ-Green API וסנכרון לטבלת הקהל</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSync}
              disabled={syncing}
              className="rounded-xl"
            >
              <RefreshCwIcon className={cn("size-4 ml-1", syncing && "animate-spin")} />
              סנכרן
            </Button>
            <Button
              onClick={handleOpenImport}
              disabled={importLoading}
              className="rounded-xl bg-sky-600 hover:bg-sky-700"
            >
              <DownloadIcon className={cn("size-4 ml-1", importLoading && "animate-spin")} />
              ייבוא מ-WhatsApp
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {groups.length > 0 ? (
            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                    <TableHead className="font-semibold">שם</TableHead>
                    <TableHead className="font-semibold">מזהה צ&apos;אט</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groups.map((g) => (
                    <TableRow key={g.id} className="hover:bg-slate-50/50">
                      <TableCell className="font-medium">{g.name || "—"}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{g.wa_chat_id}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50">
              <UsersIcon className="size-12 text-slate-400 mb-4" />
              <h3 className="text-lg font-semibold text-slate-700 mb-2">אין קבוצות</h3>
              <p className="text-center text-muted-foreground max-w-sm mb-4">
                לחץ על &quot;ייבוא מ-WhatsApp&quot; לייבא קבוצות מ-Green API
              </p>
              <Button onClick={handleOpenImport} variant="outline" disabled={importLoading} className="rounded-xl">
                ייבוא מ-WhatsApp
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={importOpen} onOpenChange={handleImportOpenChange}>
        <DialogContent className="w-[95vw] max-w-5xl h-[85vh] flex flex-col p-4 max-h-[90vh] overflow-y-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg">ייבוא קבוצות מ-WhatsApp</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col flex-1 min-h-0 space-y-4">
            {importLoading ? (
              <div className="flex flex-col items-center justify-center py-12 gap-4">
                <div className="size-12 animate-spin rounded-full border-4 border-sky-200 border-t-sky-600" />
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
                <UsersIcon className="size-16 text-sky-400" />
                <p className="text-center font-medium text-slate-700">אין קבוצות חדשות לייבא</p>
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
                    <input
                      type="checkbox"
                      checked={importSelected.size === importGroups.length && importGroups.length > 0}
                      onChange={toggleImportSelectAll}
                      className="rounded border-slate-300"
                    />
                    <span className="text-sm font-medium">בחר הכל</span>
                  </label>
                  <span className="text-sm text-muted-foreground">
                    {importSelected.size} / {importGroups.length} נבחרו
                  </span>
                </div>
                <div
                  ref={importListScrollRef}
                  className="flex-1 overflow-y-auto pr-2 rounded-xl border border-slate-200 min-h-[200px] max-h-[50vh]"
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
    </div>
  );
}
