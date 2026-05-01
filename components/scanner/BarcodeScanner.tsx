"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { Button } from "@/components/ui/button";
import { CameraIcon, XIcon } from "lucide-react";

type Props = {
  /** Called once a barcode/QR is decoded. Caller decides next step (no auto-submit). */
  onDecoded: (text: string) => void;
  /** Called when the user cancels or the scanner errors out. */
  onClose: () => void;
  /** Optional preferred camera facing mode. Mobile rear cam by default. */
  facingMode?: "environment" | "user";
};

/**
 * BarcodeScanner — minimal browser camera scanner using @zxing/browser.
 *
 * Supports CODE128 (default app barcode), QR (label QR payload), EAN, UPC,
 * CODE39 — anything @zxing/browser auto-detects via MultiFormatReader.
 *
 * POC scope:
 * - First detected code triggers `onDecoded` and stops the stream.
 * - No auto-navigation, no destructive action — caller fills a search field.
 * - Falls back to a clear error message when camera permission is denied.
 */
export function BarcodeScanner({ onDecoded, onClose, facingMode = "environment" }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const reader = new BrowserMultiFormatReader();

    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setError("דפדפן זה לא תומך במצלמה");
          setStarting(false);
          return;
        }
        const constraints: MediaStreamConstraints = {
          video: { facingMode: { ideal: facingMode } },
          audio: false,
        };
        const video = videoRef.current;
        if (!video) return;

        const controls = await reader.decodeFromConstraints(
          constraints,
          video,
          (result, err) => {
            if (cancelled) return;
            if (result) {
              const text = result.getText().trim();
              if (text) {
                controls.stop();
                onDecoded(text);
              }
              return;
            }
            // err: NotFoundException is normal between frames; ignore.
            if (err && err.name && err.name !== "NotFoundException") {
              // Keep stream alive on transient decode errors.
              // Surface only fatal issues.
            }
          }
        );

        if (cancelled) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;
        setStarting(false);
      } catch (e) {
        if (cancelled) return;
        const msg =
          e instanceof Error
            ? e.name === "NotAllowedError"
              ? "אין הרשאת מצלמה. אשר בהגדרות הדפדפן"
              : e.message
            : "שגיאה בהפעלת המצלמה";
        setError(msg);
        setStarting(false);
      }
    }

    void start();

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [facingMode, onDecoded]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/85 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="סורק ברקוד"
    >
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-white/20 bg-black">
        <video
          ref={videoRef}
          className="block aspect-[3/4] w-full object-cover"
          playsInline
          muted
        />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-1/2 w-4/5 rounded-xl border-2 border-emerald-400/80" />
        </div>
      </div>

      <div className="mt-4 max-w-md text-center text-sm text-white">
        {starting && !error ? "מאתחל מצלמה…" : null}
        {error ? <span className="text-red-300">{error}</span> : null}
        {!error && !starting ? "כוון לברקוד או QR בתוך המסגרת" : null}
      </div>

      <div className="mt-3 flex gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={onClose}>
          <XIcon className="size-4 ml-1" />
          סגור
        </Button>
      </div>

      <p className="mt-2 text-xs text-white/60">
        <CameraIcon className="ml-1 inline size-3" />
        תומך CODE128 / QR / EAN / UPC / CODE39
      </p>
    </div>
  );
}
