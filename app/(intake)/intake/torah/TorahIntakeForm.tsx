"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Script from "next/script";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SEFER_TYPES, type SeferType } from "@/src/lib/intake/validation";
import { submitTorahIntake } from "./actions";

type UploadedImage = { path: string; previewUrl: string; filename: string };

// Minimal global type for the Turnstile widget we load lazily.
declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      reset: (widgetId?: string) => void;
    };
  }
}

const MAX_IMAGES = 8;
const ACCEPTED_MIME = "image/jpeg,image/jpg,image/png,image/webp,image/heic,image/heif";

export default function TorahIntakeForm({ turnstileSiteKey }: { turnstileSiteKey: string | null }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const turnstileContainerRef = useRef<HTMLDivElement>(null);

  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [turnstileToken, setTurnstileToken] = useState<string>("");

  const [form, setForm] = useState({
    owner_name: "",
    owner_phone: "",
    owner_email: "",
    owner_city: "",
    sefer_type: "ספר תורה" as SeferType,
    scribe_name: "",
    age_estimate: "",
    condition: "",
    description: "",
    asking_price: "",
  });

  function setField<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const available = MAX_IMAGES - images.length;
    if (available <= 0) {
      toast.error(`ניתן להעלות עד ${MAX_IMAGES} תמונות`);
      return;
    }
    const queue = Array.from(files).slice(0, available);
    setUploading(true);

    try {
      const uploaded: UploadedImage[] = [];
      for (const file of queue) {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/intake/upload", { method: "POST", body: fd });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          toast.error(err?.error || `העלאת ${file.name} נכשלה`);
          continue;
        }
        const { path, publicUrl } = await res.json();
        uploaded.push({ path, previewUrl: publicUrl, filename: file.name });
      }
      setImages((prev) => [...prev, ...uploaded]);
      if (uploaded.length > 0) toast.success(`הועלו ${uploaded.length} תמונות`);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function removeImage(path: string) {
    setImages((prev) => prev.filter((i) => i.path !== path));
  }

  // Mount Turnstile widget when script loads and a site key exists.
  useEffect(() => {
    if (!turnstileSiteKey) return;
    const el = turnstileContainerRef.current;
    if (!el) return;
    let widgetId: string | undefined;
    const mount = () => {
      if (!window.turnstile) return;
      widgetId = window.turnstile.render(el, {
        sitekey: turnstileSiteKey,
        callback: (token: string) => setTurnstileToken(token),
        "error-callback": () => setTurnstileToken(""),
        "expired-callback": () => setTurnstileToken(""),
      });
    };
    if (window.turnstile) mount();
    else {
      const interval = setInterval(() => {
        if (window.turnstile) {
          clearInterval(interval);
          mount();
        }
      }, 200);
      return () => clearInterval(interval);
    }
    return () => {
      if (widgetId && window.turnstile) window.turnstile.reset(widgetId);
    };
  }, [turnstileSiteKey]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    if (!form.owner_name.trim() || !form.owner_phone.trim() || !form.owner_email.trim()) {
      toast.error("שם, טלפון ואימייל הם שדות חובה");
      return;
    }

    setSubmitting(true);
    try {
      const result = await submitTorahIntake({
        owner_name: form.owner_name.trim(),
        owner_phone: form.owner_phone.trim(),
        owner_email: form.owner_email.trim(),
        owner_city: form.owner_city.trim() || undefined,
        sefer_type: form.sefer_type,
        scribe_name: form.scribe_name.trim() || undefined,
        age_estimate: form.age_estimate.trim() || undefined,
        condition: form.condition.trim() || undefined,
        description: form.description.trim() || undefined,
        asking_price: form.asking_price.trim() || undefined,
        image_paths: images.map((i) => i.path),
        turnstile_token: turnstileToken || undefined,
      });

      if (!result.success) {
        toast.error(result.error || "שליחת הטופס נכשלה");
        return;
      }

      router.push(`/intake/torah/success?id=${encodeURIComponent(result.submissionId)}`);
    } catch (err) {
      console.error("[intake] submit failed", err);
      toast.error("שגיאה לא צפויה. אנא נסה שוב.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {turnstileSiteKey ? (
        <Script
          src="https://challenges.cloudflare.com/turnstile/v0/api.js"
          strategy="afterInteractive"
        />
      ) : null}

      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-[oklch(0.73_0.13_80/0.35)] bg-white p-6 shadow-sm md:p-8"
      >
        <section className="space-y-5">
          <h2 className="border-r-4 border-[oklch(0.73_0.13_80)] pr-3 text-lg font-semibold text-[oklch(0.26_0.068_265)]">
            פרטי הבעלים
          </h2>

          <Field label="שם מלא" required>
            <Input
              value={form.owner_name}
              onChange={(e) => setField("owner_name", e.target.value)}
              required
              maxLength={120}
              autoComplete="name"
            />
          </Field>

          <div className="grid gap-5 md:grid-cols-2">
            <Field label="טלפון" required>
              <Input
                type="tel"
                value={form.owner_phone}
                onChange={(e) => setField("owner_phone", e.target.value)}
                required
                autoComplete="tel"
                dir="ltr"
                className="text-right"
              />
            </Field>
            <Field label="אימייל" required>
              <Input
                type="email"
                value={form.owner_email}
                onChange={(e) => setField("owner_email", e.target.value)}
                required
                autoComplete="email"
                dir="ltr"
                className="text-right"
              />
            </Field>
          </div>

          <Field label="עיר">
            <Input
              value={form.owner_city}
              onChange={(e) => setField("owner_city", e.target.value)}
              maxLength={120}
              autoComplete="address-level2"
            />
          </Field>
        </section>

        <hr className="my-8 border-t border-dashed border-[oklch(0.73_0.13_80/0.4)]" />

        <section className="space-y-5">
          <h2 className="border-r-4 border-[oklch(0.73_0.13_80)] pr-3 text-lg font-semibold text-[oklch(0.26_0.068_265)]">
            פרטי הפריט
          </h2>

          <Field label="סוג הפריט" required>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              {SEFER_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setField("sefer_type", t)}
                  className={`rounded-lg border px-3 py-2.5 text-sm transition ${
                    form.sefer_type === t
                      ? "border-[oklch(0.26_0.068_265)] bg-[oklch(0.26_0.068_265)] text-white shadow-sm"
                      : "border-neutral-300 bg-white text-neutral-700 hover:border-[oklch(0.73_0.13_80)]"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </Field>

          <div className="grid gap-5 md:grid-cols-2">
            <Field label="שם הסופר (אם ידוע)">
              <Input
                value={form.scribe_name}
                onChange={(e) => setField("scribe_name", e.target.value)}
                maxLength={200}
              />
            </Field>
            <Field label="גיל משוער">
              <Input
                value={form.age_estimate}
                onChange={(e) => setField("age_estimate", e.target.value)}
                maxLength={80}
                placeholder='לדוגמה: "כ-40 שנה"'
              />
            </Field>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <Field label="מצב הפריט">
              <Input
                value={form.condition}
                onChange={(e) => setField("condition", e.target.value)}
                maxLength={200}
                placeholder='לדוגמה: "כשר למהדרין"'
              />
            </Field>
            <Field label="מחיר מבוקש (₪)">
              <Input
                type="number"
                inputMode="decimal"
                min="0"
                step="1"
                value={form.asking_price}
                onChange={(e) => setField("asking_price", e.target.value)}
                dir="ltr"
                className="text-right"
              />
            </Field>
          </div>

          <Field label="תיאור נוסף">
            <Textarea
              value={form.description}
              onChange={(e) => setField("description", e.target.value)}
              maxLength={2000}
              rows={4}
              placeholder="הערות, היסטוריה, פרטים מיוחדים…"
            />
          </Field>
        </section>

        <hr className="my-8 border-t border-dashed border-[oklch(0.73_0.13_80/0.4)]" />

        <section className="space-y-3">
          <h2 className="border-r-4 border-[oklch(0.73_0.13_80)] pr-3 text-lg font-semibold text-[oklch(0.26_0.068_265)]">
            תמונות ({images.length}/{MAX_IMAGES})
          </h2>
          <p className="text-xs text-neutral-500">
            העלה תמונות ברורות של הפריט. עד {MAX_IMAGES} תמונות, עד 10MB לתמונה.
          </p>

          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_MIME}
            multiple
            onChange={(e) => handleFiles(e.target.files)}
            className="hidden"
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || images.length >= MAX_IMAGES}
            className="w-full md:w-auto"
          >
            {uploading ? "מעלה…" : "בחר תמונות"}
          </Button>

          {images.length > 0 ? (
            <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
              {images.map((img) => (
                <div key={img.path} className="relative aspect-square overflow-hidden rounded-lg border border-neutral-200">
                  <img src={img.previewUrl} alt={img.filename} className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removeImage(img.path)}
                    className="absolute left-1 top-1 rounded-full bg-black/70 px-2 py-0.5 text-xs text-white hover:bg-black"
                    aria-label="הסר תמונה"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </section>

        {turnstileSiteKey ? (
          <div className="mt-8 flex justify-center">
            <div ref={turnstileContainerRef} />
          </div>
        ) : null}

        <div className="mt-8 flex flex-col gap-3 md:flex-row-reverse md:items-center md:justify-between">
          <Button
            type="submit"
            disabled={submitting || uploading || (!!turnstileSiteKey && !turnstileToken)}
            className="w-full bg-[oklch(0.26_0.068_265)] text-white hover:bg-[oklch(0.22_0.068_265)] md:w-auto md:min-w-[200px]"
          >
            {submitting ? "שולח…" : "שליחת הפנייה"}
          </Button>
          <p className="text-xs text-neutral-500">
            בשליחה אתה מאשר יצירת קשר טלפוני ובאימייל לצורך הצעת מחיר.
          </p>
        </div>
      </form>
    </>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-neutral-700">
        {label}
        {required ? <span className="mr-1 text-red-600">*</span> : null}
      </span>
      {children}
    </label>
  );
}
