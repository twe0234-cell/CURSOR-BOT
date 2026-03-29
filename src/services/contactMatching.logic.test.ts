import { describe, it, expect } from "vitest";
import {
  normalizePhoneForMatch,
  normalizeEmailForMatch,
  normalizeNameForMatch,
  resolveContactMatch,
  type ContactMatchCandidate,
} from "./contactMatching.logic";

describe("normalizePhoneForMatch", () => {
  it("normalizes 05x to 972", () => {
    expect(normalizePhoneForMatch("050-1234567")).toBe("972501234567");
  });

  it("keeps 972 prefix", () => {
    expect(normalizePhoneForMatch("+972 50 123 4567")).toBe("972501234567");
  });

  it("parses wa chat id", () => {
    expect(normalizePhoneForMatch("972501234567@c.us")).toBe("972501234567");
  });

  it("returns empty for missing", () => {
    expect(normalizePhoneForMatch("")).toBe("");
    expect(normalizePhoneForMatch(null)).toBe("");
  });
});

describe("resolveContactMatch", () => {
  const base: ContactMatchCandidate[] = [
    {
      id: "a",
      phone: "050-1111111",
      email: "foo@EXAMPLE.com",
      name: "משה  כהן",
      wa_chat_id: null,
    },
    {
      id: "b",
      phone: null,
      email: null,
      name: "שרה לוי",
      wa_chat_id: "972521234567@c.us",
    },
  ];

  it("matches phone exactly (normalized)", () => {
    const r = resolveContactMatch(base, "+972501111111", null, null);
    expect(r).toEqual({ contactId: "a", confidence: 100, exactMatch: true });
  });

  it("matches email case-insensitive", () => {
    const r = resolveContactMatch(base, null, "Foo@example.com", null);
    expect(r).toEqual({ contactId: "a", confidence: 100, exactMatch: true });
  });

  it("matches wa_chat_id when searching by phone", () => {
    const r = resolveContactMatch(base, "0521234567", null, null);
    expect(r).toEqual({ contactId: "b", confidence: 100, exactMatch: true });
  });

  it("falls back to fuzzy name when no phone/email match", () => {
    const r = resolveContactMatch(base, null, null, "שרה   לוי");
    expect(r).toEqual({ contactId: "b", confidence: 80, exactMatch: false });
  });

  it("returns null when nothing matches", () => {
    expect(resolveContactMatch(base, "0599999999", null, null)).toBeNull();
    expect(resolveContactMatch(base, null, "x@y.z", null)).toBeNull();
    expect(resolveContactMatch(base, null, null, "אחר")).toBeNull();
  });

  it("prefers phone over fuzzy name when both could apply", () => {
    const list: ContactMatchCandidate[] = [
      { id: "p", phone: "0501111111", email: null, name: "שרה לוי", wa_chat_id: null },
      { id: "n", phone: null, email: null, name: "שרה לוי", wa_chat_id: null },
    ];
    const r = resolveContactMatch(list, "0501111111", null, "שרה לוי");
    expect(r?.contactId).toBe("p");
    expect(r?.exactMatch).toBe(true);
  });
});
