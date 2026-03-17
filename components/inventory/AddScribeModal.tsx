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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">שם</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="שם הסופר"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">טלפון</label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="טלפון"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">עיר</label>
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
            <Button type="submit" disabled={!name.trim() || loading}>
              {loading ? "שומר..." : "הוסף"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
