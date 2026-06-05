export type PreviewScrollAnchor = {
    clientX: number;
    clientY: number;
    fractionX: number;
    fractionY: number;
};

export function capturePreviewScrollAnchor(
    verticalScrollRoot: HTMLElement,
    horizontalScrollRoot: HTMLElement | null,
    clientX: number,
    clientY: number,
): PreviewScrollAnchor {
    const horizontalRoot = horizontalScrollRoot ?? verticalScrollRoot;
    const verticalRect = verticalScrollRoot.getBoundingClientRect();
    const horizontalRect = horizontalRoot.getBoundingClientRect();
    const scrollWidth = Math.max(horizontalRoot.scrollWidth, 1);
    const scrollHeight = Math.max(verticalScrollRoot.scrollHeight, 1);

    return {
        clientX,
        clientY,
        fractionX:
            (clientX - horizontalRect.left + horizontalRoot.scrollLeft) /
            scrollWidth,
        fractionY:
            (clientY - verticalRect.top + verticalScrollRoot.scrollTop) /
            scrollHeight,
    };
}

export function applyPreviewScrollAnchor(
    verticalScrollRoot: HTMLElement,
    horizontalScrollRoot: HTMLElement | null,
    anchor: PreviewScrollAnchor,
): void {
    const horizontalRoot = horizontalScrollRoot ?? verticalScrollRoot;
    const verticalRect = verticalScrollRoot.getBoundingClientRect();
    const horizontalRect = horizontalRoot.getBoundingClientRect();

    verticalScrollRoot.scrollTop = Math.max(
        0,
        anchor.fractionY * verticalScrollRoot.scrollHeight -
            (anchor.clientY - verticalRect.top),
    );
    horizontalRoot.scrollLeft = Math.max(
        0,
        anchor.fractionX * horizontalRoot.scrollWidth -
            (anchor.clientX - horizontalRect.left),
    );
}
