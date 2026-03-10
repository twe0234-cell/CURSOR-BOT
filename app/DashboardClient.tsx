"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { searchByScribeCode, type ScribeSearchResult } from "@/app/actions/scribeSearch";
import { SearchIcon } from "lucide-react";

export default function DashboardClient() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ScribeSearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    const res = await searchByScribeCode(query);
    setLoading(false);
    if (res.success) {
      setResults(res.results);
    } else {
      setResults([]);
    }
  };

  return (
    <Card className="mb-8 border-teal-100 rounded-2xl">
      <CardContent className="p-4">
        <label className="mb-2 block text-sm font-medium text-slate-700">
          חיפוש מק״ט סופר
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <SearchIcon className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="#121 או טקסט מהערות פנימיות"
              className="pr-10 rounded-xl"
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={loading}
            className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
          >
            {loading ? "מחפש..." : "חפש"}
          </button>
        </div>
        {results !== null && (
          <div className="mt-4 space-y-2 max-h-48 overflow-y-auto">
            {results.length === 0 ? (
              <p className="text-sm text-muted-foreground">לא נמצאו תוצאות</p>
            ) : (
              results.map((r, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-slate-100 bg-slate-50/50 p-3 text-sm"
                >
                  <span className="text-xs text-muted-foreground">
                    {r.source === "broadcast" ? "שידור" : "מלאי"}
                  </span>
                  {r.scribe_code && (
                    <p className="font-mono font-medium text-teal-700">{r.scribe_code}</p>
                  )}
                  {r.internal_notes && (
                    <p className="text-slate-700 mt-1">{r.internal_notes}</p>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
