import type { RunSummaryResponse, SanitizedRecordItem } from "@/api/schemas";

export const MAX_REGISTRY_FILE_BYTES = 512 * 1024;
export const CLIENT_SAFEGUARD_TOKEN = "[BLOCKED_CLIENT_SAFEGUARD]";

const PSN_RX = /\bPSN-[0-9A-HJKMNPQRSTVWXYZ]{6}\b/;
const PSN_GLOBAL_RX = /\bPSN-[0-9A-HJKMNPQRSTVWXYZ]{6}\b/g;

// Defense-in-depth patterns blocked before any attribute enters Registry state
const SENSITIVE_KEY_RX =
  /(?:phone|mobile|cell|whatsapp|tel|aadha?r|abha|pan\b|email|mail|street|address|pata|village|gaon|tehsil|house|landmark|locality|mohalla|guardian|relative|pita|pati|mrn|ipd_?no|bill_?no|pmjay|policy_?no|payer_pan|dob|birth_?date|janm)/i;

const RAW_PHONE_RX = /(?<!\d)(?:\+91[\s-]?)?[6-9]\d{9}(?!\d)/g;
const RAW_AADHAAR_RX = /(?<!\d)\d{4}[\s-]?\d{4}[\s-]?\d{4}(?!\d)/g;
const RAW_ABHA_RX = /(?<!\d)\d{2}-\d{4}-\d{4}-\d{4}(?!\d)/g;
const RAW_PAN_RX = /\b[A-Z]{5}\d{4}[A-Z]\b/g;
const RAW_EMAIL_RX = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const RAW_MRN_RX = /\b(?:SNJ-\d{2}-\d+|JJH-\d+|UHID-\d+|IPD-\d{4}-\d+|ADM\d+|DHH-IPD-\d+|IP-\d{2}-\d+)\b/gi;

const REDACTION_MARKER_RX =
  /\[(NAME|RELATIVE|PHONE|AADHAAR|ABHA|ABHA_NUMBER|PAN|EMAIL|INSURANCE|MRN|DOB|AGE|PIN|DISTRICT|VILLAGE|TEHSIL|ADDRESS|LOCALITY|LANDMARK|HOUSE|LOCATION|ID|REDACTED)\]/g;

export type SourceFormatLabel = "FHIR R4" | "JSON" | "CSV" | "TSV" | "TXT";
export type ParseStateLabel = "parsed" | "index_only_oversized" | "index_only_unavailable";

export interface RegistryObservation {
  test: string;
  value: string;
  unit?: string;
  range?: string;
}

export interface SanitizedRegistryRecord {
  recordKey: string;
  index: number;
  pseudonym: string;
  sourceFile: string;
  loc: string;
  sourceFormat: SourceFormatLabel;
  recordStatus: string | null;
  ageBand: string | null;
  ageSortValue: number | null;
  gender: "Male" | "Female" | "Other" | null;
  hospital: string | null;
  department: string | null;
  clinician: string | null;
  diagnoses: string[];
  procedures: string[];
  medications: string[];
  observations: RegistryObservation[];
  vitals: string[];
  admissionDate: string | null;
  dischargeDate: string | null;
  visitOrReportDate: string | null;
  primaryDate: string | null;
  district: string | null;
  postalPrefix: string | null;
  redactionMarkers: Record<string, number>;
  clinicalSearchBlob: string;
  parseState: ParseStateLabel;
}

export interface AvailableRegistryFacets {
  diagnoses: string[];
  departments: string[];
  hospitals: string[];
  genders: Array<"Male" | "Female" | "Other">;
  ageBands: string[];
}

export interface SanitizedRegistryResult {
  runId: string;
  records: SanitizedRegistryRecord[];
  facets: AvailableRegistryFacets;
  stats: {
    indexTotal: number;
    patientRecordsCount: number;
    nonPatientExcludedCount: number;
    distinctPseudonyms: number;
    filesReferencedCount: number;
    filesParsedCount: number;
    filesSkippedOversized: string[];
    filesFailedCount: number;
    safeguardScrubsCount: number;
  };
}

