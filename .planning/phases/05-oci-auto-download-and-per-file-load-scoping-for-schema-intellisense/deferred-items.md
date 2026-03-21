# Deferred Items

## Pre-existing Lint Error

- **File:** `src/oci/auth.ts:65`
- **Issue:** `'stderr' is assigned a value but never used` (@typescript-eslint/no-unused-vars)
- **Discovered during:** 05-04 execution
- **Impact:** Blocks `npm run compile` and `npm run package` (which run lint)
- **Fix:** Prefix with underscore: `const _stderr = ...` or remove the variable
