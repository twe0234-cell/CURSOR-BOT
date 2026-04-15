"use client";

import { useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, ChevronLeft, Image as ImageIcon, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import type { MarketTorahBookRow } from "../actions";
import type { MarketStage } from "../stages";
import { updateMarketStage } from "../actions";
import { buildMarketTorahShareText, whatsappPrefillPath } from "@/lib/market/shareOfferText";

// ─── Stage config ───────────────────────────────────────────────────────────

type StageConfig = {
  key: MarketStage;
  label: string;
  color: string;
  headerBg: string;
};

const STAGES: StageConfig[] = [
  { key: "image_pending", label: "📷 ממתין לפרטים", color: "border-gray-400", headerBg: "bg-gray-100" },
  { key: "new",           label: "🆕 הצעה חדשה",     color: "border-blue-400",  headerBg: "bg-blue-50"  },
  { key: "contacted",     label: "📞 פנינו",           color: "border-yellow-400",headerBg: "bg-yellow-50"},
  { key: "negotiating",   label: "🤝 במשא ומתן",      color: "border-orange-400",headerBg: "bg-orange-50"},
  { key: "deal_closed",   label: "✅ נסגר",            color: "border-green-400", headerBg: "bg-green-50" },
  { key: "archived",      label: "🗄️ ארכיון",          color: "border-slate-300", headerBg: "bg-slate-50" },
];

const STAGE_ORDER = STAGES.map((s) => s.key);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatK(val: number | null | undefined): string {
  if (val == null) return "—";
  return `${val.toLocaleString("he-IL")} א"ש`;
}

function daysAgo(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);
}

/** תואם ל־cardHeadline ב־MarketClient — טקסט בעלים מההצעה לפני שמות CRM */
function cardHeadline(row: MarketTorahBookRow): string {
  const ext = row.external_sofer_name?.trim();
  if (ext) return ext;
  if (row.dealer_id && row.dealer_name) return row.dealer_name;
  if (row.sofer_name) return row.sofer_name;
  return "";
}

// ─── Card ────────────────────────────────────────────────────────────────────

type CardProps = {
  row: MarketTorahBookRow;
  onMove: (id: string, stage: MarketStage) => void;
  isPending: boolean;
};

