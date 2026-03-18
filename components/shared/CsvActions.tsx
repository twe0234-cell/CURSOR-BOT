"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/button";
import Papa from "papaparse";
import { DownloadIcon, UploadIcon } from "lucide-react";

type Props = {
  data: Record<string, unknown>[];
  onImport: (parsed: Record<string, unknown>[]) => void;
  filename?: string;
  exportLabel?: string;
  importLabel?: string;
};

export function CsvActions({
  data,
  onImport,
  filename = "export",
  exportLabel = "ייצוא CSV",
  importLabel = "ייבוא CSV",
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleExport = () => {
    if (!data || data.length === 0) return;
    const csv = Papa.unparse(data);
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportClick = () => {
    inputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = (results.data ?? []).filter(
          (r): r is Record<string, unknown> => r != null && typeof r === "object"
        );
        onImport(rows);
      },
      error: () => {
        onImport([]);
      },
    });
    e.target.value = "";
  };

  return (
    <div className="flex gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={handleExport}
        disabled={!data || data.length === 0}
        className="rounded-xl"
      >
        <DownloadIcon className="size-4 ml-1" />
        {exportLabel}
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={handleImportClick}
        className="rounded-xl"
      >
        <UploadIcon className="size-4 ml-1" />
        {importLabel}
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
}
