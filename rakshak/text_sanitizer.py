"""Text sanitizer: free-text cleaning for discharge summaries, prescriptions, nursing notes."""
from __future__ import annotations

import base64 as b64mod
import datetime as dt
import re
from .detectors import (
    find_all_identifiers_raw, _find_pin_raw, find_doctor_spans,
    normalize_with_map, map_norm_span,
    try_decode_b64_text, try_decode_hex_text,
    NAME_LABEL_RX, RELATIVE_LABEL_RX, HINDI_NAME_RX,
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
_INLINE_B64_RX = re.compile(r"(?<![A-Za-z0-9+/])[A-Za-z0-9+/]{24,}={0,2}(?![A-Za-z0-9+/=])")
_INLINE_HEX_RX = re.compile(r"(?<![0-9a-fA-F])[0-9a-fA-F]{24,}(?![0-9a-fA-F])")


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
                 gazetteer_rx: re.Pattern | None = None,
                 _decode_containers: bool = True):
        self.known_names = known_names or set()
        self.patient_key = patient_key
        self.pseudonym = pseudonym
        self.date_hint = date_hint
        self.enable_pin = enable_pin
        self.gazetteer_rx = gazetteer_rx if gazetteer_rx is not None else compile_gazetteer_rx(self.known_names)
        self._decode_containers = _decode_containers

    def _scrub_inline_encoded(self, text: str) -> str:
        """Sanitize embedded base64 and hex-encoded UTF-8 payloads inside free text."""
        if not self._decode_containers or len(text) < 24:
            return text
        child: TextSanitizer | None = None

        def _get_child() -> TextSanitizer:
            nonlocal child
            if child is None:
                child = TextSanitizer(
                    known_names=self.known_names,
                    patient_key=self.patient_key,
                    pseudonym=self.pseudonym,
                    date_hint=self.date_hint,
                    enable_pin=self.enable_pin,
                    gazetteer_rx=self.gazetteer_rx,
                    _decode_containers=False,
                )
            return child

        if len(text) >= 24:
            def _rep_hex(m: re.Match) -> str:
                tok = m.group(0)
                if len(tok) % 2 != 0:
                    return tok
                pre = text[max(0, m.start() - 12):m.start()].lower()
                if any(w in pre for w in ("sha256", "sha1", "md5", "hash", "uuid")):
                    return tok
                dec = try_decode_hex_text(tok)
                if dec is None:
                    return tok
                cleaned = _get_child().sanitize(dec)
                return cleaned.encode("utf-8").hex() if cleaned != dec else tok

            text = _INLINE_HEX_RX.sub(_rep_hex, text)

            def _rep_b64(m: re.Match) -> str:
                tok = m.group(0)
                if not any(c in "+/=0123456789" for c in tok):
                    return tok
                dec = try_decode_b64_text(tok)
                if dec is None:
                    return tok
                cleaned = _get_child().sanitize(dec)
                return b64mod.b64encode(cleaned.encode("utf-8")).decode("ascii") if cleaned != dec else tok

            text = _INLINE_B64_RX.sub(_rep_b64, text)
        return text

    def sanitize(self, text: str) -> str:
        """Full sanitization pipeline for a text document."""
        text = self._scrub_inline_encoded(text)
        norm_text, s_map, e_map = normalize_with_map(text, decode_escapes=True)

        medical_spans = find_medical_spans(norm_text)
        doctor_spans = find_doctor_spans(norm_text)

        # (orig_start, orig_end, replacement)
        replacements: list[tuple[int, int, str]] = []

        def _add_repl(ns: int, ne: int, repl: str) -> bool:
            os_idx, oe_idx = map_norm_span(s_map, e_map, ns, ne)
            if _overlaps_repls(os_idx, oe_idx, replacements):
                return False
            replacements.append((os_idx, oe_idx, repl))
            return True

        # 1. Hard & soft identifiers (MRN/PHONE/AADHAAR/ABHA/PAN/EMAIL/INSURANCE always win)
        _HARD_PII_TYPES = {"MRN", "PHONE", "AADHAAR", "AADHAAR_MASKED", "ABHA_NUMBER",
                           "ABHA_ADDRESS", "PAN", "EMAIL", "INSURANCE_ID"}
        for m in find_all_identifiers_raw(norm_text):
            if m.type in _HARD_PII_TYPES or not overlaps_medical(m.start, m.end, medical_spans):
                _add_repl(m.start, m.end, f"[{m.type}]")

        # 2. Names from labels, honorifics, relatives, contextual cues, and gazetteer
        for nm in find_names_in_text(norm_text, self.known_names, self.gazetteer_rx):
            if nm.role == "doctor":
                continue
            if _overlaps_any(nm.start, nm.end, doctor_spans):
                continue
            if nm.role != "context" and overlaps_medical(nm.start, nm.end, medical_spans):
                continue
            surface_lower = nm.surface.lower()
            if any(dn in surface_lower for dn in DISEASE_NAMES):
                continue
            pre = norm_text[max(0, nm.start - 10):nm.start].lower()
            if "asha" in pre and "worker" in norm_text[nm.start:nm.end + 10].lower():
                continue
            label = self.pseudonym if (self.pseudonym and nm.role == "patient") else (
                "[RELATIVE]" if nm.role == "relative" else "[NAME]"
            )
            _add_repl(nm.start, nm.end, label)

        # 3. Additional labelled names & relative labels
        for rx, label in [(NAME_LABEL_RX, "[NAME]"), (HINDI_NAME_RX, "[NAME]")]:
            for m in rx.finditer(norm_text):
                name_part = m.group(1).strip() if m.lastindex else m.group(0)
                if not name_part:
                    continue
                name_start = m.start() + m.group(0).find(name_part)
                name_end = name_start + len(name_part)
                if _overlaps_any(name_start, name_end, doctor_spans):
                    continue
                if overlaps_medical(name_start, name_end, medical_spans):
                    continue
                repl = self.pseudonym if self.pseudonym and label == "[NAME]" else label
                _add_repl(name_start, name_end, repl)

        # RELATIVE_LABEL_RX: S/o, D/o, W/o always replace regardless of medical spans
        for m in RELATIVE_LABEL_RX.finditer(norm_text):
            name_part = m.group(1).strip() if m.lastindex else m.group(0)
            if not name_part:
                continue
            name_start = m.start() + m.group(0).find(name_part)
            name_end = name_start + len(name_part)
            if _overlaps_any(name_start, name_end, doctor_spans):
                continue
            _add_repl(name_start, name_end, "[RELATIVE]")

        # 3b. C/O relative pattern "C/O Ramesh Yadav" (never K/C/O or medical complaints)
        for m in _CO_REL_RX.finditer(norm_text):
            name_part = m.group(1).strip()
            if name_part.split()[0].lower() in _CO_NON_NAME_WORDS:
                continue
            name_start = m.start(1)
            name_end = m.end(1)
            if _overlaps_any(name_start, name_end, doctor_spans):
                continue
            _add_repl(name_start, name_end, "[RELATIVE]")

        # 3c. Address line street/house/mohalla/village/tehsil (preserve ", Distt. ... - PIN")
        for m in ADDRESS_LABEL_RX.finditer(norm_text):
            addr = m.group(1)
            addr_start = m.start() + m.group(0).find(addr)
            split_m = re.search(r",\s*(?:Distt?\.?|District|जिला)\b", addr, re.I)
            redact_end = addr_start + split_m.start() if split_m else addr_start + len(addr)
            if redact_end > addr_start:
                _add_repl(addr_start, redact_end, "[ADDRESS]")

        # 4. Address-context Ward/locality & standalone Address components
        for m in _ADDR_WARD_RX.finditer(norm_text):
            ward_text = f"Ward {m.group(1)}"
            w_pos = m.start() + m.group(0).find(ward_text)
            if w_pos < 0:
                continue
            _add_repl(w_pos, w_pos + len(ward_text), "[LOCALITY]")

        for rx, label in [(HOUSE_RX, "[HOUSE]"), (MOHALLA_RX, "[LOCALITY]"),
                           (LANDMARK_RX, "[LANDMARK]")]:
            for m in rx.finditer(norm_text):
                if not overlaps_medical(m.start(), m.end(), medical_spans):
                    _add_repl(m.start(), m.end(), label)

        # 5. Village names
        for m in VILLAGE_LABEL_RX.finditer(norm_text):
            village = m.group(1).strip()
            vs = m.start() + m.group(0).find(village)
            _add_repl(vs, vs + len(village), "[VILLAGE]")

        # 6. DOB (shift if patient key available)
        for m in DOB_LABEL_RX.finditer(norm_text):
            date_str = m.group(1)
            ds = m.start() + m.group(0).find(date_str)
            de = ds + len(date_str)
            if self.patient_key:
                shifted = shift_date_string(date_str, self.patient_key, self.date_hint)
                _add_repl(ds, de, shifted)
            else:
                _add_repl(ds, de, "[DOB]")

        # 7. PIN codes (skip when cleaning numeric lab/amount columns)
        if self.enable_pin:
            for m in _find_pin_raw(norm_text):
                if not overlaps_medical(m.start, m.end, medical_spans):
                    pin_gen = m.surface[:3] + "***" if len(m.surface) >= 6 else "[PIN]"
                    _add_repl(m.start, m.end, pin_gen)

        # 8. Known names gazetteer fallback — skip doctors, medical spans, and covered spans
        if self.gazetteer_rx is not None:
            for m in self.gazetteer_rx.finditer(norm_text):
                pos, end = m.start(), m.end()
                if pos > 0 and norm_text[pos - 1].isdigit():
                    continue
                if end < len(norm_text) and norm_text[end].isdigit():
                    continue
                if _overlaps_any(pos, end, doctor_spans):
                    continue
                if overlaps_medical(pos, end, medical_spans):
                    continue
                repl = self.pseudonym if self.pseudonym else "[NAME]"
                _add_repl(pos, end, repl)

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
        """Shift all numeric and month-name dates (incl. Indic digits) by the patient's offset."""
        norm, s_map, e_map = normalize_with_map(text, decode_escapes=False)
        repls: list[tuple[int, int, str]] = []

        for m in DATE_RX.finditer(norm):
            os_idx, oe_idx = map_norm_span(s_map, e_map, m.start(), m.end())
            repls.append((os_idx, oe_idx, shift_date_string(m.group(0), self.patient_key, self.date_hint)))

        for m in _MONTH_DATE_RX.finditer(norm):
            day = int(m.group(1))
            month = _MONTHS[m.group(2).lower()]
            yr_str = m.group(3)
            year = int(yr_str) if yr_str else 2026
            try:
                d = dt.date(year, month, day)
            except ValueError:
                continue
            shifted = shift_date(d, self.patient_key)
            rep = f"{shifted.day} {_MONTH_NAMES[shifted.month]} {shifted.year}" if yr_str else f"{shifted.day} {_MONTH_NAMES[shifted.month]}"
            os_idx, oe_idx = map_norm_span(s_map, e_map, m.start(), m.end())
            repls.append((os_idx, oe_idx, rep))

        if not repls:
            return text
        repls.sort(key=lambda x: (x[0], -(x[1] - x[0])))
        out = text
        last_e = -1
        filtered = []
        for s, e, r in repls:
            if s >= last_e:
                filtered.append((s, e, r))
                last_e = e
        for s, e, r in reversed(filtered):
            out = out[:s] + r + out[e:]
        return out
