import type { AssetEntry } from "../../bindings/AssetEntry";
import type { DocumentAST } from "../../bindings/DocumentAST";
import type { DocumentElement } from "../../bindings/DocumentElement";
import type { ReferenceEntry } from "../../bindings/ReferenceEntry";
import type { Table } from "../../bindings/Table";
import type { TableCell } from "../../bindings/TableCell";
import { createRichText } from "../ast/defaults";

type TableElement = Extract<DocumentElement, { type: "Table" }>;

export const insertElementEvent = (
    ast: DocumentAST,
    sectionId: string,
    elementId: string,
) => {
    const section = contentSection(ast, sectionId);
    const index = section.elements.findIndex(
        (element) => elementIdOf(element) === elementId,
    );
    if (index === -1) {
        throw new Error(`Element ${elementId} was not found in section ${sectionId}`);
    }

    return {
        type: "insertElement" as const,
        section_id: sectionId,
        index,
        element: section.elements[index],
    };
};

export const mapSections = (
    ast: DocumentAST,
    mapper: (section: DocumentAST["sections"][number]) => DocumentAST["sections"][number],
): DocumentAST => ({
    ...ast,
    sections: ast.sections.map(mapper),
});

export const mapContentElements = (
    ast: DocumentAST,
    elementId: string,
    mapper: (element: DocumentElement) => DocumentElement,
): DocumentAST =>
    mapSections(ast, (section) => {
        if (section.type !== "Content") {
            return section;
        }

        return {
            ...section,
            elements: section.elements.map((element) =>
                elementIdOf(element) === elementId ? mapper(element) : element,
            ),
        };
    });

export const mapTable = (
    ast: DocumentAST,
    tableId: string,
    mapper: (table: TableElement) => TableElement,
): DocumentAST =>
    mapContentElements(ast, tableId, (element) =>
        element.type === "Table" ? mapper(element) : element,
    );

export const richTextFromString = (text: string) =>
    text ? [createRichText(text)] : [];

export const insertAt = <T,>(values: T[], index: number, value: T): T[] => [
    ...values.slice(0, index),
    value,
    ...values.slice(index),
];

export const cloneValue = <T,>(value: T): T => structuredClone(value);

export const setValueAtPath = <T = unknown>(
    obj: unknown,
    pathParts: string[],
    value: unknown,
): T => {
    if (pathParts.length === 0) {
        return value as T;
    }

    const [current, ...rest] = pathParts;

    if (Array.isArray(obj)) {
        const index = parseInt(current, 10);
        if (Number.isNaN(index)) {
            throw new Error(`Invalid array index in path: ${current}`);
        }
        const nextArray = [...obj];
        while (nextArray.length <= index) {
            nextArray.push(null);
        }
        nextArray[index] = setValueAtPath(nextArray[index], rest, value);
        return nextArray as T;
    }

    const nextObj =
        obj !== null && typeof obj === "object"
            ? { ...(obj as Record<string, unknown>) }
            : {};
    nextObj[current] = setValueAtPath(nextObj[current], rest, value);
    return nextObj as T;
};

export const getValueAtPath = (obj: unknown, pathParts: string[]): unknown => {
    let current = obj;
    for (const part of pathParts) {
        if (current === undefined || current === null) {
            return undefined;
        }
        if (Array.isArray(current)) {
            const index = parseInt(part, 10);
            current = current[index];
        } else if (typeof current === "object") {
            current = (current as Record<string, unknown>)[part];
        } else {
            return undefined;
        }
    }
    return current;
};

export const contentSection = (ast: DocumentAST, sectionId: string) => {
    const section = ast.sections.find(
        (entry) => entry.type === "Content" && entry.id === sectionId,
    );
    if (!section || section.type !== "Content") {
        throw new Error(`Content section ${sectionId} was not found`);
    }

    return section;
};

export const elementLocation = (ast: DocumentAST, elementId: string) => {
    for (const section of ast.sections) {
        if (section.type !== "Content") {
            continue;
        }

        const index = section.elements.findIndex(
            (element) => elementIdOf(element) === elementId,
        );
        if (index !== -1) {
            return {
                section,
                index,
                element: section.elements[index],
            };
        }
    }

    throw new Error(`Element ${elementId} was not found`);
};

