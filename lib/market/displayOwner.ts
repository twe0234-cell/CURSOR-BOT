/** שדות מינימליים לזיהוי בעלים לתצוגה */
export type TorahMarketOwnerFields = {
  external_sofer_name: string | null;
  dealer_id: string | null;
  dealer_name: string | null;
  sofer_name: string | null;
};

/**
 * בעלים לתצוגה: טקסט חיצוני מההצעה → בעלים ב־CRM → סופר ב־CRM (כשאין בעלים נפרד).
 */
export function displayTorahMarketOwner(row: TorahMarketOwnerFields): string {
  const ext = row.external_sofer_name?.trim();
  if (ext) return ext;
  const dealer = row.dealer_name?.trim();
  if (row.dealer_id && dealer) return dealer;
  const sofer = row.sofer_name?.trim();
  if (sofer) return sofer;
  return "—";
}
