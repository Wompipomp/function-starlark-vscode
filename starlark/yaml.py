"""YAML encoding and decoding.

Provides functions to encode Starlark values to YAML strings and
decode YAML strings back to Starlark values. Supports both single
documents and multi-document YAML streams.
"""


def encode(value):
    """Encode a Starlark value to a YAML string.

    Converts a dict, list, or scalar value to its YAML representation.
    Dicts are encoded as YAML mappings, lists as YAML sequences.

    Args:
        value: Starlark value to encode (dict, list, string, int,
            float, bool, or None).

    Returns:
        YAML-formatted string.
    """
    pass


def decode(s):
    """Decode a YAML string to a Starlark value.

    Parses a single YAML document and returns the corresponding
    Starlark value. YAML mappings become dicts, sequences become
    lists.

    Args:
        s: YAML string to decode.

    Returns:
        Starlark value (dict, list, string, int, float, bool,
        or None).
    """
    pass


def decode_stream(s):
    """Decode a multi-document YAML stream to a list of values.

    Parses a YAML string containing multiple documents separated
    by "---" and returns a list of decoded values, one per document.

    Args:
        s: YAML string containing one or more documents separated
            by "---".

    Returns:
        List of Starlark values, one per YAML document.
    """
    pass
