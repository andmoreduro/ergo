import { open } from "@tauri-apps/plugin-dialog";
import {
    memo,
    useCallback,
    useEffect,
    useId,
    useMemo,
    useRef,
    useState,
    type CSSProperties,
    type KeyboardEventHandler,
    type MutableRefObject,
    type ReactNode,
} from "react";
import { caretPlainOffsetFromSelection } from "../../../richText/richText";
import { TauriApi } from "../../../api/tauri";
import { CompilerClient } from "../../../workers/compilerClient";
import { useDocument, useDocumentAst } from "../../../state/DocumentContext";
import { useEditorFieldBinding } from "../../../state/EditorFieldRegistry";
import type { DocumentElement } from "../../../bindings/DocumentElement";
import {
    ActionContextProvider,
    type ActionHandlerMap,
} from "../../../actions/runtime";
import {
    equationSourceFieldId,
    figureBodyFieldId,
    figurePlacementFieldId,
    richTextFieldId,
    tableCellFieldId,
    tableColumnSizeFieldId,
    elementExtraFieldFieldId,
} from "../../../editor/fieldIds";
import { useTemplateSpecContext } from "../../../state/TemplateSpecContext";
import { Image24Regular, Settings24Regular } from "@fluentui/react-icons";
import { Checkbox } from "../../atoms/Checkbox/Checkbox";
import { Select } from "../../atoms/Select/Select";
import { RichTextField } from "../../molecules/RichTextField/RichTextField";
import { Textarea } from "../../atoms/Textarea/Textarea";
import { TextInput } from "../../atoms/TextInput/TextInput";
import { usesStandardTypstFigureWrapper } from "../../../editor/templateElementOverrides";
import { useDeferredRichTextCommit } from "../../../editor/useDeferredRichTextCommit";
import {
    normalizeEditableText,
    normalizeRichTextContent,
} from "../../../editor/textInput";
import {
    wrapperFieldDraftValues,
    wrapperFieldValue,
    type WrapperHostElement,
} from "../../../editor/wrapperFields";
import {
    getAssetPreviewUrl,
    setAssetPreviewUrl,
} from "../../../editor/assetPreview";
import {
    figureHasLinkedAsset,
    textSignificantlyEqual,
} from "../../../state/ast/commitPolicy";
import { m } from "../../../paraglide/messages.js";
import styles from "./ElementEditor.module.css";
import type { ExtraFieldSpec } from "../../../bindings/ExtraFieldSpec";
import type { ConvertibleElementKind } from "../../../state/ast/convertElement";
import { insertParagraphAfterElement } from "../../../editor/insertParagraphAfterElement";
import { useElementEnterInsertsParagraph } from "../../../editor/useInsertParagraphAfterElement";
import {
    contentSection,
    paragraphHasText,
} from "../../../editor/fieldNavigation";
import { EditorAddButton } from "../../atoms/EditorAddButton/EditorAddButton";
import { getPlacementOptions, tablePlacementValue } from "../../../editor/placementOptions";
import { useEditorNavigation } from "../../../editor/EditorNavigationContext";
import { useDeferredTextCommit } from "../../../editor/useDeferredTextCommit";

export interface ElementEditorProps {
    element: DocumentElement;
}

type HeadingElement = Extract<DocumentElement, { type: "Heading" }>;
type ParagraphElement = Extract<DocumentElement, { type: "Paragraph" }>;
type EquationElement = Extract<DocumentElement, { type: "Equation" }>;
type TableElement = Extract<DocumentElement, { type: "Table" }>;
type FigureElement = Extract<DocumentElement, { type: "Figure" }>;
type CustomElementUnion = Extract<DocumentElement, { type: "Custom" }>;

const headingLevels = Array.from({ length: 6 }, (_, index) => {
    const level = String(index + 1);
    return { value: level, label: `H${level}` };
});

const FIGURE_SETTINGS_KEYS = new Set(["width"]);

