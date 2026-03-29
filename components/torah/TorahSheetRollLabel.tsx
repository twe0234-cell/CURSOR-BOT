"use client";

import Barcode from "react-barcode";

export type TorahSheetRollLabelProps = {
  projectTitle: string;
  projectId: string;
  sheetNumber: number;
  sku: string | null;
};

function barcodeValue(projectId: string, sheetNumber: number, sku: string | null): string {
  const s = sku?.trim();
  if (s && s.length > 0) return s.replace(/\s+/g, "");
  const compact = projectId.replace(/-/g, "").slice(0, 8).toUpperCase();
  return `T${compact}S${String(sheetNumber).padStart(2, "0")}`;
}

/** Nimbot B1 — 50×30 מ״מ; עטיפה חיצונית עם `torah-roll-label-break` לגליל */
export function TorahSheetRollLabel({
  projectTitle,
  projectId,
  sheetNumber,
  sku,
}: TorahSheetRollLabelProps) {
  const val = barcodeValue(projectId, sheetNumber, sku);
  const title =
    projectTitle.length > 36 ? `${projectTitle.slice(0, 34)}…` : projectTitle;

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

      <div className="nimbot-b1-label-barcode mx-auto flex max-h-[10mm] items-center justify-center overflow-hidden [&_svg]:max-h-[9mm]">
        <Barcode
          value={val}
          format="CODE128"
          displayValue={false}
          width={0.75}
          height={22}
          margin={0}
          background="#ffffff"
          lineColor="#000000"
          renderer="svg"
        />
      </div>

      <div className="nimbot-b1-label-footer space-y-0.5 text-center text-[7px] leading-tight text-black sm:text-[8px]">
        <p className="font-semibold">יריעה {sheetNumber} / 62</p>
        <p className="truncate font-mono text-[6px]" title={val}>
          {val}
        </p>
      </div>
    </div>
  );
}
