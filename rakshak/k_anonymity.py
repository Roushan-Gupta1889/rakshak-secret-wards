"""Adaptive corpus k-anonymity and re-identification risk planner."""
from __future__ import annotations

import datetime as dt
import re
from collections import Counter, defaultdict
from dataclasses import dataclass

from .columns import ColumnType, classify_column, infer_csv_column_types
from .crypto import age_band
from .detectors import DOB_LABEL_RX, DATE_RX, canonical_clean
from .io_utils import decode_bytes, detect_delimiter, parse_json_safe, read_csv_rows
from .medical import ICD10_RX
from .privacy import parse_date


@dataclass(frozen=True)
class ClusterPrivacyPlan:
    """Adaptive per-cluster (or fallback) privacy transformation parameters."""

    cohort_size: int = 1
    is_rare_clinical: bool = False
    is_extreme_age: bool = False
    dob_mode: str = "shift"          # "shift" | "suppress"
    age_mode: str = "band"           # "band" | "suppress"
    age_width: int = 5               # 5 | 10 | 20 | 30
    age_top_code: int = 85           # 85 | 75 | 70 | 60
    mask_pin: bool = False           # False -> prefix3, True -> [PIN]
    coarsen_district: bool = False   # False -> keep district, True -> district_label
    district_label: str = "[DISTRICT]"
    mask_hospital_city: bool = False


_DIST_PREFIX_RX = re.compile(r"(?i)^(?:distt?\.?|district|जिला)\s*[:=.\-]?\s*")
_TEXT_DIST_RX = re.compile(
    r"(?i)(?:Distt?\.?|District|जिला)\s*[:=.\-]?\s*"
    r"([A-Za-z\u0900-\u097F][A-Za-z\u0900-\u097F ]{1,30}?)"
    r"(?=[,\n;|\]}\-]|\s{2,}|\s+-|\s+\d|$)"
)
_DIAG_LINE_RX = re.compile(
    r"(?im)^(?:Final\s+|Provisional\s+|Primary\s+|Chief\s+)?(?:Diagnosis|Condition|Impression|Complaints?)\s*[:=\-]\s*(.+)$"
)
_PIN6_RX = re.compile(r"\b([1-9]\d{5})\b")
_CLINICAL_STOPWORDS = {
    "unspecified", "primary", "secondary", "chronic", "acute", "disease",
    "disorder", "syndrome", "condition", "history", "completed", "patient",
    "without", "complications", "normal", "study", "fever", "cough", "pain",
    "weakness", "vomiting", "days", "weeks", "months", "years", "moderate",
    "severe", "mild", "suspected", "confirmed", "followup", "follow", "review",
    "general", "medicine", "surgery", "report", "findings", "clinical",
}
_DIAG_JSON_KEYS = {
    "diagnosis", "diagnoses", "condition", "conditions", "condition_hint",
    "impression", "complaint", "complaints", "display", "text",
}


def _normalize_district_key(val: str) -> str:
    """Canonicalize English/Hindi district names without fixed district lists."""
    s = canonical_clean(str(val), decode_escapes=True).strip()
    s = _DIST_PREFIX_RX.sub("", s).strip(" ,.;:-")
    if not s or len(s) < 3:
        return ""
    if any("\u0900" <= c <= "\u097F" for c in s):
        from .linker import transliterate_deva_to_latin
        s = transliterate_deva_to_latin(s)
    key = re.sub(r"[^a-z]", "", s.lower())
    if len(key) < 3 or key in {"district", "distt", "uttarpradesh", "india", "unknown"}:
        return ""
    return key


def _extract_diag_tokens(text: str) -> set[str]:
    """Extract lower-cased significant clinical nouns and ICD-10 roots from diagnosis text."""
    out: set[str] = set()
    for code in ICD10_RX.findall(text):
        cu = code.upper()
        out.add(f"icd:{cu[:3]}")
        out.add(f"icdfull:{cu}")
    for w in re.findall(r"[A-Za-z]{6,}", text.lower()):
        if w not in _CLINICAL_STOPWORDS:
            out.add(f"dx:{w}")
    return out


