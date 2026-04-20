"use client";

import Barcode from "react-barcode";
import { QRCodeSVG } from "qrcode.react";

type LabelCodeProps = {
  value: string;
  showQr?: boolean;
  qrValue?: string;
  barcodeHeight?: number;
  barcodeWidth?: number;
  displayBarcodeValue?: boolean;
};

export function LabelCode({
  value,
  showQr = false,
  qrValue,
  barcodeHeight = 22,
  barcodeWidth = 0.75,
  displayBarcodeValue = false,
}: LabelCodeProps) {
  return (
    <div className="flex w-full items-center justify-center gap-1.5">
      {showQr ? (
        <div className="shrink-0 rounded-[2px] border border-black/20 bg-white p-0.5">
          <QRCodeSVG value={qrValue ?? value} size={38} includeMargin={false} />
        </div>
      ) : null}
      <div className="flex min-w-0 grow items-center justify-center overflow-hidden [&_svg]:max-h-[9mm]">
        <Barcode
          value={value}
          format="CODE128"
          displayValue={displayBarcodeValue}
          width={barcodeWidth}
          height={barcodeHeight}
          margin={0}
          background="#ffffff"
          lineColor="#000000"
          renderer="svg"
          fontSize={8}
        />
      </div>
    </div>
  );
}
