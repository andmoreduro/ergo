import type { KeyModifier } from "../bindings/KeyModifier";

/**
 * On AltGr keyboard layouts, Ctrl+Alt is AltGr and `event.key` is the produced
 * symbol (e.g. Ctrl+Alt+Q -> "@") rather than the physical key. Shortcut
 * resolution must use `event.code` (physical key) in that case.
 */
export function isAltGrStyleChord(
    event: Pick<KeyboardEvent, "ctrlKey" | "altKey" | "getModifierState">,
): boolean {
    if (event.ctrlKey && event.altKey) {
        return true;
    }
    return event.getModifierState?.("AltGraph") ?? false;
}

export function keyFromKeyboardCode(code: string): string | null {
    if (code.startsWith("Key") && code.length === 4) {
        return code.slice(3).toLowerCase();
    }
    if (code.startsWith("Digit") && code.length === 6) {
        return code.slice(5);
    }
    if (code.startsWith("Numpad") && code.length === 7) {
        const digit = code.slice(6);
        if (digit >= "0" && digit <= "9") {
            return digit;
        }
    }

    const named: Record<string, string> = {
        Space: "space",
        Enter: "enter",
        NumpadEnter: "enter",
        Tab: "tab",
        Escape: "escape",
        Backspace: "backspace",
        Delete: "delete",
        ArrowUp: "arrowup",
        ArrowDown: "arrowdown",
        ArrowLeft: "arrowleft",
        ArrowRight: "arrowright",
        Minus: "-",
        Equal: "=",
        NumpadAdd: "+",
        NumpadSubtract: "-",
        BracketLeft: "[",
        BracketRight: "]",
        Backslash: "\\",
        Semicolon: ";",
        Quote: "'",
        Comma: ",",
        Period: ".",
        Slash: "/",
        Backquote: "`",
    };

    return named[code] ?? null;
}

export function normalizeShortcutKey(key: string): string {
    if (key === " " || key === "Spacebar") {
        return "space";
    }

    if (key.length === 1) {
        return key.toLocaleLowerCase();
    }

    return key.toLowerCase();
}

export function shouldUsePhysicalShortcutKey(
    event: Pick<
        KeyboardEvent,
        "key" | "code" | "ctrlKey" | "altKey" | "shiftKey" | "getModifierState"
    >,
): boolean {
    if (isAltGrStyleChord(event)) {
        return true;
    }

    const fromCode = keyFromKeyboardCode(event.code);
    if (!fromCode) {
        return false;
    }

    const altGraph = event.getModifierState?.("AltGraph") ?? false;
    const chordModifiers =
        event.ctrlKey || event.altKey || altGraph;

    if (
        event.shiftKey &&
        chordModifiers &&
        fromCode >= "0" &&
        fromCode <= "9" &&
        normalizeShortcutKey(event.key) !== fromCode
    ) {
        return true;
    }

    return (
        chordModifiers &&
        (event.ctrlKey || altGraph) &&
        (event.altKey || altGraph) &&
        normalizeShortcutKey(event.key) !== fromCode
    );
}

export function resolveShortcutKey(
    event: Pick<KeyboardEvent, "key" | "code" | "ctrlKey" | "altKey" | "getModifierState">,
): string {
    if (shouldUsePhysicalShortcutKey(event)) {
        const fromCode = keyFromKeyboardCode(event.code);
        if (fromCode) {
            return fromCode;
        }
    }

    return normalizeShortcutKey(event.key);
}

/** Modifiers sent to the Rust keymap resolver (Ctrl+Alt chords include AltGr). */
export function shortcutChordModifiers(
    event: Pick<KeyboardEvent, "ctrlKey" | "altKey" | "shiftKey" | "metaKey" | "getModifierState">,
): KeyModifier[] {
    const altGraph = event.getModifierState?.("AltGraph") ?? false;
    const modifiers: KeyModifier[] = [];

    if (event.ctrlKey || altGraph) {
        modifiers.push("Control");
    }
    if (event.altKey || altGraph) {
        modifiers.push("Alt");
    }
    if (event.shiftKey) {
        modifiers.push("Shift");
    }
    if (event.metaKey) {
        modifiers.push("Meta");
    }

    return modifiers;
}
