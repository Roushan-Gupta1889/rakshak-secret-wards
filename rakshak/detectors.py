"""PII detection engine: regex patterns for Indian identifiers, names, addresses."""
from __future__ import annotations

import base64 as b64mod
import html as htmlmod
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


# Map confusable Cyrillic/Greek/fullwidth glyphs -> ASCII Latin
_HOMOGLYPH_TRANS = str.maketrans({
    "\u0410": "A", "\u0430": "a", "\u0412": "B", "\u0432": "v", "\u0421": "C", "\u0441": "c",
    "\u0415": "E", "\u0435": "e", "\u0401": "E", "\u0451": "e", "\u041d": "H", "\u043d": "n",
    "\u0406": "I", "\u0456": "i", "\u0408": "J", "\u0458": "j", "\u041a": "K", "\u043a": "k",
    "\u041c": "M", "\u043c": "m", "\u041e": "O", "\u043e": "o", "\u0420": "P", "\u0440": "p",
    "\u0405": "S", "\u0455": "s", "\u0422": "T", "\u0442": "t", "\u0425": "X", "\u0445": "x",
    "\u0423": "Y", "\u0443": "y", "\u0417": "Z", "\u0437": "z",
    "\u0391": "A", "\u03b1": "a", "\u0392": "B", "\u03b2": "b", "\u0395": "E", "\u03b5": "e",
    "\u0396": "Z", "\u0397": "H", "\u0399": "I", "\u03b9": "i", "\u039a": "K", "\u03ba": "k",
    "\u039c": "M", "\u039d": "N", "\u039f": "O", "\u03bf": "o", "\u03a1": "P", "\u03c1": "p",
    "\u03a4": "T", "\u03c4": "t", "\u03a5": "Y", "\u03c5": "u", "\u03a7": "X", "\u03c7": "x",
})

_INDIC_DIGITS_TRANS = str.maketrans(
    "०१२३४५६७८९"
    "০১২৩৪৫৬৭৮৯"
    "੦੧੨੩੪੫੬੭੮੯"
    "૦૧૨૩૪૫૬૭૮૯"
    "٠١٢٣٤٥٦٧٨٩",
    "0123456789" * 5,
)

_ZERO_WIDTH_CHARS = frozenset(
    "\u200b\u200c\u200d\u200e\u200f\ufeff\u00ad\u2060\u202a\u202b\u202c\u202d\u202e"
)

_ESCAPE_TOKEN_RX = re.compile(
    r"(?:%[0-9a-fA-F]{2})+"
    r"|(?:\\u[0-9a-fA-F]{4})+"
    r"|(?:\\x[0-9a-fA-F]{2})+"
    r"|&#(?:\d{1,7}|[xX][0-9a-fA-F]{1,6});"
)
_PCT_BYTE_RX = re.compile(r"%[0-9a-fA-F]{2}")
_HEX_BYTE_RX = re.compile(r"\\x[0-9a-fA-F]{2}")
_UESC_UNIT_RX = re.compile(r"\\u([0-9a-fA-F]{4})")


def _is_safe_decoded_text(s: str) -> bool:
    return bool(s) and all((ord(c) >= 32 or c in "\t\n\r") for c in s)


def _decode_byte_units(units: list[tuple[int, int, int]]) -> list[tuple[str, int, int]] | None:
    """Convert [(byte_val, start, end), ...] into decoded UTF-8 chars with tight original spans."""
    out: list[tuple[str, int, int]] = []
    i = 0
    n = len(units)
    while i < n:
        b0, s0, e0 = units[i]
        if b0 < 0x80:
            ch = chr(b0)
            if not _is_safe_decoded_text(ch):
                return None
            out.append((ch, s0, e0))
            i += 1
        else:
            seq_len = 2 if (b0 & 0xE0) == 0xC0 else (3 if (b0 & 0xF0) == 0xE0 else (4 if (b0 & 0xF8) == 0xF0 else 0))
            if seq_len == 0 or i + seq_len > n:
                return None
            raw_bytes = bytes(units[j][0] for j in range(i, i + seq_len))
            try:
                ch = raw_bytes.decode("utf-8", errors="strict")
            except UnicodeDecodeError:
                return None
            if not _is_safe_decoded_text(ch):
                return None
            out.append((ch, s0, units[i + seq_len - 1][2]))
            i += seq_len
    return out


