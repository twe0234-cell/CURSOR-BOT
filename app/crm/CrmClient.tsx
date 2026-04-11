"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  fetchCrmContacts,
  importGmailContacts,
  createCrmContact,
  bulkImportCrmContacts,
  findDuplicateCrmContacts,
  mergeCrmContacts,
  type CrmContact,
  type DuplicateGroup,
} from "./actions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CsvActions } from "@/components/shared/CsvActions";
import {
  UsersIcon,
  DownloadIcon,
  PlusIcon,
  SearchIcon,
  MailIcon,
  PhoneIcon,
  GitMergeIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useViewMode } from "@/lib/hooks/useViewMode";
import { ViewToggle } from "@/app/components/ViewToggle";
import { HScrollBar } from "@/components/ui/HScrollBar";
import { ScrollToTop } from "@/components/ui/ScrollToTop";

// ── Tag configuration ─────────────────────────────────────────────────────────
//
// System "role" tags mirror the contact `type` column (Scribe / Merchant /
// End_Customer). They are shown alongside free-text user tags everywhere in
// the UI. The `type` column is kept in the DB so other ERP modules
// (fetchScribes, fetchDealers, …) keep working without change.

const ROLE_TAGS = [
  {
    value: "Scribe",
    label: "סופר",
    badge: "bg-violet-100 text-violet-800 border-violet-200",
  },
  {
    value: "Merchant",
    label: "סוחר",
    badge: "bg-amber-100 text-amber-800 border-amber-200",
  },
  {
    value: "End_Customer",
    label: "לקוח",
    badge: "bg-emerald-100 text-emerald-800 border-emerald-200",
  },
] as const;

const ROLE_LABEL: Record<string, string> = Object.fromEntries(
  ROLE_TAGS.map((r) => [r.value, r.label])
);
const ROLE_BADGE: Record<string, string> = Object.fromEntries(
  ROLE_TAGS.map((r) => [r.value, r.badge])
);

/** Human-readable label for any tag (role or custom). */
function tagLabel(t: string) {
  return ROLE_LABEL[t] ?? t;
}

/** Tailwind classes for a tag badge (role-specific colour or teal default). */
function tagBadge(t: string) {
  return ROLE_BADGE[t] ?? "bg-teal-100 text-teal-700 border-teal-200";
}

/**
 * Unified tag list for a contact: system type tag first, then custom tags.
 * "Other" is intentionally omitted – it adds no information.
 */
