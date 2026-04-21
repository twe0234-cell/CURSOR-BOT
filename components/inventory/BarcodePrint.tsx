"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { PrinterIcon } from "lucide-react";
import { LabelCode } from "@/components/labels/LabelCode";
import { buildLabelCodePayload } from "@/src/lib/labels/codePayload";

type Props = {
  value: string;
  title?: string;
  subtitle?: string;
  priceText?: string;
  /** Barcode module width (react-barcode) */
  width?: number;
  height?: number;
};

/**
 * Opens a print window sized for Nimbot B1 landscape labels (50mm × 30mm),
 * matching Torah QA batch print CSS.
 */
export function BarcodePrint({
  value,
  title,
  subtitle,
  priceText,
  width = 1.15,
  height = 28,
}: Props) {
  const printRef = useRef<HTMLDivElement>(null);
  const qrPayload = buildLabelCodePayload("inventory", { sku: value });

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
            .label-wrap {
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              align-items: stretch;
              width: 100%;
              height: 100%;
              gap: 1mm;
            }
            .title {
              text-align: center;
              font-weight: 700;
              font-size: 8pt;
              line-height: 1.2;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }
            .subtitle {
              text-align: center;
              font-size: 7pt;
              line-height: 1.1;
            }
            .price {
              text-align: center;
              font-size: 8pt;
              font-weight: 700;
              line-height: 1.1;
            }
            .code-wrap {
              display: flex;
              justify-content: center;
              align-items: center;
              width: 100%;
              min-height: 12mm;
            }
            .code-wrap svg { max-width: 100%; height: auto; }
            .sku {
              text-align: center;
              font-size: 6.5pt;
              font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }
          </style>
        </head>
        <body>
          <div class="label-wrap">${inner}</div>
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
      <div ref={printRef} className="nimbot-b1-label flex flex-col justify-between bg-white text-black">
        {title ? (
          <p className="title" title={title}>
            {title}
          </p>
        ) : null}
        {subtitle ? <p className="subtitle">{subtitle}</p> : null}
        <div className="code-wrap">
          <LabelCode
            value={value}
            qrValue={qrPayload}
            showQr
            barcodeWidth={width}
            barcodeHeight={height}
          />
        </div>
        {priceText ? <p className="price">{priceText}</p> : null}
        <p className="sku" title={value}>{value}</p>
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
