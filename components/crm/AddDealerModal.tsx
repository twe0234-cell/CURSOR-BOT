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
import { createMerchantContact } from "@/app/crm/actions";
import { toast } from "sonner";

export type NewDealer = { id: string; name: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (dealer: NewDealer) => void;
};

export function AddDealerModal({ open, onOpenChange, onSuccess }: Props) {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    const trimmedName = name.trim();
    if (!trimmedName) return;
    setLoading(true);
    try {
      const res = await createMerchantContact(trimmedName);
      if (res.success) {
        onSuccess({ id: res.dealer.id, name: res.dealer.name });
        setName("");
        onOpenChange(false);
        toast.success("הסוחר נוסף");
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
          <DialogTitle>הוסף סוחר חדש (CRM)</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4" onClick={(e) => e.stopPropagation()}>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold text-slate-800">שם</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="שם הסוחר"
              required
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
