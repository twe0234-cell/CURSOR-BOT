#!/usr/bin/env python3
"""
inject_to_supabase.py — שלב ב': הזרקת אנשי קשר מ-JSON ל-crm_contacts.

שימוש:
  python scripts/inject_to_supabase.py [--file wa_contacts_dump.json] [--dry-run]

אסטרטגיית UPSERT:
  - כלי CONFLICT: (user_id, wa_chat_id) — unique index שנוצר ב-Supabase
  - אם איש קשר קיים לפי wa_chat_id → מעדכן name + phone + notes בלבד (לא מדרס)
  - אם חדש → יוצר שורה חדשה עם כל השדות

Tag: "whatsapp_import" מצורף לכל שורה מיובאת.
"""

import argparse
import json
import logging
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import requests
from dotenv import load_dotenv

# ─── הגדרת לוגינג ─────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
log = logging.getLogger("inject_to_supabase")

# ─── טעינת env ────────────────────────────────────────────────────────────────
load_dotenv(Path(__file__).parent.parent / ".env.local")
load_dotenv(Path(__file__).parent.parent / ".env")

DEFAULT_INPUT = Path(__file__).parent / "wa_contacts_dump.json"
BATCH_SIZE = 50  # שורות לבקשה (Supabase מגביל payload)
MAX_RETRIES = 4
INITIAL_BACKOFF = 2


# ─── Supabase REST helper ──────────────────────────────────────────────────────
class SupabaseClient:
    def __init__(self, url: str, service_key: str):
        self.base = url.rstrip("/")
        self.headers = {
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        }

    def upsert(self, table: str, rows: list[dict], on_conflict: str) -> requests.Response:
        url = f"{self.base}/rest/v1/{table}"
        headers = {
            **self.headers,
            "Prefer": f"resolution=merge-duplicates,return=minimal",
        }
        backoff = INITIAL_BACKOFF
        for attempt in range(1, MAX_RETRIES + 1):
            try:
                resp = requests.post(
                    url,
                    headers={**headers, "on_conflict": on_conflict},
                    json=rows,
                    timeout=30,
                )
                if resp.status_code in (200, 201, 204):
                    return resp
                if resp.status_code in (429, 503):
                    wait = backoff * (2 ** (attempt - 1))
                    log.warning(f"Rate limit {resp.status_code} — retry in {wait}s")
                    time.sleep(wait)
                    continue
                # שגיאה אחרת — הדפס ויצא
                log.error(f"Supabase {resp.status_code}: {resp.text[:300]}")
                resp.raise_for_status()
            except requests.Timeout:
                log.warning(f"Timeout attempt {attempt}. Retrying in {backoff}s…")
                time.sleep(backoff)
                backoff = min(backoff * 2, 60)
            except requests.ConnectionError as e:
                log.warning(f"Connection error attempt {attempt}: {e}")
                time.sleep(backoff)
                backoff = min(backoff * 2, 60)
        raise RuntimeError(f"upsert failed after {MAX_RETRIES} attempts")

    def select(self, table: str, filters: str) -> list[dict]:
        url = f"{self.base}/rest/v1/{table}?{filters}"
        resp = requests.get(url, headers=self.headers, timeout=15)
        resp.raise_for_status()
        return resp.json()


# ─── בניית שורה ל-crm_contacts ────────────────────────────────────────────────
def build_row(contact: dict, user_id: str, imported_at: str) -> dict:
    name = (contact.get("name") or contact.get("push_name") or "").strip()
    phone = contact.get("phone")  # כבר E.164 מהשלב הראשון
    wa_chat_id = contact.get("wa_chat_id", "")

    # fallback לשם אם חסר
    if not name:
        name = phone or wa_chat_id

    notes = (
        f'[ייבוא WhatsApp]\n'
        f'מקור: whatsapp_import\n'
        f'תאריך: {imported_at}\n'
        f'wa_chat_id: {wa_chat_id}'
    )

    return {
        "user_id": user_id,
        "name": name,
        "type": "Other",
        "preferred_contact": "WhatsApp",
        "wa_chat_id": wa_chat_id or None,
        "phone": phone or None,
        "tags": ["whatsapp_import"],
        "notes": notes,
    }


