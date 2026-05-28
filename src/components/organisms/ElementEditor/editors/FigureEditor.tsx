import { open } from "@tauri-apps/plugin-dialog";

import { useCallback, useEffect, useRef, useState } from "react";

import { Image24Regular } from "@fluentui/react-icons";

import { TauriApi } from "../../../../api/tauri";

import { CompilerClient } from "../../../../workers/compilerClient";

import { figureBodyFieldId, figurePlacementFieldId } from "../../../../editor/fieldIds";

import { getPlacementOptions } from "../../../../editor/placementOptions";

import { usesStandardTypstFigureWrapper } from "../../../../editor/templateElementOverrides";

import { useDeferredRichTextCommit } from "../../../../editor/useDeferredRichTextCommit";

import { useElementEnterInsertsParagraph } from "../../../../editor/useInsertParagraphAfterElement";

import { normalizeRichTextContent } from "../../../../editor/textInput";

import {

    wrapperFieldDraftValues,

    wrapperFieldValue,

} from "../../../../editor/wrapperFields";

import {

    figureHasLinkedAsset,

    textSignificantlyEqual,

} from "../../../../state/ast/commitPolicy";

import { useDocumentAst } from "../../../../state/DocumentContext";

import { useEditorFieldBinding } from "../../../../state/EditorFieldRegistry";

import { useTemplateSpecContext } from "../../../../state/TemplateSpecContext";

import { m } from "../../../../paraglide/messages.js";

import { RichTextField } from "../../../molecules/RichTextField/RichTextField";

import { Select } from "../../../atoms/Select/Select";

import { ElementExtrasCollapse } from "../ElementExtrasCollapse";

import { ElementSettingsButton } from "../ElementSettingsButton";

import { AnnotationFieldInput } from "../fields/AnnotationFieldInput";

import { ElementAnnotationFields } from "../fields/ElementAnnotationFields";

import { useFigureImagePreview } from "../figure/useFigureImagePreview";

import type { FigureElement } from "../types";

import styles from "../ElementEditor.module.css";



const FIGURE_SETTINGS_KEYS = new Set(["width"]);



export const FigureEditor = ({ element }: { element: FigureElement }) => {

    const { state, dispatch } = useDocumentAst();

    const handleEnterKey = useElementEnterInsertsParagraph(element.id);

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



    const committedBody =

        element.content.type === "Paragraph" ? element.content.content : [];

    const bodyParagraphId =

        element.content.type === "Paragraph" ? element.content.id : element.id;

    const {

        content: bodyContent,

        setDraft: setBodyDraft,

        shouldCommit: shouldCommitBody,

    } = useDeferredRichTextCommit(bodyParagraphId, committedBody);



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



        if (shouldCommitBody(bodyContent)) {

            dispatch({

                type: "UPDATE_PARAGRAPH_CONTENT",

                payload: {

                    paragraphId: bodyParagraphId,

                    content: normalizeRichTextContent(bodyContent),

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

        bodyContent,

        bodyParagraphId,

        dispatch,

        draftPlacement,

        element,

        extraFields,

        shouldCommitBody,

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



    const bodyField = useEditorFieldBinding<HTMLDivElement>({

        elementId: element.id,

        fieldId: figureBodyFieldId(element.id),

    });

    const placementField = useEditorFieldBinding<HTMLSelectElement>({

        elementId: element.id,

        fieldId: figurePlacementFieldId(element.id),

    });



    const settingsFields = extraFields.filter((field) =>

        FIGURE_SETTINGS_KEYS.has(field.key),

    );

    const annotationFields = extraFields.filter(

        (field) => !FIGURE_SETTINGS_KEYS.has(field.key),

    );

    const hasSettings = settingsFields.length > 0 || showPlacement;



    return (

        <>

            {hasSettings ? (

                <ElementSettingsButton>

                    {settingsFields.map((field) => (

                        <AnnotationFieldInput

                            draftRef={wrapperDraftRef}

                            element={element}

                            field={field}

                            key={field.key}

                        />

                    ))}

                    {showPlacement ? (

                        <Select

                            {...placementField}

                            fullWidth

                            label={m.editor_figure_placement()}

                            value={draftPlacement}

                            options={getPlacementOptions()}

                            onChange={(event) => {

                                const next = event.target.value;

                                setDraftPlacement(next);

                                if (next !== element.placement) {

                                    dispatch({

                                        type: "UPDATE_FIGURE",

                                        payload: {

                                            figureId: element.id,

                                            placement: next,

                                        },

                                    });

                                }

                            }}

                        />

                    ) : null}

                </ElementSettingsButton>

            ) : null}

            <ElementExtrasCollapse

                showToggle={annotationFields.length > 0}

                primary={

                    <div

                        className={`${styles.figureWrap} ${styles.editorTableGridSize} ${styles.elementPrimary}`}

                    >

                        <button

                            aria-label={m.editor_figure_choose_image()}

                            className={styles.figureImageButton}

                            title={m.editor_figure_choose_image()}

                            type="button"

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

                        </button>

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

            {!hasAsset && element.content.type === "Paragraph" ? (

                <RichTextField

                    label={m.editor_figure_body()}

                    content={bodyContent}

                    fieldBinding={bodyField}

                    onChange={(next) => {

                        const normalized = normalizeRichTextContent(next);

                        setBodyDraft(normalized);

                        if (shouldCommitBody(normalized)) {

                            dispatch({

                                type: "UPDATE_PARAGRAPH_CONTENT",

                                payload: {

                                    paragraphId: bodyParagraphId,

                                    content: normalized,

                                },

                            });

                        }

                    }}

                    onKeyDown={handleEnterKey}

                />

            ) : null}

        </>

    );

};


