/**
 * Allocation-free recursive deep equality.
 *
 * Replaces the `JSON.stringify(a) === JSON.stringify(b)` pattern that appeared
 * in three editor hot paths (sectionDiff, ProseMirrorBodyEditor,
 * tableCellElements). The JSON version allocates two strings on every call and
 * walks the entire structure even when the first field already differs; this
 * version short-circuits and allocates nothing.
 *
 * Semantics: two values are deeply equal when they are structurally identical,
 * treating arrays as ordered and objects as unordered key bags. `undefined`
 * object properties are ignored (so `{ a: 1 }` equals `{ a: 1, b: undefined }`),
 * matching the prior JSON-based behavior for the document-element shapes this
 * is compared against.
 */
export const deepEqual = (a: unknown, b: unknown): boolean => {
    if (a === b) {
        return true;
    }
    if (
        typeof a !== "object" ||
        typeof b !== "object" ||
        a === null ||
        b === null
    ) {
        return false;
    }
    if (Array.isArray(a) || Array.isArray(b)) {
        if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
            return false;
        }
        for (let i = 0; i < a.length; i += 1) {
            if (!deepEqual(a[i], b[i])) {
                return false;
            }
        }
        return true;
    }
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    const aKeys = Object.keys(aObj).filter((key) => aObj[key] !== undefined);
    const bKeys = Object.keys(bObj).filter((key) => bObj[key] !== undefined);
    if (aKeys.length !== bKeys.length) {
        return false;
    }
    for (const key of aKeys) {
        if (!deepEqual(aObj[key], bObj[key])) {
            return false;
        }
    }
    return true;
};
