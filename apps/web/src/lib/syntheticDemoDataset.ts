import { mergeValidatedBatch, type SelectedUploadFile } from "@/config/backendContract";

export interface SyntheticDemoFileSpec {
  fileName: string;
  formatLabel: string;
  classification: "process" | "quarantine";
  highlights: string[];
  mimeType: string;
  content: string;
}

export const SYNTHETIC_DEMO_NOTICE =
  "SYNTHETIC DEMONSTRATION DATASET — Contains zero real patient records or actual PHI. Expected behaviors describe verification rules without hardcoding runtime pseudonyms or scores.";

const EN_CSV = [
  "patient_ref,patient_name,age,sex,relative_name,district,pin_code,mobile,doctor,diagnosis,medication,admission_date,discharge_date",
  "SNJ-99-00101,Aarav Kumar,46,M,S/o Rajesh Kumar,Lucknow,226001,9800001001,Dr. Arvind Kulkarni,Type 2 diabetes mellitus (E11.9),Tab Metformin 500 mg BD,02/03/2026,05/03/2026",
  "SNJ-99-00103,Manish Verma,45,M,S/o Harish Verma,Lucknow,226001,9800001003,Dr. Arvind Kulkarni,Type 2 diabetes mellitus (E11.9),Tab Metformin 500 mg BD,04/03/2026,06/03/2026",
  "SNJ-99-00104,Suresh Mishra,47,M,S/o Mohan Mishra,Lucknow,226001,9800001004,Dr. Arvind Kulkarni,Essential hypertension (I10),Tab Amlodipine 5 mg OD,05/03/2026,07/03/2026",
  "SNJ-99-00105,Deepak Yadav,48,M,S/o Ramesh Yadav,Lucknow,226001,9800001005,Dr. Meena Deshmukh,Essential hypertension (I10),Tab Amlodipine 5 mg OD,06/03/2026,08/03/2026",
  "SNJ-99-00106,Vikas Chauhan,46,M,S/o Mahendra Chauhan,Lucknow,226001,9800001006,Dr. Meena Deshmukh,Type 2 diabetes mellitus (E11.9),Tab Glimepiride 1 mg OD,08/03/2026,10/03/2026",
  "SNJ-99-00107,Nitin Saxena,47,M,S/o Alok Saxena,Lucknow,226001,9800001007,Dr. Arvind Kulkarni,Essential hypertension (I10),Tab Telmisartan 40 mg OD,09/03/2026,12/03/2026",
  "SNJ-99-00102,Sunita Verma,36,F,W/o Ramesh Verma,Barabanki,225001,9800001002,Dr. Meena Deshmukh,Typhoid fever (A01.0),Inj Ceftriaxone 1g IV BD,10/04/2026,14/04/2026",
  "SNJ-99-00108,Prakash Tiwari,94,M,S/o Ramakant Tiwari,Barabanki,225001,9800001008,Dr. Arvind Kulkarni,Rabies unspecified,Human Rabies Immunoglobulin,12/04/2026,16/04/2026",
].join("\n");

const HI_TSV = [
  "रजिस्ट्रेशन संख्या\tमरीज़ का नाम\tलिंग\tउम्र\tपिता/पति\tजिला\tपिन कोड\tमोबाइल\tचिकित्सक\tरोग निदान",
  "SNJ-99-00101\tआरव कुमार\tपुरुष\t46\tS/o Rajesh Kumar\tLucknow\t226001\t९८००००१००१\tDr. Arvind Kulkarni\tType 2 diabetes mellitus (E11.9)",
  "SNJ-99-00102\tसुनीता वर्मा\tमहिला\t36\tW/o Ramesh Verma\tBarabanki\t225001\t९८००००१००२\tDr. Meena Deshmukh\tTyphoid fever (A01.0)",
].join("\n");

const OPD_JSON = JSON.stringify(
  {
    _export_meta: {
      hospital: "Sanjeevani Multispeciality Hospital",
      synthetic_dataset: true,
    },
    visits: [
      {
        visit_id: "OPD-DEMO-01",
        patient_ref: "SNJ-99-00101",
        patient: {
          name: "Aarav Kumar",
          age: "46",
          sex: "M",
          mobile: "9800001001",
        },
        visit_date: "2026-03-03",
        department: "Endocrinology",
        doctor: "Dr. Arvind Kulkarni",
        notes: "C/O mild fatigue and polyuria. K/C/O diabetes mellitus.",
        diagnosis: [{ code: "E11.9", display: "Type 2 diabetes mellitus" }],
        rx: [{ drug: "Tab Metformin", strength: "500 mg", frequency: "BD" }],
        vitals: ["BP 130/82 mmHg", "Pulse 78/min"],
      },
    ],
  },
  null,
  2,
);

const DISCHARGE_TXT = [
  "AROGYA SEVA SADAN, BARABANKI (SYNTHETIC DEMO RECORD)",
  "Patient Name: Sunita Verma   Age/Sex: 36/F",
  "Guardian: W/o Ramesh Verma   Village: DemoGaon",
  "UHID: SNJ-99-00102   Mobile: 9800001002",
  "Consultant: Dr. Meena Deshmukh",
  "Date of Admission: 10/04/2026",
  "Date of Discharge: 14/04/2026",
  "Chief Complaints: C/O high-grade fever x 5 days",
  "Vitals: BP 118/76 mmHg, Temp 101.2 F",
  "Diagnosis: Typhoid fever (A01.0)",
  "Medication: Inj Ceftriaxone 1g IV BD x 4 days",
].join("\n");