function scrubUnsafeString(raw: unknown, statsCounter?: { count: number }): string | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (!s) return null;
  let cleaned = s;
  for (const rx of [RAW_PHONE_RX, RAW_ABHA_RX, RAW_AADHAAR_RX, RAW_PAN_RX, RAW_EMAIL_RX, RAW_MRN_RX]) {
    cleaned = cleaned.replace(rx, () => {
      if (statsCounter) statsCounter.count += 1;
      return CLIENT_SAFEGUARD_TOKEN;
    });
  }
  return cleaned;
}

function cleanDisplayAttr(raw: unknown, statsCounter?: { count: number }): string | null {
  const scrubbed = scrubUnsafeString(raw, statsCounter);
  if (!scrubbed) return null;
  const trimmed = scrubbed.replace(REDACTION_MARKER_RX, "").replace(/\s{2,}/g, " ").trim();
  if (!trimmed || trimmed === "," || trimmed === "-" || trimmed === ":") return null;
  if (trimmed === CLIENT_SAFEGUARD_TOKEN) return null;
  return trimmed;
}

function collectRedactionMarkers(text: string, target: Record<string, number>): void {
  REDACTION_MARKER_RX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = REDACTION_MARKER_RX.exec(text)) !== null) {
    const key = match[1];
    target[key] = (target[key] ?? 0) + 1;
  }
}

export function normalizeGender(raw: unknown): "Male" | "Female" | "Other" | null {
  if (raw === null || raw === undefined) return null;
  const val = String(raw).trim();
  if (!val) return null;
  const lower = val.toLowerCase();
  if (lower === "m" || lower === "male" || val === "पुरुष") return "Male";
  if (lower === "f" || lower === "female" || val === "महिला") return "Female";
  if (lower === "o" || lower === "other" || lower === "t" || lower === "transgender") return "Other";
  return null;
}

export function extractAgeBandAndSort(raw: unknown): {
  ageBand: string | null;
  ageSortValue: number | null;
} {
  if (raw === null || raw === undefined) return { ageBand: null, ageSortValue: null };
  const s = String(raw).trim();
  if (!s || /^\[AGE\]$/i.test(s)) return { ageBand: null, ageSortValue: null };
  const bandMatch = /\b(\d{1,3})-(\d{1,3})\b/.exec(s);
  if (bandMatch) {
    return { ageBand: `${bandMatch[1]}-${bandMatch[2]}`, ageSortValue: Number(bandMatch[1]) };
  }
  const plusMatch = /(?<!\d)(85\+|90\+)(?=\s|\/|$)/.exec(s);
  if (plusMatch) {
    return { ageBand: plusMatch[1], ageSortValue: Number(plusMatch[1].replace("+", "")) };
  }
  const singleMatch = /\b(\d{1,3})\s*(?:Y|Yr|Yrs|years|वर्ष)?\b/i.exec(s);
  if (singleMatch) {
    const num = Number(singleMatch[1]);
    if (num >= 0 && num <= 125) {
      return { ageBand: String(num), ageSortValue: num };
    }
  }
  return { ageBand: null, ageSortValue: null };
}

function parseAgeSexCombo(raw: unknown): {
  ageBand: string | null;
  ageSortValue: number | null;
  gender: "Male" | "Female" | "Other" | null;
} {
  if (raw === null || raw === undefined) {
    return { ageBand: null, ageSortValue: null, gender: null };
  }
  const str = String(raw).trim();
  const { ageBand, ageSortValue } = extractAgeBandAndSort(str);
  const slashParts = str.split("/");
  const genderCandidate = slashParts.length > 1 ? slashParts[slashParts.length - 1].trim() : null;
  return {
    ageBand,
    ageSortValue,
    gender: normalizeGender(genderCandidate),
  };
}

