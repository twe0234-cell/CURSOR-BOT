import { describe, it, expect } from "vitest";
import { classifyTorahListingSignal } from "./torahListingSignal";

describe("classifyTorahListingSignal", () => {
  it("flags 'ספר תורה למכירה' as listing", () => {
    const r = classifyTorahListingSignal("ספר תורה למכירה ארי 36 165");
    expect(r.kind).toBe("listing");
    expect(r.score).toBeGreaterThan(0.5);
  });

  it("flags 'ס\"ת מוגה ב\"י 42' with strong + supports", () => {
    const r = classifyTorahListingSignal('ס"ת מוגה ב"י 42 מחיר 180');
    expect(r.kind).toBe("listing");
    expect(r.score).toBeGreaterThan(0.6);
  });

  it("downgrades wanted-style to 'wanted'", () => {
    const r = classifyTorahListingSignal("מחפש ספר תורה ספרדי באזור ירושלים");
    expect(r.kind).toBe("wanted");
  });

  it("rejects off-topic mezuzah/tefillin", () => {
    const r = classifyTorahListingSignal("מזוזה כשרה למכירה 200 ש\"ח");
    expect(r.kind).toBe("unrelated");
  });

  it("rejects empty / pure chatter", () => {
    expect(classifyTorahListingSignal("").kind).toBe("unrelated");
    expect(classifyTorahListingSignal("שלום, מה נשמע?").kind).toBe("unrelated");
  });

  it("matches English 'sefer torah for sale'", () => {
    const r = classifyTorahListingSignal("Sefer Torah Beit Yosef 36 columns proofread");
    expect(r.kind).toBe("listing");
  });

  it("requires 2 support hits when no strong term present", () => {
    // single support only → unrelated
    expect(classifyTorahListingSignal("מחיר 165").kind).toBe("unrelated");
    // two supports → listing
    expect(classifyTorahListingSignal("ב\"י 36").kind).toBe("listing");
  });
});
