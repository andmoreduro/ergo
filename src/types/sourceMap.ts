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

export interface FieldTextSegment {
    sourceByteStart: number;
    sourceByteEnd: number;
    fieldUtf16Start: number;
    fieldUtf16End: number;
}

export interface FieldSourceMapEntry {
    elementId: string;
    sectionId: string;
    fieldId: string;
    filePath: string;
    byteStart: number;
    byteEnd: number;
    segments: FieldTextSegment[];
    fallbackCaretUtf16Offset: number | null;
}
