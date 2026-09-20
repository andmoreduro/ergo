import { useEffect, useRef } from "react";
import type { AssetEntry } from "../../bindings/AssetEntry";
import { TauriApi } from "../../api/tauri";
import { CompilerClient } from "../../workers/compilerClient";
import { useFigureImagePreview } from "../../components/organisms/ElementEditor/figure/useFigureImagePreview";
import { useDocumentActions, useDocumentAstStore } from "../../state/DocumentContext";
import { m } from "../../paraglide/messages.js";
import { diagramAssetPath } from "./diagramAsset";
import { renderMermaidSvg } from "./renderMermaidSvg";
import { showToast } from "../notifyBridge";

const DIAGRAM_RENDER_DEBOUNCE_MS = 350;

export const useDiagramMermaidAsset = (
    diagramId: string,
    mermaidSource: string,
    assetId: string | null,
    linkedAsset: AssetEntry | null,
) => {
    const { dispatch } = useDocumentActions();
    const astStore = useDocumentAstStore();
    const { previewUrl, updatePreviewUrl } = useFigureImagePreview(
        assetId,
        linkedAsset,
    );
    const renderGenerationRef = useRef(0);
    const lastRenderedSourceRef = useRef<string | null>(null);
    useEffect(() => {
        const source = mermaidSource.trim();
        if (!source) {
            return;
        }

        if (source === lastRenderedSourceRef.current && assetId) {
            return;
        }

        const generation = ++renderGenerationRef.current;
        const timeout = window.setTimeout(() => {
            void (async () => {
                try {
                    const renderId = `ergo-diagram-${diagramId}-${generation}-${Date.now()}`;
                    const svg = await renderMermaidSvg(source, renderId);
                    if (generation !== renderGenerationRef.current) {
                        return;
                    }

                    const path = diagramAssetPath(diagramId);
                    const bytes = new TextEncoder().encode(svg);
                    await TauriApi.writeGeneratedAsset(path, bytes);
                    await CompilerClient.writeFile(path, bytes);

                    lastRenderedSourceRef.current = source;
                    updatePreviewUrl(diagramId, bytes, path);

                    dispatch({
                        type: "UPDATE_DIAGRAM",
                        payload: {
                            diagramId,
                            mermaidSource: source,
                            assetId: diagramId,
                        },
                    });

                    const asset: AssetEntry = {
                        id: diagramId,
                        path,
                        kind: "image",
                        caption: null,
                    };

                    const assets = astStore.getSnapshot().assets;
                    if (assets.some((entry) => entry.id === diagramId)) {
                        dispatch({
                            type: "UPDATE_ASSET",
                            payload: { asset },
                        });
                    } else {
                        dispatch({
                            type: "ADD_ASSET",
                            payload: { asset },
                        });
                    }

                } catch {
                    showToast(m.editor_diagram_render_failed(), "error");
                }
            })();
        }, DIAGRAM_RENDER_DEBOUNCE_MS);

        return () => window.clearTimeout(timeout);
    }, [assetId, astStore, diagramId, dispatch, mermaidSource, updatePreviewUrl]);

    return { previewUrl };
};
