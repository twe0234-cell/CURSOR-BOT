"use client";

import { useRef, useEffect } from "react";
import Image from "next/image";
import { uploadInventoryImage } from "@/app/inventory/actions";
import { PlusIcon, XIcon } from "lucide-react";
import { toast } from "sonner";

type Props = {
  images: string[];
  onChange: (images: string[]) => void;
  disabled?: boolean;
};

export function ImageGallery({ images, onChange, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  /** מניעת סגירה מיושנת כשמעלים כמה קבצים ברצף (אחרי await) */
  const imagesRef = useRef<string[]>(Array.isArray(images) ? images : []);

  useEffect(() => {
    imagesRef.current = Array.isArray(images) ? images : [];
  }, [images]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const target = e.target;
    const files = target?.files;
    if (!files?.length) return;

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file || !file.type.startsWith("image/")) continue;

        const formData = new FormData();
        formData.set("file", file);

        let res: Awaited<ReturnType<typeof uploadInventoryImage>>;
        try {
          res = await uploadInventoryImage(formData);
        } catch (uploadErr) {
          console.error("[ImageGallery] uploadInventoryImage נכשל:", uploadErr);
          if (uploadErr instanceof Error) console.error(uploadErr.stack);
          toast.error("שגיאה בהעלאה");
          continue;
        }

        if (res.success) {
          const next = [...imagesRef.current, res.url];
          imagesRef.current = next;
          onChange(next);
          toast.success("התמונה הועלתה");
        } else {
          toast.error(res.error);
        }
      }
    } catch (err) {
      console.error("[ImageGallery] handleUpload:", err);
      if (err instanceof Error) console.error(err.stack);
      toast.error("שגיאה בעיבוד הקובץ");
    } finally {
      try {
        if (target) target.value = "";
      } catch (resetErr) {
        console.error("[ImageGallery] איפוס input:", resetErr);
      }
    }
  };

  const remove = (idx: number) => {
    onChange(images.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3 p-2 rounded-xl bg-slate-50/50 border border-dashed border-slate-200 min-h-[7rem]">
        {images.map((url, idx) => (
          <div key={url} className="relative group">
            <Image
              src={url}
              alt=""
              width={80}
              height={80}
              className="h-20 w-20 object-cover rounded-xl border border-slate-200 shadow-sm"
            />
            {!disabled && (
              <button
                type="button"
                onClick={() => remove(idx)}
                className="absolute -top-1 -right-1 size-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <XIcon className="size-3" />
              </button>
            )}
          </div>
        ))}
        {!disabled && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="h-24 w-24 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/50 flex flex-col items-center justify-center gap-1 text-muted-foreground hover:bg-amber-50/80 hover:border-amber-300 transition-colors"
          >
            <PlusIcon className="size-6" />
            <span className="text-xs">הוסף</span>
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleUpload}
      />
    </div>
  );
}
