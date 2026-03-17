"use client";

import { useState, useEffect, useRef } from "react";
import { AddScribeModal, type NewScribe } from "./AddScribeModal";
import { fetchScribes } from "@/app/crm/actions";
import { PlusIcon, ChevronDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Scribe = { id: string; name: string };

type Props = {
  value: string | null;
  onChange: (scribe: { id: string; name: string } | null) => void;
  placeholder?: string;
  className?: string;
};

export function ScribeCombobox({
  value,
  onChange,
  placeholder = "בחר סופר",
  className,
}: Props) {
  const [scribes, setScribes] = useState<Scribe[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [addModalOpen, setAddModalOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetchScribes().then((r) => {
      if (!cancelled) {
        if (r.success) setScribes(r.scribes);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [addModalOpen]);

  const selected = scribes.find((s) => s.id === value);
  const filtered = search.trim()
    ? scribes.filter((s) =>
        s.name.toLowerCase().includes(search.toLowerCase())
      )
    : scribes;

  const handleSelect = (s: Scribe) => {
    onChange(s);
    setSearch("");
    setOpen(false);
  };

  const handleAddSuccess = (newScribe: NewScribe) => {
    const scribe = { id: newScribe.id, name: newScribe.name };
    setScribes((prev) => [...prev, scribe]);
    onChange(scribe);
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
        aria-controls="scribe-listbox"
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
          className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
        />
      </div>

      {open && (
        <div id="scribe-listbox" role="listbox" className="absolute top-full left-0 right-0 z-50 mt-1 max-h-48 overflow-y-auto rounded-lg border border-input bg-background shadow-lg">
          {loading ? (
            <div className="px-3 py-4 text-center text-sm text-muted-foreground">טוען...</div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setAddModalOpen(true)}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted"
              >
                <PlusIcon className="size-4" />
                הוסף סופר חדש
              </button>
              {filtered.length === 0 ? (
                <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                  לא נמצאו תוצאות
                </div>
              ) : (
                filtered.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => handleSelect(s)}
                    className={cn(
                      "w-full px-3 py-2 text-right text-sm hover:bg-muted",
                      value === s.id && "bg-muted"
                    )}
                  >
                    {s.name}
                  </button>
                ))
              )}
            </>
          )}
        </div>
      )}

      <AddScribeModal
        open={addModalOpen}
        onOpenChange={setAddModalOpen}
        onSuccess={handleAddSuccess}
      />
    </div>
  );
}
