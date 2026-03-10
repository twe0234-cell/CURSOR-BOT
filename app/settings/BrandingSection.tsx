"use client";

import { useState } from "react";
import { toast } from "sonner";
import Image from "next/image";
import { ImageIcon } from "lucide-react";

type Props = {
  currentLogoUrl: string | null;
};

export default function BrandingSection({ currentLogoUrl }: Props) {
  const [uploading, setUploading] = useState(false);
  const [logoUrl, setLogoUrl] = useState(currentLogoUrl);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.match(/image\/(png|ico|x-icon)/)) {
      toast.error("נא להעלות קובץ PNG או ICO");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/settings/branding", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "שגיאה בהעלאה");
        return;
      }
      setLogoUrl(data.url);
      toast.success("הלוגו עודכן");
      window.location.reload();
    } catch {
      toast.error("שגיאה בהעלאה");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  return (
    <div className="rounded-2xl border border-teal-100 bg-white p-6 shadow-sm">
      <h3 className="mb-2 text-lg font-semibold text-teal-800">מיתוג מערכת</h3>
      <p className="mb-4 text-sm text-muted-foreground">
        העלה לוגו (PNG או ICO) לשימוש כ־favicon וכפתור אפליקציה
      </p>
      <div className="flex items-center gap-4">
        {logoUrl ? (
          <Image
            src={logoUrl}
            alt="לוגו"
            width={64}
            height={64}
            className="rounded-lg object-contain border border-slate-200"
            unoptimized
          />
        ) : (
          <div className="flex size-16 items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50">
            <ImageIcon className="size-8 text-slate-400" />
          </div>
        )}
        <label className="cursor-pointer">
          <span className="inline-flex h-9 items-center justify-center rounded-lg border border-input bg-background px-4 text-sm font-medium hover:bg-accent">
            {uploading ? "מעלה..." : "העלה לוגו"}
          </span>
          <input
            type="file"
            accept=".png,.ico,image/png,image/x-icon"
            className="hidden"
            onChange={handleUpload}
            disabled={uploading}
          />
        </label>
      </div>
    </div>
  );
}
