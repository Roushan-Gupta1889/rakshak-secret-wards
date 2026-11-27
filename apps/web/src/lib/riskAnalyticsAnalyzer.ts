import type { PolicyResponse, RunSummaryResponse } from "@/api/schemas";
import {
  FROZEN_PHASE_1E_BASELINE_SEC_A,
  FROZEN_PROGRESSION_AUDIT_SEC_A,
  type FrozenSecretProfile,
} from "@/data/frozenBenchmarks";
import type { SanitizedRegistryResult } from "@/lib/sanitizedRegistryParser";

export interface LiveEntityStat {
  type: string;
  count: number;
}

export interface LiveMarkerStat {
  marker: string;
  count: number;
  category: "Direct PII Redaction" | "Quasi-Identifier Generalization / Suppression";
}

export interface LiveClinicalSummary {
  linkedProfiles: number;
  unlinkedRecords: number;
  parsedRecords: number;
  diagnosesMentions: number;
  uniqueDiagnosesCount: number;
  medicationsMentions: number;
  observationsCount: number;
  vitalsCount: number;
  proceduresCount: number;
  stayDurationIntervals: number;
  safeguardScrubsCount: number;
}

export interface LiveRiskOverviewMetrics {
  runId: string;
  sampleRecords: number;
  sampleFiles: number;
  generalizationOpsCount: number;
  generalizationPerRecord: number;
  suppressionRate: number;
  quarantineRate: number;
  linkedRecordRate: number;
  entityTotal: number;
  topEntities: LiveEntityStat[];
  markerBreakdown: LiveMarkerStat[];
  clinical: LiveClinicalSummary | null;
}

export interface CohortProfileDiagnostic {
  pseudonym: string;
  qiSignature: string;
  cohortSize: number;
  hasObservableQi: boolean;
  isRareDiagnosis: boolean;
  rareDiagnoses: string[];
  hasDistrictMasked: boolean;
  hasPinMasked: boolean;
  hasDobMasked: boolean;
  hasAgeMasked: boolean;
  recordCount: number;
}

export interface CohortBucketBar {
  bucket: string;
  count: number;
  provenance: "DERIVED";
  description: string;
}

export interface CohortAnalysisResult {
  minGroupSizeTarget: number;
  linkedProfilesTotal: number;
  unlinkedRecordsCount: number;
  singletonUnmaskedCount: number;
  belowTargetUnmaskedCount: number;
  satisfiedCohortCount: number;
  allQiMaskedCount: number;
  rareClinicalExposedCount: number;
  rareClinicalMaskedCount: number;
  observableQiFilesRatio: string;
  oversizedOrFailedFilesCount: number;
  buckets: CohortBucketBar[];
  highAttentionCohorts: CohortProfileDiagnostic[];
  districtMarkers: number;
  pinMarkers: number;
  dobMarkers: number;
  ageMarkers: number;
  villageMarkers: number;
}

export interface AttackCatalogRow {
  code: string;
  name: string;
  adversarySource: string;
  engineControl: string;
  frozen1cRisk: string;
  frozen1dRisk: string;
  frozen1eRisk: string;
  liveStatus: "UNAVAILABLE" | "PARTIAL_CRYPTO_LAB";
  liveStatusReason: string;
}

export interface FrozenAblationPoint {
  strategyKey: string;
  label: string;
  suite: string;
  privacyResistance: number;
  clinicalUtility: number;
  clinicalProbes: number;
  generalizationScore: number;
  a4ReIdRisk: number;
  compositeScore: number;
  recommended: boolean;
  note: string;
}

export interface RiskFindingItem {
  id: string;
  severity: "LOW" | "MODERATE" | "HIGH" | "INFO";
  provenance: "LIVE" | "DERIVED" | "FROZEN" | "UNAVAILABLE";
  title: string;
  evidence: string;
  methodology: string;
  limitation: string;
}

