import { useEffect, useState } from "react";

/**
 * Returns `value` after it has been stable for `delayMs`.
 * Used to defer expensive resource thumbnail rasterization during rapid input.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
    const [debounced, setDebounced] = useState(value);

    useEffect(() => {
        if (delayMs <= 0) {
            setDebounced(value);
            return;
        }

        const handle = window.setTimeout(() => setDebounced(value), delayMs);
        return () => window.clearTimeout(handle);
    }, [value, delayMs]);

    return debounced;
}