export const elementById = (
    ast: DocumentAST,
    elementId: string,
): DocumentElement => elementLocation(ast, elementId).element;

export const paragraphElement = (ast: DocumentAST, elementId: string) => {
    const element = elementById(ast, elementId);
    if (element.type !== "Paragraph") {
        throw new Error(`Element ${elementId} is not a paragraph`);
    }

    return element;
};

export const headingElement = (ast: DocumentAST, elementId: string) => {
    const element = elementById(ast, elementId);
    if (element.type !== "Heading") {
        throw new Error(`Element ${elementId} is not a heading`);
    }

    return element;
};

export const equationElement = (ast: DocumentAST, elementId: string) => {
    const element = elementById(ast, elementId);
    if (element.type !== "Equation") {
        throw new Error(`Element ${elementId} is not an equation`);
    }

    return element;
};

export const tableElement = (ast: DocumentAST, elementId: string): Table => {
    const element = elementById(ast, elementId);
    if (element.type !== "Table") {
        throw new Error(`Element ${elementId} is not a table`);
    }

    return element;
};

export const figureElement = (ast: DocumentAST, elementId: string) => {
    const element = elementById(ast, elementId);
    if (element.type !== "Figure") {
        throw new Error(`Element ${elementId} is not a figure`);
    }

    return element;
};

export const referenceLocation = (
    ast: DocumentAST,
    referenceId: string,
): {
    index: number;
    reference: ReferenceEntry;
} => {
    const index = ast.references.findIndex((reference) => reference.id === referenceId);
    if (index === -1) {
        throw new Error(`Reference ${referenceId} was not found`);
    }

    return {
        index,
        reference: ast.references[index],
    };
};

export const referenceById = (
    ast: DocumentAST,
    referenceId: string,
): ReferenceEntry => referenceLocation(ast, referenceId).reference;

export const assetLocation = (
    ast: DocumentAST,
    assetId: string,
): {
    index: number;
    asset: AssetEntry;
} => {
    const index = ast.assets.findIndex((asset) => asset.id === assetId);
    if (index === -1) {
        throw new Error(`Asset ${assetId} was not found`);
    }

    return {
        index,
        asset: ast.assets[index],
    };
};

export const assetById = (ast: DocumentAST, assetId: string): AssetEntry =>
    assetLocation(ast, assetId).asset;

export const tableRow = (table: Table, rowIndex: number): TableCell[] => {
    const row = table.cells[rowIndex];
    if (!row) {
        throw new Error(`Table row ${rowIndex} was not found in ${table.id}`);
    }

    return row;
};

export const tableColumn = (table: Table, colIndex: number): TableCell[] => {
    if (colIndex < 0 || colIndex >= table.column_sizes.length) {
        throw new Error(`Table column ${colIndex} was not found in ${table.id}`);
    }

    return table.cells.map((row) => {
        const cell = row[colIndex];
        if (!cell) {
            throw new Error(`Table column ${colIndex} was not found in ${table.id}`);
        }

        return cell;
    });
};

export const tableCell = (
    table: Table,
    rowIndex: number,
    colIndex: number,
): TableCell => {
    const cell = table.cells[rowIndex]?.[colIndex];
    if (!cell) {
        throw new Error(
            `Table cell ${rowIndex},${colIndex} was not found in ${table.id}`,
        );
    }

    return cell;
};

export const columnSize = (table: Table, colIndex: number): string => {
    const size = table.column_sizes[colIndex];
    if (size === undefined) {
        throw new Error(`Table column ${colIndex} was not found in ${table.id}`);
    }

    return size;
};

export const richTextPlainText = (
    content: Array<{ text: string }>,
): string => content.map((entry) => entry.text).join("");

export const elementIdOf = (element: DocumentElement): string => {
    switch (element.type) {
        case "Heading":
        case "Paragraph":
        case "Table":
        case "Equation":
        case "Figure":
        case "Custom":
            return element.id;
        default:
            return assertNever(element);
    }
};

export const assertNever = (value: never): never => {
    throw new Error(`Unhandled document event value: ${JSON.stringify(value)}`);
};
