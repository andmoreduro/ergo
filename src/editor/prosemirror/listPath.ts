import type { ResolvedPos } from "prosemirror-model";

export const listItemPathFromPosition = ($pos: ResolvedPos): number[] => {
    const path: number[] = [];
    for (let depth = $pos.depth; depth > 0; depth -= 1) {
        if ($pos.node(depth).type.name === "list_item") {
            const listDepth = depth - 1;
            if ($pos.node(listDepth).type.name === "list") {
                path.unshift($pos.index(listDepth));
            }
        }
    }
    return path;
};
