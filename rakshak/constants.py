"""Constants and configuration for RAKSHAK pipeline."""
from __future__ import annotations

# ─── Indian Name Honorifics & Relation Prefixes ─────────────────────────────
HONORIFICS_LATIN = {
    "ji", "sahab", "sahib", "didi", "bhai", "bhaiya", "mama", "chachu",
    "amma", "behenji", "babu", "bibi", "begum", "maulvi", "pandit",
    "shri", "smt", "sri", "kumari", "thakur", "seth", "miyan",
}

HONORIFICS_DEVA = {
    "जी", "साहब", "साहिब", "दीदी", "भाई", "भैया", "मामा", "चाचू",
    "अम्मा", "बहनजी", "बाबू", "बीबी", "बेगम", "मौलवी", "पंडित",
    "श्री", "श्रीमती", "कुमारी", "ठाकुर", "सेठ", "मियां",
}

RELATION_PREFIXES = {
    "s/o", "d/o", "w/o", "c/o", "son of", "daughter of", "wife of",
    "care of", "s/d/o", "s/w/o",
}

# ─── Generic Name Tokens (not identifying on their own) ─────────────────────
GENERIC_NAME_TOKENS = {
    "devi", "kumar", "kumari", "lal", "chand", "ram", "bai", "begum",
    "md", "md.", "mohd", "mohd.", "mohammed", "mohammad", "muhammad",
    "sri", "smt", "shri", "ji", "sahab", "bhai", "didi",
}

# ─── Hospital Identifiers ───────────────────────────────────────────────────
HOSPITALS = {
    "snj": "Sanjeevani Multispeciality Hospital",
    "jjh": "Jeevan Jyoti Charitable Hospital",
    "dhh": "District Hospital Hardoi",
    "arogya": "Arogya Seva Sadan",
}

# MRN / UHID patterns from hospitals
MRN_PREFIXES = [
    "UHID-", "SNJ/", "SNJ-", "JJH-", "DHH2026-", "IP/", "IP-",
    "IPD-", "ADM", "OPD/", "BL/",
]

# ─── Medical Term Anchors (do NOT redact) ────────────────────────────────────
MEDICAL_COMPLAINT_PREFIXES = {
    "c/o", "h/o", "k/c/o", "k/c", "complaint of", "history of",
    "known case of", "diagnosed with", "dx:", "diagnosis:",
    "presenting complaints", "chief complaint",
}

# ─── Date Formats ───────────────────────────────────────────────────────────
DATE_FORMATS_DMY = ["%d/%m/%Y", "%d-%m-%Y", "%d.%m.%Y", "%d %m %Y"]
DATE_FORMATS_MDY = ["%m/%d/%Y", "%m-%d-%Y"]
DATE_FORMATS_YMD = ["%Y-%m-%d", "%Y/%m/%d"]
DATE_FORMATS_SHORT = ["%d/%m/%y", "%m/%d/%y", "%d-%m-%y"]

# ─── Supported File Extensions ──────────────────────────────────────────────
SUPPORTED_EXTS = {".csv", ".tsv", ".json", ".txt"}
QUARANTINE_EXTS = {".pdf", ".jpg", ".jpeg", ".png", ".gif", ".bmp",
                   ".tiff", ".xml", ".docx", ".xlsx", ".zip", ".rar"}

# ─── Districts / Tehsils for Generalization ─────────────────────────────────
# UP districts relevant to the dataset
DISTRICTS = {
    "rae bareli", "barabanki", "sultanpur", "unnao", "sitapur",
    "lucknow", "hardoi", "lakhimpur kheri", "pratapgarh", "fatehpur",
}

TEHSILS = {
    "lalganj", "dalmau", "salon", "nawabganj", "fatehpur",
    "ramsanehighat", "haidergarh", "tiloi", "musafirkhana",
    "lambhua", "kadipur", "amethi", "gauriganj", "jaisinghpur",
    "bighapur", "hasanganj", "purwa", "safipur",
    "laharpur", "misrikh", "sidhauli", "mahmudabad", "biswan",
    "sadar", "bilgram", "sandila", "shahabad",
}
