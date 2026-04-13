/**
 * Shared text-processing utilities for Starlark source analysis.
 *
 * These utilities operate on plain strings with zero VS Code dependencies,
 * making them easily testable and reusable across diagnostic providers.
 */

/**
 * Replace string contents and comments with spaces, preserving offsets.
 * This prevents regexes from matching inside strings/comments.
 *
 * Handles: # line comments, triple-quoted strings, single/double-quoted strings,
 * escaped characters. Preserves newlines inside strings (only replaces non-newline chars).
 * Output length always equals input length (offset preservation).
 */
export function maskStringsAndComments(text: string): string {
  const chars = text.split("");
  let i = 0;

  while (i < chars.length) {
    // Line comment: # to end of line
    if (chars[i] === "#") {
      while (i < chars.length && chars[i] !== "\n") {
        chars[i] = " ";
        i++;
      }
      continue;
    }

    // Triple-quoted strings
    if (
      i + 2 < chars.length &&
      ((chars[i] === '"' && chars[i + 1] === '"' && chars[i + 2] === '"') ||
        (chars[i] === "'" && chars[i + 1] === "'" && chars[i + 2] === "'"))
    ) {
      const quote = chars[i];
      chars[i] = " ";
      chars[i + 1] = " ";
      chars[i + 2] = " ";
      i += 3;
      while (i < chars.length) {
        if (
          chars[i] === "\\" &&
          i + 1 < chars.length
        ) {
          chars[i] = " ";
          chars[i + 1] = " ";
          i += 2;
          continue;
        }
        if (
          i + 2 < chars.length &&
          chars[i] === quote &&
          chars[i + 1] === quote &&
          chars[i + 2] === quote
        ) {
          chars[i] = " ";
          chars[i + 1] = " ";
          chars[i + 2] = " ";
          i += 3;
          break;
        }
        if (chars[i] !== "\n") chars[i] = " ";
        i++;
      }
      continue;
    }

    // Single/double-quoted strings
    if (chars[i] === '"' || chars[i] === "'") {
      const quote = chars[i];
      chars[i] = " ";
      i++;
      while (i < chars.length) {
        if (chars[i] === "\\" && i + 1 < chars.length) {
          chars[i] = " ";
          chars[i + 1] = " ";
          i += 2;
          continue;
        }
        if (chars[i] === quote) {
          chars[i] = " ";
          i++;
          break;
        }
        if (chars[i] !== "\n") chars[i] = " ";
        i++;
      }
      continue;
    }

    i++;
  }

  return chars.join("");
}
