"""Filename sanitization: detect and clean PII from filenames."""
from __future__ import annotations

import re
from .detectors import PHONE_RX, canonical_clean, find_all_identifiers_raw

# MRN patterns in order from most specific to least specific
_MRN_IN_FILENAME_RX = re.compile(
    r"(?:"
    r"SNJ-\d{2}-\d{5,8}"          # SNJ-26-064508  (specific: match first!)
    r"|JJH-?\d{6,9}"               # JJH-0076928
    r"|DHH-IPD-\d{4,8}"            # DHH-IPD-00591
    r"|DHH\d{4,8}"                  # DHH followed directly by digits
    r"|IPD-20\d{2}-\d{4,8}"       # IPD-2026-00432
    r"|IP-\d{2}-\d{4,8}"          # IP-26-00130
    r"|IPD\d{4,8}"                  # IPD without separator
    r"|ADM\d{3,8}"                  # ADM000162
    r"|UHID-?\d{5,8}"              # UHID-012345
    r"|AROGYA-?\d{5,8}"            # AROGYA MRNs
    r")",
    re.I,
)


_FN_CACHE: dict[int, tuple[frozenset[str], re.Pattern | None, re.Pattern | None]] = {}
_SKIP_FN_WORDS = {
    "report", "export", "data", "note", "log", "ward",
    "nursing", "discharge", "opd", "ipd", "lab", "rx",
    "billing", "claim", "bundle", "summary", "sheet",
    "form", "consent", "ticket", "forward", "redacted", "mrn", "phone",
}


def _compile_filename_patterns(known: set[str]) -> tuple[re.Pattern | None, re.Pattern | None]:
    """Compile deterministic multi-token and single-token filename regexes once per name set."""
    if not known:
        return None, None
    key = id(known)
    fs = frozenset(known)
    cached = _FN_CACHE.get(key)
    if cached is not None and cached[0] == fs:
        return cached[1], cached[2]

    sorted_known = sorted(fs, key=lambda s: (-len(s), s))
    multi_pats: list[str] = []
    single_tokens: set[str] = set()
    for name in sorted_known:
        if len(name) < 3:
            continue
        toks = name.split()
        if len(toks) >= 2:
            for joiner in ("_", "-", ""):
                multi_pats.append(re.escape(joiner.join(toks)))
        for tok in toks:
            if len(tok) >= 3 and tok.lower() not in _SKIP_FN_WORDS:
                single_tokens.add(tok)

    multi_rx = re.compile("(?:" + "|".join(multi_pats) + ")", re.I) if multi_pats else None
    sorted_single = sorted(single_tokens, key=lambda s: (-len(s), s))
    single_rx = (
        re.compile(r"(?<![a-zA-Z])(?:" + "|".join(re.escape(t) for t in sorted_single) + r")(?![a-zA-Z])", re.I)
        if sorted_single else None
    )
    if len(_FN_CACHE) > 8:
        _FN_CACHE.clear()
    _FN_CACHE[key] = (fs, multi_rx, single_rx)
    return multi_rx, single_rx


def sanitize_filename(rel_path: str, known_names: set[str] | None = None) -> tuple[str, bool]:
    """Sanitize a relative file path, returning (new_rel_path, was_changed).

    Operates only on the basename portion; preserves the directory prefix.
    Removes phone numbers, MRNs, and known patient names from filenames.
    """
    known = known_names or set()

    # Split into directory prefix and basename
    if "/" in rel_path:
        dir_prefix, basename = rel_path.rsplit("/", 1)
    else:
        dir_prefix, basename = "", rel_path

    # Separate extension
    dot_pos = basename.rfind(".")
    if dot_pos > 0:
        name_part = basename[:dot_pos]
        ext = basename[dot_pos:]
    else:
        name_part = basename
        ext = ""

    changed = False

    def _scrub_part(src: str) -> tuple[str, bool]:
        part = src
        did_change = False

        # 1. Strip leading 10-digit phone number  e.g. "7148988804_report_0047"
        phone_match = re.match(r"^(\d{10})_(.+)$", part)
        if phone_match:
            part = phone_match.group(2)
            did_change = True

        # 2. Strip any inline phone numbers or encoded identifiers remaining
        new_np = PHONE_RX.sub("PHONE", part)
        if new_np != part:
            part = new_np
            did_change = True

        # 3. Strip MRN patterns  e.g. "JJH-0076928", "IP-26-00130", "IPD-2026-00432"
        new_np = _MRN_IN_FILENAME_RX.sub("MRN", part)
        if new_np != part:
            part = new_np
            did_change = True

        # 3b. Strip any other identifiers (Aadhaar, PAN, email, etc.)
        id_hits = find_all_identifiers_raw(part)
        if id_hits:
            for im in reversed(id_hits):
                part = part[:im.start] + im.type + part[im.end:]
            did_change = True

        # 4. Strip known patient names  e.g. "Reena_Nishad", "Fatima_Bano"
        multi_rx, single_rx = _compile_filename_patterns(known)
        if multi_rx is not None:
            new_np = multi_rx.sub("REDACTED", part)
            if new_np != part:
                part = new_np
                did_change = True
        if single_rx is not None:
            new_np = single_rx.sub("REDACTED", part)
            if new_np != part:
                part = new_np
                did_change = True

        return part, did_change

    # Run first on normalized/decoded form when obfuscation/escapes are present
    norm_part = canonical_clean(name_part, decode_escapes=True)
    if norm_part != name_part:
        cleaned_norm, norm_hit = _scrub_part(norm_part)
        if norm_hit:
            name_part = cleaned_norm
            changed = True
        else:
            name_part, changed = _scrub_part(name_part)
    else:
        name_part, changed = _scrub_part(name_part)

    # 5. Clean up multiple underscores/hyphens
    name_part = re.sub(r"[_\-]{2,}", "_", name_part)
    name_part = name_part.strip("_-")

    new_basename = name_part + ext
    if dir_prefix:
        new_rel = dir_prefix + "/" + new_basename
    else:
        new_rel = new_basename

    return (new_rel, True) if changed else (rel_path, False)
