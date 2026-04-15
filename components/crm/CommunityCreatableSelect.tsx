"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchCrmCommunityOptions, appendCrmCommunityOption } from "@/app/crm/community-dropdown-actions";
import { toast } from "sonner";

type Props = {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
};

export function CommunityCreatableSelect({ value, onChange, disabled }: Props) {
  const [options, setOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState(value);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    let cancelled = false;
    void fetchCrmCommunityOptions().then((res) => {
      if (cancelled) return;
      if (res.success) setOptions(res.options);
      else toast.error(res.error);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const mergedOptions = useMemo(() => {
    const s = new Set(options.map((o) => o.toLowerCase()));
    if (value.trim() && !s.has(value.trim().toLowerCase())) {
      return [value.trim(), ...options];
    }
    return options;
  }, [options, value]);

  const canAdd =
    draft.trim().length > 0 &&
    !mergedOptions.some((o) => o.toLowerCase() === draft.trim().toLowerCase());

  async function handleAddNew() {
    const v = draft.trim();
    if (!v) return;
    setAdding(true);
    try {
      const res = await appendCrmCommunityOption(v);
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      setOptions((prev) =>
        prev.some((p) => p.toLowerCase() === v.toLowerCase()) ? prev : [...prev, v]
      );
      onChange(v);
      toast.success("הערך נוסף לרשימה");
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="space-y-2">
      <label className="text-xs text-muted-foreground">קהילה / מוסד</label>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1 min-w-0">
          <Input
            list="crm-community-options"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              onChange(e.target.value);
            }}
            placeholder={loading ? "טוען..." : "בחר או הקלד ערך חדש"}
            disabled={disabled || loading}
            className="rounded-lg"
          />
          <datalist id="crm-community-options">
            {mergedOptions.map((o) => (
              <option key={o} value={o} />
            ))}
          </datalist>
        </div>
        {canAdd && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
            disabled={adding || disabled}
            onClick={() => void handleAddNew()}
          >
            {adding ? "…" : "שמור ברשימה"}
          </Button>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">
        בחירה מהרשימה או הקלדה חופשית; «שמור ברשימה» מוסיף ל־sys_dropdowns לשימוש חוזר.
      </p>
    </div>
  );
}