export const ElementEditor = memo(function ElementEditor({ element }: ElementEditorProps) {
    const { dispatch } = useDocumentAst();
    const tableRows = element.type === "Table" ? element.rows : 0;
    const tableCols = element.type === "Table" ? element.cols : 0;

    const convertTo = useCallback(
        (targetKind: ConvertibleElementKind) => {
            if (element.type === targetKind) {
                return false;
            }

            dispatch({
                type: "CONVERT_ELEMENT",
                payload: { elementId: element.id, targetKind },
            });
            return true;
        },
        [dispatch, element.id, element.type],
    );

    const elementHandlers: ActionHandlerMap = useMemo(
        () => ({
            "editor::ConvertToParagraph": () => convertTo("Paragraph"),
            "editor::ConvertToHeading": () => convertTo("Heading"),
            "editor::ConvertToTable": () => convertTo("Table"),
            "editor::ConvertToEquation": () => convertTo("Equation"),
            "editor::ConvertToFigure": () => convertTo("Figure"),
            "editor::AddTableRow": () => {
                if (element.type !== "Table") {
                    return false;
                }

                dispatch({
                    type: "ADD_TABLE_ROW",
                    payload: { tableId: element.id },
                });
                return true;
            },
            "editor::AddTableColumn": () => {
                if (element.type !== "Table") {
                    return false;
                }

                dispatch({
                    type: "ADD_TABLE_COLUMN",
                    payload: { tableId: element.id },
                });
                return true;
            },
            "editor::RemoveTableRow": (invocation) => {
                if (element.type !== "Table") {
                    return false;
                }

                const payload = invocation.payload;
                const rowIndex =
                    typeof payload === "object" &&
                    payload !== null &&
                    "rowIndex" in payload &&
                    typeof payload.rowIndex === "number"
                        ? payload.rowIndex
                        : tableRows - 1;

                dispatch({
                    type: "REMOVE_TABLE_ROW",
                    payload: {
                        tableId: element.id,
                        rowIndex,
                    },
                });
                return true;
            },
            "editor::RemoveTableColumn": (invocation) => {
                if (element.type !== "Table") {
                    return false;
                }

                const payload = invocation.payload;
                const colIndex =
                    typeof payload === "object" &&
                    payload !== null &&
                    "colIndex" in payload &&
                    typeof payload.colIndex === "number"
                        ? payload.colIndex
                        : tableCols - 1;

                dispatch({
                    type: "REMOVE_TABLE_COLUMN",
                    payload: {
                        tableId: element.id,
                        colIndex,
                    },
                });
                return true;
            },
        }),
        [convertTo, dispatch, element.id, element.type, tableCols, tableRows],
    );

    return (
        <ActionContextProvider
            id={`element-${element.id}`}
            contexts={["element"]}
            attributes={{
                "element.id": element.id,
                "element.kind": element.type,
            }}
            handlers={elementHandlers}
        >
            <div className={styles.elementBlock} data-element-id={element.id}>
                <ElementContent element={element} />
            </div>
        </ActionContextProvider>
    );
});

const ElementSettingsButton = ({
    children,
}: {
    children: ReactNode;
}) => {
    const [open, setOpen] = useState(false);
    const panelId = useId();

    return (
        <div className={styles.settingsAnchor}>
            <button
                aria-controls={panelId}
                aria-expanded={open}
                aria-label={m.editor_element_settings()}
                className={styles.settingsButton}
                title={m.editor_element_settings()}
                type="button"
                onClick={() => setOpen((value) => !value)}
            >
                <Settings24Regular />
            </button>
            {open ? (
                <div className={styles.settingsPanel} id={panelId} role="region">
                    {children}
                </div>
            ) : null}
        </div>
    );
};

