import { describe, expect, it } from "vitest";
import { wrapAiEmailHtml } from "@/lib/email/wrapAiEmailHtml";

describe("wrapAiEmailHtml", () => {
  it("wraps plain paragraph with rtl div", () => {
    const out = wrapAiEmailHtml("<p>שלום</p>");
    expect(out).toContain('dir="rtl"');
    expect(out).toContain("text-align:right");
    expect(out).toContain("שלום");
  });

  it("strips markdown fence", () => {
    const out = wrapAiEmailHtml("```html\n<p>x</p>\n```");
    expect(out).toContain("x");
    expect(out).not.toContain("```");
  });

  it("skips double wrap when rtl present", () => {
    const out = wrapAiEmailHtml('<div dir="rtl"><p>y</p></div>');
    expect(out).toBe('<div dir="rtl"><p>y</p></div>');
  });
});
