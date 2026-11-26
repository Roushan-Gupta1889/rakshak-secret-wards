"""Medical term preservation: ensure medicines, doses, vitals, diagnoses survive."""
from __future__ import annotations

import re

# ─────────────────────────────────────────────────────────────────────────────
# Medical term patterns that must NEVER be redacted
# ─────────────────────────────────────────────────────────────────────────────

# Drug names (Indian hospital formulary)
DRUGS = {
    "paracetamol", "dolo", "crocin", "calpol", "pantoprazole", "omeprazole",
    "ceftriaxone", "azithromycin", "amoxicillin", "metformin", "glimepiride",
    "amlodipine", "atorvastatin", "losartan", "telmisartan", "enalapril",
    "aspirin", "clopidogrel", "warfarin", "heparin", "enoxaparin",
    "insulin", "glargine", "doxycycline", "ciprofloxacin", "levofloxacin",
    "metronidazole", "fluconazole", "ibuprofen", "diclofenac", "aceclofenac",
    "tramadol", "morphine", "ondansetron", "domperidone", "rabeprazole",
    "levothyroxine", "prednisolone", "dexamethasone", "hydrocortisone",
    "salbutamol", "budesonide", "montelukast", "cetirizine", "chlorpheniramine",
    "ranitidine", "sucralfate", "lactulose", "bisacodyl", "ors",
    "artesunate", "quinine", "chloroquine", "rifampicin", "isoniazid",
    "pyrazinamide", "ethambutol", "streptomycin", "levodopa", "carbidopa",
    "ferrous", "folic", "iron", "calcium", "vitamin",
    "ramipril", "furosemide", "spironolactone", "digoxin", "amiodarone",
    "phenytoin", "carbamazepine", "valproate", "gabapentin", "pregabalin",
    "sertraline", "fluoxetine", "amitriptyline", "olanzapine", "risperidone",
    "acyclovir", "oseltamivir", "tenofovir", "lamivudine", "efavirenz",
    "att",  # anti-tuberculosis treatment
}

# Dosage form patterns
DOSE_FORMS_RX = re.compile(
    r"(?i)\b(?:Tab|Cap|Inj|Syp|Susp|Cream|Oint|Drops|Sachet|Nebul|Spray|"
    r"IV|IM|SC|oral|topical|inhaler)\b\.?"
)

# Dosage quantity patterns (must NOT be confused with phone numbers)
DOSE_QTY_RX = re.compile(
    r"(?i)"
    r"(?:\d+(?:\.\d+)?\s*(?:mg|mcg|µg|g|ml|mL|IU|units?|%)\b)"
    r"|(?:\d+/\d+\s*mg)"                        # 100/25 mg
    r"|(?:\d+\s*(?:mg|mcg|g|ml)\s*\+\s*\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml))"   # 100 mg + 0.5 mg
)

# Dosage frequency patterns (1-0-1, BD, TDS, QID, OD, etc.)
DOSE_FREQ_RX = re.compile(
    r"(?i)"
    r"(?:[0-1]\s*-\s*[0-1]\s*-\s*[0-1])"        # 1-0-1, 1-1-1
    r"|(?:\b(?:OD|BD|TDS|QDS|QID|SOS|PRN|HS|AC|PC|STAT)\b)"
    r"|(?:\bx\s*\d+\s*(?:days?|wks?|weeks?|months?|yrs?)\b)"
)

# Vital signs
VITALS_RX = re.compile(
    r"(?i)"
    r"(?:BP\s+\d{2,3}\s*/\s*\d{2,3})"           # BP 120/80
    r"|(?:(?:pulse|HR|heart\s*rate)\s*[:=]?\s*\d{2,3})"
    r"|(?:(?:temp|temperature|bukhar)\s*[:=]?\s*\d{2,3}(?:\.\d)?\s*[°]?\s*[FC]?)"
    r"|(?:SpO2\s*[:=]?\s*\d{2,3}\s*%?)"
    r"|(?:RR\s*[:=]?\s*\d{1,2})"
    r"|(?:RBS\s+\d{2,3}\s*mg/dL)"
    r"|(?:GCS\s*[:=]?\s*\d{1,2}/\d{1,2})"
)

