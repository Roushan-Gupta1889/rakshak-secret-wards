"""Name detection and transliteration for Indian names across Latin, Devanagari, and Hinglish."""
from __future__ import annotations

import re
import unicodedata
from typing import NamedTuple

# ─────────────────────────────────────────────────────────────────────────────
# Indian name gazetteer: common first names and surnames
# Built from Indian census / electoral data patterns
# ─────────────────────────────────────────────────────────────────────────────

INDIAN_FIRST_NAMES = {
    # Male
    "ajay", "akram", "anil", "ankit", "arjun", "ashok", "brijesh", "deepak",
    "dinesh", "ganesh", "hari", "kamal", "kishan", "manoj", "mohd", "mohammad",
    "mohammed", "muhammad", "mukesh", "naresh", "pankaj", "prakash", "rahul",
    "raj", "rajesh", "rakesh", "ram", "ramesh", "ravi", "rohit", "sanjay",
    "shahid", "shyam", "sunil", "vijay", "vinod", "zubair",
    # Female
    "anita", "asha", "ayesha", "fatima", "geeta", "kavita", "kiran", "lata",
    "mary", "meera", "neelam", "parvati", "parvathi", "pooja", "priya",
    "reena", "rekha", "rita", "salma", "sarita", "seema", "sita", "sunita",
    "usha",
}

INDIAN_SURNAMES = {
    "ansari", "baig", "chauhan", "chaudhary", "devi", "dixit", "gupta",
    "jaiswal", "kumar", "kushwaha", "lodhi", "masih", "maurya", "mishra",
    "nishad", "pal", "pandey", "pandeya", "patel", "rajput", "sharma",
    "sarma", "shaikh", "sheikh", "siddiqui", "singh", "sonkar", "srivastava",
    "tiwari", "verma", "yadav", "nambiar", "bhattacharya", "wangmo",
    "qadri", "bano",
}

# Devanagari name tokens
DEVA_FIRST_NAMES = {
    "मोहम्मद", "शाहिद", "अनिता", "आशा", "सुनीता", "गीता", "कविता",
    "फातिमा", "सलमा", "मेरी", "पार्वती", "रीना", "उषा", "सरिता",
    "अजय", "अशोक", "दिनेश", "मनोज", "मुकेश", "नरेश", "राहुल",
    "राजेश", "रमेश", "सुनील", "विजय", "ब्रिजेश", "कमल", "शाम",
    "अनिल", "अक्रम", "अर्जुन", "प्रकाश", "राज", "जुबैर",
}

DEVA_SURNAMES = {
    "शर्मा", "सिंह", "पटेल", "यादव", "गुप्ता", "मिश्रा", "तिवारी",
    "चौहान", "पांडेय", "वर्मा", "राजपूत", "कुशवाहा", "दीक्षित",
    "लोधी", "मसीह", "निषाद", "बैग", "शेख", "सिद्दीकी", "अंसारी",
    "कुमार", "देवी", "बानो", "पाल", "सोनकर", "श्रीवास्तव", "जायसवाल",
}

# Common name variants / transliterations mapping
TRANSLITERATION_MAP = {
    "mohammad": ["mohd", "md", "mohammed", "muhammad", "मोहम्मद"],
    "shahid": ["शाहिद"],
    "anita": ["aneeta", "अनिता"],
    "sharma": ["sarma", "शर्मा"],
    "parvati": ["parvathi", "parwati", "पार्वती"],
    "pandey": ["pandeya", "pande", "पांडेय", "पाण्डेय", "पांडे"],
    "chauhan": ["chouhan", "चौहान"],
    "chaudhary": ["choudhary", "chaudhari", "choudhari", "चौधरी"],
    "brijesh": ["brajesh", "ब्रिजेश", "ब्रजेश"],
    "geeta": ["gita", "गीता"],
    "sunita": ["सुनीता"],
    "fatima": ["फातिमा"],
    "reena": ["rina", "रीना"],
    "usha": ["उषा"],
    "sunil": ["सुनील"],
    "ashok": ["अशोक"],
    "patel": ["पटेल"],
    "yadav": ["यादव"],
    "mishra": ["मिश्रा"],
    "tiwari": ["तिवारी"],
    "nishad": ["निषाद"],
    "siddiqui": ["सिद्दीकी"],
    "rajput": ["राजपूत"],
    "masih": ["मसीह"],
    "harish": ["हरीश"],
    "kavita": ["कविता"],
    "sukhwinder": ["सुखविंदर"],
    "kaur": ["कौर"],
    "kamla": ["kamala", "कमला"],
    "sarita": ["सरिता"],
    "zainab": ["जैनब"],
    "salim": ["सलीम"],
}

