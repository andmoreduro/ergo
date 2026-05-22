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

    return { elementId, fieldId };
};

export const editorFocusIdsForBackendField = (
    elementId: string,
    fieldId: string | null,
) => {
    if (elementId === backendInputsElementId && fieldId?.startsWith("/")) {
        return {
            elementId: projectInputElementId,
            fieldId: projectInputFieldId(fieldId),
        };
    }

    return { elementId, fieldId };
};

export const elementExtraFieldFieldId = (elementId: string, fieldKey: string) =>
    `${elementId}:extra:${fieldKey}`;

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

    return richTextFieldId(element.id);
};
