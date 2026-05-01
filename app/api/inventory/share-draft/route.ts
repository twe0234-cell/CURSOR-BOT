import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  assertGeminiApiKeyConfigured,
  pingGeminiModel,
} from "@/src/lib/aiProvider";
import {
  buildInventoryShareContext,
  buildInventoryShareFallback,
  normalizeGeneratedShareText,
  type InventoryShareChannel,
  type InventoryShareDraftInput,
} from "@/src/lib/inventory/shareDraft";

const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";

type ReqBody = {
  channel?: InventoryShareChannel;
  input?: InventoryShareDraftInput;
};

function shortSystemPrompt(channel: InventoryShareChannel): string {
  return [
    'You write very short Hebrew sales copy for "Hidur HaSTaM".',
    "Never write essays. 4-7 short lines max.",
    "Use practical tone, concrete details only, no hallucinations.",
    "WhatsApp format: first line bold with asterisks, then short bullet lines using •.",
    "Always end with one short CTA line.",
    channel === "email"
      ? "Output plain Hebrew text suitable for email prefill, still short."
      : "Output plain Hebrew text for WhatsApp compose.",
    "Return only the message text.",
  ].join("\n");
}

export async function POST(req: Request) {
  let channel: InventoryShareChannel = "whatsapp";
  let input: InventoryShareDraftInput | null = null;

  try {
    const body = (await req.json()) as ReqBody;
    if (body.channel === "email" || body.channel === "whatsapp") {
      channel = body.channel;
    }
    if (body.input && typeof body.input === "object") {
      input = body.input;
    }
  } catch {
    return Response.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }

  if (!input) {
    return Response.json({ error: "חסרים נתוני מוצר" }, { status: 400 });
  }

  const fallback = buildInventoryShareFallback(input, channel);
  const subject = `הצעה: ${input.productType || "פריט סת\"ם"}`;

  const keyCheck = assertGeminiApiKeyConfigured();
  if (!keyCheck.ok) {
    return Response.json({ message: fallback, subject, usedFallback: true });
  }

  const ping = await pingGeminiModel(keyCheck.apiKey, GEMINI_MODEL);
  if (!ping.ok) {
    return Response.json({ message: fallback, subject, usedFallback: true });
  }

  try {
    const context = buildInventoryShareContext(input);
    const genAI = new GoogleGenerativeAI(keyCheck.apiKey);
    const model = genAI.getGenerativeModel({
      model: GEMINI_MODEL,
      systemInstruction: shortSystemPrompt(channel),
    });
    const result = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `כתוב נוסח שיווק קצר לפי הנתונים:\n${context}`,
            },
          ],
        },
      ],
      generationConfig: {
        maxOutputTokens: 260,
        temperature: 0.4,
        topP: 0.9,
      },
    });

    const text = normalizeGeneratedShareText(result.response.text(), channel);
    if (!text) {
      return Response.json({ message: fallback, subject, usedFallback: true });
    }

    return Response.json({ message: text, subject, usedFallback: false });
  } catch {
    return Response.json({ message: fallback, subject, usedFallback: true });
  }
}
