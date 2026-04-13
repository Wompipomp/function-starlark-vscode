"""Encoding and decoding utilities.

Provides Base64, Base64URL, Base32, and hexadecimal encoding and
decoding functions for string data.
"""


def b64enc(data):
    """Encode data to standard Base64.

    Encodes the input string using standard Base64 encoding
    (RFC 4648) with padding.

    Args:
        data: String to encode.

    Returns:
        Base64-encoded string.
    """
    pass


def b64dec(data):
    """Decode a standard Base64 string.

    Decodes a Base64-encoded string (RFC 4648) back to the
    original string.

    Args:
        data: Base64-encoded string to decode.

    Returns:
        Decoded string.
    """
    pass


def b64url_enc(data):
    """Encode data to Base64URL without padding.

    Encodes the input string using URL-safe Base64 encoding
    (RFC 4648 section 5) without padding characters.

    Args:
        data: String to encode.

    Returns:
        Base64URL-encoded string (no padding).
    """
    pass


def b64url_dec(data):
    """Decode a Base64URL string.

    Decodes a URL-safe Base64-encoded string (RFC 4648 section 5)
    back to the original string. Handles input with or without
    padding.

    Args:
        data: Base64URL-encoded string to decode.

    Returns:
        Decoded string.
    """
    pass


def b32enc(data):
    """Encode data to Base32 without padding.

    Encodes the input string using Base32 encoding (RFC 4648)
    without padding characters.

    Args:
        data: String to encode.

    Returns:
        Base32-encoded string (no padding).
    """
    pass


def b32dec(data):
    """Decode a Base32 string.

    Decodes a Base32-encoded string (RFC 4648) back to the
    original string. Handles input with or without padding.

    Args:
        data: Base32-encoded string to decode.

    Returns:
        Decoded string.
    """
    pass


def hex_enc(data):
    """Encode data to lowercase hexadecimal.

    Encodes each byte of the input string as two lowercase
    hex characters.

    Args:
        data: String to encode.

    Returns:
        Lowercase hex-encoded string.
    """
    pass


def hex_dec(data):
    """Decode a hexadecimal string.

    Decodes a hex-encoded string back to the original string.
    Accepts both lowercase and uppercase hex characters.

    Args:
        data: Hex-encoded string to decode.

    Returns:
        Decoded string.
    """
    pass
