import { describe, expect, it } from "vitest";
import type { HealthResponse, PolicyResponse } from "@/api/schemas";
import {
  buildPolicyInventory,
  FORMAT_SUPPORT_MATRIX,
  SECURITY_BOUNDARIES_MATRIX,
  STAGE1_PIPELINE_PASSES,
  TRUST_BOUNDARY_TIERS,
} from "@/lib/policyArchitectureCatalog";

const LIVE_POLICY: PolicyResponse = {
  provenance: "LIVE",
  policy_sha256: "abc123".padEnd(64, "0"),
  policy: {
    age_band_years: 5,
    date_shift_max_days: 180,
    min_group_size: 5,
    privacy_mode: "adaptive_k_mixed",
    pin_generalize: "prefix3",
    village_generalize: "remove",
    house_generalize: "remove",
    locality_generalize: "remove",
    landmark_generalize: "remove",
  },
};

const LIVE_HEALTH: HealthResponse = {
  status: "ok",
  provenance: "LIVE",
  engine_tag: "phase-1e-v1",
  engine_version: "1.0.0",
  stdlib_stage1: true,
  offline_mode: true,
  secret_configured: true,
  active_runs: 0,
  retained_runs: 0,
  max_concurrent_runs: 2,
};

describe("policyArchitectureCatalog source-traced inventory & specs", () => {
  it("distinguishes dynamically enforced YAML keys from declarative fixed-in-code YAML settings", () => {
    const rows = buildPolicyInventory(LIVE_POLICY, LIVE_HEALTH);

    const minGroup = rows.find((r) => r.key === "min_group_size");
    const privacyMode = rows.find((r) => r.key === "privacy_mode");
    const village = rows.find((r) => r.key === "village_generalize");
    const pin = rows.find((r) => r.key === "pin_generalize");
    const secret = rows.find((r) => r.key === "secret_configured (RAKSHA_SECRET)");

    expect(minGroup?.enforcementMode).toBe("ENFORCED_FROM_YAML");
    expect(minGroup?.provenance).toBe("LIVE");
    expect(privacyMode?.enforcementMode).toBe("YAML_WITH_CODE_OVERRIDE");
    expect(village?.enforcementMode).toBe("DECLARATIVE_FIXED_IN_CODE");
    expect(pin?.enforcementMode).toBe("DECLARATIVE_FIXED_IN_CODE");
    expect(secret?.actualValue).toContain("Configured in server env");
  });

  it("marks YAML settings and secret status UNAVAILABLE when backend is offline", () => {
    const rows = buildPolicyInventory(null, null);
    const minGroup = rows.find((r) => r.key === "min_group_size");
    const secret = rows.find((r) => r.key === "secret_configured (RAKSHA_SECRET)");
    const cryptoRule = rows.find((r) => r.key === "pseudonym_algorithm (PSN-XXXXXX)");

    expect(minGroup?.provenance).toBe("UNAVAILABLE");
    expect(secret?.provenance).toBe("UNAVAILABLE");
    expect(cryptoRule?.provenance).toBe("FROZEN");
  });

  it("documents exact 4-pass Stage 1 execution order, zero browser crypto, and non-forensic/collision limits", () => {
    expect(STAGE1_PIPELINE_PASSES.map((p) => p.passId)).toEqual([
      "pass-1",
      "pass-2",
      "pass-2b",
      "pass-3",
    ]);
    expect(STAGE1_PIPELINE_PASSES[3].cryptoHooks.join(" ")).toContain("HMAC-SHA256");
    expect(STAGE1_PIPELINE_PASSES[3].cryptoHooks.join(" ")).toContain("rejection sampling");

    const browserTier = TRUST_BOUNDARY_TIERS.find((t) => t.tierId === "browser");
    expect(browserTier?.explicitlyExcluded.join(" ")).toMatch(/ZERO cryptography/i);

    const classes = new Set(SECURITY_BOUNDARIES_MATRIX.map((s) => s.classification));
    expect(classes.has("VERIFIED_BEHAVIOR")).toBe(true);
    expect(classes.has("CONFIG_CHOICE")).toBe(true);
    expect(classes.has("DESIGN_ASSUMPTION")).toBe(true);
    expect(classes.has("KNOWN_LIMITATION")).toBe(true);

    const allLimitationText = SECURITY_BOUNDARIES_MATRIX.map((s) => s.detail).join(" ");
    expect(allLimitationText).toMatch(/shutil\.rmtree/i);
    expect(allLimitationText).toMatch(/no mathematical guarantee of zero collisions/i);

    expect(
      FORMAT_SUPPORT_MATRIX.find((f) => f.phase2aUploadStatus === "Rejected (HTTP 415)"),
    ).toBeDefined();
  });
});
