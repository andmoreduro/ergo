import type { EditorView } from "prosemirror-view";
import {
    getActiveBodyView,
    getActiveTableCellEditor,
} from "../prosemirror/activeView";
import {
    caretPlainOffsetFromSelection,
    selectPlainTextRange,
} from "../../richText/richText";
import { findAllMatches, nextMatchIndex } from "./textSearch";
import {
    clearProseMirrorFind,
    replaceProseMirrorMatch,
    runProseMirrorFind,
} from "./prosemirrorFindPlugin";

export type FindTarget =
    | { kind: "prosemirror"; view: EditorView }
    | { kind: "input"; element: HTMLInputElement | HTMLTextAreaElement }
    | { kind: "contenteditable"; element: HTMLElement };

const isEditableContentRoot = (element: HTMLElement): boolean => {
    if (element.closest("[data-ergo-find-bar]")) {
        return false;
    }
    if (element.isContentEditable) {
        return true;
    }
    return element.matches("input, textarea");
};

const plainTextInEditable = (root: HTMLElement): string => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let text = "";
    let node: Node | null = walker.nextNode();
    while (node) {
        if (
            node.parentElement?.closest("[data-reference-id], [data-inline-equation-id]")
        ) {
            node = walker.nextNode();
            continue;
        }
        text += node.textContent ?? "";
        node = walker.nextNode();
    }
    return text;
};

let cachedTarget: FindTarget | null = null;

const isFindBarElement = (element: Element | null): boolean =>
    Boolean(element?.closest("[data-ergo-find-bar]"));

export const captureFindTarget = (): FindTarget | null => {
    const cellView = getActiveTableCellEditor();
    if (cellView?.hasFocus() && !isFindBarElement(cellView.dom)) {
        cachedTarget = { kind: "prosemirror", view: cellView };
        return cachedTarget;
    }
    const bodyView = getActiveBodyView();
    if (bodyView?.hasFocus() && !isFindBarElement(bodyView.dom)) {
        cachedTarget = { kind: "prosemirror", view: bodyView };
        return cachedTarget;
    }

    const active = document.activeElement;
    if (isFindBarElement(active)) {
        return cachedTarget;
    }
    if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
        cachedTarget = { kind: "input", element: active };
        return cachedTarget;
    }
    if (active instanceof HTMLElement && active.isContentEditable) {
        cachedTarget = { kind: "contenteditable", element: active };
        return cachedTarget;
    }

    return cachedTarget;
};

export const resolveFindTarget = (): FindTarget | null => {
    if (cachedTarget) {
        return cachedTarget;
    }
    return captureFindTarget();
};

export const clearFindTarget = (): void => {
    cachedTarget = null;
};

export const restoreFindTarget = (): void => {
    const target = cachedTarget;
    if (!target) {
        return;
    }

    switch (target.kind) {
        case "prosemirror":
            target.view.focus();
            return;
        case "input":
            target.element.focus();
            return;
        case "contenteditable":
            target.element.focus();
            return;
    }
};

const caretInInput = (element: HTMLInputElement | HTMLTextAreaElement): number =>
    element.selectionStart ?? 0;

const selectInputRange = (
    element: HTMLInputElement | HTMLTextAreaElement,
    start: number,
    end: number,
): void => {
    element.focus();
    element.setSelectionRange(start, end);
};

const runNativeFind = (
    target: Extract<FindTarget, { kind: "input" | "contenteditable" }>,
    query: string,
    direction: 1 | -1,
): boolean => {
    if (!query) {
        return false;
    }

    if (target.kind === "input") {
        const text = target.element.value;
        const matches = findAllMatches(text, query);
        if (matches.length === 0) {
            return false;
        }
        const caret = caretInInput(target.element);
        const searchFrom = direction > 0 ? caret : Math.max(0, caret - 1);
        const index = nextMatchIndex(matches, searchFrom, direction);
        const match = matches[index];
        if (!match) {
            return false;
        }
        selectInputRange(target.element, match.start, match.end);
        return true;
    }

    const text = plainTextInEditable(target.element);
    const matches = findAllMatches(text, query);
    if (matches.length === 0) {
        return false;
    }
    const selection = document.getSelection();
    const caret =
        selection && target.element.contains(selection.anchorNode)
            ? (caretPlainOffsetFromSelection(target.element, selection) ?? 0)
            : 0;
    const searchFrom = direction > 0 ? caret : Math.max(0, caret - 1);
    const index = nextMatchIndex(matches, searchFrom, direction);
    const match = matches[index];
    if (!match) {
        return false;
    }
    target.element.focus();
    selectPlainTextRange(target.element, match.start, match.end);
    return true;
};

