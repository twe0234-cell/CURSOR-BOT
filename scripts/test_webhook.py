#!/usr/bin/env python3
"""
test_webhook.py — סימולציית POST לwebhook של Green API (לאבחון Issue 2).

שימוש:
  # בדיקה בסביבה מקומית (dev server חייב לרוץ):
  python scripts/test_webhook.py --env local

  # בדיקה בproduction:
  python scripts/test_webhook.py --env prod

  # בדיקה עם הודעה מותאמת:
  python scripts/test_webhook.py --env prod --message "ס\"ת 48 בית יוסף 45000"

  # הצגת payload בלבד (ללא שליחה):
  python scripts/test_webhook.py --dry-run

דורש env vars (קובץ .env.local):
  WEBHOOK_SECRET              — הסוד שמוגדר ב-Vercel
  NEXT_PUBLIC_APP_URL         — URL של הapp (prod)
  GREEN_API_INSTANCE          — instance ID (לבניית chatId מדויק)
  WA_MARKET_GROUP_ID          — group chatId המוגדר ב-user_settings
"""

import argparse
import json
import os
import sys
import time
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env.local")
load_dotenv(Path(__file__).parent.parent / ".env")

LOCAL_URL = "http://localhost:3000/api/whatsapp-webhook"
PROD_URL = os.environ.get("NEXT_PUBLIC_APP_URL", "https://cursor-bot.vercel.app").rstrip("/") + "/api/whatsapp-webhook"

WEBHOOK_SECRET = os.environ.get("WEBHOOK_SECRET", "")
GROUP_CHAT_ID = os.environ.get("WA_MARKET_GROUP_ID", "120363422255767258@g.us")
INSTANCE_ID = os.environ.get("GREEN_API_INSTANCE", "71039")  # הוגדר ב-user_settings

# הודעת ס"ת לדוגמה שצריכה לעבור parsing מוצלח
DEFAULT_VALID_MESSAGE = 'ס"ת 48 בית יוסף 45000'
# הודעה שצריכה לכשול parsing (לבדיקת FAIL reaction)
INVALID_MESSAGE = "שלום לכולם"


def build_payload(message_text: str, msg_id: str = None) -> dict:
    """בונה payload כמו Green API אמיתי."""
    ts = int(time.time())
    msg_id = msg_id or f"BAE5{ts}TEST"
    return {
        "typeWebhook": "incomingMessageReceived",
        "instanceData": {
            "idInstance": INSTANCE_ID,
            "wid": f"972501234567@c.us",
            "typeInstance": "whatsapp"
        },
        "timestamp": ts,
        "idMessage": msg_id,
        "senderData": {
            "chatId": GROUP_CHAT_ID,
            "chatName": "בדיקה — שוק ס\"ת",
            "sender": "972501234567@c.us",
            "senderName": "Test Script"
        },
        "messageData": {
            "typeMessage": "textMessage",
            "textMessageData": {
                "textMessage": message_text
            }
        }
    }


def send_test(url: str, payload: dict, dry_run: bool = False) -> None:
    target = f"{url}?token={WEBHOOK_SECRET}"
    print(f"\n{'─'*60}")
    print(f"URL:     {target[:80]}...")
    print(f"chatId:  {payload['senderData']['chatId']}")
    print(f"msgId:   {payload['idMessage']}")
    print(f"text:    {payload['messageData']['textMessageData']['textMessage']}")
    print(f"{'─'*60}")

    if dry_run:
        print("🧪 DRY-RUN — payload:")
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        return

    try:
        resp = requests.post(target, json=payload, timeout=15)
        print(f"✅ HTTP {resp.status_code}: {resp.text[:200]}")
        if resp.status_code == 401:
            print("⚠️  401 Unauthorized — WEBHOOK_SECRET לא נכון!")
        elif resp.status_code == 200:
            print("✓ הwebhook קיבל את הבקשה. בדוק Vercel logs לראות מה קרה בפנים.")
    except requests.ConnectionError:
        print("❌ Connection refused — האם הdev server רץ? (npm run dev)")
    except requests.Timeout:
        print("❌ Timeout — הwebhook לא הגיב תוך 15 שניות")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--env", choices=["local", "prod"], default="local")
    parser.add_argument("--message", default=DEFAULT_VALID_MESSAGE)
    parser.add_argument("--invalid", action="store_true", help="שלח הודעה שלא תיפרס (לבדיקת FAIL reaction)")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if not WEBHOOK_SECRET and not args.dry_run:
        print("❌ WEBHOOK_SECRET לא מוגדר בenv!")
        sys.exit(1)

    url = LOCAL_URL if args.env == "local" else PROD_URL
    print(f"Target: {args.env.upper()} → {url}")
    print(f"Group:  {GROUP_CHAT_ID}")

    # בדיקה 1: הודעה תקינה (אמורה לגרום ל-✅)
    msg = INVALID_MESSAGE if args.invalid else args.message
    payload = build_payload(msg)
    print(f"\n📤 TEST: {'invalid (expect ❌)' if args.invalid else 'valid (expect ✅)'}")
    send_test(url, payload, dry_run=args.dry_run)

    if not args.invalid and not args.dry_run:
        # בדיקה 2: שלח גם הודעה לא תקינה
        time.sleep(1)
        print(f"\n📤 TEST 2: invalid message (expect ❌ reaction)")
        payload2 = build_payload(INVALID_MESSAGE, msg_id=f"BAE5{int(time.time())}B")
        send_test(url, payload2, dry_run=False)


if __name__ == "__main__":
    main()
