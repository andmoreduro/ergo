import { useEffect, useRef } from "react";
import type { AssetEntry } from "../../bindings/AssetEntry";
import { TauriApi } from "../../api/tauri";
import { CompilerClient } from "../../workers/compilerClient";
import { useFigureImagePreview } from "../../components/organisms/ElementEditor/figure/useFigureImagePreview";
import { useDocumentAst } from "../../state/DocumentContext";
import { m } from "../../paraglide/messages.js";
import { diagramAssetPath } from "./diagramAsset";
import { renderMermaidSvg } from "./renderMermaidSvg";

const DIAGRAM_RENDER_DEBOUNCE_MS = 350;

export const useDiagramMermaidAsset = (
    diagramId: string,
    mermaidSource: string,
    assetId: string | null,
    linkedAsset: AssetEntry | null,
) => {
    const { state, dispatch } = useDocumentAst();
    const { previewUrl, updatePreviewUrl } = useFigureImagePreview(
        assetId,
        linkedAsset,
    );
    const renderGenerationRef = useRef(0);
    const lastRenderedSourceRef = useRef<string | null>(null);
    const assetsRef = useRef(state.assets);
    assetsRef.current = state.assets;

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

                    if (assetsRef.current.some((entry) => entry.id === diagramId)) {
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
                    window.dispatchEvent(
                        new CustomEvent("ergo:toast", {
                            detail: {
                                message: m.editor_diagram_render_failed(),
                            },
                        }),
                    );
                }
            })();
        }, DIAGRAM_RENDER_DEBOUNCE_MS);

        return () => window.clearTimeout(timeout);
    }, [assetId, diagramId, dispatch, mermaidSource, updatePreviewUrl]);

    return { previewUrl };
};
