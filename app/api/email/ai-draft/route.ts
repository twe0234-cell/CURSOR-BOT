"use server";

import Anthropic from "@anthropic-ai/sdk";

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "ANTHROPIC_API_KEY לא מוגדר בסביבה" }, { status: 503 });
  }

  let context = "";
  let style = "";
  try {
    const body = await req.json() as { context?: string; style?: string };
    context = (body.context ?? "").trim();
    style = (body.style ?? "").trim();
  } catch {
    return Response.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }

  if (!context) {
    return Response.json({ error: "יש להזין הקשר" }, { status: 400 });
  }

  const client = new Anthropic({ apiKey });

  const systemPrompt = `אתה עוזר שיווק ל"הידור הסת"ם" — עסק למסחר ותיווך בספרי תורה, תפילין ומזוזות.
כתוב אימיילים שיווקיים בעברית, בגוף ראשון, בטון חמים ומקצועי.
השתמש ב-HTML פשוט בלבד (p, strong, br). כל הטקסט מיושר לימין (dir=rtl).
אל תכלול שורת נושא — רק גוף המייל.
${style ? `סגנון מועדף: ${style}` : ""}`;

  const userPrompt = `כתוב אימייל שיווקי על סמך המידע הבא:
${context}

החזר HTML גוף בלבד (בלי <html>/<body>/<head>). שמור על RTL.`;

  try {
    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const text = message.content[0]?.type === "text" ? message.content[0].text : "";
    return Response.json({ html: text });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "שגיאת AI";
    return Response.json({ error: msg }, { status: 500 });
  }
}
