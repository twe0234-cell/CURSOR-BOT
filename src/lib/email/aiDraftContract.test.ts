import { describe, expect, it } from "vitest";
import {
  bodyMaxTokensForLength,
  buildEmailBodySystemPrompt,
  buildEmailBodyUserPrompt,
  buildSubjectPrompt,
  normalizeTemplateMode,
} from "./aiDraftContract";

describe("aiDraftContract", () => {
  it("defaults to short_offer for unknown template modes", () => {
    expect(normalizeTemplateMode("random")).toBe("short_offer");
    expect(normalizeTemplateMode("price_quote")).toBe("price_quote");
  });

  it("keeps default body generation short", () => {
    expect(bodyMaxTokensForLength("קצר")).toBeLessThanOrEqual(900);
    expect(bodyMaxTokensForLength("בינוני")).toBeLessThanOrEqual(1200);
    expect(bodyMaxTokensForLength("ארוך")).toBeLessThanOrEqual(1800);
  });

  it("builds a template-disciplined Hebrew-first prompt", () => {
    const prompt = buildEmailBodySystemPrompt("follow_up", "קצר");
    expect(prompt).toContain("Default language is Hebrew");
    expect(prompt).toContain("Template mode: follow_up");
    expect(prompt).toContain("80-140 Hebrew words");
    expect(prompt).toContain("clear call to action");
    expect(prompt).toContain("Return HTML only");
  });

  it("preserves business details in the user prompt", () => {
    const prompt = buildEmailBodyUserPrompt({
      context: "לקוח ביקש מחיר לתפילין מהודרות",
      style: "ענייני",
      lengthHint: "קצר",
      templateMode: "price_quote",
      brief: {
        audience: "לקוח פרטי",
        goal: "אישור הצעת מחיר",
        offer: "תפילין מהודרות",
        cta: "לאשר בוואטסאפ",
      },
    });
    expect(prompt).toContain("תפילין מהודרות");
    expect(prompt).toContain("price_quote");
    expect(prompt).toContain("לאשר בוואטסאפ");
  });

  it("keeps subject generation constrained", () => {
    const prompt = buildSubjectPrompt("ספר תורה למכירה", "רשמי");
    expect(prompt).toContain("max 70 characters");
    expect(prompt).toContain("Return only the subject");
  });
});
