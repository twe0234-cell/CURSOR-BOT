"use client";

import { useRef } from "react";
import Barcode from "react-barcode";
import { Button } from "@/components/ui/button";
import { PrinterIcon } from "lucide-react";

type Props = {
  value: string;
  /** Niimbot B1 label ~25x15mm at 96dpi ≈ 94x57px; use 2x for retina */
  width?: number;
  height?: number;
};

export function BarcodePrint({ value, width = 2, height = 1 }: Props) {
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    if (!printRef.current) return;
    const printWindow = window.open("", "_blank", "width=400,height=200");
    if (!printWindow) return;
    printWindow.document.write(`
      <!DOCTYPE html>
      <html dir="rtl">
        <head>
          <title>הדפסת מק״ט</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
              width: 25mm;
              height: 15mm;
              padding: 2mm;
              font-family: sans-serif;
              font-size: 8px;
            }
            .barcode-wrap { display: flex; justify-content: center; align-items: center; }
            svg { max-width: 100%; height: auto; }
          </style>
        </head>
        <body>
          <div class="barcode-wrap">${printRef.current.innerHTML}</div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  };

  return (
    <div className="flex flex-col items-center gap-1">
      <div ref={printRef} className="[&>svg]:max-w-full [&>svg]:h-auto">
        <Barcode
          value={value}
          width={width}
          height={height}
          displayValue={true}
          fontSize={10}
        />
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={handlePrint}
        className="h-7 text-xs"
      >
        <PrinterIcon className="size-3.5 ml-1" />
        הדפס
      </Button>
    </div>
  );
}