const replaceNativeMatch = (
    target: Extract<FindTarget, { kind: "input" | "contenteditable" }>,
    query: string,
    replacement: string,
    replaceAll: boolean,
): number => {
    if (!query) {
        return 0;
    }

    if (target.kind === "input") {
        const text = target.element.value;
        const matches = findAllMatches(text, query);
        if (matches.length === 0) {
            return 0;
        }
        if (replaceAll) {
            let next = text;
            let replaced = 0;
            for (const match of [...matches].reverse()) {
                next =
                    next.slice(0, match.start) +
                    replacement +
                    next.slice(match.end);
                replaced += 1;
            }
            target.element.value = next;
            target.element.dispatchEvent(new Event("input", { bubbles: true }));
            return replaced;
        }
        const caret = caretInInput(target.element);
        const index = nextMatchIndex(matches, caret, 1);
        const match = matches[index] ?? matches[0];
        if (!match) {
            return 0;
        }
        const next =
            text.slice(0, match.start) + replacement + text.slice(match.end);
        target.element.value = next;
        target.element.dispatchEvent(new Event("input", { bubbles: true }));
        selectInputRange(
            target.element,
            match.start,
            match.start + replacement.length,
        );
        runNativeFind(target, query, 1);
        return 1;
    }

    const text = plainTextInEditable(target.element);
    const matches = findAllMatches(text, query);
    if (matches.length === 0) {
        return 0;
    }

    if (replaceAll) {
        let replaced = 0;
        while (true) {
            const current = plainTextInEditable(target.element);
            const currentMatches = findAllMatches(current, query);
            if (currentMatches.length === 0) {
                break;
            }
            const match = currentMatches[currentMatches.length - 1]!;
            selectPlainTextRange(target.element, match.start, match.end);
            document.execCommand("insertText", false, replacement);
            replaced += 1;
        }
        if (replaced > 0) {
            target.element.dispatchEvent(new Event("input", { bubbles: true }));
        }
        return replaced;
    }

    const selection = document.getSelection();
    const caret =
        selection && target.element.contains(selection.anchorNode)
            ? (caretPlainOffsetFromSelection(target.element, selection) ?? 0)
            : 0;
    const index = nextMatchIndex(matches, caret, 1);
    const match = matches[index] ?? matches[0];
    if (!match) {
        return 0;
    }
    selectPlainTextRange(target.element, match.start, match.end);
    document.execCommand("insertText", false, replacement);
    target.element.dispatchEvent(new Event("input", { bubbles: true }));
    runNativeFind(target, query, 1);
    return 1;
};

export const runEditorFind = (
    query: string,
    direction: 1 | -1,
    target = resolveFindTarget(),
): boolean => {
    if (!target || !query.trim()) {
        return false;
    }
    if (target.kind === "prosemirror") {
        const found = runProseMirrorFind(
            target.view.state,
            target.view.dispatch.bind(target.view),
            query,
            direction,
        );
        if (found) {
            target.view.focus();
        }
        return found;
    }
    return runNativeFind(target, query, direction);
};

export const runEditorReplace = (
    query: string,
    replacement: string,
    replaceAll: boolean,
    target = resolveFindTarget(),
): number => {
    if (!target || !query.trim()) {
        return 0;
    }
    if (target.kind === "prosemirror") {
        return replaceProseMirrorMatch(
            target.view.state,
            target.view.dispatch.bind(target.view),
            query,
            replacement,
            replaceAll,
        );
    }
    return replaceNativeMatch(target, query, replacement, replaceAll);
};

export const clearEditorFind = (target = resolveFindTarget()): void => {
    if (target?.kind === "prosemirror") {
        target.view.dispatch(clearProseMirrorFind(target.view.state.tr));
    }
};

export const focusSupportsFind = (target: EventTarget | null): boolean => {
    if (!(target instanceof HTMLElement)) {
        return false;
    }
    return isEditableContentRoot(target);
};
