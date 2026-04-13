"""JSON encoding and decoding.

Provides functions to encode Starlark values to JSON strings and
decode JSON strings back to Starlark values, with support for
indented output formatting.
"""


def encode(x):
    """Encode a Starlark value to a JSON string.

    Converts a dict, list, or scalar value to its compact JSON
    representation with no extra whitespace.

    Args:
        x: Starlark value to encode (dict, list, string, int,
            float, bool, or None).

    Returns:
        Compact JSON string.
    """
    pass


def decode(x, default=None):
    """Decode a JSON string to a Starlark value.

    Parses a JSON string and returns the corresponding Starlark
    value. JSON objects become dicts, arrays become lists.

    Args:
        x: JSON string to decode.
        default: Value to return if decoding fails (default: None).
            When None, a decoding error raises an exception.

    Returns:
        Starlark value (dict, list, string, int, float, bool,
        or None).
    """
    pass


def encode_indent(x, prefix="", indent="\t"):
    """Encode a Starlark value to an indented JSON string.

    Like encode(), but produces human-readable output with the
    specified indentation.

    Args:
        x: Starlark value to encode.
        prefix: String prepended to the beginning of each line
            (default: "").
        indent: String used for each level of indentation
            (default: "\\t").

    Returns:
        Indented JSON string.
    """
    pass


def indent(str, prefix="", indent="\t"):
    """Re-indent an existing JSON string.

    Takes a valid JSON string and re-formats it with the specified
    indentation. Useful for pretty-printing already-encoded JSON.

    Args:
        str: Valid JSON string to re-indent.
        prefix: String prepended to the beginning of each line
            (default: "").
        indent: String used for each level of indentation
            (default: "\\t").

    Returns:
        Re-indented JSON string.
    """
    pass
