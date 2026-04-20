import { GoogleGenerativeAI } from "@google/generative-ai";
import { wrapAiEmailHtml } from "@/lib/email/wrapAiEmailHtml";

export type AiDraftKind = "html_body" | "subject";

export async function POST(req: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "GEMINI_API_KEY לא מוגדר בסביבה" }, { status: 503 });
  }

  let context = "";
  let style = "";
  let kind: AiDraftKind = "html_body";
  try {
    const body = await req.json() as {
      context?: string;
      style?: string;
      kind?: AiDraftKind;
    };
    context = (body.context ?? "").trim();
    style = (body.style ?? "").trim();
    if (body.kind === "subject") kind = "subject";
  } catch {
    return Response.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }

  if (!context) {
    return Response.json({ error: "יש להזין הקשר" }, { status: 400 });
  }

  const client = new GoogleGenerativeAI(apiKey);

  if (kind === "subject") {
    const systemPrompt = `אתה עוזר שיווק ל"הידור הסת"ם". כתוב שורת נושא קצרה ומושכת למייל בעברית.
החזר שורת נושא אחת בלבד, בלי מירכאות, בלי תווי מקף מיותרים, עד 80 תווים.`;
    const userPrompt = `הצע שורת נושא למייל על סמך:
${context}
${style ? `\nטון: ${style}` : ""}`;

    try {
      const model = client.getGenerativeModel({
        model: "gemini-1.5-flash",
        systemInstruction: systemPrompt,
      });
      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
        generationConfig: { maxOutputTokens: 120 },
      });
      const text = result.response.text().trim();
      const oneLine = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)[0] ?? "";
      return Response.json({ subject: oneLine.slice(0, 200) });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "שגיאת AI";
      return Response.json({ error: msg }, { status: 500 });
    }
  }

  const systemPrompt = `אתה עוזר שיווק ל"הידור הסת"ם" — עסק למסחר ותיווך בספרי תורה, תפילין ומזוזות.
כתוב אימיילים שיווקיים בעברית, בגוף ראשון, בטון חמים ומקצועי.
השתמש ב-HTML פשוט בלבד (p, strong, ul, li, br). כל התוכן חייב להיות לוגית RTL: אלמנט שורש עם dir="rtl" ו-text-align:right.
אל תכלול שורת נושא — רק גוף המייל.
אל תכלול תגיות html/head/body — רק תוכן פנימי.
${style ? `סגנון מועדף: ${style}` : ""}`;

  const userPrompt = `כתוב אימייל שיווקי על סמך המידע הבא:
${context}

החזר HTML גוף בלבד. התחל מ-<div dir="rtl" style="text-align:right"> ... </div> או מקטעים עם dir="rtl".`;

  try {
    const model = client.getGenerativeModel({
      model: "gemini-1.5-flash",
      systemInstruction: systemPrompt,
    });
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: { maxOutputTokens: 1024 },
    });
    const text = result.response.text().trim();
    if (!text) {
      return Response.json({ error: "המודל החזיר תוצאה ריקה — נסה שוב" }, { status: 502 });
    }
    return Response.json({ html: wrapAiEmailHtml(text) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "שגיאת AI";
    return Response.json({ error: msg }, { status: 500 });
  }
}
