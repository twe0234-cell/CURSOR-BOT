export type InventoryShareChannel = "whatsapp" | "email";

export type InventoryShareDraftInput = {
  productType: string;
  supplierName?: string | null;
  details?: string | null;
  priceText?: string | null;
  statusText?: string | null;
  shortDescription?: string | null;
  imageUrl?: string | null;
};

function clean(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function clip(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, Math.max(0, maxChars - 1)).trim()}…`;
}

export function maxCharsForChannel(channel: InventoryShareChannel): number {
  return channel === "whatsapp" ? 420 : 560;
}

export function buildInventoryShareFallback(
  input: InventoryShareDraftInput,
  channel: InventoryShareChannel
): string {
  const title = clean(input.productType) || "פריט סת\"ם";
  const supplier = clean(input.supplierName) || "לא צוין";
  const details = clean(input.details) || "לא צוין";
  const status = clean(input.statusText) || "זמין";
  const price = clean(input.priceText);
  const description = clean(input.shortDescription);
  const imageUrl = clean(input.imageUrl);

  const lines: string[] = [`*למכירה: ${title}*`];
  lines.push(`• ספק/סופר: ${supplier}`);
  lines.push(`• פרטים: ${details}`);
  lines.push(`• מצב: ${status}`);
  if (price) lines.push(`• מחיר יעד: ${price}`);
  if (description) lines.push(`• הערה: ${clip(description, 90)}`);
  if (channel === "email" && imageUrl) lines.push(`• תמונה: ${imageUrl}`);
  lines.push("לפרטים ותיאום מהיר אפשר להשיב להודעה.");

  return clip(lines.join("\n"), maxCharsForChannel(channel));
}

export function buildInventoryShareContext(input: InventoryShareDraftInput): string {
  return [
    `סוג מוצר: ${clean(input.productType) || "לא צוין"}`,
    `ספק/סופר: ${clean(input.supplierName) || "לא צוין"}`,
    `פרטים: ${clean(input.details) || "לא צוין"}`,
    `מחיר: ${clean(input.priceText) || "לא צוין"}`,
    `מצב: ${clean(input.statusText) || "זמין"}`,
    `הערה: ${clean(input.shortDescription) || "אין"}`,
  ].join("\n");
}

export function normalizeGeneratedShareText(
  raw: string,
  channel: InventoryShareChannel
): string {
  const normalized = raw
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");

  if (!normalized) return "";
  return clip(normalized, maxCharsForChannel(channel));
}
