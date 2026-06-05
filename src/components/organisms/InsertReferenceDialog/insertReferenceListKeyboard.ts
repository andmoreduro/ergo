export const moveReferenceHighlight = (
    current: number,
    delta: number,
    itemCount: number,
): number => {
    if (itemCount <= 0) {
        return 0;
    }
    const next = current + delta;
    if (next < 0) {
        return 0;
    }
    if (next > itemCount - 1) {
        return itemCount - 1;
    }
    return next;
};
