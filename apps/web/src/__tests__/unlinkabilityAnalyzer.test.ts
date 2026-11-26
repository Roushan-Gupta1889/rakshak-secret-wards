import { describe, expect, it } from "vitest";
import type { SanitizedRecordItem } from "@/api/schemas";
import {
  BIRTHDAY_THEORETICAL_CURVE,
  createSyntheticVerificationCsv,
  evaluateCrossSecretUnlinkability,
  evaluateDeterminism,
  evaluateFormatBatch,
  evaluateLiveCollisions,
  FROZEN_PHASE_1E_CRYPTO_BENCHMARK,
  validatePseudonymFormat,
  VALID_ALPHA_PSN_SPACE,
} from "@/lib/unlinkabilityAnalyzer";

function makeItems(psns: string[]): SanitizedRecordItem[] {
  return psns.map((patient, index) => ({
    index,
    file: "sanitized/synthetic_unlinkability_fixture.csv",
    loc: `row:${index}`,
    patient,
    status: "generalized",
    preview: "",
  }));
}

describe("unlinkabilityAnalyzer cryptographic checks", () => {
  it("validates Crockford Base-32 alpha-PSN contract and rejects all-digit and invalid inputs", () => {
    expect(validatePseudonymFormat("PSN-7JNJ5S").valid).toBe(true);
    expect(validatePseudonymFormat("PSN-0A9ZXY").valid).toBe(true);

    // Phase 1D all-digit collision trigger must fail Phase 1E contract
    const allDigit = validatePseudonymFormat("PSN-975397");
    expect(allDigit.valid).toBe(false);
    expect(allDigit.hasAlphaChar).toBe(false);
    expect(allDigit.reasons).toEqual(["ALL_DIGIT_NUMERIC_COLLISION"]);

    // Crockford excludes I, L, O, U
    const badChars = validatePseudonymFormat("PSN-123I4L");
    expect(badChars.valid).toBe(false);
    expect(badChars.reasons).toContain("INVALID_CHARSET");

    const missingPrefix = validatePseudonymFormat("7JNJ5S");
    expect(missingPrefix.valid).toBe(false);
    expect(missingPrefix.reasons).toContain("INVALID_PREFIX");
  });

  it("evaluates determinism pass and mismatch failure accurately", () => {
    const a = makeItems(["PSN-7JNJ5S", "PSN-PK22AR", "PSN-5BDBT8"]);
    const bSame = makeItems(["PSN-7JNJ5S", "PSN-PK22AR", "PSN-5BDBT8"]);
    const bDiff = makeItems(["PSN-7JNJ5S", "PSN-AAAAAA", "PSN-5BDBT8"]);

    const pass = evaluateDeterminism({ runAId: "run_a", runBId: "run_b", runAItems: a, runBItems: bSame });
    expect(pass.status).toBe("VERIFIED");
    expect(pass.pairCount).toBe(3);
    expect(pass.matchingCount).toBe(3);
    expect(pass.mismatchCount).toBe(0);

    const fail = evaluateDeterminism({ runAId: "run_a", runBId: "run_b", runAItems: a, runBItems: bDiff });
    expect(fail.status).toBe("FAILED");
    expect(fail.matchingCount).toBe(2);
    expect(fail.mismatchCount).toBe(1);
  });

  it("evaluates cross-secret unlinkability across paired engine runs", () => {
    const runA = makeItems(["PSN-7JNJ5S", "PSN-PK22AR", "PSN-5BDBT8"]);
    const runC = makeItems(["PSN-9G98B7", "PSN-04NFMC", "PSN-CRZ70P"]);

    const ok = evaluateCrossSecretUnlinkability({
      runAId: "run_a",
      runCId: "run_c",
      runAItems: runA,
      runCItems: runC,
    });
    expect(ok.status).toBe("VERIFIED");
    expect(ok.pairCount).toBe(3);
    expect(ok.differentCount).toBe(3);
    expect(ok.matchingCount).toBe(0);
  });

  it("computes batch format audit, collision rates, and synthetic CSV fixtures accurately", () => {
    const items = makeItems(["PSN-7JNJ5S", "PSN-975397", "PSN-7JNJ5S", "PSN-PK22AR"]);
    const fmt = evaluateFormatBatch(items);
    expect(fmt.totalChecked).toBe(4);
    expect(fmt.validCount).toBe(3);
    expect(fmt.invalidCount).toBe(1);
    expect(fmt.allDigitRejectedCount).toBe(1);

    const col = evaluateLiveCollisions(items, "Live run");
    expect(col.recordsTested).toBe(4);
    expect(col.uniqueCount).toBe(3);
    expect(col.duplicateCount).toBe(1);
    expect(col.collisionRate).toBeCloseTo(0.25);

    expect(FROZEN_PHASE_1E_CRYPTO_BENCHMARK.sampleSize).toBe(100_000);
    expect(FROZEN_PHASE_1E_CRYPTO_BENCHMARK.uniqueCount).toBe(99_996);
    expect(VALID_ALPHA_PSN_SPACE).toBe(1_072_741_824);
    expect(BIRTHDAY_THEORETICAL_CURVE.find((p) => p.sampleSize === 100_000)?.expectedDuplicates).toBeCloseTo(
      4.6609,
      2,
    );

    const synth = createSyntheticVerificationCsv(20);
    expect(synth.csvText.trim().split("\n")).toHaveLength(21);
    expect(synth.csvText).toContain("SYNTST-26-00001");
    expect(synth.uploadFile.classification).toBe("process");
  });
});
