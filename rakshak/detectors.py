"""PII detection engine: regex patterns for Indian identifiers, names, addresses."""
from __future__ import annotations

import re
import unicodedata
from typing import NamedTuple

# ─────────────────────────────────────────────────────────────────────────────
# Detection result
# ─────────────────────────────────────────────────────────────────────────────
class PIIMatch(NamedTuple):
    type: str       # PHONE, AADHAAR, PAN, EMAIL, MRN, ABHA_NUMBER, etc.
    start: int
    end: int
    surface: str
    role: str       # "patient" or "relative"


# ─────────────────────────────────────────────────────────────────────────────
# Compiled patterns
# ─────────────────────────────────────────────────────────────────────────────

# Indian phone: 10 digits starting with 6-9, optionally prefixed with +91 or 91
PHONE_RX = re.compile(
    r"(?<!\d)(?:\+?91[\s\-.]?)?"
    r"([6-9]\d{4}[\s\-.]?\d{5})"
    r"(?!\d)",
)

# Devanagari phone numbers (10 Devanagari digits: ०-९)
DEVA_PHONE_RX = re.compile(
    r"(?<![\u0966-\u096F])([\u0966-\u096F]{5}[\s\-]?[\u0966-\u096F]{5})(?![\u0966-\u096F])"
)

# Aadhaar: 12 digits in groups of 4
AADHAAR_RX = re.compile(
    r"(?<!\d)"
    r"(\d{4}[\s\-]?\d{4}[\s\-]?\d{4})"
    r"(?!\d)",
)

# Masked Aadhaar: XXXX XXXX 1234 or ****-****-1234
AADHAAR_MASKED_RX = re.compile(
    r"(?i)(?:[Xx*]{4}[\s\-]?[Xx*]{4}[\s\-]?\d{4})"
)

# ABHA Number: 14 digits
ABHA_RX = re.compile(
    r"(?<!\d)(\d{2}[\s\-]?\d{4}[\s\-]?\d{4}[\s\-]?\d{4})(?!\d)",
)

# PAN: 5 upper alpha + 4 digits + 1 upper alpha
PAN_RX = re.compile(r"\b([A-Z]{5}\d{4}[A-Z])\b")

# Email
EMAIL_RX = re.compile(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}")

# PMJAY / Insurance ID
INSURANCE_RX = re.compile(r"\b(PMJAY[\-/]?\w{2}[\-/]?\d{8,12})\b", re.I)

# PIN code (6 digits, Indian: starts with 1-9)
PIN_RX = re.compile(r"(?<!\d)([1-9]\d{5})(?!\d)")

# MRN / UHID patterns from hospitals
MRN_PATTERNS = [
    re.compile(r"\bUHID[\-/]?\d{5,7}\b", re.I),
    re.compile(r"\bSNJ[\-/]\d{2}[\-/]\d{5,6}\b", re.I),
    re.compile(r"\bJJH[\-/]?\d{6,8}\b", re.I),
    re.compile(r"\bDHH[\-/]IPD[\-/]?\d{4,8}\b", re.I),
    re.compile(r"\bDHH\d{4}[\-/]?\d{5,6}\b", re.I),
    re.compile(r"\bIP[\-/]\d{2}[\-/]\d{4,5}\b", re.I),
    re.compile(r"\bIPD[\-/]\d{4}[\-/]\d{4,5}\b", re.I),
    re.compile(r"\bADM\d{5,6}\b", re.I),
    re.compile(r"\bOPD[\-/]\d{2}[\-/]\d{2,4}[\-/]\d{4,5}\b", re.I),
    re.compile(r"\bBL[\-/]\d{2}[\-/]\d{5,6}\b", re.I),
    re.compile(r"\bPOL[\-/]\d{2}[\-/]\d{6,8}\b", re.I),
]

# ABHA Address (email-like but @abdm, @ndhm, @abha)
ABHA_ADDR_RX = re.compile(r"[a-zA-Z0-9._\-]+@(?:abdm|ndhm|abha)\b", re.I)

# Date patterns (we detect but handle specially - shift rather than remove)
DATE_RX = re.compile(
    r"(?<!\d)"
    r"(?:"
    r"\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4}"   # dd/mm/yyyy or mm/dd/yyyy
    r"|\d{4}[/\-]\d{1,2}[/\-]\d{1,2}"          # yyyy-mm-dd
    r")"
    r"(?!\d)",
)

# DOB label patterns
DOB_LABEL_RX = re.compile(
    r"(?i)(?:DOB|Date\s+of\s+Birth|जन्म\s*तिथि)\s*[:=]?\s*"
    r"(\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4}|\d{4}[/\-]\d{1,2}[/\-]\d{1,2})",
)

# Age patterns (for generalization, not removal)
AGE_RX = re.compile(
    r"(?i)"
    r"(?:"
    r"(?:age|आयु|उम्र)\s*[:/-]?\s*(\d{1,3})\s*(?:yrs?|years?|वर्ष|Y)?"
    r"|(\d{1,3})\s*(?:yrs?|years?|वर्ष)\s*(?:[/\-]\s*[MFmf])?"
    r"|(\d{1,3})\s*/\s*[MFmf]"
    r")"
)

