import type { SanitizedRecordItem } from "@/api/schemas";
import type { SelectedUploadFile } from "@/config/backendContract";

export const CROCKFORD_BASE32_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const EXCLUDED_CROCKFORD_LETTERS = ["I", "L", "O", "U"] as const;
export const TOTAL_RAW_SPACE = 32 ** 6; // 1,073,741,824
export const NUMERIC_ONLY_SUBSPACE = 10 ** 6; // 1,000,000 rejected in Phase 1E
export const VALID_ALPHA_PSN_SPACE = TOTAL_RAW_SPACE - NUMERIC_ONLY_SUBSPACE; // 1,072,741,824

const VALID_ALPHA_PSN_RX = /^PSN-[0-9A-HJKMNPQRSTVWXYZ]{6}$/;
const CROCKFORD_SET = new Set(CROCKFORD_BASE32_ALPHABET.split(""));
const CROCKFORD_ALPHA_SET = new Set("ABCDEFGHJKMNPQRSTVWXYZ".split(""));

export type PseudonymFormatErrorReason =
  | "EMPTY"
  | "INVALID_PREFIX"
  | "INVALID_LENGTH"
  | "INVALID_CHARSET"
  | "ALL_DIGIT_NUMERIC_COLLISION";

export interface PseudonymValidationResult {
  input: string;
  valid: boolean;
  prefixOk: boolean;
  lengthOk: boolean;
  charsetOk: boolean;
  hasAlphaChar: boolean;
  reasons: PseudonymFormatErrorReason[];
}

export interface ComparisonPairSample {
  loc: string;
  psnA: string;
  psnB: string;
  equal: boolean;
}

export interface DeterminismReport {
  status: "VERIFIED" | "FAILED" | "BLOCKED";
  blockReason?: string;
  pairCount: number;
  matchingCount: number;
  mismatchCount: number;
  runAId?: string;
  runBId?: string;
  samples: ComparisonPairSample[];
}

export interface CrossSecretReport {
  status: "VERIFIED" | "WARNING" | "FAILED";
  pairCount: number;
  matchingCount: number;
  differentCount: number;
  runAId: string;
  runCId: string;
  samples: ComparisonPairSample[];
}

export interface FormatValidationReport {
  totalChecked: number;
  validCount: number;
  invalidCount: number;
  allDigitRejectedCount: number;
  failures: PseudonymValidationResult[];
  sampleValid: string[];
}

export interface LiveCollisionReport {
  recordsTested: number;
  uniqueCount: number;
  duplicateCount: number;
  collisionRate: number;
  expectedBirthdayCollisions: number;
  sourceLabel: string;
}

export interface FrozenPhase1ECryptoBenchmark {
  provenance: "FROZEN";
  suite: string;
  sampleSize: number;
  uniqueCount: number;
  duplicateCount: number;
  collisionRate: number;
  expectedBirthdayPairs: number;
  allAlphaValidCount: number;
  allDigitTriggersRemapped: number;
  firstCharMaxDeviation: number;
  crossSecretPairsTested: number;
  crossSecretMatches: number;
}

export const FROZEN_PHASE_1E_CRYPTO_BENCHMARK: FrozenPhase1ECryptoBenchmark = {
  provenance: "FROZEN",
  suite: "test_phase1e.py (Pseudonym Invariants)",
  sampleSize: 100_000,
  uniqueCount: 99_996,
  duplicateCount: 4,
  collisionRate: 4 / 100_000,
  expectedBirthdayPairs: (100_000 * 99_999) / (2 * VALID_ALPHA_PSN_SPACE),
  allAlphaValidCount: 100_000,
  allDigitTriggersRemapped: 10,
  firstCharMaxDeviation: 0.037,
  crossSecretPairsTested: 10_000,
  crossSecretMatches: 0,
};

export interface BirthdayCurvePoint {
  sampleSize: number;
  expectedDuplicates: number;
  collisionProbabilityPct: number;
}

export const BIRTHDAY_THEORETICAL_CURVE: BirthdayCurvePoint[] = [
  100, 1_000, 5_000, 10_000, 25_000, 50_000, 100_000, 150_000, 200_000,
].map((n) => {
  const expected = (n * (n - 1)) / (2 * VALID_ALPHA_PSN_SPACE);
  const prob = (1 - Math.exp(-expected)) * 100;
  return {
    sampleSize: n,
    expectedDuplicates: Number(expected.toFixed(4)),
    collisionProbabilityPct: Number(prob.toFixed(2)),
  };
});