function toBase64Utf8(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

const FHIR_JSON = JSON.stringify(
  {
    resourceType: "Bundle",
    type: "document",
    entry: [
      {
        fullUrl: "urn:uuid:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1",
        resource: {
          resourceType: "Patient",
          id: "pat-demo-101",
          gender: "male",
          birthDate: "1980-03-14",
          name: [{ text: "Aarav Kumar" }],
          identifier: [{ system: "urn:snj:uhid", value: "SNJ-99-00101" }],
          telecom: [{ system: "phone", value: "9800001001" }],
          address: [{ district: "Lucknow", city: "Lucknow", postalCode: "226001" }],
        },
      },
      {
        fullUrl: "urn:uuid:bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2",
        resource: {
          resourceType: "Organization",
          id: "org-demo-snj",
          name: "Sanjeevani Multispeciality Hospital",
        },
      },
      {
        fullUrl: "urn:uuid:cccccccc-cccc-cccc-cccc-ccccccccccc3",
        resource: {
          resourceType: "Encounter",
          id: "enc-demo-101",
          subject: { reference: "urn:uuid:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1" },
          period: { start: "2026-03-02", end: "2026-03-05" },
        },
      },
      {
        fullUrl: "urn:uuid:dddddddd-dddd-dddd-dddd-ddddddddddd4",
        resource: {
          resourceType: "Condition",
          id: "cond-demo-101",
          code: {
            coding: [
              {
                system: "http://hl7.org/fhir/sid/icd-10",
                code: "E11.9",
                display: "Type 2 diabetes mellitus",
              },
            ],
            text: "Type 2 diabetes mellitus",
          },
          subject: { reference: "urn:uuid:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1" },
        },
      },
      {
        fullUrl: "urn:uuid:eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee5",
        resource: {
          resourceType: "DocumentReference",
          id: "doc-demo-witness",
          status: "current",
          subject: { reference: "urn:uuid:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1" },
          content: [
            {
              attachment: {
                contentType: "text/plain",
                data: toBase64Utf8(
                  "Witness Attendant: TestRel Kumar  Phone: 9800009999  Patient: Aarav Kumar",
                ),
              },
            },
          ],
        },
      },
    ],
  },
  null,
  2,
);

const QUARANTINE_PDF = "%PDF-1.4\n% SYNTHETIC DEMO BINARY STUB FOR FAIL-CLOSED QUARANTINE TEST\n";

export const SYNTHETIC_DEMO_FILES: SyntheticDemoFileSpec[] = [
  {
    fileName: "syn_ward_reg_en.csv",
    formatLabel: "English CSV (8 patients)",
    classification: "process",
    highlights: [
      "6 dense Lucknow (45–48/M) rows targeting k >= 5 cohort equivalence",
      "Cross-file anchors SNJ-99-00101 & SNJ-99-00102",
      "Extreme-age & rare-diagnosis outlier (94/M Rabies) for adaptive k-anonymity",
    ],
    mimeType: "text/csv",
    content: EN_CSV,
  },
  {
    fileName: "syn_hindi_reg.tsv",
    formatLabel: "Hindi Devanagari TSV (2 patients)",
    classification: "process",
    highlights: [
      "Devanagari headers, patient names (आरव कुमार / सुनीता वर्मा), & Indic digits (९८००००१००१)",
      "Tests Pass 2 akshara transliteration & cross-script linking to English CSV",
    ],
    mimeType: "text/tab-separated-values",
    content: HI_TSV,
  },
  {
    fileName: "syn_opd_visits.json",
    formatLabel: "Nested OPD JSON",
    classification: "process",
    highlights: [
      "Repeats SNJ-99-00101; tests C/O & K/C/O medical traps vs patient PII",
      "Preserves Dr. Arvind Kulkarni, Tab Metformin 500 mg BD, & BP 130/82 mmHg",
    ],
    mimeType: "application/json",
    content: OPD_JSON,
  },
  {
    fileName: "syn_discharge_note.txt",
    formatLabel: "Clinical Discharge TXT",
    classification: "process",
    highlights: [
      "Repeats SNJ-99-00102 across unstructured clinical narrative",
      "Tests W/o relative masking, Dr. protection, & 4-day stay interval preservation",
    ],
    mimeType: "text/plain",
    content: DISCHARGE_TXT,
  },
  {
    fileName: "syn_fhir_bundle.json",
    formatLabel: "FHIR R4 Bundle + Base64 Witness",
    classification: "process",
    highlights: [
      "Encodes Patient, Organization, Encounter, Condition & Base64 DocumentReference",
      "Tests R4 reference integrity, date shifting, & decoded base64 witness scrubbing",
    ],
    mimeType: "application/json",
    content: FHIR_JSON,
  },
  {
    fileName: "syn_scanned_imaging.pdf",
    formatLabel: "Unsupported Binary PDF Stub",
    classification: "quarantine",
    highlights: [
      "Demonstrates fail-closed quarantine: flagged quarantined in report.json",
      "Never copied into sanitized/ research export directory",
    ],
    mimeType: "application/pdf",
    content: QUARANTINE_PDF,
  },
];

export function buildSyntheticDemoUploadBatch(): {
  accepted: SelectedUploadFile[];
  errorCount: number;
} {
  const files = SYNTHETIC_DEMO_FILES.map(
    (spec) => new File([spec.content], spec.fileName, { type: spec.mimeType }),
  );
  const res = mergeValidatedBatch([], files);
  return {
    accepted: res.accepted,
    errorCount: res.errors.length,
  };
}
