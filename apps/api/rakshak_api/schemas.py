"""Strict Pydantic v2 schemas for Phase 2A endpoints with explicit metric provenance."""
from __future__ import annotations

from typing import Literal
from pydantic import BaseModel, Field

Provenance = Literal["LIVE", "FROZEN", "DERIVED"]
SecretSource = Literal["configured", "ephemeral"]
SecretMode = Literal["auto", "configured", "ephemeral"]


class ErrorDetail(BaseModel):
    code: str
    message: str
    request_id: str | None = None


class ErrorResponse(BaseModel):
    error: ErrorDetail


class CsrfResponse(BaseModel):
    csrf_token: str
    header_name: str = "X-CSRF-Token"


class HealthResponse(BaseModel):
    status: Literal["ok"]
    provenance: Literal["LIVE"] = "LIVE"
    engine_tag: str
    engine_version: str
    stdlib_stage1: bool = True
    offline_mode: bool = True
    secret_configured: bool
    active_runs: int
    retained_runs: int
    max_concurrent_runs: int


class PolicyResponse(BaseModel):
    provenance: Literal["LIVE"] = "LIVE"
    policy_sha256: str
    policy: dict[str, str | int]


class RunCounts(BaseModel):
    files_total: int
    files_sanitized: int
    files_quarantined: int
    records_processed: int
    identifiers_detected: int
    records_linked: int
    records_generalized: int
    records_suppressed: int
    records_quarantined: int


class RunTiming(BaseModel):
    seconds: float


class RunResources(BaseModel):
    peak_rss_mb: float


class ManifestFileEntry(BaseModel):
    input_sha256: str
    output: str | None = None
    status: Literal["sanitized", "quarantined"]
    reason: str | None = None
    size_bytes: int | None = None


class FhirValidationSummary(BaseModel):
    provenance: Literal["DERIVED"] = "DERIVED"
    bundles_total: int
    bundles_valid: int
    bundles_invalid: int


class PlaceholderSummary(BaseModel):
    provenance: Literal["DERIVED"] = "DERIVED"
    counts: dict[str, int]
    psn_count: int
    all_alpha_psn_valid: bool


class CohortKSummary(BaseModel):
    provenance: Literal["DERIVED"] = "DERIVED"
    generalized_district_markers: int
    suppressed_pin_markers: int
    suppressed_dob_markers: int
    suppressed_age_markers: int


class RunSummaryResponse(BaseModel):
    run_id: str
    created_at: str
    expires_at: str
    status: Literal["completed"]
    secret_source: SecretSource
    provenance: Literal["LIVE"] = "LIVE"
    schema_version: str = Field(default="raksha-report/1")
    counts: RunCounts
    entities: dict[str, int]
    timing: RunTiming
    resources: RunResources
    files: list[ManifestFileEntry]
    placeholder_summary: PlaceholderSummary
    fhir_validation: FhirValidationSummary
    cohort_summary: CohortKSummary


class SanitizedRecordItem(BaseModel):
    index: int
    file: str
    loc: str
    patient: str | None = None
    status: str | None = None
    preview: str


class RecordsPageResponse(BaseModel):
    provenance: Literal["DERIVED"] = "DERIVED"
    run_id: str
    total: int
    page: int
    page_size: int
    items: list[SanitizedRecordItem]
