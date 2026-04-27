export const EMAIL_TEMPLATE_MODES = [
  "short_offer",
  "price_quote",
  "follow_up",
  "friendly_reply",
  "formal_supplier_message",
] as const;

export type EmailTemplateMode = (typeof EMAIL_TEMPLATE_MODES)[number];
export type EmailLengthHint = "קצר" | "בינוני" | "ארוך";

export type AiDraftBrief = {
  audience?: string;
  goal?: string;
  offer?: string;
  cta?: string;
};

const TEMPLATE_GUIDANCE: Record<EmailTemplateMode, string> = {
  short_offer:
    "Short offer: open with the concrete item/service, give 1-2 value points, end with a direct reply/WhatsApp CTA.",
  price_quote:
    "Price quote: state what is being quoted, price/terms if supplied, what is included, and the next approval step.",
  follow_up:
    "Follow-up: reference the previous topic, keep it polite, ask for a clear next step without pressure.",
  friendly_reply:
    "Friendly reply: answer naturally and warmly, preserve the customer's point, avoid sales fluff.",
  formal_supplier_message:
    "Formal supplier message: be respectful, precise, and operational; ask for confirmation, ETA, or missing details.",
};

export function normalizeTemplateMode(value: unknown): EmailTemplateMode {
  return EMAIL_TEMPLATE_MODES.includes(value as EmailTemplateMode)
    ? (value as EmailTemplateMode)
    : "short_offer";
}

export function bodyMaxTokensForLength(lengthHint: EmailLengthHint, explicit?: number): number {
  if (typeof explicit === "number" && Number.isFinite(explicit)) {
    return Math.max(500, Math.min(Math.floor(explicit), 2200));
  }
  if (lengthHint === "ארוך") return 1700;
  if (lengthHint === "בינוני") return 1100;
  return 850;
}

export function defaultWordRange(lengthHint: EmailLengthHint): string {
  if (lengthHint === "ארוך") return "up to 220 Hebrew words only if explicitly needed";
  if (lengthHint === "בינוני") return "100-160 Hebrew words";
  return "80-140 Hebrew words";
}

export function buildSubjectPrompt(context: string, style?: string): string {
  return [
    "Write one short Hebrew business email subject.",
    "Return only the subject, no quotes, no markdown, max 70 characters.",
    "Make it specific to the business point. Avoid vague marketing language.",
    "",
    `Context:\n${context}`,
    style ? `Tone: ${style}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildEmailBodySystemPrompt(mode: EmailTemplateMode, lengthHint: EmailLengthHint): string {
  return [
    'You write business emails for "Hidur HaSTaM", a Hebrew-first STaM commerce/service business.',
    "Default language is Hebrew unless the user explicitly asks for another language.",
    "The output must be disciplined, short, and practical, not a long marketing essay.",
    `Template mode: ${mode}. ${TEMPLATE_GUIDANCE[mode]}`,
    `Default length: ${defaultWordRange(lengthHint)}.`,
    "Every draft must preserve the user's actual business point.",
    "Every draft must include a clear call to action.",
    "If details are missing, draft a useful short version and avoid inventing specific facts.",
    "If a signature exists in the app, it is appended separately; do not duplicate it unless the user supplied signature text in the context.",
    "",
    "HTML rules:",
    '- Return HTML only, rooted in: <div dir="rtl" style="text-align:right">...</div>',
    "- Allowed tags only: div, p, strong, ul, li, br, a",
    "- Do not include html/head/body/script/style tags.",
    "- Do not include a subject line in the body.",
  ].join("\n");
}

export function buildEmailBodyUserPrompt(args: {
  context: string;
  style?: string;
  lengthHint: EmailLengthHint;
  templateMode: EmailTemplateMode;
  brief: AiDraftBrief;
}): string {
  const { context, style, lengthHint, templateMode, brief } = args;
  return [
    "Draft a focused email body from this business context:",
    context,
    "",
    `Template mode: ${templateMode}`,
    `Desired length: ${defaultWordRange(lengthHint)}`,
    `Tone/style: ${style || "professional, human, concise"}`,
    `Audience: ${brief.audience || "not specified"}`,
    `Business goal: ${brief.goal || "not specified"}`,
    `Core offer/details: ${brief.offer || "not specified"}`,
    `Call to action: ${brief.cta || "reply to this email or WhatsApp to continue"}`,
    "",
    "Keep paragraphs short. Avoid filler, vague superlatives, and broad brand storytelling.",
    "Return only the HTML email body.",
  ].join("\n");
}
