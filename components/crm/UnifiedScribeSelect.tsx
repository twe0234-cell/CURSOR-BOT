"use client";

import { useState, useEffect, useRef, useLayoutEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { AddScribeModal, type NewScribe } from "@/components/inventory/AddScribeModal";
import { fetchScribes } from "@/app/crm/actions";
import { ChevronDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Scribe = { id: string; name: string };

/** z-index above Dialog overlay/content (z-50) */
const LISTBOX_Z = 100;

export type UnifiedScribeSelectProps = {
  value: string | null;
  onChange: (scribe: { id: string; name: string } | null) => void;
  placeholder?: string;
  className?: string;
};

type ListCoords = {
  top: number;
  left: number;
  width: number;
  maxH: number;
};

/**
 * Single CRM-backed combobox for Soferim (`crm_contacts.type = 'Scribe'`).
 * Sticky “add new” at the bottom of the dropdown; opens modal and selects on success.
 * Listbox is portaled to document.body so it is not clipped inside overflow-y-auto dialogs.
 */
export function UnifiedScribeSelect({
  value,
  onChange,
  placeholder = "בחר סופר",
  className,
}: UnifiedScribeSelectProps) {
  const [scribes, setScribes] = useState<Scribe[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [addModalOpen, setAddModalOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<ListCoords | null>(null);

  const updatePosition = useCallback(() => {
    const el = containerRef.current;
    if (!el || !open) return;
    const rect = el.getBoundingClientRect();
    const margin = 4;
    const viewportPad = 8;
    const maxList = 224;
    const spaceBelow = window.innerHeight - rect.bottom - margin - viewportPad;
    const spaceAbove = rect.top - margin - viewportPad;
    const openDown = spaceBelow >= Math.min(maxList, 120) || spaceBelow >= spaceAbove;
    const maxH = Math.min(maxList, openDown ? spaceBelow : spaceAbove);
    const top = openDown ? rect.bottom + margin : rect.top - margin - maxH;
    const left = rect.left;
    const width = rect.width;
    setCoords({ top, left, width, maxH: Math.max(80, maxH) });
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    const onScrollOrResize = () => {
      updatePosition();
    };
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open, updatePosition]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchScribes().then((r) => {
      if (!cancelled) {
        if (r.success) setScribes(r.scribes);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [addModalOpen]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const selected = scribes.find((s) => s.id === value);
  const filtered = search.trim()
    ? scribes.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()))
    : scribes;

  const handleSelect = (s: Scribe) => {
    onChange(s);
    setSearch("");
    setOpen(false);
  };

  const handleAddSuccess = (newScribe: NewScribe) => {
    const scribe = { id: newScribe.id, name: newScribe.name };
    setScribes((prev) => {
      if (prev.some((p) => p.id === scribe.id)) return prev;
      return [...prev, scribe];
    });
    onChange(scribe);
    setOpen(false);
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (containerRef.current?.contains(t)) return;
      if (popoverRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const listbox =
    open && coords ? (
      <div
        ref={popoverRef}
        id="unified-scribe-listbox"
        role="listbox"
        style={{
          position: "fixed",
          top: coords.top,
          left: coords.left,
          width: coords.width,
          maxHeight: coords.maxH,
          zIndex: LISTBOX_Z,
        }}
        className="flex flex-col overflow-hidden rounded-lg border border-input bg-background shadow-lg"
      >
        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <div className="px-3 py-4 text-center text-sm text-muted-foreground">טוען...</div>
          ) : filtered.length === 0 ? (
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
        </div>
        <div className="sticky bottom-0 border-t border-border bg-background p-1.5 shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setAddModalOpen(true);
            }}
            className="flex w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-primary hover:bg-muted"
          >
            ➕ הוסף סופר חדש
          </button>
        </div>
      </div>
    ) : null;

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div
        role="combobox"
        aria-expanded={open}
        aria-controls="unified-scribe-listbox"
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
        <button
          type="button"
          tabIndex={-1}
          aria-label="פתח רשימה"
          className="shrink-0 p-0.5 text-muted-foreground hover:text-foreground"
          onMouseDown={(e) => {
            e.preventDefault();
            setOpen((o) => !o);
          }}
        >
          <ChevronDownIcon
            className={cn("size-4 transition-transform", open && "rotate-180")}
          />
        </button>
      </div>

      {listbox && typeof document !== "undefined"
        ? createPortal(listbox, document.body)
        : null}

      <AddScribeModal
        open={addModalOpen}
        onOpenChange={setAddModalOpen}
        onSuccess={handleAddSuccess}
      />
    </div>
  );
}
