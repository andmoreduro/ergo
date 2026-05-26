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
        new Blob([bytes], { type: mimeTypeForPath(path) }),
    );
    previewUrls.set(assetId, url);
    return url;
};

export const getAssetPreviewUrl = (assetId: string): string | null =>
    previewUrls.get(assetId) ?? null;
