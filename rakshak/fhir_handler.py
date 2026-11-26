"""FHIR R4 Bundle sanitization: clean PII from FHIR resources while keeping structure valid."""
from __future__ import annotations

import base64 as b64mod
import copy
import re
from .detectors import try_decode_b64_text, try_decode_hex_text, find_mrn, find_all_identifiers
from .privacy import shift_date_string
from .text_sanitizer import TextSanitizer

_ISO_DATE_VALUE_RX = re.compile(r"^\d{4}-\d{2}-\d{2}(?:[T\s].*)?$")
_TEXT_HTML_TAG_RX = re.compile(r"(<[^>]+>)")


def _build_fhir_sanitizer(known_names: set[str] | None, patient_key: str | None,
                          pseudonym: str | None, plan=None) -> TextSanitizer:
    """Create TextSanitizer configured with adaptive cohort privacy plan."""
    known = known_names or set()
    if plan is None:
        return TextSanitizer(known_names=known, patient_key=patient_key, pseudonym=pseudonym)
    return TextSanitizer(
        known_names=known,
        patient_key=patient_key,
        pseudonym=pseudonym,
        age_width=plan.age_width,
        age_top_code=plan.age_top_code,
        suppress_age=(plan.age_mode == "suppress"),
        suppress_dob=(plan.dob_mode == "suppress"),
        mask_pin=plan.mask_pin,
        coarsen_district=plan.coarsen_district,
        district_label=plan.district_label,
        mask_hospital_city=plan.mask_hospital_city,
    )


def _clean_extensions(extensions: list, pseudonym: str | None,
                       known_names: set[str] | None,
                       patient_key: str | None = None,
                       plan=None) -> None:
    """Clean PII from FHIR extension valueString / valueHumanName fields."""
    if not extensions:
        return
    known = known_names or set()
    sanitizer = _build_fhir_sanitizer(known, patient_key, pseudonym, plan)
    for ext in extensions:
        if not isinstance(ext, dict):
            continue
        url = str(ext.get("url", "")).lower()
        if "valuestring" in url or "name" in url or "contact" in url or "witness" in url:
            if "valueString" in ext:
                val = str(ext["valueString"])
                if re.match(r"^[A-Z][a-z]+(?: [A-Z][a-z]+)+$", val):
                    ext["valueString"] = "[RELATIVE]"
                    continue
        if "valueString" in ext:
            val = str(ext["valueString"])
            cleaned = sanitizer.sanitize(val)
            if cleaned != val:
                ext["valueString"] = cleaned
            else:
                for name in sorted(known, key=lambda s: (-len(s), s)):
                    if len(name) >= 3 and name.lower() in val.lower():
                        ext["valueString"] = "[REDACTED]"
                        break
        _clean_extensions(ext.get("extension", []), pseudonym, known_names, patient_key, plan)


def _clean_resource_data_fields(resource: dict, patient_key: str | None,
                                  pseudonym: str | None,
                                  known_names: set[str] | None,
                                  plan=None) -> None:
    """Recursively clean base64 data fields using the full TextSanitizer."""
    known = known_names or set()
    sanitizer = _build_fhir_sanitizer(known, patient_key, pseudonym, plan)

    def _clean_value(val: str) -> str:
        dec = try_decode_b64_text(val)
        if dec is not None:
            cleaned = sanitizer.sanitize(dec)
            return b64mod.b64encode(cleaned.encode("utf-8")).decode("ascii")
        dec_hex = try_decode_hex_text(val)
        if dec_hex is not None:
            cleaned = sanitizer.sanitize(dec_hex)
            if cleaned != dec_hex:
                return cleaned.encode("utf-8").hex()
        return val

    def _walk(obj):
        if isinstance(obj, dict):
            for k, v in obj.items():
                if k == "data" and isinstance(v, str) and len(v) > 20:
                    obj[k] = _clean_value(v)
                elif isinstance(v, (dict, list)):
                    _walk(v)
        elif isinstance(obj, list):
            for item in obj:
                if isinstance(item, (dict, list)):
                    _walk(item)

    _walk(resource)


def _shift_fhir_dates_recursive(obj, patient_key: str) -> None:
    """Shift all FHIR date/dateTime strings on clinical resources consistently."""
    date_keys = {"start", "end", "effectiveDateTime", "issued", "onsetDateTime",
                 "abatementDateTime", "recordedDate", "authoredOn",
                 "performedDateTime", "date"}
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k in date_keys and isinstance(v, str) and _ISO_DATE_VALUE_RX.match(v.strip()):
                obj[k] = shift_date_string(v, patient_key, hint="ymd")
            elif isinstance(v, (dict, list)):
                _shift_fhir_dates_recursive(v, patient_key)
    elif isinstance(obj, list):
        for item in obj:
            if isinstance(item, (dict, list)):
                _shift_fhir_dates_recursive(item, patient_key)


