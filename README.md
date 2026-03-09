# Broadcast Buddy (CURSOR-BOT)

אפליקציית Next.js לניהול שידורים וקהלי יעד, מחוברת ל-Supabase.

## דרישות

- Node.js 18+
- חשבון Supabase

## התקנה

```bash
npm install
```

## הגדרת משתני סביבה

צור קובץ `.env.local` בהתבסס על `.env.example`:

```bash
cp .env.example .env.local
```

מלא את הערכים מ-Supabase Dashboard → Project Settings → API:

- `NEXT_PUBLIC_SUPABASE_URL` – כתובת הפרויקט
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` – מפתח Anon/Public

## הרצה

```bash
# פיתוח
npm run dev

# Build לפריסה
npm run build

# הרצת production
npm run start
```

## פריסה ב-Vercel

1. חבר את הפרויקט ל-Vercel
2. הוסף את משתני הסביבה ב-Settings → Environment Variables
3. פרוס

## בדיקת חיבור

- `GET /api/health` – בדיקת חיבור ל-Supabase

## מבנה הפרויקט

- `app/` – דפים ו-API routes
- `src/lib/supabase/` – קליינט Supabase
- `supabase/migrations/` – מיגרציות DB
