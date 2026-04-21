import { GoogleGenerativeAI } from "@google/generative-ai";
import { createClient } from "@/src/lib/supabase/server";
import { assertGeminiApiKeyConfigured, pingGeminiModel } from "@/src/lib/aiProvider";

const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";

export async function POST(req: Request) {
  const keyCheck = assertGeminiApiKeyConfigured();
  if (!keyCheck.ok) {
    return Response.json({ error: keyCheck.error }, { status: 503 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "יש להתחבר" }, { status: 401 });
  }

  const ping = await pingGeminiModel(keyCheck.apiKey, GEMINI_MODEL);
  if (!ping.ok) {
    return Response.json({ error: `אימות מודל: ${ping.error}` }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }

  const sku = String(body.sku ?? "").trim();
  const torah_size = String(body.torah_size ?? "").trim();
  const script_type = String(body.script_type ?? "").trim();
  const parchment_type = String(body.parchment_type ?? "").trim();
  const asking_price = body.asking_price != null ? Number(body.asking_price) : null;
  const notes = String(body.notes ?? "").trim().slice(0, 500);

  const priceLine =
    asking_price != null && Number.isFinite(asking_price)
      ? `מחיר מוצע (באלפי ש״ח / יחידות K כמו במאגר): ${asking_price}`
      : "מחיר לא צוין";

  const userPrompt = `נתונים מספריים בלבד לספר תורה במלאי:
- מק״ט: ${sku || "—"}
- גודל (מספר ס״מ): ${torah_size || "—"}
- סוג כתב: ${script_type || "—"}
- סוג קלף: ${parchment_type || "—"}
- ${priceLine}
${notes ? `- הערה: ${notes}` : ""}

כתוב טקסט שיווקי קצר בעברית לוואטסאפ/מייל (בלי HTML):
- פתיח חם ומקצועי
- שלושה–חמישה משפטים
- סיום עם קריאה לפעולה
אל תמציא מחיר אם לא ניתן — השתמש רק במספרים שניתנו.`;

  const systemPrompt = `אתה קופירייטר ל"הידור הסת״ם". החזר טקסט שטוח בלבד, בלי markdown, בלי כותרות מיותרות.`;

  try {
    const genAI = new GoogleGenerativeAI(keyCheck.apiKey);
    const model = genAI.getGenerativeModel({
      model: GEMINI_MODEL,
      systemInstruction: systemPrompt,
    });
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: { maxOutputTokens: 600, temperature: 0.75 },
    });
    const text = result.response.text().trim();
    if (!text) {
      return Response.json({ error: "המודל החזיר תוצאה ריקה" }, { status: 502 });
    }
    return Response.json({ text });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "שגיאת AI";
    return Response.json({ error: msg }, { status: 500 });
  }
}
