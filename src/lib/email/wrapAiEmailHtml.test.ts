import { describe, expect, it } from "vitest";
import { wrapAiEmailHtml } from "@/lib/email/wrapAiEmailHtml";

describe("wrapAiEmailHtml", () => {
  // ─── Basic wrapping ──────────────────────────────────────────────────────
  it("wraps plain paragraph with rtl div", () => {
    const out = wrapAiEmailHtml("<p>שלום</p>");
    expect(out).toContain('dir="rtl"');
    expect(out).toContain("text-align:right");
    expect(out).toContain("שלום");
  });

  it("wraps multiple elements", () => {
    const out = wrapAiEmailHtml("<p>שורה א</p><p>שורה ב</p>");
    expect(out).toContain("שורה א");
    expect(out).toContain("שורה ב");
    expect(out).toContain('dir="rtl"');
  });

  // ─── Markdown fence stripping ────────────────────────────────────────────
  it("strips markdown fence ```html ... ```", () => {
    const out = wrapAiEmailHtml("```html\n<p>x</p>\n```");
    expect(out).toContain("x");
    expect(out).not.toContain("```");
    expect(out).not.toContain("html");
  });

  it("strips bare markdown fence ``` ... ```", () => {
    const out = wrapAiEmailHtml("```\n<p>y</p>\n```");
    expect(out).toContain("y");
    expect(out).not.toContain("```");
  });

  // ─── Skip double-wrap ────────────────────────────────────────────────────
  it("skips double wrap when rtl present on div", () => {
    const html = '<div dir="rtl"><p>y</p></div>';
    expect(wrapAiEmailHtml(html)).toBe(html);
  });

  it("skips double wrap when rtl present on any element", () => {
    const html = '<p dir="rtl" style="text-align:right">שלום</p>';
    const out = wrapAiEmailHtml(html);
    expect(out).toBe(html);
    // should not wrap again
    expect(out).not.toContain('<div dir="rtl"');
  });

  it("skips wrap when dir='rtl' uses single quotes", () => {
    const html = "<div dir='rtl'><p>y</p></div>";
    expect(wrapAiEmailHtml(html)).toBe(html);
  });

  // ─── Empty / degenerate inputs ───────────────────────────────────────────
  it("returns empty paragraph for empty string", () => {
    expect(wrapAiEmailHtml("")).toBe("<p></p>");
  });

  it("returns empty paragraph for whitespace-only input", () => {
    expect(wrapAiEmailHtml("   \n  ")).toBe("<p></p>");
  });

  it("returns empty paragraph for fence with empty body", () => {
    expect(wrapAiEmailHtml("```html\n```")).toBe("<p></p>");
  });

  // ─── Whitespace handling ─────────────────────────────────────────────────
  it("trims leading/trailing whitespace before wrapping", () => {
    const out = wrapAiEmailHtml("  <p>שלום</p>  ");
    expect(out).not.toMatch(/^<div[^>]*>\s+</); // no leading whitespace inside wrapper start
    expect(out).toContain("שלום");
  });

  // ─── Content preservation ────────────────────────────────────────────────
  it("preserves Hebrew text with special chars", () => {
    const hebrew = "שלום עולם — 'הידור הסת״ם'";
    const out = wrapAiEmailHtml(`<p>${hebrew}</p>`);
    expect(out).toContain(hebrew);
  });

  it("preserves inline styles in wrapped content", () => {
    const out = wrapAiEmailHtml('<p style="color:red">שלום</p>');
    expect(out).toContain('style="color:red"');
  });
});
