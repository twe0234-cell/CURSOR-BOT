/**
 * Pure email HTML builders for the Torah intake flow.
 * No I/O, no DOM, testable.
 */

export type IntakeEmailData = {
  submissionId: string;
  ownerName: string;
  ownerPhone: string;
  ownerEmail: string;
  ownerCity?: string;
  seferType: string;
  scribeName?: string;
  ageEstimate?: string;
  condition?: string;
  description?: string;
  askingPrice?: number;
  imageCount: number;
};

const parchment = "#faf7f0";
const navy = "#1a2540";
const gold = "#b8902f";

const baseStyles = `
  body { margin:0; padding:0; background:${parchment}; font-family:system-ui,-apple-system,Segoe UI,Arial,sans-serif; color:#222; }
  .wrap { max-width:640px; margin:0 auto; padding:32px 20px; direction:rtl; text-align:right; }
  .card { background:#fff; border:1px solid #e8e0cc; border-radius:12px; padding:28px; box-shadow:0 2px 6px rgba(0,0,0,.04); }
  h1 { color:${navy}; font-size:22px; margin:0 0 8px; font-weight:700; }
  h2 { color:${navy}; font-size:15px; margin:20px 0 6px; font-weight:600; border-bottom:1px solid ${gold}; padding-bottom:4px; }
  p { line-height:1.6; margin:8px 0; }
  .muted { color:#666; font-size:13px; }
  .kv { margin:4px 0; }
  .kv b { color:${navy}; display:inline-block; min-width:110px; }
  .footer { text-align:center; color:#999; font-size:12px; margin-top:24px; }
  .brand { color:${gold}; font-weight:700; }
`;

function fmtPrice(n?: number): string {
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return "—";
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  }).format(n);
}

function row(label: string, value?: string | number) {
  if (value === undefined || value === null || value === "") return "";
  return `<div class="kv"><b>${escape(label)}:</b> ${escape(String(value))}</div>`;
}

/** Confirmation sent to the owner who just submitted. */
export function buildOwnerConfirmationEmail(data: IntakeEmailData): {
  subject: string;
  html: string;
} {
  const subject = `קיבלנו את הפנייה שלך — ${data.seferType}`;
  const html = `<!DOCTYPE html>
<html lang="he" dir="rtl"><head><meta charset="utf-8"><style>${baseStyles}</style></head>
<body><div class="wrap"><div class="card">
  <h1>תודה, ${escape(data.ownerName)}.</h1>
  <p>קיבלנו את הפנייה שלך לגבי <b>${escape(data.seferType)}</b>. נחזור אליך בהקדם בטלפון ${escape(data.ownerPhone)}.</p>

  <h2>סיכום הפרטים שנשלחו</h2>
  ${row("פריט", data.seferType)}
  ${row("סופר", data.scribeName)}
  ${row("גיל משוער", data.ageEstimate)}
  ${row("מצב", data.condition)}
  ${row("מחיר מבוקש", fmtPrice(data.askingPrice))}
  ${data.description ? `<p class="muted"><b>תיאור:</b> ${escape(data.description)}</p>` : ""}
  ${row("תמונות שצורפו", data.imageCount)}

  <p class="muted">מספר פנייה לצורך מעקב: ${data.submissionId}</p>
  <div class="footer">נשלח אוטומטית מ<span class="brand">הידור הסת״ם</span></div>
</div></div></body></html>`;
  return { subject, html };
}

/** Internal notification to the admin inbox. */
export function buildAdminNotificationEmail(data: IntakeEmailData): {
  subject: string;
  html: string;
} {
  const subject = `פנייה חדשה: ${data.seferType} — ${data.ownerName}`;
  const html = `<!DOCTYPE html>
<html lang="he" dir="rtl"><head><meta charset="utf-8"><style>${baseStyles}</style></head>
<body><div class="wrap"><div class="card">
  <h1>📥 פנייה חדשה מטופס קליטה</h1>

  <h2>בעלים</h2>
  ${row("שם", data.ownerName)}
  ${row("טלפון", data.ownerPhone)}
  ${row("אימייל", data.ownerEmail)}
  ${row("עיר", data.ownerCity)}

  <h2>פריט</h2>
  ${row("סוג", data.seferType)}
  ${row("סופר", data.scribeName)}
  ${row("גיל משוער", data.ageEstimate)}
  ${row("מצב", data.condition)}
  ${row("מחיר מבוקש", fmtPrice(data.askingPrice))}
  ${data.description ? `<p><b>תיאור:</b><br>${escape(data.description).replace(/\n/g, "<br>")}</p>` : ""}
  ${row("תמונות", data.imageCount)}

  <p class="muted">מזהה פנייה: ${data.submissionId}</p>
</div></div></body></html>`;
  return { subject, html };
}

function escape(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