# Build reverse lookup
_VARIANT_TO_CANONICAL = {}
for canon, variants in TRANSLITERATION_MAP.items():
    _VARIANT_TO_CANONICAL[canon] = canon
    for v in variants:
        _VARIANT_TO_CANONICAL[v.lower()] = canon


def canonical_name_token(token: str) -> str:
    """Map a name token to its canonical form for matching."""
    t = token.strip().lower()
    t = re.sub(r"[.\-']", "", t)
    return _VARIANT_TO_CANONICAL.get(t, t)


def is_name_token(token: str) -> bool:
    """Check if a token looks like an Indian name."""
    t = canonical_name_token(token)
    return t in INDIAN_FIRST_NAMES or t in INDIAN_SURNAMES


def is_devanagari(text: str) -> bool:
    """Check if text contains Devanagari characters."""
    return bool(re.search(r"[\u0900-\u097F]", text))


# ─────────────────────────────────────────────────────────────────────────────
# Name extraction patterns
# ─────────────────────────────────────────────────────────────────────────────

# After explicit patient label: Name: Xxx Yyy
_NAME_AFTER_LABEL = re.compile(
    r"(?i:Patient\s*(?:'s)?\s*Name|Pt\.?\s*Name|Full\s*Name|Name|patient_name)\s*[:=]\s*"
    r"([A-Z][a-zA-Z.']*(?: [A-Z][a-zA-Z.']*){0,3})",
)

# Secondary policyholder / subscriber / applicant / claimant label (context role)
_SUBSCRIBER_LABEL_RX = re.compile(
    r"(?i:\b(?:Subscriber|Beneficiary|Applicant|Policyholder|Member\s*Name|Claimant|Insured|Contact\s*Person))\s*[:=]\s*"
    r"([A-Z\u0900-\u097F][a-zA-Z\u0900-\u097F.']*(?: [A-Z\u0900-\u097F][a-zA-Z\u0900-\u097F.']*){0,3})",
)

# "Case of <Person Name>" (explicitly guarded against medical "Known case of <disease>")
_CASE_OF_NAME_RX = re.compile(
    r"(?<![A-Za-z])\b(?i:Case\s+of)\s+([A-Z][a-zA-Z.']+(?: [A-Z][a-zA-Z.']+){1,2})",
)

# After Hindi label: मरीज़ का नाम: xxx or नाम: xxx (handles "का नाम:" without capturing "का नाम"!)
_HINDI_NAME_AFTER_LABEL = re.compile(
    r"(?:(?:मरीज़|मरीज|रोगी|बीमित|आवेदक|सदस्य)\s+(?:का\s+)?नाम|(?<!का\s)नाम)\s*[:=]\s*"
    r"([\u0900-\u097F]+(?: [\u0900-\u097F]+){0,3})",
)

