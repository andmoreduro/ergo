export const matchesReferenceSearch = (
    query: string,
    label: string,
    subtitle?: string,
): boolean => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
        return true;
    }
    return (
        label.toLowerCase().includes(needle) ||
        (subtitle?.toLowerCase().includes(needle) ?? false)
    );
};

export const filterReferenceItems = <
    T extends { label: string; subtitle?: string },
>(
    items: T[],
    searchQuery: string,
): T[] =>
    items.filter((item) =>
        matchesReferenceSearch(searchQuery, item.label, item.subtitle),
    );
