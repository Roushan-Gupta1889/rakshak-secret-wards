"""Column-aware & statistically inferred PII detection across structured tables and JSON."""
from __future__ import annotations

import re

from .detectors import (
    canonical_clean, PHONE_RX, AADHAAR_RX, ABHA_RX, PAN_RX, EMAIL_RX, INSURANCE_RX,
)
from .medical import find_medical_spans, DISEASE_NAMES
from .names import (
    is_name_token, is_devanagari, DEVA_FIRST_NAMES, DEVA_SURNAMES,
)
from .privacy import parse_date

# ─────────────────────────────────────────────────────────────────────────────
# Column classification: what kind of data does each column hold?
# ─────────────────────────────────────────────────────────────────────────────

# Doctor / clinician fields must be checked FIRST so "doctor_name" / "ref_doctor"
# are never confused with patient/relative names and are preserved for clinical utility.
_DOCTOR_COL_RX = re.compile(
    r"(?i)(?:^ref_?(?:doctor|dr)$|\b(?:doctor|physician|consultant|clinician|"
    r"referred_?by|prescribed_?by|attending|surgeon)(?:_?name)?\b)"
)

_AGE_SEX_COL_RX = re.compile(
    r"(?i)^age[_\s/]+(?:sex|gender)$"
)

_CLINICAL_DATE_COL_RX = re.compile(
    r"(?i:^(?:visit|reg(?:istration|istered)?|admission|discharge|collected|"
    r"reported|encounter|admit|exam|sample)[_\s]*(?:date|taken|on|at|_?on)*"
    r"(?:\s*\([^)]+\))?$|^date$)"
    r"|(?:Date|TakenOn|CollectedOn|ReportedOn|VisitDate)$"
)

_NAME_COL_RX = re.compile(
    r"(?i)(?:(?<![a-z])(?:patient|pt|pat|mriiz|member|client|applicant|beneficiary|benf|benef|subscriber|subscr|person|patient's)[_\s]*)?"
    r"(?<![a-z])(?:patient_?name|pat_?(?:name|nm|lbl|label)|pt_?(?:name|nm|lbl|label)|"
    r"benf_?(?:name|nm|lbl)|beneficiary_?(?:name|nm)|subscr(?:iber)?_?(?:name|nm)|person_?name|"
    r"full_?name|first_?name|last_?name|given_?name|family_?name|f_?name|l_?name|first_?nm|last_?nm|surname|naam)\b"
    r"|(?<![a-z])name\b"
    r"|(?:Full|First|Last|Patient|Member)Name\b"
    r"|नाम|^Naam$",
)

# Non-patient entity names (must NOT trigger PATIENT_NAME)
_NON_PATIENT_NAME_PREFIX_RX = re.compile(
    r"(?i)(?:^|[_\-\s])(?:hospital|hosp|facility|clinic|lab|laboratory|panel|test|drug|med|medication|medicine|"
    r"diagnosis|diag|condition|disease|disorder|procedure|dept|department|ward|unit|program|"
    r"scheme|package|district|dist|village|vill|tehsil|state|country|city|town|branch|"
    r"center|centre|org|organization|vendor|insurer|payer|product|brand|file|sheet|table)(?:$|[_\-\s])"
)

_PHONE_COL_RX = re.compile(
    r"(?i)(?<![a-z])(?:phone|mobile|contact|tel|cell|mob|mbl|phn|fone|cntct|telephone|दूरभाष|मोबाइल|"
    r"contact.?no|phone.?no|mobile.?no|mob.?no|mob.?num|mob.?int|contact.?number|callback)(?![a-z])"
    r"|(?:Cell|Phone|Mobile|Tel)$"
    r"|^Mobile\s*No$",
)

_ADDRESS_COL_RX = re.compile(
    r"(?i)(?:address|addr|पता|\bstreet\b|\bhouse\b|\bmakan\b|mohalla|मोहल्ला|locality|"
    r"\bward\b|address.?line)"
    r"|^Pata$",
)

_VILLAGE_COL_RX = re.compile(
    r"(?i)(?:\bvillage\b|\bvill\b|\bgram\b|गांव|ग्राम|village.?mohalla|gram.?mohalla|"
    r"\bcity\b|\btown\b|नगर|habitation)"
    r"|^Gaon$",
)

_DOB_COL_RX = re.compile(
    r"(?i)(?:\bdob\b|date.?of.?birth|dt.?of.?birth|birth.?date|birth.?dt|bdate|bday|जन्म.?तिथि|DOB\s*\(|born)"
    r"|^Janm\s*Tithi$",
)

