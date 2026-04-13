"""Regular expression matching and substitution.

Provides RE2-compatible regular expression functions for pattern
matching, searching, replacing, and splitting strings.
"""


def match(pattern, s):
    """Test whether a string matches a regular expression.

    Checks if the entire string matches the pattern (anchored match).

    Args:
        pattern: RE2-compatible regular expression string.
        s: String to test against the pattern.

    Returns:
        True if the entire string matches, False otherwise.
    """
    pass


def find(pattern, s):
    """Find the first match of a pattern in a string.

    Searches for the first occurrence of the pattern anywhere
    in the string.

    Args:
        pattern: RE2-compatible regular expression string.
        s: String to search.

    Returns:
        The matched substring, or None if no match is found.
    """
    pass


def find_all(pattern, s):
    """Find all non-overlapping matches of a pattern in a string.

    Returns all successive non-overlapping matches of the pattern
    in the string, in order.

    Args:
        pattern: RE2-compatible regular expression string.
        s: String to search.

    Returns:
        List of matched substrings.
    """
    pass


def find_groups(pattern, s):
    """Find the first match and return its capture groups.

    Searches for the first occurrence of the pattern and returns
    the captured groups. Group 0 is the entire match.

    Args:
        pattern: RE2-compatible regular expression string with
            capture groups.
        s: String to search.

    Returns:
        List of captured group strings (index 0 = full match),
        or None if no match is found.
    """
    pass


def replace(pattern, s, replacement):
    """Replace the first match of a pattern in a string.

    Replaces the first occurrence of the pattern with the
    replacement string. Supports backreferences in the
    replacement (e.g., "$1", "${name}").

    Args:
        pattern: RE2-compatible regular expression string.
        s: String to search.
        replacement: Replacement string (supports backreferences).

    Returns:
        String with the first match replaced.
    """
    pass


def replace_all(pattern, s, replacement):
    """Replace all matches of a pattern in a string.

    Replaces all non-overlapping occurrences of the pattern with
    the replacement string. Supports backreferences in the
    replacement (e.g., "$1", "${name}").

    Args:
        pattern: RE2-compatible regular expression string.
        s: String to search.
        replacement: Replacement string (supports backreferences).

    Returns:
        String with all matches replaced.
    """
    pass


def split(pattern, s):
    """Split a string by a regular expression pattern.

    Splits the string around each non-overlapping match of the
    pattern. Empty strings from adjacent matches are included
    in the result.

    Args:
        pattern: RE2-compatible regular expression string.
        s: String to split.

    Returns:
        List of substrings between matches.
    """
    pass