const QI_MARKERS = new Set(["DISTRICT", "PIN", "DOB", "AGE", "VILLAGE", "TEHSIL", "ADDRESS", "LOCALITY", "LANDMARK", "HOUSE"]);

/** Build deterministic live overview indicators strictly from RunSummaryResponse and parsed Registry artifacts. */
export function buildLiveRiskOverview(
  summary: RunSummaryResponse | null,
  registry: SanitizedRegistryResult | null,
): LiveRiskOverviewMetrics | null {
  if (!summary) return null;

  const recDenominator = Math.max(summary.counts.records_processed, 1);
  const fileDenominator = Math.max(summary.counts.files_total, 1);

  const topEntities: LiveEntityStat[] = Object.entries(summary.entities)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 10)
    .map(([type, count]) => ({ type, count }));

  const entityTotal = Object.values(summary.entities).reduce((acc, v) => acc + v, 0);

  const markerBreakdown: LiveMarkerStat[] = Object.entries(summary.placeholder_summary.counts)
    .filter(([k, count]) => k !== "PSN" && count > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 12)
    .map(([marker, count]) => ({
      marker: `[${marker}]`,
      count,
      category: QI_MARKERS.has(marker)
        ? "Quasi-Identifier Generalization / Suppression"
        : "Direct PII Redaction",
    }));

  let clinical: LiveClinicalSummary | null = null;
  if (registry) {
    const uniqueDx = new Set<string>();
    let dxMentions = 0;
    let rxMentions = 0;
    let obsCount = 0;
    let vitalsCount = 0;
    let procCount = 0;
    let stayIntervals = 0;

    for (const r of registry.records) {
      dxMentions += r.diagnoses.length;
      for (const d of r.diagnoses) uniqueDx.add(d.trim().toLowerCase());
      rxMentions += r.medications.length;
      obsCount += r.observations.length;
      vitalsCount += r.vitals.length;
      procCount += r.procedures.length;
      if (r.admissionDate && r.dischargeDate) {
        stayIntervals += 1;
      }
    }

    clinical = {
      linkedProfiles: registry.stats.distinctPseudonyms,
      unlinkedRecords: registry.stats.nonPatientExcludedCount,
      parsedRecords: registry.records.length,
      diagnosesMentions: dxMentions,
      uniqueDiagnosesCount: uniqueDx.size,
      medicationsMentions: rxMentions,
      observationsCount: obsCount,
      vitalsCount,
      proceduresCount: procCount,
      stayDurationIntervals: stayIntervals,
      safeguardScrubsCount: registry.stats.safeguardScrubsCount,
    };
  }

  return {
    runId: summary.run_id,
    sampleRecords: summary.counts.records_processed,
    sampleFiles: summary.counts.files_total,
    generalizationOpsCount: summary.counts.records_generalized,
    generalizationPerRecord: summary.counts.records_generalized / recDenominator,
    suppressionRate: Math.min(1, summary.counts.records_suppressed / recDenominator),
    quarantineRate: Math.min(1, summary.counts.files_quarantined / fileDenominator),
    linkedRecordRate: Math.min(1, summary.counts.records_linked / recDenominator),
    entityTotal,
    topEntities,
    markerBreakdown,
    clinical,
  };
}

/**
 * Analyze in-corpus release k-anonymity equivalence classes over surviving demographic QIs
 * in sanitized outputs (gender, ageBand, district, postalPrefix) alongside clinical rarity.
 */