_AGE_COL_RX = re.compile(
    r"(?i)(?:^age$|^आयु$|^उम्र$|age.?yrs?|patient.?age)"
    r"|^Umar$",
)

_PIN_COL_RX = re.compile(
    r"(?i)(?:^pin$|^pincode$|\b(?:pin_?no|pin_?num|pin_?code|pcode|postcode|post_?code|postal|zip)\b|डाक)"
    r"|^Pin\s*Code$",
)

_AADHAAR_COL_RX = re.compile(
    r"(?i)(?:aadhaar|aadhar|adhar|aadh?a*r|adhr|uidai|(?<![a-z])uid(?:_?(?:no|num|number|id))?\b|आधार)"
    r"|^Aadhar$",
)

_ABHA_COL_RX = re.compile(
    r"(?i)\b(?:abha|health.?id|स्वास्थ्य.?आईडी)\b",
)

_PAN_COL_RX = re.compile(
    r"(?i)(?:\bpan\b|pan.?no|pan.?number|पैन)",
)

_MRN_COL_RX = re.compile(
    r"(?i)(?<![a-z])(?:uhid|mrn|patient.?id|pat.?id|pt.?id|hospital.?id|hosp.?id|hospital_uhid|reg.?no|regn.?no|"
    r"ipd|opd|bill_?no|visit_?id|mr_?(?:no|num|id))(?![a-z])"
    r"|^Reg\s*No$|^patient_ref$|^bill_no$|^PatientID$",
)

_EMAIL_COL_RX = re.compile(
    r"(?i)(?:e.?mail|ईमेल)",
)

_INSURANCE_COL_RX = re.compile(
    r"(?i)(?:insurance|pmjay|policy|bima|बीमा|payer|insurer)",
)

# Word boundaries prevent false matches in "patient", "doctor", "history",
# "hospital_uhid", "admission_date", "collected_on", "reported_on", "DOB"!
_RELATIVE_COL_RX = re.compile(
    r"(?i)(?:guardian|relative|father|mother|spouse|husband|wife|"
    r"\b(?:s|d|w)\s*/\s*o\b|relation|guardian.?name|next.?of.?kin|"
    r"attendant|अभिभावक|संबंधी)"
    r"|\b(?:pita|pati)\b(?:\s*(?:ka\s*)?naam)?",
)

_DISTRICT_COL_RX = re.compile(
    r"(?i)(?:district|distt|जिला|\bdist\b)"
    r"|^Jila$",
)

_TEHSIL_COL_RX = re.compile(
    r"(?i)(?:tehsil|तहसील|taluk|\bblock\b|mandal)"
    r"|^Tehsil$",
)

_LANDMARK_COL_RX = re.compile(
    r"(?i)(?:landmark|निकट|reference.?point)",
)

# Columns that are SAFE (never contain PII directly)
_SAFE_COL_RX = re.compile(
    r"(?i)(?:diagnosis|icd|loinc|procedure|package|medication|drug|dose|"
    r"frequency|vitals|test|result|value|unit|range|status|department|"
    r"\bward\b|\bbed\b|consultant|doctor|amount|inr|rupees|remarks|notes|"
    r"complaint|history|advice|investigation|follow.?up|schedule|"
    r"category|form|strength|sex|gender|ling|"
    r"platelet|wbc|rbc|\bcount\b|level|score|\bval\b|qty|price|cost|fee|total|rate)"
    r"|^Ling$|(?:Val|Count|Amt|Rate|Score|Level)$",
)


class ColumnType:
    """Column classification result."""
    DOCTOR = "DOCTOR"
    PATIENT_NAME = "PATIENT_NAME"
    RELATIVE_NAME = "RELATIVE_NAME"
    PHONE = "PHONE"
    ADDRESS = "ADDRESS"
    VILLAGE = "VILLAGE"
    DOB = "DOB"
    CLINICAL_DATE = "CLINICAL_DATE"
    AGE = "AGE"
    AGE_SEX = "AGE_SEX"
    PIN = "PIN"
    AADHAAR = "AADHAAR"
    ABHA = "ABHA_NUMBER"
    PAN = "PAN"
    MRN = "MRN"
    EMAIL = "EMAIL"
    INSURANCE = "INSURANCE_ID"
    DISTRICT = "DISTRICT"
    TEHSIL = "TEHSIL"
    LANDMARK = "LANDMARK"
    SAFE = "SAFE"
    UNKNOWN = "UNKNOWN"


