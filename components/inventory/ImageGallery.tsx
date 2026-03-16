"use client";

import { useRef } from "react";
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

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.startsWith("image/")) continue;
      const formData = new FormData();
      formData.set("file", file);
      const res = await uploadInventoryImage(formData);
      if (res.success) {
        onChange([...images, res.url]);
        toast.success("התמונה הועלתה");
      } else {
        toast.error(res.error);
      }
    }
    e.target.value = "";
  };

  const remove = (idx: number) => {
    onChange(images.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {images.map((url, idx) => (
          <div key={url} className="relative group">
            <Image
              src={url}
              alt=""
              width={80}
              height={80}
              className="h-20 w-20 object-cover rounded-lg border"
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
            className="h-20 w-20 rounded-lg border border-dashed flex items-center justify-center text-muted-foreground hover:bg-muted"
          >
            <PlusIcon className="size-6" />
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
