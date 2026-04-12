/**
 * Payment request text + Google Calendar URL generators.
 * Pure functions — no I/O, usable in both client and server.
 */

export type PaymentRequestData = {
  buyerName: string | null;
  itemDescription: string;
  totalPrice: number;
  totalPaid: number;
  remainingBalance: number;
  saleDate: string;
  notes?: string | null;
};

const fmt = (n: number) => n.toLocaleString("he-IL");

/** WhatsApp/email body for payment confirmation */
export function buildPaymentRequestText(d: PaymentRequestData): string {
  const lines: string[] = [];
  if (d.buyerName) lines.push(`שלום ${d.buyerName},`, "");
  lines.push(`סיכום עסקה: ${d.itemDescription}`);
  lines.push(`💰 סכום העסקה: ${fmt(d.totalPrice)} ₪`);
  if (d.totalPaid > 0) lines.push(`✅ שולם עד כה: ${fmt(d.totalPaid)} ₪`);
  if (d.remainingBalance > 0) {
    lines.push(`📌 יתרה לתשלום: ${fmt(d.remainingBalance)} ₪`);
  } else {
    lines.push("✅ העסקה שולמה במלואה");
  }
  if (d.notes) lines.push("", `הערות: ${d.notes}`);
  lines.push("", "אנא אשר קבלה / שאל שאלות — תגיב לכאן.");
  return lines.join("\n");
}

/** Subject line for payment request email */
export function buildPaymentRequestSubject(d: Pick<PaymentRequestData, "itemDescription">): string {
  return `אישור עסקה — ${d.itemDescription}`;
}

/**
 * Google Calendar "Add Event" URL (no OAuth required — opens in browser).
 * date format: YYYY-MM-DD
 */
export function buildCalendarEventUrl(opts: {
  title: string;
  date: string;
  details?: string;
}): string {
  const d = opts.date.replace(/-/g, "");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: opts.title,
    dates: `${d}/${d}`,
    details: opts.details ?? "",
  });
  return `https://calendar.google.com/calendar/r/eventedit?${params.toString()}`;
}

export function mailtoPaymentHref(d: PaymentRequestData, buyerEmail?: string | null): string {
  const subject = encodeURIComponent(buildPaymentRequestSubject(d));
  const body = encodeURIComponent(buildPaymentRequestText(d));
  const to = buyerEmail ? encodeURIComponent(buyerEmail) : "";
  return `mailto:${to}?subject=${subject}&body=${body}`;
}