def sanitize_fhir_bundle(data: dict, patient_key: str | None = None,
                          pseudonym: str | None = None,
                          known_names: set[str] | None = None,
                          plan=None) -> dict:
    """Sanitize a FHIR R4 Bundle, keeping structure, references, and types valid."""
    result = copy.deepcopy(data)

    meta = result.get("meta", {})
    if "source" in meta:
        source = str(meta["source"])
        if find_all_identifiers(source):
            meta["source"] = "[REDACTED]"

    for entry in result.get("entry", []):
        resource = entry.get("resource", {})
        res_type = resource.get("resourceType", "")

        if res_type == "Patient":
            _sanitize_patient_resource(resource, patient_key, pseudonym, plan)
        elif res_type == "RelatedPerson":
            _sanitize_related_person(resource)
        elif res_type == "Practitioner":
            _clean_resource_text_div(resource, None)
        elif res_type == "Organization":
            _sanitize_organization(resource, plan)
            _clean_resource_text_div(resource, None)
        elif res_type == "Encounter":
            _sanitize_encounter(resource, patient_key, pseudonym)
            _clean_resource_text_div(resource, pseudonym)
        elif res_type == "Condition":
            _sanitize_subject_display(resource, pseudonym)
            _clean_resource_text_div(resource, pseudonym)
        elif res_type in ("Observation", "MedicationRequest", "DiagnosticReport",
                          "Procedure", "DocumentReference"):
            _sanitize_subject_display(resource, pseudonym)
            _clean_resource_text_div(resource, pseudonym)
        elif res_type == "Composition":
            _sanitize_composition(resource, patient_key, pseudonym, known_names, plan)

        # Shift dates consistently across non-Patient clinical resources
        if patient_key and res_type not in ("Patient", "Practitioner", "Organization", "RelatedPerson"):
            _shift_fhir_dates_recursive(resource, patient_key)

        # Clean MRN / phone / Aadhaar / PAN identifiers
        for ident in resource.get("identifier", []):
            val = str(ident.get("value", ""))
            sys_val = str(ident.get("system", "")).lower()
            if "raksha" in sys_val:
                continue
            if find_all_identifiers(val):
                ident["value"] = pseudonym or "[REDACTED]"

        _clean_extensions(resource.get("extension", []), pseudonym, known_names, patient_key, plan)
        _clean_resource_data_fields(resource, patient_key, pseudonym, known_names, plan)

    return result


def _sanitize_subject_display(resource: dict, pseudonym: str | None) -> None:
    """Replace subject/patient display names with pseudonym or [REDACTED]."""
    for ref_key in ("subject", "patient"):
        ref_obj = resource.get(ref_key)
        if isinstance(ref_obj, dict) and "display" in ref_obj:
            ref_obj["display"] = pseudonym or "[REDACTED]"


def _sanitize_patient_resource(resource: dict, patient_key: str | None,
                                 pseudonym: str | None, plan=None):
    """Sanitize Patient resource."""
    _clean_resource_text_div(resource, pseudonym)

    for name_entry in resource.get("name", []):
        if "text" in name_entry:
            name_entry["text"] = pseudonym or "[REDACTED]"
        if "family" in name_entry:
            name_entry["family"] = "[REDACTED]"
        if "given" in name_entry:
            name_entry["given"] = [pseudonym or "[REDACTED]"]

    for tel in resource.get("telecom", []):
        if "value" in tel:
            tel["value"] = "[REDACTED]"

    for addr in resource.get("address", []):
        if "text" in addr:
            addr["text"] = "[REDACTED]"
        if "line" in addr:
            addr["line"] = ["[REDACTED]"]
        if "city" in addr:
            addr["city"] = "[REDACTED]"
        if plan and plan.coarsen_district:
            if "district" in addr:
                addr["district"] = plan.district_label
        if "postalCode" in addr:
            if plan and plan.mask_pin:
                addr["postalCode"] = "[PIN]"
            else:
                pc = str(addr["postalCode"])
                if len(pc) == 6:
                    addr["postalCode"] = pc[:3] + "***"

    # DOB: shift only when patient_key exists AND plan permits; otherwise omit cleanly for valid FHIR R4
    if "birthDate" in resource:
        if patient_key and (not plan or plan.dob_mode != "suppress"):
            resource["birthDate"] = shift_date_string(resource["birthDate"],
                                                       patient_key, hint="ymd")
        else:
            del resource["birthDate"]

    for ident in resource.get("identifier", []):
        sys_val = str(ident.get("system", "")).lower()
        if "raksha" in sys_val:
            pass
        elif any(x in sys_val for x in ["aadhaar", "abha", "phone", "pan", "insurance"]):
            ident["value"] = "[REDACTED]"
        elif "value" in ident:
            val = str(ident["value"])
            if not re.match(r"^[0-9a-f\-]{36}$", val) and not val.startswith("PSN-"):
                ident["value"] = pseudonym or "[REDACTED]"

    if pseudonym:
        existing = [i.get("value") for i in resource.get("identifier", [])]
        if pseudonym not in existing:
            resource.setdefault("identifier", []).append({
                "system": "urn:raksha:pseudonym",
                "value": pseudonym,
            })

    for contact in resource.get("contact", []):
        name_obj = contact.get("name", {})
        if isinstance(name_obj, dict):
            if "text" in name_obj:
                name_obj["text"] = "[RELATIVE]"
            if "family" in name_obj:
                name_obj["family"] = "[RELATIVE]"
            if "given" in name_obj:
                name_obj["given"] = ["[RELATIVE]"]
        for tel in contact.get("telecom", []):
            if "value" in tel:
                tel["value"] = "[REDACTED]"
        addrs = contact.get("address", [])
        if isinstance(addrs, dict):
            addrs = [addrs]
        for addr in addrs:
            if isinstance(addr, dict):
                for k in ("text", "line", "city"):
                    if k in addr:
                        addr[k] = "[REDACTED]" if k != "line" else ["[REDACTED]"]


