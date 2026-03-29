"use client";

import { useEffect, useState } from "react";
import { TorahSheetRollLabel } from "@/components/torah/TorahSheetRollLabel";
import { Button } from "@/components/ui/button";
import { TORAH_SHEET_COUNT } from "@/src/lib/types/torah";

type Props = {
  projectId: string;
  projectTitle: string;
  /** מפת מספר יריעה → מק״ט */
  skuBySheetNumber: Record<number, string | null>;
};

export function PrintTorahRollClient({ projectId, projectTitle, skuBySheetNumber }: Props) {
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
    <div className="print-torah-roll-page flex min-h-screen flex-col items-center gap-6 bg-slate-100 p-6">
      <div className="print-torah-roll-toolbar flex flex-wrap items-center gap-3">
        <Button type="button" className="bg-sky-600 hover:bg-sky-700" onClick={() => window.print()}>
          הדפס גליל (62 מדבקות)
        </Button>
        <p className="text-xs text-muted-foreground max-w-md">
          ניימבוט B1 — 50×30 מ״מ. כל מדבקה בעמוד נפרד (page-break-after).
        </p>
      </div>

      <div className="flex flex-col items-center gap-0">
        {Array.from({ length: TORAH_SHEET_COUNT }, (_, i) => {
          const n = i + 1;
          return (
            <div key={n} className="torah-roll-label-break flex justify-center py-2 print:py-0">
              <TorahSheetRollLabel
                projectTitle={projectTitle}
                projectId={projectId}
                sheetNumber={n}
                sku={skuBySheetNumber[n] ?? null}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
