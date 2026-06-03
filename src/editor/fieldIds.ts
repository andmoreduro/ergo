export const richTextFieldId = (elementId: string) => `${elementId}:text`;

export const coverTitleFieldId = (sectionId: string) => `${sectionId}:title`;

export const coverAbstractFieldId = (sectionId: string) =>
    `${sectionId}:abstract`;

export const coverAffiliationsFieldId = (sectionId: string) =>
    `${sectionId}:affiliations`;

export const coverAuthorNameFieldId = (sectionId: string, authorIndex: number) =>
    `${sectionId}:author:${authorIndex}:name`;

export const coverAuthorEmailFieldId = (
    sectionId: string,
    authorIndex: number,
) => `${sectionId}:author:${authorIndex}:email`;

export const equationSourceFieldId = (elementId: string) =>
    `${elementId}:latexSource`;

export const quoteContentFieldId = (elementId: string) => `${elementId}:quote`;

export const diagramSourceFieldId = (elementId: string) =>
    `${elementId}:mermaidSource`;

export const diagramCaptionFieldId = (elementId: string) =>
    `${elementId}:caption`;

export const listItemFieldId = (elementId: string, itemIndex: number) =>
    `${elementId}:item:${itemIndex}`;

export const tableCellFieldId = (
    elementId: string,
    rowIndex: number,
    colIndex: number,
) => `${elementId}:cell:${rowIndex}:${colIndex}`;

export const tableColumnSizeFieldId = (elementId: string, colIndex: number) =>
    `${elementId}:columnSize:${colIndex}`;

export const figureBodyFieldId = (elementId: string) => `${elementId}:body`;

export const figureCaptionFieldId = (elementId: string) =>
    `${elementId}:caption`;

export const figurePlacementFieldId = (elementId: string) =>
    `${elementId}:placement`;

export const coverCourseFieldId = (sectionId: string) => `${sectionId}:course`;
export const coverInstructorFieldId = (sectionId: string) => `${sectionId}:instructor`;
export const coverDueDateFieldId = (sectionId: string) => `${sectionId}:due_date`;
export const coverAuthorNoteFieldId = (sectionId: string) => `${sectionId}:author_note`;
export const projectRunningHeadFieldId = () => `project:running_head`;
export const projectKeywordsFieldId = () => `project:keywords`;

export const projectInputElementId = "project";
export const backendInputsElementId = "inputs";
const projectInputFieldPrefix = "project-input-";

export const projectInputFieldId = (path: string) =>
    `${projectInputFieldPrefix}${path}`;

export const isTemplateFormFieldId = (fieldId: string): boolean =>
    fieldId.startsWith(projectInputFieldPrefix);

export const simpleListComposerFieldId = (path: string) =>
    projectInputFieldId(`${path}/composer`);

export const authorsComposerFieldId = () =>
    projectInputFieldId("/authors/composer");

/** Frontend-only fields used to add list entries; not in the Typst source map. */
export const isUiOnlyComposerFieldId = (fieldId: string) =>
    fieldId.endsWith("/composer");

export const backendFocusIdsForEditorField = (
    elementId: string,
    fieldId: string | null,
) => {
    if (
        elementId === projectInputElementId &&
        fieldId?.startsWith(projectInputFieldPrefix)
    ) {
        return {
            elementId: backendInputsElementId,
            fieldId: fieldId.slice(projectInputFieldPrefix.length),
        };
    }

    if (fieldId === `${elementId}:extra:caption`) {
        return { elementId, fieldId: figureCaptionFieldId(elementId) };
    }

    return { elementId, fieldId };
};

export const editorFocusIdsForBackendField = (
    elementId: string,
    fieldId: string | null,
) => {
    if (elementId === backendInputsElementId && fieldId?.startsWith("/")) {
        const indexed = fieldId.match(/^(\/[^/]+)\/\d+$/);
        const editorPath = indexed ? indexed[1] : fieldId;
        return {
            elementId: projectInputElementId,
            fieldId: projectInputFieldId(editorPath),
        };
    }

    return { elementId, fieldId };
};

export const elementExtraFieldFieldId = (elementId: string, fieldKey: string) =>
    `${elementId}:extra:${fieldKey}`;

/** Source-map field id for figure/diagram annotation inputs (matches Rust `figure_caption_field_id`). */
export const elementAnnotationFieldId = (
    elementId: string,
    elementType: string,
    fieldKey: string,
): string => {
    if (
        fieldKey === "caption" &&
        (elementType === "Figure" || elementType === "Diagram")
    ) {
        return figureCaptionFieldId(elementId);
    }
    return elementExtraFieldFieldId(elementId, fieldKey);
};

export const defaultFieldIdForElement = (element: {
    id: string;
    type: string;
}) => {
    if (element.type === "Equation") {
        return equationSourceFieldId(element.id);
    }

    if (element.type === "Table") {
        return tableCellFieldId(element.id, 0, 0);
    }

    if (element.type === "Figure") {
        return figureBodyFieldId(element.id);
    }

    if (element.type === "Quote") {
        return quoteContentFieldId(element.id);
    }

    if (element.type === "Diagram") {
        return diagramSourceFieldId(element.id);
    }

    if (element.type === "List" || element.type === "Enumeration") {
        return listItemFieldId(element.id, 0);
    }

    return richTextFieldId(element.id);
};
