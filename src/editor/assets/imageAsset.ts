const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp"] as const;

export const isImageAssetPath = (path: string): boolean => {
    const lower = path.toLowerCase();
    return IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
};

export const isInsertableImageAsset = (kind: string, path: string): boolean =>
    kind === "image" || isImageAssetPath(path);
