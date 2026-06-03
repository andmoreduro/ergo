export const HEADING_LEVEL_MIN = 1;
export const HEADING_LEVEL_MAX = 6;

export const headingLevelOptions = () =>
    Array.from({ length: HEADING_LEVEL_MAX }, (_, index) => {
        const level = index + HEADING_LEVEL_MIN;
        return { value: String(level), label: `H${level}` };
    });

export const clampHeadingLevel = (level: number): number =>
    Math.min(HEADING_LEVEL_MAX, Math.max(HEADING_LEVEL_MIN, level));
