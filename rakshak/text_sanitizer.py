"""Text sanitizer: free-text cleaning for discharge summaries, prescriptions, nursing notes."""
from __future__ import annotations

import datetime as dt
import re
from .detectors import (
    find_all_identifiers, find_pin, find_doctor_spans,
    NAME_LABEL_RX, DEVA_PHONE_RX, RELATIVE_LABEL_RX, HINDI_NAME_RX,
    ADDRESS_LABEL_RX, HOUSE_RX, MOHALLA_RX, LANDMARK_RX, VILLAGE_LABEL_RX,
    DOB_LABEL_RX, DATE_RX,
)
from .names import find_names_in_text, compile_gazetteer_rx
from .medical import find_medical_spans, overlaps_medical, DISEASE_NAMES
from .privacy import generalize_age_in_text, shift_date_string, shift_date

_MONTH_DATE_RX = re.compile(
    r"\b(\d{1,2})\s+(January|February|March|April|May|June|July|August|"
    r"September|October|November|December)(?:\s+(20\d{2}|19\d{2}))?\b",
    re.I,
)
_MONTHS = {
    "january": 1, "february": 2, "march": 3, "april": 4,
    "may": 5, "june": 6, "july": 7, "august": 8,
    "september": 9, "october": 10, "november": 11, "december": 12,
}
_MONTH_NAMES = [
    "", "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
]

_CO_REL_RX = re.compile(
    r"(?<![A-Za-z/])\b[Cc]/?[Oo]\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})"
)
_CO_NON_NAME_WORDS = {
    "diabetes", "mellitus", "hypertension", "asthma", "tuberculosis",
    "chronic", "acute", "typhoid", "dengue", "malaria", "anemia", "anaemia",
    "thyroid", "hypothyroidism", "hyperthyroidism", "coronary", "heart",
    "renal", "kidney", "liver", "stroke", "copd", "ckd", "bph", "ihd",
    "fever", "pain", "cough", "vomiting", "diarrhea", "weakness", "dyspnea",
    "chest", "burning", "swelling", "bleeding", "nausea", "fatigue",
}
_ADDR_WARD_RX = re.compile(r"(?i)(?:Address|Addr|C/O)[^\n]*?\bWard\s+(\d+)\b")


def _overlaps_any(s: int, e: int, spans: list[tuple[int, int]]) -> bool:
    for rs, re_ in spans:
        if s < re_ and e > rs:
            return True
    return False


def _overlaps_repls(s: int, e: int, repls: list[tuple[int, int, str]]) -> bool:
    for rs, re_, _ in repls:
        if s < re_ and e > rs:
            return True
    return False


