import base64
import binascii
import re

from django.core.exceptions import ValidationError

MAX_PET_PHOTO_BYTES = 5 * 1024 * 1024


def normalize_rut(value):
    cleaned = re.sub(r"[^0-9kK]", "", value or "").upper()
    if len(cleaned) < 2:
        return ""
    return f"{cleaned[:-1]}-{cleaned[-1]}"


def validate_rut(value):
    if not value:
        return
    normalized = normalize_rut(value)
    if not normalized:
        raise ValidationError("Ingresa un RUT chileno válido.")
    body, verifier = normalized.split("-")
    if not re.fullmatch(r"\d{6,9}", body):
        raise ValidationError("Ingresa un RUT chileno válido.")

    total = sum(
        int(digit) * (2 + index % 6)
        for index, digit in enumerate(reversed(body))
    )
    remainder = 11 - total % 11
    expected = "0" if remainder == 11 else "K" if remainder == 10 else str(remainder)
    if verifier != expected:
        raise ValidationError("El dígito verificador del RUT no es válido.")


def validate_pet_photo(value):
    if not value:
        return
    if len(value) > 7_000_000:
        raise ValidationError("La foto no puede superar los 5 MB.")

    prefix, separator, encoded = value.partition(",")
    image_signatures = {
        "data:image/png;base64": b"\x89PNG\r\n\x1a\n",
        "data:image/jpeg;base64": b"\xff\xd8\xff",
    }
    signature = image_signatures.get(prefix)
    if not separator or not signature or not encoded:
        raise ValidationError("La foto debe ser un PNG o JPG válido.")

    try:
        contents = base64.b64decode(encoded, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ValidationError("La foto está codificada incorrectamente.") from exc

    if len(contents) > MAX_PET_PHOTO_BYTES or not contents.startswith(signature):
        raise ValidationError("La foto debe ser un PNG o JPG de hasta 5 MB.")