const ElementContent = ({ element }: { element: DocumentElement }) => {
    if (element.type === "Heading") {
        return <HeadingEditor element={element} />;
    }

    if (element.type === "Paragraph") {
        return <ParagraphEditor element={element} />;
    }

    if (element.type === "Equation") {
        return <EquationEditor element={element} />;
    }

    if (element.type === "Table") {
        return <TableEditor element={element} />;
    }

    if (element.type === "Custom") {
        return <CustomElementEditor element={element} />;
    }

    if (element.type === "Figure") {
        return <FigureEditor element={element} />;
    }

    return null;
};

const CustomElementEditor = ({ element }: { element: CustomElementUnion }) => {
    const { dispatch } = useDocumentAst();
    const { spec: templateSpec } = useTemplateSpecContext();
    const customElements = templateSpec?.custom_elements || [];
    const spec = customElements.find((c) => c.kind === element.element_type);

    if (!spec) {
        return <div className={styles.placeholder}>Unknown custom element type: {element.element_type}</div>;
    }

    return (
        <>
            {(spec.fields || []).map((field) => (
                <CustomElementFieldInput
                    key={field.key}
                    elementId={element.id}
                    fieldKey={field.key}
                    label={field.label || field.key}
                    committed={String(element.fields[field.key] ?? "")}
                    dispatch={dispatch}
                />
            ))}
        </>
    );
};

const CustomElementFieldInput = ({
    elementId,
    fieldKey,
    label,
    committed,
    dispatch,
}: {
    elementId: string;
    fieldKey: string;
    label: string;
    committed: string;
    dispatch: ReturnType<typeof useDocumentAst>["dispatch"];
}) => {
    const { draft, setDraft, shouldCommit } = useDeferredTextCommit(committed);
    const handleEnterKey = useElementEnterInsertsParagraph(elementId);
    const fieldId = elementExtraFieldFieldId(elementId, fieldKey);
    const { handleAdvanceKeyDown } = useEditorNavigation();
    const binding = useEditorFieldBinding<HTMLTextAreaElement>({
        elementId,
        fieldId,
    });

    return (
        <Textarea
            {...binding}
            fullWidth
            label={label}
            placeholder={label}
            value={draft}
            onKeyDown={(event) => {
                if (handleAdvanceKeyDown(event, fieldId)) {
                    return;
                }
                handleEnterKey(event);
            }}
            onChange={(event) => {
                const next = normalizeEditableText(event.target.value);
                setDraft(next);
                if (shouldCommit(next)) {
                    dispatch({
                        type: "UPDATE_CUSTOM_ELEMENT_FIELD",
                        payload: {
                            elementId,
                            field: fieldKey,
                            value: next,
                        },
                    });
                }
            }}
        />
    );
};

const HeadingEditor = ({ element }: { element: HeadingElement }) => {
    const { dispatch } = useDocumentAst();
    const handleEnterKey = useElementEnterInsertsParagraph(element.id);
    const { handleAdvanceKeyDown } = useEditorNavigation();
    const fieldId = richTextFieldId(element.id);
    const { content, setDraft, shouldCommit } = useDeferredRichTextCommit(
        element.id,
        element.content,
    );
    const textField = useEditorFieldBinding<HTMLDivElement>({
        elementId: element.id,
        fieldId: richTextFieldId(element.id),
    });

    return (
        <div className={styles.headingRow}>
            <Select
                variant="inline"
                aria-label={m.editor_heading_level()}
                value={String(element.level)}
                options={headingLevels}
                onChange={(event) =>
                    dispatch({
                        type: "UPDATE_HEADING",
                        payload: {
                            headingId: element.id,
                            level: Number(event.target.value),
                        },
                    })
                }
            />
            <div className={styles.headingText}>
                <RichTextField
                    variant="document"
                    content={content}
                    fieldBinding={textField}
                    onChange={(next) => {
                        const normalized = normalizeRichTextContent(next);
                        setDraft(normalized);
                        if (shouldCommit(normalized)) {
                            dispatch({
                                type: "UPDATE_HEADING_CONTENT",
                                payload: {
                                    headingId: element.id,
                                    content: next,
                                },
                            });
                        }
                    }}
                    onKeyDown={(event) => {
                        if (handleAdvanceKeyDown(event, fieldId)) {
                            return;
                        }
                        handleEnterKey(event);
                    }}
                />
            </div>
        </div>
    );
};

