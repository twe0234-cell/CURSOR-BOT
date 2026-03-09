import { NextResponse } from "next/server";
import { createClient } from "@/src/lib/supabase/server";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  if (!token) return NextResponse.redirect(new URL("/", process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"));

  const supabase = await createClient();
  const { data: log } = await supabase
    .from("email_logs")
    .select("id, contact_id")
    .eq("id", token)
    .single();

  if (log?.contact_id) {
    await supabase
      .from("email_contacts")
      .update({ subscribed: false, updated_at: new Date().toISOString() })
      .eq("id", log.contact_id);

    await supabase
      .from("email_logs")
      .update({ status: "unsub", unsubscribed_at: new Date().toISOString() })
      .eq("id", token);
  }

  const html = `
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="utf-8"><title>בוטלת המנוי</title></head>
<body style="font-family:Heebo,sans-serif;text-align:center;padding:40px;direction:rtl">
<h1>בוטל המנוי בהצלחה</h1>
<p>הוסרת מרשימת התפוצה. לא תקבל עוד אימיילים מאיתנו.</p>
</body>
</html>`;

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