# After relative/caretaker prefix: S/o, D/o, W/o, B/o, M/o, F/o, Care-taker:, Guardian:, or Hindi relation
_RELATIVE_AFTER_PREFIX = re.compile(
    r"(?:"
    r"(?i:\b(?:S|D|W|B|M|F)\s*/\s*O\b|(?-i:\bH\s*/\s*o\b)|(?:Son|Daughter|Wife|Mother|Father|Baby|Husband)(?:-in-law)?\s+of)\s+"
    r"|(?i:\b(?:Care[-\s]?taker|Caretaker|Guardian|Next\s+of\s+Kin|Informant|Nominee|Emergency\s+Contact))\s*[:=\-]?\s+"
    r"|(?:पिता|माता|पति|पत्नी|पुत्र|पुत्री|शिशु|अभिभावक|संरक्षक|परिजन|तीमारदार)\s*(?:(?:का|की|के)\s+नाम\s*[:=]?|[:=])\s*"
    r")([A-Z\u0900-\u097F][a-zA-Z\u0900-\u097F.']*(?: [A-Z\u0900-\u097F][a-zA-Z\u0900-\u097F.']*){0,3})",
)

# C/O as "care of" (strictly case-sensitive on name tokens, never after K/ or H/!)
_CO_RELATIVE = re.compile(
    r"(?<![A-Za-z/])\b(?:[Cc]\s*/\s*[Oo]|Care\s+of)\s+([A-Z][a-zA-Z.']+(?: [A-Z][a-zA-Z.']+){0,3})"
)

# Contextual non-labelled person mentions: (?i:...) scoped to prefix ONLY so [A-Z] stays case-sensitive!
_CONTEXT_PERSON_RX = re.compile(
    r"(?i:witnessed?\s+by|attendant|attended\s+by|brought\s+by|informed\s+by|accompanied\s+by|escorted\s+by|called\s+by)"
    r"\s+([A-Z][a-zA-Z.']+(?:\s+[A-Z][a-zA-Z.']+){1,2})"
)
_CONTEXT_PERSON_REV_RX = re.compile(
    r"([A-Z][a-zA-Z.']+(?:\s+[A-Z][a-zA-Z.']+){1,2})\s*\((?i:attendant|visitor|guardian|relative|bystander|witness)"
)

# Honorific-prefixed names: Shahid sahab, Anita ji, Parvati behenji
_HONORIFIC_NAME = re.compile(
    r"([A-Z\u0900-\u097F][a-zA-Z\u0900-\u097F.']+)"
    r"\s+(?i:ji|sahab|sahib|didi|bhai|bhaiya|mama|chachu|amma|behenji)\b",
)

# Doctor names (keep these!)
_DOCTOR_NAME = re.compile(
    r"\b(?i:Dr)\.?\s+([A-Z][a-zA-Z.']+(?:\s+[A-Z][a-zA-Z.']+){0,3})",
)

_NON_NAME_TRAILING_LABELS = {"age", "sex", "gender", "dob", "reg", "uhid", "ipd", "opd",
                             "mob", "mobile", "phone", "address", "आयु", "उम्र", "लिंग", "पता", "ग्राम"}
_CONTEXT_SKIP_INST = {"hospital", "clinic", "charitable", "trust", "centre", "center",
                      "medical", "nursing", "home", "district", "village", "government",
                      "prescription", "summary", "discharge", "sanjeevani", "arogya",
                      "jeevan", "jyoti", "hardoi", "diet", "ward", "bed"}


class NameMatch(NamedTuple):
    start: int
    end: int
    surface: str
    role: str       # "patient", "relative", "doctor"
    script: str     # "latin", "deva", "hinglish"


_MEDICAL_NON_NAME_WORDS = {
    "fever", "pain", "headache", "cough", "vomiting", "diarrhea", "weakness",
    "diabetes", "mellitus", "hypertension", "asthma", "tuberculosis", "bronchitis",
    "malaria", "dengue", "typhoid", "anemia", "anaemia", "thyroid", "pneumonia",
    "copd", "ckd", "ihd", "bph", "att", "dyspnea", "chest", "burning",
    "swelling", "bleeding", "nausea", "fatigue", "constipation", "breathlessness",
    "dizziness", "giddiness", "abdominal", "urinary", "back", "joint", "body",
    "loose", "shortness", "breath", "chills", "rigors", "acute", "chronic",
    "mild", "moderate", "severe", "primary", "essential", "unspecified",
    "stable", "active", "positive", "negative", "normal", "abnormal",
    "disease", "disorder", "syndrome", "infection", "failure", "appendicitis",
}


