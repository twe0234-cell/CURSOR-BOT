"use client";

import { useState, useTransition, useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { PlusIcon, Trash2Icon, ImageIcon, LoaderIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { uploadGalleryImage, fetchGalleryImages, deleteGalleryImage } from "@/app/crm/galleryActions";

type GalleryItem = { id: string; image_url: string; caption: string | null; sort_order: number };

export default function ScribeGallery({ contactId }: { contactId: string }) {
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [caption, setCaption] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    fetchGalleryImages(contactId).then((r) => {
      if (r.success) setItems(r.images);
      setLoaded(true);
    });
  }, [contactId]);

  useEffect(() => { load(); }, [load]);

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setUploading(true);
    for (const file of files) {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("contactId", contactId);
      fd.append("caption", caption);
      const res = await uploadGalleryImage(fd);
      if (!res.success) toast.error(res.error);
    }
    setUploading(false);
    setCaption("");
    if (fileRef.current) fileRef.current.value = "";
    load();
  };

  const onDelete = (id: string) => {
    startTransition(async () => {
      const res = await deleteGalleryImage(id);
      if (res.success) {
        setItems((p) => p.filter((i) => i.id !== id));
        toast.success("נמחק");
      } else toast.error(res.error);
    });
  };

  return (
    <div className="space-y-3">
      {/* העלאה */}
      <div className="flex gap-2 items-end">
        <Input
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="כיתוב (אופציונלי)"
          className="flex-1 h-9 text-sm"
        />
        <label
          className={`flex items-center gap-1.5 cursor-pointer rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-sm text-sky-700 font-medium hover:bg-sky-100 transition-colors ${uploading ? "opacity-50 pointer-events-none" : ""}`}
        >
          {uploading ? <LoaderIcon className="size-4 animate-spin" /> : <PlusIcon className="size-4" />}
          {uploading ? "מעלה…" : "הוסף תמונות"}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={onFileChange}
          />
        </label>
      </div>

      {/* גלריה */}
      {!loaded ? (
        <p className="text-sm text-muted-foreground text-center py-4">טוען…</p>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border-2 border-dashed border-slate-200 py-8 text-center">
          <ImageIcon className="size-8 text-slate-300" />
          <p className="text-sm text-muted-foreground">אין תמונות עדיין</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {items.map((item) => (
            <div key={item.id} className="group relative rounded-lg overflow-hidden border border-slate-200 bg-slate-50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.image_url}
                alt={item.caption ?? "תמונת סופר"}
                className="w-full aspect-square object-cover cursor-pointer hover:opacity-90 transition-opacity"
                onClick={() => window.open(item.image_url, "_blank")}
              />
              {item.caption && (
                <p className="px-1.5 py-1 text-xs text-muted-foreground truncate">{item.caption}</p>
              )}
              <button
                type="button"
                onClick={() => onDelete(item.id)}
                disabled={isPending}
                className="absolute top-1 left-1 rounded-full bg-red-600/80 p-1 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-700"
              >
                <Trash2Icon className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