function contactAllTags(c: CrmContact): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (t: string) => {
    if (t && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  };
  if (c.type && c.type !== "Other") push(c.type);
  (c.tags ?? []).forEach(push);
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────

type Props = {
  initialContacts: CrmContact[];
  gmailConnected: boolean;
};

export default function CrmClient({ initialContacts, gmailConnected }: Props) {
  const [contacts, setContacts] = useState(initialContacts);
  const [search, setSearch] = useState("");
  /** Active tag filter chips. */
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  /** OR → match any selected tag (default).  AND → match all selected tags. */
  const [filterMode, setFilterMode] = useState<"or" | "and">("or");

  // Create-modal state
  const [importLoading, setImportLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  /** Selected role tags in the create form (multi-select). */
  const [newRoleTags, setNewRoleTags] = useState<string[]>([]);
  /** Comma-separated custom tags typed by the user. */
  const [newCustomTags, setNewCustomTags] = useState("");
  const [createLoading, setCreateLoading] = useState(false);
  const [viewMode, setViewMode] = useViewMode("crm");
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeLoading, setMergeLoading] = useState(false);
  const [dupeGroups, setDupeGroups] = useState<DuplicateGroup[]>([]);
  // primaryId per group index
  const [mergePrimary, setMergePrimary] = useState<Record<number, string>>({});

  // ── Derived: all unique tags that exist across all contacts ────────────────
  const allFilterTags = [
    ...new Set(contacts.flatMap(contactAllTags)),
  ].sort((a, b) => tagLabel(a).localeCompare(tagLabel(b), "he"));

  // ── Filter logic ──────────────────────────────────────────────────────────
  const filtered = contacts.filter((c) => {
    const tags = contactAllTags(c);
    const textMatch =
      !search ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.email ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (c.phone ?? "").includes(search) ||
      tags.some((t) => tagLabel(t).toLowerCase().includes(search.toLowerCase()));
    const tagMatch =
      selectedTags.length === 0 ||
      (filterMode === "or"
        ? selectedTags.some((t) => tags.includes(t))   // OR – match any
        : selectedTags.every((t) => tags.includes(t))); // AND – match all
    return textMatch && tagMatch;
  });

  // ── Tag toggle helpers ────────────────────────────────────────────────────
  const toggleFilterTag = (tag: string) =>
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );

  const toggleRoleTag = (value: string) =>
    setNewRoleTags((prev) =>
      prev.includes(value) ? prev.filter((t) => t !== value) : [...prev, value]
    );

  // ── Action handlers ───────────────────────────────────────────────────────
  const refreshContacts = async () => {
    const r = await fetchCrmContacts();
    if (r.success) setContacts(r.contacts);
  };

  const handleImportGmail = async () => {
    setImportLoading(true);
    const res = await importGmailContacts();
    setImportLoading(false);
    if (res.success) {
      toast.success(`יובאו ${res.imported} אנשי קשר מ-Gmail`);
      await refreshContacts();
    } else {
      toast.error(res.error);
    }
  };

  const resetCreateForm = () => {
    setNewName("");
    setNewEmail("");
    setNewPhone("");
    setNewRoleTags([]);
    setNewCustomTags("");
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) {
      toast.error("הזן שם");
      return;
    }
    const customTagsList = newCustomTags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const allTags = [...newRoleTags, ...customTagsList];

    setCreateLoading(true);
    const res = await createCrmContact({
      name: newName.trim(),
      email: newEmail.trim() || undefined,
      phone: newPhone.trim() || undefined,
      // Keep `type` for ERP compatibility; use the first role tag if chosen.
      type: newRoleTags[0] ?? "Other",
      tags: allTags,
    });
    setCreateLoading(false);
    if (res.success) {
      toast.success("איש הקשר נוצר");
      setCreateOpen(false);
      resetCreateForm();
      await refreshContacts();
    } else {
      toast.error(res.error);
    }
  };

  const handleCsvImport = async (rows: Record<string, unknown>[]) => {
    if (rows.length === 0) {
      toast.error("הקובץ ריק או בפורמט לא תקין");
      return;
    }
    const res = await bulkImportCrmContacts(rows);
    if (res.success) {
      toast.success(
        `יובאו ${res.imported} אנשי קשר${
          res.errors.length > 0 ? `. ${res.errors.length} שגיאות` : ""
        }`
      );
      await refreshContacts();
    } else {
      toast.error(res.error);
    }
  };

  const handleOpenMerge = async () => {
    setMergeLoading(true);
    const res = await findDuplicateCrmContacts();
    setMergeLoading(false);
    if (!res.success) { toast.error(res.error); return; }
    if (res.groups.length === 0) { toast.success("לא נמצאו כפולים"); return; }
    const initPrimary: Record<number, string> = {};
    res.groups.forEach((g, i) => { initPrimary[i] = g.contacts[0].id; });
    setDupeGroups(res.groups);
    setMergePrimary(initPrimary);
    setMergeOpen(true);
  };

  const handleMergeGroup = async (groupIndex: number) => {
    const group = dupeGroups[groupIndex];
    const primaryId = mergePrimary[groupIndex];
    if (!primaryId) return;
    const dupIds = group.contacts.filter((c) => c.id !== primaryId).map((c) => c.id);
    setMergeLoading(true);
    const res = await mergeCrmContacts(primaryId, dupIds);
    setMergeLoading(false);
    if (!res.success) { toast.error(res.error); return; }
    toast.success(`אוחדו ${res.merged} רשומות`);
    setDupeGroups((prev) => prev.filter((_, i) => i !== groupIndex));
    setMergePrimary((prev) => {
      const next: Record<number, string> = {};
      Object.entries(prev).forEach(([k, v]) => {
        const ki = Number(k);
        if (ki !== groupIndex) next[ki > groupIndex ? ki - 1 : ki] = v;
      });
      return next;
    });
    await refreshContacts();
    if (dupeGroups.length <= 1) setMergeOpen(false);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="w-full max-w-screen-xl mx-auto px-4 py-6 sm:py-8 min-w-0 overflow-hidden">
      {/* Page header */}
      <div className="mb-6 sm:mb-8">
        <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-2">
          CRM – אנשי קשר
        </h1>
        <p className="text-muted-foreground">
          כרטסת לקוח חכמה – ניהול אנשי קשר, עסקאות ומסמכים
        </p>
      </div>

      {/* Search + action buttons */}
      <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 min-w-0 max-w-sm">
          <SearchIcon className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="חיפוש..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pr-10 rounded-xl"
          />
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <ViewToggle mode={viewMode} onChange={setViewMode} />
          <CsvActions
            data={contacts.map((c) => ({
              name: c.name,
              email: c.email,
              phone: c.phone,
              type: c.type,
              tags: contactAllTags(c).join(", "),
            }))}
            onImport={handleCsvImport}
            filename="crm-contacts"
          />
          {gmailConnected && (
            <Button
              variant="outline"
              onClick={handleImportGmail}
              disabled={importLoading}
              className="rounded-xl"
            >
              <DownloadIcon className="size-4 ml-2" />
              ייבוא מ-Gmail
            </Button>
          )}
          <Button
            variant="outline"
            onClick={handleOpenMerge}
            disabled={mergeLoading}
            className="rounded-xl"
          >
            <GitMergeIcon className="size-4 ml-2" />
            {mergeLoading ? "סורק..." : "מצא כפולים"}
          </Button>
          <Button
            onClick={() => setCreateOpen(true)}
            className="rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            <PlusIcon className="size-4 ml-2" />
            איש קשר חדש
          </Button>
        </div>
      </div>

      {/* ── Tag filter bar ───────────────────────────────────────────────── */}
      {allFilterTags.length > 0 && (
        <div className="mb-5">
          <HScrollBar>
            {/* "All" chip */}
            <button
              onClick={() => setSelectedTags([])}
              className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                selectedTags.length === 0
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-muted-foreground border-border hover:border-primary/40 hover:text-primary"
              }`}
            >
              הכל
              <span className="mr-1 opacity-70">({contacts.length})</span>
            </button>

            {/* One chip per tag */}
            {allFilterTags.map((tag) => {
              const count = contacts.filter((c) =>
                contactAllTags(c).includes(tag)
              ).length;
              const active = selectedTags.includes(tag);
              return (
                <button
                  key={tag}
                  onClick={() => toggleFilterTag(tag)}
                  className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    active
                      ? "bg-teal-600 text-white border-teal-600"
                      : "bg-white text-slate-600 border-slate-200 hover:border-teal-300 hover:text-teal-700"
                  }`}
                >
                  {tagLabel(tag)}
                  <span className={`mr-1 ${active ? "opacity-80" : "opacity-50"}`}>
                    ({count})
                  </span>
                </button>
              );
            })}

            {/* Clear link (shown only when something is active) */}
            {selectedTags.length > 0 && (
              <button
                onClick={() => setSelectedTags([])}
                className="shrink-0 text-xs text-muted-foreground underline underline-offset-2 hover:text-slate-700 mr-1 whitespace-nowrap"
              >
                נקה סינון
              </button>
            )}

            {/* OR / AND toggle – shown only when 2+ tags are selected */}
            {selectedTags.length >= 2 && (
              <div className="shrink-0 flex items-center gap-0.5 rounded-full border border-slate-200 bg-white p-0.5 mr-1">
                <button
                  onClick={() => setFilterMode("or")}
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                    filterMode === "or"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  OR
                </button>
                <button
                  onClick={() => setFilterMode("and")}
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                    filterMode === "and"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  AND
                </button>
              </div>
            )}
          </HScrollBar>
        </div>
      )}

      {/* ── Contacts grid / list ─────────────────────────────────────────── */}
      <div className={viewMode === "grid"
        ? "grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        : "flex flex-col gap-2"
      }>
        {filtered.map((c, i) => {
          const tags = contactAllTags(c);
          return (
            <Link
              key={c.id}
              href={`/crm/${c.id}`}
              className={cn("block animate-fade-in-up", i < 12 && `stagger-${Math.min(i + 1, 8) as 1|2|3|4|5|6|7|8}`)}
            >
              {viewMode === "grid" ? (
                <Card className="border-border hover:border-primary/30 hover:shadow-md transition-all cursor-pointer h-full card-interactive">
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2.5">
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                        {c.name[0]}
                      </div>
                      <p className="font-semibold truncate">{c.name}</p>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0 space-y-1.5">
                    {c.email && (
                      <p className="flex items-center gap-1 text-xs truncate text-muted-foreground">
                        <MailIcon className="size-3 shrink-0" />
                        {c.email}
                      </p>
                    )}
                    {c.phone && (
                      <p className="flex items-center gap-1 text-xs truncate text-muted-foreground">
                        <PhoneIcon className="size-3 shrink-0" />
                        {c.phone}
                      </p>
                    )}
                    {tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {tags.slice(0, 4).map((t) => (
                          <span
                            key={t}
                            className={`rounded-full border px-2 py-0.5 text-xs font-medium ${tagBadge(t)}`}
                          >
                            {tagLabel(t)}
                          </span>
                        ))}
                        {tags.length > 4 && (
                          <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                            +{tags.length - 4}
                          </span>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ) : (
                <Card className="border-border hover:border-primary/30 hover:bg-muted/30 transition-all cursor-pointer">
                  <CardContent className="py-2.5 px-4 flex items-center gap-3 min-w-0">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                      {c.name[0]}
                    </div>
                    <p className="font-semibold text-sm min-w-[8rem] truncate shrink-0">{c.name}</p>
                    {c.phone && (
                      <p className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground min-w-[8rem] truncate shrink-0">
                        <PhoneIcon className="size-3 shrink-0" />
                        {c.phone}
                      </p>
                    )}
                    {c.email && (
                      <p className="hidden md:flex items-center gap-1 text-xs text-muted-foreground truncate flex-1">
                        <MailIcon className="size-3 shrink-0" />
                        {c.email}
                      </p>
                    )}
                    {tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mr-auto">
                        {tags.slice(0, 2).map((t) => (
                          <span
                            key={t}
                            className={`rounded-full border px-2 py-0.5 text-xs font-medium ${tagBadge(t)}`}
                          >
                            {tagLabel(t)}
                          </span>
                        ))}
                        {tags.length > 2 && (
                          <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                            +{tags.length - 2}
                          </span>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </Link>
          );
        })}
      </div>

      {/* ── Empty state ──────────────────────────────────────────────────── */}
      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 rounded-2xl border-2 border-dashed border-border bg-muted/20">
          <UsersIcon className="size-16 text-primary/40 mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">
            {selectedTags.length > 0 || search
              ? "לא נמצאו אנשי קשר"
              : "אין אנשי קשר"}
          </h3>
          <p className="text-center text-muted-foreground max-w-sm mb-6">
            {selectedTags.length > 0 || search
              ? "נסה לשנות את הסינון או החיפוש"
              : gmailConnected
              ? "ייבא מ-Gmail או צור איש קשר חדש"
              : "חבר Gmail בהגדרות לייבוא, או צור איש קשר חדש"}
          </p>
          <div className="flex gap-2 flex-wrap justify-center">
            {(selectedTags.length > 0 || search) && (
              <Button
                variant="outline"
                onClick={() => {
                  setSelectedTags([]);
                  setSearch("");
                }}
              >
                נקה סינון
              </Button>
            )}
            {!selectedTags.length && !search && gmailConnected && (
              <Button
                variant="outline"
                onClick={handleImportGmail}
                disabled={importLoading}
              >
                ייבוא מ-Gmail
              </Button>
            )}
            {!selectedTags.length && !search && (
              <Button onClick={() => setCreateOpen(true)}>איש קשר חדש</Button>
            )}
          </div>
        </div>
      )}

      {/* ── Create contact modal ─────────────────────────────────────────── */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
          <Card className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl my-auto">
            <CardHeader className="flex flex-row items-center justify-between">
              <h3 className="text-lg font-semibold">איש קשר חדש</h3>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setCreateOpen(false);
                  resetCreateForm();
                }}
              >
                ×
              </Button>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreate} className="space-y-4">
                {/* Name */}
                <div>
                  <label className="mb-1 block text-sm font-medium">שם *</label>
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="שם מלא"
                    className="rounded-xl"
                    required
                  />
                </div>

                {/* Email */}
                <div>
                  <label className="mb-1 block text-sm font-medium">אימייל</label>
                  <Input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="email@example.com"
                    className="rounded-xl"
                  />
                </div>

                {/* Phone */}
                <div>
                  <label className="mb-1 block text-sm font-medium">טלפון</label>
                  <Input
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    placeholder="050-1234567"
                    className="rounded-xl"
                  />
                </div>

                {/* Role tags (multi-select chips) */}
                <div>
                  <label className="mb-2 block text-sm font-medium">
                    תפקיד
                    <span className="mr-1 text-xs font-normal text-muted-foreground">
                      (ניתן לבחור מספר)
                    </span>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {ROLE_TAGS.map((r) => {
                      const active = newRoleTags.includes(r.value);
                      return (
                        <button
                          key={r.value}
                          type="button"
                          onClick={() => toggleRoleTag(r.value)}
                          className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                            active
                              ? "bg-teal-600 text-white border-teal-600"
                              : "bg-white text-slate-600 border-slate-200 hover:border-teal-300 hover:text-teal-700"
                          }`}
                        >
                          {r.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Custom free-text tags */}
                <div>
                  <label className="mb-1 block text-sm font-medium">
                    תגיות נוספות
                  </label>
                  <Input
                    value={newCustomTags}
                    onChange={(e) => setNewCustomTags(e.target.value)}
                    placeholder="ירושלים, VIP, לקוח חדש..."
                    className="rounded-xl"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    הפרד תגיות בפסיקים
                  </p>
                </div>

                <div className="flex gap-2 justify-end pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setCreateOpen(false);
                      resetCreateForm();
                    }}
                  >
                    ביטול
                  </Button>
                  <Button type="submit" disabled={createLoading}>
                    {createLoading ? "יוצר..." : "צור"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Merge Duplicates Dialog ──────────────────────────────────────── */}
      <Dialog open={mergeOpen} onOpenChange={setMergeOpen}>
        <DialogContent className="sm:max-w-xl rounded-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>איחוד כפולים ({dupeGroups.length} קבוצות)</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            {dupeGroups.map((group, gi) => {
              const reasonLabel =
                group.reason === "phone" ? "טלפון זהה"
                : group.reason === "email" ? "אימייל זהה"
                : "שם דומה";
              return (
                <div key={gi} className="border border-border rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      {reasonLabel}
                    </span>
                    <Button
                      size="sm"
                      disabled={mergeLoading}
                      onClick={() => handleMergeGroup(gi)}
                      className="h-7 text-xs"
                    >
                      <GitMergeIcon className="size-3 ml-1" />
                      אחד
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">בחר איש קשר ראשי (ישאר):</p>
                  {group.contacts.map((c) => (
                    <label
                      key={c.id}
                      className={cn(
                        "flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors",
                        mergePrimary[gi] === c.id
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/40"
                      )}
                    >
                      <input
                        type="radio"
                        name={`merge-primary-${gi}`}
                        value={c.id}
                        checked={mergePrimary[gi] === c.id}
                        onChange={() =>
                          setMergePrimary((prev) => ({ ...prev, [gi]: c.id }))
                        }
                        className="accent-primary"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{c.name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {[c.phone, c.email].filter(Boolean).join(" · ") || "—"}
                        </p>
                      </div>
                      {mergePrimary[gi] !== c.id && (
                        <span className="text-xs text-muted-foreground shrink-0">ימחק</span>
                      )}
                    </label>
                  ))}
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      <ScrollToTop />
    </div>
  );
}
