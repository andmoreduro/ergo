type PreviewZoomController = {
    prepareAnchor: () => void;
    zoomIn: () => void;
    zoomOut: () => void;
    fitWidth: () => void;
    fitHeight: () => void;
    setZoomPercent: (percent: number) => void;
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

export function previewFitWidth(): void {
    controller?.fitWidth();
}

export function previewFitHeight(): void {
    controller?.fitHeight();
}

export function previewSetZoomPercent(percent: number): void {
    controller?.setZoomPercent(percent);
}
