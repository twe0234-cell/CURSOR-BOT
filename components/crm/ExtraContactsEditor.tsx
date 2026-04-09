"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PlusIcon, Trash2Icon } from "lucide-react";

type ContactItem = { label: string; value: string };

type Props = {
  title: string;
  placeholder: string;
  labelPlaceholder: string;
  items: ContactItem[];
  onChange: (items: ContactItem[]) => void;
};

export default function ExtraContactsEditor({
  title,
  placeholder,
  labelPlaceholder,
  items,
  onChange,
}: Props) {
  const [newLabel, setNewLabel] = useState("");
  const [newValue, setNewValue] = useState("");

  const add = () => {
    const v = newValue.trim();
    if (!v) return;
    onChange([...items, { label: newLabel.trim() || labelPlaceholder, value: v }]);
    setNewLabel("");
    setNewValue("");
  };

  const remove = (i: number) => onChange(items.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-slate-600">{title}</p>
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-20 shrink-0 rounded bg-slate-100 px-2 py-1 text-xs text-muted-foreground truncate">
            {item.label}
          </span>
          <span className="flex-1 text-sm font-mono truncate">{item.value}</span>
          <button
            type="button"
            onClick={() => remove(i)}
            className="text-red-400 hover:text-red-600"
          >
            <Trash2Icon className="size-4" />
          </button>
        </div>
      ))}
      <div className="flex gap-1.5">
        <Input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          placeholder={labelPlaceholder}
          className="w-24 shrink-0 h-8 text-sm"
        />
        <Input
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          placeholder={placeholder}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
          className="flex-1 h-8 text-sm"
        />
        <Button type="button" size="icon" variant="outline" onClick={add} className="h-8 w-8 shrink-0">
          <PlusIcon className="size-4" />
        </Button>
      </div>
    </div>
  );
}
