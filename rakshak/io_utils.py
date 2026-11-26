"""File I/O utilities: encoding detection, reading, writing."""
from __future__ import annotations

import csv
import io
import json
import os
import re
import sys
from pathlib import Path


def decode_bytes(raw: bytes) -> str | None:
    """Decode raw bytes trying multiple encodings. Returns None if undecodable."""
    if not raw:
        return None
    # UTF-8 BOM
    if raw.startswith(b"\xef\xbb\xbf"):
        try:
            return raw[3:].decode("utf-8")
        except UnicodeDecodeError:
            pass
    # UTF-16 BOM
    if raw.startswith((b"\xff\xfe", b"\xfe\xff")):
        try:
            return raw.decode("utf-16")
        except (UnicodeDecodeError, UnicodeError):
            pass
    # Try UTF-8 strict
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError:
        pass
    # Fallback to cp1252 (Windows Latin-1 superset, common in Indian hospital exports)
    try:
        return raw.decode("cp1252")
    except UnicodeDecodeError:
        pass
    return None


def detect_delimiter(text: str) -> str:
    """Detect CSV delimiter from first few lines."""
    lines = text.split("\n", 5)[:5]
    if not lines:
        return ","
    tab_count = sum(line.count("\t") for line in lines)
    comma_count = sum(line.count(",") for line in lines)
    return "\t" if tab_count > comma_count else ","


def read_csv_rows(text: str, delimiter: str) -> tuple[list[str], list[list[str]]]:
    """Parse CSV/TSV text into header + body rows."""
    # Normalize line endings
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    reader = csv.reader(io.StringIO(text, newline=""), delimiter=delimiter)
    rows = list(reader)
    if not rows:
        return [], []
    return rows[0], rows[1:]


def write_csv(header: list[str], body: list[list[str]], delimiter: str) -> str:
    """Write CSV back to string."""
    buf = io.StringIO()
    w = csv.writer(buf, delimiter=delimiter, lineterminator="\n")
    w.writerow(header)
    for row in body:
        w.writerow(row)
    return buf.getvalue()


def parse_json_safe(text: str) -> dict | list | None:
    """Parse JSON, handling deeply nested structures safely."""
    old_limit = sys.getrecursionlimit()
    sys.setrecursionlimit(max(old_limit, 5000))
    try:
        return json.loads(text)
    except (json.JSONDecodeError, RecursionError):
        return None
    finally:
        sys.setrecursionlimit(old_limit)


def is_fhir_bundle(data) -> bool:
    """Check if JSON data is a FHIR R4 Bundle."""
    return isinstance(data, dict) and data.get("resourceType") == "Bundle"


def sorted_walk(root: Path):
    """Walk directory in sorted order for deterministic output."""
    for path in sorted(root.rglob("*")):
        if path.is_file():
            yield path
