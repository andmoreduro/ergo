import { useEffect, useRef, useState } from "react";
import type { AssetEntry } from "../../../../bindings/AssetEntry";
import { TauriApi } from "../../../../api/tauri";
import { CompilerClient } from "../../../../workers/compilerClient";
import {
    diagramCaptionFieldId,
    diagramSourceFieldId,
    figurePlacementFieldId,
} from "../../../../editor/fieldIds";
import { getPlacementOptions } from "../../../../editor/placementOptions";
import { useDeferredTextCommit } from "../../../../editor/useDeferredTextCommit";
import { useElementEnterInsertsParagraph } from "../../../../editor/useInsertParagraphAfterElement";
import { normalizeEditableText } from "../../../../editor/textInput";
import { useEditorNavigation } from "../../../../editor/EditorNavigationContext";
import { useDocumentAst } from "../../../../state/DocumentContext";
import { useEditorFieldBinding } from "../../../../state/EditorFieldRegistry";
import { m } from "../../../../paraglide/messages.js";
import { Select } from "../../../atoms/Select/Select";
import { Textarea } from "../../../atoms/Textarea/Textarea";
import { ElementExtrasCollapse } from "../ElementExtrasCollapse";
import styles from "../ElementEditor.module.css";
import type { DiagramElement } from "../types";

const diagramAssetPath = (diagramId: string) =>
    `assets/diagrams/${diagramId}.svg`;

const emitToast = (message: string) => {
    window.dispatchEvent(
        new CustomEvent("ergo:toast", {
            detail: { message },
        }),
    );
};

export const DiagramEditor = ({ element }: { element: DiagramElement }) => {
    const { state, dispatch } = useDocumentAst();
    const handleEnterKey = useElementEnterInsertsParagraph(element.id);
    const { handleAdvanceKeyDown } = useEditorNavigation();
    const sourceFieldId = diagramSourceFieldId(element.id);
    const captionFieldId = diagramCaptionFieldId(element.id);
    const placementFieldId = figurePlacementFieldId(element.id);
    const sourceField = useEditorFieldBinding<HTMLTextAreaElement>({
        elementId: element.id,
        fieldId: sourceFieldId,
    });
    const captionField = useEditorFieldBinding<HTMLTextAreaElement>({
        elementId: element.id,
        fieldId: captionFieldId,
    });
    const placementField = useEditorFieldBinding<HTMLSelectElement>({
        elementId: element.id,
        fieldId: placementFieldId,
    });
    const { draft: sourceDraft, setDraft: setSourceDraft } =
        useDeferredTextCommit(element.mermaid_source);
    const {
        draft: captionDraft,
        setDraft: setCaptionDraft,
        shouldCommit: shouldCommitCaption,
    } = useDeferredTextCommit(element.caption);
    const [placementDraft, setPlacementDraft] = useState(element.placement);
    const sourceEditedRef = useRef(false);
    const renderRequestRef = useRef(0);

    useEffect(() => {
        setPlacementDraft(element.placement);
    }, [element.placement]);

    useEffect(() => {
        if (!sourceEditedRef.current) {
            return;
        }

        const requestId = ++renderRequestRef.current;
        const timeout = window.setTimeout(() => {
            void (async () => {
                try {
                    const mermaidModule = await import("mermaid");
                    const mermaid = mermaidModule.default;
                    mermaid.initialize({
                        startOnLoad: false,
                        securityLevel: "strict",
                    });
                    const renderId = `ergo-${element.id}-${requestId}`;
                    const { svg } = await mermaid.render(renderId, sourceDraft);
                    if (requestId !== renderRequestRef.current) {
                        return;
                    }

                    const path = diagramAssetPath(element.id);
                    const bytes = new TextEncoder().encode(svg);
                    await TauriApi.writeGeneratedAsset(path, bytes);
                    await CompilerClient.writeFile(path, bytes);

                    const asset: AssetEntry = {
                        id: element.id,
                        path,
                        kind: "image",
                        caption: element.caption || null,
                    };
                    if (state.assets.some((entry) => entry.id === asset.id)) {
                        dispatch({ type: "UPDATE_ASSET", payload: { asset } });
                    } else {
                        dispatch({ type: "ADD_ASSET", payload: { asset } });
                    }
                    dispatch({
                        type: "UPDATE_DIAGRAM",
                        payload: {
                            diagramId: element.id,
                            assetId: element.id,
                        },
                    });
                } catch {
                    emitToast(m.editor_diagram_render_failed());
                }
            })();
        }, 350);

        return () => window.clearTimeout(timeout);
    }, [dispatch, element.caption, element.id, sourceDraft, state.assets]);

    return (
        <ElementExtrasCollapse
            primary={
                <div className={styles.elementPrimary}>
                    <Textarea
                        {...sourceField}
                        fullWidth
                        label={m.editor_diagram_source()}
                        value={sourceDraft}
                        onChange={(event) => {
                            const next = normalizeEditableText(event.target.value);
                            sourceEditedRef.current = true;
                            setSourceDraft(next);
                            dispatch({
                                type: "UPDATE_DIAGRAM",
                                payload: {
                                    diagramId: element.id,
                                    mermaidSource: next,
                                },
                            });
                        }}
                        onKeyDown={(event) => {
                            if (handleAdvanceKeyDown(event, sourceFieldId)) {
                                return;
                            }
                            handleEnterKey(event);
                        }}
                    />
                </div>
            }
            extras={
                <>
                    <Textarea
                        {...captionField}
                        fullWidth
                        label={m.editor_diagram_caption()}
                        value={captionDraft}
                        onChange={(event) => {
                            const next = normalizeEditableText(event.target.value);
                            setCaptionDraft(next);
                            if (shouldCommitCaption(next)) {
                                dispatch({
                                    type: "UPDATE_DIAGRAM",
                                    payload: {
                                        diagramId: element.id,
                                        caption: next,
                                    },
                                });
                            }
                        }}
                        onKeyDown={(event) => {
                            if (handleAdvanceKeyDown(event, captionFieldId)) {
                                return;
                            }
                            handleEnterKey(event);
                        }}
                    />
                    <Select
                        {...placementField}
                        fullWidth
                        label={m.editor_figure_placement()}
                        value={placementDraft}
                        options={getPlacementOptions()}
                        onChange={(event) => {
                            const next = event.target.value;
                            setPlacementDraft(next);
                            dispatch({
                                type: "UPDATE_DIAGRAM",
                                payload: {
                                    diagramId: element.id,
                                    placement: next,
                                },
                            });
                        }}
                    />
                </>
            }
        />
    );
};
