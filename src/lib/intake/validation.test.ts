import { describe, it, expect } from "vitest";
import { TorahIntakeSchema, SEFER_TYPES } from "./validation";

const ok = {
  owner_name: "דוד כהן",
  owner_phone: "050-1234567",
  owner_email: "david@example.com",
  sefer_type: "ספר תורה" as const,
  image_paths: [],
};

describe("TorahIntakeSchema", () => {
  it("accepts a minimal valid payload", () => {
    const r = TorahIntakeSchema.safeParse(ok);
    expect(r.success).toBe(true);
  });

  it("rejects missing required owner fields", () => {
    expect(TorahIntakeSchema.safeParse({ ...ok, owner_name: "" }).success).toBe(false);
    expect(TorahIntakeSchema.safeParse({ ...ok, owner_phone: "" }).success).toBe(false);
    expect(TorahIntakeSchema.safeParse({ ...ok, owner_email: "" }).success).toBe(false);
  });

  it("rejects invalid email", () => {
    expect(
      TorahIntakeSchema.safeParse({ ...ok, owner_email: "not-an-email" }).success
    ).toBe(false);
  });

  it("rejects malformed phone", () => {
    expect(TorahIntakeSchema.safeParse({ ...ok, owner_phone: "ab" }).success).toBe(false);
  });

  it("accepts every permitted sefer_type", () => {
    for (const t of SEFER_TYPES) {
      expect(TorahIntakeSchema.safeParse({ ...ok, sefer_type: t }).success).toBe(true);
    }
  });

  it("rejects an unknown sefer_type", () => {
    expect(
      TorahIntakeSchema.safeParse({ ...ok, sefer_type: "לא-קיים" as never }).success
    ).toBe(false);
  });

  it("coerces asking_price string → number and drops invalid", () => {
    const r1 = TorahIntakeSchema.safeParse({ ...ok, asking_price: "1500" });
    expect(r1.success).toBe(true);
    if (r1.success) expect(r1.data.asking_price).toBe(1500);

    const r2 = TorahIntakeSchema.safeParse({ ...ok, asking_price: "" });
    expect(r2.success).toBe(true);
    if (r2.success) expect(r2.data.asking_price).toBeUndefined();

    const r3 = TorahIntakeSchema.safeParse({ ...ok, asking_price: "שלילי" });
    expect(r3.success).toBe(false);
  });

  it("rejects negative asking_price", () => {
    const r = TorahIntakeSchema.safeParse({ ...ok, asking_price: -50 });
    expect(r.success).toBe(false);
  });

  it("trims optional strings and returns undefined for empty", () => {
    const r = TorahIntakeSchema.safeParse({
      ...ok,
      scribe_name: "   ",
      owner_city: "  ירושלים  ",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.scribe_name).toBeUndefined();
      expect(r.data.owner_city).toBe("ירושלים");
    }
  });

  it("caps image_paths at 10", () => {
    const eleven = Array.from({ length: 11 }, (_, i) => `torah-intake/x/${i}.jpg`);
    const r = TorahIntakeSchema.safeParse({ ...ok, image_paths: eleven });
    expect(r.success).toBe(false);
  });

  it("accepts a full payload with all optional fields", () => {
    const r = TorahIntakeSchema.safeParse({
      ...ok,
      owner_city: "בני ברק",
      scribe_name: "ר' יעקב סופר",
      age_estimate: "כ-40 שנה",
      condition: "כשר למהדרין",
      description: "ספר תורה יפה ומהודר, כתב בית יוסף.",
      asking_price: "25000",
      image_paths: ["torah-intake/abc/1.jpg", "torah-intake/abc/2.jpg"],
    });
    expect(r.success).toBe(true);
  });
});
