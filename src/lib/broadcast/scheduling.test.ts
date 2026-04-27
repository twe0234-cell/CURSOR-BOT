import { describe, expect, it } from "vitest";
import {
  broadcastQueueDisplayStatus,
  isScheduledForFuture,
} from "./scheduling";

describe("broadcast scheduling helpers", () => {
  const now = new Date("2026-04-27T10:00:00.000Z");

  it("classifies future pending jobs as scheduled", () => {
    expect(isScheduledForFuture("pending", "2026-04-27T10:05:00.000Z", now)).toBe(true);
    expect(broadcastQueueDisplayStatus("pending", "2026-04-27T10:05:00.000Z", now)).toBe("scheduled");
  });

  it("classifies due pending jobs as pending", () => {
    expect(isScheduledForFuture("pending", "2026-04-27T09:59:00.000Z", now)).toBe(false);
    expect(broadcastQueueDisplayStatus("pending", "2026-04-27T09:59:00.000Z", now)).toBe("pending");
  });

  it("maps completed queue rows to sent for UI clarity", () => {
    expect(broadcastQueueDisplayStatus("completed", null, now)).toBe("sent");
    expect(broadcastQueueDisplayStatus("failed", null, now)).toBe("failed");
  });
});