export function validatePseudonymFormat(rawInput: string): PseudonymValidationResult {
  const input = rawInput.trim();
  const reasons: PseudonymFormatErrorReason[] = [];

  if (!input) {
    return {
      input,
      valid: false,
      prefixOk: false,
      lengthOk: false,
      charsetOk: false,
      hasAlphaChar: false,
      reasons: ["EMPTY"],
    };
  }

  const prefixOk = input.startsWith("PSN-");
  if (!prefixOk) reasons.push("INVALID_PREFIX");

  const suffix = prefixOk ? input.slice(4) : input;
  const lengthOk = input.length === 10 && suffix.length === 6;
  if (!lengthOk) reasons.push("INVALID_LENGTH");

  const charsetOk =
    suffix.length > 0 && suffix.split("").every((ch) => CROCKFORD_SET.has(ch));
  if (!charsetOk) reasons.push("INVALID_CHARSET");

  const hasAlphaChar = suffix.split("").some((ch) => CROCKFORD_ALPHA_SET.has(ch));
  if (prefixOk && lengthOk && charsetOk && !hasAlphaChar) {
    reasons.push("ALL_DIGIT_NUMERIC_COLLISION");
  }

  const valid =
    reasons.length === 0 && VALID_ALPHA_PSN_RX.test(input) && hasAlphaChar;

  return {
    input,
    valid,
    prefixOk,
    lengthOk,
    charsetOk,
    hasAlphaChar,
    reasons,
  };
}

const SYNTHETIC_FIRST_NAMES = [
  "Aarav",
  "Bhavna",
  "Chetan",
  "Deepak",
  "Esha",
  "Farhan",
  "Gaurav",
  "Heena",
  "Ishaan",
  "Jaya",
  "Karan",
  "Lata",
  "Manish",
  "Neha",
  "Omkar",
  "Pooja",
  "Qasim",
  "Ritu",
  "Sagar",
  "Tara",
] as const;

const SYNTHETIC_LAST_NAMES = [
  "Agarwal",
  "Bhatia",
  "Chauhan",
  "Deshmukh",
  "Dwivedi",
  "Garg",
  "Hegde",
  "Joshi",
  "Kapoor",
  "Kulkarni",
  "Malhotra",
  "Nair",
  "Pandey",
  "Qureshi",
  "Rathore",
  "Saxena",
  "Tiwari",
  "Upadhyay",
  "Verma",
  "Yadav",
] as const;

export function createSyntheticVerificationCsv(rowCount: 20 | 40 = 20): {
  csvText: string;
  uploadFile: SelectedUploadFile;
  sampleKeysSummary: string[];
} {
  const lines = ["mrn,patient_name,age,sex,diagnosis"];
  const sampleKeysSummary: string[] = [];

  for (let i = 0; i < rowCount; i++) {
    const first = SYNTHETIC_FIRST_NAMES[i % SYNTHETIC_FIRST_NAMES.length];
    const last =
      SYNTHETIC_LAST_NAMES[(Math.floor(i / SYNTHETIC_FIRST_NAMES.length) + i) % SYNTHETIC_LAST_NAMES.length];
    const mrn = `SYNTST-26-${String(i + 1).padStart(5, "0")}`;
    const sex = i % 2 === 0 ? "M" : "F";
    const age = 22 + (i % 55);
    const diag = `Synthetic_Condition_${(i % 5) + 1}`;
    lines.push(`${mrn},${first} ${last},${age},${sex},${diag}`);
    if (sampleKeysSummary.length < 4) {
      sampleKeysSummary.push(`MRN:${mrn}|N:${first.toLowerCase()}+${last.toLowerCase()}`);
    }
  }

  const csvText = `${lines.join("\n")}\n`;
  const file = new File([csvText], "synthetic_unlinkability_fixture.csv", {
    type: "text/csv",
  });

  return {
    csvText,
    sampleKeysSummary,
    uploadFile: {
      id: `synthetic_unlinkability_fixture.csv::${rowCount}`,
      file,
      relPath: "synthetic_unlinkability_fixture.csv",
      extension: ".csv",
      sizeBytes: file.size,
      classification: "process",
    },
  };
}

function indexByLoc(items: SanitizedRecordItem[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const item of items) {
    if (item.patient && item.patient.trim()) {
      map.set(`${item.file}::${item.loc}`, item.patient.trim());
    }
  }
  return map;
}