export function parseDelimitedRows(text: string, delimiter: "," | "\t"): { headers: string[]; rows: string[][] } {
  const allRows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  const cleanText = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < cleanText.length; i++) {
    const ch = cleanText[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < cleanText.length && cleanText[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\r") {
      if (i + 1 < cleanText.length && cleanText[i + 1] === "\n") i += 1;
      row.push(cell);
      if (row.some((c) => c.length > 0)) allRows.push(row);
      row = [];
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      if (row.some((c) => c.length > 0)) allRows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    if (row.some((c) => c.length > 0)) allRows.push(row);
  }

  if (!allRows.length) return { headers: [], rows: [] };
  return {
    headers: allRows[0].map((h) => h.trim()),
    rows: allRows.slice(1),
  };
}

function emptyDraft(
  entry: SanitizedRecordItem,
  sourceFormat: SourceFormatLabel,
  parseState: ParseStateLabel,
): SanitizedRegistryRecord {
  const fallbackPsn = entry.patient && PSN_RX.test(entry.patient) ? entry.patient : "[NOT_AVAILABLE]";
  return {
    recordKey: `${entry.file}::${entry.loc}::${entry.index}`,
    index: entry.index,
    pseudonym: fallbackPsn,
    sourceFile: entry.file,
    loc: entry.loc,
    sourceFormat,
    recordStatus: entry.status ?? null,
    ageBand: null,
    ageSortValue: null,
    gender: null,
    hospital: null,
    department: null,
    clinician: null,
    diagnoses: [],
    procedures: [],
    medications: [],
    observations: [],
    vitals: [],
    admissionDate: null,
    dischargeDate: null,
    visitOrReportDate: null,
    primaryDate: null,
    district: null,
    postalPrefix: null,
    redactionMarkers: {},
    clinicalSearchBlob: "",
    parseState,
  };
}

function pushUnique(list: string[], value: string | null): void {
  if (!value) return;
  if (!list.includes(value)) list.push(value);
}

function finalizeRecord(rec: SanitizedRegistryRecord): SanitizedRegistryRecord {
  rec.primaryDate = rec.admissionDate || rec.visitOrReportDate || rec.dischargeDate || null;
  const parts = [
    rec.pseudonym,
    rec.hospital,
    rec.department,
    rec.clinician,
    rec.district,
    ...rec.diagnoses,
    ...rec.procedures,
    ...rec.medications,
    ...rec.observations.map((o) => `${o.test} ${o.value} ${o.unit ?? ""}`),
  ]
    .filter((p): p is string => Boolean(p))
    .join(" ")
    .toLowerCase();
  rec.clinicalSearchBlob = parts;
  return rec;
}

function extractCsvRowIntoRecord(
  rec: SanitizedRegistryRecord,
  headers: string[],
  cells: string[],
  counter: { count: number },
): void {
  collectRedactionMarkers(cells.join(" "), rec.redactionMarkers);

  headers.forEach((header, idx) => {
    const val = (cells[idx] ?? "").trim();
    if (!val) return;
    const hl = header.toLowerCase();

    if (PSN_RX.test(val) && rec.pseudonym === "[NOT_AVAILABLE]") {
      const m = PSN_RX.exec(val);
      if (m) rec.pseudonym = m[0];
    }

    if (hl === "age_sex" || hl === "age/sex") {
      const combo = parseAgeSexCombo(val);
      if (!rec.ageBand && combo.ageBand) {
        rec.ageBand = combo.ageBand;
        rec.ageSortValue = combo.ageSortValue;
      }
      if (!rec.gender && combo.gender) rec.gender = combo.gender;
      return;
    }
    if (hl === "age" || hl === "umar") {
      const parsedAge = extractAgeBandAndSort(val);
      if (!rec.ageBand && parsedAge.ageBand) {
        rec.ageBand = parsedAge.ageBand;
        rec.ageSortValue = parsedAge.ageSortValue;
      }
      return;
    }
    if (hl === "sex" || hl === "gender" || hl === "ling") {
      const g = normalizeGender(val);
      if (g) rec.gender = g;
      return;
    }
    if (hl === "diagnosis" || hl === "icd10" || hl === "condition") {
      pushUnique(rec.diagnoses, cleanDisplayAttr(val, counter));
      return;
    }
    if (hl === "procedure" || hl === "surgery") {
      pushUnique(rec.procedures, cleanDisplayAttr(val, counter));
      return;
    }
    if (hl === "department" || hl === "dept" || hl === "ward") {
      rec.department = rec.department ?? cleanDisplayAttr(val, counter);
      return;
    }
    if (hl === "hospital" || hl === "facility") {
      rec.hospital = rec.hospital ?? cleanDisplayAttr(val, counter);
      return;
    }
    if (hl === "doctor" || hl === "ref_doctor" || hl === "consultant") {
      rec.clinician = rec.clinician ?? cleanDisplayAttr(val, counter);
      return;
    }
    if (hl === "admission_date" || hl === "admitted_on") {
      rec.admissionDate = rec.admissionDate ?? cleanDisplayAttr(val, counter);
      return;
    }
    if (hl === "discharge_date" || hl === "discharged_on") {
      rec.dischargeDate = rec.dischargeDate ?? cleanDisplayAttr(val, counter);
      return;
    }
    if (hl === "reported_on" || hl === "collected_on" || hl === "visit_date" || hl === "registered" || hl.startsWith("registration date") || hl.startsWith("registered (")) {
      rec.visitOrReportDate = rec.visitOrReportDate ?? cleanDisplayAttr(val, counter);
      return;
    }
    if (hl === "district" || hl === "jila") {
      rec.district = rec.district ?? cleanDisplayAttr(val, counter);
      return;
    }
    if ((hl === "pin" || hl === "zip" || hl === "pin code") && /^\d{3}\*{3}$/.test(val)) {
      rec.postalPrefix = val;
      return;
    }

    // Lab row columns (test / result / unit / ref_range)
    if (hl === "test") {
      const resIdx = headers.findIndex((h) => h.toLowerCase() === "result" || h.toLowerCase() === "value");
      const unitIdx = headers.findIndex((h) => h.toLowerCase() === "unit");
      const rangeIdx = headers.findIndex((h) => h.toLowerCase() === "ref_range" || h.toLowerCase() === "range");
      const testName = cleanDisplayAttr(val, counter);
      const resVal = resIdx >= 0 ? cleanDisplayAttr(cells[resIdx], counter) : null;
      if (testName && resVal) {
        rec.observations.push({
          test: testName,
          value: resVal,
          unit: unitIdx >= 0 ? cleanDisplayAttr(cells[unitIdx], counter) ?? undefined : undefined,
          range: rangeIdx >= 0 ? cleanDisplayAttr(cells[rangeIdx], counter) ?? undefined : undefined,
        });
      }
      return;
    }

    // Drop any sensitive raw key columns (notes/remarks ignored unless explicit sanitized text without sensitive keys)
    if (SENSITIVE_KEY_RX.test(hl)) {
      return;
    }
  });
}

function extractFhirIntoRecord(
  rec: SanitizedRegistryRecord,
  bundle: Record<string, unknown>,
  rawText: string,
  counter: { count: number },
): void {
  collectRedactionMarkers(rawText, rec.redactionMarkers);
  const entries = Array.isArray(bundle.entry) ? bundle.entry : [];

  for (const ent of entries) {
    if (!ent || typeof ent !== "object") continue;
    const res = (ent as Record<string, unknown>).resource;
    if (!res || typeof res !== "object") continue;
    const r = res as Record<string, unknown>;
    const rt = r.resourceType;

    if (rt === "Patient") {
      const g = normalizeGender(r.gender);
      if (g) rec.gender = g;
      const addrs = Array.isArray(r.address) ? r.address : [];
      if (addrs[0] && typeof addrs[0] === "object") {
        const a0 = addrs[0] as Record<string, unknown>;
        rec.district = rec.district ?? cleanDisplayAttr(a0.district, counter);
        const pc = String(a0.postalCode ?? "").trim();
        if (/^\d{3}\*{3}$/.test(pc)) rec.postalPrefix = pc;
      }
      // Note: Do NOT surface Patient.birthDate directly in registry (retain generalized demographics only)
    } else if (rt === "Organization") {
      rec.hospital = rec.hospital ?? cleanDisplayAttr(r.name, counter);
    } else if (rt === "Practitioner") {
      const names = Array.isArray(r.name) ? r.name : [];
      if (names[0] && typeof names[0] === "object") {
        rec.clinician = rec.clinician ?? cleanDisplayAttr((names[0] as Record<string, unknown>).text, counter);
      }
    } else if (rt === "Encounter") {
      const period = r.period as Record<string, unknown> | undefined;
      if (period) {
        rec.admissionDate = rec.admissionDate ?? cleanDisplayAttr(period.start, counter);
        rec.dischargeDate = rec.dischargeDate ?? cleanDisplayAttr(period.end, counter);
      }
      const locs = Array.isArray(r.location) ? r.location : [];
      for (const l of locs) {
        if (l && typeof l === "object" && "location" in l) {
          const locObj = (l as Record<string, unknown>).location;
          if (locObj && typeof locObj === "object") {
            rec.department = rec.department ?? cleanDisplayAttr((locObj as Record<string, unknown>).display, counter);
          }
        }
      }
    } else if (rt === "Condition") {
      const codeObj = r.code as Record<string, unknown> | undefined;
      const codings = Array.isArray(codeObj?.coding) ? codeObj.coding : [];
      const firstCoding = codings[0] as Record<string, unknown> | undefined;
      const icd = cleanDisplayAttr(firstCoding?.code, counter);
      const disp = cleanDisplayAttr(codeObj?.text ?? firstCoding?.display, counter);
      if (disp) {
        pushUnique(rec.diagnoses, icd && !disp.includes(icd) ? `${disp} (${icd})` : disp);
      }
    } else if (rt === "MedicationRequest") {
      const medCode = r.medicationCodeableConcept as Record<string, unknown> | undefined;
      pushUnique(rec.medications, cleanDisplayAttr(medCode?.text, counter));
    } else if (rt === "Observation") {
      const codeObj = r.code as Record<string, unknown> | undefined;
      const codings = Array.isArray(codeObj?.coding) ? codeObj.coding : [];
      const firstCoding = codings[0] as Record<string, unknown> | undefined;
      const test = cleanDisplayAttr(codeObj?.text ?? firstCoding?.display, counter);
      const vq = r.valueQuantity as Record<string, unknown> | undefined;
      if (test && vq && vq.value !== undefined) {
        rec.observations.push({
          test,
          value: String(vq.value),
          unit: cleanDisplayAttr(vq.unit, counter) ?? undefined,
        });
      }
    }
  }
}

function resolveJsonPointer(root: unknown, pointer: string): unknown {
  if (!pointer || pointer === "doc" || !pointer.startsWith("/")) return root;
  const parts = pointer
    .slice(1)
    .split("/")
    .map((p) => p.replace(/~1/g, "/").replace(/~0/g, "~"));
  let cur: unknown = root;
  for (const part of parts) {
    if (Array.isArray(cur) && /^\d+$/.test(part)) {
      cur = cur[Number(part)];
    } else if (cur && typeof cur === "object" && part in cur) {
      cur = (cur as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return cur;
}

function extractJsonNodeIntoRecord(
  rec: SanitizedRegistryRecord,
  rootObj: Record<string, unknown>,
  rawText: string,
  counter: { count: number },
): void {
  collectRedactionMarkers(rawText, rec.redactionMarkers);

  // Extract file-level facility metadata cleanly (never source_path)
  const meta = rootObj._export_meta as Record<string, unknown> | undefined;
  const facility = rootObj.facility as Record<string, unknown> | undefined;
  rec.hospital =
    cleanDisplayAttr(meta?.hospital, counter) ??
    cleanDisplayAttr(facility?.name, counter) ??
    cleanDisplayAttr(rootObj.hospital, counter) ??
    cleanDisplayAttr(rootObj.lab, counter);

  const target = resolveJsonPointer(rootObj, rec.loc);
  const node = target && typeof target === "object" ? (target as Record<string, unknown>) : rootObj;

  // Check top-level or nested patient sub-object
  const pat =
    node.patient && typeof node.patient === "object"
      ? (node.patient as Record<string, unknown>)
      : node;

  const g = normalizeGender(pat.gender ?? pat.sex ?? node.gender ?? node.sex);
  if (g) rec.gender = g;

  const ageParsed = extractAgeBandAndSort(pat.age ?? node.age);
  if (ageParsed.ageBand) {
    rec.ageBand = ageParsed.ageBand;
    rec.ageSortValue = ageParsed.ageSortValue;
  }
  if (!rec.ageBand && (pat.age_sex || node.age_sex)) {
    const combo = parseAgeSexCombo(pat.age_sex ?? node.age_sex);
    rec.ageBand = combo.ageBand;
    rec.ageSortValue = combo.ageSortValue;
    if (!rec.gender) rec.gender = combo.gender;
  }

  rec.department = rec.department ?? cleanDisplayAttr(node.department ?? node.ward, counter);
  rec.clinician =
    rec.clinician ?? cleanDisplayAttr(node.doctor ?? node.referred_by ?? rootObj.referred_by, counter);
  rec.visitOrReportDate =
    cleanDisplayAttr(node.visit_date ?? node.date ?? node.collected ?? node.registered_on ?? rootObj.collected, counter);

  const addr = pat.address && typeof pat.address === "object" ? (pat.address as Record<string, unknown>) : null;
  if (addr) {
    rec.district = rec.district ?? cleanDisplayAttr(addr.district, counter);
    const pinStr = String(addr.pin ?? "").trim();
    if (/^\d{3}\*{3}$/.test(pinStr)) rec.postalPrefix = pinStr;
  }

  // Diagnosis array or string
  if (Array.isArray(node.diagnosis)) {
    for (const d of node.diagnosis) {
      if (d && typeof d === "object") {
        const do_ = d as Record<string, unknown>;
        const disp = cleanDisplayAttr(do_.display ?? do_.text, counter);
        const code = cleanDisplayAttr(do_.code, counter);
        if (disp) pushUnique(rec.diagnoses, code ? `${disp} (${code})` : disp);
      } else {
        pushUnique(rec.diagnoses, cleanDisplayAttr(d, counter));
      }
    }
  } else if (typeof node.diagnosis === "string") {
    pushUnique(rec.diagnoses, cleanDisplayAttr(node.diagnosis, counter));
  }

  // Medications (`rx`)
  if (Array.isArray(node.rx)) {
    for (const r of node.rx) {
      if (r && typeof r === "object") {
        const ro = r as Record<string, unknown>;
        const line = [ro.drug, ro.strength, ro.frequency, ro.duration]
          .map((x) => cleanDisplayAttr(x, counter))
          .filter(Boolean)
          .join(" ");
        pushUnique(rec.medications, line || null);
      }
    }
  }

  // Vitals
  if (node.vitals && typeof node.vitals === "object") {
    const v = node.vitals as Record<string, unknown>;
    if (v.bp) rec.vitals.push(`BP ${cleanDisplayAttr(v.bp, counter)}`);
    if (v.pulse !== undefined) rec.vitals.push(`Pulse ${String(v.pulse)}`);
    if (v.temp_f !== undefined) rec.vitals.push(`Temp ${String(v.temp_f)} F`);
    if (v.spo2 !== undefined) rec.vitals.push(`SpO2 ${String(v.spo2)}%`);
  }

  // Single bulk lab observation item or panels[]
  if (node.test && node.value !== undefined) {
    const test = cleanDisplayAttr(node.test, counter);
    if (test) {
      rec.observations.push({
        test,
        value: String(node.value),
        unit: cleanDisplayAttr(node.unit, counter) ?? undefined,
        range: cleanDisplayAttr(node.range, counter) ?? undefined,
      });
    }
  }
  const panels = Array.isArray(node.panels) ? node.panels : Array.isArray(rootObj.panels) ? rootObj.panels : [];
  for (const p of panels) {
    if (!p || typeof p !== "object") continue;
    const results = Array.isArray((p as Record<string, unknown>).results)
      ? ((p as Record<string, unknown>).results as unknown[])
      : [];
    for (const item of results) {
      if (!item || typeof item !== "object") continue;
      const io = item as Record<string, unknown>;
      const test = cleanDisplayAttr(io.test, counter);
      if (test && io.value !== undefined) {
        rec.observations.push({
          test,
          value: String(io.value),
          unit: cleanDisplayAttr(io.unit, counter) ?? undefined,
          range: cleanDisplayAttr(io.range, counter) ?? undefined,
        });
      }
    }
  }
}

function extractTxtIntoRecord(
  rec: SanitizedRegistryRecord,
  text: string,
  counter: { count: number },
): void {
  collectRedactionMarkers(text, rec.redactionMarkers);
  const lines = text.split(/\r?\n/);

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx].trim();
    if (!line) continue;

    if (idx === 0 && /hospital|seva\s+sadan|multispeciality|pathology/i.test(line)) {
      const cleanHeader = cleanDisplayAttr(line.replace(/^\*|\*$/g, "").split(" - ")[0], counter);
      if (cleanHeader) rec.hospital = rec.hospital ?? cleanHeader;
    }

    const psnMatch = PSN_GLOBAL_RX.exec(line);
    if (psnMatch && rec.pseudonym === "[NOT_AVAILABLE]") {
      rec.pseudonym = psnMatch[0];
    }
    PSN_GLOBAL_RX.lastIndex = 0;

    const ageSexMatch = /Age\/Sex:\s*([^\n]+)/i.exec(line) || /\bReport of\s+PSN-[0-9A-Z]+\s+([^\n]+)/i.exec(line);
    if (ageSexMatch) {
      const combo = parseAgeSexCombo(ageSexMatch[1]);
      rec.ageBand = rec.ageBand ?? combo.ageBand;
      rec.ageSortValue = rec.ageSortValue ?? combo.ageSortValue;
      rec.gender = rec.gender ?? combo.gender;
    }

    const ageHindiMatch = /आयु:\s*(\d{1,3}(?:-\d{1,3}|\+)?)/i.exec(line);
    if (ageHindiMatch && !rec.ageBand) {
      const a = extractAgeBandAndSort(ageHindiMatch[1]);
      rec.ageBand = a.ageBand;
      rec.ageSortValue = a.ageSortValue;
    }

    const wardMatch = /(?:Ward\/Bed|NURSING NOTES\s*-):\s*([^/\n]+)/i.exec(line) || /Ward\/Bed:\s*([^/\n]+)/i.exec(line);
    if (wardMatch) {
      rec.department = rec.department ?? cleanDisplayAttr(wardMatch[1], counter);
    }

    const docMatch = /(?:Consultant|Attending):\s*(.+)$/i.exec(line);
    if (docMatch) {
      rec.clinician = rec.clinician ?? cleanDisplayAttr(docMatch[1], counter);
    }

    const admMatch = /Date of Admission:\s*(.+)$/i.exec(line);
    if (admMatch) rec.admissionDate = cleanDisplayAttr(admMatch[1], counter);

    const disMatch = /Date of Discharge:\s*(.+)$/i.exec(line);
    if (disMatch) rec.dischargeDate = cleanDisplayAttr(disMatch[1], counter);

    const diagMatch = /Diagnosis:\s*(.+)$/i.exec(line);
    if (diagMatch) {
      for (const piece of diagMatch[1].split(";")) {
        pushUnique(rec.diagnoses, cleanDisplayAttr(piece, counter));
      }
    }

    const procMatch = /Procedure:\s*(.+)$/i.exec(line);
    if (procMatch) {
      pushUnique(rec.procedures, cleanDisplayAttr(procMatch[1], counter));
    }

    const distMatch = /Distt\.?\s*([A-Za-z]+)/i.exec(line);
    if (distMatch) {
      rec.district = rec.district ?? cleanDisplayAttr(distMatch[1], counter);
    }
    const pinMatch = /\b(\d{3}\*{3})\b/.exec(line);
    if (pinMatch) {
      rec.postalPrefix = rec.postalPrefix ?? pinMatch[1];
    }

    const rxLineMatch = /^\d+\.\s+((?:Tab|Inj|Cap|Syp|Drops)\b.+)$/i.exec(line);
    if (rxLineMatch) {
      pushUnique(rec.medications, cleanDisplayAttr(rxLineMatch[1], counter));
    }
  }
}

function detectFormat(filePath: string, parsedJson?: unknown): SourceFormatLabel {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".csv")) return "CSV";
  if (lower.endsWith(".tsv")) return "TSV";
  if (lower.endsWith(".json")) {
    if (
      parsedJson &&
      typeof parsedJson === "object" &&
      (parsedJson as Record<string, unknown>).resourceType === "Bundle"
    ) {
      return "FHIR R4";
    }
    return "JSON";
  }
  return "TXT";
}

