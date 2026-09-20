const previewUrls = new Map<string, string>();

const mimeTypeForPath = (path: string): string => {
    const extension = path.split(".").pop()?.toLowerCase();
    switch (extension) {
        case "png":
            return "image/png";
        case "jpg":
        case "jpeg":
            return "image/jpeg";
        case "gif":
            return "image/gif";
        case "webp":
            return "image/webp";
        case "svg":
            return "image/svg+xml";
        default:
            return "application/octet-stream";
    }
};

export const setAssetPreviewUrl = (
    assetId: string,
    bytes: Uint8Array,
    path: string,
): string => {
    const previous = previewUrls.get(assetId);
    if (previous) {
        URL.revokeObjectURL(previous);
    }

    const url = URL.createObjectURL(
        // Bytes arrive from IPC/worker as a plain ArrayBuffer view; narrow the
        // generic buffer type so it satisfies BlobPart without copying.
        new Blob([bytes as Uint8Array<ArrayBuffer>], { type: mimeTypeForPath(path) }),
    );
    previewUrls.set(assetId, url);
    return url;
};

export const getAssetPreviewUrl = (assetId: string): string | null =>
    previewUrls.get(assetId) ?? null;