const ParagraphEditor = ({ element }: { element: ParagraphElement }) => {
    const { state, dispatch } = useDocumentAst();
    const { setDocumentFocus } = useDocument();
    const { removeContentElement, handleAdvanceKeyDown } = useEditorNavigation();
    const fieldId = richTextFieldId(element.id);
    const { content, setDraft, shouldCommit } = useDeferredRichTextCommit(
        element.id,
        element.content,
    );
    const textField = useEditorFieldBinding<HTMLDivElement>({
        elementId: element.id,
        fieldId: richTextFieldId(element.id),
    });

    const handleEnter = () => {
        if (!paragraphHasText(content)) {
            return;
        }

        insertParagraphAfterElement(
            state,
            dispatch,
            setDocumentFocus,
            element.id,
        );
    };

    const handleBackspaceOnEmpty: KeyboardEventHandler<HTMLDivElement> = (event) => {
        if (event.key !== "Backspace" || paragraphHasText(content)) {
            return;
        }

        const root = event.currentTarget;
        const selection = document.getSelection();
        if (!selection || !root.contains(selection.anchorNode)) {
            return;
        }

        const offset = caretPlainOffsetFromSelection(root, selection);
        if (offset !== 0) {
            return;
        }

        event.preventDefault();
        removeContentElement(state, element.id);
    };

    return (
        <RichTextField
            variant="document"
            content={content}
            fieldBinding={textField}
            onChange={(next) => {
                const normalized = normalizeRichTextContent(next);
                setDraft(normalized);
                if (shouldCommit(normalized)) {
                    dispatch({
                        type: "UPDATE_PARAGRAPH_CONTENT",
                        payload: {
                            paragraphId: element.id,
                            content: next,
                        },
                    });
                }
            }}
            onKeyDown={(event) => {
                if (handleAdvanceKeyDown(event, fieldId)) {
                    return;
                }
                if (event.key === "Enter" && !event.shiftKey && !event.ctrlKey) {
                    event.preventDefault();
                    handleEnter();
                    return;
                }
                handleBackspaceOnEmpty(event);
            }}
        />
    );
};

const EquationEditor = ({ element }: { element: EquationElement }) => {
    const { dispatch } = useDocumentAst();
    const { draft, setDraft, shouldCommit } = useDeferredTextCommit(
        element.latex_source,
    );
    const handleEnterKey = useElementEnterInsertsParagraph(element.id);
    const fieldId = equationSourceFieldId(element.id);
    const { handleAdvanceKeyDown } = useEditorNavigation();
    const sourceField = useEditorFieldBinding<HTMLTextAreaElement>({
        elementId: element.id,
        fieldId,
    });

    return (
        <>
            <Textarea
                {...sourceField}
                fullWidth
                label={m.editor_equation_source()}
                placeholder={m.editor_equation_source()}
                value={draft}
                onChange={(event) => {
                    const next = normalizeEditableText(event.target.value);
                    setDraft(next);
                    if (shouldCommit(next)) {
                        dispatch({
                            type: "UPDATE_EQUATION",
                            payload: {
                                equationId: element.id,
                                latexSource: next,
                            },
                        });
                    }
                }}
                onKeyDown={(event) => {
                    if (handleAdvanceKeyDown(event, fieldId)) {
                        return;
                    }
                    handleEnterKey(event);
                }}
            />
            <Checkbox
                label={m.editor_equation_block()}
                checked={element.is_block}
                onChange={(event) =>
                    dispatch({
                        type: "UPDATE_EQUATION",
                        payload: {
                            equationId: element.id,
                            isBlock: event.target.checked,
                        },
                    })
                }
            />
        </>
    );
};