def _looks_medical_or_inst_phrase(cand: str) -> bool:
    low_toks = [t.lower().strip(".,;:") for t in cand.split()]
    return any(t in _MEDICAL_NON_NAME_WORDS or t in _CONTEXT_SKIP_INST for t in low_toks)


def _trim_label_tokens(text: str, m_start: int, group_text: str) -> tuple[int, int, str]:
    """Return span for group_text, trimming trailing non-name label words if attached."""
    tokens = group_text.split()
    while tokens and tokens[-1].rstrip(":.,").lower() in _NON_NAME_TRAILING_LABELS:
        tokens.pop()
    if not tokens:
        return m_start, m_start, ""
    trimmed = " ".join(tokens)
    rel_pos = group_text.find(trimmed)
    s = m_start + (rel_pos if rel_pos >= 0 else 0)
    return s, s + len(trimmed), trimmed


_GAZETTEER_CACHE: dict[int, tuple[frozenset[str], re.Pattern | None]] = {}


def compile_gazetteer_rx(known_names: set[str] | frozenset[str] | None) -> re.Pattern | None:
    """Compile sorted longest-first regex for known names once and cache by id/value."""
    if not known_names:
        return None
    key = id(known_names)
    cached = _GAZETTEER_CACHE.get(key)
    fs = frozenset(known_names)
    if cached is not None and cached[0] == fs:
        return cached[1]
    terms = sorted((n for n in fs if len(n) >= 3), key=lambda s: (-len(s), s))
    if not terms:
        rx = None
    else:
        rx = re.compile(
            r"(?<![A-Za-z\u0900-\u097F])(?:" + "|".join(re.escape(n) for n in terms) + r")(?![A-Za-z\u0900-\u097F])",
            re.IGNORECASE,
        )
    if len(_GAZETTEER_CACHE) > 8:
        _GAZETTEER_CACHE.clear()
    _GAZETTEER_CACHE[key] = (fs, rx)
    return rx


