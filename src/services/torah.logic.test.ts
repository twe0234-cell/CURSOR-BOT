import { describe, expect, it } from "vitest";
import {
  assertTorahSheetTransition,
  canTransitionTorahSheet,
  canResolveQaFromInQa,
} from "./torah.logic";

describe("torah.logic — sheet transitions", () => {
  it("allows reported_written → received", () => {
    expect(canTransitionTorahSheet("reported_written", "received")).toBe(true);
  });

  it("allows received → in_qa", () => {
    expect(canTransitionTorahSheet("received", "in_qa")).toBe(true);
  });

  it("allows legacy written → in_qa", () => {
    expect(canTransitionTorahSheet("written", "in_qa")).toBe(true);
  });

  it("allows warehouse shortcut not_started → received", () => {
    expect(canTransitionTorahSheet("not_started", "received")).toBe(true);
  });

  it("allows in_qa → needs_fixing and approved", () => {
    expect(canTransitionTorahSheet("in_qa", "needs_fixing")).toBe(true);
    expect(canTransitionTorahSheet("in_qa", "approved")).toBe(true);
  });

  it("rejects arbitrary jump to sewn", () => {
    expect(canTransitionTorahSheet("not_started", "sewn")).toBe(false);
    expect(assertTorahSheetTransition("not_started", "sewn").ok).toBe(false);
  });

  it("allows idempotent same status", () => {
    expect(canTransitionTorahSheet("in_qa", "in_qa")).toBe(true);
    expect(assertTorahSheetTransition("in_qa", "in_qa").ok).toBe(true);
  });

  it("QA resolution flags", () => {
    expect(canResolveQaFromInQa("approved")).toBe(true);
    expect(canResolveQaFromInQa("needs_fixing")).toBe(true);
  });
});
