import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  compareEvaluationIdentities,
  evaluationIdentityOf,
  LAB_PREVIEW_CAPTURE,
  type ComparisonStatus,
  type VisualEvaluationIdentity,
} from "@/lib/presell-quality/evaluation-comparability";

export type HistoricalEvaluationRow = {
  execution: "54AT" | "54AU" | "54AW";
  generationId: string;
  identity: VisualEvaluationIdentity;
  desktopVisualScore: number | null;
  mobileVisualScore: number | null;
  editorialScore: number | null;
  officialReferenceUsed: boolean;
  adminChromePresent: boolean;
  notes: string[];
};

const EXPECTED_REFERENCE = "21cd6030b11127a59d531417bac5613d0ae3d64f2a1bc19e33d2b926049a9938";

function readJson(file: string): Record<string, unknown> | null {
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function historicalEvaluationRows(root = process.cwd()): HistoricalEvaluationRow[] {
  const at = readJson(path.join(root, "data/evidence/execution-54at-presell-regeneration/quality-evaluation.json"));
  const au = readJson(path.join(root, "data/evidence/execution-54au-premium-design/visual-evaluation.json"));
  const awVisual = readJson(path.join(root, "data/evidence/execution-54aw-premium-optimization/visual-evaluation-run-1.json"));
  const awEditorial = readJson(path.join(root, "data/evidence/execution-54aw-premium-optimization/editorial-evaluation.json"));
  const awEditorial2 = readJson(path.join(root, "data/evidence/execution-54aw-premium-optimization/editorial-evaluation-run-2.json"));

  const atAssessments = Array.isArray(at?.assessments) ? (at?.assessments as Array<Record<string, unknown>>) : [];
  const atScores = atAssessments.map((item) => Number(item.overallScore)).filter((item) => Number.isFinite(item));

  return [
    {
      execution: "54AT",
      generationId: "lp-mvs7mja3-0d690e7c",
      identity: evaluationIdentityOf({
        generationId: "lp-mvs7mja3-0d690e7c",
        rendererVersion: "v4",
        rubricVersion: "1",
        promptVersion: "4",
        captureMode: LAB_PREVIEW_CAPTURE,
        adminChromePresent: true,
        model: "gpt-4o-mini",
        visualEvalVersion: null,
        referenceHash: null,
        viewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
      }),
      desktopVisualScore: null,
      mobileVisualScore: null,
      editorialScore: atScores[0] ?? 81,
      officialReferenceUsed: false,
      adminChromePresent: true,
      notes: [
        "Editorial multimodal scores 81 and 83 on lab-preview screenshots.",
        "Official premium reference was not attached.",
        "Baseline generation lp-mvr3pp2f-ea2a99d2 is a different page and is not a visual-method pair.",
      ],
    },
    {
      execution: "54AU",
      generationId: "lp-mvs7mja3-0d690e7c",
      identity: evaluationIdentityOf({
        generationId: "lp-mvs7mja3-0d690e7c",
        rendererVersion: "v4",
        rubricVersion: "1",
        promptVersion: "cursor-multimodal",
        captureMode: LAB_PREVIEW_CAPTURE,
        adminChromePresent: true,
        model: "CURSOR_MULTIMODAL",
        visualEvalVersion: null,
        referenceHash: null,
        viewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
        scores: (au?.scores as Record<string, number> | undefined) ?? null,
      }),
      desktopVisualScore: 86,
      mobileVisualScore: 84,
      editorialScore: 82,
      officialReferenceUsed: false,
      adminChromePresent: true,
      notes: [
        "Cursor visual review of lab-preview screenshots. Paid OpenAI visual comparison was not executed.",
        "Owner reference was not available during 54AU.",
        "Editorial 82 was carried from 54AT, not a new independent editorial pair.",
      ],
    },
    {
      execution: "54AW",
      generationId: "lp-mvs7mja3-0d690e7c",
      identity: evaluationIdentityOf({
        generationId: "lp-mvs7mja3-0d690e7c",
        rendererVersion: "v4",
        rubricVersion: "1",
        promptVersion: "visual-json-object-v1",
        captureMode: LAB_PREVIEW_CAPTURE,
        adminChromePresent: true,
        model: "gpt-4o-mini",
        visualEvalVersion: "PREMIUM_VISUAL_EVALUATION_V1",
        referenceHash: EXPECTED_REFERENCE,
        viewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
        scores: (awVisual?.scores as Record<string, number> | undefined) ?? null,
      }),
      desktopVisualScore: 72,
      mobileVisualScore: 75,
      editorialScore: Math.min(Number(awEditorial?.overallScore ?? 78), Number(awEditorial2?.overallScore ?? 72)),
      officialReferenceUsed: true,
      adminChromePresent: true,
      notes: [
        "Official PNG was attached. Lab admin bars were inside the scored screenshots.",
        "Independent pair existed, but methodology is not VISITOR_VISUAL_CAPTURE or PREMIUM_VISUAL_EVALUATION_V2.",
        "Raw evaluator comments still asked for more vivid reference chrome.",
      ],
    },
  ];
}

export function historicalComparabilityMatrix(rows: HistoricalEvaluationRow[] = historicalEvaluationRows()): Array<{
  left: string;
  right: string;
  status: ComparisonStatus;
  reasons: string[];
}> {
  const pairs: Array<{ left: string; right: string; status: ComparisonStatus; reasons: string[] }> = [];
  for (let i = 0; i < rows.length; i += 1) {
    for (let j = i + 1; j < rows.length; j += 1) {
      const comparison = compareEvaluationIdentities(rows[i]!.identity, rows[j]!.identity);
      pairs.push({ left: rows[i]!.execution, right: rows[j]!.execution, ...comparison });
    }
  }
  return pairs;
}