def _decode_pct_spans(token: str, base_off: int) -> list[tuple[str, int, int]] | None:
    """Decode percent-encoded bytes into UTF-8 chars paired with tight [start, end) spans."""
    units = list(_PCT_BYTE_RX.finditer(token))
    return _decode_byte_units(
        [(int(m.group(0)[1:], 16), base_off + m.start(), base_off + m.end()) for m in units]
    )


def _decode_hex_esc_spans(token: str, base_off: int) -> list[tuple[str, int, int]] | None:
    """Decode \\xXX escape bytes into UTF-8 chars paired with tight [start, end) spans."""
    units = list(_HEX_BYTE_RX.finditer(token))
    return _decode_byte_units(
        [(int(m.group(0)[2:], 16), base_off + m.start(), base_off + m.end()) for m in units]
    )


def _decode_uesc_spans(token: str, base_off: int) -> list[tuple[str, int, int]] | None:
    """Decode \\uXXXX (including UTF-16 surrogate pairs) with exact original spans."""
    units = list(_UESC_UNIT_RX.finditer(token))
    out: list[tuple[str, int, int]] = []
    i = 0
    n = len(units)
    while i < n:
        cp = int(units[i].group(1), 16)
        s0, e0 = base_off + units[i].start(), base_off + units[i].end()
        if 0xD800 <= cp <= 0xDBFF and i + 1 < n:
            cp2 = int(units[i + 1].group(1), 16)
            if 0xDC00 <= cp2 <= 0xDFFF:
                full_cp = 0x10000 + ((cp - 0xD800) << 10) + (cp2 - 0xDC00)
                ch = chr(full_cp)
                if not _is_safe_decoded_text(ch):
                    return None
                out.append((ch, s0, base_off + units[i + 1].end()))
                i += 2
                continue
        if 0xD800 <= cp <= 0xDFFF:
            return None
        ch = chr(cp)
        if not _is_safe_decoded_text(ch):
            return None
        out.append((ch, s0, e0))
        i += 1
    return out


def _fold_char(ch: str) -> str:
    """Normalize one character: fold homoglyphs, Indic digits, NFKC, and Latin diacritics."""
    if ch in _ZERO_WIDTH_CHARS:
        return ""
    ch = ch.translate(_HOMOGLYPH_TRANS).translate(_INDIC_DIGITS_TRANS)
    if ord(ch) > 127:
        nfkc = unicodedata.normalize("NFKC", ch)
        out: list[str] = []
        for sub in nfkc:
            if sub in _ZERO_WIDTH_CHARS:
                continue
            sub = sub.translate(_HOMOGLYPH_TRANS).translate(_INDIC_DIGITS_TRANS)
            if ord(sub) > 127 and not ("\u0900" <= sub <= "\u097f"):
                nfd = unicodedata.normalize("NFD", sub)
                if nfd and "A" <= nfd[0] <= "z" and nfd[0].isalpha():
                    sub = "".join(c for c in nfd if not unicodedata.combining(c))
            out.append(sub)
        return "".join(out)
    return ch


