"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import { PenLine, Plus, CalendarCheck, ZoomIn, ExternalLink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import type { SoferDirectoryRow } from "./actions";
import {
  upsertSoferProfile,
  uploadSoferSampleImage,
  createScribeContactAndProfile,
  updateSoferLastContact,
  fetchScribeContactsForSelect,
} from "./actions";

type Props = {
  initialRows: SoferDirectoryRow[];
};

export default function SoferimClient({ initialRows }: Props) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [filterLevel, setFilterLevel] = useState("");
  useEffect(() => {
    setRows(initialRows);
  }, [initialRows]);

  const visibleRows = filterLevel
    ? rows.filter((r) => (r.writing_level ?? "").includes(filterLevel))
    : rows;
  const [modalOpen, setModalOpen] = useState(false);
  const [zoomUrl, setZoomUrl] = useState<string | null>(null);
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [contacts, setContacts] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    contact_id: "",
    new_name: "",
    new_phone: "",
    writing_style: "",
    writing_level: "",
    daily_page_capacity: "",
    pricing_notes: "",
    existing_sample_url: "",
    sample_file: null as File | null,
  });

  async function openModal() {
    setMode("existing");
    setForm({
      contact_id: "",
      new_name: "",
      new_phone: "",
      writing_style: "",
      writing_level: "",
      daily_page_capacity: "",
      pricing_notes: "",
      existing_sample_url: "",
      sample_file: null,
    });
    const res = await fetchScribeContactsForSelect();
    if (res.success) setContacts(res.contacts);
    else toast.error(res.error);
    setModalOpen(true);
  }

  function openEdit(row: SoferDirectoryRow) {
    setMode("existing");
    setForm({
      contact_id: row.contact_id,
      new_name: "",
      new_phone: "",
      writing_style: row.writing_style ?? "",
      writing_level: row.writing_level ?? "",
      daily_page_capacity: row.daily_page_capacity != null ? String(row.daily_page_capacity) : "",
      pricing_notes: row.pricing_notes ?? "",
      existing_sample_url: row.sample_image_url ?? "",
      sample_file: null,
    });
    fetchScribeContactsForSelect().then((res) => {
      if (res.success) setContacts(res.contacts);
    });
    setModalOpen(true);
  }

  async function handleSubmit() {
    setLoading(true);
    try {
      let sampleUrl: string | null = null;
      if (form.sample_file) {
        const fd = new FormData();
        fd.set("file", form.sample_file);
        const up = await uploadSoferSampleImage(fd);
        if (!up.success) {
          toast.error(up.error);
          setLoading(false);
          return;
        }
        sampleUrl = up.url;
      }
      const resolvedSampleUrl =
        sampleUrl ?? (form.existing_sample_url.trim() || null);

      if (mode === "new") {
        if (!form.new_name.trim()) {
          toast.error("נדרש שם לסופר חדש");
          setLoading(false);
          return;
        }
        const res = await createScribeContactAndProfile(
          { name: form.new_name.trim(), phone: form.new_phone.trim() || null },
          {
            writing_style: form.writing_style || null,
            writing_level: form.writing_level || null,
            sample_image_url: resolvedSampleUrl,
            daily_page_capacity: form.daily_page_capacity ? Number(form.daily_page_capacity) : null,
            pricing_notes: form.pricing_notes || null,
          }
        );
        if (!res.success) toast.error(res.error);
        else {
          toast.success("תיק סופר נוצר");
          setModalOpen(false);
          router.refresh();
        }
      } else {
        if (!form.contact_id) {
          toast.error("בחר סופר מהרשימה");
          setLoading(false);
          return;
        }
        const res = await upsertSoferProfile({
          contact_id: form.contact_id,
          writing_style: form.writing_style || null,
          writing_level: form.writing_level || null,
          sample_image_url: resolvedSampleUrl,
          daily_page_capacity: form.daily_page_capacity ? Number(form.daily_page_capacity) : null,
          pricing_notes: form.pricing_notes || null,
        });
        if (!res.success) toast.error(res.error);
        else {
          toast.success("התיק נשמר");
          setModalOpen(false);
          router.refresh();
        }
      }
    } catch (err) {
      console.error("[SoferimClient] handleSubmit", err);
      if (err instanceof Error) console.error(err.stack);
      toast.error("שגיאה בשמירה");
    } finally {
      setLoading(false);
    }
  }

  async function touchContact(contactId: string) {
    const res = await updateSoferLastContact(contactId);
    if (!res.success) toast.error(res.error);
    else {
      toast.success("תאריך קשר עודכן להיום");
      router.refresh();
    }
  }

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8 bg-slate-50/80 min-h-screen">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-sky-700 flex items-center gap-2">
            <PenLine className="size-7 text-amber-500" />
            מאגר סופרים
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            אנשי קשר מסוג סופר — תיק מקצועי, דוגמת כתב ומעקב קשר
          </p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <Input
            placeholder="סנן לפי רמת כתב..."
            value={filterLevel}
            onChange={(e) => setFilterLevel(e.target.value)}
            className="w-44 h-9 text-sm"
          />
          <Button
            onClick={openModal}
            className="bg-sky-600 hover:bg-sky-700 text-white shrink-0"
          >
            <Plus className="size-4 ml-1" />
            צור תיק סופר
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visibleRows.length === 0 ? (
          <p className="text-muted-foreground col-span-full text-center py-12">
            אין סופרים ב-CRM. הוסף איש קשר מסוג סופר ב-CRM או צור תיק חדש כאן.
          </p>
        ) : (
          visibleRows.map((row) => (
            <Card
              key={row.contact_id}
              className="rounded-2xl border border-sky-100 bg-white shadow-sm overflow-hidden"
            >
              <CardContent className="pt-5 space-y-3">
                <div className="flex gap-3">
                  <div
                    className="relative size-20 shrink-0 rounded-lg bg-slate-100 overflow-hidden cursor-pointer"
                    onClick={() => row.sample_image_url && setZoomUrl(row.sample_image_url)}
                  >
                    {row.sample_image_url ? (
                      <>
                        <Image
                          src={row.sample_image_url}
                          alt=""
                          fill
                          className="object-cover"
                          sizes="80px"
                          unoptimized
                        />
                        <span className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[10px] py-0.5 text-center">
                          לחץ להגדלה
                        </span>
                      </>
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-muted-foreground text-center px-1">
                        אין דוגמה
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="font-semibold text-sky-800 truncate">{row.name}</h2>
                    <p className="text-sm text-muted-foreground truncate">
                      {row.phone ?? "—"}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground text-xs">רמת כתב</span>
                    <p className="font-medium">{row.writing_level ?? "—"}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs">סגנון</span>
                    <p className="font-medium truncate">{row.writing_style ?? "—"}</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
                  <span className="text-xs text-muted-foreground">
                    קשר אחרון:{" "}
                    {row.last_contact_date
                      ? new Date(row.last_contact_date).toLocaleDateString("he-IL")
                      : "—"}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-xs h-8 border-amber-200 text-amber-800 hover:bg-amber-50"
                    onClick={() => touchContact(row.contact_id)}
                  >
                    <CalendarCheck className="size-3 ml-1" />
                    עדכן להיום
                  </Button>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    className="flex-1 bg-sky-50 text-sky-800 hover:bg-sky-100"
                    size="sm"
                    onClick={() => openEdit(row)}
                  >
                    ערוך תיק
                  </Button>
                  <Link href={`/crm/${row.contact_id}`}>
                    <Button variant="outline" size="sm" className="h-9 px-2.5" title="כרטיס CRM">
                      <ExternalLink className="size-4" />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-sky-800">צור תיק סופר</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex gap-2">
              <Button
                type="button"
                variant={mode === "existing" ? "default" : "outline"}
                className={mode === "existing" ? "bg-sky-600" : ""}
                size="sm"
                onClick={() => setMode("existing")}
              >
                סופר קיים
              </Button>
              <Button
                type="button"
                variant={mode === "new" ? "default" : "outline"}
                className={mode === "new" ? "bg-sky-600" : ""}
                size="sm"
                onClick={() => setMode("new")}
              >
                סופר חדש
              </Button>
            </div>

            {mode === "existing" ? (
              <div>
                <p className="text-sm text-muted-foreground mb-1">בחר סופר (איש קשר מסוג סופר)</p>
                <select
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                  value={form.contact_id}
                  onChange={(e) => setForm((f) => ({ ...f, contact_id: e.target.value }))}
                >
                  <option value="">— בחר —</option>
                  {contacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">שם הסופר</p>
                  <Input
                    value={form.new_name}
                    onChange={(e) => setForm((f) => ({ ...f, new_name: e.target.value }))}
                    placeholder="שם מלא"
                  />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">טלפון</p>
                  <Input
                    value={form.new_phone}
                    onChange={(e) => setForm((f) => ({ ...f, new_phone: e.target.value }))}
                    placeholder="050-0000000"
                    dir="ltr"
                    className="text-left"
                  />
                </div>
              </>
            )}

            <div>
              <p className="text-sm text-muted-foreground mb-1">סגנון כתיבה</p>
              <Input
                value={form.writing_style}
                onChange={(e) => setForm((f) => ({ ...f, writing_style: e.target.value }))}
                placeholder='למשל: אריז"ל, בית יוסף'
              />
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">רמת כתב</p>
              <Input
                value={form.writing_level}
                onChange={(e) => setForm((f) => ({ ...f, writing_level: e.target.value }))}
                placeholder="מהודר, תיוג מיוחד..."
              />
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">קצב יומי (עמודים)</p>
              <Input
                type="number"
                min={0}
                step={0.5}
                value={form.daily_page_capacity}
                onChange={(e) => setForm((f) => ({ ...f, daily_page_capacity: e.target.value }))}
              />
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">הערות תמחור</p>
              <Textarea
                value={form.pricing_notes}
                onChange={(e) => setForm((f) => ({ ...f, pricing_notes: e.target.value }))}
                rows={3}
              />
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">דוגמת כתב (תמונה)</p>
              <Input
                type="file"
                accept="image/*"
                onChange={(e) =>
                  setForm((f) => ({ ...f, sample_file: e.target.files?.[0] ?? null }))
                }
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              ביטול
            </Button>
            <Button
              className="bg-sky-600 hover:bg-sky-700"
              disabled={loading}
              onClick={handleSubmit}
            >
              {loading ? "שומר..." : "שמור"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!zoomUrl} onOpenChange={() => setZoomUrl(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sky-800">
              <ZoomIn className="size-5" />
              דוגמת כתב
            </DialogTitle>
          </DialogHeader>
          {zoomUrl && (
            <div className="relative w-full aspect-[4/3] bg-slate-100 rounded-lg overflow-hidden">
              <Image src={zoomUrl} alt="" fill className="object-contain" unoptimized />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
