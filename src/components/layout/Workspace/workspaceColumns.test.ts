import { describe, expect, it } from "vitest";
import {
    WORKSPACE_HANDLE_WIDTH,
    WORKSPACE_MIN_COLUMN_WIDTH,
    WORKSPACE_MIN_HANDLE_GAP,
    applyHandleDrag,
    clampWorkspaceColumns,
    defaultWorkspaceColumnWidths,
    previewWidthFromColumns,
    proportionalWorkspaceColumns,
    resolveHandleAtX,
    splitPositionsFromColumns,
} from "./workspaceColumns";

describe("workspaceColumns", () => {
    it("splits editor and preview evenly after a fixed sidebar", () => {
        const containerWidth = 1500;
        const columns = proportionalWorkspaceColumns(containerWidth);
        const preview = previewWidthFromColumns(containerWidth, columns);

        expect(columns.sidebar).toBe(250);
        expect(columns.editor).toBe(preview);
        expect(columns.editor).toBeGreaterThan(500);
    });

    it("keeps handles at least the minimum gap apart", () => {
        const containerWidth = 1200;
        const columns = defaultWorkspaceColumnWidths(containerWidth);
        const { split1, split2 } = splitPositionsFromColumns(columns);

        expect(split2 - split1 - WORKSPACE_HANDLE_WIDTH).toBeGreaterThanOrEqual(
            WORKSPACE_MIN_HANDLE_GAP,
        );
        expect(columns.sidebar).toBeGreaterThanOrEqual(WORKSPACE_MIN_COLUMN_WIDTH);
        expect(columns.editor).toBeGreaterThanOrEqual(WORKSPACE_MIN_COLUMN_WIDTH);
        expect(previewWidthFromColumns(containerWidth, columns)).toBeGreaterThanOrEqual(
            WORKSPACE_MIN_COLUMN_WIDTH,
        );
    });

    it("clamps the sidebar to the minimum column width", () => {
        const containerWidth = 900;
        const columns = applyHandleDrag(
            containerWidth,
            proportionalWorkspaceColumns(containerWidth),
            0,
            1,
            0,
        );

        expect(columns.sidebar).toBeGreaterThanOrEqual(WORKSPACE_MIN_COLUMN_WIDTH);
    });

    it("resolves resize handles under the pointer during drag", () => {
        const columns = proportionalWorkspaceColumns(1200);
        const { split1, split2 } = splitPositionsFromColumns(columns);

        expect(resolveHandleAtX(0, split1 + 2, split1, split2)).toBe(0);
        expect(resolveHandleAtX(0, split2 + 2, split1, split2)).toBe(1);
        expect(resolveHandleAtX(0, split1 + WORKSPACE_HANDLE_WIDTH + 40, split1, split2)).toBe(
            null,
        );
    });
});
