/** Shared SKU generator for inventory rows (investments pipeline, new items). */
export function generateInventorySku(): string {
  const hex = Array.from(crypto.getRandomValues(new Uint8Array(4)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 8);
  return `HD-${hex}`;
}