export function analyzeReleaseCohorts(
  summary: RunSummaryResponse | null,
  registry: SanitizedRegistryResult | null,
  policy: PolicyResponse | null,
): CohortAnalysisResult | null {
  if (!summary || !registry) return null;

  const rawMinGroup = policy?.policy["min_group_size"];
  const minGroupSizeTarget =
    typeof rawMinGroup === "number" && rawMinGroup >= 2 ? rawMinGroup : 5;

  const linkedRecords = registry.records.filter((r) => r.pseudonym !== "[NOT_AVAILABLE]");

  // Aggregate across records per linked patient cluster (matches Profile aggregation model)
  interface AggProfile {
    pseudonym: string;
    genders: Set<string>;
    ageBands: Set<string>;
    districts: Set<string>;
    pinPrefixes: Set<string>;
    diagnoses: Set<string>;
    hasDistrictMasked: boolean;
    hasPinMasked: boolean;
    hasDobMasked: boolean;
    hasAgeMasked: boolean;
    recordCount: number;
  }

  const profiles = new Map<string, AggProfile>();
  const observableFiles = new Set<string>();

  for (const r of linkedRecords) {
    let agg = profiles.get(r.pseudonym);
    if (!agg) {
      agg = {
        pseudonym: r.pseudonym,
        genders: new Set(),
        ageBands: new Set(),
        districts: new Set(),
        pinPrefixes: new Set(),
        diagnoses: new Set(),
        hasDistrictMasked: false,
        hasPinMasked: false,
        hasDobMasked: false,
        hasAgeMasked: false,
        recordCount: 0,
      };
      profiles.set(r.pseudonym, agg);
    }

    agg.recordCount += 1;
    if (r.gender) agg.genders.add(r.gender);
    if (r.ageBand) agg.ageBands.add(r.ageBand);
    if (r.district) agg.districts.add(r.district);
    if (r.postalPrefix) agg.pinPrefixes.add(r.postalPrefix);
    if (r.gender || r.ageBand || r.district || r.postalPrefix) {
      observableFiles.add(r.sourceFile);
    }

    for (const dx of r.diagnoses) {
      const clean = dx.trim();
      if (clean) agg.diagnoses.add(clean);
    }
    if ((r.redactionMarkers.DISTRICT ?? 0) > 0) agg.hasDistrictMasked = true;
    if ((r.redactionMarkers.PIN ?? 0) > 0) agg.hasPinMasked = true;
    if ((r.redactionMarkers.DOB ?? 0) > 0) agg.hasDobMasked = true;
    if ((r.redactionMarkers.AGE ?? 0) > 0) agg.hasAgeMasked = true;
  }

  // Diagnosis document frequency across linked profiles (for small/rare clinical cohort detection)
  const dxProfileDf = new Map<string, number>();
  for (const agg of profiles.values()) {
    for (const dx of agg.diagnoses) {
      const norm = dx.toLowerCase();
      dxProfileDf.set(norm, (dxProfileDf.get(norm) ?? 0) + 1);
    }
  }

  // Equivalence class grouping ONLY across profiles with >= 1 surviving demographic QI
  const cellCounts = new Map<string, number>();
  const profileKeys = new Map<string, { sig: string; observable: boolean }>();

  for (const agg of profiles.values()) {
    const g = agg.genders.size === 1 ? Array.from(agg.genders)[0] : "*";
    const a = agg.ageBands.size > 0 ? Array.from(agg.ageBands).sort()[0] : "*";
    const d = agg.districts.size > 0 ? Array.from(agg.districts).sort()[0] : "*";
    const p = agg.pinPrefixes.size > 0 ? Array.from(agg.pinPrefixes).sort()[0] : "*";
    const observable = g !== "*" || a !== "*" || d !== "*" || p !== "*";
    const sig = `${g} | ${a} | ${d} | ${p}`;
    profileKeys.set(agg.pseudonym, { sig, observable });
    if (observable) {
      cellCounts.set(sig, (cellCounts.get(sig) ?? 0) + 1);
    }
  }

  let singletonUnmaskedCount = 0;
  let belowTargetUnmaskedCount = 0;
  let satisfiedCohortCount = 0;
  let allQiMaskedCount = 0;
  let rareClinicalExposedCount = 0;
  let rareClinicalMaskedCount = 0;

  const diagnostics: CohortProfileDiagnostic[] = [];

  for (const agg of profiles.values()) {
    const info = profileKeys.get(agg.pseudonym)!;
    const kSize = info.observable ? (cellCounts.get(info.sig) ?? 1) : 0;

    if (!info.observable) {
      allQiMaskedCount += 1;
    } else if (kSize === 1) {
      singletonUnmaskedCount += 1;
    } else if (kSize < minGroupSizeTarget) {
      belowTargetUnmaskedCount += 1;
    } else {
      satisfiedCohortCount += 1;
    }

    const rareDx = Array.from(agg.diagnoses).filter(
      (dx) => (dxProfileDf.get(dx.toLowerCase()) ?? 0) === 1 && profiles.size > 1,
    );
    const isRareDiagnosis = rareDx.length > 0;
    if (isRareDiagnosis) {
      if (info.observable && kSize < minGroupSizeTarget) {
        rareClinicalExposedCount += 1;
      } else {
        rareClinicalMaskedCount += 1;
      }
    }

    if ((info.observable && kSize < minGroupSizeTarget) || isRareDiagnosis) {
      diagnostics.push({
        pseudonym: agg.pseudonym,
        qiSignature: info.observable ? info.sig : "All Demographic QIs Masked (*)",
        cohortSize: kSize,
        hasObservableQi: info.observable,
        isRareDiagnosis,
        rareDiagnoses: rareDx.slice(0, 3),
        hasDistrictMasked: agg.hasDistrictMasked,
        hasPinMasked: agg.hasPinMasked,
        hasDobMasked: agg.hasDobMasked,
        hasAgeMasked: agg.hasAgeMasked,
        recordCount: agg.recordCount,
      });
    }
  }

  diagnostics.sort((a, b) => {
    const aPriority = (a.isRareDiagnosis && a.hasObservableQi ? 0 : 1) - (b.isRareDiagnosis && b.hasObservableQi ? 0 : 1);
    if (aPriority !== 0) return aPriority;
    return a.cohortSize - b.cohortSize || a.pseudonym.localeCompare(b.pseudonym);
  });

  const phCounts = summary.placeholder_summary.counts;

  return {
    minGroupSizeTarget,
    linkedProfilesTotal: profiles.size,
    unlinkedRecordsCount: registry.stats.nonPatientExcludedCount,
    singletonUnmaskedCount,
    belowTargetUnmaskedCount,
    satisfiedCohortCount,
    allQiMaskedCount,
    rareClinicalExposedCount,
    rareClinicalMaskedCount,
    observableQiFilesRatio: `${observableFiles.size} / ${Math.max(registry.stats.filesParsedCount, 1)} parsed files`,
    oversizedOrFailedFilesCount:
      registry.stats.filesSkippedOversized.length + registry.stats.filesFailedCount,
    buckets: [
      {
        bucket: "Unmasked k = 1",
        count: singletonUnmaskedCount,
        provenance: "DERIVED",
        description: "Unique in this sanitized release over surviving demographic QIs.",
      },
      {
        bucket: `Unmasked 2 ≤ k < ${minGroupSizeTarget}`,
        count: belowTargetUnmaskedCount,
        provenance: "DERIVED",
        description: `Below policy min_group_size=${minGroupSizeTarget} within the active batch.`,
      },
      {
        bucket: `Cohort k ≥ ${minGroupSizeTarget}`,
        count: satisfiedCohortCount,
        provenance: "DERIVED",
        description: `Meets k ≥ ${minGroupSizeTarget} inside the active sanitized corpus.`,
      },
      {
        bucket: "All-QI Masked",
        count: allQiMaskedCount,
        provenance: "DERIVED",
        description: "Gender/Age/District/PIN suppressed or absent from parsed QI fields.",
      },
    ],
    highAttentionCohorts: diagnostics.slice(0, 20),
    districtMarkers: summary.cohort_summary.generalized_district_markers,
    pinMarkers: summary.cohort_summary.suppressed_pin_markers,
    dobMarkers: summary.cohort_summary.suppressed_dob_markers,
    ageMarkers: summary.cohort_summary.suppressed_age_markers,
    villageMarkers: phCounts.VILLAGE ?? 0,
  };
}

