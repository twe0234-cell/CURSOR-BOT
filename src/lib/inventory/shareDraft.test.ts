import { describe, expect, it } from "vitest";
import {
  buildInventoryShareFallback,
  maxCharsForChannel,
  normalizeGeneratedShareText,
} from "@/src/lib/inventory/shareDraft";

describe("inventory share draft helpers", () => {
  it("builds short WhatsApp-friendly fallback copy", () => {
    const text = buildInventoryShareFallback(
      {
        productType: "ספר תורה",
        supplierName: "סופר משה",
        details: "גודל 42, כתב בית יוסף",
        priceText: "12,500 ₪",
        statusText: "זמין",
      },
      "whatsapp"
    );

    expect(text).toContain("*למכירה:");
    expect(text).toContain("• ספק/סופר:");
    expect(text.length).toBeLessThanOrEqual(maxCharsForChannel("whatsapp"));
  });

  it("adds image link in email fallback only", () => {
    const waText = buildInventoryShareFallback(
      { productType: "מזוזה", imageUrl: "https://example.com/a.jpg" },
      "whatsapp"
    );
    const emailText = buildInventoryShareFallback(
      { productType: "מזוזה", imageUrl: "https://example.com/a.jpg" },
      "email"
    );

    expect(waText).not.toContain("• תמונה:");
    expect(emailText).toContain("• תמונה:");
  });

  it("normalizes generated text and enforces length limits", () => {
    const normalized = normalizeGeneratedShareText(`\nשלום\n\n\n עולם \n`, "whatsapp");
    expect(normalized).toBe("שלום\nעולם");

    const long = normalizeGeneratedShareText("x".repeat(1200), "email");
    expect(long.length).toBeLessThanOrEqual(maxCharsForChannel("email"));
  });
});
