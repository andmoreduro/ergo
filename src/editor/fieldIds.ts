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
