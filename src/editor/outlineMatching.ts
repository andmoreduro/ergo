import type { DocumentElement } from "../bindings/DocumentElement";
import type { DocumentOutline } from "../bindings/DocumentOutline";
import { defaultFieldIdForElement } from "./fieldIds";

/** Typst source placeholder when a heading field is empty (see `document_session_generation`). */
export const GENERATED_EMPTY_HEADING_TEXT = "Untitled heading";

export const normalizeOutlineText = (value: string): string =>
    value.trim().replace(/\s+/g, " ").toLocaleLowerCase();

export const headingTextFromElement = (element: DocumentElement): string =>
    element.type === "Heading"
        ? element.content.map((span) => span.text).join("").trim()
        : "";

export const headingMatchesOutline = (
    astText: string,
    outlineText: string,
): boolean => {
    const ast = normalizeOutlineText(astText);
    const outline = normalizeOutlineText(outlineText);
    if (ast === outline) {
        return true;
    }
    if (ast === "" && outline === normalizeOutlineText(GENERATED_EMPTY_HEADING_TEXT)) {
        return true;
    }
    return false;
};

export type OutlineTarget = {
    elementId: string;
    fieldId: string;
};

export type TargetedOutlineEntry = {
    key: string;
    level: number;
    text: string;
    page: number;
    target: OutlineTarget | null;
};

export type HeadingTarget = {
    element: DocumentElement & { type: "Heading" };
    level: number;
    text: string;
};

export const collectHeadingTargets = (
    sections: Array<{ type: string; elements: DocumentElement[] }>,
): HeadingTarget[] => {
    const targets: HeadingTarget[] = [];
    for (const section of sections) {
        if (section.type !== "Content") {
            continue;
        }
        for (const element of section.elements) {
            if (element.type !== "Heading") {
                continue;
            }
            targets.push({
                element,
                level: element.level,
                text: normalizeOutlineText(headingTextFromElement(element)),
            });
        }
    }
    return targets;
};

/**
 * Identity-based equality for `collectHeadingTargets` output. Untouched
 * elements keep their object identity across AST commits (the reducer only
 * replaces the edited element), so comparing element references is enough to
 * tell whether the heading set changed, and it lets a selector skip re-renders
 * on body keystrokes that did not touch a heading.
 */
export const headingTargetsEqual = (
    a: HeadingTarget[],
    b: HeadingTarget[],
): boolean =>
    a.length === b.length &&
    a.every((target, index) => target.element === b[index]?.element);

const headingIndexKey = (level: number, normalizedText: string): string =>
    `${level} ${normalizedText}`;

/**
 * Index heading targets by (level, normalized text) so matching outline
 * entries costs O(outline + headings) instead of O(outline * headings). The
 * first heading in document order wins, matching the linear-scan semantics.
 * An empty heading is also indexed under the generated placeholder text,
 * mirroring `headingMatchesOutline`.
 */
const indexHeadingTargets = (
    headingTargets: HeadingTarget[],
): Map<string, HeadingTarget> => {
    const index = new Map<string, HeadingTarget>();
    const placeholder = normalizeOutlineText(GENERATED_EMPTY_HEADING_TEXT);
    for (const target of headingTargets) {
        const keys = [headingIndexKey(target.level, target.text)];
        if (target.text === "") {
            keys.push(headingIndexKey(target.level, placeholder));
        }
        for (const key of keys) {
            if (!index.has(key)) {
                index.set(key, target);
            }
        }
    }
    return index;
};

export const buildTargetedOutlineEntries = (options: {
    outline: DocumentOutline | null;
    headingTargets: HeadingTarget[];
    isAbstractEntry: (text: string) => boolean;
    abstractTarget: OutlineTarget;
}): TargetedOutlineEntry[] => {
    const { outline, headingTargets, isAbstractEntry, abstractTarget } = options;

    const entries: TargetedOutlineEntry[] = [];
    const outlineEntries = outline?.entries ?? [];
    const headingIndex =
        outlineEntries.length > 0 ? indexHeadingTargets(headingTargets) : null;

    for (const [index, entry] of outlineEntries.entries()) {
        if (isAbstractEntry(entry.text)) {
            entries.push({
                key: `abstract-${index}`,
                level: entry.level,
                text: entry.text,
                page: entry.page,
                target: abstractTarget,
            });
            continue;
        }

        const match = headingIndex?.get(
            headingIndexKey(entry.level, normalizeOutlineText(entry.text)),
        );

        if (match) {
            entries.push({
                key: `${match.element.id}-${entry.page}-${index}`,
                level: entry.level,
                text: entry.text,
                page: entry.page,
                target: {
                    elementId: match.element.id,
                    fieldId: defaultFieldIdForElement(match.element),
                },
            });
            continue;
        }

        entries.push({
            key: `compiled-${entry.page}-${index}`,
            level: entry.level,
            text: entry.text,
            page: entry.page,
            target: null,
        });
    }

    return entries;
};
