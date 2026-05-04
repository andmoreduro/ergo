export const COMPILE_QUEUED_EVENT = "ergo-compile-queued";
export const COMPILE_STARTED_EVENT = "ergo-compile-started";
export const COMPILE_SUCCEEDED_EVENT = "ergo-compile-succeeded";
export const COMPILE_FAILED_EVENT = "ergo-compile-failed";
export const COMPILE_DROPPED_EVENT = "ergo-compile-dropped";

export type ExportFormat = "pdf" | "png" | "svg";

export type CompilationJobKind =
    | { type: "previewSvg" }
    | { type: "export"; format: ExportFormat };

export type CompilationPriority = "preview" | "export";

export type CompilationStatus =
    | "queued"
    | "started"
    | "succeeded"
    | "failed"
    | "dropped";

export type SourceRevision = number;

export interface CompilationJob {
    job_id: number;
    kind: CompilationJobKind;
    priority: CompilationPriority;
    source_revision: SourceRevision;
}

export interface CompilationResult {
    job_id: number;
    kind: CompilationJobKind;
    source_revision: SourceRevision;
    status: CompilationStatus;
    svgs: string[] | null;
    preview_pages: PreviewPageFile[] | null;
    export_path: string | null;
    diagnostics: string[];
}

export interface PreviewPageFile {
    page_number: number;
    path: string;
    changed: boolean;
}

export interface CompilationQueueSnapshot {
    latest_source_revision: SourceRevision;
    active_job_id: number | null;
    queued_preview_job_id: number | null;
    queued_export_count: number;
    last_result: CompilationResult | null;
}
