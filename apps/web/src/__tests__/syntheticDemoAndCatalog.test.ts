import { describe, expect, it } from "vitest";
import {
  EVALUATOR_WALKTHROUGH_STEPS,
  SUBMISSION_READINESS_ITEMS,
} from "@/lib/evaluatorWalkthroughCatalog";
import {
  buildSyntheticDemoUploadBatch,
  SYNTHETIC_DEMO_FILES,
  SYNTHETIC_DEMO_NOTICE,
} from "@/lib/syntheticDemoDataset";

describe("syntheticDemoDataset & evaluatorWalkthroughCatalog invariants", () => {
  it("builds a complete synthetic multi-format batch passing Phase 2A pre-validation cleanly", () => {
    expect(SYNTHETIC_DEMO_NOTICE).toMatch(/SYNTHETIC DEMONSTRATION DATASET/i);
    expect(SYNTHETIC_DEMO_FILES.length).toBe(6);

    const names = SYNTHETIC_DEMO_FILES.map((f) => f.fileName);
    expect(names).toEqual([
      "syn_ward_reg_en.csv",
      "syn_hindi_reg.tsv",
      "syn_opd_visits.json",
      "syn_discharge_note.txt",
      "syn_fhir_bundle.json",
      "syn_scanned_imaging.pdf",
    ]);

    const hi = SYNTHETIC_DEMO_FILES.find((f) => f.fileName === "syn_hindi_reg.tsv")!;
    expect(hi.content).toContain("आरव कुमार");
    expect(hi.content).toContain("९८००००१००१");

    const { accepted, errorCount } = buildSyntheticDemoUploadBatch();
    expect(errorCount).toBe(0);
    expect(accepted.length).toBe(6);
    expect(accepted.filter((f) => f.classification === "process").length).toBe(5);
    expect(accepted.filter((f) => f.classification === "quarantine").length).toBe(1);
  });

  it("covers all 10 evaluator steps and separates live, frozen, and unpublished competition scores", () => {
    expect(EVALUATOR_WALKTHROUGH_STEPS.map((s) => s.stepNumber)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);

    const natures = new Set(EVALUATOR_WALKTHROUGH_STEPS.map((s) => s.evidenceNature));
    expect(natures.has("LIVE_DEMO")).toBe(true);
    expect(natures.has("LIVE_LAB")).toBe(true);
    expect(natures.has("FROZEN_BENCHMARK")).toBe(true);
    expect(natures.has("UNAVAILABLE_BOUNDARY")).toBe(true);

    const compScore = SUBMISSION_READINESS_ITEMS.find((i) =>
      i.category.includes("Competition Score"),
    );
    expect(compScore?.provenance).toBe("UNAVAILABLE");
    expect(compScore?.summary).toMatch(/Not yet published/i);
  });
});
