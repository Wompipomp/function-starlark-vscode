"""Cryptographic hashing and ID generation.

Provides deterministic hash functions (SHA-256, SHA-512, SHA-1, MD5,
BLAKE3), HMAC-SHA256, and a stable ID generator for naming resources.
"""


def sha256(data):
    """Compute SHA-256 hash of data.

    Returns the lowercase hex-encoded SHA-256 digest of the input.

    Args:
        data: String or bytes to hash.

    Returns:
        Lowercase hex digest string (64 characters).
    """
    pass


def sha512(data):
    """Compute SHA-512 hash of data.

    Returns the lowercase hex-encoded SHA-512 digest of the input.

    Args:
        data: String or bytes to hash.

    Returns:
        Lowercase hex digest string (128 characters).
    """
    pass


def sha1(data):
    """Compute SHA-1 hash of data.

    Returns the lowercase hex-encoded SHA-1 digest of the input.
    Note: SHA-1 is considered weak for cryptographic purposes;
    prefer sha256 or sha512 for security-sensitive use cases.

    Args:
        data: String or bytes to hash.

    Returns:
        Lowercase hex digest string (40 characters).
    """
    pass


def md5(data):
    """Compute MD5 hash of data.

    Returns the lowercase hex-encoded MD5 digest of the input.
    Note: MD5 is considered insecure for cryptographic purposes;
    use only for checksums or non-security contexts.

    Args:
        data: String or bytes to hash.

    Returns:
        Lowercase hex digest string (32 characters).
    """
    pass


def hmac_sha256(key, message):
    """Compute HMAC-SHA256 message authentication code.

    Generates a keyed hash using HMAC with SHA-256 as the
    underlying hash function.

    Args:
        key: Secret key string for the HMAC.
        message: Message string to authenticate.

    Returns:
        Lowercase hex-encoded HMAC digest string (64 characters).
    """
    pass


def blake3(data):
    """Compute BLAKE3 hash of data.

    Returns the lowercase hex-encoded BLAKE3 digest of the input.
    BLAKE3 is a fast cryptographic hash function suitable for
    content addressing and integrity checks.

    Args:
        data: String or bytes to hash.

    Returns:
        Lowercase hex digest string (64 characters).
    """
    pass


def stable_id(seed, length=8):
    """Generate a stable deterministic ID from a seed string.

    Produces a short hex ID by hashing the seed and truncating
    the result. Useful for generating deterministic resource names
    that are stable across reconciliations.

    Args:
        seed: Input string to derive the ID from.
        length: Number of hex characters in the output (default: 8).

    Returns:
        Lowercase hex string of the specified length.
    """
    pass
