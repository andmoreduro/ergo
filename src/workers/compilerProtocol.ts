import type { DocumentAST } from "../bindings/DocumentAST";

import type { DocumentEvent } from "../bindings/DocumentEvent";

import type { DocumentSessionStatus } from "../bindings/DocumentSessionStatus";

import type { CompilationResult } from "../bindings/CompilationResult";

import type { PreviewFocusTarget } from "../bindings/PreviewFocusTarget";

import type { PreviewJumpResult } from "../bindings/PreviewJumpResult";

import type { PreviewElementPositionsResult } from "../bindings/PreviewElementPositionsResult";

import type { ProjectFile } from "../bindings/ProjectFile";



export type VfsFileEntry = { path: string; bytes: Uint8Array };



export type BootstrapPreviewPayload = {

    ast: DocumentAST;

    files: VfsFileEntry[];

};



export type BootstrapPreviewResult = {

    status: DocumentSessionStatus;

    result: CompilationResult;

};



export type WorkerRequest =

    | { type: "init"; payload: { wasmUrl: string } }

    | { type: "load_fonts"; payload: number[][] }

    | { type: "sync_snapshot"; payload: DocumentAST }

    | { type: "sync_events"; payload: DocumentEvent[] }

    | { type: "compile" }

    | { type: "bootstrap"; payload: BootstrapPreviewPayload }

    | {

          type: "render_page";

          payload: { pageIndex: number; pixelPerPt: number; requestId: number };

      }

    | {

          type: "render_resource_page";

          payload: { pageNumber: number; pixelPerPt: number; requestId: number };

      }

    | { type: "write_file"; payload: { path: string; bytes: Uint8Array } }

    | { type: "write_files"; payload: VfsFileEntry[] }

    | { type: "write_source"; payload: { path: string; text: string } }

    | {

          type: "apply_patch";

          payload: { path: string; start: number; end: number; text: string };

      }

    | {

          type: "jump_from_click";

          payload: {

              pageNumber: number;

              xPt: number;

              yPt: number;

              sourceRevision: number;

          };

      }

    | {

          type: "positions_for_focus";

          payload: { target: PreviewFocusTarget; sourceRevision: number };

      }

    | { type: "export_pdf" }

    | { type: "export_png"; payload: { pageIndex: number; pixelPerPt: number } };



export type RenderPagePayload = {

    pageIndex: number;

    width: number;

    height: number;

    pixels: Uint8Array;

    requestId: number;

};



export type WorkerResponse =

    | { type: "init_done" }

    | { type: "load_fonts_done" }

    | { type: "sync_done"; status: DocumentSessionStatus }

    | { type: "compile_done"; result: CompilationResult }

    | { type: "bootstrap_done"; payload: BootstrapPreviewResult }

    | { type: "render_done"; payload: RenderPagePayload }

    | { type: "write_file_done" }

    | { type: "write_files_done" }

    | { type: "write_source_done" }

    | { type: "apply_patch_done" }

    | { type: "jump_done"; result: PreviewJumpResult }

    | { type: "positions_done"; result: PreviewElementPositionsResult }

    | { type: "export_pdf_done"; bytes: Uint8Array }

    | { type: "export_png_done"; bytes: Uint8Array; pageIndex: number }

    | { type: "error"; error: string };



export type WorkerMessage = WorkerRequest & { id?: number };



export type WorkerReply = WorkerResponse & { id?: number };



export function projectFilesToVfsEntries(files: ProjectFile[]): VfsFileEntry[] {

    return files.map((file) => ({

        path: file.path,

        bytes: new Uint8Array(file.bytes),

    }));

}