export function buildSanitizedRegistry(opts: {
  summary: RunSummaryResponse;
  indexRecords: SanitizedRecordItem[];
  indexTotal: number;
  fileTextsByPath: Map<string, string>;
  skippedOversizedFiles: string[];
  failedFiles: string[];
}): SanitizedRegistryResult {
  const { summary, indexRecords, indexTotal, fileTextsByPath, skippedOversizedFiles, failedFiles } = opts;
  const safeguardCounter = { count: 0 };

  const skippedSet = new Set(skippedOversizedFiles);
  const parsedCsvCache = new Map<string, { headers: string[]; rows: string[][] }>();
  const parsedJsonCache = new Map<string, Record<string, unknown> | null>();

  const patientEntries = indexRecords.filter((item) => Boolean(item.patient && item.patient.trim()));
  const nonPatientExcludedCount = indexRecords.length - patientEntries.length;

  const referencedFiles = new Set(patientEntries.map((e) => e.file));
  const records: SanitizedRegistryRecord[] = [];

  for (const entry of patientEntries) {
    const rawText = fileTextsByPath.get(entry.file);
    const lowerFile = entry.file.toLowerCase();

    if (rawText === undefined) {
      const parseState: ParseStateLabel = skippedSet.has(entry.file)
        ? "index_only_oversized"
        : "index_only_unavailable";
      records.push(finalizeRecord(emptyDraft(entry, detectFormat(entry.file), parseState)));
      continue;
    }

    if (lowerFile.endsWith(".csv") || lowerFile.endsWith(".tsv")) {
      const delim: "," | "\t" = lowerFile.endsWith(".tsv") ? "\t" : ",";
      let table = parsedCsvCache.get(entry.file);
      if (!table) {
        table = parseDelimitedRows(rawText, delim);
        parsedCsvCache.set(entry.file, table);
      }
      const rec = emptyDraft(entry, delim === "\t" ? "TSV" : "CSV", "parsed");
      if (entry.loc.startsWith("row:")) {
        const idxStr = entry.loc.slice(4);
        const rowIdx = /^\d+$/.test(idxStr) ? Number(idxStr) : -1;
        if (rowIdx >= 0 && rowIdx < table.rows.length) {
          extractCsvRowIntoRecord(rec, table.headers, table.rows[rowIdx], safeguardCounter);
        }
      }
      records.push(finalizeRecord(rec));
    } else if (lowerFile.endsWith(".json")) {
      let jsonObj = parsedJsonCache.get(entry.file);
      if (jsonObj === undefined) {
        try {
          const parsed = JSON.parse(rawText);
          jsonObj = parsed && typeof parsed === "object" && !Array.isArray(parsed)
            ? (parsed as Record<string, unknown>)
            : null;
        } catch {
          jsonObj = null;
        }
        parsedJsonCache.set(entry.file, jsonObj);
      }
      const fmt = detectFormat(entry.file, jsonObj);
      const rec = emptyDraft(entry, fmt, "parsed");
      if (jsonObj) {
        if (fmt === "FHIR R4") {
          extractFhirIntoRecord(rec, jsonObj, rawText, safeguardCounter);
        } else {
          extractJsonNodeIntoRecord(rec, jsonObj, rawText, safeguardCounter);
        }
      }
      records.push(finalizeRecord(rec));
    } else {
      const rec = emptyDraft(entry, "TXT", "parsed");
      extractTxtIntoRecord(rec, rawText, safeguardCounter);
      records.push(finalizeRecord(rec));
    }
  }

  const diagSet = new Set<string>();
  const deptSet = new Set<string>();
  const hospSet = new Set<string>();
  const genderSet = new Set<"Male" | "Female" | "Other">();
  const ageMap = new Map<string, number>();
  const psnSet = new Set<string>();

  for (const r of records) {
    psnSet.add(r.pseudonym);
    r.diagnoses.forEach((d) => diagSet.add(d));
    if (r.department) deptSet.add(r.department);
    if (r.hospital) hospSet.add(r.hospital);
    if (r.gender) genderSet.add(r.gender);
    if (r.ageBand) ageMap.set(r.ageBand, r.ageSortValue ?? 999);
  }

  return {
    runId: summary.run_id,
    records,
    facets: {
      diagnoses: Array.from(diagSet).sort((a, b) => a.localeCompare(b)),
      departments: Array.from(deptSet).sort((a, b) => a.localeCompare(b)),
      hospitals: Array.from(hospSet).sort((a, b) => a.localeCompare(b)),
      genders: Array.from(genderSet).sort((a, b) => a.localeCompare(b)),
      ageBands: Array.from(ageMap.entries())
        .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
        .map(([band]) => band),
    },
    stats: {
      indexTotal,
      patientRecordsCount: records.length,
      nonPatientExcludedCount,
      distinctPseudonyms: psnSet.size,
      filesReferencedCount: referencedFiles.size,
      filesParsedCount: fileTextsByPath.size,
      filesSkippedOversized: skippedOversizedFiles,
      filesFailedCount: failedFiles.length,
      safeguardScrubsCount: safeguardCounter.count,
    },
  };
}
