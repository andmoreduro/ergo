let activeToggle: (() => void) | null = null;

export const registerActiveElementSettingsToggle = (
    toggle: () => void,
): (() => void) => {
    activeToggle = toggle;
    return () => {
        if (activeToggle === toggle) {
            activeToggle = null;
        }
    };
};

export const toggleActiveElementSettings = (): boolean => {
    if (!activeToggle) {
        return false;
    }

    activeToggle();
    return true;
};
