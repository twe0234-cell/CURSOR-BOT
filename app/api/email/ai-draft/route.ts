import { GoogleGenerativeAI } from "@google/generative-ai";
import { wrapAiEmailHtml } from "@/lib/email/wrapAiEmailHtml";
import { assertGeminiApiKeyConfigured, pingGeminiModel } from "@/src/lib/aiProvider";

export type AiDraftKind = "html_body" | "subject";
type AiDraftBrief = {
  audience?: string;
  goal?: string;
  offer?: string;
  cta?: string;
};
const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
const MAX_CONTEXT_CHARS = 8000;
const DEFAULT_BODY_MAX_TOKENS = 2200;
const MAX_BODY_MAX_TOKENS = 4096;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export async function POST(req: Request) {
  const keyCheck = assertGeminiApiKeyConfigured();
  if (!keyCheck.ok) {
    return Response.json({ error: keyCheck.error }, { status: 503 });
  }
  const apiKey = keyCheck.apiKey;

  const ping = await pingGeminiModel(apiKey, GEMINI_MODEL);
  if (!ping.ok) {
    return Response.json(
      { error: `אימות מפתח/מודל נכשל: ${ping.error}` },
      { status: 503 }
    );
  }

  let context = "";
  let style = "";
  let kind: AiDraftKind = "html_body";
  let bodyMaxTokens = DEFAULT_BODY_MAX_TOKENS;
  let requestedLength: "קצר" | "בינוני" | "ארוך" = "בינוני";
  let brief: AiDraftBrief = {};
  try {
    const body = await req.json() as {
      context?: string;
      style?: string;
      kind?: AiDraftKind;
      maxOutputTokens?: number;
      lengthHint?: "קצר" | "בינוני" | "ארוך";
      brief?: AiDraftBrief;
    };
    context = (body.context ?? "").trim().slice(0, MAX_CONTEXT_CHARS);
    style = (body.style ?? "").trim();
    if (body.kind === "subject") kind = "subject";
    if (body.lengthHint === "קצר" || body.lengthHint === "בינוני" || body.lengthHint === "ארוך") {
      requestedLength = body.lengthHint;
    }
    if (typeof body.maxOutputTokens === "number" && Number.isFinite(body.maxOutputTokens)) {
      bodyMaxTokens = clamp(Math.floor(body.maxOutputTokens), 700, MAX_BODY_MAX_TOKENS);
    } else if (requestedLength === "קצר") {
      bodyMaxTokens = 900;
    } else if (requestedLength === "ארוך") {
      bodyMaxTokens = 3200;
    }
    brief = {
      audience: body.brief?.audience?.trim(),
      goal: body.brief?.goal?.trim(),
      offer: body.brief?.offer?.trim(),
      cta: body.brief?.cta?.trim(),
    };
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
        model: GEMINI_MODEL,
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

  const systemPrompt = `אתה קופירייטר בכיר ל"הידור הסת"ם" — עסק למסחר ותיווך בספרי תורה, תפילין ומזוזות.
כתוב בעברית טבעית, רהוטה ומכבדת; שכנועי אבל לא אגרסיבי.
מטרות תוכן:
1) פתיח קצר עם אמון/סמכות.
2) ערך ברור ללקוח (איכות, שקיפות, שירות, אחריות).
3) פרטים פרקטיים ותועלות.
4) קריאה לפעולה ברורה בסוף (השב/ווטסאפ/שיחה).

פורמט חובה:
- החזר HTML בלבד, בלי markdown ובלי הסברים מסביב.
- התחל באלמנט שורש אחד: <div dir="rtl" style="text-align:right"> ... </div>
- מותר להשתמש רק בתגיות: div, p, strong, ul, li, br, a
- אל תכלול תגיות html/head/body/script/style.
- אל תכלול שורת נושא (רק גוף המייל).`;

  const userPrompt = `כתוב אימייל שיווקי על סמך המידע הבא:
${context}

טון וסגנון רצוי: ${style || "מקצועי, אנושי, אמין"}.
אורך רצוי: ${requestedLength}.
קהל יעד: ${brief.audience || "לא צוין"}.
מטרה עסקית: ${brief.goal || "לא צוין"}.
הצעה מרכזית: ${brief.offer || "לא צוין"}.
קריאה לפעולה: ${brief.cta || "השב למייל / וואטסאפ לשיחת המשך"}.
אם המידע חלקי, בצע השלמה סבירה אבל לא תמציא עובדות ספציפיות שלא ניתנו.
דאג שהטקסט יהיה קריא, עם פסקאות קצרות או בולטים כשצריך.
החזר HTML גוף בלבד לפי הכללים.`;

  try {
    const model = client.getGenerativeModel({
      model: GEMINI_MODEL,
      systemInstruction: systemPrompt,
    });
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: {
        maxOutputTokens: bodyMaxTokens,
        temperature: 0.8,
        topP: 0.95,
      },
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