def find_names_in_text(text: str, known_names: set[str] | None = None,
                       gazetteer_rx: re.Pattern | None = None) -> list[NameMatch]:
    """Find name mentions in free text using labels, honorifics, contextual cues, and gazetteer."""
    results = []
    known = known_names or set()

    # 1. Doctor names (mark but DO NOT redact)
    doctor_spans: list[tuple[int, int]] = []
    for m in _DOCTOR_NAME.finditer(text):
        doctor_spans.append((m.start(), m.end()))
        results.append(NameMatch(m.start(), m.end(), m.group(0), "doctor", "latin"))

    def _in_doctor(s: int, e: int) -> bool:
        return any(ds <= e and de >= s and not (e <= ds or s >= de) for ds, de in doctor_spans)

    # 2. Labelled patient names (Latin) — emit ONLY the name span, preserve "Name: " label!
    for m in _NAME_AFTER_LABEL.finditer(text):
        raw_name = m.group(1).strip()
        if not raw_name or raw_name.lower().startswith("dr"):
            continue
        ns, ne, name = _trim_label_tokens(text, m.start(1), raw_name)
        if name and not _in_doctor(ns, ne):
            results.append(NameMatch(ns, ne, name, "patient", "latin"))

    # 3. Hindi labelled names — emit ONLY the name span, preserve "नाम: " label!
    for m in _HINDI_NAME_AFTER_LABEL.finditer(text):
        ns, ne, name = _trim_label_tokens(text, m.start(1), m.group(1).strip())
        if name:
            results.append(NameMatch(ns, ne, name, "patient", "deva"))

    # 4. Relative / Caretaker names (S/o, D/o, W/o, B/o, M/o, F/o, Care-taker:)
    for m in _RELATIVE_AFTER_PREFIX.finditer(text):
        ns, ne, name = _trim_label_tokens(text, m.start(1), m.group(1).strip())
        if not name or _in_doctor(ns, ne):
            continue
        if _looks_medical_or_inst_phrase(name):
            continue
        script = "deva" if is_devanagari(name) else "latin"
        results.append(NameMatch(ns, ne, name, "relative", script))

    # 4b. Secondary labeled person names (Subscriber:, Beneficiary:, etc.) & Case of <Name>
    for m in _SUBSCRIBER_LABEL_RX.finditer(text):
        raw_name = m.group(1).strip()
        if not raw_name or raw_name.lower().startswith("dr"):
            continue
        ns, ne, name = _trim_label_tokens(text, m.start(1), raw_name)
        if name and not _in_doctor(ns, ne) and not _looks_medical_or_inst_phrase(name):
            script = "deva" if is_devanagari(name) else "latin"
            results.append(NameMatch(ns, ne, name, "context", script))

    for m in _CASE_OF_NAME_RX.finditer(text):
        pre = text[max(0, m.start() - 15):m.start()].lower()
        if any(w in pre for w in ("known", "k/c/o", "suspected", "confirmed", "diagnosed")):
            continue
        ns, ne, name = _trim_label_tokens(text, m.start(1), m.group(1).strip())
        if name and len(name.split()) >= 2 and not _in_doctor(ns, ne) and not _looks_medical_or_inst_phrase(name):
            results.append(NameMatch(ns, ne, name, "patient", "latin"))

    # 5. C/O disambiguation: only strictly TitleCase non-medical names
    medical_words = {"fever", "pain", "headache", "cough", "vomiting", "diarrhea",
                     "weakness", "diabetes", "hypertension", "dyspnea", "chest",
                     "burning", "swelling", "bleeding", "nausea", "fatigue",
                     "constipation", "breathlessness", "dizziness", "giddiness",
                     "abdominal", "urinary", "back", "joint", "body", "loose",
                     "shortness", "breath", "chills", "rigors"}
    for m in _CO_RELATIVE.finditer(text):
        raw_name = m.group(1).strip()
        first_tok = raw_name.split()[0]
        if first_tok.lower() in medical_words or not first_tok[0].isupper():
            continue
        if len(raw_name.split()) >= 2 or is_name_token(first_tok):
            results.append(NameMatch(m.start(1), m.end(1), raw_name, "relative", "latin"))

    # 5b. Contextual witness / attendant cues (catches unseen names & canaries directly!)
    for rx in (_CONTEXT_PERSON_RX, _CONTEXT_PERSON_REV_RX):
        for m in rx.finditer(text):
            cand = m.group(1).strip()
            toks = cand.split()
            if (len(toks) >= 2 and all(t[0].isupper() for t in toks)
                    and not any(t.lower() in _CONTEXT_SKIP_INST for t in toks)
                    and not _in_doctor(m.start(1), m.end(1))):
                results.append(NameMatch(m.start(1), m.end(1), cand, "context", "latin"))

    # 6. Honorific-prefixed names
    for m in _HONORIFIC_NAME.finditer(text):
        name = m.group(1).strip()
        if _in_doctor(m.start(), m.end()):
            continue
        script = "deva" if is_devanagari(name) else "hinglish"
        results.append(NameMatch(m.start(), m.end(), m.group(0), "patient", script))

    # 7. Gazetteer scan via single compiled longest-first regex (deterministic & fast)
    rx = gazetteer_rx if gazetteer_rx is not None else compile_gazetteer_rx(known)
    if rx is not None:
        for m in rx.finditer(text):
            pos, end = m.start(), m.end()
            if _in_doctor(pos, end):
                continue
            matched = m.group(0)
            script = "deva" if is_devanagari(matched) else "latin"
            results.append(NameMatch(pos, end, matched, "patient", script))

    return results
