import type { NodeView } from "prosemirror-view";

/**
 * Test-only node views for atom blocks: a host with one focusable field in a
 * wrapper slot, the minimum the block edit model needs (edit mode holds only
 * while a field inside the block has focus — see blockFocusInvariant.ts).
 */
export const stubBlockNodeViews = (): Record<string, () => NodeView> => {
    const factory = (name: string) => (): NodeView => {
        const dom = document.createElement("div");
        dom.setAttribute("data-pm-nodeview", name);
        dom.innerHTML =
            '<div data-wrapper-tab="extra" data-wrapper-tab-index="0"><textarea></textarea></div>';
        return {
            dom,
            stopEvent: () => true,
            ignoreMutation: () => true,
        };
    };
    return {
        diagram: factory("diagram"),
        figure: factory("figure"),
        equation: factory("equation"),
        custom: factory("custom"),
    };
};
