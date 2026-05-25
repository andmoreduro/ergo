/** Horizontal inset is applied via `.workspace` padding in CSS. */
export const WORKSPACE_EDGE_MARGIN = 0;
export const WORKSPACE_HANDLE_WIDTH = 5;
export const WORKSPACE_MIN_COLUMN_WIDTH = 3;
export const WORKSPACE_MIN_HANDLE_GAP = 3;
export const DEFAULT_SIDEBAR_WIDTH = 250;

export interface WorkspaceColumnWidths {
    sidebar: number;
    editor: number;
}

export const proportionalWorkspaceColumns = (
    containerWidth: number,
    sidebarWidth = DEFAULT_SIDEBAR_WIDTH,
): WorkspaceColumnWidths => {
    const inner = innerWorkspaceWidth(containerWidth);
    const resizable = Math.max(
        0,
        inner - WORKSPACE_HANDLE_WIDTH * 2 - sidebarWidth,
    );
    const paneWidth = Math.max(
        WORKSPACE_MIN_COLUMN_WIDTH,
        Math.floor(resizable / 2),
    );

    return clampWorkspaceColumns(containerWidth, {
        sidebar: sidebarWidth,
        editor: paneWidth,
    });
};

export const defaultWorkspaceColumnWidths = (
    containerWidth = 0,
): WorkspaceColumnWidths =>
    containerWidth > 0
        ? proportionalWorkspaceColumns(containerWidth)
        : {
              sidebar: DEFAULT_SIDEBAR_WIDTH,
              editor: 400,
          };

/** Keeps sidebar width; splits remaining space evenly between editor and preview. */
export const rebalanceWorkspaceColumns = (
    containerWidth: number,
    columns: WorkspaceColumnWidths,
): WorkspaceColumnWidths =>
    proportionalWorkspaceColumns(containerWidth, columns.sidebar);

export const innerWorkspaceWidth = (containerWidth: number) =>
    Math.max(0, containerWidth - WORKSPACE_EDGE_MARGIN * 2);

export const previewWidthFromColumns = (
    containerWidth: number,
    columns: WorkspaceColumnWidths,
) => {
    const inner = innerWorkspaceWidth(containerWidth);
    return (
        inner -
        columns.sidebar -
        columns.editor -
        WORKSPACE_HANDLE_WIDTH * 2
    );
};

export const splitPositionsFromColumns = (
    columns: WorkspaceColumnWidths,
): { split1: number; split2: number } => ({
    split1: WORKSPACE_EDGE_MARGIN + columns.sidebar,
    split2:
        WORKSPACE_EDGE_MARGIN +
        columns.sidebar +
        WORKSPACE_HANDLE_WIDTH +
        columns.editor,
});

export const columnsFromSplitPositions = (
    split1: number,
    split2: number,
): WorkspaceColumnWidths => ({
    sidebar: Math.max(
        WORKSPACE_MIN_COLUMN_WIDTH,
        split1 - WORKSPACE_EDGE_MARGIN,
    ),
    editor: Math.max(
        WORKSPACE_MIN_COLUMN_WIDTH,
        split2 - split1 - WORKSPACE_HANDLE_WIDTH,
    ),
});

export const clampWorkspaceColumns = (
    containerWidth: number,
    columns: WorkspaceColumnWidths,
): WorkspaceColumnWidths => {
    const inner = innerWorkspaceWidth(containerWidth);
    if (inner <= 0) {
        return columns;
    }

    const minTotal =
        WORKSPACE_MIN_COLUMN_WIDTH * 3 +
        WORKSPACE_HANDLE_WIDTH * 2 +
        WORKSPACE_MIN_HANDLE_GAP;

    let sidebar = Math.max(
        WORKSPACE_MIN_COLUMN_WIDTH,
        Math.min(columns.sidebar, inner - minTotal),
    );
    let editor = Math.max(WORKSPACE_MIN_COLUMN_WIDTH, columns.editor);
    let preview = previewWidthFromColumns(containerWidth, {
        sidebar,
        editor,
    });

    if (preview < WORKSPACE_MIN_COLUMN_WIDTH) {
        const deficit = WORKSPACE_MIN_COLUMN_WIDTH - preview;
        editor = Math.max(WORKSPACE_MIN_COLUMN_WIDTH, editor - deficit);
        preview = previewWidthFromColumns(containerWidth, { sidebar, editor });
    }

    if (preview < WORKSPACE_MIN_COLUMN_WIDTH) {
        const deficit = WORKSPACE_MIN_COLUMN_WIDTH - preview;
        sidebar = Math.max(WORKSPACE_MIN_COLUMN_WIDTH, sidebar - deficit);
    }

    const { split1, split2 } = splitPositionsFromColumns({ sidebar, editor });
    const maxSplit2 =
        containerWidth -
        WORKSPACE_EDGE_MARGIN -
        WORKSPACE_HANDLE_WIDTH -
        WORKSPACE_MIN_COLUMN_WIDTH;
    const minSplit2 =
        split1 + WORKSPACE_HANDLE_WIDTH + WORKSPACE_MIN_HANDLE_GAP;
    const clampedSplit2 = Math.min(Math.max(split2, minSplit2), maxSplit2);
    const clampedSplit1 = Math.min(
        Math.max(
            split1,
            WORKSPACE_EDGE_MARGIN + WORKSPACE_MIN_COLUMN_WIDTH,
        ),
        clampedSplit2 - WORKSPACE_HANDLE_WIDTH - WORKSPACE_MIN_HANDLE_GAP,
    );

    return columnsFromSplitPositions(clampedSplit1, clampedSplit2);
};

export const resolveHandleAtX = (
    containerLeft: number,
    clientX: number,
    split1: number,
    split2: number,
): 0 | 1 | null => {
    const x = clientX - containerLeft;
    if (x >= split1 && x <= split1 + WORKSPACE_HANDLE_WIDTH) {
        return 0;
    }
    if (x >= split2 && x <= split2 + WORKSPACE_HANDLE_WIDTH) {
        return 1;
    }
    return null;
};

export const applyHandleDrag = (
    containerWidth: number,
    columns: WorkspaceColumnWidths,
    handleIndex: 0 | 1,
    pointerX: number,
    containerLeft: number,
): WorkspaceColumnWidths => {
    const x = pointerX - containerLeft;
    const { split1, split2 } = splitPositionsFromColumns(columns);

    if (handleIndex === 0) {
        const maxSplit1 =
            split2 -
            WORKSPACE_HANDLE_WIDTH -
            WORKSPACE_MIN_HANDLE_GAP -
            WORKSPACE_MIN_COLUMN_WIDTH;
        const minSplit1 = WORKSPACE_EDGE_MARGIN + WORKSPACE_MIN_COLUMN_WIDTH;
        const nextSplit1 = Math.min(Math.max(x, minSplit1), maxSplit1);
        return clampWorkspaceColumns(
            containerWidth,
            columnsFromSplitPositions(nextSplit1, split2),
        );
    }

    const minSplit2 =
        split1 + WORKSPACE_HANDLE_WIDTH + WORKSPACE_MIN_HANDLE_GAP;
    const maxSplit2 =
        containerWidth -
        WORKSPACE_EDGE_MARGIN -
        WORKSPACE_HANDLE_WIDTH -
        WORKSPACE_MIN_COLUMN_WIDTH;
    const nextSplit2 = Math.min(Math.max(x, minSplit2), maxSplit2);
    return clampWorkspaceColumns(
        containerWidth,
        columnsFromSplitPositions(split1, nextSplit2),
    );
};
