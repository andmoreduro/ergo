import type { DocumentAST } from "../bindings/DocumentAST";
import type { DocumentElement } from "../bindings/DocumentElement";
import type { InputSchema } from "../bindings/InputSchema";
import type { TemplateSpec } from "../bindings/TemplateSpec";
import {
    defaultFieldIdForElement,
    elementExtraFieldFieldId,
    projectInputElementId,
    projectInputFieldId,
    simpleListComposerFieldId,
} from "./fieldIds";
import {
    getValueAtPath,
    richTextPlainText,
} from "../state/documentEvents/helpers";

type ContentSection = Extract<DocumentAST["sections"][number], { type: "Content" }>;

export interface EditorFieldTarget {
    elementId: string;
    fieldId: string;
}

const normalizePath = (path: string) =>
    path.startsWith("/") ? path : `/${path}`;

const appliesToVariant = (
    schema: InputSchema,
    variantId: string | null,
): boolean => {
    if (!schema.variants || schema.variants.length === 0) {
        return true;
    }
    if (!variantId) {
        return true;
    }
    return schema.variants.includes(variantId);
};

const collectInputFieldTargets = (
    schema: InputSchema,
    path: string,
    variantId: string | null,
    inputs: Record<string, unknown> | undefined,
    targets: EditorFieldTarget[],
): void => {
    if (!appliesToVariant(schema, variantId)) {
        return;
    }

    const normalizedPath = normalizePath(path);
    const pathParts = normalizedPath.split("/").filter(Boolean);

    if (schema.type === "simple_list") {
        const items = getValueAtPath(inputs, pathParts);
        const length = Array.isArray(items) ? items.length : 0;
        for (let index = 0; index < length; index += 1) {
            targets.push({
                elementId: projectInputElementId,
                fieldId: projectInputFieldId(`${normalizedPath}/${index}`),
            });
        }
        targets.push({
            elementId: projectInputElementId,
            fieldId: simpleListComposerFieldId(normalizedPath),
        });
        return;
    }

    if (schema.id === "authors" && schema.type === "array") {
        const authors = getValueAtPath(inputs, pathParts);
        const length = Array.isArray(authors) ? authors.length : 0;
        for (let index = 0; index < length; index += 1) {
            targets.push({
                elementId: projectInputElementId,
                fieldId: projectInputFieldId(`${normalizedPath}/${index}/name`),
            });
        }
        return;
    }

    if (schema.type === "array") {
        if (schema.items?.type === "reference" && schema.items.target) {
            return;
        }
        if (schema.items?.type === "object" && schema.items.properties) {
            const items = getValueAtPath(inputs, pathParts);
            const length = Array.isArray(items) ? items.length : 0;
            for (let index = 0; index < length; index += 1) {
                for (const property of schema.items.properties) {
                    if (!property.id) {
                        continue;
                    }
                    collectInputFieldTargets(
                        property,
                        `${normalizedPath}/${index}/${property.id}`,
                        variantId,
                        inputs,
                        targets,
                    );
                }
            }
            return;
        }
        return;
    }

    if (schema.type === "object" && schema.properties) {
        for (const property of schema.properties) {
            if (!property.id) {
                continue;
            }
            collectInputFieldTargets(
                property,
                `${normalizedPath}/${property.id}`,
                variantId,
                inputs,
                targets,
            );
        }
        return;
    }

    targets.push({
        elementId: projectInputElementId,
        fieldId: projectInputFieldId(normalizedPath),
    });
};

export const collectTemplateFieldTargets = (
    spec: TemplateSpec | null,
    variantId: string | null,
    inputs: Record<string, unknown> | undefined,
): EditorFieldTarget[] => {
    if (!spec) {
        return [];
    }

    const inputsMap = new Map(
        (spec.editor?.inputs ?? [])
            .filter((input) => input.id)
            .map((input) => [input.id!, input]),
    );
    const targets: EditorFieldTarget[] = [];

    for (const group of spec.editor?.groups ?? []) {
        if (!appliesToVariant({ variants: group.variants } as InputSchema, variantId)) {
            continue;
        }

        for (const inputId of group.inputs) {
            const schema = inputsMap.get(inputId);
            if (!schema) {
                continue;
            }
            collectInputFieldTargets(
                schema,
                `/${inputId}`,
                variantId,
                inputs,
                targets,
            );
        }
    }

    return targets;
};

export const collectContentFieldTargets = (
    ast: DocumentAST,
): EditorFieldTarget[] => {
    const targets: EditorFieldTarget[] = [];

    for (const section of ast.sections) {
        if (section.type !== "Content") {
            continue;
        }

        for (const element of section.elements) {
            targets.push({
                elementId: element.id,
                fieldId: defaultFieldIdForElement(element),
            });

            if (element.type === "Table") {
                targets.push({
                    elementId: element.id,
                    fieldId: elementExtraFieldFieldId(element.id, "placement"),
                });
                for (let row = 0; row < element.rows; row += 1) {
                    for (let col = 0; col < element.cols; col += 1) {
                        if (row === 0 && col === 0) {
                            continue;
                        }
                        targets.push({
                            elementId: element.id,
                            fieldId: `${element.id}:cell:${row}:${col}`,
                        });
                    }
                }
            }
        }
    }

    return targets;
};

export const buildEditorFieldOrder = (
    spec: TemplateSpec | null,
    variantId: string | null,
    ast: DocumentAST,
): EditorFieldTarget[] => [
    ...collectTemplateFieldTargets(spec, variantId, ast.inputs),
    ...collectContentFieldTargets(ast),
];

/** Last focusable field in the template form section (above the document body). */
export const findLastTemplateFieldTarget = (
    order: EditorFieldTarget[],
): EditorFieldTarget | null => {
    for (let index = order.length - 1; index >= 0; index -= 1) {
        const entry = order[index];
        if (entry.elementId === projectInputElementId) {
            return entry;
        }
    }
    return null;
};

export const findNextEditorField = (
    order: EditorFieldTarget[],
    currentFieldId: string | null,
): EditorFieldTarget | null => {
    if (order.length === 0) {
        return null;
    }

    if (!currentFieldId) {
        return order[0] ?? null;
    }

    const index = order.findIndex((entry) => entry.fieldId === currentFieldId);
    if (index === -1) {
        return order[0] ?? null;
    }

    return order[index + 1] ?? null;
};

export const findPreviousEditorField = (
    order: EditorFieldTarget[],
    currentFieldId: string | null,
): EditorFieldTarget | null => {
    if (order.length === 0) {
        return null;
    }

    if (!currentFieldId) {
        return order[order.length - 1] ?? null;
    }

    const index = order.findIndex((entry) => entry.fieldId === currentFieldId);
    if (index === -1) {
        return order[order.length - 1] ?? null;
    }

    return order[index - 1] ?? null;
};

export const contentSection = (ast: DocumentAST): ContentSection | null => {
    const section = ast.sections.find((entry) => entry.type === "Content");
    return section?.type === "Content" ? section : null;
};

export const paragraphHasText = (content: { text: string }[]): boolean =>
    richTextPlainText(content).trim().length > 0;

export const elementHasText = (element: DocumentElement): boolean => {
    if (element.type === "Paragraph" || element.type === "Heading") {
        return paragraphHasText(element.content);
    }

    if (element.type === "Equation") {
        return element.latex_source.trim().length > 0;
    }

    return true;
};
