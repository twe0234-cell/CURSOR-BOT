"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DownloadIcon } from "lucide-react";

export default function LogExportButton() {
  const [loading, setLoading] = useState(false);

  const handleExport = async (format: "json" | "csv") => {
    setLoading(true);
    try {
      const res = await fetch(`/api/logs/export?format=${format}`);
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = format === "csv" ? "system_logs_dump.csv" : "system_logs_dump.json";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // Silent fail for admin tool
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-8 pt-6 border-t border-slate-200">
      <p className="mb-2 text-xs text-muted-foreground">כלי ניהול</p>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => handleExport("json")}
        disabled={loading}
        className="text-muted-foreground hover:text-foreground"
      >
        <DownloadIcon className="size-4 ml-1" />
        ייצוא לוגים למערכת AI
      </Button>
    </div>
  );
}