export function getAttackMatrix(profile: FrozenSecretProfile): AttackCatalogRow[] {
  const m1c = FROZEN_PROGRESSION_AUDIT_SEC_A[0];
  const m1d = FROZEN_PROGRESSION_AUDIT_SEC_A[1];
  const m1eAudit = FROZEN_PROGRESSION_AUDIT_SEC_A[2];
  const active1e = profile === "audit-sec-A" ? m1eAudit : FROZEN_PHASE_1E_BASELINE_SEC_A;

  return [
    {
      code: "A1",
      name: "Direct Exposure",
      adversarySource: "Direct IDs & normalized full patient names in sanitized/ or side channels",
      engineControl: "Multilingual NER + Devanagari/Hinglish gazetteer + filename/JSON-key/base64 scrub",
      frozen1cRisk: `${(m1c.a1 * 100).toFixed(2)}%`,
      frozen1dRisk: `${(m1d.a1 * 100).toFixed(2)}%`,
      frozen1eRisk: `${(active1e.a1 * 100).toFixed(2)}%`,
      liveStatus: "UNAVAILABLE",
      liveStatusReason: "Requires ground-truth PII keys per record (absent from uploaded user files).",
    },
    {
      code: "A2 / A3",
      name: "Sweeney-Style Registry Linkage",
      adversarySource: "Electoral-roll attacker/registry.csv (4–5× population) + leaked contacts",
      engineControl: "Adaptive k-anonymity widening (5→10→20 yr), 3-digit PIN / [PIN], District coarsening",
      frozen1cRisk: `${(m1c.a23 * 100).toFixed(2)}%`,
      frozen1dRisk: `${(m1d.a23 * 100).toFixed(2)}%`,
      frozen1eRisk: `${(active1e.a23 * 100).toFixed(2)}%`,
      liveStatus: "UNAVAILABLE",
      liveStatusReason: "Requires hidden organizer electoral roll (attacker/registry.csv).",
    },
    {
      code: "A4",
      name: "Profile Aggregation Re-ID",
      adversarySource: "Pooled quasi-identifiers joined by shared PSN-XXXXXX / patient_ref",
      engineControl: "Adaptive hierarchy targeting min_group_size=5 & extreme-age >=80 widening",
      frozen1cRisk: `${(m1c.a4 * 100).toFixed(2)}%`,
      frozen1dRisk: `${(m1d.a4 * 100).toFixed(2)}%`,
      frozen1eRisk: `${(active1e.a4 * 100).toFixed(2)}%`,
      liveStatus: "UNAVAILABLE",
      liveStatusReason: "Requires population registry matching to compute re-ID confidence >= 0.5.",
    },
    {
      code: "A5",
      name: "Targeted Known-Facts & Shift Recovery",
      adversarySource: "attacker/known_facts.jsonl (visit date, rare condition ×8 weight, hospital, LOS)",
      engineControl: "Per-patient ±180d HMAC date shift (blocks global unshift) + rare-cohort suppression",
      frozen1cRisk: `${(m1c.a5 * 100).toFixed(2)}%`,
      frozen1dRisk: `${(m1d.a5 * 100).toFixed(2)}%`,
      frozen1eRisk: `${(active1e.a5 * 100).toFixed(2)}%`,
      liveStatus: "UNAVAILABLE",
      liveStatusReason: "Requires organizer known_facts.jsonl + dev/truth patient mapping.",
    },
    {
      code: "A6",
      name: "Pseudonym Dictionary Inversion",
      adversarySource: "Original UHID/Aadhaar/Phone/Name transformed (MD5/SHA/base64/digits)",
      engineControl: "Keyed HMAC-SHA256 + Phase 1E rejection sampling (no all-digit PSN-\\d{6})",
      frozen1cRisk: `${(m1c.a6 * 100).toFixed(2)}%`,
      frozen1dRisk: `${(m1d.a6 * 100).toFixed(2)}%`,
      frozen1eRisk: `${(active1e.a6 * 100).toFixed(2)}%`,
      liveStatus: "PARTIAL_CRYPTO_LAB",
      liveStatusReason: "Crockford non-numeric PSN format is LIVE-checked in Lab; original-ID dictionary oracle is UNAVAILABLE.",
    },
    {
      code: "A7",
      name: "Cross-Release Unlinkability",
      adversarySource: "Second independent release sanitized with distinct RAKSHA_SECRET",
      engineControl: "Secret-keyed HMAC pseudonyms & per-secret ±180d date shifts",
      frozen1cRisk: `${(m1c.a7 * 100).toFixed(2)}%`,
      frozen1dRisk: `${(m1d.a7 * 100).toFixed(2)}%`,
      frozen1eRisk: `${(active1e.a7 * 100).toFixed(2)}%`,
      liveStatus: "PARTIAL_CRYPTO_LAB",
      liveStatusReason: "Cross-secret PSN unlinkability runs LIVE in Unlinkability Lab; date-shift oracle on hidden dev corpus is FROZEN.",
    },
  ];
}

