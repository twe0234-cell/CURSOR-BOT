import { describe, expect, it } from "vitest";
import { buildTorahWorkflowPlan } from "./torahWorkflowConfig";

describe("torahWorkflowConfig", () => {
  it("builds the default sheet flow before QA", () => {
    const stages = buildTorahWorkflowPlan({
      gavraQaCount: 1,
      computerQaCount: 1,
      requiresTagging: false,
    });

    expect(stages.map((stage) => stage.id)).toEqual([
      "reported_written",
      "received",
      "gavra_1",
      "computer_1",
    ]);
  });

  it("adds tagging only when the project requires it", () => {
    const stages = buildTorahWorkflowPlan({
      gavraQaCount: 0,
      computerQaCount: 0,
      requiresTagging: true,
      taggingStatus: "pending",
    });

    expect(stages.map((stage) => stage.id)).toEqual([
      "reported_written",
      "received",
      "tagging",
    ]);
  });

  it("normalizes invalid QA counts to zero", () => {
    const stages = buildTorahWorkflowPlan({
      gavraQaCount: -2,
      computerQaCount: Number.NaN,
      requiresTagging: false,
    });

    expect(stages.map((stage) => stage.id)).toEqual(["reported_written", "received"]);
  });
});