def normalize_with_map(text: str, decode_escapes: bool = True) -> tuple[str, list[int] | None, list[int] | None]:
    """Return (normalized_text, orig_starts, orig_ends) preserving exact original spans.

    Applies escape decoding (%, \\uXXXX, \\xXX, &#...;), NFKC, homoglyph folding,
    zero-width stripping, Indic->ASCII digit folding, and Latin diacritic folding.
    Fast-paths clean ASCII inputs with zero allocation overhead.
    """
    if not text:
        return text, None, None

    has_esc = decode_escapes and ("%" in text or "\\u" in text or "\\x" in text or "&#" in text)
    if not has_esc and text.isascii():
        return text, None, None

    norm_chars: list[str] = []
    s_map: list[int] = []
    e_map: list[int] = []

    def _emit(piece: str, os_idx: int, oe_idx: int) -> None:
        for ch in piece:
            folded = _fold_char(ch)
            for fc in folded:
                norm_chars.append(fc)
                s_map.append(os_idx)
                e_map.append(oe_idx)

    if not has_esc:
        for idx, ch in enumerate(text):
            _emit(ch, idx, idx + 1)
        return "".join(norm_chars), s_map, e_map

    pos = 0
    for m in _ESCAPE_TOKEN_RX.finditer(text):
        if m.start() > pos:
            for idx in range(pos, m.start()):
                _emit(text[idx], idx, idx + 1)
        tok = m.group(0)
        decoded_items: list[tuple[str, int, int]] | None = None
        if tok.startswith("%"):
            decoded_items = _decode_pct_spans(tok, m.start())
        elif tok.startswith("\\u"):
            decoded_items = _decode_uesc_spans(tok, m.start())
        elif tok.startswith("\\x"):
            decoded_items = _decode_hex_esc_spans(tok, m.start())
        elif tok.startswith("&#"):
            unesc = htmlmod.unescape(tok)
            if unesc != tok and _is_safe_decoded_text(unesc):
                decoded_items = [(unesc, m.start(), m.end())]

        if decoded_items is not None:
            for piece, os_idx, oe_idx in decoded_items:
                _emit(piece, os_idx, oe_idx)
        else:
            for idx in range(m.start(), m.end()):
                _emit(text[idx], idx, idx + 1)
        pos = m.end()

    for idx in range(pos, len(text)):
        _emit(text[idx], idx, idx + 1)

    return "".join(norm_chars), s_map, e_map


def map_norm_span(s_map: list[int] | None, e_map: list[int] | None,
                  ns: int, ne: int) -> tuple[int, int]:
    """Map a half-open [ns, ne) normalized span back to original text [os, oe)."""
    if s_map is None or e_map is None:
        return ns, ne
    if ns >= ne or not s_map:
        return ns, ne
    return s_map[ns], e_map[ne - 1]


def canonical_clean(text: str, decode_escapes: bool = True) -> str:
    """Return adversarially normalized/decoded text string for extraction passes."""
    norm, _, _ = normalize_with_map(text, decode_escapes=decode_escapes)
    return norm


def try_decode_b64_text(val: str) -> str | None:
    """Decode base64 ASCII string if it decodes cleanly to readable text."""
    if not isinstance(val, str) or len(val) < 20 or len(val) % 4 == 1:
        return None
    if not re.fullmatch(r"[A-Za-z0-9+/=\s]+", val):
        return None
    compact = re.sub(r"\s+", "", val)
    if len(compact) < 20 or re.fullmatch(r"[0-9a-fA-F]+", compact):
        return None
    try:
        raw = b64mod.b64decode(compact + "=" * (-len(compact) % 4), validate=False)
        dec = raw.decode("utf-8", errors="strict")
        if dec and len(dec) >= 6 and sum(ch.isprintable() or ch in "\r\n\t" for ch in dec) / len(dec) > 0.85:
            return dec
    except Exception:
        pass
    return None


def try_decode_hex_text(val: str) -> str | None:
    """Decode an even-length hex string if it represents readable UTF-8 text."""
    if not isinstance(val, str):
        return None
    compact = val.strip()
    if len(compact) < 16 or len(compact) % 2 != 0 or not re.fullmatch(r"[0-9a-fA-F]+", compact):
        return None
    try:
        raw = bytes.fromhex(compact)
        dec = raw.decode("utf-8", errors="strict")
    except Exception:
        return None
    if len(dec) < 8:
        return None
    printable_ratio = sum((ch.isprintable() or ch in "\r\n\t") for ch in dec) / len(dec)
    if printable_ratio < 0.95:
        return None
    if not re.search(r"[A-Za-z\u0900-\u097F]", dec) or not re.search(r"[\s:/\-.,@]", dec):
        return None
    return dec


