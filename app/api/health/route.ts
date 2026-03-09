import { createClient } from "@/src/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * GET /api/health - בדיקת חיבור ל-Supabase
 * משמש לוודא שהתקשורת עובדת וה-RLS לא חוסם גישה בסיסית.

 */
export async function GET() {
  try {
    const supabase = await createClient();

    // קריאת ניסיון - select מ-user_settings (טבלה קיימת)
    // אם RLS חוסם - נקבל מערך ריק [] (לא שגיאה)
    // אם יש בעיית חיבור - נקבל error
    const { data, error } = await supabase
      .from("user_settings")
      .select("user_id")
      .limit(1);

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          supabase: "error",
          message: error.message,
          code: error.code,
        },
        { status: 503 }
      );
    }

    return NextResponse.json({
      ok: true,
      supabase: "connected",
      message: "חיבור ל-Supabase תקין",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      {
        ok: false,
        supabase: "error",
        message,
      },
      { status: 503 }
    );
  }
}
