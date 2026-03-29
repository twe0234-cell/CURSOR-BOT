/**
 * Pure contact matching for CRM inbox sync (phone / email / name).
 * No I/O — used by `contactMatching.ts` and unit tests.
 */

export type ContactMatchCandidate = {
  id: string;
  phone: string | null;
  email: string | null;
  name: string | null;
  wa_chat_id: string | null;
};

export type ContactMatchResult = {
  contactId: string;
  confidence: 100 | 80;
  exactMatch: boolean;
};

/** Digits-only phone comparable to Israeli formats (0 / +972 / 972). */
export function normalizePhoneForMatch(input: string | null | undefined): string {
  if (input == null || !String(input).trim()) return "";
  let s = String(input).trim();
  if (s.includes("@c.us")) {
    s = (s.split("@c.us")[0] ?? s).trim();
  }
  const digits = s.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("972")) return digits;
  if (digits.startsWith("0") && digits.length >= 10) return `972${digits.slice(1)}`;
  if (digits.length === 9 && !digits.startsWith("972")) return `972${digits}`;
  return digits;
}

export function normalizeEmailForMatch(input: string | null | undefined): string {
  if (input == null || !String(input).trim()) return "";
  return String(input).trim().toLowerCase();
}

export function normalizeNameForMatch(input: string | null | undefined): string {
  if (input == null || !String(input).trim()) return "";
  return String(input).trim().toLowerCase().replace(/\s+/g, " ");
}

function phonesForCandidate(c: ContactMatchCandidate): string[] {
  const list: string[] = [];
  const p = normalizePhoneForMatch(c.phone);
  if (p) list.push(p);
  const w = normalizePhoneForMatch(c.wa_chat_id);
  if (w) list.push(w);
  return [...new Set(list)];
}

/**
 * Priority 1: exact normalized phone or email.
 * Priority 2: normalized full name equality (case / spacing insensitive).
 */
export function resolveContactMatch(
  candidates: ContactMatchCandidate[],
  phone?: string | null,
  email?: string | null,
  name?: string | null
): ContactMatchResult | null {
  const wantPhone = normalizePhoneForMatch(phone);
  const wantEmail = normalizeEmailForMatch(email);
  const wantName = normalizeNameForMatch(name);

  const sorted = [...candidates].sort((a, b) => a.id.localeCompare(b.id));

  if (wantPhone) {
    for (const c of sorted) {
      if (phonesForCandidate(c).includes(wantPhone)) {
        return { contactId: c.id, confidence: 100, exactMatch: true };
      }
    }
  }

  if (wantEmail) {
    for (const c of sorted) {
      const e = normalizeEmailForMatch(c.email);
      if (e && e === wantEmail) {
        return { contactId: c.id, confidence: 100, exactMatch: true };
      }
    }
  }

  if (wantName) {
    for (const c of sorted) {
      const n = normalizeNameForMatch(c.name);
      if (n && n === wantName) {
        return { contactId: c.id, confidence: 80, exactMatch: false };
      }
    }
  }

  return null;
}
