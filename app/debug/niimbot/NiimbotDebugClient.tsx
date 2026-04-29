"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type NiimblueModule = typeof import("@mmote/niimbluelib");

const LABEL_WIDTH = 384;
const LABEL_HEIGHT = 192;
const SAMPLE_CODE = "B1-TEST-0001";

function drawSimpleBars(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const pattern = [2, 1, 1, 2, 3, 1, 2, 1, 1, 3, 2, 1, 2, 2, 1, 3];
  let cursor = x;
  for (let i = 0; i < pattern.length && cursor < x + w; i += 1) {
    const bar = Math.max(1, Math.floor((pattern[i] / 3) * 6));
    const isBlack = i % 2 === 0;
    if (isBlack) {
      ctx.fillRect(cursor, y, bar, h);
    }
    cursor += bar;
  }
}

function renderLabel(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  canvas.width = LABEL_WIDTH;
  canvas.height = LABEL_HEIGHT;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, LABEL_WIDTH, LABEL_HEIGHT);

  ctx.fillStyle = "#000000";
  ctx.font = "bold 32px Arial";
  ctx.textAlign = "center";
  ctx.fillText("בדיקת NIIMBOT", LABEL_WIDTH / 2, 52);

  ctx.font = "20px Arial";
  ctx.fillText("B1 Web Bluetooth POC", LABEL_WIDTH / 2, 82);

  drawSimpleBars(ctx, 38, 100, 308, 52);

  ctx.font = "bold 20px monospace";
  ctx.fillText(SAMPLE_CODE, LABEL_WIDTH / 2, 176);
}

export default function NiimbotDebugClient() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const connectionRef = useRef<{
    lib: NiimblueModule;
    client: InstanceType<NiimblueModule["NiimbotBluetoothClient"]>;
  } | null>(null);

  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("מוכן לבדיקה.");
  const [deviceName, setDeviceName] = useState<string | null>(null);
  const [modelMeta, setModelMeta] = useState<string | null>(null);
  const [pngUrl, setPngUrl] = useState<string | null>(null);

  const hasBluetooth = useMemo(
    () => typeof navigator !== "undefined" && typeof navigator.bluetooth !== "undefined",
    []
  );

  useEffect(() => {
    if (canvasRef.current) {
      renderLabel(canvasRef.current);
    }
    return () => {
      if (pngUrl) URL.revokeObjectURL(pngUrl);
      const current = connectionRef.current;
      if (current?.client?.isConnected()) {
        void current.client.disconnect();
      }
    };
  }, [pngUrl]);

  async function loadNiimblue() {
    const lib = await import("@mmote/niimbluelib");
    return lib;
  }

  async function handleConnect() {
    if (!hasBluetooth) {
      setStatus("הדפדפן לא תומך Web Bluetooth.");
      return;
    }

    setBusy(true);
    try {
      const lib = await loadNiimblue();
      const client = new lib.NiimbotBluetoothClient();
      const info = await client.connect();
      const meta = client.getModelMetadata();
      connectionRef.current = { lib, client };
      setDeviceName(info.deviceName ?? "ללא שם");
      setModelMeta(meta ? `${meta.model} (${meta.printheadPixels}px @ ${meta.dpi}DPI)` : "מודל לא מזוהה");
      setStatus("חיבור למדפסת הצליח.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "שגיאת חיבור לא ידועה";
      setStatus(`חיבור נכשל: ${message}`);
    } finally {
      setBusy(false);
    }
  }

  async function handlePrintTest() {
    const active = connectionRef.current;
    const canvas = canvasRef.current;
    if (!active || !canvas) {
      setStatus("יש להתחבר למדפסת לפני הדפסה.");
      return;
    }

    setBusy(true);
    try {
      const { lib, client } = active;
      const encoded = lib.ImageEncoder.encodeCanvas(canvas, "top");
      const task = client.abstraction.newPrintTask("B1", {
        totalPages: 1,
        labelType: lib.LabelType.WithGaps,
      });

      await task.printInit();
      await task.printPage(encoded, 1);
      await task.waitForFinished();
      await task.printEnd();
      setStatus("הדפסת בדיקה נשלחה למדפסת.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "שגיאת הדפסה לא ידועה";
      setStatus(`הדפסה נכשלה: ${message}`);
    } finally {
      setBusy(false);
    }
  }

  function handleExportPng() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (pngUrl) URL.revokeObjectURL(pngUrl);
    canvas.toBlob((blob) => {
      if (!blob) {
        setStatus("נכשל ביצוא PNG.");
        return;
      }
      const url = URL.createObjectURL(blob);
      setPngUrl(url);
      setStatus("PNG מוכן להורדה.");
    }, "image/png");
  }

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8" dir="rtl">
      <h1 className="text-2xl font-bold mb-2">NIIMBOT B1 Web Bluetooth POC</h1>
      <p className="text-sm text-muted-foreground mb-6">
        בדיקת היתכנות מבודדת בלבד. ללא שינוי לזרימות הדפסה קיימות.
      </p>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-base">סטטוס תמיכה בדפדפן</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p>Web Bluetooth API: {hasBluetooth ? "זמין" : "לא זמין"}</p>
          <p>Windows Chrome/Edge: צפוי לעבוד</p>
          <p>Android Chrome: צפוי לעבוד</p>
          <p>iOS Safari: לא נתמך</p>
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-base">תצוגת תווית בדיקה (384px)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-auto rounded-md border p-2 bg-white">
            <canvas ref={canvasRef} className="max-w-full h-auto border" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => void handleConnect()} disabled={busy || !hasBluetooth}>
              התחבר למדפסת
            </Button>
            <Button type="button" variant="secondary" onClick={() => void handlePrintTest()} disabled={busy}>
              הדפס בדיקה
            </Button>
            <Button type="button" variant="outline" onClick={handleExportPng} disabled={busy}>
              ייצא PNG
            </Button>
            {pngUrl ? (
              <a
                href={pngUrl}
                download="niimbot-b1-test-384.png"
                className="inline-flex items-center rounded-md border px-3 py-2 text-sm hover:bg-muted"
              >
                הורד PNG
              </a>
            ) : null}
          </div>
          <div className="text-sm space-y-1">
            <p>סטטוס: {status}</p>
            <p>מדפסת: {deviceName ?? "לא מחובר"}</p>
            <p>מודל: {modelMeta ?? "—"}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
