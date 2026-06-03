export type ListReferenceStyle = "numeric" | "lowercase-alpha";

/** Stable list-item reference id stored on authors (affiliations, degrees, …). */
export function listReferenceId(
    index: number,
    style: ListReferenceStyle = "numeric",
): string {
    if (style === "lowercase-alpha") {
        return String.fromCharCode(97 + index);
    }
    return String(index + 1);
}
