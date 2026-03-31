#!/usr/bin/env python3
"""
extract_green_api.py — שלב א': שליפת אנשי קשר מ-Green API ושמירה מקומית.

שימוש:
  python scripts/extract_green_api.py

דורש env vars (או קובץ .env.local):
  GREEN_API_INSTANCE   — מזהה instance (green_api_id מ-user_settings)
  GREEN_API_TOKEN      — טוקן API   (green_api_token מ-user_settings)

  או לחלופין: קבל ישירות מ-Supabase באמצעות:
  SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + USER_ID

פלט: wa_contacts_dump.json (הגנה מפני אובדן נתונים בין שלבים)
"""

import json
import logging
import os
import re
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
log = logging.getLogger("extract_green_api")

# ─── טעינת env ────────────────────────────────────────────────────────────────
load_dotenv(Path(__file__).parent.parent / ".env.local")
load_dotenv(Path(__file__).parent.parent / ".env")

GREEN_API_BASE = "https://api.green-api.com"
OUTPUT_FILE = Path(__file__).parent / "wa_contacts_dump.json"

# backoff config
MAX_RETRIES = 5
INITIAL_BACKOFF = 2  # seconds


# ─── נרמול מספר טלפון → E.164 ────────────────────────────────────────────────
def normalize_phone(raw: str) -> str | None:
    """
    מקבל מחרוזת טלפון בכל פורמט ומחזיר E.164 (+9725XXXXXXX) או None אם לא ניתן.

    פורמטים נתמכים:
    - wa_chat_id: "972501234567@c.us"  → "+972501234567"
    - ישראלי מקומי: "0501234567"       → "+972501234567"
    - ישראלי עם קידומת: "+972-50-123-4567" → "+972501234567"
    - בינלאומי: "+1-555-123-4567"      → "+15551234567"
    """
    if not raw:
        return None

    # הסר @c.us ו-@g.us (קבוצות — לא אנשי קשר)
    if "@g.us" in raw:
        return None  # קבוצה — מדלג
    s = raw.replace("@c.us", "").replace("@s.whatsapp.net", "")

    # הסר כל תו שאינו ספרה או +
    s = re.sub(r"[^\d+]", "", s)

    if not s:
        return None

    # ישראלי מקומי: 05X → +9725X
    if re.match(r"^05\d{8}$", s):
        return "+972" + s[1:]

    # כבר עם קידומת בינלאומית
    if s.startswith("+"):
        digits = s[1:]
    elif s.startswith("972") and len(s) == 12:
        digits = s
        s = "+" + s
    elif s.startswith("1") and len(s) == 11:
        digits = s
        s = "+" + s
    else:
        digits = s
        # ניסיון — אם 10 ספרות ומתחיל ב-0 → ישראלי
        if len(digits) == 10 and digits.startswith("0"):
            return "+972" + digits[1:]
        # אחרת, נחזיר כ-is עם +
        s = "+" + digits

    # אימות סופי: 7-15 ספרות (ITU-T E.164)
    clean_digits = re.sub(r"[^\d]", "", s)
    if not (7 <= len(clean_digits) <= 15):
        return None

    return s if s.startswith("+") else "+" + clean_digits


# ─── Green API request עם exponential backoff ────────────────────────────────
def green_api_get(url: str, timeout: int = 30) -> dict | list:
    backoff = INITIAL_BACKOFF
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            log.info(f"GET {url} (attempt {attempt}/{MAX_RETRIES})")
            resp = requests.get(url, timeout=timeout)

            if resp.status_code == 200:
                return resp.json()

            if resp.status_code in (429, 403):
                wait = backoff * (2 ** (attempt - 1))
                log.warning(f"Rate limit {resp.status_code} — waiting {wait}s before retry")
                time.sleep(wait)
                continue

            resp.raise_for_status()

        except requests.Timeout:
            log.warning(f"Timeout on attempt {attempt}. Retrying in {backoff}s…")
            time.sleep(backoff)
            backoff = min(backoff * 2, 60)
        except requests.ConnectionError as e:
            log.warning(f"Connection error on attempt {attempt}: {e}. Retrying…")
            time.sleep(backoff)
            backoff = min(backoff * 2, 60)

    raise RuntimeError(f"Failed after {MAX_RETRIES} attempts: {url}")


# ─── פונקציה לקבלת credentials מ-Supabase (אופציונלי) ───────────────────────
def fetch_credentials_from_supabase() -> tuple[str, str]:
    """קורא green_api_id ו-green_api_token ישירות מ-user_settings דרך REST."""
    supabase_url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "").rstrip("/")
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    user_id = os.environ.get("USER_ID", "")

    if not (supabase_url and service_key and user_id):
        raise ValueError(
            "חסרים: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, USER_ID"
        )

    url = f"{supabase_url}/rest/v1/user_settings?user_id=eq.{user_id}&select=green_api_id,green_api_token"
    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
    }
    resp = requests.get(url, headers=headers, timeout=15)
    resp.raise_for_status()
    rows = resp.json()
    if not rows:
        raise ValueError(f"לא נמצאו הגדרות ל-user_id: {user_id}")
    row = rows[0]
    return row["green_api_id"], row["green_api_token"]


# ─── Main ─────────────────────────────────────────────────────────────────────
def main():
    # 1. קבל credentials
    instance_id = os.environ.get("GREEN_API_INSTANCE", "").strip()
    api_token = os.environ.get("GREEN_API_TOKEN", "").strip()

    if not instance_id or not api_token:
        log.info("GREEN_API_INSTANCE/TOKEN לא הוגדרו בenv — מנסה לקרוא מ-Supabase…")
        instance_id, api_token = fetch_credentials_from_supabase()

    log.info(f"Instance ID: {instance_id[:6]}*** Token: {api_token[:6]}***")

    # 2. קרא רשימת אנשי קשר מ-Green API
    url = f"{GREEN_API_BASE}/waInstance{instance_id}/getContacts/{api_token}"
    raw_contacts = green_api_get(url)

    if not isinstance(raw_contacts, list):
        log.error(f"תגובה לא צפויה מ-Green API: {type(raw_contacts)}")
        sys.exit(1)

    log.info(f"התקבלו {len(raw_contacts)} אנשי קשר גולמיים")

    # 3. נרמול ומיון
    timestamp = datetime.now(timezone.utc).isoformat()
    contacts_clean = []
    skipped = 0

    for c in raw_contacts:
        chat_id: str = c.get("id", "")

        # דלג על קבוצות
        if "@g.us" in chat_id:
            skipped += 1
            continue

        phone = normalize_phone(chat_id)
        name = (c.get("name") or c.get("pushname") or "").strip()

        contacts_clean.append(
            {
                "wa_chat_id": chat_id,
                "phone": phone,
                "name": name or phone or chat_id,
                "raw_name": c.get("name", ""),
                "push_name": c.get("pushname", ""),
                "extracted_at": timestamp,
            }
        )

    log.info(f"✓ {len(contacts_clean)} אנשי קשר תקינים, {skipped} קבוצות הושמטו")

    # 4. שמור קובץ ביניים
    output = {
        "extracted_at": timestamp,
        "instance_id": instance_id,
        "total_raw": len(raw_contacts),
        "total_clean": len(contacts_clean),
        "contacts": contacts_clean,
    }
    OUTPUT_FILE.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    log.info(f"✓ נשמר: {OUTPUT_FILE} ({OUTPUT_FILE.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