def classify_column(header: str) -> str:
    """Classify a CSV column header as a PII type, doctor, clinical date, safe, or unknown."""
    h = header.strip()
    if not h:
        return ColumnType.UNKNOWN

    if _DOCTOR_COL_RX.search(h):
        return ColumnType.DOCTOR
    if _AGE_SEX_COL_RX.search(h):
        return ColumnType.AGE_SEX
    if _DOB_COL_RX.search(h):
        return ColumnType.DOB
    if _CLINICAL_DATE_COL_RX.search(h):
        return ColumnType.CLINICAL_DATE
    if _RELATIVE_COL_RX.search(h):
        return ColumnType.RELATIVE_NAME
    if _NAME_COL_RX.search(h) and not _NON_PATIENT_NAME_PREFIX_RX.search(h):
        return ColumnType.PATIENT_NAME
    if _PHONE_COL_RX.search(h):
        return ColumnType.PHONE
    if _AADHAAR_COL_RX.search(h):
        return ColumnType.AADHAAR
    if _ABHA_COL_RX.search(h):
        return ColumnType.ABHA
    if _PAN_COL_RX.search(h):
        return ColumnType.PAN
    if _EMAIL_COL_RX.search(h):
        return ColumnType.EMAIL
    if _INSURANCE_COL_RX.search(h):
        return ColumnType.INSURANCE
    if _MRN_COL_RX.search(h):
        return ColumnType.MRN
    if _AGE_COL_RX.search(h):
        return ColumnType.AGE
    if _PIN_COL_RX.search(h):
        return ColumnType.PIN
    if _VILLAGE_COL_RX.search(h):
        return ColumnType.VILLAGE
    if _ADDRESS_COL_RX.search(h):
        return ColumnType.ADDRESS
    if _DISTRICT_COL_RX.search(h):
        return ColumnType.DISTRICT
    if _TEHSIL_COL_RX.search(h):
        return ColumnType.TEHSIL
    if _LANDMARK_COL_RX.search(h):
        return ColumnType.LANDMARK
    if _SAFE_COL_RX.search(h):
        return ColumnType.SAFE
    return ColumnType.UNKNOWN


def classify_json_key(key: str) -> str:
    """Classify a JSON key as a PII type."""
    return classify_column(key)


# ─────────────────────────────────────────────────────────────────────────────
# Statistical column & contextual leaf inference (Phase 1B)
# ─────────────────────────────────────────────────────────────────────────────

_KNOWN_DISTRICTS = {
    "lucknow", "sitapur", "barabanki", "rae bareli", "raebareli", "unnao", "hardoi",
    "sultanpur", "bahraich", "kanpur", "varanasi", "prayagraj", "allahabad", "agra",
    "meerut", "ghaziabad", "noida", "gorakhpur", "jhansi", "ayodhya", "faizabad",
    "aligarh", "moradabad", "bareilly", "mathura", "gonda", "basti", "shahjahanpur",
    "lakhimpur", "kheri", "pratapgarh", "amethi", "jaunpur", "azamgarh", "mirzapur",
    "लखनऊ", "सीतापुर", "बाराबंकी", "रायबरेली", "उन्नाव", "हरदोई", "सुल्तानपुर", "बहराइच",
    "कानपुर", "वाराणसी", "प्रयागराज", "आगरा", "मेरठ", "गोरखपुर", "अयोध्या",
}

_CLINICAL_VALUE_STOPWORDS = {
    "acute", "chronic", "mild", "moderate", "severe", "type", "stage", "grade",
    "fever", "pain", "cough", "chest", "blood", "count", "complete", "internal",
    "medicine", "surgery", "general", "emergency", "outpatient", "inpatient",
    "follow", "stable", "critical", "normal", "abnormal", "positive", "negative",
    "reactive", "nonreactive", "test", "panel", "profile", "syndrome", "disease",
    "disorder", "infection", "unspecified", "primary", "secondary", "essential",
    "bilateral", "unilateral", "therapy", "treatment", "tablet", "capsule",
    "injection", "syrup", "cream", "drops", "portal", "system", "export",
    "summary", "form", "consent", "card", "ward", "bed", "unit", "department",
    "hospital", "clinic", "charitable", "trust", "multispeciality", "sadan",
    "seva", "centre", "center", "male", "female", "other", "unknown", "pending",
    "completed", "active", "inactive", "admitted", "discharged", "referred",
    "hypertension", "diabetes", "mellitus", "bronchitis", "malaria", "dengue",
    "typhoid", "asthma", "copd", "ckd", "tuberculosis", "anemia", "anaemia",
    "thyroid", "pneumonia", "diarrhea", "vomiting", "headache", "fracture",
    "reg", "opd", "ipd", "icu", "nicu", "picu", "opd", "ecg", "xray", "mri", "ct",
}

