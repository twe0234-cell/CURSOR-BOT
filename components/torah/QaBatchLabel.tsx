"use client";

import { LabelCode } from "@/components/labels/LabelCode";
import { buildLabelCodePayload } from "@/src/lib/labels/codePayload";

export type QaBatchLabelProps = {
  projectTitle: string;
  batchId: string;
  sheetNumbers: number[];
  sentDateIso: string;
};

/** Nimbot B1 landscape label: 50mm × 30mm. Use inside `@media print` with `@page { size: 50mm 30mm }`. */
export function QaBatchLabel({
  projectTitle,
  batchId,
  sheetNumbers,
  sentDateIso,
}: QaBatchLabelProps) {
  const barcodeValue = batchId.replace(/-/g, "").toUpperCase();
  const qrPayload = buildLabelCodePayload("qa-batch", {
    batchId,
    sheets: sheetNumbers.length,
  });
  const dateStr = new Date(sentDateIso).toLocaleDateString("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
  const sheetsStr =
    sheetNumbers.length > 0 ? sheetNumbers.join(", ") : "—";
  const title =
    projectTitle.length > 42 ? `${projectTitle.slice(0, 40)}…` : projectTitle;

  return (
    <div
      className="nimbot-b1-label flex flex-col justify-between bg-white text-black"
      dir="rtl"
    >
      <p
        className="nimbot-b1-label-title truncate text-center font-semibold leading-tight text-black"
        title={projectTitle}
      >
        {title || "—"}
      </p>

      <div className="nimbot-b1-label-barcode mx-auto flex max-h-[10mm] w-full items-center justify-center overflow-hidden">
        <LabelCode value={barcodeValue} qrValue={qrPayload} showQr />
      </div>

      <div className="nimbot-b1-label-footer space-y-0.5 text-center text-[7px] leading-tight text-black sm:text-[8px]">
        <p className="font-semibold">שקית הגהה · {dateStr}</p>
        <p className="truncate" title={`יריעות: ${sheetsStr}`}>
          יריעות: {sheetsStr}
        </p>
      </div>
    </div>
  );
}
