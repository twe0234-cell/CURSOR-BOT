"use client";

import { useState, useEffect, useRef } from "react";
import { AddDealerModal, type NewDealer } from "@/components/crm/AddDealerModal";
import { fetchDealers } from "@/app/crm/actions";
import { ChevronDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Dealer = { id: string; name: string };

export type UnifiedDealerSelectProps = {
  value: string | null;
  onChange: (dealer: { id: string; name: string } | null) => void;
  placeholder?: string;
  className?: string;
};

/** כל אנשי הקשר ב-CRM — לבחירת בעלים/סוחר. */
export function UnifiedDealerSelect({
  value,
  onChange,
  placeholder = "בחר סוחר",
  className,
}: UnifiedDealerSelectProps) {
  const [dealers, setDealers] = useState<Dealer[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [addModalOpen, setAddModalOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setLoading(true);
    });
    fetchDealers().then((r) => {
      if (!cancelled) {
        if (r.success) setDealers(r.dealers);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [addModalOpen]);

  const selected = dealers.find((d) => d.id === value);
  const filtered = search.trim()
    ? dealers.filter((d) => d.name.toLowerCase().includes(search.toLowerCase()))
    : dealers;

  const handleSelect = (d: Dealer) => {
    onChange(d);
    setSearch("");
    setOpen(false);
  };

  const handleAddSuccess = (newDealer: NewDealer) => {
    const dealer = { id: newDealer.id, name: newDealer.name };
    setDealers((prev) => {
      if (prev.some((p) => p.id === dealer.id)) return prev;
      return [...prev, dealer];
    });
    onChange(dealer);
    setOpen(false);
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, []);

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div
        role="combobox"
        aria-expanded={open}
        aria-controls="unified-dealer-listbox"
        className="flex h-8 w-full min-w-0 items-center rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <input
          type="text"
          value={open ? search : selected?.name ?? ""}
          onChange={(e) => {
            setSearch(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="flex-1 min-w-0 bg-transparent outline-none placeholder:text-muted-foreground"
        />
        <ChevronDownIcon
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180"
          )}
        />
      </div>

      {open && (
        <div
          id="unified-dealer-listbox"
          role="listbox"
          className="absolute top-full left-0 right-0 z-50 mt-1 flex max-h-56 flex-col overflow-hidden rounded-lg border border-input bg-background shadow-lg"
        >
          <div className="min-h-0 flex-1 overflow-y-auto">
            <button
              type="button"
              onClick={() => {
                onChange(null);
                setSearch("");
                setOpen(false);
              }}
              className="w-full px-3 py-2 text-right text-sm text-muted-foreground hover:bg-muted"
            >
              — ללא בעלים נפרד —
            </button>
            {loading ? (
              <div className="px-3 py-4 text-center text-sm text-muted-foreground">טוען...</div>
            ) : filtered.length === 0 ? (
              <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                לא נמצאו תוצאות
              </div>
            ) : (
              filtered.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => handleSelect(d)}
                  className={cn(
                    "w-full px-3 py-2 text-right text-sm hover:bg-muted",
                    value === d.id && "bg-muted"
                  )}
                >
                  {d.name}
                </button>
              ))
            )}
          </div>
          <div className="sticky bottom-0 border-t border-border bg-background p-1.5 shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
            <button
              type="button"
              onClick={() => setAddModalOpen(true)}
              className="flex w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-primary hover:bg-muted"
            >
              ➕ הוסף סוחר חדש
            </button>
          </div>
        </div>
      )}

      <AddDealerModal
        open={addModalOpen}
        onOpenChange={setAddModalOpen}
        onSuccess={handleAddSuccess}
      />
    </div>
  );
}
