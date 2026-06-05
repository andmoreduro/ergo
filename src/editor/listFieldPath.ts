export const parseListItemFieldPath = (
    fieldId: string,
    elementId: string,
): number[] | null => {
    const prefix = `${elementId}:item:`;
    if (!fieldId.startsWith(prefix)) {
        return null;
    }
    const suffix = fieldId.slice(prefix.length);
    if (suffix.length === 0) {
        return null;
    }
    const path = suffix.split(":").map((part) => Number(part));
    if (path.some((index) => !Number.isInteger(index) || index < 0)) {
        return null;
    }
    return path;
};
