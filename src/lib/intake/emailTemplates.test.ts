import { describe, it, expect } from "vitest";
import {
  buildOwnerConfirmationEmail,
  buildAdminNotificationEmail,
  type IntakeEmailData,
} from "./emailTemplates";

const base: IntakeEmailData = {
  submissionId: "abc-123",
  ownerName: "דוד כהן",
  ownerPhone: "050-1234567",
  ownerEmail: "david@example.com",
  seferType: "ספר תורה",
  imageCount: 3,
};

describe("buildOwnerConfirmationEmail", () => {
  it("includes owner name, submission id, and item type", () => {
    const { subject, html } = buildOwnerConfirmationEmail(base);
    expect(subject).toContain("ספר תורה");
    expect(html).toContain("דוד כהן");
    expect(html).toContain("abc-123");
    expect(html).toContain("ספר תורה");
  });

  it("shows '—' for missing asking_price", () => {
    const { html } = buildOwnerConfirmationEmail(base);
    expect(html).toContain("—");
  });

  it("formats asking_price in ILS", () => {
    const { html } = buildOwnerConfirmationEmail({ ...base, askingPrice: 25000 });
    expect(html).toMatch(/25,000|25000/);
  });

  it("escapes HTML in user-supplied fields to prevent injection", () => {
    const { html } = buildOwnerConfirmationEmail({
      ...base,
      ownerName: "<script>alert(1)</script>",
      description: 'hack " \' & <img>',
    });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&quot;");
    expect(html).toContain("&amp;");
  });

  it("omits empty optional rows", () => {
    const { html } = buildOwnerConfirmationEmail(base);
    expect(html).not.toContain("<b>סופר:</b>");
  });

  it("includes optional rows when present", () => {
    const { html } = buildOwnerConfirmationEmail({
      ...base,
      scribeName: "ר' יעקב",
      ageEstimate: "40 שנה",
      condition: "כשר",
    });
    expect(html).toContain("סופר");
    expect(html).toContain("ר&#39; יעקב");
    expect(html).toContain("40 שנה");
    expect(html).toContain("כשר");
  });
});

describe("buildAdminNotificationEmail", () => {
  it("includes owner contact details for follow-up", () => {
    const { html } = buildAdminNotificationEmail(base);
    expect(html).toContain("050-1234567");
    expect(html).toContain("david@example.com");
    expect(html).toContain("דוד כהן");
  });

  it("preserves newlines in description as <br>", () => {
    const { html } = buildAdminNotificationEmail({
      ...base,
      description: "שורה 1\nשורה 2",
    });
    expect(html).toContain("שורה 1<br>שורה 2");
  });

  it("subject flags it as a new intake", () => {
    const { subject } = buildAdminNotificationEmail(base);
    expect(subject).toContain("פנייה חדשה");
    expect(subject).toContain("דוד כהן");
  });
});
