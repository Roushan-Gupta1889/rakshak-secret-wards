import { describe, expect, it } from "vitest";
import type { SanitizedRecordItem } from "@/api/schemas";
import {
  buildSanitizedRegistry,
  CLIENT_SAFEGUARD_TOKEN,
  parseDelimitedRows,
} from "@/lib/sanitizedRegistryParser";
import { SAMPLE_RUN_SUMMARY } from "@/test/fixtures";

describe("sanitizedRegistryParser format extraction & privacy guards", () => {
  it("parses quoted multi-line CSV cells cleanly without splitting records", () => {
    const csv =
      'PatientID,Sex,District,Notes\nPSN-04NFMC,M,Sitapur,"Line 1.\nLine 2."\nPSN-P37JKV,F,Bahraich,Stable\n';
    const parsed = parseDelimitedRows(csv, ",");
    expect(parsed.headers).toEqual(["PatientID", "Sex", "District", "Notes"]);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0][3]).toBe("Line 1.\nLine 2.");
    expect(parsed.rows[1][0]).toBe("PSN-P37JKV");
  });

  it("extracts structured safe fields across FHIR R4, OPD JSON, bilingual TSV, and TXT while excluding raw DOB and PII", () => {
    const summary = {
      ...SAMPLE_RUN_SUMMARY,
      run_id: "1111222233334444",
      files: [
        {
          input_sha256: "a".repeat(64),
          output: "sanitized/fhir/bundle_1.json",
          status: "sanitized" as const,
          reason: null,
          size_bytes: 1200,
        },
        {
          input_sha256: "b".repeat(64),
          output: "sanitized/opd/visits.json",
          status: "sanitized" as const,
          reason: null,
          size_bytes: 600,
        },
        {
          input_sha256: "c".repeat(64),
          output: "sanitized/reg/patients.tsv",
          status: "sanitized" as const,
          reason: null,
          size_bytes: 400,
        },
        {
          input_sha256: "d".repeat(64),
          output: "sanitized/discharge/note.txt",
          status: "sanitized" as const,
          reason: null,
          size_bytes: 500,
        },
      ],
    };

    const fhirJson = JSON.stringify({
      resourceType: "Bundle",
      type: "document",
      entry: [
        {
          resource: {
            resourceType: "Patient",
            id: "p1",
            gender: "female",
            birthDate: "1998-12-17",
            address: [{ district: "Lucknow", postalCode: "226***", city: "[REDACTED]" }],
          },
        },
        { resource: { resourceType: "Organization", id: "o1", name: "Sanjeevani Hospital" } },
        { resource: { resourceType: "Practitioner", id: "pr1", name: [{ text: "Dr. Imtiaz Ahmed" }] } },
        {
          resource: {
            resourceType: "Encounter",
            id: "e1",
            period: { start: "2026-06-02", end: "2026-06-10" },
            location: [{ location: { display: "Ward 8 (Surgery)" } }],
          },
        },
        {
          resource: {
            resourceType: "Condition",
            id: "c1",
            code: { coding: [{ code: "A01.0", display: "Typhoid fever" }], text: "Typhoid fever" },
          },
        },
        {
          resource: {
            resourceType: "MedicationRequest",
            id: "m1",
            medicationCodeableConcept: { text: "Tab Azithromycin 500mg" },
          },
        },
      ],
    });

    const opdJson = JSON.stringify({
      _export_meta: { hospital: "Arogya Seva Sadan", source_path: "D:\\raw\\leak.json" },
      visits: [
        {
          visit_id: "[MRN]",
          patient_ref: "PSN-FSC495",
          visit_date: "2026-01-22",
          department: "Medicine",
          doctor: "Dr. Ramesh Srivastava",
          diagnosis: [{ code: "K50.9", display: "Crohn's disease" }],
          rx: [{ drug: "Paracetamol", strength: "650 mg", frequency: "1-1-1", duration: "5 days" }],
        },
      ],
    });

    const tsvText = [
      "Reg No\tNaam\tLing\tUmar\tJanm Tithi\tPita/Pati ka Naam\tJila\tPin Code\tMobile No",
      "PSN-FKJ3EG\tPSN-FKJ3EG\tमहिला\t45-49\t11/04/1978\tD/o [RELATIVE]\tBarabanki\t225***\t[PHONE]",
    ].join("\n");

    const txtNote = [
      "AROGYA SEVA SADAN, SITAPUR",
      "Patient Name: PSN-04NFMC        Age/Sex: 45-49 Yrs/M",
      "Address: [ADDRESS], Distt. Sitapur - 261***",
      "Mobile: [PHONE]",
      "Consultant: Dr. Imtiaz Ahmed (MS Surgery)",
      "Ward/Bed: Ward 3 (Surgery) / Bed 28",
      "Date of Admission: 05/15/2026",
      "Date of Discharge: 05/20/2026",
      "Diagnosis: Anaemia (D64.9); Type 2 Diabetes",
      "Procedure: Appendicectomy",
    ].join("\n");

    const indexRecords: SanitizedRecordItem[] = [
      { index: 0, file: "sanitized/fhir/bundle_1.json", loc: "doc", patient: "PSN-HRTH0S", status: null, preview: "RAW_PREVIEW_IGNORE" },
      { index: 1, file: "sanitized/opd/visits.json", loc: "/visits/0", patient: "PSN-FSC495", status: null, preview: "RAW_PREVIEW_IGNORE" },
      { index: 2, file: "sanitized/reg/patients.tsv", loc: "row:0", patient: "PSN-FKJ3EG", status: "generalized", preview: "RAW_PREVIEW_IGNORE" },
      { index: 3, file: "sanitized/discharge/note.txt", loc: "doc", patient: "PSN-04NFMC", status: null, preview: "RAW_PREVIEW_IGNORE" },
      { index: 4, file: "sanitized/clean/formulary.csv", loc: "doc", patient: null, status: null, preview: "NON_PATIENT" },
    ];

    const filesMap = new Map<string, string>([
      ["sanitized/fhir/bundle_1.json", fhirJson],
      ["sanitized/opd/visits.json", opdJson],
      ["sanitized/reg/patients.tsv", tsvText],
      ["sanitized/discharge/note.txt", txtNote],
    ]);

    const res = buildSanitizedRegistry({
      summary,
      indexRecords,
      indexTotal: 5,
      fileTextsByPath: filesMap,
      skippedOversizedFiles: [],
      failedFiles: [],
    });

    expect(res.stats.patientRecordsCount).toBe(4);
    expect(res.stats.nonPatientExcludedCount).toBe(1);

    const fhirRec = res.records[0];
    expect(fhirRec.sourceFormat).toBe("FHIR R4");
    expect(fhirRec.hospital).toBe("Sanjeevani Hospital");
    expect(fhirRec.gender).toBe("Female");
    expect(fhirRec.department).toBe("Ward 8 (Surgery)");
    expect(fhirRec.diagnoses).toEqual(["Typhoid fever (A01.0)"]);
    expect(fhirRec.admissionDate).toBe("2026-06-02");
    expect(fhirRec.dischargeDate).toBe("2026-06-10");
    expect(JSON.stringify(fhirRec)).not.toContain("1998-12-17");

    const opdRec = res.records[1];
    expect(opdRec.hospital).toBe("Arogya Seva Sadan");
    expect(opdRec.department).toBe("Medicine");
    expect(opdRec.medications).toEqual(["Paracetamol 650 mg 1-1-1 5 days"]);
    expect(JSON.stringify(opdRec)).not.toContain("leak.json");

    const tsvRec = res.records[2];
    expect(tsvRec.gender).toBe("Female");
    expect(tsvRec.ageBand).toBe("45-49");
    expect(tsvRec.district).toBe("Barabanki");
    expect(tsvRec.postalPrefix).toBe("225***");
    expect(JSON.stringify(tsvRec)).not.toContain("11/04/1978");

    const txtRec = res.records[3];
    expect(txtRec.ageBand).toBe("45-49");
    expect(txtRec.gender).toBe("Male");
    expect(txtRec.diagnoses).toEqual(["Anaemia (D64.9)", "Type 2 Diabetes"]);
    expect(txtRec.procedures).toEqual(["Appendicectomy"]);
    expect(txtRec.redactionMarkers.PHONE).toBeGreaterThanOrEqual(1);

    expect(JSON.stringify(res.records)).not.toContain("RAW_PREVIEW_IGNORE");
  });

  it("blocks accidental unredacted phones, MRNs, and Aadhaar tokens via client safeguard", () => {
    const csvWithLeak = [
      "uhid,gender,diagnosis",
      "PSN-9999AA,M,Hypertension 9811223344 SNJ-26-00912 1234 5678 9012",
    ].join("\n");

    const res = buildSanitizedRegistry({
      summary: { ...SAMPLE_RUN_SUMMARY, run_id: "abcdef0123456789" },
      indexRecords: [
        {
          index: 0,
          file: "sanitized/patients.csv",
          loc: "row:0",
          patient: "PSN-9999AA",
          status: null,
          preview: "9811223344 RAW PREVIEW NEVER SHOWN",
        },
      ],
      indexTotal: 1,
      fileTextsByPath: new Map([["sanitized/patients.csv", csvWithLeak]]),
      skippedOversizedFiles: [],
      failedFiles: [],
    });

    const diag = res.records[0].diagnoses[0] ?? "";
    expect(diag).not.toContain("9811223344");
    expect(diag).not.toContain("SNJ-26-00912");
    expect(diag).not.toContain("1234 5678 9012");
    expect(diag).toContain(CLIENT_SAFEGUARD_TOKEN);
    expect(res.stats.safeguardScrubsCount).toBe(3);
  });
});
