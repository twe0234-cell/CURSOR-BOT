import { describe, it, expect } from "vitest";
import { buildReplayDraft, isReplayable } from "./replay";

const baseRow = {
  id: "11111111-1111-1111-1111-111111111111",
  sent: 5,
  failed: 0,
  errors: [],
  tags: ["VIP", "Buyer"],
  scribe_code: "121",
  internal_notes: "Holiday push",
  message_snippet: null,
  message_text: "שלום, ההודעה המקורית",
  created_at: "2026-04-29T10:00:00.000Z",
};

describe("buildReplayDraft", () => {
  it("prefers message_text over message_snippet", () => {
    const d = buildReplayDraft({ ...baseRow, message_snippet: "snippet only" });
    expect(d.messageText).toBe("שלום, ההודעה המקורית");
    expect(d.replayOfLogId).toBe(baseRow.id);
  });

  it("falls back to message_snippet when message_text is empty", () => {
    const d = buildReplayDraft({ ...baseRow, message_text: null, message_snippet: "snippet" });
    expect(d.messageText).toBe("snippet");
  });

  it("clones tags as a fresh array (no aliasing)", () => {
    const d = buildReplayDraft(baseRow);
    expect(d.tags).toEqual(["VIP", "Buyer"]);
    d.tags.push("Mutated");
    expect(baseRow.tags).toEqual(["VIP", "Buyer"]);
  });

  it("returns null mediaNotice when log_details has no media markers", () => {
    expect(buildReplayDraft(baseRow).mediaNotice).toBeNull();
  });

  it("flags mediaNotice when log_details.imageUrl exists", () => {
    const d = buildReplayDraft({
      ...baseRow,
      log_details: { imageUrl: "https://example.com/x.jpg" },
    });
    expect(d.mediaNotice).toContain("תמונה");
  });

  it("flags mediaNotice when log_details.hadImage = true", () => {
    const d = buildReplayDraft({ ...baseRow, log_details: { hadImage: true } });
    expect(d.mediaNotice).toContain("תמונה");
  });
});

describe("isReplayable", () => {
  it("true when message_text non-empty", () => {
    expect(isReplayable(baseRow)).toBe(true);
  });
  it("true when only message_snippet present", () => {
    expect(isReplayable({ ...baseRow, message_text: null, message_snippet: "x" })).toBe(true);
  });
  it("false when both are empty", () => {
    expect(isReplayable({ ...baseRow, message_text: null, message_snippet: null })).toBe(false);
    expect(isReplayable({ ...baseRow, message_text: "   ", message_snippet: "" })).toBe(false);
  });
});