_SAFE_INT_KEY_RX = re.compile(
    r"(?i)(?:^|_)(?:count|cnt|total|sum|qty|quantity|days?|duration|stay|los|"
    r"amount|amt|bill|cost|fee|fees|price|rate|inr|rupees|dose|dosage|"
    r"bp|systolic|diastolic|pulse|hr|rr|spo2|temp|temperature|hb|wbc|rbc|"
    r"platelet|glucose|sugar|creatinine|urea|result|value|val|min|max|"
    r"low|high|range|loinc|icd|code|timestamp|ts|epoch|time|year|month|day|"
    r"hour|minute|sec|version|ver|port|status|index|idx|sno|serial|seq|"
    r"room|bed|ward|score|level|age|umar)(?:$|_)"
)

_OBFUSCATED_KEY_RX = re.compile(
    r"(?i)^(?:[a-z]{1,2}\d*|[a-z]{1,3}_\d+|\d+|(?:col|fld|field|attr|key|val|prop|item|f|c|k|x|v)_?[a-z0-9]{1,4})$"
)

_STRICT_PHONE_RX = re.compile(r"^(?:\+?91[\s\-.]?)?[6-9]\d{4}[\s\-.]?\d{5}$")
_STRICT_AADHAAR_RX = re.compile(r"^[2-9]\d{3}[\s\-]?\d{4}[\s\-]?\d{4}$")
_STRICT_ABHA_RX = re.compile(r"^\d{2}[\s\-]?\d{4}[\s\-]?\d{4}[\s\-]?\d{4}$")
_STRICT_PAN_RX = re.compile(r"^[A-Z]{5}\d{4}[A-Z]$")
_STRICT_EMAIL_RX = re.compile(r"^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$")
_STRICT_INS_RX = re.compile(r"^(?:PMJAY|POL)[\-/]?\w{2,4}[\-/]?\d{6,12}$", re.I)
_STRICT_AGE_SEX_RX = re.compile(r"^\d{1,3}\s*(?:yrs?|years?|वर्ष)?\s*/\s*(?:[MFmf]|पुरुष|महिला)$", re.I)
_STRICT_DATE_CELL_RX = re.compile(r"^(?:\d{4}[/\-]\d{1,2}[/\-]\d{1,2}|\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4})$")
_STRICT_ICD10_RX = re.compile(r"^[A-TV-Z]\d{2}(?:\.\d{1,2})?$")
_STRICT_STRUCT_MRN_RX = re.compile(
    r"^[A-Za-z]{2,8}(?:(?:[-/][A-Za-z0-9]{2,8}){1,3}|[-/]?\d{5,9})$"
)
_STRICT_REL_CELL_RX = re.compile(
    r"^(?:(?i:(?:S|D|W|B|M|F|H|C)\s*/\s*O|(?:Son|Daughter|Wife|Husband|Mother|Father|Care)\s+of)\b|"
    r"(?:पिता|माता|पति|अभिभावक))",
)
_STRICT_DR_CELL_RX = re.compile(r"^\s*Dr\.?\s+[A-Z][a-zA-Z.']*(?:\s+[A-Z][a-zA-Z.']*){0,3}\s*$")
_STRICT_TITLE_NAME_RX = re.compile(r"^[A-Z][a-zA-Z.']{1,20}(?:\s+[A-Z][a-zA-Z.']{1,20}){1,3}$")
_STRICT_DEVA_NAME_RX = re.compile(r"^[\u0900-\u097F]{2,20}(?:\s+[\u0900-\u097F]{2,20}){1,3}$")