def normalize_text(s: str) -> str:
    """NFKC normalize, fold homoglyphs/Indic digits, and strip zero-width chars."""
    return canonical_clean(s, decode_escapes=False)


def _mapped_matches(text: str, matcher, decode_escapes: bool = True) -> list[PIIMatch]:
    """Run an identifier matcher on normalized text and map hits back to original spans."""
    norm, s_map, e_map = normalize_with_map(text, decode_escapes=decode_escapes)
    hits = matcher(norm)
    if s_map is None:
        return hits
    mapped: list[PIIMatch] = []
    for m in hits:
        os_idx, oe_idx = map_norm_span(s_map, e_map, m.start, m.end)
        mapped.append(PIIMatch(m.type, os_idx, oe_idx, text[os_idx:oe_idx], m.role))
    return mapped


def _find_phones_raw(text: str) -> list[PIIMatch]:
    results = []
    for m in PHONE_RX.finditer(text):
        surface = m.group(0)
        pre = text[max(0, m.start()-15):m.start()].lower()
        if any(x in pre for x in ["mg", "ml", "dose", "tab", "inj", "cap", "unit",
                                    "loinc", "range", "ref", "icd", "code"]):
            continue
        digits_only = re.sub(r"\D", "", surface)
        if digits_only.startswith("91") and len(digits_only) == 12:
            digits_only = digits_only[2:]
        if len(digits_only) != 10:
            continue
        if digits_only[0] not in "6789":
            continue
        results.append(PIIMatch("PHONE", m.start(), m.end(), surface, "patient"))
    return results


def _find_aadhaar_raw(text: str) -> list[PIIMatch]:
    results = []
    for m in AADHAAR_RX.finditer(text):
        surface = m.group(0)
        digits = re.sub(r"[\s\-]", "", surface)
        if len(digits) != 12 or digits[0] in "01":
            continue
        pre = text[max(0, m.start()-10):m.start()].lower()
        if re.search(r"\b(?:uuid|urn|timestamp)\b", pre):
            continue
        results.append(PIIMatch("AADHAAR", m.start(), m.end(), surface, "patient"))
    return results


def _find_masked_aadhaar_raw(text: str) -> list[PIIMatch]:
    return [PIIMatch("AADHAAR_MASKED", m.start(), m.end(), m.group(0), "patient")
            for m in AADHAAR_MASKED_RX.finditer(text)]


def _find_abha_raw(text: str) -> list[PIIMatch]:
    results = []
    for m in ABHA_RX.finditer(text):
        if len(re.sub(r"[\s\-]", "", m.group(0))) == 14:
            results.append(PIIMatch("ABHA_NUMBER", m.start(), m.end(), m.group(0), "patient"))
    return results


def _find_pan_raw(text: str) -> list[PIIMatch]:
    return [PIIMatch("PAN", m.start(), m.end(), m.group(0), "patient") for m in PAN_RX.finditer(text)]


def _find_email_raw(text: str) -> list[PIIMatch]:
    results = []
    for m in EMAIL_RX.finditer(text):
        if not re.search(r"@(?:abdm|ndhm|abha)", m.group(0), re.I):
            results.append(PIIMatch("EMAIL", m.start(), m.end(), m.group(0), "patient"))
    return results


def _find_abha_address_raw(text: str) -> list[PIIMatch]:
    return [PIIMatch("ABHA_ADDRESS", m.start(), m.end(), m.group(0), "patient")
            for m in ABHA_ADDR_RX.finditer(text)]


def _find_insurance_raw(text: str) -> list[PIIMatch]:
    return [PIIMatch("INSURANCE_ID", m.start(), m.end(), m.group(0), "patient")
            for m in INSURANCE_RX.finditer(text)]


def _find_mrn_raw(text: str) -> list[PIIMatch]:
    results = []
    for rx in MRN_PATTERNS:
        for m in rx.finditer(text):
            results.append(PIIMatch("MRN", m.start(), m.end(), m.group(0), "patient"))
    return results


