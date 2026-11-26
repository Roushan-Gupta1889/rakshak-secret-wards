"""Patient record linking: cross-language, cross-hospital identity resolution."""
from __future__ import annotations

import re
from collections import defaultdict
from dataclasses import dataclass, field
from .names import canonical_name_token, is_devanagari

# ─────────────────────────────────────────────────────────────────────────────
# Akshara-aware Transliteration: Devanagari → Latin
# ─────────────────────────────────────────────────────────────────────────────

_VOWELS = {
    "अ": "a", "आ": "aa", "इ": "i", "ई": "ee", "उ": "u", "ऊ": "oo",
    "ए": "e", "ऐ": "ai", "ओ": "o", "औ": "au", "ऋ": "ri",
}

_CONSONANTS = {
    "क": "k", "ख": "kh", "ग": "g", "घ": "gh", "ङ": "ng",
    "च": "ch", "छ": "chh", "ज": "j", "झ": "jh", "ञ": "ny",
    "ट": "t", "ठ": "th", "ड": "d", "ढ": "dh", "ण": "n",
    "त": "t", "थ": "th", "द": "d", "ध": "dh", "न": "n",
    "प": "p", "फ": "ph", "ब": "b", "भ": "bh", "म": "m",
    "य": "y", "र": "r", "ल": "l", "व": "v", "श": "sh",
    "ष": "sh", "स": "s", "ह": "h",
    "क़": "q", "ख़": "kh", "ग़": "gh", "ज़": "z", "ड़": "d",
    "ढ़": "dh", "फ़": "f",
}

_MATRAS = {
    "ा": "aa", "ि": "i", "ी": "ee", "ु": "u", "ू": "oo",
    "े": "e", "ै": "ai", "ो": "o", "ौ": "au", "ृ": "ri", "ॄ": "ree",
}

_MODIFIERS = {"ं": "n", "ः": "h", "ँ": "n"}

# Stop tokens that must NEVER enter identity name sets
_STOP_NAME_TOKENS = {
    "s/o", "w/o", "d/o", "c/o", "so", "wo", "do", "co",
    "mr", "mrs", "ms", "dr", "smt", "shri", "prof",
    "naam", "name", "patient", "relative", "guardian",
    "aayu", "aayau", "umar", "age", "ling", "sex", "gender",
    "gaon", "tehsil", "jila", "district", "village", "vill", "gram",
    "hospital", "charitable", "multispeciality", "trust", "clinic",
    "sadan", "seva", "health", "centre", "center", "medical",
    "sanjeevani", "arogya", "jeevan", "jyoti", "hardoi", "lifeline", "pathkind",
    "ward", "bed", "diet", "reg", "uhid", "ipd", "opd", "mob", "phone",
}

_GENERIC_NAME_TOKENS = {
    "devi", "kumar", "kumari", "lal", "chand", "ram", "bai",
    "begum", "md", "mohd", "mohammed", "mohammad", "muhammad",
    "sri", "smt", "shri",
}


def transliterate_deva_to_latin(text: str) -> str:
    """Akshara-aware Devanagari to Latin transliteration (handles matras and halant)."""
    out: list[str] = []
    n = len(text)
    i = 0
    while i < n:
        ch = text[i]
        # Two-char nukta consonant check
        if i + 1 < n and text[i:i + 2] in _CONSONANTS:
            cons = _CONSONANTS[text[i:i + 2]]
            i += 2
            nxt = text[i] if i < n else ""
            if nxt in _MATRAS:
                out.append(cons + _MATRAS[nxt])
                i += 1
            elif nxt == "्":
                out.append(cons)
                i += 1
            else:
                out.append(cons + ("a" if nxt and not nxt.isspace() else ""))
            continue

        if ch in _CONSONANTS:
            cons = _CONSONANTS[ch]
            i += 1
            if i < n and text[i] == "़":
                i += 1
            nxt = text[i] if i < n else ""
            if nxt in _MATRAS:
                out.append(cons + _MATRAS[nxt])
                i += 1
            elif nxt == "्":
                out.append(cons)
                i += 1
            else:
                # Inherent 'a' if next is another Devanagari consonant/modifier, omit at word end
                if nxt and (nxt in _CONSONANTS or nxt in _MODIFIERS):
                    out.append(cons + "a")
                else:
                    out.append(cons)
            continue

        if ch in _VOWELS:
            out.append(_VOWELS[ch])
            i += 1
        elif ch in _MODIFIERS:
            out.append(_MODIFIERS[ch])
            i += 1
        elif ch == "़" or ch == "्":
            i += 1
        elif ch.isspace():
            out.append(" ")
            i += 1
        elif ch.isascii():
            out.append(ch)
            i += 1
        else:
            i += 1
    return "".join(out).strip()


