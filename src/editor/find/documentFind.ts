import type { DocumentAST } from "../../bindings/DocumentAST";
import type { DocumentElement } from "../../bindings/DocumentElement";
import type { ListItem } from "../../bindings/ListItem";
import type { TemplateSpec } from "../../bindings/TemplateSpec";
import type { DocumentFocusInput } from "../../state/DocumentContext";
import {
    getValueAtPath,
    richTextPlainText,
} from "../../state/documentEvents/helpers";
import { parseInputContentBlocks } from "../contentBlocks";
import {
    buildEditorFieldOrder,
    type EditorFieldTarget,
} from "../fieldNavigation";
import {
    equationSourceFieldId,
    figureBodyFieldId,
    figureCaptionFieldId,
    isUiOnlyComposerFieldId,
    projectInputElementId,
    quoteContentFieldId,
    richTextFieldId,
} from "../fieldIds";
import { parseListItemFieldPath } from "../listFieldPath";
import { parseSimpleListContentItems } from "../simpleListContent";
import { selectPlainTextRange, caretPlainOffsetFromSelection } from "../../richText/richText";
import { findAllMatches, nextMatchIndex, type TextRange } from "./textSearch";
import { captureFindTarget, clearFindTarget } from "./editorFind";
import { runProseMirrorFind } from "./prosemirrorFindPlugin";

export interface DocumentFindMatch extends EditorFieldTarget {
    start: number;
    end: number;
}

let pendingFindNavigation: {
    match: DocumentFindMatch;
    query: string;
} | null = null;

export const queueFindNavigation = (
    match: DocumentFindMatch,
    query: string,
): void => {
    pendingFindNavigation = { match, query };
};

export const takePendingFindNavigation = (): {
    match: DocumentFindMatch;
    query: string;
} | null => {
    const pending = pendingFindNavigation;
    pendingFindNavigation = null;
    return pending;
};

const projectInputPath = (fieldId: string): string | null => {
    if (!fieldId.startsWith("project-input-")) {
        return null;
    }
    return fieldId.slice("project-input-".length);
};

const plainTextFromUnknown = (value: unknown): string => {
    if (typeof value === "string") {
        return value;
    }
    if (!Array.isArray(value)) {
        return "";
    }
    if (value.length === 0) {
        return "";
    }
    if (Array.isArray(value[0])) {
        return parseInputContentBlocks(value)
            .map((paragraph) => richTextPlainText(paragraph))
            .join("\n");
    }
    if (typeof value[0] === "string") {
        return value.join("\n");
    }
    return parseSimpleListContentItems(value)
        .map((item) => richTextPlainText(item))
        .join("\n");
};

const listItemAtPath = (items: ListItem[], path: number[]): ListItem | null => {
    let current: ListItem | undefined = items[path[0] ?? -1];
    for (const index of path.slice(1)) {
        current = current?.children[index];
    }
    return current ?? null;
};

const findContentElement = (
    ast: DocumentAST,
    elementId: string,
): DocumentElement | null => {
    for (const section of ast.sections) {
        if (section.type !== "Content") {
            continue;
        }
        const element = section.elements.find((entry) => entry.id === elementId);
        if (element) {
            return element;
        }
    }
    return null;
};

const richTextForField = (
    element: DocumentElement,
    fieldId: string,
): string => {
    if (fieldId === richTextFieldId(element.id)) {
        if (element.type === "Paragraph" || element.type === "Heading") {
            return richTextPlainText(element.content);
        }
        return "";
    }

    if (fieldId === quoteContentFieldId(element.id) && element.type === "Quote") {
        return richTextPlainText(element.content);
    }

    if (
        fieldId === figureBodyFieldId(element.id) &&
        element.type === "Figure" &&
        element.content.type === "Paragraph"
    ) {
        return richTextPlainText(element.content.content);
    }

    if (
        fieldId === figureCaptionFieldId(element.id) &&
        (element.type === "Figure" || element.type === "Diagram")
    ) {
        return element.caption ?? "";
    }

    if (
        fieldId === equationSourceFieldId(element.id) &&
        element.type === "Equation"
    ) {
        return element.latex_source;
    }

    const listPath = parseListItemFieldPath(fieldId, element.id);
    if (listPath && (element.type === "List" || element.type === "Enumeration")) {
        const item = listItemAtPath(element.items, listPath);
        return item ? richTextPlainText(item.content) : "";
    }

    const cellMatch = fieldId.match(/^(.+):cell:(\d+):(\d+)$/);
    if (cellMatch && element.type === "Table" && cellMatch[1] === element.id) {
        const row = Number(cellMatch[2]);
        const col = Number(cellMatch[3]);
        const cell = element.cells[row]?.[col];
        if (!cell) {
            return "";
        }
        return cell.elements
            .flatMap((block) => {
                if (block.type === "Paragraph" || block.type === "Heading") {
                    return [richTextPlainText(block.content)];
                }
                if (block.type === "Quote") {
                    return [richTextPlainText(block.content)];
                }
                return [];
            })
            .join("\n");
    }

    return "";
};

