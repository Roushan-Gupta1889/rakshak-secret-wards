import { describe, expect, it } from "vitest";
import type { PolicyResponse, RunSummaryResponse } from "@/api/schemas";
import type { SanitizedRegistryRecord, SanitizedRegistryResult } from "@/lib/sanitizedRegistryParser";
import {
  analyzeReleaseCohorts,
  buildLiveRiskOverview,
  buildRiskFindings,
  getAttackMatrix,
} from "@/lib/riskAnalyticsAnalyzer";

function makeSummary(overrides?: Partial<RunSummaryResponse>): RunSummaryResponse {
  return {
    run_id: "0123456789abcdef",
    created_at: "2026-11-27T00:00:00Z",
    expires_at: "2026-11-27T01:00:00Z",
    status: "completed",
    secret_source: "configured",
    provenance: "LIVE",
    schema_version: "raksha-report/1",
    counts: {
      files_total: 4,
      files_sanitized: 3,
      files_quarantined: 1,
      records_processed: 10,
      identifiers_detected: 25,
      records_linked: 9,
      records_generalized: 4,
      records_suppressed: 1,
      records_quarantined: 1,
    },
    entities: {
      PATIENT_NAME: 12,
      PHONE: 8,
      AADHAAR: 5,
    },
    timing: { seconds: 1.25 },
    resources: { peak_rss_mb: 31.2 },
    files: [
      { input_sha256: "a".repeat(64), output: "sanitized/reg.csv", status: "sanitized", reason: null, size_bytes: 512 },
      { input_sha256: "b".repeat(64), output: null, status: "quarantined", reason: "unsupported_format", size_bytes: 128 },
    ],
    placeholder_summary: {
      provenance: "DERIVED",
      counts: {
        NAME: 12,
        PHONE: 8,
        DISTRICT: 2,
        PIN: 3,
        DOB: 4,
        PSN: 9,
      },
      psn_count: 7,
      all_alpha_psn_valid: true,
    },
    fhir_validation: {
      provenance: "DERIVED",
      bundles_total: 1,
      bundles_valid: 1,
      bundles_invalid: 0,
    },
    cohort_summary: {
      provenance: "DERIVED",
      generalized_district_markers: 2,
      suppressed_pin_markers: 3,
      suppressed_dob_markers: 4,
      suppressed_age_markers: 0,
    },
    ...overrides,
  };
}

function makeRecord(overrides: Partial<SanitizedRegistryRecord>): SanitizedRegistryRecord {
  return {
    recordKey: "f::loc::0",
    index: 0,
    pseudonym: "PSN-7JNJ5S",
    sourceFile: "sanitized/reg.csv",
    loc: "row:0",
    sourceFormat: "CSV",
    recordStatus: "sanitized",
    ageBand: "45-49",
    ageSortValue: 45,
    gender: "Male",
    hospital: "Sanjeevani",
    department: "Medicine",
    clinician: "Dr. Verma",
    diagnoses: ["Essential hypertension"],
    procedures: [],
    medications: ["Amlodipine"],
    observations: [{ test: "BP", value: "130/80" }],
    vitals: ["HR 76"],
    admissionDate: "2026-04-01",
    dischargeDate: "2026-04-05",
    visitOrReportDate: null,
    primaryDate: "2026-04-01",
    district: "Lucknow",
    postalPrefix: "226***",
    redactionMarkers: {},
    clinicalSearchBlob: "",
    parseState: "parsed",
    ...overrides,
  };
}

function makeRegistry(records: SanitizedRegistryRecord[]): SanitizedRegistryResult {
  const uniquePsns = new Set(records.filter((r) => r.pseudonym !== "[NOT_AVAILABLE]").map((r) => r.pseudonym));
  return {
    runId: "0123456789abcdef",
    records,
    facets: {
      diagnoses: ["Essential hypertension", "Rare Rabies"],
      departments: ["Medicine"],
      hospitals: ["Sanjeevani"],
      genders: ["Male", "Female"],
      ageBands: ["45-49"],
    },
    stats: {
      indexTotal: records.length,
      patientRecordsCount: records.filter((r) => r.pseudonym !== "[NOT_AVAILABLE]").length,
      nonPatientExcludedCount: records.filter((r) => r.pseudonym === "[NOT_AVAILABLE]").length,
      distinctPseudonyms: uniquePsns.size,
      filesReferencedCount: 1,
      filesParsedCount: 1,
      filesSkippedOversized: [],
      filesFailedCount: 0,
      safeguardScrubsCount: 0,
    },
  };
}

const POLICY: PolicyResponse = {
  provenance: "LIVE",
  policy_sha256: "f".repeat(64),
  policy: {
    privacy_mode: "adaptive_k_mixed",
    min_group_size: 5,
    age_band_years: 5,
    date_shift_max_days: 180,
  },
};