export function evaluateDeterminism(opts: {
  runAId: string;
  runBId: string;
  runAItems: SanitizedRecordItem[];
  runBItems: SanitizedRecordItem[];
}): DeterminismReport {
  const mapA = indexByLoc(opts.runAItems);
  const mapB = indexByLoc(opts.runBItems);

  const samples: ComparisonPairSample[] = [];
  let matchingCount = 0;
  let mismatchCount = 0;

  for (const [key, psnA] of mapA.entries()) {
    const psnB = mapB.get(key) ?? "[MISSING]";
    const equal = psnA === psnB;
    if (equal) matchingCount += 1;
    else mismatchCount += 1;
    if (samples.length < 12) {
      samples.push({ loc: key.split("::")[1] ?? key, psnA, psnB, equal });
    }
  }

  const pairCount = mapA.size;
  return {
    status: pairCount > 0 && mismatchCount === 0 && mapA.size === mapB.size ? "VERIFIED" : "FAILED",
    pairCount,
    matchingCount,
    mismatchCount: mismatchCount + Math.max(0, mapB.size - mapA.size),
    runAId: opts.runAId,
    runBId: opts.runBId,
    samples,
  };
}

export function evaluateCrossSecretUnlinkability(opts: {
  runAId: string;
  runCId: string;
  runAItems: SanitizedRecordItem[];
  runCItems: SanitizedRecordItem[];
}): CrossSecretReport {
  const mapA = indexByLoc(opts.runAItems);
  const mapC = indexByLoc(opts.runCItems);

  const samples: ComparisonPairSample[] = [];
  let matchingCount = 0;
  let differentCount = 0;

  for (const [key, psnA] of mapA.entries()) {
    const psnC = mapC.get(key) ?? "[MISSING]";
    const equal = psnA === psnC;
    if (equal) matchingCount += 1;
    else differentCount += 1;
    if (samples.length < 12) {
      samples.push({ loc: key.split("::")[1] ?? key, psnA, psnB: psnC, equal });
    }
  }

  const pairCount = mapA.size;
  return {
    status: pairCount > 0 && matchingCount === 0 ? "VERIFIED" : matchingCount <= 1 && pairCount > 0 ? "WARNING" : "FAILED",
    pairCount,
    matchingCount,
    differentCount,
    runAId: opts.runAId,
    runCId: opts.runCId,
    samples,
  };
}

export function evaluateFormatBatch(items: SanitizedRecordItem[]): FormatValidationReport {
  const seen = new Set<string>();
  const failures: PseudonymValidationResult[] = [];
  const sampleValid: string[] = [];
  let validCount = 0;
  let invalidCount = 0;
  let allDigitRejectedCount = 0;

  for (const item of items) {
    if (!item.patient) continue;
    const res = validatePseudonymFormat(item.patient);
    if (res.valid) {
      validCount += 1;
      if (!seen.has(res.input) && sampleValid.length < 12) {
        seen.add(res.input);
        sampleValid.push(res.input);
      }
    } else {
      invalidCount += 1;
      if (res.reasons.includes("ALL_DIGIT_NUMERIC_COLLISION")) {
        allDigitRejectedCount += 1;
      }
      if (failures.length < 12) failures.push(res);
    }
  }

  return {
    totalChecked: validCount + invalidCount,
    validCount,
    invalidCount,
    allDigitRejectedCount,
    failures,
    sampleValid,
  };
}

export function evaluateLiveCollisions(
  items: SanitizedRecordItem[],
  sourceLabel: string,
): LiveCollisionReport {
  const psns = items
    .map((r) => r.patient?.trim() ?? "")
    .filter((p) => p.length > 0);
  const uniqueSet = new Set(psns);
  const recordsTested = psns.length;
  const uniqueCount = uniqueSet.size;
  const duplicateCount = Math.max(0, recordsTested - uniqueCount);
  const collisionRate = recordsTested > 0 ? duplicateCount / recordsTested : 0;
  const expectedBirthdayCollisions =
    recordsTested > 1
      ? (recordsTested * (recordsTested - 1)) / (2 * VALID_ALPHA_PSN_SPACE)
      : 0;

  return {
    recordsTested,
    uniqueCount,
    duplicateCount,
    collisionRate,
    expectedBirthdayCollisions,
    sourceLabel,
  };
}
