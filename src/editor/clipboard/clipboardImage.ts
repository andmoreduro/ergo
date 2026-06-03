const MIME_EXTENSION: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/svg+xml": "svg",
};

export const extensionForImageMime = (mime: string): string | null =>
    MIME_EXTENSION[mime.toLowerCase()] ?? null;

const extensionFromFileName = (fileName: string): string | null => {
    const match = fileName.trim().match(/\.([a-z0-9]+)$/i);
    return match ? match[1]!.toLowerCase() : null;
};

export const extensionForPastedImage = (file: File): string =>
    extensionForImageMime(file.type) ?? extensionFromFileName(file.name) ?? "png";

/** Pasted images are stored as `assets/image-<assetId>.<ext>`. */
export const fileNameForPastedImage = (file: File, assetId: string): string =>
    `image-${assetId}.${extensionForPastedImage(file)}`;

export const readClipboardImageFile = (
    data: DataTransfer | null | undefined,
): File | null => {
    if (!data) {
        return null;
    }
    for (const item of data.items) {
        if (item.kind !== "file" || !item.type.startsWith("image/")) {
            continue;
        }
        const file = item.getAsFile();
        if (file) {
            return file;
        }
    }
    return null;
};
