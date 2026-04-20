export type LabelCodeKind = "inventory" | "torah-sheet" | "qa-batch";

function compactToken(value: string): string {
  return value.trim().replace(/\s+/g, "").replace(/\|/g, "-");
}

/**
 * Shared payload format for barcode/QR scanning.
 * Keeps a single, stable structure so future mobile scanners
 * can parse one protocol across all labels.
 */
export function buildLabelCodePayload(
  kind: LabelCodeKind,
  fields: Record<string, string | number | null | undefined>
): string {
  const parts: string[] = ["BB", kind];
  for (const [key, raw] of Object.entries(fields)) {
    if (raw == null) continue;
    const token = String(raw).trim();
    if (!token) continue;
    parts.push(`${compactToken(key)}=${compactToken(token)}`);
  }
  return parts.join("|");
}
