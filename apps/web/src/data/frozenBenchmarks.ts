export type FrozenSecretProfile = "audit-sec-A" | "baseline-sec-A";

export interface FrozenMilestoneRecord {
  tag: string;
  commit: string;
  label: string;
  provenance: "FROZEN";
  evaluator: string;
  secretContext: string;
  total: number;
  detection: number;
  identity: number;
  privacy: number;
  utility: number;
  a1: number;
  a23: number;
  a4: number;
  a5: number;
  a6: number;
  a7: number;
  trapPt35: number;
  trapPt46: number;
  clinicalProbes: number;
  fhirValid: string;
  chaosPass: string;
}

export const FROZEN_PROGRESSION_AUDIT_SEC_A: FrozenMilestoneRecord[] = [
  {
    tag: "phase-1c-v1",
    commit: "5de837a",
    label: "Phase 1C (Detection & Linking)",
    provenance: "FROZEN",
    evaluator: "eval_arena.py (local attacker simulator)",
    secretContext: "audit-sec-A / audit-sec-C",
    total: 92.21,
    detection: 1.0,
    identity: 0.9723,
    privacy: 0.7356,
    utility: 0.9617,
    a1: 0.0,
    a23: 0.1555,
    a4: 0.7708,
    a5: 0.3571,
    a6: 0.0179,
    a7: 0.0,
    trapPt35: 1.0,
    trapPt46: 1.0,
    clinicalProbes: 1.0,
    fhirValid: "19 / 19",
    chaosPass: "14 / 14",
  },
  {
    tag: "phase-1d-v1",
    commit: "9fd93f0",
    label: "Phase 1D (Adaptive k-Anonymity)",
    provenance: "FROZEN",
    evaluator: "eval_arena.py (local attacker simulator)",
    secretContext: "audit-sec-A / audit-sec-C",
    total: 97.53,
    detection: 0.9986,
    identity: 0.9723,
    privacy: 0.984,
    utility: 0.9184,
    a1: 0.0,
    a23: 0.0198,
    a4: 0.0208,
    a5: 0.0284,
    a6: 0.0179,
    a7: 0.0,
    trapPt35: 0.0085,
    trapPt46: 0.0085,
    clinicalProbes: 0.9932,
    fhirValid: "19 / 19",
    chaosPass: "14 / 14",
  },
  {
    tag: "phase-1e-v1",
    commit: "b5c258a",
    label: "Phase 1E (Alpha-PSN Hardening)",
    provenance: "FROZEN",
    evaluator: "eval_arena.py (local attacker simulator)",
    secretContext: "audit-sec-A / audit-sec-C",
    total: 97.57,
    detection: 0.9986,
    identity: 0.9723,
    privacy: 0.9858,
    utility: 0.9184,
    a1: 0.0,
    a23: 0.0198,
    a4: 0.0208,
    a5: 0.0284,
    a6: 0.0,
    a7: 0.0,
    trapPt35: 0.0085,
    trapPt46: 0.0085,
    clinicalProbes: 0.9932,
    fhirValid: "19 / 19",
    chaosPass: "14 / 14",
  },
];

export const FROZEN_PHASE_1E_BASELINE_SEC_A: FrozenMilestoneRecord = {
  tag: "phase-1e-v1",
  commit: "b5c258a",
  label: "Phase 1E (baseline-sec-A context)",
  provenance: "FROZEN",
  evaluator: "eval_arena.py (local attacker simulator)",
  secretContext: "baseline-sec-A / baseline-sec-C",
  total: 97.13,
  detection: 0.9986,
  identity: 0.9723,
  privacy: 0.9682,
  utility: 0.9184,
  a1: 0.0,
  a23: 0.0198,
  a4: 0.0208,
  a5: 0.1161,
  a6: 0.0,
  a7: 0.0,
  trapPt35: 0.0085,
  trapPt46: 0.0085,
  clinicalProbes: 0.9932,
  fhirValid: "19 / 19",
  chaosPass: "14 / 14",
};

export interface FrozenCheckLedgerRow {
  suite: string;
  provenance: "FROZEN";
  evaluatorType: "Official ToolKit" | "Reconstructed Official" | "Local Simulator" | "Crypto Benchmark";
  resultSummary: string;
  contextNote: string;
}

export const FROZEN_VERIFICATION_LEDGER: FrozenCheckLedgerRow[] = [
  {
    suite: "check_submission.py --run",
    provenance: "FROZEN",
    evaluatorType: "Official ToolKit",
    resultSummary: "READY TO SUBMIT · CONTRACT OK (4.8s)",
    contextNote: "3 runs; deterministic same-secret, distinct cross-secret, zero secret exposure",
  },
  {
    suite: "verify_lf_check.py (check_dev.py LF-exact)",
    provenance: "FROZEN",
    evaluatorType: "Reconstructed Official",
    resultSummary: "0 / 3,230 leaked (0.0%) · 4,763 / 4,855 med probes (98.1%)",
    contextNote: "200/200 LF truth SHAs; 0/4 canaries; linking F0.5=0.99 (0 wrong merges); only 92 [DISTRICT] values generalized",
  },
  {
    suite: "eval_arena.py (phase-1e-v1 · audit-sec-A)",
    provenance: "FROZEN",
    evaluatorType: "Local Simulator",
    resultSummary: "97.57 total · 0.9858 privacy · A4=0.0208 · A5=0.0284 · A6=0.0",
    contextNote: "Trap patients PT00035/PT00046 dropped 1.000 -> 0.0085 (1 -> 118 candidates); PSN-975397 numeric collision eliminated",
  },
  {
    suite: "eval_arena.py (phase-1e-v1 · baseline-sec-A)",
    provenance: "FROZEN",
    evaluatorType: "Local Simulator",
    resultSummary: "97.13 total · 0.9682 privacy · A5=0.1161 · 4.8s / 30.8 MB RSS",
    contextNote: "A5=0.1161 reflects coincidental cross-patient HMAC date collisions across broadened pools; 14/14 chaos PASS; 19/19 FHIR R4",
  },
  {
    suite: "test_phase1e.py (Pseudonym Invariants)",
    provenance: "FROZEN",
    evaluatorType: "Crypto Benchmark",
    resultSummary: "100,000 / 100,000 valid alpha PSNs · max_dev=0.037",
    contextNote: "99,996/100,000 distinct (4 expected 30-bit truncation pairs across 10^9 code space); 0/10,000 cross-secret reuse",
  },
];
