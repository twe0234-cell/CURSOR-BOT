"use client";

import { useEffect, useState } from "react";
import { QaBatchLabel } from "@/components/torah/QaBatchLabel";
import { Button } from "@/components/ui/button";

type Props = {
  projectTitle: string;
  batchId: string;
  sheetNumbers: number[];
  sentDateIso: string;
};

export function PrintBatchClient({
  projectTitle,
  batchId,
  sheetNumbers,
  sentDateIso,
}: Props) {
  const [allowAutoPrint, setAllowAutoPrint] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setAllowAutoPrint(true), 150);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!allowAutoPrint) return;
    const t = setTimeout(() => window.print(), 300);
    return () => clearTimeout(t);
  }, [allowAutoPrint]);

  return (
    <div className="print-batch-page flex min-h-screen flex-col items-center justify-center gap-6 bg-slate-100 p-6">
      <div className="print-batch-toolbar flex flex-wrap items-center gap-3">
        <Button type="button" className="bg-sky-600 hover:bg-sky-700" onClick={() => window.print()}>
          הדפס מדבקה
        </Button>
        <p className="text-xs text-muted-foreground max-w-md">
          ניימבוט B1 — 50×30 מ״מ. ודאו שהמדפסת מוגדרת ללא שוליים ולמדבקה בודדת.
        </p>
      </div>

      <QaBatchLabel
        projectTitle={projectTitle}
        batchId={batchId}
        sheetNumbers={sheetNumbers}
        sentDateIso={sentDateIso}
      />
    </div>
  );
}
