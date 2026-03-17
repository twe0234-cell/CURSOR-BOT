"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { saveEmailSignature } from "./actions";

type Props = {
  initialSignature: string | null;
};

export default function EmailSignatureSection({ initialSignature }: Props) {
  const [signature, setSignature] = useState(initialSignature ?? "");
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    setLoading(true);
    const res = await saveEmailSignature(signature);
    setLoading(false);
    if (res.success) {
      toast.success("חתימת האימייל נשמרה");
    } else {
      toast.error(res.error);
    }
  };

  return (
    <div className="mb-8 rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="mb-2 text-base font-semibold text-slate-700">חתימת אימייל גלובלית</h3>
      <p className="mb-3 text-sm text-muted-foreground">
        תתווסף אוטומטית לכל קמפיין אימייל
      </p>
      <textarea
        value={signature}
        onChange={(e) => setSignature(e.target.value)}
        placeholder="שם, טלפון, אתר..."
        rows={3}
        className="mb-3 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
      />
      <Button onClick={handleSave} disabled={loading} size="sm" className="rounded-xl">
        {loading ? "שומר..." : "שמור"}
      </Button>
    </div>
  );
}
