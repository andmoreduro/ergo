import type { DocumentOutline } from "../bindings/DocumentOutline";
import type { DocumentResources } from "../bindings/DocumentResources";

/**
 * Structural equality for compile-result slices that feed memoized sidebar
 * consumers. A body keystroke produces a fresh outline/resources object every
 * compile even when nothing the sidebar shows has changed; comparing content
 * lets the sync hook skip the setState (and the re-render cascade) in that
 * case, while still propagating a renamed heading, a shifted page number, or a
 * new resource inside an existing group.
 */
export const outlineEqual = (
    a: DocumentOutline | null,
    b: DocumentOutline | null,
): boolean => {
    if (a === b) {
        return true;
    }
    if (!a || !b || a.entries.length !== b.entries.length) {
        return false;
    }
    for (let i = 0; i < a.entries.length; i += 1) {
        const left = a.entries[i];
        const right = b.entries[i];
        if (
            left.level !== right.level ||
            left.page !== right.page ||
            left.text !== right.text
        ) {
            return false;
        }
    }
    return true;
};

/** Ignores `revision`, which bumps on every compile (and is a bigint). */
export const resourcesEqual = (
    a: DocumentResources | null,
    b: DocumentResources | null,
): boolean => {
    if (a === b) {
        return true;
    }
    if (!a || !b || a.groups.length !== b.groups.length) {
        return false;
    }
    for (let g = 0; g < a.groups.length; g += 1) {
        const left = a.groups[g];
        const right = b.groups[g];
        if (
            left.kind !== right.kind ||
            left.label !== right.label ||
            left.entries.length !== right.entries.length
        ) {
            return false;
        }
        for (let i = 0; i < left.entries.length; i += 1) {
            const x = left.entries[i];
            const y = right.entries[i];
            if (
                x.id !== y.id ||
                x.kind !== y.kind ||
                x.label !== y.label ||
                x.subtitle !== y.subtitle ||
                x.reference_token !== y.reference_token ||
                x.source_element_id !== y.source_element_id ||
                x.asset_id !== y.asset_id ||
                x.preview.status !== y.preview.status ||
                x.preview.path !== y.preview.path ||
                x.preview.page_number !== y.preview.page_number ||
                x.preview.content !== y.preview.content ||
                x.preview.diagnostic !== y.preview.diagnostic
            ) {
                return false;
            }
        }
    }
    return true;
};
