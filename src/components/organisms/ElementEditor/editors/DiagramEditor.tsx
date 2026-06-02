import { useEffect, useRef, useState } from "react";
import { Image24Regular } from "@fluentui/react-icons";
import { diagramSourceFieldId } from "../../../../editor/fieldIds";
import { useDiagramMermaidAsset } from "../../../../editor/diagram/useDiagramMermaidAsset";
import { useElementEnterInsertsParagraph } from "../../../../editor/useInsertParagraphAfterElement";
import { useDocumentAst } from "../../../../state/DocumentContext";
import { useTemplateSpecContext } from "../../../../state/TemplateSpecContext";
import { effectiveFigureAnnotationFields } from "../../../../editor/templateElementOverrides";
import { wrapperFieldDraftValues } from "../../../../editor/wrapperFields";
import { m } from "../../../../paraglide/messages.js";
import { Textarea } from "../../../atoms/Textarea/Textarea";
import { ElementExtrasCollapse } from "../ElementExtrasCollapse";
import { ElementSettingsButton } from "../ElementSettingsButton";
import { ElementDimensionFields } from "../ElementDimensionFields";
import { useElementSettingsShortcut } from "../useElementSettingsShortcut";
import { ElementAnnotationFields } from "../fields/ElementAnnotationFields";
import { useEditorFieldBinding } from "../../../../state/EditorFieldRegistry";
import type { DiagramElement } from "../types";
import styles from "../ElementEditor.module.css";

const FIGURE_SETTINGS_KEYS = new Set(["width"]);

export const DiagramEditor = ({ element }: { element: DiagramElement }) => {
    const { state } = useDocumentAst();
    const { spec: templateSpec } = useTemplateSpecContext();
    const figureOverride = templateSpec?.element_overrides?.figure ?? null;
    const extraFields = effectiveFigureAnnotationFields(figureOverride);
    const annotationFields = extraFields.filter(
        (field) => !FIGURE_SETTINGS_KEYS.has(field.key),
    );
    const handleEnterKey = useElementEnterInsertsParagraph(element.id);
    const sourceFieldId = diagramSourceFieldId(element.id);
    const sourceField = useEditorFieldBinding<HTMLTextAreaElement>({
        elementId: element.id,
        fieldId: sourceFieldId,
    });
    const sourceEditingRef = useRef(false);
    const [sourceDraft, setSourceDraft] = useState(element.mermaid_source);
    const wrapperDraftRef = useRef(
        wrapperFieldDraftValues(element, annotationFields),
    );
    const settings = useElementSettingsShortcut(element.id);

    const linkedAsset = element.asset_id
        ? state.assets.find((asset) => asset.id === element.asset_id) ?? null
        : null;

    const { previewUrl } = useDiagramMermaidAsset(
        element.id,
        sourceDraft,
        element.asset_id,
        linkedAsset,
    );

    useEffect(() => {
        if (!sourceEditingRef.current) {
            setSourceDraft(element.mermaid_source);
        }
    }, [element.mermaid_source]);

    useEffect(() => {
        wrapperDraftRef.current = wrapperFieldDraftValues(
            element,
            annotationFields,
        );
    }, [element, annotationFields]);

    return (
        <>
            <ElementSettingsButton
                open={settings.open}
                onOpenChange={settings.setOpen}
            >
                <ElementDimensionFields element={element} />
            </ElementSettingsButton>
            <ElementExtrasCollapse
                elementId={element.id}
                showToggle
                primary={
                    <div
                        className={`${styles.figureWrap} ${styles.editorTableGridSize} ${styles.elementPrimary}`}
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
                    </div>
                }
                extras={
                    <>
                        <div data-wrapper-tab="extra" data-wrapper-tab-index={0}>
                            <Textarea
                                {...sourceField}
                                fullWidth
                                monospace
                                label={m.editor_diagram_source()}
                                value={sourceDraft}
                                onChange={(event) => {
                                    sourceEditingRef.current = true;
                                    setSourceDraft(event.target.value);
                                }}
                                onBlur={() => {
                                    sourceEditingRef.current = false;
                                }}
                                onKeyDown={(event) => {
                                    handleEnterKey(event);
                                }}
                            />
                        </div>
                        <ElementAnnotationFields
                            draftRef={wrapperDraftRef}
                            element={element}
                            fields={annotationFields}
                            tabIndexOffset={1}
                        />
                    </>
                }
            />
        </>
    );
};
