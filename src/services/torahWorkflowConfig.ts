export type TorahWorkflowStageKind = "sheet" | "tagging" | "qa";

export type TorahWorkflowStage = {
  id: string;
  order: number;
  kind: TorahWorkflowStageKind;
  labelHe: string;
  helperHe: string;
  required: boolean;
};

export type TorahWorkflowConfigInput = {
  gavraQaCount?: number | null;
  computerQaCount?: number | null;
  requiresTagging?: boolean | null;
  taggingStatus?: string | null;
};

function normalizeRoundCount(value: number | null | undefined): number {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

export function buildTorahWorkflowPlan(input: TorahWorkflowConfigInput): TorahWorkflowStage[] {
  const stages: TorahWorkflowStage[] = [
    {
      id: "reported_written",
      order: 1,
      kind: "sheet",
      labelHe: "דווח כנכתב",
      helperHe: "הסופר דיווח שהיריעה נכתבה.",
      required: true,
    },
    {
      id: "received",
      order: 2,
      kind: "sheet",
      labelHe: "התקבל אצלי / במחסן",
      helperHe: "היריעה פיזית אצל העסק לפני שליחה להגהה.",
      required: true,
    },
  ];

  if (input.requiresTagging) {
    stages.push({
      id: "tagging",
      order: stages.length + 1,
      kind: "tagging",
      labelHe: "תיוג",
      helperHe:
        input.taggingStatus === "completed"
          ? "התיוג מסומן כמושלם בפרויקט."
          : "הפרויקט דורש תיוג לפני המשך המסלול.",
      required: true,
    });
  }

  const gavraCount = normalizeRoundCount(input.gavraQaCount);
  const computerCount = normalizeRoundCount(input.computerQaCount);

  for (let i = 1; i <= gavraCount; i += 1) {
    stages.push({
      id: `gavra_${i}`,
      order: stages.length + 1,
      kind: "qa",
      labelHe: `בדיקת גברא ${i}`,
      helperHe: "סבב הגהה אנושי דרך שקית QA.",
      required: true,
    });
  }

  for (let i = 1; i <= computerCount; i += 1) {
    stages.push({
      id: `computer_${i}`,
      order: stages.length + 1,
      kind: "qa",
      labelHe: `בדיקת מחשב ${i}`,
      helperHe: "סבב הגהת מחשב דרך שקית QA.",
      required: true,
    });
  }

  return stages;
}

