"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { MarketTorahBookRow } from "@/app/market/actions";
import {
  buildMarketTorahQuoteText,
  emailCampaignsPrefillPath,
  whatsappPrefillPath,
} from "@/lib/market/shareOfferText";
import { MessageCircle, Mail, FileText, Sparkles } from "lucide-react";

export function MarketShareQuoteDialog({
  row,
  open,
  onOpenChange,
}: {
  row: MarketTorahBookRow | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [bodyText, setBodyText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  useEffect(() => {
    if (!row) {
      setBodyText("");
      return;
    }
    setBodyText(buildMarketTorahQuoteText(row));
    setAiError(null);
  }, [row]);

  if (!row) return null;

  const currentRow = row;

  const subject =
    currentRow.sku != null && String(currentRow.sku).trim()
      ? `הצעת מחיר — ספר תורה ${currentRow.sku}`
      : "הצעת מחיר — ספר תורה";

  const waHref = whatsappPrefillPath(bodyText);
  const emailHref = emailCampaignsPrefillPath(subject, bodyText);

  async function runAi() {
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await fetch("/api/market/ai-share-quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku: currentRow.sku,
          torah_size: currentRow.torah_size,
          script_type: currentRow.script_type,
          parchment_type: currentRow.parchment_type,
          asking_price: currentRow.asking_price,
          notes: currentRow.notes,
        }),
      });
      const data = (await res.json()) as { text?: string; error?: string };
      if (!res.ok) {
        setAiError(data.error ?? "שגיאה");
        return;
      }
      if (!data.text?.trim()) {
        setAiError("תשובה ריקה");
        return;
      }
      setBodyText(data.text.trim());
    } catch {
      setAiError("שגיאת רשת");
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="size-5 text-sky-600" />
            שיתוף הצעת מחיר
          </DialogTitle>
          <DialogDescription className="text-right">
            טקסט בסיסי מהמאגר, או ניסוח שיווקי ב-AI לפי מפרטים מספריים — ואז שליחה בוואטסאפ או במחולל
            המיילים.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2 justify-end">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="gap-1"
            disabled={aiLoading}
            onClick={() => void runAi()}
          >
            <Sparkles className="size-4" />
            {aiLoading ? "יוצר…" : "ניסוח שיווקי (AI)"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setBodyText(buildMarketTorahQuoteText(currentRow))}
          >
            שחזר טקסט בסיסי
          </Button>
        </div>
        {aiError && <p className="text-sm text-red-600 text-right">{aiError}</p>}
        <pre className="max-h-48 overflow-y-auto rounded-lg border bg-muted/40 p-3 text-xs whitespace-pre-wrap text-right leading-relaxed">
          {bodyText}
        </pre>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end sm:flex-row-reverse">
          <Link
            href={waHref}
            prefetch={false}
            className={cn(
              buttonVariants({ variant: "default" }),
              "gap-2 bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700"
            )}
          >
            <MessageCircle className="size-4 ml-2" />
            שלח בוואטסאפ
          </Link>
          <Link
            href={emailHref}
            prefetch={false}
            className={cn(buttonVariants({ variant: "outline" }), "gap-2")}
          >
            <Mail className="size-4 ml-2" />
            פתח במחולל המיילים
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}