# Lab values
LAB_RX = re.compile(
    r"(?i)"
    r"(?:(?:Haemoglobin|Hb|HbA1c|RBS|FBS|PPBS|Creatinine|Urea|Bilirubin|"
    r"SGOT|SGPT|ALP|Albumin|Protein|Cholesterol|Triglycerides|HDL|LDL|TSH|"
    r"T3|T4|Platelet|WBC|RBC|ESR|CRP|Sodium|Potassium|Calcium|Phosphorus|"
    r"Uric\s+Acid|Blood\s+Sugar|Random\s+Blood\s+Sugar|Fasting\s+Blood\s+Sugar|"
    r"PT|INR|aPTT|D-Dimer|Ferritin|Iron|TIBC|Vitamin\s+D|B12|Folate|"
    r"NS1|Dengue|Malaria|Typhoid|Widal|HIV|HBsAg|HCV|Hep[- ]?[ABC]|"
    r"COVID|RT-PCR|Rapid\s+Antigen)"
    r"\s*[:=]?\s*\d+(?:\.\d+)?\s*(?:mg/dL|g/dL|g/L|%|mm/hr|IU/L|U/L|"
    r"mEq/L|mmol/L|ng/mL|pg/mL|µg/dL|/uL|/mm³|×?\s*10[³⁹]?)?)"
)

# ICD-10 codes
ICD10_RX = re.compile(r"\b[A-TV-Z]\d{2}(?:\.\d{1,2})?\b")

# Medical complaint prefixes (preserve the content after them)
COMPLAINT_RX = re.compile(
    r"(?i)\b(?:C/O|K/C/O|H/O|K/C|Complaint\s+of|Known\s+case\s+of|"
    r"History\s+of|Diagnosed\s+with|Presenting\s+complaints?)\s*[:=]?\s*"
    r"([^\n]{3,100})"
)

# Disease names that look like person names
DISEASE_NAMES = {
    "parkinson", "parkinson's", "alzheimer", "alzheimer's", "addison",
    "addison's", "cushing", "cushing's", "hodgkin", "hodgkin's",
    "crohn", "crohn's", "hashimoto", "hashimoto's", "bell", "bell's",
    "graves", "graves'", "paget", "paget's", "raynaud", "raynaud's",
    "wilson", "wilson's", "marfan", "marfan's", "turner", "turner's",
    "down", "down's", "barrett", "barrett's",
}

# Ward names (keep these)
WARD_NAMES_RX = re.compile(
    r"(?i)\b(?:Ward\s+\d+|ICU|NICU|PICU|CCU|HDU|OT|Operation\s+Theatre|"
    r"Emergency|Casualty|OPD|IPD|Maternity|Labour\s+Room|SNCU|"
    r"Medicine|Surgery|Orthopaedics?|Paediatrics?|Gynaecology|ENT|"
    r"Ophthalmology|Dermatology|Psychiatry)\b"
    r"(?:\s*\([^)]+\))?"
    r"(?:\s*/\s*Bed\s+\d+)?"
)

# "ASHA worker" is a medical role, not a person named Asha
ASHA_WORKER_RX = re.compile(r"(?i)\bASHA\s+(?:workers?|karyakarta)")


def is_medical_context(text: str, start: int, end: int) -> bool:
    """Check if the region around [start:end] is a medical context (should be preserved)."""
    # Look at the 30 chars before the match
    pre = text[max(0, start - 30):start].lower()
    post = text[end:min(len(text), end + 30)].lower()

    # Medical complaint prefixes
    if re.search(r"(?:c/o|k/c/o|h/o|k/c|complaint|history|diagnosed|presenting)\s*[:=]?\s*$", pre):
        return True

    # Disease eponym context
    for dn in DISEASE_NAMES:
        if dn in text[start:end].lower():
            return True

    # Drug context
    if re.search(r"(?:tab|cap|inj|syp|rx|dose|mg|ml)\s*$", pre):
        return True
    if re.search(r"^\s*(?:\d+\s*mg|ml|mcg|units?|od|bd|tds|qds)", post):
        return True

    return False


_DRUGS_RX = re.compile(
    r"(?i)(?<![A-Za-z])(?:" + "|".join(re.escape(d) for d in sorted(DRUGS, key=len, reverse=True)) + r")(?![A-Za-z])"
)


def find_medical_spans(text: str) -> list[tuple[int, int]]:
    """Find all spans in text that contain medical data (should be preserved)."""
    spans = []
    for rx in (DOSE_FORMS_RX, DOSE_QTY_RX, DOSE_FREQ_RX, VITALS_RX, LAB_RX, ICD10_RX,
               WARD_NAMES_RX, ASHA_WORKER_RX, COMPLAINT_RX, _DRUGS_RX):
        for m in rx.finditer(text):
            spans.append((m.start(), m.end()))
    return spans


def overlaps_medical(start: int, end: int, medical_spans: list[tuple[int, int]]) -> bool:
    """Check if a PII span overlaps any medical span."""
    for ms, me in medical_spans:
        if start < me and end > ms:
            return True
    return False