// Verified from ablate_1d_results.json + audit_1d_report_data.json + Phase 1E frozen report
export const FROZEN_ABLATION_FRONTIER: FrozenAblationPoint[] = [
  {
    strategyKey: "base",
    label: "Base (No k-Anon · 1C)",
    suite: "ablate_1d",
    privacyResistance: 75.25,
    clinicalUtility: 96.17,
    clinicalProbes: 100.0,
    generalizationScore: 73.47,
    a4ReIdRisk: 77.08,
    compositeScore: 92.63,
    recommended: false,
    note: "Keeps exact districts & 5-yr bands; leaves outlier patients (PT00035/PT00046) at 100% A4 re-ID.",
  },
  {
    strategyKey: "adaptive_district_keep",
    label: "Adaptive (Keep District)",
    suite: "ablate_1d",
    privacyResistance: 90.69,
    clinicalUtility: 93.16,
    clinicalProbes: 100.0,
    generalizationScore: 43.38,
    a4ReIdRisk: 16.67,
    compositeScore: 95.89,
    recommended: false,
    note: "Widens age bands for rare cohorts while keeping district names; traps drop to 5–9%, A4 remains 16.7%.",
  },
  {
    strategyKey: "k_global_dob_sup_5yr",
    label: "Global k (DOB Masked)",
    suite: "ablate_1d",
    privacyResistance: 94.84,
    clinicalUtility: 92.37,
    clinicalProbes: 99.32,
    generalizationScore: 37.87,
    a4ReIdRisk: 2.08,
    compositeScore: 96.74,
    recommended: false,
    note: "Suppresses district/PIN globally whenever local cell < 5; higher A5 targeted exposure (20.7%).",
  },
  {
    strategyKey: "adaptive_k_dob_sup",
    label: "Adaptive k (DOB Masked)",
    suite: "ablate_1d",
    privacyResistance: 95.31,
    clinicalUtility: 91.91,
    clinicalProbes: 99.32,
    generalizationScore: 33.20,
    a4ReIdRisk: 2.08,
    compositeScore: 96.77,
    recommended: false,
    note: "Drops all DOBs globally plus hierarchical QI widening; preserves 99.32% clinical probes.",
  },
  {
    strategyKey: "adaptive_k_mixed",
    label: "Adaptive k Mixed (Phase 1D/1E Policy)",
    suite: "ablate_1d / phase-1e-v1",
    privacyResistance: 98.58,
    clinicalUtility: 91.84,
    clinicalProbes: 99.32,
    generalizationScore: 32.57,
    a4ReIdRisk: 2.08,
    compositeScore: 97.57,
    recommended: true,
    note: "Active raksha.toml policy: keeps fine QIs for dense clusters, suppresses QIs for k < 5 / rare / >=80y, + Crockford alpha PSN (A6=0%).",
  },
  {
    strategyKey: "k_band20_rare_sup",
    label: "Uniform 20-yr Band + Rare Sup.",
    suite: "ablate_1d",
    privacyResistance: 96.62,
    clinicalUtility: 91.53,
    clinicalProbes: 99.32,
    generalizationScore: 29.41,
    a4ReIdRisk: 2.08,
    compositeScore: 97.02,
    recommended: false,
    note: "Forces 20-yr bands globally, losing age stratification fidelity on dense cohorts.",
  },
];