def phonetic_indic_key(token: str) -> str:
    """Normalize unseen Latin/transliterated Indic name spelling variants."""
    t = token.lower().strip()
    t = re.sub(r"[^a-z]", "", t)
    if len(t) <= 3:
        return t
    t = t.replace("aa", "a").replace("ee", "i").replace("ii", "i")
    t = t.replace("oo", "u").replace("uu", "u").replace("ou", "au")
    t = t.replace("ph", "f").replace("ksh", "x").replace("v", "w")
    t = re.sub(r"([a-z])\1+", r"\1", t)
    if t.endswith("ey") and len(t) > 4:
        t = t[:-1]  # pandey -> pande
    if t.endswith("a") and len(t) > 4:
        t = t[:-1]  # kamala -> kamal, gita -> git
    return t


# ─────────────────────────────────────────────────────────────────────────────
# Record evidence structure
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class RecordEvidence:
    file_rel: str
    loc: str
    names_latin: frozenset[str] = field(default_factory=frozenset)
    names_full: str = ""
    relatives_latin: frozenset[str] = field(default_factory=frozenset)
    phones: frozenset[str] = field(default_factory=frozenset)
    mrns: frozenset[str] = field(default_factory=frozenset)
    aadhaar: frozenset[str] = field(default_factory=frozenset)
    abha: frozenset[str] = field(default_factory=frozenset)
    pan: frozenset[str] = field(default_factory=frozenset)
    insurance: frozenset[str] = field(default_factory=frozenset)
    age: int | None = None
    gender: str | None = None
    village: str | None = None
    hospital: str | None = None


def normalize_phone(phone: str) -> str:
    """Normalize phone to 10-digit string."""
    digits = re.sub(r"\D", "", phone)
    if len(digits) > 10 and digits.startswith("91"):
        digits = digits[2:]
    return digits[-10:] if len(digits) >= 10 else digits


def normalize_mrn(mrn: str) -> str:
    """Normalize MRN to comparable form."""
    return re.sub(r"[\s\-/]", "", mrn).upper()


def _mrn_prefix(mrn: str) -> str:
    m = re.match(r"^([A-Z]+)", mrn)
    return m.group(1) if m else ""


def extract_name_tokens_latin(name: str) -> frozenset[str]:
    """Extract canonical name tokens from a Latin or Devanagari name string."""
    if not name:
        return frozenset()
    parts = re.split(r"[\s.,'/:;|()\-]+", name.strip())
    canonical = set()
    for raw_t in parts:
        if not raw_t:
            continue
        low_raw = raw_t.lower()
        if low_raw in _STOP_NAME_TOKENS:
            continue
        c = canonical_name_token(low_raw)
        if c in _STOP_NAME_TOKENS:
            continue
        if is_devanagari(raw_t) and c == low_raw:
            # Map whole word or transliterate akshara-by-akshara
            trans = transliterate_deva_to_latin(raw_t).lower()
            c = canonical_name_token(trans)
        if c in _STOP_NAME_TOKENS:
            continue
        # Strip non-alpha chars and MRN-like strings
        if re.match(r"^(?:jjh|snj|dhh|ipd|adm|uhid|opd|bl)\d+", c):
            continue
        if len(c) >= 2 and any(ch.isalpha() for ch in c):
            canonical.add(c)
    return frozenset(canonical)


def _name_tokens_match(a_toks: frozenset[str], b_toks: frozenset[str]) -> tuple[set[str], set[str], set[str]]:
    """Compare name tokens with exact + Indic phonetic fallback."""
    id_a = a_toks - _GENERIC_NAME_TOKENS
    id_b = b_toks - _GENERIC_NAME_TOKENS
    if not id_a or not id_b:
        return set(), id_a, id_b
    shared = set(id_a & id_b)
    if len(shared) < min(len(id_a), len(id_b)):
        ph_b = {phonetic_indic_key(t): t for t in id_b}
        for ta in id_a:
            if ta not in shared:
                pa = phonetic_indic_key(ta)
                if len(pa) >= 3 and pa in ph_b:
                    shared.add(ta)
    return shared, id_a, id_b


# ─────────────────────────────────────────────────────────────────────────────
# Cluster-safe two-phase PatientLinker
# ─────────────────────────────────────────────────────────────────────────────

