"use client";

import { useRef } from "react";
import Barcode from "react-barcode";
import { Button } from "@/components/ui/button";
import { PrinterIcon } from "lucide-react";

type Props = {
  value: string;
  /** Barcode module width (react-barcode) */
  width?: number;
  height?: number;
};

/**
 * Opens a print window sized for Nimbot B1 landscape labels (50mm × 30mm),
 * matching Torah QA batch print CSS.
 */
export function BarcodePrint({ value, width = 1.4, height = 0.9 }: Props) {
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    if (!printRef.current) return;
    const printWindow = window.open("", "_blank", "width=400,height=320");
    if (!printWindow) return;
    const inner = printRef.current.innerHTML;
    printWindow.document.write(`
      <!DOCTYPE html>
      <html dir="rtl">
        <head>
          <meta charset="utf-8" />
          <title>הדפסת מק״ט</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            @media print {
              @page { size: 50mm 30mm; margin: 0; }
              body {
                width: 50mm;
                height: 30mm;
                margin: 0;
                padding: 2mm;
                overflow: hidden;
              }
            }
            body {
              width: 50mm;
              height: 30mm;
              margin: 0;
              padding: 2mm;
              overflow: hidden;
              font-family: system-ui, sans-serif;
            }
            .barcode-wrap {
              display: flex;
              justify-content: center;
              align-items: center;
              width: 100%;
              height: 100%;
            }
            .barcode-wrap svg { max-width: 100%; height: auto; }
          </style>
        </head>
        <body>
          <div class="barcode-wrap">${inner}</div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 300);
  };

  return (
    <div className="flex flex-col items-center gap-1">
      <div ref={printRef} className="nimbot-b1-label flex items-center justify-center [&>svg]:max-w-full [&>svg]:h-auto">
        <Barcode
          value={value}
          width={width}
          height={height}
          displayValue={true}
          fontSize={8}
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
