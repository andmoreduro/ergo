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

export const buildTargetedOutlineEntries = (options: {
    outline: DocumentOutline | null;
    headingTargets: HeadingTarget[];
    isAbstractEntry: (text: string) => boolean;
    abstractTarget: OutlineTarget;
}): TargetedOutlineEntry[] => {
    const { outline, headingTargets, isAbstractEntry, abstractTarget } = options;

    const usedHeadingIds = new Set<string>();
    let usedAbstract = false;
    const entries: TargetedOutlineEntry[] = [];

    for (const [index, entry] of (outline?.entries ?? []).entries()) {
        if (isAbstractEntry(entry.text) && !usedAbstract) {
            usedAbstract = true;
            entries.push({
                key: `abstract-${index}`,
                level: entry.level,
                text: entry.text,
                page: entry.page,
                target: abstractTarget,
            });
            continue;
        }

        const match = headingTargets.find(
            ({ element, level, text }) =>
                !usedHeadingIds.has(element.id) &&
                level === entry.level &&
                headingMatchesOutline(text, entry.text),
        );

        if (match) {
            usedHeadingIds.add(match.element.id);
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
