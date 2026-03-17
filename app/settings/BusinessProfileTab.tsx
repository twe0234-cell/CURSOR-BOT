"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveWhatsappNumber, saveEmailSignature } from "./actions";

type Props = {
  initialWhatsappNumber: string | null;
  initialEmailSignature: string | null;
};

export default function BusinessProfileTab({
  initialWhatsappNumber,
  initialEmailSignature,
}: Props) {
  const [whatsappNumber, setWhatsappNumber] = useState(initialWhatsappNumber ?? "");
  const [emailSignature, setEmailSignature] = useState(initialEmailSignature ?? "");
  const [loadingWa, setLoadingWa] = useState(false);
  const [loadingSig, setLoadingSig] = useState(false);

  const handleSaveWhatsapp = async () => {
    setLoadingWa(true);
    const res = await saveWhatsappNumber(whatsappNumber);
    setLoadingWa(false);
    if (res.success) toast.success("מספר ה-WhatsApp נשמר");
    else toast.error(res.error);
  };

  const handleSaveSignature = async () => {
    setLoadingSig(true);
    const res = await saveEmailSignature(emailSignature);
    setLoadingSig(false);
    if (res.success) toast.success("חתימת האימייל נשמרה");
    else toast.error(res.error);
  };

  return (
    <div className="space-y-8">
      <div className="rounded-2xl border border-teal-100 bg-white p-6 shadow-sm">
        <h3 className="mb-2 text-lg font-semibold text-teal-800">מספר WhatsApp לעסק</h3>
        <p className="mb-4 text-sm text-muted-foreground">
          משמש לכפתור &quot;פנה ב-WhatsApp&quot; בדפי המוצרים הציבוריים
        </p>
        <div className="flex gap-2">
          <Input
            value={whatsappNumber}
            onChange={(e) => setWhatsappNumber(e.target.value)}
            placeholder="972501234567"
            className="rounded-xl max-w-xs"
          />
          <Button onClick={handleSaveWhatsapp} disabled={loadingWa} className="rounded-xl">
            {loadingWa ? "שומר..." : "שמור"}
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border border-teal-100 bg-white p-6 shadow-sm">
        <h3 className="mb-2 text-lg font-semibold text-teal-800">חתימת אימייל גלובלית</h3>
        <p className="mb-4 text-sm text-muted-foreground">
          תתווסף אוטומטית לכל קמפיין אימייל
        </p>
        <textarea
          value={emailSignature}
          onChange={(e) => setEmailSignature(e.target.value)}
          placeholder="שם, טלפון, אתר..."
          rows={4}
          className="mb-4 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
        />
        <Button onClick={handleSaveSignature} disabled={loadingSig} className="rounded-xl">
          {loadingSig ? "שומר..." : "שמור"}
        </Button>
      </div>
    </div>
  );
}
