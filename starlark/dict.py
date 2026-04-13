"""Dictionary manipulation utilities.

Provides functions for merging, filtering, and traversing nested
dictionaries. All functions return new dicts and never mutate inputs.
"""


def merge(d1, d2, *more):
    """Shallow-merge two or more dicts into a new dict.

    Later dicts take precedence for duplicate keys. All input dicts
    remain unmodified. Requires at least two arguments.

    Args:
        d1: First dict.
        d2: Second dict (values override d1 on key conflict).
        *more: Additional dicts to merge (later dicts take precedence).

    Returns:
        A new dict containing all key-value pairs from all inputs.
    """
    pass


def deep_merge(d1, d2, *more):
    """Deep-merge two or more dicts recursively into a new dict.

    Recursively merges nested dicts. For non-dict values, later dicts
    take precedence. All input dicts remain unmodified. Requires at
    least two arguments.

    Args:
        d1: First dict.
        d2: Second dict (values override d1 on key conflict for
            non-dict values; nested dicts are merged recursively).
        *more: Additional dicts to merge (later dicts take precedence).

    Returns:
        A new deeply-merged dict.
    """
    pass


def pick(d, keys):
    """Create a new dict containing only the specified keys.

    Keys that do not exist in the input dict are silently ignored.

    Args:
        d: Source dict.
        keys: List of key names to include.

    Returns:
        A new dict with only the specified keys.
    """
    pass


def omit(d, keys):
    """Create a new dict excluding the specified keys.

    Keys that do not exist in the input dict are silently ignored.

    Args:
        d: Source dict.
        keys: List of key names to exclude.

    Returns:
        A new dict without the specified keys.
    """
    pass


def dig(d, path, default=None):
    """Traverse a nested dict using a dot-separated path.

    Similar to the top-level get() function but operates on any dict,
    not just predeclared variables.

    Args:
        d: Dict to traverse.
        path: Dot-separated path string (e.g., "metadata.labels.app").
        default: Value to return if path not found (default: None).

    Returns:
        The value at the path, or default.
    """
    pass


def has_path(d, path):
    """Check whether a dot-separated path exists in a nested dict.

    Returns True if every segment of the path exists, False otherwise.

    Args:
        d: Dict to check.
        path: Dot-separated path string (e.g., "metadata.labels.app").

    Returns:
        True if the full path exists, False otherwise.
    """
    pass
