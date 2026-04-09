/**
 * POST /api/admin/import-contacts-csv?token=WEBHOOK_SECRET
 * Content-Type: text/plain  (raw CSV body)
 *
 * Accepts a CSV with columns: name, phone  (with or without header row)
 * Also supports single-column CSV (phone only) or tab-separated.
 *
 * Example CSV:
 *   name,phone
 *   ישראל ישראלי,0501234567
 *   0509876543
 *
 * Returns { imported, skipped, errors }
 */

import { type NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/src/lib/supabase/admin";

export const dynamic = "force-dynamic";

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("972") && digits.length >= 12) return `0${digits.slice(3)}`;
  if (digits.startsWith("0") && digits.length >= 9) return digits;
  return digits;
}

function isPhoneLike(s: string): boolean {
  return /^[\d\s\-\+\(\)]{7,}$/.test(s.trim());
}

export async function POST(req: NextRequest) {
  // ── Auth ────────────────────────────────────────────────────────────────
  const token = req.nextUrl.searchParams.get("token");
  const expected = process.env.WEBHOOK_SECRET ?? "";
  if (!expected || !token || token !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Admin client unavailable" }, { status: 500 });

  // ── Get user_id ──────────────────────────────────────────────────────────
  const { data: settings } = await admin
    .from("user_settings")
    .select("user_id")
    .limit(1)
    .maybeSingle();
  if (!settings?.user_id) {
    return NextResponse.json({ error: "No user configured" }, { status: 400 });
  }
  const userId = settings.user_id as string;

  // ── Parse CSV body ───────────────────────────────────────────────────────
  const body = await req.text();
  if (!body.trim()) return NextResponse.json({ error: "Empty body" }, { status: 400 });

  const lines = body
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  // Detect and skip header row
  const firstLine = lines[0] ?? "";
  const hasHeader = /^(name|שם|phone|טלפון|contact)/i.test(firstLine);
  const dataLines = hasHeader ? lines.slice(1) : lines;

  // Parse rows
  const rows: { name: string; phone: string }[] = [];
  for (const line of dataLines) {
    const sep = line.includes(",") ? "," : line.includes("\t") ? "\t" : null;
    if (sep) {
      const parts = line.split(sep).map((p) => p.trim().replace(/^["']|["']$/g, ""));
      const [a = "", b = ""] = parts;
      if (isPhoneLike(b)) {
        rows.push({ name: a || normalizePhone(b), phone: normalizePhone(b) });
      } else if (isPhoneLike(a)) {
        rows.push({ name: b || normalizePhone(a), phone: normalizePhone(a) });
      }
    } else if (isPhoneLike(line)) {
      rows.push({ name: normalizePhone(line), phone: normalizePhone(line) });
    }
  }

  if (rows.length === 0) {
    return NextResponse.json({ error: "לא זוהו שורות תקינות בקובץ", lines_received: lines.length }, { status: 400 });
  }

  // ── Load existing contacts ────────────────────────────────────────────────
  const { data: existing } = await admin
    .from("crm_contacts")
    .select("id, phone")
    .eq("user_id", userId);

  const existingPhones = new Set(
    (existing ?? []).map((c) => (c.phone as string | null)?.replace(/\D/g, "")).filter(Boolean)
  );

  // ── Insert new contacts ───────────────────────────────────────────────────
  let imported = 0, skipped = 0;
  const errors: string[] = [];

  for (const row of rows) {
    const phoneDigits = row.phone.replace(/\D/g, "");
    if (phoneDigits && existingPhones.has(phoneDigits)) {
      skipped++;
      continue;
    }

    const { error: insErr } = await admin.from("crm_contacts").insert({
      user_id: userId,
      name: row.name,
      type: "Other",
      preferred_contact: "WhatsApp",
      phone: row.phone || null,
      tags: ["CSV_Import"],
    });

    if (insErr) {
      if (insErr.code === "23505") { skipped++; }
      else { errors.push(`${row.name}: ${insErr.message}`); }
    } else {
      imported++;
      if (phoneDigits) existingPhones.add(phoneDigits);
    }
  }

  return NextResponse.json({
    ok: true,
    imported,
    skipped,
    errors: errors.length > 0 ? errors.slice(0, 20) : undefined,
    total_rows_parsed: rows.length,
    message: `יובאו ${imported} אנשי קשר חדשים, ${skipped} דולגו (כבר קיימים)`,
  });
}
