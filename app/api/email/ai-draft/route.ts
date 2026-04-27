import { GoogleGenerativeAI } from "@google/generative-ai";
import { wrapAiEmailHtml } from "@/lib/email/wrapAiEmailHtml";
import { assertGeminiApiKeyConfigured, pingGeminiModel } from "@/src/lib/aiProvider";
import {
  bodyMaxTokensForLength,
  buildEmailBodySystemPrompt,
  buildEmailBodyUserPrompt,
  buildSubjectPrompt,
  normalizeTemplateMode,
  type AiDraftBrief,
  type EmailLengthHint,
  type EmailTemplateMode,
} from "@/src/lib/email/aiDraftContract";

export type AiDraftKind = "html_body" | "subject";
const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
const MAX_CONTEXT_CHARS = 8000;

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
  let bodyMaxTokens = bodyMaxTokensForLength("קצר");
  let requestedLength: EmailLengthHint = "קצר";
  let templateMode: EmailTemplateMode = "short_offer";
  let brief: AiDraftBrief = {};
  try {
    const body = await req.json() as {
      context?: string;
      style?: string;
      kind?: AiDraftKind;
      maxOutputTokens?: number;
      lengthHint?: "קצר" | "בינוני" | "ארוך";
      templateMode?: EmailTemplateMode;
      brief?: AiDraftBrief;
    };
    context = (body.context ?? "").trim().slice(0, MAX_CONTEXT_CHARS);
    style = (body.style ?? "").trim();
    if (body.kind === "subject") kind = "subject";
    if (body.lengthHint === "קצר" || body.lengthHint === "בינוני" || body.lengthHint === "ארוך") {
      requestedLength = body.lengthHint;
    }
    templateMode = normalizeTemplateMode(body.templateMode);
    bodyMaxTokens = bodyMaxTokensForLength(requestedLength, body.maxOutputTokens);
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
    const systemPrompt = "You write concise Hebrew business email subjects for Hidur HaSTaM.";
    const userPrompt = buildSubjectPrompt(context, style);

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

  const systemPrompt = buildEmailBodySystemPrompt(templateMode, requestedLength);
  const userPrompt = buildEmailBodyUserPrompt({
    context,
    style,
    lengthHint: requestedLength,
    templateMode,
    brief,
  });

  try {
    const model = client.getGenerativeModel({
      model: GEMINI_MODEL,
      systemInstruction: systemPrompt,
    });
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: {
        maxOutputTokens: bodyMaxTokens,
        temperature: 0.45,
        topP: 0.85,
      },
    });
    const text = result.response.text().trim();
    if (!text) {
      return Response.json({ error: "המודל החזיר תוצאה ריקה — נסה שוב" }, { status: 502 });
    }
    return Response.json({ html: wrapAiEmailHtml(text), templateMode });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "שגיאת AI";
    return Response.json({ error: msg }, { status: 500 });
  }
}
