import type { InputSchema } from "../../bindings/InputSchema";

export function createInputArrayItem(
    itemSchema: InputSchema | null | undefined,
    existingLength: number,
): unknown {
    if (itemSchema?.type === "object" && itemSchema.properties) {
        const newItem: Record<string, unknown> = {};
        for (const prop of itemSchema.properties) {
            if (prop.type === "integer" && prop.id === "id") {
                newItem[prop.id] = existingLength + 1;
            } else if (prop.type === "array") {
                newItem[prop.id!] = [];
            } else if (prop.type === "equation") {
                newItem[prop.id!] = { syntax: "typst", source: "" };
            } else {
                newItem[prop.id!] = prop.default ?? "";
            }
        }
        return newItem;
    }

    return itemSchema?.default ?? "";
}

export function parseInputArrayItemFieldPath(path: string): {
    arrayPath: string;
    itemIndex: number;
} | null {
    const parts = path.split("/").filter(Boolean);
    if (parts.length < 2) {
        return null;
    }

    const itemIndex = Number(parts[1]);
    if (!Number.isInteger(itemIndex) || itemIndex < 0) {
        return null;
    }

    return {
        arrayPath: `/${parts[0]}`,
        itemIndex,
    };
}

export function firstInputArrayItemFieldPath(
    arrayPath: string,
    itemIndex: number,
    itemSchema: InputSchema | null | undefined,
): string | null {
    if (itemSchema?.type === "object" && itemSchema.properties?.length) {
        const firstProperty = itemSchema.properties.find(
            (prop) => prop.id !== "id" || prop.type !== "integer",
        );
        if (firstProperty?.id) {
            return `${arrayPath}/${itemIndex}/${firstProperty.id}`;
        }
    }

    return `${arrayPath}/${itemIndex}`;
}
