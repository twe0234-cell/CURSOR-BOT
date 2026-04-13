"""
merge_whatsapp.py
-----------------
שלב ב׳ — שליפת קשרי וואטסאפ מ-Green API ומיזוגם לתוך unified_contacts.csv
הרץ: python merge_whatsapp.py
"""

import requests, re, pandas as pd

INSTANCE_ID = "7103512829"
API_TOKEN   = "39d26922027b44808787ef19c0960f94f1f753dd5d9047fbbb"
BASE        = f"https://api.green-api.com/waInstance{INSTANCE_ID}"
UNIFIED_CSV = "unified_contacts.csv"   # הקובץ שהורדת בשלב א׳

# ── נרמול טלפון ──────────────────────────────────────────────
def norm(p):
    p = re.sub(r"[^\d+]", "", str(p))
    if p.startswith("00972"): p = "+972" + p[5:]
    elif p.startswith("0972"): p = "+972" + p[4:]
    elif p.startswith("972"):  p = "+"   + p
    elif p.startswith("0") and len(p) >= 9: p = "+972" + p[1:]
    return p

# ── שליפת קשרים מוואטסאפ ─────────────────────────────────────
print("שולף קשרים מ-Green API...")
r = requests.get(f"{BASE}/getContacts/{API_TOKEN}", timeout=30)
r.raise_for_status()
wa_contacts = r.json()          # list of {id, name, type, ...}
print(f"  נמצאו {len(wa_contacts)} קשרים בוואטסאפ")

# שמור רק contacts (לא קבוצות)
wa = []
for c in wa_contacts:
    jid = c.get("id", "")               # format: 972501234567@c.us
    if "@c.us" not in jid:
        continue
    number = norm("+" + jid.split("@")[0])
    name   = c.get("name") or c.get("notify") or ""
    wa.append({"wa_phone": number, "wa_name": name})

wa_df = pd.DataFrame(wa)
print(f"  קשרים פרטיים (לא קבוצות): {len(wa_df)}")

# ── טעינת הקובץ המאוחד ───────────────────────────────────────
df = pd.read_csv(UNIFIED_CSV, dtype=str).fillna("")

# בנה index: phone → row index
phone_idx = {}
for i, row in df.iterrows():
    for p in row["phones"].split("|"):
        p = p.strip()
        if p:
            phone_idx[p] = i

# ── מיזוג ────────────────────────────────────────────────────
new_rows   = []
matched    = 0
wa_only    = 0

for _, wrow in wa_df.iterrows():
    wp = wrow["wa_phone"]
    wn = wrow["wa_name"]

    if wp in phone_idx:
        # מספר הוואטסאפ זהה למספר הטלפון
        idx = phone_idx[wp]
        df.at[idx, "whatsapp_phone"] = wp
        matched += 1
    else:
        # מספר וואטסאפ שונה — נסה matching לפי שם
        found = False
        if wn:
            for i, row in df.iterrows():
                existing_name = row["name"].strip()
                if existing_name and existing_name == wn:
                    df.at[i, "whatsapp_phone"] = wp
                    matched += 1
                    found = True
                    break
        if not found:
            # וואטסאפ בלבד — שורה חדשה
            new_rows.append({
                "name": wn, "phones": "", "emails": "",
                "categories": "", "whatsapp_phone": wp,
                "match_method": "whatsapp_only",
                "has_phone": False, "has_email": False
            })
            wa_only += 1

if new_rows:
    df = pd.concat([df, pd.DataFrame(new_rows)], ignore_index=True)

# ── שמירה ────────────────────────────────────────────────────
out = "unified_contacts_v2.csv"
df.to_csv(out, index=False)

print(f"\nתוצאות:")
print(f"  ✅ וואטסאפ שויך לאיש קשר קיים: {matched}")
print(f"  🆕 וואטסאפ-בלבד נוספו:          {wa_only}")
print(f"  📋 סה״כ שורות בקובץ:             {len(df)}")
print(f"\nנשמר: {out}")