export const fieldSearchText = (
    ast: DocumentAST,
    target: EditorFieldTarget,
): string => {
    if (isUiOnlyComposerFieldId(target.fieldId)) {
        return "";
    }

    if (target.elementId === projectInputElementId) {
        const path = projectInputPath(target.fieldId);
        if (!path) {
            return "";
        }
        const raw = getValueAtPath(ast.inputs, path.split("/").filter(Boolean));
        return plainTextFromUnknown(raw);
    }

    const element = findContentElement(ast, target.elementId);
    if (!element) {
        return "";
    }

    return richTextForField(element, target.fieldId);
};

export const collectDocumentFindMatches = (
    ast: DocumentAST,
    spec: TemplateSpec | null,
    variantId: string | null,
    query: string,
): DocumentFindMatch[] => {
    if (!query.trim()) {
        return [];
    }

    const matches: DocumentFindMatch[] = [];
    for (const target of buildEditorFieldOrder(spec, variantId, ast)) {
        const text = fieldSearchText(ast, target);
        for (const range of findAllMatches(text, query)) {
            matches.push({ ...target, ...range });
        }
    }
    return matches;
};

const fieldOrderIndex = (
    order: EditorFieldTarget[],
    elementId: string,
    fieldId: string,
): number => {
    const index = order.findIndex(
        (entry) => entry.elementId === elementId && entry.fieldId === fieldId,
    );
    return index >= 0 ? index : Number.MAX_SAFE_INTEGER;
};

export const nextDocumentFindMatchIndex = (
    matches: DocumentFindMatch[],
    order: EditorFieldTarget[],
    anchor: { elementId: string | null; fieldId: string | null; offset: number },
    direction: 1 | -1,
): number => {
    if (matches.length === 0) {
        return -1;
    }

    const anchorFieldIndex =
        anchor.elementId && anchor.fieldId
            ? fieldOrderIndex(order, anchor.elementId, anchor.fieldId)
            : -1;

    const scored = matches.map((match, index) => ({
        index,
        fieldIndex: fieldOrderIndex(order, match.elementId, match.fieldId),
        start: match.start,
    }));

    if (direction > 0) {
        for (const entry of scored) {
            if (entry.fieldIndex > anchorFieldIndex) {
                return entry.index;
            }
            if (
                entry.fieldIndex === anchorFieldIndex &&
                entry.start >= anchor.offset
            ) {
                return entry.index;
            }
        }
        return scored[0]?.index ?? -1;
    }

    for (let i = scored.length - 1; i >= 0; i -= 1) {
        const entry = scored[i]!;
        if (entry.fieldIndex < anchorFieldIndex) {
            return entry.index;
        }
        if (
            entry.fieldIndex === anchorFieldIndex &&
            entry.start < anchor.offset
        ) {
            return entry.index;
        }
    }
    return scored[scored.length - 1]?.index ?? -1;
};

const applyNativeMatchSelection = (
    match: DocumentFindMatch,
    target: Extract<
        NonNullable<ReturnType<typeof captureFindTarget>>,
        { kind: "input" | "contenteditable" }
    >,
): void => {
    if (target.kind === "input") {
        target.element.focus();
        target.element.setSelectionRange(match.start, match.end);
        return;
    }
    target.element.focus();
    selectPlainTextRange(target.element, match.start, match.end);
};

export const navigateToDocumentFindMatch = (
    match: DocumentFindMatch,
    query: string,
    setDocumentFocus: (focus: DocumentFocusInput) => void,
): void => {
    clearFindTarget();
    queueFindNavigation(match, query);
    setDocumentFocus({
        elementId: match.elementId,
        fieldId: match.fieldId,
        caretUtf16Offset: match.start,
        selectionEndUtf16Offset: match.end,
        sourceRevision: null,
        anchorPageNumber: null,
        forcePreviewScroll: false,
        focusSource: "programmatic",
    });

    window.setTimeout(() => {
        const target = captureFindTarget();
        if (!target || target.kind === "prosemirror") {
            return;
        }
        applyNativeMatchSelection(match, target);
    }, 0);
};

