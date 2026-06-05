type PreviewZoomController = {
    prepareAnchor: () => void;
    zoomIn: () => void;
    zoomOut: () => void;
};

let controller: PreviewZoomController | null = null;

export function registerPreviewZoomController(
    next: PreviewZoomController | null,
): void {
    controller = next;
}

export function previewZoomIn(): void {
    controller?.prepareAnchor();
    controller?.zoomIn();
}

export function previewZoomOut(): void {
    controller?.prepareAnchor();
    controller?.zoomOut();
}