def _clean_resource_text_div(resource: dict, pseudonym: str | None):
    """Clear FHIR text.div narrative with valid XHTML stub."""
    text_obj = resource.get("text", {})
    if isinstance(text_obj, dict) and "div" in text_obj:
        pid_ref = pseudonym or "[REDACTED]"
        text_obj["div"] = f'<div xmlns="http://www.w3.org/1999/xhtml">{pid_ref}</div>'


def _sanitize_related_person(resource: dict):
    """Sanitize RelatedPerson resource."""
    _clean_resource_text_div(resource, None)
    for name_entry in resource.get("name", []):
        for key in ("text", "family"):
            if key in name_entry:
                name_entry[key] = "[REDACTED]"
        if "given" in name_entry:
            name_entry["given"] = ["[REDACTED]"]
    for tel in resource.get("telecom", []):
        if "value" in tel:
            tel["value"] = "[REDACTED]"
    for addr in resource.get("address", []):
        for key in ("text", "city"):
            if key in addr:
                addr[key] = "[REDACTED]"
        if "line" in addr:
            addr["line"] = ["[REDACTED]"]


def _sanitize_organization(resource: dict, plan=None) -> None:
    """Mask identifying geographic location fields on Organization while preserving hospital name."""
    if not plan or not (plan.coarsen_district or plan.mask_hospital_city):
        return
    for addr in resource.get("address", []):
        if not isinstance(addr, dict):
            continue
        if "city" in addr:
            addr["city"] = "[REDACTED]"
        if "district" in addr:
            addr["district"] = plan.district_label
        if "text" in addr:
            addr["text"] = "[REDACTED]"
        if "line" in addr:
            addr["line"] = ["[REDACTED]"]
        if "postalCode" in addr and plan.mask_pin:
            addr["postalCode"] = "[PIN]"


def _sanitize_encounter(resource: dict, patient_key: str | None, pseudonym: str | None):
    """Sanitize Encounter resource: clean display and shift dates."""
    _sanitize_subject_display(resource, pseudonym)
    if patient_key:
        period = resource.get("period", {})
        if isinstance(period, dict):
            for key in ("start", "end"):
                if key in period and isinstance(period[key], str):
                    period[key] = shift_date_string(period[key], patient_key, hint="ymd")


def _sanitize_composition(resource: dict, patient_key: str | None,
                            pseudonym: str | None,
                            known_names: set[str] | None,
                            plan=None):
    """Sanitize Composition resource: clean subject and narrative sections."""
    _sanitize_subject_display(resource, pseudonym)
    for section in resource.get("section", []):
        text_obj = section.get("text", {})
        if isinstance(text_obj, dict) and "div" in text_obj:
            text_obj["div"] = _clean_html_pii(
                text_obj["div"], patient_key, pseudonym, known_names, plan
            )


def _clean_html_pii(html: str, patient_key: str | None = None,
                     pseudonym: str | None = None,
                     known_names: set[str] | None = None,
                     plan=None) -> str:
    """Clean PII from FHIR narrative HTML divs without breaking XHTML tags."""
    sanitizer = _build_fhir_sanitizer(known_names, patient_key, pseudonym, plan)
    parts = _TEXT_HTML_TAG_RX.split(html)
    out = []
    for part in parts:
        if part.startswith("<") and part.endswith(">"):
            out.append(part)
        elif part:
            out.append(sanitizer.sanitize(part))
        else:
            out.append(part)
    return "".join(out)