# ─────────────────────────────────────────────────────────────────────────────
# Name detection patterns
# ─────────────────────────────────────────────────────────────────────────────

# Name label anchors in Latin (avoid matching "patient_ref" whose value is an MRN)
NAME_LABEL_RX = re.compile(
    r"(?i)"
    r"(?:Patient\s*(?:'s)?\s*Name|Name|patient_name)"
    r"\s*[:=]\s*"
    r"([A-Z][a-zA-Z.']*(?:\s+[A-Z][a-zA-Z.']*){0,3})",
)

# Hindi patient label: requires colon/equals after नाम (avoids capturing "का नाम" before colon!)
HINDI_NAME_RX = re.compile(
    r"(?:(?:मरीज़|मरीज|रोगी)\s+(?:का\s+)?नाम|(?<!का\s)नाम)\s*[:=]\s*"
    r"([\u0900-\u097F]+(?: [\u0900-\u097F]+){0,3})",
)

# Relative label anchors (S/o, D/o, W/o, and Hindi पिता/माता/पति का नाम:)
RELATIVE_LABEL_RX = re.compile(
    r"(?:"
    r"(?i:(?:S|D|W)\s*/\s*(?:o|O)|Son\s+of|Daughter\s+of|Wife\s+of)\s+"
    r"|(?:पिता|माता|पति|अभिभावक)\s+(?:का\s+)?नाम\s*[:=]\s*"
    r")([A-Z\u0900-\u097F][a-zA-Z\u0900-\u097F\s.']{1,45}?)"
    r"(?=[,\n;|\"}\]()\.]|\s{2,}|\s+(?:aged?|आयु|उम्र|mob|ph)\b|$)",
)

# Doctor pattern (DO NOT REDACT — keep case-sensitive capitalized name after Dr.)
DOCTOR_RX = re.compile(
    r"\bDr\.?\s+([A-Z][a-zA-Z.']+(?:\s+[A-Z][a-zA-Z.']+){0,3})",
    re.UNICODE,
)


def find_doctor_spans(text: str) -> list[tuple[int, int]]:
    """Return protected character spans covering doctor names (e.g. 'Dr. Ramesh Srivastava')."""
    spans: list[tuple[int, int]] = []
    for rx in (
        re.compile(r"\b[Dd][Rr]\.?\s+[A-Z][a-zA-Z.']+(?:\s+[A-Z][a-zA-Z.']+){0,3}"),
    ):
        for m in rx.finditer(text):
            spans.append((m.start(), m.end()))
    return spans

# Village / Gram pattern
VILLAGE_LABEL_RX = re.compile(
    r"(?i)(?:Vill\.?|Village|ग्राम|Gram|गांव)\s*[:=.]?\s*"
    r"([A-Z\u0900-\u097F][a-zA-Z\u0900-\u097F\s]{2,40}?)(?=[,\n;|\"}\]]|$)",
)

# House / Address patterns
HOUSE_RX = re.compile(
    r"(?i)(?:H\.?\s*No\.?\s*|House\s*(?:No\.?\s*)?|मकान\s*(?:नं\.?\s*)?)\s*(\d{1,4}[A-Za-z]?)",
)

# Do NOT include bare "Ward" here so clinical "Ward 8 (Medicine)" / "Ward Male" is preserved;
# address-line "Ward N" is handled contextually by _ADDR_WARD_RX.
MOHALLA_RX = re.compile(
    r"(?i)(?:Mohalla|मोहल्ला)\s*[:.]?\s*([A-Z\u0900-\u097F][a-zA-Z\u0900-\u097F\s]{2,40}?)(?=[,\n;|\"}\]]|$)",
)

LANDMARK_RX = re.compile(
    r"(?i)(?:near|निकट|पास|opp\.?|opposite)\s+"
    r"([A-Z\u0900-\u097F][a-zA-Z\u0900-\u097F\s]{3,50}?)(?=[,\n;|\"}\]]|$)",
)

# Full address line (after Address: label)
ADDRESS_LABEL_RX = re.compile(
    r"(?i)(?:Address|पता)\s*[:=]\s*([^\n]{5,200})",
)


def normalize_text(s: str) -> str:
    """NFKC normalize, casefold, strip zero-width chars."""
    s = unicodedata.normalize("NFKC", s)
    # Remove zero-width chars
    s = re.sub(r"[\u200b\u200c\u200d\u200e\u200f\ufeff]", "", s)
    return s


def find_phones(text: str) -> list[PIIMatch]:
    """Find Indian phone numbers, avoiding dose patterns."""
    results = []
    for m in PHONE_RX.finditer(text):
        surface = m.group(0)
        # Skip if preceded by dose context
        pre = text[max(0, m.start()-15):m.start()].lower()
        if any(x in pre for x in ["mg", "ml", "dose", "tab", "inj", "cap", "unit",
                                    "loinc", "range", "ref", "icd", "code"]):
            continue
        # Strip all non-digit characters then strip optional country code (91) to get local digits
        digits_only = re.sub(r"\D", "", surface)
        if digits_only.startswith("91") and len(digits_only) == 12:
            digits_only = digits_only[2:]
        if len(digits_only) != 10:
            continue
        # Must start with 6-9
        if digits_only[0] not in "6789":
            continue
        results.append(PIIMatch("PHONE", m.start(), m.end(), surface, "patient"))
    return results


