import { GoogleGenerativeAI } from "@google/generative-ai";

const PLACEHOLDER_KEYS = new Set([
  "",
  "your-api-key",
  "changeme",
  "replace_me",
  "xxx",
]);

/**
 * Validates Gemini env configuration before spending user-visible generation time.
 * (App uses Gemini; extend similarly if OpenAI/Anthropic routes are added.)
 */
export function assertGeminiApiKeyConfigured(): { ok: true; apiKey: string } | { ok: false; error: string } {
  const raw = process.env.GEMINI_API_KEY?.trim();
  if (!raw) {
    return { ok: false, error: "GEMINI_API_KEY לא מוגדר בסביבה" };
  }
  if (raw.length < 16) {
    return { ok: false, error: "GEMINI_API_KEY נראה לא תקין (קצר מדי)" };
  }
  if (PLACEHOLDER_KEYS.has(raw.toLowerCase())) {
    return { ok: false, error: "GEMINI_API_KEY הוא placeholder — הגדר מפתח אמיתי" };
  }
  return { ok: true, apiKey: raw };
}

/** Lightweight call so quota/auth errors surface before a large generation. */
export async function pingGeminiModel(
  apiKey: string,
  modelId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: modelId });
    await model.countTokens("ok");
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "שגיאת AI";
    return { ok: false, error: msg };
  }
}
