export interface TextRange {
    start: number;
    end: number;
}

export const findAllMatches = (
    text: string,
    query: string,
    caseSensitive = false,
): TextRange[] => {
    if (!query) {
        return [];
    }
    const haystack = caseSensitive ? text : text.toLowerCase();
    const needle = caseSensitive ? query : query.toLowerCase();
    const matches: TextRange[] = [];
    let from = 0;
    while (from <= haystack.length - needle.length) {
        const index = haystack.indexOf(needle, from);
        if (index < 0) {
            break;
        }
        matches.push({ start: index, end: index + needle.length });
        from = index + Math.max(1, needle.length);
    }
    return matches;
};

export const nextMatchIndex = (
    matches: TextRange[],
    caret: number,
    direction: 1 | -1,
): number => {
    if (matches.length === 0) {
        return -1;
    }
    if (direction > 0) {
        for (let index = 0; index < matches.length; index += 1) {
            if (matches[index]!.start >= caret) {
                return index;
            }
        }
        return 0;
    }
    for (let index = matches.length - 1; index >= 0; index -= 1) {
        if (matches[index]!.start < caret) {
            return index;
        }
    }
    return matches.length - 1;
};
