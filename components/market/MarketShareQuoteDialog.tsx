"use client";

import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { MarketTorahBookRow } from "@/app/market/actions";
import {
  buildMarketTorahQuoteText,
  emailCampaignsPrefillPath,
  whatsappPrefillPath,
} from "@/lib/market/shareOfferText";
import { MessageCircle, Mail, FileText } from "lucide-react";

export function MarketShareQuoteDialog({
  row,
  open,
  onOpenChange,
}: {
  row: MarketTorahBookRow | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  if (!row) return null;

  const text = buildMarketTorahQuoteText(row);
  const subject =
    row.sku != null && String(row.sku).trim()
      ? `הצעת מחיר — ספר תורה ${row.sku}`
      : "הצעת מחיר — ספר תורה";

  const waHref = whatsappPrefillPath(text);
  const emailHref = emailCampaignsPrefillPath(subject, text);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="size-5 text-sky-600" />
            שיתוף הצעת מחיר
          </DialogTitle>
          <DialogDescription className="text-right">
            טקסט מוכן לשליחה — וואטסאפ (wa.me דרך המערכת) או מעבר לעורך המיילים עם מילוי אוטומטי.
          </DialogDescription>
        </DialogHeader>
        <pre className="max-h-48 overflow-y-auto rounded-lg border bg-muted/40 p-3 text-xs whitespace-pre-wrap text-right leading-relaxed">
          {text}
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
