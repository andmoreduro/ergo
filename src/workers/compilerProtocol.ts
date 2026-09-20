import type { DocumentAST } from "../bindings/DocumentAST";
import type { DocumentEvent } from "../bindings/DocumentEvent";
import type { DocumentSessionStatus } from "../bindings/DocumentSessionStatus";
import type { CompilationResult } from "../bindings/CompilationResult";
import type { PreviewJumpResult } from "../bindings/PreviewJumpResult";
import type { PreviewElementPositionsResult } from "../bindings/PreviewElementPositionsResult";
import type { PreviewFocusTarget } from "../bindings/PreviewFocusTarget";

import type { BundledFile } from "../api/fileBundle";

export type VfsFileEntry = BundledFile;

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
    | { type: "reset_fonts" }
    | { type: "load_fonts"; payload: Uint8Array[] }
    | { type: "sync_snapshot"; payload: DocumentAST }
    | { type: "sync_events"; payload: DocumentEvent[] }
    | { type: "compile"; payload: { svgPageIndices: number[] } }
    | { type: "bootstrap"; payload: BootstrapPreviewPayload }
    | {
          type: "render_page";
          payload: { pageIndex: number; pixelPerPt: number; requestId: number };
      }
    | {
          type: "render_svg_page";
          payload: { pageIndex: number; requestId: number };
      }
    | {
          type: "render_png_page";
          payload: {
              pageIndex: number;
              pixelPerPt: number;
              requestId: number;
          };
      }
    | {
          type: "render_resource_svg_page";
          payload: { pageNumber: number; requestId: number };
      }
    | {
          type: "render_region";
          payload: {
              pageIndex: number;
              pixelPerPt: number;
              xMinPt: number;
              xMaxPt: number;
              yMinPt: number;
              yMaxPt: number;
              requestId: number;
          };
      }
    | {
          type: "render_resource_region";
          payload: {
              pageNumber: number;
              targetWidthPx: number;
              xMinPt: number;
              xMaxPt: number;
              yMinPt: number;
              yMaxPt: number;
              requestId: number;
          };
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
    | { type: "positions_for_focus"; payload: { target: PreviewFocusTarget } }
    | { type: "export_pdf" }
    | { type: "export_png_pages"; payload: { pixelPerPt: number } }
    | { type: "export_svg_pages" };

export type WorkerLogEntry = {
    type: "log";
    level: string;
    message: string;
    source?: string;
};

export type RenderPagePayload = {
    pageIndex: number;
    width: number;
    height: number;
    widthPt?: number;
    heightPt?: number;
    pixels: Uint8Array;
    requestId: number;
};

export type RenderSvgPagePayload = {
    pageIndex: number;
    widthPt: number;
    heightPt: number;
    svg: string;
    requestId: number;
};

export type RenderPngPagePayload = {
    pageIndex: number;
    widthPt: number;
    heightPt: number;
    dataUrl: string;
    requestId: number;
};

/**
 * A rasterized visible band, ready for `ctx.drawImage`. `bitmap` is a transferable
 * `ImageBitmap` (already decoded off the main thread); `pageWidthPt`/`pageHeightPt`
 * size the whole page, while `yMinPt`/`yMaxPt` and `bandWidth`/`bandHeight` place
 * and size the band the worker actually rendered.
 */
export type RenderRegionPayload = {
    bitmap: ImageBitmap;
    bandWidth: number;
    bandHeight: number;
    pageWidthPt: number;
    pageHeightPt: number;
    xMinPt: number;
    xMaxPt: number;
    yMinPt: number;
    yMaxPt: number;
    pixelPerPt: number;
    requestId: number;
};

export type WorkerResponse =
    | { type: "init_done" }
    | { type: "reset_fonts_done" }
    | { type: "load_fonts_done" }
    | { type: "sync_done"; status: DocumentSessionStatus }
    | { type: "compile_done"; result: CompilationResult; compileMs: number }
    | { type: "bootstrap_done"; payload: BootstrapPreviewResult }
    | { type: "render_done"; payload: RenderPagePayload }
    | { type: "render_svg_done"; payload: RenderSvgPagePayload }
    | { type: "render_png_done"; payload: RenderPngPagePayload }
    | { type: "render_resource_svg_done"; payload: RenderSvgPagePayload }
    | { type: "render_region_done"; payload: RenderRegionPayload }
    | { type: "render_resource_region_done"; payload: RenderRegionPayload }
    | { type: "write_file_done" }
    | { type: "write_files_done" }
    | { type: "write_source_done" }
    | { type: "apply_patch_done" }
    | { type: "jump_done"; result: PreviewJumpResult }
    | { type: "positions_done"; result: PreviewElementPositionsResult }
    | { type: "export_pdf_done"; bytes: Uint8Array }
    | { type: "export_png_pages_done"; pages: Uint8Array[] }
    | { type: "export_svg_pages_done"; pages: string[] }
    | { type: "error"; error: string }
    | WorkerLogEntry;

export type WorkerMessage = WorkerRequest & { id?: number };

export type WorkerReply = WorkerResponse & { id?: number };

/**
 * Unsolicited worker messages — emitted without a request `id`, never correlated
 * to a pending request. Only `log` today; kept distinct from request replies so
 * the dispatcher routes these immediately instead of probing the pending map.
 */
export type WorkerNotification = WorkerLogEntry;

/**
 * Runtime map from each request type to the reply type it pairs with, and the
 * type derived from it. `callWorker` looks up the expected reply from the
 * request, so callers can't pass a mismatched literal (e.g. `{ type:
 * "sync_snapshot" }` paired with `"compile_done"`). This is the single source of
 * truth for the request→reply pairing.
 */
export const REQUEST_REPLY_TYPES = {
    init: "init_done",
    reset_fonts: "reset_fonts_done",
    load_fonts: "load_fonts_done",
    sync_snapshot: "sync_done",
    sync_events: "sync_done",
    compile: "compile_done",
    bootstrap: "bootstrap_done",
    render_page: "render_done",
    render_svg_page: "render_svg_done",
    render_png_page: "render_png_done",
    render_resource_svg_page: "render_resource_svg_done",
    render_region: "render_region_done",
    render_resource_region: "render_resource_region_done",
    write_file: "write_file_done",
    write_files: "write_files_done",
    write_source: "write_source_done",
    apply_patch: "apply_patch_done",
    jump_from_click: "jump_done",
    positions_for_focus: "positions_done",
    export_pdf: "export_pdf_done",
    export_png_pages: "export_png_pages_done",
    export_svg_pages: "export_svg_pages_done",
} satisfies Record<WorkerRequest["type"], WorkerResponse["type"]>;

export type RequestReplyMap = typeof REQUEST_REPLY_TYPES;
