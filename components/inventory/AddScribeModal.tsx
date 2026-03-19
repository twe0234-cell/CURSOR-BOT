"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createScribeAction } from "@/app/actions/scribe";
import { toast } from "sonner";

export type NewScribe = {
  id: string;
  name: string;
  phone: string | null;
  city: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (scribe: NewScribe) => void;
};

export function AddScribeModal({ open, onOpenChange, onSuccess }: Props) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    const trimmedName = name.trim();
    if (!trimmedName) return;
    setLoading(true);
    try {
      const res = await createScribeAction({
        name: trimmedName,
        phone: phone.trim() || undefined,
        city: city.trim() || undefined,
      });
      if (res.success) {
        onSuccess(res.scribe);
        setName("");
        setPhone("");
        setCity("");
        onOpenChange(false);
        toast.success("הסופר נוסף");
      } else {
        toast.error(res.error);
      }
    } catch {
      toast.error("שגיאה");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>הוסף סופר חדש</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4" onClick={(e) => e.stopPropagation()}>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold text-slate-800">שם</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="שם הסופר"
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold text-slate-800">טלפון</label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="טלפון"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold text-slate-800">עיר</label>
            <Input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="עיר"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              ביטול
            </Button>
            <Button
              type="button"
              disabled={!name.trim() || loading}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void handleSubmit();
              }}
            >
              {loading ? "שומר..." : "הוסף"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