def is_probable_person_name_value(text: str, require_name_hint: bool = False) -> bool:
    """Return True if a compact value structurally resembles a person name, not clinical/admin text."""
    s = canonical_clean(text, decode_escapes=True).strip()
    if not s or len(s) < 4 or len(s) > 45:
        return False
    if re.match(r"^dr\.?\s", s, re.I):
        return False
    if any(ch.isdigit() for ch in s):
        return False
    if find_medical_spans(s):
        return False
    toks = s.split()
    if not (2 <= len(toks) <= 4):
        return False
    low = s.lower()
    if low in _KNOWN_DISTRICTS:
        return False
    if any(dn in low for dn in DISEASE_NAMES):
        return False
    low_toks = [t.lower().strip(".,;:") for t in toks]
    if any(lt in _CLINICAL_VALUE_STOPWORDS or lt in _KNOWN_DISTRICTS for lt in low_toks):
        return False
    is_shape = bool(_STRICT_TITLE_NAME_RX.match(s) or _STRICT_DEVA_NAME_RX.match(s))
    if not is_shape:
        return False
    if not require_name_hint:
        return True
    return any(
        is_name_token(t) or t in DEVA_FIRST_NAMES or t in DEVA_SURNAMES
        for t in toks
    )


def _infer_single_column(vals: list[str], has_pii_neighbors: bool = False) -> str:
    """Infer column type statistically from non-empty cell values."""
    n = len(vals)
    if n == 0:
        return ColumnType.UNKNOWN

    # 1. Doctor column check FIRST so physician names are never redacted
    if sum(1 for v in vals if _STRICT_DR_CELL_RX.match(v)) / n >= 0.5:
        return ColumnType.DOCTOR

    # 2. High-confidence structured identifier patterns
    for rx, ct, thresh in (
        (_STRICT_PHONE_RX, ColumnType.PHONE, 0.6),
        (_STRICT_AADHAAR_RX, ColumnType.AADHAAR, 0.6),
        (_STRICT_ABHA_RX, ColumnType.ABHA, 0.6),
        (_STRICT_PAN_RX, ColumnType.PAN, 0.6),
        (_STRICT_INS_RX, ColumnType.INSURANCE, 0.6),
        (_STRICT_AGE_SEX_RX, ColumnType.AGE_SEX, 0.6),
    ):
        if sum(1 for v in vals if rx.match(v)) / n >= thresh:
            return ct

    if sum(1 for v in vals if _STRICT_EMAIL_RX.match(v) and not re.search(r"@(?:abdm|ndhm|abha)$", v, re.I)) / n >= 0.6:
        return ColumnType.EMAIL

    # 3. Structural hospital MRN / UHID IDs (excluding ICD-10, clinical terms, and units)
    mrn_hits = sum(
        1 for v in vals
        if 5 <= len(v) <= 24 and sum(c.isdigit() for c in v) >= 4
        and not _STRICT_ICD10_RX.match(v)
        and not _STRICT_DATE_CELL_RX.match(v)
        and not find_medical_spans(v)
        and _STRICT_STRUCT_MRN_RX.match(v)
    )
    if mrn_hits / n >= 0.6:
        return ColumnType.MRN

    # 4. Dates: distinguish DOB (spread historical birth years) from clinical visit dates
    parsed_dates = []
    for v in vals:
        if _STRICT_DATE_CELL_RX.match(v):
            d = parse_date(v)
            if d is not None:
                parsed_dates.append(d)
    if len(parsed_dates) / n >= 0.6:
        years = sorted(d.year for d in parsed_dates)
        med_yr = years[len(years) // 2]
        if med_yr <= 2020 or (years[-1] - years[0] >= 8 and years[0] < 2020):
            return ColumnType.DOB
        return ColumnType.CLINICAL_DATE

    # 5. PIN code (strict 6 digits 1..8, guard against rounded counts/lab values ending in 00)
    pin_vals = [v for v in vals if re.fullmatch(r"[1-8]\d{5}", v)]
    if len(pin_vals) / n >= 0.7:
        non_round = sum(1 for v in pin_vals if int(v) % 100 != 0)
        if non_round / len(pin_vals) >= 0.5:
            return ColumnType.PIN

    # 5b. Pure numeric non-PII column (platelets, WBC, billing amounts) -> protect from PIN false hits
    if sum(1 for v in vals if re.fullmatch(r"-?\d+(?:\.\d+)?", v)) / n >= 0.7:
        return ColumnType.SAFE

    # 6. District column (preserve administrative district, never mistake for PATIENT_NAME)
    if sum(1 for v in vals if v.lower() in _KNOWN_DISTRICTS) / n >= 0.6:
        return ColumnType.DISTRICT

    # 7. Relative column
    if sum(1 for v in vals if _STRICT_REL_CELL_RX.match(v)) / n >= 0.5:
        return ColumnType.RELATIVE_NAME

    # 8. Person names (guard strictly against clinical text, diagnoses, labs, institutions)
    med_hits = sum(
        1 for v in vals
        if find_medical_spans(v)
        or any(ch.isdigit() for ch in v)
        or len(v.split()) >= 5
        or any(w.lower().strip(".,;:") in _CLINICAL_VALUE_STOPWORDS for w in v.split())
    )
    if med_hits / n < 0.2:
        name_hits = sum(1 for v in vals if is_probable_person_name_value(v, require_name_hint=False))
        hint_hits = sum(1 for v in vals if is_probable_person_name_value(v, require_name_hint=True))
        if name_hits / n >= 0.65 and (hint_hits >= 1 or has_pii_neighbors):
            return ColumnType.PATIENT_NAME

    return ColumnType.UNKNOWN


def infer_csv_column_types(header: list[str], body: list[list[str]]) -> list[str]:
    """Classify CSV columns using headers first, then statistical profiling on UNKNOWN columns."""
    col_types = [classify_column(h) for h in header]
    if not body or ColumnType.UNKNOWN not in col_types:
        return col_types

    sample_rows = body[:200]
    col_samples: list[list[str]] = []
    for j in range(len(header)):
        vals = []
        for row in sample_rows:
            if j < len(row):
                v = canonical_clean(row[j], decode_escapes=True).strip()
                if v:
                    vals.append(v)
        col_samples.append(vals)

    # First pass infers high-precision IDs/dates/districts; second pass uses neighbor context
    for j, ct in enumerate(col_types):
        if ct == ColumnType.UNKNOWN:
            inferred = _infer_single_column(col_samples[j], has_pii_neighbors=False)
            if inferred != ColumnType.UNKNOWN:
                col_types[j] = inferred

    has_pii_neighbors = any(
        ct in (ColumnType.PATIENT_NAME, ColumnType.MRN, ColumnType.PHONE,
               ColumnType.AADHAAR, ColumnType.ABHA, ColumnType.DOB, ColumnType.PIN)
        for ct in col_types
    )
    if has_pii_neighbors:
        for j, ct in enumerate(col_types):
            if ct == ColumnType.UNKNOWN:
                inferred = _infer_single_column(col_samples[j], has_pii_neighbors=True)
                if inferred != ColumnType.UNKNOWN:
                    col_types[j] = inferred

    return col_types


def infer_json_int_type(key: str, val: int, parent_key: str = "",
                        sibling_keys: set[str] | None = None) -> str:
    """Contextually classify integer leaves under unknown/misspelled JSON keys."""
    if isinstance(val, bool) or val < 0:
        return ColumnType.UNKNOWN

    kl = canonical_clean(key, decode_escapes=True).lower().strip()
    pkl = canonical_clean(parent_key, decode_escapes=True).lower().strip()
    ct = classify_column(kl)
    if ct == ColumnType.DOCTOR:
        return ColumnType.SAFE
    if ct in (ColumnType.AADHAAR, ColumnType.ABHA, ColumnType.PHONE,
              ColumnType.PIN, ColumnType.MRN, ColumnType.AGE):
        return ct

    if _SAFE_INT_KEY_RX.search(kl) or pkl in ("labs", "results", "vitals", "billing", "rx", "panels", "package"):
        return ColumnType.SAFE

    s = str(val)
    n = len(s)
    if n == 14 and s[0] != "0":
        return ColumnType.ABHA
    if n == 12:
        if s.startswith("91") and len(s) == 12 and s[2] in "6789" and any(w in kl for w in ("mob", "ph", "tel", "cell", "call")):
            return ColumnType.PHONE
        if s[0] in "23456789":
            return ColumnType.AADHAAR
    if n == 10 and s[0] in "6789":
        return ColumnType.PHONE
    if n == 6 and s[0] in "12345678" and (val % 100 != 0):
        sibs = sibling_keys or set()
        if ("address" in pkl or any(x in kl for x in ("pin", "zip", "post", "addr", "loc"))
                or any(sk in sibs for sk in ("address", "district", "dist", "tehsil", "village", "mohalla"))):
            return ColumnType.PIN

    return ColumnType.UNKNOWN


def is_obfuscated_json_key(key: str) -> bool:
    """Return True if a JSON key is likely synthetic/obfuscated (c0, x_1, fld_2)."""
    return bool(_OBFUSCATED_KEY_RX.match(key.strip()))
