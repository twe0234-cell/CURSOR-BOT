"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { importMarketTorahFromEmailMessage } from "./actions";

export default function EmailToMarketCard() {
  const [rawText, setRawText] = useState("");
  const [sourceEmail, setSourceEmail] = useState("");
  const [isPending, startTransition] = useTransition();

  const onImport = () => {
    startTransition(async () => {
      const res = await importMarketTorahFromEmailMessage(rawText, sourceEmail);
      if (res.success) {
        toast.success(`נוסף למאגר בהצלחה (${res.sku})`);
        setRawText("");
      } else {
        toast.error(res.error);
      }
    });
  };

  return (
    <div className="mb-6 rounded-xl border bg-white p-4">
      <h2 className="text-lg font-semibold text-slate-800">ייבוא תוכן מייל למאגר ספרי תורה</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        הדבק תוכן מייל (גודל/כתב/מחיר), והמערכת תייצר רשומה במאגר.
      </p>
      <div className="mt-3 grid gap-3">
        <Input
          value={sourceEmail}
          onChange={(e) => setSourceEmail(e.target.value)}
          placeholder="מייל מקור (אופציונלי)"
          type="email"
        />
        <textarea
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          placeholder={"לדוגמה:\nתורה 42 ארי\nמחיר 185 אלף"}
          rows={6}
          className="w-full rounded-lg border px-3 py-2 text-sm"
        />
        <div className="flex justify-end">
          <Button onClick={onImport} disabled={isPending || !rawText.trim()}>
            {isPending ? "מייבא..." : "ייבוא למאגר"}
          </Button>
        </div>
      </div>
    </div>
  );
}
