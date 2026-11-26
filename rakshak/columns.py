"""Column-aware PII detection: identifies PII columns by name heuristics."""
from __future__ import annotations

import re

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
    r"(?i)(?:(?<![a-z])(?:patient|pt|mriiz|member|client|applicant|beneficiary|patient's)[_\s]*)?"
    r"(?<![a-z])(?:patient_name|full_?name|first_?name|last_?name|given_?name|family_?name|surname|naam)\b"
    r"|(?<![a-z])name\b"
    r"|(?:Full|First|Last|Patient|Member)Name\b"
    r"|नाम|^Naam$",
)

_PHONE_COL_RX = re.compile(
    r"(?i)\b(?:phone|mobile|contact|tel|cell|mob|telephone|दूरभाष|मोबाइल|"
    r"contact.?no|phone.?no|mobile.?no|contact.?number|callback)\b"
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
    r"(?i)(?:\bdob\b|date.?of.?birth|birth.?date|जन्म.?तिथि|DOB\s*\(|born)"
    r"|^Janm\s*Tithi$",
)

_AGE_COL_RX = re.compile(
    r"(?i)(?:^age$|^आयु$|^उम्र$|age.?yrs?|patient.?age)"
    r"|^Umar$",
)

_PIN_COL_RX = re.compile(
    r"(?i)(?:^pin$|^pincode$|zip|postal|डाक)"
    r"|^Pin\s*Code$",
)

_AADHAAR_COL_RX = re.compile(
    r"(?i)(?:aadhaar|aadhar|\buid\b|आधार)"
    r"|^Aadhar$",
)

_ABHA_COL_RX = re.compile(
    r"(?i)\b(?:abha|health.?id|स्वास्थ्य.?आईडी)\b",
)

_PAN_COL_RX = re.compile(
    r"(?i)(?:\bpan\b|pan.?no|pan.?number|पैन)",
)

_MRN_COL_RX = re.compile(
    r"(?i)(?:\buhid\b|\bmrn\b|patient.?id|hospital.?id|hospital_uhid|reg.?no|"
    r"\bipd\b|\bopd\b|\bbill_?no\b|visit_?id)"
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
    if _NAME_COL_RX.search(h):
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
