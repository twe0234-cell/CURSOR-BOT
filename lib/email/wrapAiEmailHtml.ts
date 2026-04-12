/**
 * מעטפת RTL לתוכן שמחזיר מודל AI — מנקה ```html ומוודא יישור לימין.
 */
export function wrapAiEmailHtml(raw: string): string {
  let t = raw.trim();
  t = t.replace(/^```(?:html)?\s*/i, "").replace(/\s*```$/i, "").trim();
  if (!t) return "<p></p>";
  if (/\bdir\s*=\s*["']rtl["']/i.test(t)) return t;
  return `<div dir="rtl" style="text-align:right;max-width:100%">${t}</div>`;
}
