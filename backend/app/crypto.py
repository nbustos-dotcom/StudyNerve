"""
Symmetric encryption for secrets stored in the database (API keys, Canvas tokens).

Uses Fernet (AES-128-CBC + HMAC-SHA256) with a key derived from the app's
SECRET_KEY so no separate secret management is needed.

Encoding marker: encrypted values are stored with the prefix "enc:" so we can
detect and gracefully handle legacy plaintext values already in the DB.
"""

import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken

from app.config import settings

_PREFIX = "enc:"


def _fernet() -> Fernet:
    """Derive a 32-byte Fernet key from SECRET_KEY via SHA-256."""
    raw = hashlib.sha256(settings.SECRET_KEY.encode("utf-8")).digest()
    key = base64.urlsafe_b64encode(raw)
    return Fernet(key)


def encrypt_secret(plaintext: str) -> str:
    """Encrypt a secret string and return a prefixed ciphertext string."""
    token = _fernet().encrypt(plaintext.encode("utf-8"))
    return _PREFIX + token.decode("utf-8")


def decrypt_secret(value: str) -> str:
    """
    Decrypt a value previously encrypted with encrypt_secret().
    If the value is not prefixed (legacy plaintext), return it as-is so
    existing rows keep working until they are re-saved.
    """
    if not value.startswith(_PREFIX):
        return value  # legacy plaintext — return unchanged
    try:
        token = value[len(_PREFIX):].encode("utf-8")
        return _fernet().decrypt(token).decode("utf-8")
    except (InvalidToken, Exception):
        # Decryption failed — fall back to returning the raw value rather
        # than crashing; the caller can treat this as a bad/missing key.
        return value
