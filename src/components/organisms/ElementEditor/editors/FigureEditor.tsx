import { open } from "@tauri-apps/plugin-dialog";

import { useCallback, useEffect, useRef, useState } from "react";

import { Image24Regular } from "@fluentui/react-icons";

import { TauriApi } from "../../../../api/tauri";

import { CompilerClient } from "../../../../workers/compilerClient";

import { usesStandardTypstFigureWrapper } from "../../../../editor/templateElementOverrides";

import {

    wrapperFieldDraftValues,

    wrapperFieldValue,

} from "../../../../editor/wrapperFields";

import {

    figureHasLinkedAsset,

    textSignificantlyEqual,

} from "../../../../state/ast/commitPolicy";

import { useDocumentAst } from "../../../../state/DocumentContext";

import { useTemplateSpecContext } from "../../../../state/TemplateSpecContext";

import { m } from "../../../../paraglide/messages.js";

import { MediaPickerButton } from "../../../atoms/MediaPickerButton/MediaPickerButton";

import { ElementExtrasCollapse } from "../ElementExtrasCollapse";

import { ElementSettingsButton } from "../ElementSettingsButton";

import { ElementDimensionFields } from "../ElementDimensionFields";

import { useElementSettingsShortcut } from "../useElementSettingsShortcut";

import { ElementAnnotationFields } from "../fields/ElementAnnotationFields";

import { useFigureImagePreview } from "../figure/useFigureImagePreview";

import type { FigureElement } from "../types";

import styles from "../ElementEditor.module.css";



const FIGURE_SETTINGS_KEYS = new Set(["width"]);



export const FigureEditor = ({ element }: { element: FigureElement }) => {

    const { state, dispatch } = useDocumentAst();

    const { spec: templateSpec } = useTemplateSpecContext();

    const figureOverride = templateSpec?.element_overrides?.figure ?? null;

    const extraFields = figureOverride?.extra_fields ?? [];

    const showPlacement = usesStandardTypstFigureWrapper(figureOverride);

    const hasAsset = figureHasLinkedAsset(element.asset_id);

    const linkedAsset = element.asset_id

        ? state.assets.find((asset) => asset.id === element.asset_id) ?? null

        : null;

    const { previewUrl, updatePreviewUrl } = useFigureImagePreview(

        element.asset_id,

        linkedAsset,

    );



    const [draftPlacement, setDraftPlacement] = useState(element.placement);

    const wrapperDraftRef = useRef<Record<string, string>>(

        wrapperFieldDraftValues(element, extraFields),

    );

    const hadAssetRef = useRef(hasAsset);



    useEffect(() => {

        setDraftPlacement(element.placement);

        wrapperDraftRef.current = wrapperFieldDraftValues(element, extraFields);

    }, [element, extraFields]);



    const flushPendingFigureEdits = useCallback(() => {

        if (showPlacement && draftPlacement !== element.placement) {

            dispatch({

                type: "UPDATE_FIGURE",

                payload: {

                    figureId: element.id,

                    placement: draftPlacement,

                },

            });

        }



        for (const field of extraFields) {

            if (field.type === "content") {

                continue;

            }



            const next = wrapperDraftRef.current[field.key] ?? "";

            const previous = wrapperFieldValue(element, field.key);

            const previousText =

                typeof previous === "string" ? previous : String(previous ?? "");

            if (!textSignificantlyEqual(next, previousText)) {

                if (field.key === "caption") {

                    dispatch({

                        type: "UPDATE_FIGURE",

                        payload: {

                            figureId: element.id,

                            caption: next,

                        },

                    });

                } else {

                    dispatch({

                        type: "UPDATE_ELEMENT_EXTRA_FIELD",

                        payload: {

                            elementId: element.id,

                            fieldKey: field.key,

                            fieldValue: next,

                        },

                    });

                }

            }

        }

    }, [

        dispatch,

        draftPlacement,

        element,

        extraFields,

        showPlacement,

    ]);



    useEffect(() => {

        if (!hadAssetRef.current && hasAsset) {

            flushPendingFigureEdits();

        }

        hadAssetRef.current = hasAsset;

    }, [hasAsset, flushPendingFigureEdits]);



    const chooseImage = async () => {

        try {

            const selected = await open({

                multiple: false,

                directory: false,

                filters: [

                    {

                        name: "Images",

                        extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg"],

                    },

                ],

            });

            if (typeof selected !== "string") {

                return;

            }



            const result = await TauriApi.importResourceFile(selected);

            await CompilerClient.writeFile(

                result.asset.path,

                new Uint8Array(result.bytes),

            );

            if (!state.assets.some((entry) => entry.id === result.asset.id)) {

                dispatch({ type: "ADD_ASSET", payload: { asset: result.asset } });

            }

            dispatch({

                type: "UPDATE_FIGURE",

                payload: {

                    figureId: element.id,

                    assetId: result.asset.id,

                },

            });

            updatePreviewUrl(

                result.asset.id,

                new Uint8Array(result.bytes),

                result.asset.path,

            );

        } catch (error) {

            console.error("Failed to import figure image:", error);

        }

    };



    const settingsFields = extraFields.filter((field) =>

        FIGURE_SETTINGS_KEYS.has(field.key),

    );

    const annotationFields = extraFields.filter(

        (field) => !FIGURE_SETTINGS_KEYS.has(field.key),

    );

    // Figures always expose the placement/width/height settings modal.
    const hasSettings = true;
    void settingsFields;
    const settings = useElementSettingsShortcut(element.id);



    return (

        <>

            {hasSettings ? (

                <ElementSettingsButton
                    open={settings.open}
                    onOpenChange={settings.setOpen}
                >

                    <ElementDimensionFields element={element} />

                </ElementSettingsButton>

            ) : null}

            <ElementExtrasCollapse

                elementId={element.id}

                showToggle={annotationFields.length > 0}

                primary={

                    <div

                        className={`${styles.figureWrap} ${styles.editorTableGridSize} ${styles.elementPrimary}`}

                    >

                        <MediaPickerButton
                            aria-label={m.editor_figure_choose_image()}
                            title={m.editor_figure_choose_image()}
                            onClick={() => {
                                void chooseImage();
                            }}
                        >
                            {previewUrl ? (
                                <img
                                    alt=""
                                    className={styles.figureImagePreview}
                                    src={previewUrl}
                                />
                            ) : (
                                <span className={styles.figureImagePlaceholder}>
                                    <Image24Regular />
                                </span>
                            )}
                        </MediaPickerButton>

                        {!hasAsset ? (

                            <p className={styles.figureAssetHint}>

                                {m.editor_figure_image_required()}

                            </p>

                        ) : null}

                    </div>

                }

                extras={

                    <ElementAnnotationFields

                        draftRef={wrapperDraftRef}

                        element={element}

                        fields={annotationFields}

                    />

                }

            />

        </>

    );

};
