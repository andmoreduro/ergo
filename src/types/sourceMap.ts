export interface SourceMapEntry {
    elementId: string;
    sectionId: string;
    filePath: string;
    start: number;
    end: number;
    byteStart: number;
    byteEnd: number;
    label: string;
    page: number | null;
}
