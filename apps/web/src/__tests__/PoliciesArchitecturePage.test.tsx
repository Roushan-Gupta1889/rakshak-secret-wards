import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PoliciesArchitecturePage } from "@/pages/PoliciesArchitecturePage";

function renderPolicyPage() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, retryDelay: 0 },
    },
  });
  return render(
    <QueryClientProvider client={qc}>
      <PoliciesArchitecturePage />
    </QueryClientProvider>,
  );
}

const HEALTH_CONFIGURED = {
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

const POLICY_LIVE = {
  provenance: "LIVE",
  policy_sha256: "deadbeef12345678".padEnd(64, "9"),
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

describe("PoliciesArchitecturePage live policy, pipeline & security verification", () => {
  const origFetch = globalThis.fetch;

  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    globalThis.fetch = origFetch;
  });

  it("renders live policy values read-only, filters policies & security bounds, and shows exact 4-pass architecture", async () => {
    globalThis.fetch = vi.fn(async (input) => {
      const url = String(input);
      if (url === "/api/health") {
        return new Response(JSON.stringify(HEALTH_CONFIGURED), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url === "/api/policy") {
        return new Response(JSON.stringify(POLICY_LIVE), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("Not Found", { status: 404 });
    });

    const user = userEvent.setup();
    renderPolicyPage();

    await waitFor(() => {
      expect(screen.getByText(/LIVE · \/API\/POLICY \(deadbeef\)/i)).toBeInTheDocument();
    });

    const policySec = screen.getByTestId("policy-explorer-section");
    expect(within(policySec).getByText("k >= 5")).toBeInTheDocument();
    expect(within(policySec).getByText("±180d")).toBeInTheDocument();
    expect(within(policySec).getByText("Configured")).toBeInTheDocument();
    expect(within(policySec).getByText("Locked")).toBeInTheDocument();

    // Must not render fake policy toggle/save/range inputs
    expect(within(policySec).queryByRole("slider")).not.toBeInTheDocument();
    expect(within(policySec).queryByRole("switch")).not.toBeInTheDocument();
    expect(within(policySec).queryByRole("button", { name: /save|apply|update policy/i })).not.toBeInTheDocument();

    // Filter policy rows via category and search input
    await user.click(within(policySec).getByRole("button", { name: "Policy YAML" }));
    expect(within(policySec).getByText("village_generalize")).toBeInTheDocument();
    expect(within(policySec).queryByText("min_group_size")).not.toBeInTheDocument();

    await user.click(within(policySec).getByRole("button", { name: "All" }));
    const searchInput = within(policySec).getByLabelText("Filter policy inventory");
    await user.type(searchInput, "fhir_r4");
    expect(within(policySec).getByText("fhir_r4_bundle_validation")).toBeInTheDocument();

    // Pipeline & crypto boundary checks
    const archSec = screen.getByTestId("pipeline-architecture-section");
    expect(within(archSec).getByText(/STAGE 1 OF 4/i)).toBeInTheDocument();
    expect(within(archSec).getByText(/STAGE 4 OF 4/i)).toBeInTheDocument();
    expect(within(archSec).getByText(/ZERO BROWSER CRYPTO/i)).toBeInTheDocument();

    // Security filter & limitation verification
    const secSection = screen.getByTestId("security-boundaries-section");
    await user.click(within(secSection).getByRole("button", { name: "Known Limitation" }));
    expect(within(secSection).getByText(/Logical Cleanup Only \(No Claim of Forensic Secure Erasure\)/i)).toBeInTheDocument();
    expect(within(secSection).queryByText(/Loopback Host, Origin Allowlist/i)).not.toBeInTheDocument();

    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it("shows honest unavailable status and offline banner when API is unreachable", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });

    renderPolicyPage();
    await waitFor(() => {
      expect(screen.getByText(/Local API adapter unreachable/i)).toBeInTheDocument();
    });

    const policySec = screen.getByTestId("policy-explorer-section");
    expect(within(policySec).getByText(/UNAVAILABLE · \/API\/POLICY OFFLINE/i)).toBeInTheDocument();
  });
});