export const FROZEN_DISTRICT_PROBE_AUDIT = {
  totalClinicalProbes: 4855,
  retainedIn1c: 4855,
  retainedIn1dAnd1e: 4763,
  difference: 92,
  diagnosisProbes: "237 / 237 (100%)",
  icdCodeProbes: "268 / 268 (100%)",
  medicationProbes: "595 / 595 (100%)",
  doseAndFreqProbes: "788 / 788 (100%)",
  labAndVitalProbes: "1,300 / 1,300 (100%)",
  generalizedCategory: "92 / 93 district mentions generalized to [DISTRICT] across 4 CSV/TSV files",
};

/** Generate human-readable findings strictly bounded to verified LIVE/DERIVED/FROZEN facts without PII. */
export function buildRiskFindings({
  summary,
  cohort,
  overview,
}: {
  summary: RunSummaryResponse | null;
  cohort: CohortAnalysisResult | null;
  overview: LiveRiskOverviewMetrics | null;
}): RiskFindingItem[] {
  const items: RiskFindingItem[] = [];

  if (summary && overview && cohort) {
    if (cohort.rareClinicalExposedCount > 0) {
      items.push({
        id: "live-rare-exposed",
        severity: "MODERATE",
        provenance: "DERIVED",
        title: `${cohort.rareClinicalExposedCount} linked profile(s) combine a batch-unique diagnosis with surviving demographic QIs`,
        evidence: `${cohort.highAttentionCohorts
          .filter((c) => c.isRareDiagnosis && c.hasObservableQi)
          .slice(0, 4)
          .map((c) => c.pseudonym)
          .join(", ")} carry unique diagnosis strings alongside surviving QIs inside run ${summary.run_id.slice(0, 8)} (k < ${cohort.minGroupSizeTarget}).`,
        methodology: "Document frequency computed across linked patient profiles in sanitized outputs; demographic QI signature constructed strictly from gender, ageBand, district, and 3-digit PIN.",
        limitation: "When uploaded batch size P is small (< 20 patients), common conditions and cohorts naturally appear rare relative to the batch rather than the population.",
      });
    } else if (cohort.linkedProfilesTotal > 0) {
      items.push({
        id: "live-rare-clean",
        severity: "LOW",
        provenance: "DERIVED",
        title: "Zero batch-unique clinical diagnoses remain paired with unmasked demographic QIs",
        evidence: `${cohort.linkedProfilesTotal} linked profile(s) checked (${cohort.rareClinicalMaskedCount} rare profile(s) had QIs masked).`,
        methodology: "Aggregated profile-level check across parsed sanitized CSV/TSV/JSON/FHIR/TXT outputs.",
        limitation: "Release-level equivalence does not substitute for population electoral-roll evaluation.",
      });
    }

    if (cohort.singletonUnmaskedCount > 0) {
      items.push({
        id: "live-release-singletons",
        severity: cohort.linkedProfilesTotal >= cohort.minGroupSizeTarget * 3 ? "MODERATE" : "INFO",
        provenance: "DERIVED",
        title: `${cohort.singletonUnmaskedCount} of ${cohort.linkedProfilesTotal} linked profiles are unique (k=1) inside this batch`,
        evidence: `Observable QI fields span ${cohort.observableQiFilesRatio}; Stage 1 generalized ${cohort.districtMarkers} [DISTRICT], ${cohort.pinMarkers} [PIN], ${cohort.dobMarkers} [DOB], and ${cohort.ageMarkers} [AGE] tokens across ${summary.counts.records_generalized} records.`,
        methodology: "Equivalence classes grouped on exact tuple (gender, ageBand, district, postalPrefix) excluding profiles where all four QIs are generalized/absent.",
        limitation: `Small uploaded batches cannot achieve corpus k >= ${cohort.minGroupSizeTarget} without suppressing every demographic column; policy threshold applies at corpus ingestion scale.`,
      });
    }

    if (summary.counts.files_quarantined > 0) {
      items.push({
        id: "live-quarantine",
        severity: "LOW",
        provenance: "LIVE",
        title: `${summary.counts.files_quarantined} unsupported/malformed input file(s) quarantined safely`,
        evidence: `${summary.counts.files_sanitized}/${summary.counts.files_total} files sanitized; zero malformed files copied to sanitized/.`,
        methodology: "Direct count reported by isolated Phase 1E CLI in report.json.",
        limitation: "Binary/malformed inputs are withheld from sanitized research exports to prevent unredacted leakage.",
      });
    }
  }

  // Verified Frozen Engine Findings (always separated via FROZEN badge)
  items.push(
    {
      id: "frozen-trap-mitigation",
      severity: "LOW",
      provenance: "FROZEN",
      title: "Adaptive k-anonymity cuts extreme-age/rare-disease Re-ID Trap risk from 100% to 0.85%",
      evidence: "In Phase 1C (base), rare trap patients PT00035 (96M, Rabies) & PT00046 (97M, Visceral leishmaniasis) scored 1.000 probability; Phase 1D/1E adaptive hierarchy widened QIs so candidate pools expanded from 1 to 118 (prob 0.0085).",
      methodology: "Local attacker simulator (eval_arena.py) executed against Secret-Wards-ToolKit/dev registry + known_facts under audit-sec-A.",
      limitation: "Verified on practice dev corpus under local simulator; live organizer hidden evaluation seed is confidential.",
    },
    {
      id: "frozen-92-district-audit",
      severity: "INFO",
      provenance: "FROZEN",
      title: "Phase 1D/1E utility trade-off: 92 [DISTRICT] generalizations vs. 0 clinical losses",
      evidence: "Clinical probes measured 4,763 / 4,855 (98.1%, utility clinical_probes=0.9932): all 237 diagnoses, 268 ICD codes, 595 medications, 788 doses/frequencies, and 1,300 labs/vitals stayed 100% intact; the 92 difference consists solely of district strings generalized to [DISTRICT] for sparse k < 5 cohorts.",
      methodology: "Field-by-field diff in audit_1d_report_data.json comparing Phase 1C vs Phase 1D/1E outputs across all 200 LF dev files.",
      limitation: "Demonstrates why selective QI widening preserves clinical utility without destructive wipeout.",
    },
    {
      id: "frozen-a5-a6",
      severity: "INFO",
      provenance: "FROZEN",
      title: "Per-secret A5 variance & Phase 1E elimination of PSN numeric collision (A6 = 0.0%)",
      evidence: "Phase 1E eliminated the 1-in-1,074 all-digit PSN collision (PSN-975397 on audit-sec-A: A6 0.0179 -> 0.0000). Across secret seeds, A5 targeted risk measures 2.84% (audit-sec-A) vs 11.61% (baseline-sec-A) due to random shifted-date coincidences across broadened gender pools.",
      methodology: "eval_arena.py comparison across audit-sec-A and baseline-sec-A + test_phase1e.py 100k key verification.",
      limitation: "Cannot run A2–A5 attacks against live uploaded batches because Phase 2A has no electoral-roll registry or known_facts oracle.",
    },
  );

  return items;
}
