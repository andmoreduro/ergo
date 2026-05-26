import { useEffect, useState } from "react";
import { TauriApi } from "../../../../api/tauri";
import { getAssetPreviewUrl, setAssetPreviewUrl } from "../../../../editor/assetPreview";
import type { AssetEntry } from "../../../../bindings/AssetEntry";

export const useFigureImagePreview = (
    assetId: string | null,
    linkedAsset: AssetEntry | null,
) => {
    const [previewUrl, setPreviewUrl] = useState<string | null>(() =>
        assetId ? getAssetPreviewUrl(assetId) : null,
    );

    useEffect(() => {
        if (!assetId) {
            setPreviewUrl(null);
            return;
        }

        const cached = getAssetPreviewUrl(assetId);
        if (cached) {
            setPreviewUrl(cached);
            return;
        }

        if (!linkedAsset) {
            setPreviewUrl(null);
            return;
        }

        let cancelled = false;
        void TauriApi.readVfsFile(linkedAsset.path)
            .then((bytes) => {
                if (cancelled) {
                    return;
                }
                setPreviewUrl(setAssetPreviewUrl(assetId, bytes, linkedAsset.path));
            })
            .catch(() => {
                if (!cancelled) {
                    setPreviewUrl(null);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [assetId, linkedAsset]);

    const updatePreviewUrl = (
        nextAssetId: string,
        bytes: Uint8Array,
        path: string,
    ) => {
        setPreviewUrl(setAssetPreviewUrl(nextAssetId, bytes, path));
    };

    return { previewUrl, updatePreviewUrl };
};