class PatientLinker:
    """Links patient records across files using cluster-safe two-phase resolution."""

    def __init__(self):
        self.records: list[RecordEvidence] = []
        self.clusters: list[int] = []
        self._cluster_keys: dict[int, str | None] = {}

    def add_record(self, evidence: RecordEvidence):
        """Add a record with its extracted evidence."""
        self.records.append(evidence)
        self.clusters.append(len(self.records) - 1)

    def _find(self, i: int) -> int:
        while self.clusters[i] != i:
            self.clusters[i] = self.clusters[self.clusters[i]]
            i = self.clusters[i]
        return i

    def _union(self, i: int, j: int):
        ri, rj = self._find(i), self._find(j)
        if ri != rj:
            # Smaller root wins deterministically
            if ri < rj:
                self.clusters[rj] = ri
            else:
                self.clusters[ri] = rj

    def _match_score(self, a: RecordEvidence, b: RecordEvidence) -> tuple[float, bool]:
        """Score evidence similarity. Returns (score, has_strong_id_match)."""
        score = 0.0
        strong_id = False

        # Strong personal identifiers
        if a.phones & b.phones:
            score += 55.0
            strong_id = True
        if a.aadhaar & b.aadhaar:
            score += 65.0
            strong_id = True
        if a.abha & b.abha:
            score += 65.0
            strong_id = True
        if a.pan & b.pan:
            score += 50.0
            strong_id = True
        if a.insurance & b.insurance:
            score += 40.0
            strong_id = True
        if a.mrns & b.mrns:
            score += 55.0
            strong_id = True

        # Name similarity
        shared, id_a, id_b = _name_tokens_match(a.names_latin, b.names_latin)
        if shared:
            union_cnt = len(id_a) + len(id_b) - len(shared)
            name_sim = len(shared) / max(1, union_cnt)
            if len(shared) >= 2:
                score += 30.0 * name_sim + (5.0 if len(shared) == len(id_a) == len(id_b) else 0.0)
            else:
                # Single identifying token (e.g. "Asha"): weaker unless corroborated by relative/ID!
                score += 18.0 * name_sim
        elif id_a and id_b:
            # Both have identifying names and ZERO overlap -> strong negative against accidental merge!
            score -= 25.0

        # Relative overlap (vital for fragmented notes like "Asha, W/o Kamal")
        rel_shared, rel_a, rel_b = _name_tokens_match(a.relatives_latin, b.relatives_latin)
        if rel_shared:
            score += 22.0 if len(rel_shared) == 1 else 30.0
        elif rel_a and rel_b:
            score -= 35.0  # Contradicting relatives

        # Gender consistency
        if a.gender and b.gender and a.gender != b.gender:
            score -= 120.0

        # Age consistency
        if a.age is not None and b.age is not None:
            diff = abs(a.age - b.age)
            if diff <= 2:
                score += 10.0
            elif diff <= 4:
                score += 3.0
            elif diff > 8:
                score -= 40.0

        # Village consistency
        if a.village and b.village:
            if a.village == b.village or phonetic_indic_key(a.village) == phonetic_indic_key(b.village):
                score += 12.0
            else:
                score -= 25.0

        return score, strong_id

    def link_all(self, threshold: float = 38.0):
        """Two-phase cluster-compatible linkage across all records."""
        n = len(self.records)
        if n == 0:
            return

        # Build deterministic blocking indexes
        phone_idx: dict[str, list[int]] = defaultdict(list)
        mrn_idx: dict[str, list[int]] = defaultdict(list)
        name_idx: dict[str, list[int]] = defaultdict(list)

        for i, r in enumerate(self.records):
            for p in sorted(r.phones):
                phone_idx[p].append(i)
            for m in sorted(r.mrns):
                mrn_idx[m].append(i)
            for n_tok in sorted(r.names_latin):
                if len(n_tok) >= 3 and n_tok not in _GENERIC_NAME_TOKENS:
                    name_idx[n_tok].append(i)
                    pk = phonetic_indic_key(n_tok)
                    if len(pk) >= 3 and pk != n_tok:
                        name_idx[f"PH:{pk}"].append(i)

        candidates: set[tuple[int, int]] = set()
        for idx_map in (phone_idx, mrn_idx, name_idx):
            for _, members in sorted(idx_map.items()):
                if len(members) > 80:
                    continue  # Skip overly noisy blocks
                for a_i in range(len(members)):
                    for b_i in range(a_i + 1, len(members)):
                        u, v = members[a_i], members[b_i]
                        if u != v:
                            candidates.add((min(u, v), max(u, v)))

        # Maintain per-cluster pooled attributes to block transitive hairballs!
        cluster_members: dict[int, list[int]] = {i: [i] for i in range(n)}
        cluster_genders: dict[int, set[str]] = {
            i: ({r.gender} if r.gender else set()) for i, r in enumerate(self.records)
        }
        cluster_ages: dict[int, list[int]] = {
            i: ([r.age] if r.age is not None else []) for i, r in enumerate(self.records)
        }
        cluster_villages: dict[int, set[str]] = {
            i: ({phonetic_indic_key(r.village)} if r.village else set())
            for i, r in enumerate(self.records)
        }
        cluster_phones: dict[int, set[str]] = {
            i: set(r.phones) for i, r in enumerate(self.records)
        }
        cluster_mrn_by_pfx: dict[int, dict[str, set[str]]] = {}
        for i, r in enumerate(self.records):
            mp: dict[str, set[str]] = defaultdict(set)
            for m in r.mrns:
                pfx = _mrn_prefix(m)
                if pfx:
                    mp[pfx].add(m)
            cluster_mrn_by_pfx[i] = mp

        def _can_merge_clusters(ra: int, rb: int, allow_multi_phone: bool = False) -> bool:
            # 1. Gender consistency
            ga, gb = cluster_genders[ra], cluster_genders[rb]
            if ga and gb and (ga | gb) != ga and len(ga | gb) > 1:
                return False
            # 2. Age range consistency (<= 5 years across cluster)
            aa, ab = cluster_ages[ra], cluster_ages[rb]
            if aa and ab:
                comb = aa + ab
                if max(comb) - min(comb) > 5:
                    return False
            # 3. Village consistency for name-only merges
            if not allow_multi_phone:
                va, vb = cluster_villages[ra], cluster_villages[rb]
                if va and vb and not (va & vb):
                    return False
                pa, pb = cluster_phones[ra], cluster_phones[rb]
                if pa and pb and not (pa & pb):
                    return False
                # Disjoint MRNs in the same hospital system cannot belong to the same patient
                ma, mb = cluster_mrn_by_pfx[ra], cluster_mrn_by_pfx[rb]
                for pfx in ma:
                    if pfx in mb and not (ma[pfx] & mb[pfx]):
                        return False
            return True

        def _merge_clusters(ra: int, rb: int) -> None:
            self._union(ra, rb)
            new_r = self._find(ra)
            old_r = rb if new_r == ra else ra
            cluster_members[new_r].extend(cluster_members.pop(old_r))
            cluster_genders[new_r] |= cluster_genders.pop(old_r)
            cluster_ages[new_r].extend(cluster_ages.pop(old_r))
            cluster_villages[new_r] |= cluster_villages.pop(old_r)
            cluster_phones[new_r] |= cluster_phones.pop(old_r)
            old_mp = cluster_mrn_by_pfx.pop(old_r)
            for pfx, s in old_mp.items():
                cluster_mrn_by_pfx[new_r][pfx] |= s

        strong_edges: list[tuple[float, int, int]] = []
        soft_edges: list[tuple[float, int, int]] = []

        for i, j in sorted(candidates):
            score, is_strong = self._match_score(self.records[i], self.records[j])
            if is_strong and score >= 45.0:
                strong_edges.append((-score, i, j))
            elif score >= threshold:
                soft_edges.append((-score, i, j))

        # Phase 1: Strong ID links first (phone / Aadhaar / ABHA / PAN / MRN)
        for _, i, j in sorted(strong_edges):
            ri, rj = self._find(i), self._find(j)
            if ri != rj and _can_merge_clusters(ri, rj, allow_multi_phone=True):
                _merge_clusters(ri, rj)

        # Phase 2: Name + corroborator links in descending confidence order
        for _, i, j in sorted(soft_edges):
            ri, rj = self._find(i), self._find(j)
            if ri != rj and _can_merge_clusters(ri, rj, allow_multi_phone=False):
                _merge_clusters(ri, rj)

        self._build_cluster_keys()

    def _build_cluster_keys(self) -> None:
        """Compute canonical patient key once per cluster for O(1) lookup."""
        by_root: dict[int, list[int]] = defaultdict(list)
        for i in range(len(self.records)):
            by_root[self._find(i)].append(i)

        self._cluster_keys = {}
        for root, members in by_root.items():
            all_phones: set[str] = set()
            all_mrns: set[str] = set()
            all_names: set[str] = set()
            for idx in members:
                r = self.records[idx]
                all_phones |= r.phones
                all_mrns |= r.mrns
                all_names |= r.names_latin

            parts = []
            if all_phones:
                parts.append("PH:" + sorted(all_phones)[0])
            elif all_mrns:
                parts.append("MRN:" + sorted(all_mrns)[0])
            if all_names:
                parts.append("N:" + "+".join(sorted(all_names)[:3]))
            self._cluster_keys[root] = "|".join(parts) if parts else None

    def get_clusters(self) -> dict[int, list[int]]:
        """Return clusters as {root_id: [record_indices]}."""
        clusters: dict[int, list[int]] = defaultdict(list)
        for i in range(len(self.records)):
            clusters[self._find(i)].append(i)
        return dict(clusters)

    def get_patient_key(self, record_idx: int) -> str | None:
        """Get a stable canonical patient key for a record's cluster in O(1)."""
        root = self._find(record_idx)
        return self._cluster_keys.get(root)
