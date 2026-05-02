"use client";

import { useState, useMemo, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import Link from "next/link";
import {
  ChevronRight,
  Mail,
  MailX,
  MailMinus,
  Tag,
  TagsIcon,
  Download,
  UserCheck,
  Signature,
  Copy,
  CheckCheck,
  X,
  Plus,
} from "lucide-react";
import type { DealerEmailRow } from "./actions";
import { bulkAddTagsToDealers, bulkRemoveTagFromDealers } from "./actions";

type Props = {
  dealers: DealerEmailRow[];
  allTags: string[];
};

const STATUS_LABEL: Record<DealerEmailRow["emailStatus"], string> = {
  valid: "פעיל",
  no_email: "אין אימייל",
  unsubscribed: "ביטל מנוי",
};

const STATUS_COLOR: Record<DealerEmailRow["emailStatus"], string> = {
  valid: "text-emerald-600 bg-emerald-50 ring-emerald-200",
  no_email: "text-muted-foreground bg-muted/50 ring-border",
  unsubscribed: "text-destructive bg-destructive/8 ring-destructive/20",
};

const STATUS_ICON: Record<DealerEmailRow["emailStatus"], ReactNode> = {
  valid: <Mail className="size-3" />,
  no_email: <MailX className="size-3" />,
  unsubscribed: <MailMinus className="size-3" />,
};

type FilterTab = "all" | "valid" | "no_email" | "unsubscribed";

function exportToCsv(rows: DealerEmailRow[]) {
  const header = ["שם", "אימייל", "טלפון", "תגיות", "עיר", "קהילה", "סטטוס אימייל"];
  const body = rows.map((d) => [
    d.name,
    d.email ?? "",
    d.phone ?? "",
    d.tags.join("; "),
    d.city ?? "",
    d.community ?? "",
    STATUS_LABEL[d.emailStatus],
  ]);
  const csv =
    "﻿" +
    [header, ...body]
      .map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
      )
      .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `dealers-email-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ─── Signature Helper ────────────────────────────────────────────────────────

type SigFields = {
  name: string;
  role: string;
  phone: string;
  whatsapp: string;
  city: string;
  website: string;
};

function buildSignatureHtml(f: SigFields): string {
  const lines: string[] = [];
  if (f.name) lines.push(`<strong>${f.name}</strong>`);
  if (f.role) lines.push(f.role);
  if (f.phone) lines.push(`📞 ${f.phone}`);
  if (f.whatsapp) lines.push(`💬 WhatsApp: ${f.whatsapp}`);
  if (f.city) lines.push(`📍 ${f.city}`);
  if (f.website) lines.push(`🌐 <a href="${f.website}">${f.website}</a>`);
  return (
    `<div dir="rtl" style="font-family:Arial,sans-serif;font-size:14px;line-height:1.7;color:#333;border-top:2px solid #c8a84b;padding-top:8px;margin-top:8px;">` +
    lines.join("<br/>") +
    `</div>`
  );
}

function buildSignatureText(f: SigFields): string {
  const lines: string[] = [];
  if (f.name) lines.push(f.name);
  if (f.role) lines.push(f.role);
  if (f.phone) lines.push(`טל: ${f.phone}`);
  if (f.whatsapp) lines.push(`WhatsApp: ${f.whatsapp}`);
  if (f.city) lines.push(f.city);
  if (f.website) lines.push(f.website);
  return lines.join("\n");
}

function SignatureHelper() {
  const [sig, setSig] = useState<SigFields>({
    name: "",
    role: "הידור הסת״ם",
    phone: "",
    whatsapp: "",
    city: "",
    website: "",
  });
  const [copied, setCopied] = useState<"html" | "text" | null>(null);

  const html = buildSignatureHtml(sig);
  const text = buildSignatureText(sig);

  function copy(type: "html" | "text") {
    navigator.clipboard.writeText(type === "html" ? html : text).then(() => {
      setCopied(type);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  const field = (
    key: keyof SigFields,
    label: string,
    placeholder = ""
  ) => (
    <div className="flex flex-col gap-0.5">
      <label className="text-xs text-muted-foreground">{label}</label>
      <input
        className="h-8 rounded-md border border-border bg-background px-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40"
        value={sig[key]}
        placeholder={placeholder}
        onChange={(e) => setSig((p) => ({ ...p, [key]: e.target.value }))}
      />
    </div>
  );

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-4">
      <div className="flex items-center gap-2 font-semibold text-sm">
        <Signature className="size-4 text-primary" />
        עוזר חתימת אימייל
      </div>

      <div className="grid grid-cols-2 gap-3">
        {field("name", "שם", "ישראל כהן")}
        {field("role", "תפקיד / חברה")}
        {field("phone", "טלפון", "050-0000000")}
        {field("whatsapp", "WhatsApp")}
        {field("city", "עיר", "ירושלים")}
        {field("website", "אתר", "https://...")}
      </div>

      {(sig.name || sig.phone || sig.city) && (
        <div>
          <p className="text-xs text-muted-foreground mb-1.5">תצוגה מקדימה</p>
          <div
            className="rounded-lg border border-border bg-background p-3 text-sm leading-7"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => copy("html")}
          className="flex items-center gap-1.5 rounded-lg border border-border bg-muted px-3 py-1.5 text-xs font-medium hover:bg-muted/80 transition-colors"
        >
          {copied === "html" ? (
            <CheckCheck className="size-3 text-emerald-600" />
          ) : (
            <Copy className="size-3" />
          )}
          העתק HTML
        </button>
        <button
          type="button"
          onClick={() => copy("text")}
          className="flex items-center gap-1.5 rounded-lg border border-border bg-muted px-3 py-1.5 text-xs font-medium hover:bg-muted/80 transition-colors"
        >
          {copied === "text" ? (
            <CheckCheck className="size-3 text-emerald-600" />
          ) : (
            <Copy className="size-3" />
          )}
          העתק טקסט
        </button>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DealerEmailOpsClient({ dealers, allTags }: Props) {
  const [filterTab, setFilterTab] = useState<FilterTab>("all");
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [addTagInput, setAddTagInput] = useState("");
  const [removeTagInput, setRemoveTagInput] = useState("");
  const [showSig, setShowSig] = useState(false);
  const [isPending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    let rows = dealers;
    if (filterTab !== "all") rows = rows.filter((d) => d.emailStatus === filterTab);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter(
        (d) =>
          d.name.toLowerCase().includes(q) ||
          (d.email ?? "").toLowerCase().includes(q)
      );
    }
    if (tagFilter.length > 0) {
      rows = rows.filter((d) => tagFilter.every((t) => d.tags.includes(t)));
    }
    return rows;
  }, [dealers, filterTab, search, tagFilter]);

  const selected = useMemo(
    () => filtered.filter((d) => selectedIds.has(d.id)),
    [filtered, selectedIds]
  );
  const validSelected = selected.filter((d) => d.emailStatus === "valid");

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((d) => selectedIds.has(d.id));

  function toggleAll() {
    if (allFilteredSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        filtered.forEach((d) => next.delete(d.id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        filtered.forEach((d) => next.add(d.id));
        return next;
      });
    }
  }

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function handleAddTags() {
    const tags = addTagInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (!tags.length || !selected.length) return;
    const ids = selected.map((d) => d.id);
    startTransition(async () => {
      const res = await bulkAddTagsToDealers(ids, tags);
      if (res.success) {
        toast.success(`תגיות נוספו ל-${res.updated} אנשי קשר`);
        setAddTagInput("");
      } else {
        toast.error(res.error);
      }
    });
  }

  function handleRemoveTag() {
    if (!removeTagInput.trim() || !selected.length) return;
    const ids = selected.map((d) => d.id);
    startTransition(async () => {
      const res = await bulkRemoveTagFromDealers(ids, removeTagInput);
      if (res.success) {
        toast.success(`תגית הוסרה מ-${res.updated} אנשי קשר`);
        setRemoveTagInput("");
      } else {
        toast.error(res.error);
      }
    });
  }

  const tabCounts: Record<FilterTab, number> = useMemo(
    () => ({
      all: dealers.length,
      valid: dealers.filter((d) => d.emailStatus === "valid").length,
      no_email: dealers.filter((d) => d.emailStatus === "no_email").length,
      unsubscribed: dealers.filter((d) => d.emailStatus === "unsubscribed").length,
    }),
    [dealers]
  );

  return (
    <main className="min-h-screen bg-background" dir="rtl">
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">

        {/* Breadcrumb */}
        <nav className="flex items-center gap-1 text-sm text-muted-foreground">
          <Link href="/crm" className="hover:text-foreground transition-colors">
            CRM
          </Link>
          <ChevronRight className="size-3.5 rotate-180" />
          <span className="text-foreground font-medium">פעולות אימייל לסוחרים</span>
        </nav>

        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">פעולות אימייל — סוחרים</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              ניהול תגיות, סגמנטים, ייצוא, וחתימה לתקשורת עם סוחרים
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowSig((v) => !v)}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted/70 transition-colors shrink-0"
          >
            <Signature className="size-3.5" />
            {showSig ? "סגור חתימה" : "עוזר חתימה"}
          </button>
        </div>

        {showSig && <SignatureHelper />}

        {/* Filter tabs */}
        <div className="flex flex-wrap gap-2">
          {(["all", "valid", "no_email", "unsubscribed"] as FilterTab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setFilterTab(tab)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                filterTab === tab
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "border border-border text-muted-foreground hover:bg-muted/70"
              }`}
            >
              {tab === "all" && <UserCheck className="size-3" />}
              {tab === "valid" && <Mail className="size-3" />}
              {tab === "no_email" && <MailX className="size-3" />}
              {tab === "unsubscribed" && <MailMinus className="size-3" />}
              {tab === "all"
                ? "כולם"
                : tab === "valid"
                ? "פעיל"
                : tab === "no_email"
                ? "אין אימייל"
                : "ביטל מנוי"}
              <span className="rounded-full bg-current/10 px-1.5 py-0.5 text-[10px] font-bold tabular-nums">
                {tabCounts[tab]}
              </span>
            </button>
          ))}
        </div>

        {/* Search + tag filter */}
        <div className="flex flex-wrap gap-2">
          <input
            type="search"
            placeholder="חיפוש שם או אימייל..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 flex-1 min-w-44 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40"
          />
          <div className="flex flex-wrap gap-1.5 items-center">
            {allTags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() =>
                  setTagFilter((prev) =>
                    prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
                  )
                }
                className={`flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium transition-all ${
                  tagFilter.includes(tag)
                    ? "bg-teal-600 text-white"
                    : "bg-teal-50 text-teal-700 ring-1 ring-teal-200 hover:bg-teal-100"
                }`}
              >
                <Tag className="size-2.5" />
                {tag}
                {tagFilter.includes(tag) && <X className="size-2.5" />}
              </button>
            ))}
          </div>
        </div>

        {/* Bulk actions bar */}
        {selected.length > 0 && (
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 flex flex-wrap gap-3 items-center">
            <span className="text-sm font-semibold text-primary">
              נבחרו {selected.length} | {validSelected.length} עם אימייל תקין
            </span>

            {/* Add tags */}
            <div className="flex items-center gap-1.5">
              <TagsIcon className="size-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="הוסף תגיות (פסיק להפרדה)"
                value={addTagInput}
                onChange={(e) => setAddTagInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddTags()}
                className="h-7 w-44 rounded-md border border-border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40"
              />
              <button
                type="button"
                onClick={handleAddTags}
                disabled={isPending || !addTagInput.trim()}
                className="flex items-center gap-1 rounded-md bg-primary px-2.5 h-7 text-xs font-medium text-primary-foreground disabled:opacity-50 hover:bg-primary/90 transition-colors"
              >
                <Plus className="size-3" />
                הוסף
              </button>
            </div>

            {/* Remove tag */}
            <div className="flex items-center gap-1.5">
              <select
                value={removeTagInput}
                onChange={(e) => setRemoveTagInput(e.target.value)}
                className="h-7 rounded-md border border-border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40"
              >
                <option value="">הסר תגית...</option>
                {[...new Set(selected.flatMap((d) => d.tags))].sort().map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleRemoveTag}
                disabled={isPending || !removeTagInput}
                className="flex items-center gap-1 rounded-md border border-destructive/40 px-2.5 h-7 text-xs font-medium text-destructive disabled:opacity-50 hover:bg-destructive/8 transition-colors"
              >
                <X className="size-3" />
                הסר
              </button>
            </div>

            {/* Export CSV */}
            <button
              type="button"
              onClick={() => exportToCsv(selected)}
              className="mr-auto flex items-center gap-1.5 rounded-lg border border-border px-3 h-7 text-xs font-medium hover:bg-muted/70 transition-colors"
            >
              <Download className="size-3" />
              ייצוא CSV ({selected.length})
            </button>
          </div>
        )}

        {/* Stats summary */}
        <div className="text-xs text-muted-foreground">
          מציג {filtered.length} מתוך {dealers.length} סוחרים
          {filtered.length > 0 && (
            <>
              {" "}·{" "}
              {filtered.filter((d) => d.emailStatus === "valid").length} עם אימייל פעיל
            </>
          )}
        </div>

        {/* Table */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[2rem_1fr_1.5fr_1fr_5rem] gap-2 px-3 py-2 bg-muted/30 border-b border-border text-xs font-semibold text-muted-foreground">
            <div className="flex items-center justify-center">
              <input
                type="checkbox"
                checked={allFilteredSelected}
                onChange={toggleAll}
                className="size-3.5 rounded accent-primary"
              />
            </div>
            <div>שם</div>
            <div>אימייל</div>
            <div>תגיות</div>
            <div>סטטוס</div>
          </div>

          {filtered.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              לא נמצאו סוחרים
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filtered.map((dealer) => (
                <div
                  key={dealer.id}
                  className={`grid grid-cols-[2rem_1fr_1.5fr_1fr_5rem] gap-2 px-3 py-2.5 items-center text-sm transition-colors ${
                    selectedIds.has(dealer.id) ? "bg-primary/4" : "hover:bg-muted/30"
                  }`}
                >
                  {/* Checkbox */}
                  <div className="flex items-center justify-center">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(dealer.id)}
                      onChange={() => toggleOne(dealer.id)}
                      className="size-3.5 rounded accent-primary"
                    />
                  </div>

                  {/* Name */}
                  <div className="font-medium truncate">
                    <Link
                      href={`/crm/${dealer.id}`}
                      className="hover:text-primary hover:underline transition-colors"
                    >
                      {dealer.name}
                    </Link>
                    {dealer.city && (
                      <span className="block text-xs text-muted-foreground">
                        {dealer.city}
                      </span>
                    )}
                  </div>

                  {/* Email */}
                  <div className="truncate text-xs text-muted-foreground">
                    {dealer.email ?? <span className="italic">—</span>}
                  </div>

                  {/* Tags */}
                  <div className="flex flex-wrap gap-1 min-w-0">
                    {dealer.tags.slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-0.5 rounded-full bg-teal-50 px-1.5 py-0.5 text-[10px] font-medium text-teal-700 ring-1 ring-teal-200"
                      >
                        {tag}
                      </span>
                    ))}
                    {dealer.tags.length > 3 && (
                      <span className="text-[10px] text-muted-foreground">
                        +{dealer.tags.length - 3}
                      </span>
                    )}
                  </div>

                  {/* Status */}
                  <div>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${
                        STATUS_COLOR[dealer.emailStatus]
                      }`}
                    >
                      {STATUS_ICON[dealer.emailStatus]}
                      {STATUS_LABEL[dealer.emailStatus]}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Export all */}
        {selected.length === 0 && filtered.length > 0 && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => exportToCsv(filtered)}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted/70 transition-colors"
            >
              <Download className="size-3.5" />
              ייצוא CSV (כל הסרוקים)
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
