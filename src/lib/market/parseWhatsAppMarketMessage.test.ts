import { describe, expect, it } from "vitest";
import {
  parseMarketTorahMessage,
  parsedMessageIsActionable,
} from "./parseWhatsAppMarketMessage";

describe("parseMarketTorahMessage", () => {
  it("parses size, script, and price near מחיר", () => {
    const p = parseMarketTorahMessage("ספרדי 48 מחיר 120 אלף");
    expect(p.torah_size).toBe("48");
    expect(p.script_type).toBe("ספרדי");
    expect(p.asking_price_full_shekels).toBe(120_000);
    expect(parsedMessageIsActionable(p)).toBe(true);
  });

  it("maps ארי and ₪ price", () => {
    const p = parseMarketTorahMessage("ארי 42 — 85000 ₪");
    expect(p.script_type).toBe("ארי");
    expect(p.torah_size).toBe("42");
    expect(p.asking_price_full_shekels).toBe(85_000);
    expect(parsedMessageIsActionable(p)).toBe(true);
  });

  it("maps בית יוסף to ב״י", () => {
    const p = parseMarketTorahMessage("בית יוסף 36 מחיר 95 אלף");
    expect(p.script_type).toBe("ב״י");
    expect(p.torah_size).toBe("36");
    expect(p.asking_price_full_shekels).toBe(95_000);
  });

  it("is not actionable without price", () => {
    const p = parseMarketTorahMessage("ספרדי 48 בלי מחיר");
    expect(parsedMessageIsActionable(p)).toBe(false);
  });

  it("is not actionable with price only (no listed torah size / script)", () => {
    const p = parseMarketTorahMessage("מחיר 130 אלף");
    expect(p.torah_size).toBeNull();
    expect(p.script_type).toBeNull();
    expect(parsedMessageIsActionable(p)).toBe(false);
  });
});