describe("riskAnalyticsAnalyzer pure computations & provenance", () => {
  it("computes live risk ratios and excludes PSN from placeholder redaction bars", () => {
    const summary = makeSummary();
    const reg = makeRegistry([makeRecord({ index: 0 })]);
    const overview = buildLiveRiskOverview(summary, reg);
    expect(overview).not.toBeNull();
    expect(overview!.generalizationOpsCount).toBe(4);
    expect(overview!.generalizationPerRecord).toBeCloseTo(0.4);
    expect(overview!.suppressionRate).toBeCloseTo(0.1);
    expect(overview!.quarantineRate).toBeCloseTo(0.25);
    expect(overview!.linkedRecordRate).toBeCloseTo(0.9);
    expect(overview!.markerBreakdown.some((m) => m.marker === "[PSN]")).toBe(false);
    expect(overview!.markerBreakdown.find((m) => m.marker === "[DISTRICT]")?.category).toBe(
      "Quasi-Identifier Generalization / Suppression",
    );
    expect(overview!.clinical?.stayDurationIntervals).toBe(1);
    expect(overview!.clinical?.safeguardScrubsCount).toBe(0);
  });

  it("groups release equivalence classes accurately and distinguishes all-QI-masked vs unmasked k=1", () => {
    // 5 identical dense Male 45-49 Lucknow 226*** patients -> k=5 cohort
    const dense = Array.from({ length: 5 }, (_, i) =>
      makeRecord({
        recordKey: `dense-${i}`,
        index: i,
        loc: `row:${i}`,
        pseudonym: `PSN-DENSE${i}`,
      }),
    );

    // 1 unique diagnosis with observable QIs -> rareClinicalExposedCount
    const exposedOutlier = makeRecord({
      recordKey: "out-1",
      index: 5,
      loc: "row:5",
      pseudonym: "PSN-EXPOSD",
      gender: "Male",
      ageBand: "85+",
      district: "Sitapur",
      postalPrefix: null,
      diagnoses: ["Rare Rabies"],
    });

    // 1 unique diagnosis with ALL QIs suppressed -> allQiMaskedCount + rareClinicalMaskedCount
    const maskedOutlier = makeRecord({
      recordKey: "mask-1",
      index: 6,
      loc: "row:6",
      pseudonym: "PSN-MASKED",
      gender: null,
      ageBand: null,
      district: null,
      postalPrefix: null,
      diagnoses: ["Ultra Rare Fever"],
      redactionMarkers: { DISTRICT: 1, PIN: 1, AGE: 1, DOB: 1 },
    });

    const summary = makeSummary();
    const cohort = analyzeReleaseCohorts(summary, makeRegistry([...dense, exposedOutlier, maskedOutlier]), POLICY);

    expect(cohort).not.toBeNull();
    expect(cohort!.minGroupSizeTarget).toBe(5);
    expect(cohort!.linkedProfilesTotal).toBe(7);
    expect(cohort!.satisfiedCohortCount).toBe(5);
    expect(cohort!.singletonUnmaskedCount).toBe(1);
    expect(cohort!.allQiMaskedCount).toBe(1);
    expect(cohort!.rareClinicalExposedCount).toBe(1);
    expect(cohort!.rareClinicalMaskedCount).toBe(1);
    expect(cohort!.highAttentionCohorts.map((c) => c.pseudonym)).toEqual(["PSN-EXPOSD", "PSN-MASKED"]);
  });

  it("maps ATTACKS.md matrix cleanly and marks live oracle scenarios UNAVAILABLE", () => {
    const auditRows = getAttackMatrix("audit-sec-A");
    const baselineRows = getAttackMatrix("baseline-sec-A");
    const a5Audit = auditRows.find((r) => r.code === "A5")!;
    const a5Baseline = baselineRows.find((r) => r.code === "A5")!;
    const a6Audit = auditRows.find((r) => r.code === "A6")!;

    expect(a5Audit.frozen1eRisk).toBe("2.84%");
    expect(a5Baseline.frozen1eRisk).toBe("11.61%");
    expect(a5Audit.liveStatus).toBe("UNAVAILABLE");
    expect(a6Audit.frozen1eRisk).toBe("0.00%");
    expect(a6Audit.liveStatus).toBe("PARTIAL_CRYPTO_LAB");
  });

  it("handles null run gracefully and builds combined derived + frozen findings", () => {
    expect(buildLiveRiskOverview(null, null)).toBeNull();
    expect(analyzeReleaseCohorts(null, null, POLICY)).toBeNull();
    const frozenOnly = buildRiskFindings({ summary: null, cohort: null, overview: null });
    expect(frozenOnly.every((f) => f.provenance === "FROZEN")).toBe(true);
    expect(frozenOnly.length).toBeGreaterThanOrEqual(3);
  });
});