def _find_pin_raw(text: str) -> list[PIIMatch]:
    results = []
    for m in PIN_RX.finditer(text):
        pin_val = m.group(1)
        first = int(pin_val[0])
        if first < 1 or first > 8:
            continue
        if ((m.start() > 0 and text[m.start() - 1] in "abcdefABCDEF")
                or (m.end() < len(text) and text[m.end()] in "abcdefABCDEF")):
            if re.search(r"[0-9a-fA-F]{16,}", text[max(0, m.start() - 24):min(len(text), m.end() + 24)]):
                continue
        pre = text[max(0, m.start()-14):m.start()].lower()
        post = text[m.end():min(len(text), m.end()+10)].lower()
        if (re.search(r"(?:₹|\b(?:rs|inr|amount|bill|loinc|package|result)\b)", pre)
                or (re.search(r"\bcode\b", pre) and not re.search(r"\b(?:pin|zip|postal)\s*code\b", pre))):
            continue
        if any(x in post for x in ["mg", "ml", "dl", "g/dl", "/ul", "/mm"]):
            continue
        results.append(PIIMatch("PIN", m.start(), m.end(), pin_val, "patient"))
    return results


def find_phones(text: str) -> list[PIIMatch]:
    """Find Indian phone numbers across encodings and Indic digits."""
    return _mapped_matches(text, _find_phones_raw)


def find_aadhaar(text: str) -> list[PIIMatch]:
    """Find Aadhaar numbers (12 digits) across encodings and Indic digits."""
    return _mapped_matches(text, _find_aadhaar_raw)


def find_masked_aadhaar(text: str) -> list[PIIMatch]:
    return _mapped_matches(text, _find_masked_aadhaar_raw)


def find_abha(text: str) -> list[PIIMatch]:
    """Find ABHA numbers (14 digits) across encodings and Indic digits."""
    return _mapped_matches(text, _find_abha_raw)


def find_pan(text: str) -> list[PIIMatch]:
    return _mapped_matches(text, _find_pan_raw)


def find_email(text: str) -> list[PIIMatch]:
    return _mapped_matches(text, _find_email_raw)


def find_abha_address(text: str) -> list[PIIMatch]:
    return _mapped_matches(text, _find_abha_address_raw)


def find_insurance(text: str) -> list[PIIMatch]:
    return _mapped_matches(text, _find_insurance_raw)


def find_mrn(text: str) -> list[PIIMatch]:
    """Find MRN / UHID / IPD / admission numbers across encodings and homoglyphs."""
    return _mapped_matches(text, _find_mrn_raw)


def find_pin(text: str) -> list[PIIMatch]:
    """Find 6-digit Indian PIN codes across encodings and Indic digits."""
    return _mapped_matches(text, _find_pin_raw)


def find_all_identifiers_raw(text: str) -> list[PIIMatch]:
    """Run all identifier detectors directly on an already-normalized string."""
    all_matches = []
    all_matches.extend(_find_phones_raw(text))
    all_matches.extend(_find_aadhaar_raw(text))
    all_matches.extend(_find_masked_aadhaar_raw(text))
    all_matches.extend(_find_abha_raw(text))
    all_matches.extend(_find_abha_address_raw(text))
    all_matches.extend(_find_pan_raw(text))
    all_matches.extend(_find_email_raw(text))
    all_matches.extend(_find_insurance_raw(text))
    all_matches.extend(_find_mrn_raw(text))

    all_matches.sort(key=lambda m: (-len(m.surface), m.start))
    keep = []
    occupied = set()
    for m in all_matches:
        span = set(range(m.start, m.end))
        if not span & occupied:
            keep.append(m)
            occupied |= span
    return sorted(keep, key=lambda m: m.start)


def find_all_identifiers(text: str) -> list[PIIMatch]:
    """Run all identifier detectors on normalized view and return merged original spans."""
    return _mapped_matches(text, find_all_identifiers_raw)