const TableEditor = ({ element }: { element: TableElement }) => {
    const { dispatch } = useDocumentAst();
    const { spec: templateSpec } = useTemplateSpecContext();
    const tableOverride = templateSpec?.element_overrides?.table ?? null;
    const showPlacement = usesStandardTypstFigureWrapper(tableOverride);
    const annotationFields = tableOverride?.extra_fields ?? [];
    const committedPlacement = tablePlacementValue(element.extra_fields);
    const [draftPlacement, setDraftPlacement] = useState(committedPlacement);
    const placementField = useEditorFieldBinding<HTMLSelectElement>({
        elementId: element.id,
        fieldId: elementExtraFieldFieldId(element.id, "placement"),
    });

    useEffect(() => {
        setDraftPlacement(committedPlacement);
    }, [committedPlacement, element.id]);

    const insertRow = (rowIndex: number) => {
        dispatch({
            type: "ADD_TABLE_ROW",
            payload: { tableId: element.id, rowIndex },
        });
    };

    const insertColumn = (colIndex: number) => {
        dispatch({
            type: "ADD_TABLE_COLUMN",
            payload: { tableId: element.id, colIndex },
        });
    };

    return (
        <>
            <ElementSettingsButton>
                {showPlacement ? (
                    <Select
                        {...placementField}
                        fullWidth
                        label={m.editor_table_placement()}
                        value={draftPlacement}
                        options={getPlacementOptions()}
                        onChange={(event) => {
                            const next = event.target.value;
                            setDraftPlacement(next);
                            dispatch({
                                type: "UPDATE_ELEMENT_EXTRA_FIELD",
                                payload: {
                                    elementId: element.id,
                                    fieldKey: "placement",
                                    fieldValue: next,
                                },
                            });
                        }}
                    />
                ) : null}
                <div className={styles.columnSizes}>
                    {element.column_sizes.map((size, colIndex) => (
                        <TableColumnSizeEditor
                            colIndex={colIndex}
                            element={element}
                            key={colIndex}
                            size={size}
                        />
                    ))}
                </div>
            </ElementSettingsButton>
            <div className={styles.tableWrap}>
                <div
                    className={`${styles.tableFrame} ${styles.editorTableGridSize}`}
                >
                    <EditorAddButton
                        ariaLabel={m.editor_table_add_row()}
                        className={`${styles.tableInsertButton} ${styles.tableInsertTop}`}
                        onClick={() => insertRow(0)}
                    />
                    <EditorAddButton
                        ariaLabel={m.editor_table_add_row()}
                        className={`${styles.tableInsertButton} ${styles.tableInsertBottom}`}
                        onClick={() => insertRow(element.cells.length)}
                    />
                    <EditorAddButton
                        ariaLabel={m.editor_table_add_column()}
                        className={`${styles.tableInsertButton} ${styles.tableInsertLeft}`}
                        onClick={() => insertColumn(0)}
                    />
                    <EditorAddButton
                        ariaLabel={m.editor_table_add_column()}
                        className={`${styles.tableInsertButton} ${styles.tableInsertRight}`}
                        onClick={() => insertColumn(element.cols)}
                    />
                    <div
                        className={`${styles.tableGrid} ${styles.editorTableGridSize}`}
                        style={
                            {
                                "--table-cols": String(element.cols),
                            } as CSSProperties
                        }
                    >
                        {element.cells.map((row, rowIndex) => (
                            <div className={styles.tableRow} key={`row-${rowIndex}`}>
                                {row.map((cell, colIndex) => (
                                    <TableCellEditor
                                        cellContent={cell.content}
                                        colIndex={colIndex}
                                        element={element}
                                        key={`cell-${rowIndex}-${colIndex}`}
                                        rowIndex={rowIndex}
                                    />
                                ))}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
            {annotationFields.length > 0 ? (
                <ElementAnnotationFields
                    element={element}
                    fields={annotationFields}
                />
            ) : null}
        </>
    );
};

const TableColumnSizeEditor = ({
    colIndex,
    element,
    size,
}: {
    colIndex: number;
    element: TableElement;
    size: string;
}) => {
    const { dispatch } = useDocumentAst();
    const columnField = useEditorFieldBinding<HTMLInputElement>({
        elementId: element.id,
        fieldId: tableColumnSizeFieldId(element.id, colIndex),
    });

    return (
        <TextInput
            {...columnField}
            label={m.editor_table_column_size({
                index: colIndex + 1,
            })}
            value={size}
            onChange={(event) =>
                dispatch({
                    type: "UPDATE_TABLE_COLUMN_SIZE",
                    payload: {
                        tableId: element.id,
                        colIndex,
                        size: event.target.value,
                    },
                })
            }
        />
    );
};

const TableCellEditor = ({
    cellContent,
    colIndex,
    element,
    rowIndex,
}: {
    cellContent: string;
    colIndex: number;
    element: TableElement;
    rowIndex: number;
}) => {
    const { dispatch } = useDocumentAst();
    const handleEnterKey = useElementEnterInsertsParagraph(element.id);
    const { handleAdvanceKeyDown } = useEditorNavigation();
    const { draft, setDraft, shouldCommit } = useDeferredTextCommit(cellContent);
    const fieldId = tableCellFieldId(element.id, rowIndex, colIndex);
    const cellField = useEditorFieldBinding<HTMLInputElement>({
        elementId: element.id,
        fieldId,
    });

    return (
        <TextInput
            {...cellField}
            className={styles.tableCellInput}
            value={draft}
            aria-label={m.editor_table_cell_label({
                row: rowIndex + 1,
                column: colIndex + 1,
            })}
            onKeyDown={(event) => {
                if (handleAdvanceKeyDown(event, fieldId)) {
                    return;
                }
                handleEnterKey(event);
            }}
            onChange={(event) => {
                const next = normalizeEditableText(event.target.value);
                setDraft(next);
                if (shouldCommit(next)) {
                    dispatch({
                        type: "UPDATE_TABLE_CELL",
                        payload: {
                            tableId: element.id,
                            rowIndex,
                            colIndex,
                            text: next,
                        },
                    });
                }
            }}
        />
    );
};

const FigureEditor = ({ element }: { element: FigureElement }) => {
    const { state, dispatch } = useDocumentAst();
    const handleEnterKey = useElementEnterInsertsParagraph(element.id);
    const { spec: templateSpec } = useTemplateSpecContext();
    const figureOverride = templateSpec?.element_overrides?.figure ?? null;
    const extraFields = figureOverride?.extra_fields ?? [];
    const showPlacement = usesStandardTypstFigureWrapper(figureOverride);
    const hasAsset = figureHasLinkedAsset(element.asset_id);
    const linkedAsset = element.asset_id
        ? state.assets.find((asset) => asset.id === element.asset_id)
        : null;
    const [previewUrl, setPreviewUrl] = useState<string | null>(() =>
        element.asset_id ? getAssetPreviewUrl(element.asset_id) : null,
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

    useEffect(() => {
        if (!element.asset_id) {
            setPreviewUrl(null);
            return;
        }

        const cached = getAssetPreviewUrl(element.asset_id);
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
                setPreviewUrl(
                    setAssetPreviewUrl(
                        element.asset_id!,
                        bytes,
                        linkedAsset.path,
                    ),
                );
            })
            .catch(() => {
                if (!cancelled) {
                    setPreviewUrl(null);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [element.asset_id, linkedAsset]);

    const flushPendingFigureEdits = useCallback(() => {
        if (
            showPlacement &&
            draftPlacement !== element.placement
        ) {
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
            const next = wrapperDraftRef.current[field.key] ?? "";
            const previous = wrapperFieldValue(element, field.key);
            if (!textSignificantlyEqual(next, previous)) {
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
            setPreviewUrl(
                setAssetPreviewUrl(
                    result.asset.id,
                    new Uint8Array(result.bytes),
                    result.asset.path,
                ),
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
            <div
                className={`${styles.figureWrap} ${styles.editorTableGridSize}`}
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
            {annotationFields.length > 0 ? (
                <ElementAnnotationFields
                    draftRef={wrapperDraftRef}
                    element={element}
                    fields={annotationFields}
                />
            ) : null}
        </>
    );
};

const ElementAnnotationFields = ({
    element,
    fields,
    draftRef,
}: {
    element: WrapperHostElement;
    fields: ExtraFieldSpec[];
    draftRef?: MutableRefObject<Record<string, string>>;
}) => (
    <div className={styles.annotationFields}>
        {fields.map((field) => (
            <AnnotationFieldInput
                draftRef={draftRef}
                element={element}
                field={field}
                key={field.key}
            />
        ))}
    </div>
);

const AnnotationFieldInput = ({
    element,
    field,
    draftRef,
}: {
    element: WrapperHostElement;
    field: ExtraFieldSpec;
    draftRef?: MutableRefObject<Record<string, string>>;
}) => {
    const { dispatch } = useDocumentAst();
    const committed = wrapperFieldValue(element, field.key);
    const { draft, setDraft, shouldCommit } = useDeferredTextCommit(committed);

    useEffect(() => {
        if (draftRef) {
            draftRef.current[field.key] = draft;
        }
    }, [draft, draftRef, field.key]);

    const commit = (next: string) => {
        if (!shouldCommit(next)) {
            return;
        }

        if (element.type === "Figure" && field.key === "caption") {
            dispatch({
                type: "UPDATE_FIGURE",
                payload: {
                    figureId: element.id,
                    caption: next,
                },
            });
            return;
        }

        dispatch({
            type: "UPDATE_ELEMENT_EXTRA_FIELD",
            payload: {
                elementId: element.id,
                fieldKey: field.key,
                fieldValue: next,
            },
        });
    };

    return (
        <ExtraFieldInput
            committed={draft}
            element={element}
            field={field}
            onCommit={commit}
            onDraftChange={(next) => {
                setDraft(next);
                commit(next);
            }}
        />
    );
};

interface ExtraFieldInputProps {
    element: WrapperHostElement;
    field: ExtraFieldSpec;
    committed: string;
    onDraftChange: (value: string) => void;
    onCommit: (value: string) => void;
}

const ExtraFieldInput = ({
    element,
    field,
    committed,
    onDraftChange,
    onCommit,
}: ExtraFieldInputProps) => {
    const elementId = element.id;
    const handleEnterKey = useElementEnterInsertsParagraph(elementId);
    const fieldId = elementExtraFieldFieldId(elementId, field.key);
    const { handleAdvanceKeyDown } = useEditorNavigation();

    const handleChange = (raw: string) => {
        const next = normalizeEditableText(raw);
        onDraftChange(next);
        onCommit(next);
    };

    const handleKeyDown: KeyboardEventHandler<
        HTMLInputElement | HTMLTextAreaElement
    > = (event) => {
        if (handleAdvanceKeyDown(event, fieldId)) {
            return;
        }
        handleEnterKey(event);
    };

    if (field.type === "content") {
        const binding = useEditorFieldBinding<HTMLTextAreaElement>({
            elementId,
            fieldId,
        });

        return (
            <Textarea
                {...binding}
                fullWidth
                label={field.label}
                placeholder={field.label}
                value={committed}
                onChange={(event) => handleChange(event.target.value)}
                onKeyDown={handleKeyDown}
            />
        );
    }

    const binding = useEditorFieldBinding<HTMLInputElement>({
        elementId,
        fieldId,
    });

    return (
        <TextInput
            {...binding}
            fullWidth
            label={field.label}
            placeholder={field.label}
            value={committed}
            onChange={(event) => handleChange(event.target.value)}
            onKeyDown={handleKeyDown}
        />
    );
};