# ─── Main ─────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="Inject WhatsApp contacts to Supabase crm_contacts")
    parser.add_argument("--file", default=str(DEFAULT_INPUT), help="קובץ JSON (ברירת מחדל: wa_contacts_dump.json)")
    parser.add_argument("--dry-run", action="store_true", help="הצג מה יקרה — בלי לכתוב ל-DB")
    parser.add_argument("--user-id", default="", help="user_id (אם לא בenv)")
    args = parser.parse_args()

    # 1. קרא env
    supabase_url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "").rstrip("/")
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    user_id = args.user_id or os.environ.get("USER_ID", "")

    if not supabase_url or not service_key:
        log.error("חסרים NEXT_PUBLIC_SUPABASE_URL ו-SUPABASE_SERVICE_ROLE_KEY")
        sys.exit(1)
    if not user_id:
        log.error("חסר USER_ID — הגדר בenv או העבר כ: --user-id <uuid>")
        sys.exit(1)

    # 2. קרא קובץ JSON
    input_path = Path(args.file)
    if not input_path.exists():
        log.error(f"קובץ לא נמצא: {input_path}")
        log.error("הרץ תחילה: python scripts/extract_green_api.py")
        sys.exit(1)

    dump = json.loads(input_path.read_text(encoding="utf-8"))
    contacts = dump.get("contacts", [])
    extracted_at = dump.get("extracted_at", datetime.now(timezone.utc).isoformat())

    log.info(f"קובץ: {input_path} — {len(contacts)} אנשי קשר")
    log.info(f"user_id: {user_id}")

    if args.dry_run:
        log.info("🧪 DRY-RUN — לא כותב ל-DB")
        for i, c in enumerate(contacts[:5]):
            row = build_row(c, user_id, extracted_at)
            log.info(f"  [{i+1}] {json.dumps(row, ensure_ascii=False)}")
        log.info(f"  … ועוד {max(0, len(contacts)-5)} שורות")
        return

    client = SupabaseClient(supabase_url, service_key)

    # 3. בנה שורות
    rows = [build_row(c, user_id, extracted_at) for c in contacts]

    # 4. סנן שורות ריקות
    rows = [r for r in rows if r.get("wa_chat_id") or r.get("phone")]
    log.info(f"שורות תקינות לייבוא: {len(rows)}")

    # 5. שלח ב-batch
    total_ok = 0
    total_err = 0
    for i in range(0, len(rows), BATCH_SIZE):
        batch = rows[i : i + BATCH_SIZE]
        batch_num = i // BATCH_SIZE + 1
        total_batches = (len(rows) + BATCH_SIZE - 1) // BATCH_SIZE
        log.info(f"Batch {batch_num}/{total_batches} — {len(batch)} שורות…")
        try:
            # on_conflict: user_id,wa_chat_id (unique index שנוצר מראש)
            client.upsert("crm_contacts", batch, on_conflict="user_id,wa_chat_id")
            total_ok += len(batch)
            log.info(f"  ✓ Batch {batch_num} הושלם")
        except Exception as e:
            log.error(f"  ✗ Batch {batch_num} נכשל: {e}")
            total_err += len(batch)
        # הפסקה קצרה בין batches למניעת throttling
        time.sleep(0.3)

    # 6. סיכום
    log.info("─" * 50)
    log.info(f"✅ יובאו בהצלחה: {total_ok} שורות")
    if total_err:
        log.warning(f"⚠️  נכשלו: {total_err} שורות")
    log.info(f"סיום: {datetime.now(timezone.utc).isoformat()}")


if __name__ == "__main__":
    main()
