/**
 * Pure classifier for "is this WhatsApp/Gmail message a Torah listing?"
 *
 * No I/O. No DB. No LLM. Deterministic regex/keyword scoring only.
 * Used by the candidate-extractor pipeline to decide whether to bucket a
 * message at all. Final extraction stays in
 * `parseWhatsAppMarketMessage.ts`.
 */

export type TorahListingSignalKind = "listing" | "wanted" | "unrelated";

export type TorahListingSignalHit = {
  kind: "strong" | "support" | "anti";
  signal: string;
};

export type TorahListingSignalResult = {
  kind: TorahListingSignalKind;
  /** 0..1 — only meaningful when kind === "listing" */
  score: number;
  hits: TorahListingSignalHit[];
};

// JS `\b` is ASCII-only, so Hebrew patterns use plain substrings + a
// non-letter guard via lookarounds where needed. Patterns are intentionally
// simple to keep the classifier deterministic and easy to test.

// ── Strong signals — any one ⇒ likely a listing ──────────────────────────
const STRONG_HE = [
  /ספר\s+תורה/u,
  /ס["״'']ת/u,
  /הכנסת\s+ספר\s+תורה/u,
  /ספר\s+תורה\s+למכירה/u,
];
const STRONG_EN_YI = [
  /\bsefer\s+torah\b/i,
  /\btorah\s+scroll\b/i,
  /\bsefer\s+toyre\b/i,
  /\btoyre\b/i,
];

// ── Support signals — need ≥ 2 to flag a listing ─────────────────────────
const SUPPORT = [
  /(?:מוכן|מוכנה|זמין|זמינה)/u,
  /\bavailable\b/i,
  /(?:מוגה|מוגהת)/u,
  /\b(?:mugah|proofread)\b/i,
  /בדוק\s*מחשב/u,
  /\bcomputer.?checked\b/i,
  /גברא/u,
  /(?:בית\s*יוסף|ב["״'']י|אר["״'']י|ספרדי|וועליש)/u,
  /\b(?:welish|ari)\b/i,
  /יריעות/u,
  /\bsheets?\b/i,
  /(?:^|\D)(?:24|30|36|42|48|56)(?:\D|$)/u,
  /מחיר/u,
  /\b(?:price|nis|usd)\b/i,
  /[₪]/u,
  /ש["״'']ח/u,
  /(?:תמונה|תמונות|תמונת)/u,
  /\b(?:pic|pics|photo|photos|images?)\b/i,
  /(?:תיקונים|תיקון|מצב)/u,
  /\b(?:condition|repairs?)\b/i,
];

// ── Anti-signals — drop the kind to "wanted" or "unrelated" ──────────────
const WANTED_HINTS = [
  /(?:מבקש|מחפש)/u,
  /\b(?:wanted|looking\s+for|searching)\b/i,
];

const OFF_TOPIC = [
  /מזוזה/u,
  /תפילין/u,
  /\btefillin\b/i,
  /מגילה/u,
  /\bmegillah\b/i,
  /ת["״'']ת/u,
];

function normalize(text: string): string {
  return text
    .replace(/‏|‎|‪|‫|‬/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
}

export function classifyTorahListingSignal(rawText: string): TorahListingSignalResult {
  const text = normalize(rawText);
  const hits: TorahListingSignalHit[] = [];

  if (!text.trim()) {
    return { kind: "unrelated", score: 0, hits };
  }

  let strong = 0;
  for (const r of STRONG_HE) if (r.test(text)) { strong++; hits.push({ kind: "strong", signal: r.source }); }
  for (const r of STRONG_EN_YI) if (r.test(text)) { strong++; hits.push({ kind: "strong", signal: r.source }); }

  let support = 0;
  for (const r of SUPPORT) if (r.test(text)) { support++; hits.push({ kind: "support", signal: r.source }); }

  let wanted = 0;
  for (const r of WANTED_HINTS) if (r.test(text)) { wanted++; hits.push({ kind: "anti", signal: r.source }); }

  let offTopic = 0;
  for (const r of OFF_TOPIC) if (r.test(text)) { offTopic++; hits.push({ kind: "anti", signal: r.source }); }

  // Off-topic dominates strong+support unless strong is overwhelming.
  if (offTopic > 0 && strong < 1) {
    return { kind: "unrelated", score: 0, hits };
  }

  // Wanted: someone is searching, not selling.
  if (wanted > 0 && (strong > 0 || support >= 2)) {
    return { kind: "wanted", score: 0, hits };
  }

  const isListing = strong >= 1 || support >= 2;
  if (!isListing) {
    return { kind: "unrelated", score: 0, hits };
  }

  // Cheap deterministic score in [0, 1]:
  //   strong contributes 0.5 (saturating), support contributes 0.5 across up to 5 hits.
  const strongScore = Math.min(1, strong) * 0.5;
  const supportScore = Math.min(5, support) * 0.1;
  const score = Math.min(1, strongScore + supportScore);

  return { kind: "listing", score, hits };
}