export const findInDocument = (
    ast: DocumentAST,
    spec: TemplateSpec | null,
    variantId: string | null,
    query: string,
    direction: 1 | -1,
    anchor: { elementId: string | null; fieldId: string | null; offset: number },
    setDocumentFocus: (focus: DocumentFocusInput) => void,
): DocumentFindMatch | null => {
    const order = buildEditorFieldOrder(spec, variantId, ast);
    const matches = collectDocumentFindMatches(ast, spec, variantId, query);
    const index = nextDocumentFindMatchIndex(matches, order, anchor, direction);
    const match = index >= 0 ? matches[index] : null;
    if (!match) {
        return null;
    }
    navigateToDocumentFindMatch(match, query, setDocumentFocus);
    return match;
};

export const replaceInDocumentField = (
    ast: DocumentAST,
    spec: TemplateSpec | null,
    variantId: string | null,
    query: string,
    replacement: string,
    anchor: { elementId: string | null; fieldId: string | null; offset: number },
    setDocumentFocus: (focus: DocumentFocusInput) => void,
): boolean => {
    const order = buildEditorFieldOrder(spec, variantId, ast);
    const matches = collectDocumentFindMatches(ast, spec, variantId, query);
    const index = nextDocumentFindMatchIndex(matches, order, anchor, 1);
    const match = index >= 0 ? matches[index] : null;
    if (!match) {
        return false;
    }

    navigateToDocumentFindMatch(match, query, setDocumentFocus);

    window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
            const target = captureFindTarget();
            if (!target || target.kind === "prosemirror") {
                return;
            }
            if (target.kind === "input") {
                const text = target.element.value;
                const next =
                    text.slice(0, match.start) +
                    replacement +
                    text.slice(match.end);
                target.element.value = next;
                target.element.dispatchEvent(new Event("input", { bubbles: true }));
                target.element.setSelectionRange(
                    match.start,
                    match.start + replacement.length,
                );
                return;
            }
            selectPlainTextRange(target.element, match.start, match.end);
            document.execCommand("insertText", false, replacement);
            target.element.dispatchEvent(new Event("input", { bubbles: true }));
        });
    });

    return true;
};

/** Local find within the active field (fallback when document search is unavailable). */
export const findInActiveField = (
    query: string,
    direction: 1 | -1,
): boolean => {
    const target = captureFindTarget();
    if (!target || !query.trim()) {
        return false;
    }

    if (target.kind === "prosemirror") {
        const ok = runProseMirrorFind(
            target.view.state,
            target.view.dispatch.bind(target.view),
            query,
            direction,
        );
        if (ok) {
            target.view.focus();
        }
        return ok;
    }

    const text =
        target.kind === "input"
            ? target.element.value
            : (() => {
                  const walker = document.createTreeWalker(
                      target.element,
                      NodeFilter.SHOW_TEXT,
                  );
                  let value = "";
                  let node: Node | null = walker.nextNode();
                  while (node) {
                      if (
                          !node.parentElement?.closest(
                              "[data-reference-id], [data-inline-equation-id]",
                          )
                      ) {
                          value += node.textContent ?? "";
                      }
                      node = walker.nextNode();
                  }
                  return value;
              })();

    const matches = findAllMatches(text, query);
    if (matches.length === 0) {
        return false;
    }
    const caret =
        target.kind === "input"
            ? (target.element.selectionStart ?? 0)
            : (() => {
                  const selection = document.getSelection();
                  return selection &&
                      target.element.contains(selection.anchorNode)
                      ? (caretPlainOffsetFromSelection(target.element, selection) ??
                            0)
                      : 0;
              })();
    const searchFrom = direction > 0 ? caret : Math.max(0, caret - 1);
    const matchIndex = nextMatchIndex(matches, searchFrom, direction);
    const match = matches[matchIndex];
    if (!match) {
        return false;
    }
    applyNativeMatchSelection(
        {
            elementId: "",
            fieldId: "",
            start: match.start,
            end: match.end,
        },
        target,
    );
    return true;
};

export type { TextRange };