def find_aadhaar(text: str) -> list[PIIMatch]:
    """Find Aadhaar numbers (12 digits), avoiding false positives."""
    results = []
    for m in AADHAAR_RX.finditer(text):
        surface = m.group(0)
        digits = re.sub(r"[\s\-]", "", surface)
        if len(digits) != 12:
            continue
        # Aadhaar starts with 2-9
        if digits[0] in "01":
            continue
        # Skip UUIDs, timestamps
        pre = text[max(0, m.start()-10):m.start()].lower()
        if any(x in pre for x in ["uuid", "id:", "urn:", "timestamp"]):
            continue
        results.append(PIIMatch("AADHAAR", m.start(), m.end(), surface, "patient"))
    return results


def find_masked_aadhaar(text: str) -> list[PIIMatch]:
    results = []
    for m in AADHAAR_MASKED_RX.finditer(text):
        results.append(PIIMatch("AADHAAR_MASKED", m.start(), m.end(), m.group(0), "patient"))
    return results


def find_abha(text: str) -> list[PIIMatch]:
    """Find ABHA numbers (14 digits)."""
    results = []
    for m in ABHA_RX.finditer(text):
        digits = re.sub(r"[\s\-]", "", m.group(0))
        if len(digits) != 14:
            continue
        results.append(PIIMatch("ABHA_NUMBER", m.start(), m.end(), m.group(0), "patient"))
    return results


def find_pan(text: str) -> list[PIIMatch]:
    results = []
    for m in PAN_RX.finditer(text):
        results.append(PIIMatch("PAN", m.start(), m.end(), m.group(0), "patient"))
    return results


def find_email(text: str) -> list[PIIMatch]:
    results = []
    for m in EMAIL_RX.finditer(text):
        # Skip ABHA addresses (keep those separate)
        if re.search(r"@(?:abdm|ndhm|abha)", m.group(0), re.I):
            continue
        results.append(PIIMatch("EMAIL", m.start(), m.end(), m.group(0), "patient"))
    return results


def find_abha_address(text: str) -> list[PIIMatch]:
    results = []
    for m in ABHA_ADDR_RX.finditer(text):
        results.append(PIIMatch("ABHA_ADDRESS", m.start(), m.end(), m.group(0), "patient"))
    return results


def find_insurance(text: str) -> list[PIIMatch]:
    results = []
    for m in INSURANCE_RX.finditer(text):
        results.append(PIIMatch("INSURANCE_ID", m.start(), m.end(), m.group(0), "patient"))
    return results


def find_mrn(text: str) -> list[PIIMatch]:
    """Find MRN / UHID / IPD / admission numbers."""
    results = []
    for rx in MRN_PATTERNS:
        for m in rx.finditer(text):
            results.append(PIIMatch("MRN", m.start(), m.end(), m.group(0), "patient"))
    return results


def find_pin(text: str) -> list[PIIMatch]:
    """Find 6-digit Indian PIN codes."""
    results = []
    for m in PIN_RX.finditer(text):
        pin_val = m.group(1)
        # Indian PINs: first digit 1-9, common ranges
        first = int(pin_val[0])
        if first < 1 or first > 8:
            continue
        # Avoid matching amounts, lab values, etc.
        pre = text[max(0, m.start()-10):m.start()].lower()
        post = text[m.end():min(len(text), m.end()+10)].lower()
        if any(x in pre for x in ["rs", "inr", "₹", "amount", "bill", "code", "loinc",
                                    "package", "result"]):
            continue
        if any(x in post for x in ["mg", "ml", "dl", "g/dl", "/ul", "/mm"]):
            continue
        results.append(PIIMatch("PIN", m.start(), m.end(), pin_val, "patient"))
    return results


def find_all_identifiers(text: str) -> list[PIIMatch]:
    """Run all identifier detectors and return merged, non-overlapping matches."""
    all_matches = []
    all_matches.extend(find_phones(text))
    all_matches.extend(find_aadhaar(text))
    all_matches.extend(find_masked_aadhaar(text))
    all_matches.extend(find_abha(text))
    all_matches.extend(find_abha_address(text))
    all_matches.extend(find_pan(text))
    all_matches.extend(find_email(text))
    all_matches.extend(find_insurance(text))
    all_matches.extend(find_mrn(text))

    # De-overlap: longer matches win, then earlier position
    all_matches.sort(key=lambda m: (-len(m.surface), m.start))
    keep = []
    occupied = set()
    for m in all_matches:
        span = set(range(m.start, m.end))
        if not span & occupied:
            keep.append(m)
            occupied |= span
    return sorted(keep, key=lambda m: m.start)