function KanbanCard({ row, onMove, isPending }: CardProps) {
  const currentIdx = STAGE_ORDER.indexOf((row.market_stage ?? "new") as MarketStage);
  const canGoBack = currentIdx > 0;
  const canGoForward = currentIdx < STAGE_ORDER.length - 1;
  const days = daysAgo(row.created_at);
  const owner = cardHeadline(row);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      whileHover={{ y: -2, boxShadow: "0 4px 16px rgba(0,0,0,0.10)" }}
      transition={{ duration: 0.18 }}
      className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm select-none"
      dir="rtl"
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <span className="font-mono text-[10px] text-slate-300 hover:text-slate-500 transition-colors cursor-default">
            {row.sku ?? "—"}
          </span>
          {owner && (
            <p className="text-sm font-semibold text-slate-800 truncate mt-0.5">{owner}</p>
          )}
        </div>
        {row.handwriting_image_url && (
          <a href={row.handwriting_image_url} target="_blank" rel="noopener noreferrer">
            <ImageIcon size={14} className="text-blue-400 mt-0.5 shrink-0" />
          </a>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-600 mb-2">
        {(row.script_type || row.torah_size) && (
          <span>
            {[row.script_type, row.torah_size].filter(Boolean).join(" · ")}
          </span>
        )}
        {row.asking_price != null && (
          <span className="font-medium text-slate-800">{formatK(row.asking_price)}</span>
        )}
        {row.expected_completion_date && (
          <span className="text-slate-400">
            {row.expected_completion_date.slice(0, 7)}
          </span>
        )}
      </div>

      {/* WA share + Days badge + move buttons */}
      <div className="flex items-center justify-between mt-1">
        <div className="flex items-center gap-1">
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${days > 14 ? "bg-red-50 text-red-400" : "bg-slate-100 text-slate-400"}`}>
            {days === 0 ? "היום" : `לפני ${days} ימים`}
          </span>
          <Link
            href={whatsappPrefillPath(buildMarketTorahShareText(row))}
            prefetch={false}
            title="שיתוף לוואטסאפ"
            className="p-0.5 rounded hover:bg-emerald-50 transition-colors"
          >
            <MessageCircle size={13} className="text-emerald-500" />
          </Link>
        </div>
        <div className="flex gap-1">
          <button
            disabled={!canGoBack || isPending}
            onClick={() => onMove(row.id, STAGE_ORDER[currentIdx - 1]!)}
            className="p-0.5 rounded hover:bg-slate-100 disabled:opacity-20 transition-opacity"
            title="שלב קודם"
          >
            <ChevronRight size={14} className="text-slate-500" />
          </button>
          <button
            disabled={!canGoForward || isPending}
            onClick={() => onMove(row.id, STAGE_ORDER[currentIdx + 1]!)}
            className="p-0.5 rounded hover:bg-slate-100 disabled:opacity-20 transition-opacity"
            title="שלב הבא"
          >
            <ChevronLeft size={14} className="text-slate-500" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Column ──────────────────────────────────────────────────────────────────

function KanbanColumn({
  config,
  rows,
  onMove,
  isPending,
}: {
  config: StageConfig;
  rows: MarketTorahBookRow[];
  onMove: (id: string, stage: MarketStage) => void;
  isPending: boolean;
}) {
  return (
    <div className={`flex flex-col min-w-[200px] w-[220px] shrink-0 rounded-xl border-t-4 ${config.color} bg-slate-50`}>
      {/* Column header */}
      <div className={`${config.headerBg} px-3 py-2 rounded-t-xl flex items-center justify-between`}>
        <span className="text-xs font-semibold text-slate-700">{config.label}</span>
        <span className="text-xs text-slate-400 bg-white rounded-full px-1.5 py-0.5 shadow-sm">
          {rows.length}
        </span>
      </div>

      {/* Cards */}
      <div className="flex-1 p-2 flex flex-col gap-2 overflow-y-auto max-h-[calc(100vh-180px)]">
        <AnimatePresence mode="popLayout">
          {rows.map((row) => (
            <KanbanCard key={row.id} row={row} onMove={onMove} isPending={isPending} />
          ))}
        </AnimatePresence>
        {rows.length === 0 && (
          <p className="text-xs text-slate-300 text-center mt-4">אין רשומות</p>
        )}
      </div>
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────

type Props = {
  initialRows: MarketTorahBookRow[];
};

export default function MarketKanbanClient({ initialRows }: Props) {
  const [rows, setRows] = useState(initialRows);
  const [isPending, startTransition] = useTransition();

  function handleMove(id: string, newStage: MarketStage) {
    // Optimistic update
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, market_stage: newStage } : r))
    );

    startTransition(async () => {
      const res = await updateMarketStage(id, newStage);
      if (!res.success) {
        toast.error(`שגיאה: ${res.error}`);
        // Rollback
        setRows(initialRows);
      }
    });
  }

  const grouped = Object.fromEntries(
    STAGES.map((s) => [
      s.key,
      rows.filter((r) => (r.market_stage ?? "new") === s.key),
    ])
  ) as Record<MarketStage, MarketTorahBookRow[]>;

  return (
    <div className="min-h-screen bg-slate-100 p-4" dir="rtl">
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800">לוח עסקאות</h1>
          <p className="text-xs text-slate-500 mt-0.5">{rows.length} ספרי תורה</p>
        </div>
        <Link
          href="/market"
          className="text-xs text-blue-600 hover:underline px-3 py-1.5 bg-white rounded-lg shadow-sm border border-slate-200"
        >
          ← רשימה
        </Link>
      </div>

      {/* Board */}
      <div className="flex gap-3 overflow-x-auto pb-4">
        {STAGES.map((config) => (
          <KanbanColumn
            key={config.key}
            config={config}
            rows={grouped[config.key] ?? []}
            onMove={handleMove}
            isPending={isPending}
          />
        ))}
      </div>
    </div>
  );
}
