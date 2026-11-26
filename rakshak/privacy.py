"""Privacy layer: quasi-identifier generalization, date shifting, suppression."""
from __future__ import annotations

import datetime as dt
import re
from .crypto import age_band, shift_date, date_shift_days
from .detectors import canonical_clean, normalize_with_map, map_norm_span


# ─────────────────────────────────────────────────────────────────────────────
# Date parsing
# ─────────────────────────────────────────────────────────────────────────────

_DMY_RX = re.compile(r"(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})")
_YMD_RX = re.compile(r"(\d{4})[/\-](\d{1,2})[/\-](\d{1,2})")
_SHORT_RX = re.compile(r"(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2})")


def parse_date(text: str, hint: str = "dmy") -> dt.date | None:
    """Parse a date string (including Indic digits) with format hint (dmy or mdy)."""
    text = canonical_clean(text, decode_escapes=False).strip()

    # Try YYYY-MM-DD first (unambiguous)
    m = _YMD_RX.match(text)
    if m:
        try:
            return dt.date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        except ValueError:
            pass

    # Try DD/MM/YYYY or MM/DD/YYYY based on hint
    m = _DMY_RX.match(text)
    if m:
        a, b, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if hint == "mdy":
            month, day = a, b
        else:
            day, month = a, b
        # Fallback: if month > 12, swap
        if month > 12 and day <= 12:
            day, month = month, day
        try:
            return dt.date(y, month, day)
        except ValueError:
            pass

    # Short year
    m = _SHORT_RX.match(text)
    if m:
        a, b, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        y = y + 2000 if y < 50 else y + 1900
        if hint == "mdy":
            month, day = a, b
        else:
            day, month = a, b
        if month > 12 and day <= 12:
            day, month = month, day
        try:
            return dt.date(y, month, day)
        except ValueError:
            pass

    return None


def format_date(d: dt.date, fmt: str = "dmy") -> str:
    """Format date back to string in the original format style."""
    if fmt == "ymd":
        return d.strftime("%Y-%m-%d")
    elif fmt == "mdy":
        return d.strftime("%m/%d/%Y")
    else:  # dmy
        return d.strftime("%d/%m/%Y")


def detect_date_format(text: str) -> str:
    """Detect date format from text."""
    if _YMD_RX.match(text.strip()):
        return "ymd"
    return "dmy"  # default for Indian data


def shift_date_string(date_str: str, patient_key: str, hint: str = "dmy",
                       max_days: int = 180) -> str:
    """Parse, shift, and re-format a date or ISO datetime string."""
    s = canonical_clean(date_str, decode_escapes=False).strip()
    # Preserve ISO datetime / timezone suffix if present (e.g. "2026-08-30T09:30:00+05:30")
    if len(s) >= 10 and s[4:5] == "-" and s[7:8] == "-" and (len(s) == 10 or s[10] in ("T", " ")):
        date_part, rest = s[:10], s[10:]
        d = parse_date(date_part, "ymd")
        if d is None:
            return date_str
        shifted = shift_date(d, patient_key, max_days)
        return format_date(shifted, "ymd") + rest

    d = parse_date(s, hint)
    if d is None:
        return date_str  # Can't parse, leave as is
    fmt = detect_date_format(s)
    if fmt != "ymd" and hint == "mdy":
        fmt = "mdy"
    shifted = shift_date(d, patient_key, max_days)
    return format_date(shifted, fmt)


# ─────────────────────────────────────────────────────────────────────────────
# Age generalization
# ─────────────────────────────────────────────────────────────────────────────

# Negative lookbehind (?<![a-zA-Z]) prevents "stage 3" from matching "age 3"!
_AGE_IN_TEXT = re.compile(
    r"(?:(?<![a-zA-Z])(?i:age)|\u0906\u092f\u0941|\u0909\u092e\u094d\u0930)"
    r"(\s*[:/-]?\s*)(\d{1,3})(\s*(?i:yrs?|years?|\u0935\u0930\u094d\u0937|Y)?(?:\s*/\s*[MFmf])?)"
)

_AGE_SLASH = re.compile(r"(?<![\d/])(\d{1,3})\s*(?:(Yrs?|Years?|वर्ष)\s*)?/\s*([MFmf])\b")


def generalize_age_in_text(text: str, width: int = 5, top_code: int = 85,
                           suppress_age: bool = False) -> str:
    """Replace exact ages (ASCII, Indic digits, or zero-width obfuscated) with adaptive bands or [AGE]."""
    norm, s_map, e_map = normalize_with_map(text, decode_escapes=False)
    repls: list[tuple[int, int, str]] = []

    for m in _AGE_IN_TEXT.finditer(norm):
        age_val = int(m.group(2))
        if age_val < 1 or age_val > 120:
            continue
        os_idx, oe_idx = map_norm_span(s_map, e_map, m.start(2), m.end(2))
        rep = "[AGE]" if suppress_age else age_band(age_val, width, top_code)
        repls.append((os_idx, oe_idx, rep))

    for m in _AGE_SLASH.finditer(norm):
        age_val = int(m.group(1))
        if age_val < 1 or age_val > 120:
            continue
        os_idx, oe_idx = map_norm_span(s_map, e_map, m.start(), m.end())
        band = "[AGE]" if suppress_age else age_band(age_val, width, top_code)
        unit = f" {m.group(2)}" if m.group(2) else ""
        repls.append((os_idx, oe_idx, f"{band}{unit}/{m.group(3)}"))

    if not repls:
        return text
    repls.sort(key=lambda x: (x[0], -(x[1] - x[0])))
    filtered: list[tuple[int, int, str]] = []
    last_e = -1
    for s, e, r in repls:
        if s >= last_e:
            filtered.append((s, e, r))
            last_e = e
    out = text
    for s, e, r in reversed(filtered):
        out = out[:s] + r + out[e:]
    return out


# ─────────────────────────────────────────────────────────────────────────────
# Location generalization
# ─────────────────────────────────────────────────────────────────────────────

def generalize_village(village: str, district: str | None = None) -> str:
    """Generalize village to district level."""
    if district:
        return district
    return "[LOCATION]"


def generalize_pin(pin: str) -> str:
    """Generalize 6-digit PIN to 3-digit prefix."""
    digits = re.sub(r"\D", "", pin)
    if len(digits) == 6:
        return digits[:3] + "***"
    return "[PIN]"


def generalize_house(house: str) -> str:
    """Remove specific house number."""
    return "[HOUSE]"


def generalize_locality(locality: str) -> str:
    """Remove specific locality/mohalla."""
    return "[LOCALITY]"


def generalize_landmark(landmark: str) -> str:
    """Remove specific landmark."""
    return "[LANDMARK]"