class TextSanitizer:
    """Sanitize free-text documents (discharge summaries, prescriptions, notes)."""

    def __init__(self, known_names: set[str] | None = None,
                 patient_key: str | None = None,
                 pseudonym: str | None = None,
                 date_hint: str = "dmy",
                 enable_pin: bool = True,
                 gazetteer_rx: re.Pattern | None = None):
        self.known_names = known_names or set()
        self.patient_key = patient_key
        self.pseudonym = pseudonym
        self.date_hint = date_hint
        self.enable_pin = enable_pin
        self.gazetteer_rx = gazetteer_rx if gazetteer_rx is not None else compile_gazetteer_rx(self.known_names)

    def sanitize(self, text: str) -> str:
        """Full sanitization pipeline for a text document."""
        medical_spans = find_medical_spans(text)
        doctor_spans = find_doctor_spans(text)

        # (start, end, replacement)
        replacements: list[tuple[int, int, str]] = []

        # 0.5 Devanagari phone numbers (hard PII)
        for m in DEVA_PHONE_RX.finditer(text):
            if not _overlaps_repls(m.start(), m.end(), replacements):
                replacements.append((m.start(), m.end(), "[PHONE]"))

        # 1. Hard & soft identifiers (MRN/PHONE/AADHAAR/ABHA/PAN/EMAIL/INSURANCE always win)
        _HARD_PII_TYPES = {"MRN", "PHONE", "AADHAAR", "AADHAAR_MASKED", "ABHA_NUMBER",
                           "ABHA_ADDRESS", "PAN", "EMAIL", "INSURANCE_ID"}
        for m in find_all_identifiers(text):
            if m.type in _HARD_PII_TYPES:
                if not _overlaps_repls(m.start, m.end, replacements):
                    replacements.append((m.start, m.end, f"[{m.type}]"))
            elif not overlaps_medical(m.start, m.end, medical_spans):
                if not _overlaps_repls(m.start, m.end, replacements):
                    replacements.append((m.start, m.end, f"[{m.type}]"))

        # 2. Names from labels, honorifics, relatives, contextual cues, and gazetteer
        for nm in find_names_in_text(text, self.known_names, self.gazetteer_rx):
            if nm.role == "doctor":
                continue
            if _overlaps_any(nm.start, nm.end, doctor_spans):
                continue
            if nm.role != "context" and overlaps_medical(nm.start, nm.end, medical_spans):
                continue
            surface_lower = nm.surface.lower()
            if any(dn in surface_lower for dn in DISEASE_NAMES):
                continue
            pre = text[max(0, nm.start - 10):nm.start].lower()
            if "asha" in pre and "worker" in text[nm.start:nm.end + 10].lower():
                continue
            if _overlaps_repls(nm.start, nm.end, replacements):
                continue
            label = self.pseudonym if (self.pseudonym and nm.role == "patient") else (
                "[RELATIVE]" if nm.role == "relative" else "[NAME]"
            )
            replacements.append((nm.start, nm.end, label))

        # 3. Additional labelled names & relative labels
        for rx, label in [(NAME_LABEL_RX, "[NAME]"), (HINDI_NAME_RX, "[NAME]")]:
            for m in rx.finditer(text):
                name_part = m.group(1).strip() if m.lastindex else m.group(0)
                if not name_part:
                    continue
                name_start = m.start() + m.group(0).find(name_part)
                name_end = name_start + len(name_part)
                if _overlaps_any(name_start, name_end, doctor_spans):
                    continue
                if overlaps_medical(name_start, name_end, medical_spans):
                    continue
                if not _overlaps_repls(name_start, name_end, replacements):
                    repl = self.pseudonym if self.pseudonym and label == "[NAME]" else label
                    replacements.append((name_start, name_end, repl))

        # RELATIVE_LABEL_RX: S/o, D/o, W/o always replace regardless of medical spans
        for m in RELATIVE_LABEL_RX.finditer(text):
            name_part = m.group(1).strip() if m.lastindex else m.group(0)
            if not name_part:
                continue
            name_start = m.start() + m.group(0).find(name_part)
            name_end = name_start + len(name_part)
            if _overlaps_any(name_start, name_end, doctor_spans):
                continue
            if not _overlaps_repls(name_start, name_end, replacements):
                replacements.append((name_start, name_end, "[RELATIVE]"))

        # 3b. C/O relative pattern "C/O Ramesh Yadav" (never K/C/O or medical complaints)
        for m in _CO_REL_RX.finditer(text):
            name_part = m.group(1).strip()
            if name_part.split()[0].lower() in _CO_NON_NAME_WORDS:
                continue
            name_start = m.start(1)
            name_end = m.end(1)
            if _overlaps_any(name_start, name_end, doctor_spans):
                continue
            if not _overlaps_repls(name_start, name_end, replacements):
                replacements.append((name_start, name_end, "[RELATIVE]"))

        # 3c. Address line street/house/mohalla/village/tehsil (preserve ", Distt. ... - PIN")
        for m in ADDRESS_LABEL_RX.finditer(text):
            addr = m.group(1)
            addr_start = m.start() + m.group(0).find(addr)
            # Keep ", Distt. ..." / ", District ..." suffix (preserves district utility + PIN handled below)
            split_m = re.search(r",\s*(?:Distt?\.?|District|जिला)\b", addr, re.I)
            redact_end = addr_start + split_m.start() if split_m else addr_start + len(addr)
            if redact_end > addr_start and not _overlaps_repls(addr_start, redact_end, replacements):
                replacements.append((addr_start, redact_end, "[ADDRESS]"))

        # 4. Address-context Ward/locality & standalone Address components
        for m in _ADDR_WARD_RX.finditer(text):
            ward_text = f"Ward {m.group(1)}"
            w_pos = m.start() + m.group(0).find(ward_text)
            if w_pos < 0:
                continue
            w_end = w_pos + len(ward_text)
            if not _overlaps_repls(w_pos, w_end, replacements):
                replacements.append((w_pos, w_end, "[LOCALITY]"))

        for rx, label in [(HOUSE_RX, "[HOUSE]"), (MOHALLA_RX, "[LOCALITY]"),
                           (LANDMARK_RX, "[LANDMARK]")]:
            for m in rx.finditer(text):
                s, e = m.start(), m.end()
                if not _overlaps_repls(s, e, replacements):
                    if not overlaps_medical(s, e, medical_spans):
                        replacements.append((s, e, label))

        # 5. Village names
        for m in VILLAGE_LABEL_RX.finditer(text):
            village = m.group(1).strip()
            vs = m.start() + m.group(0).find(village)
            ve = vs + len(village)
            if not _overlaps_repls(vs, ve, replacements):
                replacements.append((vs, ve, "[VILLAGE]"))

        # 6. DOB (shift if patient key available)
        for m in DOB_LABEL_RX.finditer(text):
            date_str = m.group(1)
            ds = m.start() + m.group(0).find(date_str)
            de = ds + len(date_str)
            if not _overlaps_repls(ds, de, replacements):
                if self.patient_key:
                    shifted = shift_date_string(date_str, self.patient_key, self.date_hint)
                    replacements.append((ds, de, shifted))
                else:
                    replacements.append((ds, de, "[DOB]"))

        # 7. PIN codes (skip when cleaning numeric lab/amount columns)
        if self.enable_pin:
            for m in find_pin(text):
                if not overlaps_medical(m.start, m.end, medical_spans):
                    if not _overlaps_repls(m.start, m.end, replacements):
                        pin_gen = m.surface[:3] + "***" if len(m.surface) >= 6 else "[PIN]"
                        replacements.append((m.start, m.end, pin_gen))

        # 8. Known names gazetteer fallback — skip doctors, medical spans, and covered spans
        if self.gazetteer_rx is not None:
            for m in self.gazetteer_rx.finditer(text):
                pos, end = m.start(), m.end()
                if pos > 0 and text[pos - 1].isdigit():
                    continue
                if end < len(text) and text[end].isdigit():
                    continue
                if _overlaps_any(pos, end, doctor_spans):
                    continue
                if overlaps_medical(pos, end, medical_spans):
                    continue
                if not _overlaps_repls(pos, end, replacements):
                    repl = self.pseudonym if self.pseudonym else "[NAME]"
                    replacements.append((pos, end, repl))

        # Deterministic sort: earlier start first, longest span first on ties
        replacements.sort(key=lambda x: (x[0], -(x[1] - x[0]), x[2]))
        filtered = []
        last_end = -1
        for s, e, r in replacements:
            if s >= last_end:
                filtered.append((s, e, r))
                last_end = e

        result = text
        for s, e, r in reversed(filtered):
            result = result[:s] + r + result[e:]

        # Generalize ages in text (including 48/F, Age: 48, आयु: 65 वर्ष)
        result = generalize_age_in_text(result)

        # Shift remaining dates if patient key available
        if self.patient_key:
            result = self._shift_dates_in_text(result)

        return result

    def _shift_dates_in_text(self, text: str) -> str:
        """Shift all numeric and month-name dates in text by the patient's secret offset."""
        def replace_date(m):
            return shift_date_string(m.group(0), self.patient_key, self.date_hint)

        text = DATE_RX.sub(replace_date, text)

        def replace_month_date(m):
            day = int(m.group(1))
            month = _MONTHS[m.group(2).lower()]
            yr_str = m.group(3)
            year = int(yr_str) if yr_str else 2026
            try:
                d = dt.date(year, month, day)
            except ValueError:
                return m.group(0)
            shifted = shift_date(d, self.patient_key)
            if yr_str:
                return f"{shifted.day} {_MONTH_NAMES[shifted.month]} {shifted.year}"
            return f"{shifted.day} {_MONTH_NAMES[shifted.month]}"

        return _MONTH_DATE_RX.sub(replace_month_date, text)
