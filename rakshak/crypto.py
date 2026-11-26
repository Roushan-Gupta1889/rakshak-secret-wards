"""Cryptographic utilities: pseudonyms, date shifts, encryption."""
from __future__ import annotations

import datetime as dt
import hashlib
import hmac
import os

SECRET = os.environ.get("RAKSHA_SECRET", "").encode("utf-8")

_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"  # Crockford base32


def pseudonym(patient_key: str) -> str:
    """HMAC-SHA256 keyed Crockford base32 pseudonym with deterministic rejection sampling.

    Rejects all-digit 6-char codes so pseudonyms always contain at least one alphabetic character
    with zero modulo bias. Same key+secret -> same ID. Different secret -> different ID.
    """
    msg = patient_key.encode("utf-8")
    counter = 0
    while counter < 64:
        digest = hmac.new(SECRET, msg, hashlib.sha256).digest()
        n = int.from_bytes(digest[:5], "big")
        code = "".join(_ALPHABET[(n >> (5 * i)) & 31] for i in range(6))
        if any(ch.isalpha() for ch in code):
            return f"PSN-{code}"
        counter += 1
        msg = f"\x00rej|{counter}|{patient_key}".encode("utf-8")
    # Unreachable (< 10^-192 probability): format-preserving fallback
    return f"PSN-A{code[1:]}"


def date_shift_days(patient_key: str, max_days: int = 180) -> int:
    """Per-patient shift in [-max, +max], never 0."""
    d = hmac.new(SECRET, b"shift|" + patient_key.encode("utf-8"), hashlib.sha256).digest()
    v = int.from_bytes(d[:4], "big") % (2 * max_days) - max_days
    return v if v != 0 else 1


def shift_date(value: dt.date, patient_key: str, max_days: int = 180) -> dt.date:
    """Shift a date by the patient's secret offset."""
    return value + dt.timedelta(days=date_shift_days(patient_key, max_days))


def age_band(age: int, width: int = 5, top_code: int = 85) -> str:
    """Age band containing true age: e.g. 45 -> '45-49'; top-codes >= top_code as '<top_code>+'."""
    if age >= top_code:
        return f"{top_code}+"
    lo = (age // width) * width
    return f"{lo}-{lo + width - 1}"


def file_hash(data: bytes) -> str:
    """SHA-256 hex digest of raw file bytes."""
    return hashlib.sha256(data).hexdigest()
