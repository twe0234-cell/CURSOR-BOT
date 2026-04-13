# גשר אנשי קשר Bluetooth

אפליקציה עצמאית ל-Android שמאפשרת ל-**Google Gemini / Assistant** לחייג לאנשי קשר מהטלפון הכשר המחובר דרך Bluetooth.

---

## הבעיה שהיא פותרת

כשטלפון כשר מחובר ל-Topway TS18 (Android) דרך Bluetooth, אנשי הקשר מסתנכרנים לאפליקציית Bluetooth הכחולה של Topway בלבד.

Google Assistant / Gemini מחפש רק ב-`ContactsContract` הסטנדרטי של Android — ולכן לא מוצא את אנשי הקשר, וא-פשר לחייג בפקודה קולית.

**הפתרון:** האפליקציה הזו מושכת את אנשי הקשר מהטלפון הכשר דרך פרוטוקול PBAP ומכניסה אותם ל-Android Contacts. מאותה נקודה Google Gemini מוצא אותם.

---

## זרימה

```
טלפון כשר ──BT──► Topway TS18 Android
                         │
              [גשר אנשי קשר BT]
                         │  OBEX PBAP
                         ▼
              ContactsContract (Android)
                         │
              Google Gemini/Assistant
                         │
              "חייג לדוד" ──► מוצא ──► מחייג ✓
```

---

## בנייה (Build)

### דרישות
- Android Studio Hedgehog (2023.1.1) ומעלה
- JDK 17+
- מכשיר Android 9+ (API 28+)

### שלבים
```bash
# פתח את הפרויקט
cd bt-contacts-bridge
# פתח ב-Android Studio וסנכרן Gradle

# או בנה מהטרמינל:
./gradlew assembleRelease
# APK נוצר ב: app/build/outputs/apk/release/app-release-unsigned.apk
```

---

## התקנה ב-Topway TS18

1. העתק APK לכונן USB
2. ביחידת הרכב: **הגדרות → אבטחה → מקורות לא ידועים → הפעל**
3. פתח את ה-APK ממנהל הקבצים → **התקן**
4. פתח את האפליקציה → **אשר את כל ההרשאות**

---

## שימוש

### אוטומטי (מומלץ)
1. הפעל "סנכרון אוטומטי" באפליקציה (ברירת מחדל: מופעל)
2. חבר את הטלפון הכשר ל-Bluetooth
3. האפליקציה מסנכרנת ברקע אוטומטית

### ידני
לחץ **"סנכרן עכשיו"** בכל עת שהטלפון מחובר

### שימוש עם Gemini
לאחר סנכרון, פתח Google Gemini ואמור:
> "חייג לדוד כהן"
> "תתקשר לאמא"

Gemini ימצא את אנשי הקשר מהטלפון הכשר ויחייג דרך Bluetooth.

---

## פרמיסיות נדרשות

| הרשאה | סיבה |
|--------|------|
| BLUETOOTH_CONNECT | חיבור למכשיר |
| BLUETOOTH_SCAN | זיהוי מכשירים מחוברים |
| READ_CONTACTS / WRITE_CONTACTS | כתיבת אנשי קשר ל-Android |
| GET_ACCOUNTS | יצירת חשבון "טלפון כשר" |
| FOREGROUND_SERVICE | sync רץ ברקע |
| RECEIVE_BOOT_COMPLETED | מאזין לחיבורים אחרי הפעלה מחדש |

---

## Fallback — אם PBAP לא עובד

חלק מיחידות Topway חוסמות RFCOMM ישיר. במקרה זה:

1. **ייצוא ידני:** ייצא `.vcf` מהטלפון הכשר → שלח דרך Bluetooth File Transfer ל-Topway → האפליקציה תגלה אותו ותייבא
2. **ייבוא ידני:** לחץ "ייבא קובץ vCard" בתפריט + עיין לקובץ VCF

---

## מבנה קוד

```
app/src/main/java/com/btbridge/
├── MainActivity.kt        — UI: סטטוס, סנכרון, toggle
├── BtReceiver.kt          — BroadcastReceiver: חיבור BT + boot
├── ContactSyncService.kt  — Foreground service: מתזמר את הסנכרון
├── OBEXPbapClient.kt      — OBEX PBAP protocol over RFCOMM
├── ContactsWriter.kt      — כתיבה ל-ContactsContract
├── VCardParser.kt         — פרסור vCard 2.1/3.0
└── StubServices.kt        — Stub AccountAuthenticator + SyncAdapter
```

---

## הערות טכניות

- אנשי הקשר נשמרים תחת חשבון `"טלפון כשר (BT)"` בסוג `com.btbridge.kosher`
- בכל סנכרון: ניגוב מלא + הכנסה מחדש (מניעת כפילויות)
- פרוטוקול: OBEX over RFCOMM → PBAP PSE UUID `0000112F-0000-1000-8000-00805F9B34FB`
- תואם Android 9+ (API 28+)