def _estimate_corpus_ref_year(raw_data: dict[str, tuple[bytes, str]]) -> int:
    """Estimate clinical reference year as median year of corpus clinical dates."""
    years: list[int] = []
    for rel in sorted(raw_data.keys()):
        raw, _ = raw_data[rel]
        txt = decode_bytes(raw)
        if not txt:
            continue
        for m in DATE_RX.finditer(txt[:8000]):
            d = parse_date(m.group(0), "dmy")
            if d and 2010 <= d.year <= 2035:
                years.append(d.year)
        if len(years) >= 400:
            break
    if not years:
        return dt.date.today().year
    years.sort()
    return years[len(years) // 2]


def _extract_birth_year_from_str(val: str, date_hint: str) -> int | None:
    d = parse_date(str(val), date_hint)
    if d and 1900 <= d.year <= 2035:
        return d.year
    m = re.match(r"^\s*(19\d{2}|20\d{2})\b", str(val).strip())
    if m:
        return int(m.group(1))
    return None


@dataclass
class _ClusterQI:
    cluster_key: str
    ages: list[int]
    birth_years: list[int]
    genders: set[str]
    districts: Counter
    pin3s: set[str]
    clinical_tokens: set[str]


def _band_bucket(age: int | None, width: int, top_code: int) -> str:
    if age is None:
        return "UNK"
    return age_band(age, width=width, top_code=top_code)


def _cell_key(q: _ClusterQI, use_dist: bool, use_pin: bool,
              width: int, top_code: int, gender_in_key: bool = True) -> tuple[str, ...]:
    dist = q.districts.most_common(1)[0][0] if (use_dist and q.districts) else "*"
    pin = sorted(q.pin3s)[0] if (use_pin and q.pin3s) else "*"
    gen = next(iter(q.genders)) if (gender_in_key and len(q.genders) == 1) else "*"
    age_val = sorted(q.ages)[len(q.ages) // 2] if q.ages else None
    band = _band_bucket(age_val, width, top_code)
    return (dist, pin, gen, band)


def build_cluster_plans(
    raw_data: dict[str, tuple[bytes, str]],
    linker,
    policy: dict,
    mode_override: str | None = None,
) -> tuple[dict[str, ClusterPrivacyPlan], ClusterPrivacyPlan]:
    """Build deterministic adaptive privacy plans per cluster from corpus structure.

    Uses only the input corpus and linked clusters (zero external registries).
    """
    k_target = int(policy.get("min_group_size", 5))
    base_width = int(policy.get("age_band_years", 5))
    mode = (mode_override or str(policy.get("privacy_mode", "adaptive_k_mixed"))).strip().lower()
    district_label = str(policy.get("district_generalize_label", "[DISTRICT]"))

    if mode == "base" or k_target <= 1:
        base_plan = ClusterPrivacyPlan(
            dob_mode="shift",
            age_mode="band",
            age_width=base_width,
            age_top_code=85,
            mask_pin=False,
            coarsen_district=False,
            district_label=district_label,
            mask_hospital_city=False,
        )
        plans = {linker.get_patient_key(i): base_plan for i in range(len(linker.records)) if linker.get_patient_key(i)}
        return plans, ClusterPrivacyPlan(
            dob_mode="suppress", age_mode="band", age_width=base_width, age_top_code=85,
            mask_pin=False, coarsen_district=False, district_label=district_label,
        )

    ref_year = _estimate_corpus_ref_year(raw_data)

    # Index linked records by file -> list of (loc, cluster_key, RecordEvidence)
    by_file: dict[str, list[tuple[str, str, object]]] = defaultdict(list)
    clusters: dict[str, _ClusterQI] = {}
    for idx, ev in enumerate(linker.records):
        pkey = linker.get_patient_key(idx)
        if not pkey:
            continue
        by_file[ev.file_rel].append((ev.loc, pkey, ev))
        cq = clusters.get(pkey)
        if cq is None:
            cq = _ClusterQI(
                cluster_key=pkey, ages=[], birth_years=[], genders=set(),
                districts=Counter(), pin3s=set(), clinical_tokens=set(),
            )
            clusters[pkey] = cq
        if ev.age is not None and 0 < ev.age < 120:
            cq.ages.append(ev.age)
        if ev.gender in ("M", "F"):
            cq.genders.add(ev.gender)

    # Extract missing cluster QIs (DOB->age, district, pin3) and clinical rarity from corpus
    for rel in sorted(raw_data.keys()):
        raw, _ = raw_data[rel]
        if rel.lower().startswith("clean/") or not raw.strip():
            continue
        txt = decode_bytes(raw)
        if not txt:
            continue
        linked_entries = by_file.get(rel, [])
        if not linked_entries:
            continue

        ext = "." + rel.rsplit(".", 1)[-1].lower() if "." in rel else ""
        date_hint = "mdy" if ("arogya" in rel.lower() or "mm/dd" in txt[:400].lower()) else "dmy"

        if ext in (".csv", ".tsv"):
            delim = "\t" if ext == ".tsv" else detect_delimiter(txt)
            header, body = read_csv_rows(txt, delim)
            if header and body:
                col_types = infer_csv_column_types(header, body)
                loc_map = {loc: pkey for loc, pkey, _ in linked_entries}
                for i, row in enumerate(body):
                    pkey = loc_map.get(f"row:{i}")
                    if not pkey:
                        continue
                    cq = clusters[pkey]
                    for j, cell in enumerate(row):
                        val = cell.strip()
                        if not val or j >= len(col_types):
                            continue
                        ct = col_types[j]
                        hl = header[j].lower()
                        if ct == ColumnType.DOB:
                            by = _extract_birth_year_from_str(val, date_hint)
                            if by is not None:
                                cq.birth_years.append(by)
                        elif ct == ColumnType.DISTRICT:
                            dk = _normalize_district_key(val)
                            if dk:
                                cq.districts[dk] += 1
                        elif ct == ColumnType.PIN:
                            digits = re.sub(r"\D", "", val)
                            if len(digits) == 6:
                                cq.pin3s.add(digits[:3])
                        elif ct == ColumnType.UNKNOWN or any(x in hl for x in ("diag", "cond", "icd", "comp", "proc", "remark")):
                            cq.clinical_tokens.update(_extract_diag_tokens(val))
                continue

        if ext == ".json":
            data = parse_json_safe(txt)
            if isinstance(data, dict):
                is_fhir = data.get("resourceType") == "Bundle"
                if is_fhir:
                    pkey = linked_entries[0][1]
                    cq = clusters[pkey]
                    for ent in data.get("entry") or []:
                        res = (ent or {}).get("resource") or {}
                        rt = res.get("resourceType")
                        if rt == "Patient":
                            bd = res.get("birthDate")
                            if isinstance(bd, str):
                                by = _extract_birth_year_from_str(bd, "ymd")
                                if by is not None:
                                    cq.birth_years.append(by)
                            for addr in res.get("address") or []:
                                if isinstance(addr, dict):
                                    for dk_field in ("district", "city"):
                                        if addr.get(dk_field):
                                            dk = _normalize_district_key(str(addr[dk_field]))
                                            if dk:
                                                cq.districts[dk] += 1
                                    pc = re.sub(r"\D", "", str(addr.get("postalCode", "")))
                                    if len(pc) == 6:
                                        cq.pin3s.add(pc[:3])
                        elif rt in ("Condition", "DiagnosticReport", "Procedure", "Observation"):
                            code_obj = res.get("code") or {}
                            if isinstance(code_obj, dict):
                                if code_obj.get("text"):
                                    cq.clinical_tokens.update(_extract_diag_tokens(str(code_obj["text"])))
                                for cd in code_obj.get("coding") or []:
                                    if isinstance(cd, dict):
                                        if cd.get("code"):
                                            cq.clinical_tokens.update(_extract_diag_tokens(str(cd["code"])))
                                        if cd.get("display"):
                                            cq.clinical_tokens.update(_extract_diag_tokens(str(cd["display"])))
                    continue

                # Structured or list JSON
                for loc, pkey, _ in linked_entries:
                    cq = clusters[pkey]
                    target = data
                    if loc.startswith("/"):
                        ok = True
                        for part in loc.strip("/").split("/"):
                            part = part.replace("~1", "/").replace("~0", "~")
                            if isinstance(target, list) and part.isdigit() and int(part) < len(target):
                                target = target[int(part)]
                            elif isinstance(target, dict) and part in target:
                                target = target[part]
                            else:
                                ok = False
                                break
                        if not ok:
                            continue
                    _walk_json_qi(target, cq, date_hint)
                continue

        # Free text (or fallback CSV/JSON text)
        pkey = linked_entries[0][1]
        cq = clusters[pkey]
        for m in DOB_LABEL_RX.finditer(txt):
            by = _extract_birth_year_from_str(m.group(1), date_hint)
            if by is not None:
                cq.birth_years.append(by)
        for m in _TEXT_DIST_RX.finditer(txt):
            dk = _normalize_district_key(m.group(1))
            if dk:
                cq.districts[dk] += 1
        for m in _PIN6_RX.finditer(txt):
            ctx_w = txt[max(0, m.start() - 30):min(len(txt), m.end() + 20)].lower()
            if not any(w in ctx_w for w in ("platelet", "/ul", "/mm", "amt", "amount", "rs", "inr")):
                cq.pin3s.add(m.group(1)[:3])
        for m in _DIAG_LINE_RX.finditer(txt):
            cq.clinical_tokens.update(_extract_diag_tokens(m.group(1)))
        for code in ICD10_RX.findall(txt):
            cq.clinical_tokens.add(f"icd:{code.upper()[:3]}")
            cq.clinical_tokens.add(f"icdfull:{code.upper()}")

    # Synthesize age from birth_years when age wasn't directly given
    for cq in clusters.values():
        if not cq.ages and cq.birth_years:
            by = sorted(cq.birth_years)[len(cq.birth_years) // 2]
            est = ref_year - by
            if 0 <= est <= 115:
                cq.ages.append(est)

    # Corpus-wide diagnosis rarity (excluding 1-cluster synthetic micro-tests)
    n_clusters = len(clusters)
    token_df: Counter = Counter()
    for cq in clusters.values():
        for tok in cq.clinical_tokens:
            token_df[tok] += 1

    rare_cutoff = max(1, n_clusters // 35) if n_clusters >= 12 else 0
    rare_clusters: set[str] = set()
    if rare_cutoff > 0:
        for pkey, cq in clusters.items():
            icd_roots = [t for t in cq.clinical_tokens if t.startswith("icd:")]
            dx_words = [t for t in cq.clinical_tokens if t.startswith("dx:")]
            if any(token_df[t] <= rare_cutoff for t in icd_roots):
                rare_clusters.add(pkey)
            elif not icd_roots and any(token_df[t] == 1 for t in dx_words):
                rare_clusters.add(pkey)

    # Precompute equivalence-class histograms at each lattice level
    def _counts(use_dist: bool, use_pin: bool, width: int, top_code: int,
                subset: list[_ClusterQI] | None = None) -> Counter:
        cnt: Counter = Counter()
        items = subset if subset is not None else list(clusters.values())
        for cq in items:
            cnt[_cell_key(cq, use_dist, use_pin, width, top_code)] += 1
        return cnt

    cnt_d_p_5 = _counts(True, True, 5, 85)
    cnt_d_5 = _counts(True, False, 5, 85)
    cnt_d_10 = _counts(True, False, 10, 75)
    cnt_d_20 = _counts(True, False, 20, 70)
    cnt_g_5 = _counts(False, False, 5, 85)
    cnt_g_10 = _counts(False, False, 10, 75)
    cnt_g_20 = _counts(False, False, 20, 70)
    cnt_g_20_65 = _counts(False, False, 20, 65)

    plans: dict[str, ClusterPrivacyPlan] = {}
    for pkey, cq in sorted(clusters.items()):
        age_val = sorted(cq.ages)[len(cq.ages) // 2] if cq.ages else None
        is_rare = pkey in rare_clusters
        is_extreme = age_val is not None and age_val >= 80
        c0 = cnt_d_p_5[_cell_key(cq, True, True, 5, 85)]

        if mode == "adaptive_district_keep":
            ec_10 = cnt_d_10[_cell_key(cq, True, False, 10, 75)]
            ec_20 = cnt_d_20[_cell_key(cq, True, False, 20, 70)]
            if c0 >= k_target and not is_rare and not is_extreme:
                plans[pkey] = ClusterPrivacyPlan(c0, is_rare, is_extreme, "shift", "band", 5, 85, False, False, district_label, False)
            elif cnt_d_5[_cell_key(cq, True, False, 5, 85)] >= k_target and not is_rare and not is_extreme:
                plans[pkey] = ClusterPrivacyPlan(cnt_d_5[_cell_key(cq, True, False, 5, 85)], is_rare, is_extreme, "suppress", "band", 5, 85, True, False, district_label, False)
            elif ec_10 >= k_target and not is_rare and not is_extreme:
                plans[pkey] = ClusterPrivacyPlan(ec_10, is_rare, is_extreme, "suppress", "band", 10, 75, True, False, district_label, False)
            else:
                plans[pkey] = ClusterPrivacyPlan(
                    ec_20, is_rare, is_extreme, "suppress",
                    "suppress" if (is_rare or is_extreme) else "band",
                    20, 70, True, False, district_label, False,
                )
            continue

        if mode == "adaptive_k_mixed":
            # Keep district ONLY if cluster reaches >= k in corpus without rare/extreme flag; otherwise generalize hierarchically
            if c0 >= k_target and not is_rare and not is_extreme:
                plans[pkey] = ClusterPrivacyPlan(c0, False, False, "shift", "band", 5, 85, False, False, district_label, False)
            elif cnt_d_10[_cell_key(cq, True, False, 10, 75)] >= k_target and not is_rare and not is_extreme:
                ec = cnt_d_10[_cell_key(cq, True, False, 10, 75)]
                plans[pkey] = ClusterPrivacyPlan(ec, False, False, "suppress", "band", 10, 75, True, False, district_label, False)
            elif cnt_g_10[_cell_key(cq, False, False, 10, 75)] >= k_target and not is_rare and not is_extreme:
                ec = cnt_g_10[_cell_key(cq, False, False, 10, 75)]
                plans[pkey] = ClusterPrivacyPlan(ec, False, False, "suppress", "band", 10, 75, True, True, district_label, True)
            else:
                ec = cnt_g_20[_cell_key(cq, False, False, 20, 70)]
                sup_age = (is_rare or is_extreme or (n_clusters >= 12 and ec < k_target))
                plans[pkey] = ClusterPrivacyPlan(
                    ec, is_rare, is_extreme, "suppress",
                    "suppress" if sup_age else "band",
                    20, 70, True, True, district_label, True,
                )
            continue

        if mode == "k_global_dob_sup_5yr":
            # Drop DOB, PIN, District if cell < k (which in 8 districts is nearly always -> global 5yr/10yr cohort + top 70+/suppress rare)
            ec5 = cnt_g_5[_cell_key(cq, False, False, 5, 85)]
            ec10 = cnt_g_10[_cell_key(cq, False, False, 10, 75)]
            ec20 = cnt_g_20[_cell_key(cq, False, False, 20, 70)]
            if not is_rare and not is_extreme:
                if ec5 >= k_target:
                    plans[pkey] = ClusterPrivacyPlan(ec5, False, False, "suppress", "band", 5, 85, True, True, district_label, True)
                elif ec10 >= k_target:
                    plans[pkey] = ClusterPrivacyPlan(ec10, False, False, "suppress", "band", 10, 75, True, True, district_label, True)
                else:
                    plans[pkey] = ClusterPrivacyPlan(ec20, False, False, "suppress", "band", 20, 70, True, True, district_label, True)
            else:
                plans[pkey] = ClusterPrivacyPlan(ec20, is_rare, is_extreme, "suppress", "suppress", 20, 65, True, True, district_label, True)
            continue

        if mode == "k_band20_rare_sup":
            ec20 = cnt_g_20[_cell_key(cq, False, False, 20, 70)]
            ec_65 = cnt_g_20_65[_cell_key(cq, False, False, 20, 65)]
            sup_age = is_rare or is_extreme or (n_clusters >= 12 and ec_65 < k_target)
            plans[pkey] = ClusterPrivacyPlan(
                ec20, is_rare, is_extreme, "suppress",
                "suppress" if sup_age else "band",
                20, 65, True, True, district_label, True,
            )
            continue

        if mode == "k_band20_all_60plus":
            ec_65 = cnt_g_20_65[_cell_key(cq, False, False, 20, 65)]
            plans[pkey] = ClusterPrivacyPlan(
                ec_65, is_rare, is_extreme, "suppress",
                "suppress" if is_rare else "band",
                20, 60, True, True, district_label, True,
            )
            continue

        # Default "adaptive_k_dob_sup": corpus-driven hierarchy + DOB suppression to block ±2yr narrowing
        ec_d10 = cnt_d_10[_cell_key(cq, True, False, 10, 75)]
        if c0 >= k_target and not is_rare and not is_extreme:
            plans[pkey] = ClusterPrivacyPlan(c0, False, False, "suppress", "band", 5, 85, False, False, district_label, False)
        elif ec_d10 >= k_target and not is_rare and not is_extreme:
            plans[pkey] = ClusterPrivacyPlan(ec_d10, False, False, "suppress", "band", 10, 75, True, False, district_label, False)
        elif cnt_g_5[_cell_key(cq, False, False, 5, 85)] >= k_target and not is_rare and not is_extreme:
            ec5 = cnt_g_5[_cell_key(cq, False, False, 5, 85)]
            plans[pkey] = ClusterPrivacyPlan(ec5, False, False, "suppress", "band", 5, 85, True, True, district_label, True)
        elif cnt_g_10[_cell_key(cq, False, False, 10, 75)] >= k_target and not is_rare and not is_extreme:
            ec10 = cnt_g_10[_cell_key(cq, False, False, 10, 75)]
            plans[pkey] = ClusterPrivacyPlan(ec10, False, False, "suppress", "band", 10, 75, True, True, district_label, True)
        else:
            ec20 = cnt_g_20[_cell_key(cq, False, False, 20, 70)]
            sup_age = is_rare or is_extreme or (n_clusters >= 12 and ec20 < k_target)
            plans[pkey] = ClusterPrivacyPlan(
                ec20, is_rare, is_extreme, "suppress",
                "suppress" if sup_age else "band",
                20, 70, True, True, district_label, True,
            )

    # Conservative fallback for unlinked records (cannot assume large cohort)
    fallback_coarsen = mode not in ("base", "adaptive_district_keep")
    fallback_plan = ClusterPrivacyPlan(
        cohort_size=1,
        is_rare_clinical=False,
        is_extreme_age=False,
        dob_mode="suppress",
        age_mode="band",
        age_width=10 if mode != "k_band20_rare_sup" and mode != "k_band20_all_60plus" else 20,
        age_top_code=70 if mode != "k_band20_all_60plus" else 60,
        mask_pin=(mode != "base"),
        coarsen_district=fallback_coarsen,
        district_label=district_label,
        mask_hospital_city=fallback_coarsen,
    )
    return plans, fallback_plan


def _walk_json_qi(obj, cq: _ClusterQI, date_hint: str, parent_key: str = "") -> None:
    """Recursively gather DOB/district/PIN/diagnosis tokens for cluster profiling."""
    if isinstance(obj, list):
        for item in obj:
            _walk_json_qi(item, cq, date_hint, parent_key)
        return
    if not isinstance(obj, dict):
        return
    for k, v in obj.items():
        ks = str(k)
        kl = ks.lower()
        ct = classify_column(ks)
        if isinstance(v, (dict, list)):
            _walk_json_qi(v, cq, date_hint, ks)
            continue
        if v is None:
            continue
        vs = str(v).strip()
        if not vs:
            continue
        if ct == ColumnType.DOB or any(x in kl for x in ("dob", "birthdate", "janm")):
            by = _extract_birth_year_from_str(vs, date_hint)
            if by is not None:
                cq.birth_years.append(by)
        elif ct == ColumnType.AGE or kl == "age":
            m = re.fullmatch(r"\s*(\d{1,3})\s*(?:yrs?|years?|y)?\s*", vs, re.I)
            if m and 0 < int(m.group(1)) < 120:
                cq.ages.append(int(m.group(1)))
        elif ct == ColumnType.AGE_SEX or kl in ("age_sex", "age/sex"):
            m = re.match(r"^\s*(\d{1,3})\s*(?:[A-Za-z]*\s*)?/\s*([MFmf])", vs)
            if m and 0 < int(m.group(1)) < 120:
                cq.ages.append(int(m.group(1)))
                cq.genders.add(m.group(2).upper())
        elif ct == ColumnType.DISTRICT or kl in ("district", "distt", "jila"):
            dk = _normalize_district_key(vs)
            if dk:
                cq.districts[dk] += 1
        elif ct == ColumnType.PIN or kl in ("pin", "pincode", "postalcode", "zip"):
            digits = re.sub(r"\D", "", vs)
            if len(digits) == 6:
                cq.pin3s.add(digits[:3])
        elif kl in _DIAG_JSON_KEYS or any(x in kl for x in ("diag", "cond", "icd", "comp")):
            cq.clinical_tokens.update(_extract_diag_tokens(vs))
        elif isinstance(v, str) and ICD10_RX.search(vs):
            for code in ICD10_RX.findall(vs):
                cq.clinical_tokens.add(f"icd:{code.upper()[:3]}")
                cq.clinical_tokens.add(f"icdfull:{code.upper()}")
