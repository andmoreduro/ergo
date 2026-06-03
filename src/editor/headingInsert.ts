export const MIN_HEADING_LEVEL = 1;
export const MAX_HEADING_LEVEL = 6;

const readInteger = (value: unknown): number | null => {
    if (typeof value === "number" && Number.isInteger(value)) {
        return value;
    }
    if (typeof value === "bigint") {
        return Number(value);
    }
    if (typeof value === "string" && value.trim() !== "") {
        const parsed = Number(value);
        if (Number.isInteger(parsed)) {
            return parsed;
        }
    }
    return null;
};

export const parseHeadingInsertLevel = (payload: unknown): number | null => {
    if (typeof payload !== "object" || payload === null) {
        return null;
    }

    const level = readInteger((payload as { level?: unknown }).level);
    if (level === null) {
        return null;
    }

    if (level < MIN_HEADING_LEVEL || level > MAX_HEADING_LEVEL) {
        return null;
    }

    return level;
};
