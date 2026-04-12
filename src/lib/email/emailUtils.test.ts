import { describe, expect, it } from "vitest";
import {
  isValidEmail,
  normalizeEmail,
  parseEmailCsvText,
  buildEmailTrackingUrls,
  interpolateRecipientName,
  detectDeviceType,
} from "./emailUtils";

// ─── isValidEmail ────────────────────────────────────────────────────────────

describe("isValidEmail", () => {
  it("accepts standard email", () => {
    expect(isValidEmail("user@example.com")).toBe(true);
  });
  it("accepts subdomain email", () => {
    expect(isValidEmail("user@mail.example.co.il")).toBe(true);
  });
  it("accepts email with dots before @", () => {
    expect(isValidEmail("first.last@example.com")).toBe(true);
  });
  it("accepts email with plus tag", () => {
    expect(isValidEmail("user+tag@example.com")).toBe(true);
  });
  it("trims whitespace before checking", () => {
    expect(isValidEmail("  user@example.com  ")).toBe(true);
  });
  it("rejects missing @", () => {
    expect(isValidEmail("notanemail.com")).toBe(false);
  });
  it("rejects missing domain", () => {
    expect(isValidEmail("user@")).toBe(false);
  });
  it("rejects missing TLD", () => {
    expect(isValidEmail("user@example")).toBe(false);
  });
  it("rejects spaces inside", () => {
    expect(isValidEmail("user @example.com")).toBe(false);
  });
  it("rejects empty string", () => {
    expect(isValidEmail("")).toBe(false);
  });
  it("rejects double @", () => {
    expect(isValidEmail("a@@b.com")).toBe(false);
  });
});

// ─── normalizeEmail ──────────────────────────────────────────────────────────

describe("normalizeEmail", () => {
  it("lowercases uppercase", () => {
    expect(normalizeEmail("User@Example.COM")).toBe("user@example.com");
  });
  it("trims whitespace", () => {
    expect(normalizeEmail("  user@example.com  ")).toBe("user@example.com");
  });
  it("preserves already-lowercase", () => {
    expect(normalizeEmail("user@example.com")).toBe("user@example.com");
  });
});

// ─── parseEmailCsvText ───────────────────────────────────────────────────────

describe("parseEmailCsvText", () => {
  it("parses comma-delimited with name", () => {
    const out = parseEmailCsvText("user@example.com,ישראל כהן");
    expect(out).toHaveLength(1);
    expect(out[0]?.email).toBe("user@example.com");
    expect(out[0]?.name).toBe("ישראל כהן");
  });
  it("parses tab-delimited", () => {
    const out = parseEmailCsvText("user@example.com\tשם");
    expect(out[0]?.email).toBe("user@example.com");
    expect(out[0]?.name).toBe("שם");
  });
  it("parses email-only (no name)", () => {
    const out = parseEmailCsvText("user@example.com");
    expect(out[0]?.name).toBeNull();
  });
  it("normalizes email to lowercase", () => {
    const out = parseEmailCsvText("USER@EXAMPLE.COM,שם");
    expect(out[0]?.email).toBe("user@example.com");
  });
  it("skips invalid emails", () => {
    const raw = "valid@example.com,שם\nnotanemail\n@missing.com";
    const out = parseEmailCsvText(raw);
    expect(out).toHaveLength(1);
    expect(out[0]?.email).toBe("valid@example.com");
  });
  it("handles multiple lines", () => {
    const raw = "a@example.com,אלף\nb@example.com,בית";
    const out = parseEmailCsvText(raw);
    expect(out).toHaveLength(2);
    expect(out[1]?.email).toBe("b@example.com");
  });
  it("returns empty array for empty input", () => {
    expect(parseEmailCsvText("")).toHaveLength(0);
    expect(parseEmailCsvText("\n\n\n")).toHaveLength(0);
  });
  it("handles Windows CRLF line endings", () => {
    const out = parseEmailCsvText("a@example.com,א\r\nb@example.com,ב");
    expect(out).toHaveLength(2);
  });
});

// ─── buildEmailTrackingUrls ──────────────────────────────────────────────────

describe("buildEmailTrackingUrls", () => {
  it("builds correct URLs for known logId", () => {
    const { trackingPixelUrl, unsubscribeUrl } = buildEmailTrackingUrls(
      "https://app.example.com",
      "abc-123"
    );
    expect(trackingPixelUrl).toBe("https://app.example.com/api/email/track/abc-123");
    expect(unsubscribeUrl).toBe("https://app.example.com/api/email/unsubscribe/abc-123");
  });
  it("uses 'noop' when logId is null", () => {
    const { trackingPixelUrl, unsubscribeUrl } = buildEmailTrackingUrls(
      "https://app.example.com",
      null
    );
    expect(trackingPixelUrl).toContain("/noop");
    expect(unsubscribeUrl).toContain("/noop");
  });
  it("strips trailing slash from appUrl", () => {
    const { trackingPixelUrl } = buildEmailTrackingUrls(
      "https://app.example.com/",
      "log-1"
    );
    expect(trackingPixelUrl).not.toContain("//api");
  });
});

// ─── interpolateRecipientName ────────────────────────────────────────────────

describe("interpolateRecipientName", () => {
  it("replaces {{name}} with recipient name", () => {
    expect(interpolateRecipientName("שלום {{name}},", "ישראל")).toBe("שלום ישראל,");
  });
  it("replaces all occurrences", () => {
    expect(interpolateRecipientName("{{name}} שלום {{name}}", "רבי")).toBe("רבי שלום רבי");
  });
  it("replaces with empty string when name is ''", () => {
    expect(interpolateRecipientName("שלום {{name}}", "")).toBe("שלום ");
  });
  it("leaves non-template text intact", () => {
    expect(interpolateRecipientName("שלום וברכה", "ישראל")).toBe("שלום וברכה");
  });
  it("handles partial double-braces", () => {
    expect(interpolateRecipientName("{{name} }", "ישראל")).toBe("{{name} }");
  });
});

// ─── detectDeviceType ────────────────────────────────────────────────────────

describe("detectDeviceType", () => {
  it("detects mobile from iPhone UA", () => {
    const ua = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
    expect(detectDeviceType(ua)).toBe("mobile");
  });
  it("detects mobile from Android phone UA", () => {
    const ua = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.144 Mobile Safari/537.36";
    expect(detectDeviceType(ua)).toBe("mobile");
  });
  it("detects tablet from iPad UA", () => {
    const ua = "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
    expect(detectDeviceType(ua)).toBe("tablet");
  });
  it("detects desktop from Chrome/Windows UA", () => {
    const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    expect(detectDeviceType(ua)).toBe("desktop");
  });
  it("detects desktop from Mac UA", () => {
    const ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    expect(detectDeviceType(ua)).toBe("desktop");
  });
  it("returns 'unknown' for empty UA", () => {
    expect(detectDeviceType("")).toBe("unknown");
  });
  it("returns 'unknown' for bot UA", () => {
    expect(detectDeviceType("Googlebot/2.1 (+http://www.google.com/bot.html)")).toBe("unknown");
  });
});
