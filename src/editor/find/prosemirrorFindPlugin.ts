import { Plugin, PluginKey, TextSelection } from "prosemirror-state";
import type { EditorState, Transaction } from "prosemirror-state";
import type { Node as PMNode } from "prosemirror-model";
import { Decoration, DecorationSet } from "prosemirror-view";
import { findAllMatches, nextMatchIndex } from "./textSearch";

export const FIND_PLUGIN_KEY = new PluginKey<FindPluginState>("ergoFind");

export interface FindMatch {
    from: number;
    to: number;
}

export interface FindPluginState {
    query: string;
    matches: FindMatch[];
    activeIndex: number;
}

const emptyFindState = (): FindPluginState => ({
    query: "",
    matches: [],
    activeIndex: -1,
});

const collectProseMirrorMatches = (doc: PMNode, query: string): FindMatch[] => {
    if (!query) {
        return [];
    }
    const matches: FindMatch[] = [];
    doc.descendants((node, pos) => {
        if (!node.isText || !node.text) {
            return;
        }
        for (const range of findAllMatches(node.text, query)) {
            matches.push({
                from: pos + range.start,
                to: pos + range.end,
            });
        }
    });
    return matches;
};

export const findPlugin = () =>
    new Plugin<FindPluginState>({
        key: FIND_PLUGIN_KEY,
        state: {
            init: () => emptyFindState(),
            apply(tr, value, _oldState, newState) {
                const meta = tr.getMeta(FIND_PLUGIN_KEY) as
                    | {
                          type: "set";
                          query: string;
                          direction?: 1 | -1;
                          caret?: number;
                      }
                    | { type: "clear" }
                    | undefined;
                if (meta?.type === "clear") {
                    return emptyFindState();
                }
                if (meta?.type === "set") {
                    const matches = collectProseMirrorMatches(
                        newState.doc,
                        meta.query,
                    );
                    if (matches.length === 0) {
                        return {
                            query: meta.query,
                            matches: [],
                            activeIndex: -1,
                        };
                    }
                    const caret =
                        meta.caret ??
                        (newState.selection instanceof TextSelection
                            ? newState.selection.from
                            : 0);
                    const activeIndex = nextMatchIndex(
                        matches.map((match) => ({
                            start: match.from,
                            end: match.to,
                        })),
                        caret,
                        meta.direction ?? 1,
                    );
                    return {
                        query: meta.query,
                        matches,
                        activeIndex,
                    };
                }
                if (tr.docChanged && value.query) {
                    const matches = collectProseMirrorMatches(
                        newState.doc,
                        value.query,
                    );
                    let activeIndex = value.activeIndex;
                    if (activeIndex >= matches.length) {
                        activeIndex = matches.length - 1;
                    }
                    return {
                        query: value.query,
                        matches,
                        activeIndex,
                    };
                }
                return value;
            },
        },
        props: {
            decorations(state) {
                const findState = FIND_PLUGIN_KEY.getState(state);
                if (!findState || findState.matches.length === 0) {
                    return DecorationSet.empty;
                }
                return DecorationSet.create(
                    state.doc,
                    findState.matches.map((match, index) =>
                        Decoration.inline(match.from, match.to, {
                            class:
                                index === findState.activeIndex
                                    ? "ergo-find-match ergo-find-match--active"
                                    : "ergo-find-match",
                        }),
                    ),
                );
            },
        },
    });

export const setProseMirrorFind = (
    tr: Transaction,
    query: string,
    direction: 1 | -1,
    caret?: number,
): Transaction =>
    tr.setMeta(FIND_PLUGIN_KEY, {
        type: "set",
        query,
        direction,
        caret,
    });

export const clearProseMirrorFind = (tr: Transaction): Transaction =>
    tr.setMeta(FIND_PLUGIN_KEY, { type: "clear" });

export const runProseMirrorFind = (
    state: EditorState,
    dispatch: (tr: Transaction) => void,
    query: string,
    direction: 1 | -1,
    caretOverride?: number,
): boolean => {
    if (!query.trim()) {
        dispatch(clearProseMirrorFind(state.tr));
        return false;
    }
    const caret =
        caretOverride ??
        (state.selection instanceof TextSelection ? state.selection.from : 0);
    const searchFrom = direction > 0 ? caret : Math.max(0, caret - 1);
    let tr = setProseMirrorFind(state.tr, query, direction, searchFrom);
    const nextState = state.apply(tr);
    const findState = FIND_PLUGIN_KEY.getState(nextState);
    if (!findState || findState.activeIndex < 0) {
        dispatch(tr);
        return false;
    }
    const match = findState.matches[findState.activeIndex]!;
    tr = tr
        .setSelection(TextSelection.create(state.doc, match.from, match.to))
        .scrollIntoView();
    dispatch(tr);
    return true;
};

/** Highlight a document-wide find query and select a known PM document range. */
export const applyProseMirrorDocumentFindMatch = (
    state: EditorState,
    dispatch: (tr: Transaction) => void,
    query: string,
    from: number,
    to: number,
): void => {
    if (!query.trim()) {
        dispatch(clearProseMirrorFind(state.tr));
        return;
    }
    const anchor = Math.min(from, to);
    const head = Math.max(from, to);
    const tr = setProseMirrorFind(state.tr, query, 1, anchor)
        .setSelection(TextSelection.create(state.doc, anchor, head))
        .scrollIntoView();
    dispatch(tr);
};

export const replaceProseMirrorMatch = (
    state: EditorState,
    dispatch: (tr: Transaction) => void,
    query: string,
    replacement: string,
    replaceAll = false,
): number => {
    if (!query.trim()) {
        return 0;
    }

    const findState = FIND_PLUGIN_KEY.getState(state);
    const matches =
        findState?.query === query && findState.matches.length > 0
            ? findState.matches
            : collectProseMirrorMatches(state.doc, query);

    if (matches.length === 0) {
        return 0;
    }

    let tr = state.tr;
    let replaced = 0;

    if (replaceAll) {
        for (const match of [...matches].reverse()) {
            tr = tr.insertText(replacement, match.from, match.to);
            replaced += 1;
        }
        tr = clearProseMirrorFind(tr);
        dispatch(tr.scrollIntoView());
        return replaced;
    }

    const active =
        findState && findState.activeIndex >= 0
            ? findState.matches[findState.activeIndex]
            : matches[0];
    if (!active) {
        return 0;
    }

    tr = tr.insertText(replacement, active.from, active.to);
    replaced = 1;
    dispatch(tr.scrollIntoView());

    const afterState = state.apply(tr);
    runProseMirrorFind(
        afterState,
        dispatch,
        query,
        1,
    );
    return replaced;
};
