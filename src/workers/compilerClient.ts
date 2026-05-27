import type { DocumentAST } from "../bindings/DocumentAST";
import type { DocumentSessionStatus } from "../bindings/DocumentSessionStatus";
import type { CompilationResult } from "../bindings/CompilationResult";
import type { DocumentEvent } from "../bindings/DocumentEvent";
import type { PreviewJumpResult } from "../bindings/PreviewJumpResult";
import type { PreviewFocusTarget } from "../bindings/PreviewFocusTarget";
import type { PreviewElementPositionsResult } from "../bindings/PreviewElementPositionsResult";
import type {
    BootstrapPreviewPayload,
    BootstrapPreviewResult,
    RenderCanvasPayload,
    RenderPagePayload,
    VfsFileEntry,
} from "./compilerProtocol";
import {
    callWorker,
    loadDocumentFontsLazy,
} from "./compilerWorker";

export { getWorker, loadDocumentFontsLazy, warmupCompiler } from "./compilerWorker";

export const CompilerClient = {
    async syncSnapshot(ast: DocumentAST): Promise<DocumentSessionStatus> {
        void loadDocumentFontsLazy(ast);
        const reply = await callWorker(
            { type: "sync_snapshot", payload: ast },
            "sync_done",
        );
        return reply.status;
    },

    async syncEvents(
        ast: DocumentAST,
        events: DocumentEvent[],
    ): Promise<DocumentSessionStatus> {
        void loadDocumentFontsLazy(ast);
        const reply = await callWorker(
            { type: "sync_events", payload: events },
            "sync_done",
        );
        return reply.status;
    },

    async compile(ast: DocumentAST): Promise<CompilationResult> {
        void loadDocumentFontsLazy(ast);
        const reply = await callWorker({ type: "compile" }, "compile_done");
        return reply.result;
    },

    async bootstrap(
        payload: BootstrapPreviewPayload,
    ): Promise<BootstrapPreviewResult> {
        void loadDocumentFontsLazy(payload.ast);
        const reply = await callWorker(
            { type: "bootstrap", payload },
            "bootstrap_done",
        );
        return reply.payload;
    },

    async writeFiles(files: VfsFileEntry[]): Promise<void> {
        await callWorker({ type: "write_files", payload: files }, "write_files_done");
    },

    async attachCanvas(canvasId: string, canvas: OffscreenCanvas): Promise<void> {
        await callWorker(
            { type: "attach_canvas", payload: { canvasId, canvas } },
            "canvas_attached",
            [canvas],
        );
    },

    async detachCanvas(canvasId: string): Promise<void> {
        await callWorker(
            { type: "detach_canvas", payload: { canvasId } },
            "canvas_detached",
        );
    },

    async renderPageToCanvas(
        canvasId: string,
        pageIndex: number,
        pixelPerPt: number,
        requestId: number,
    ): Promise<RenderCanvasPayload> {
        const reply = await callWorker(
            {
                type: "render_page_to_canvas",
                payload: { canvasId, pageIndex, pixelPerPt, requestId },
            },
            "canvas_render_done",
        );
        return reply.payload;
    },

    async renderResourcePageToCanvas(
        canvasId: string,
        pageNumber: number,
        pixelPerPt: number,
        requestId: number,
    ): Promise<RenderCanvasPayload> {
        const reply = await callWorker(
            {
                type: "render_resource_page_to_canvas",
                payload: { canvasId, pageNumber, pixelPerPt, requestId },
            },
            "canvas_render_done",
        );
        return reply.payload;
    },

    async renderPage(
        pageIndex: number,
        pixelPerPt: number,
        requestId: number,
    ): Promise<RenderPagePayload> {
        const reply = await callWorker(
            {
                type: "render_page",
                payload: { pageIndex, pixelPerPt, requestId },
            },
            "render_done",
        );
        return reply.payload;
    },

    async renderResourcePage(
        pageNumber: number,
        pixelPerPt: number,
        requestId: number,
    ): Promise<RenderPagePayload> {
        const reply = await callWorker(
            {
                type: "render_resource_page",
                payload: { pageNumber, pixelPerPt, requestId },
            },
            "render_done",
        );
        return reply.payload;
    },

    async writeFile(path: string, bytes: Uint8Array): Promise<void> {
        await callWorker({ type: "write_file", payload: { path, bytes } }, "write_file_done");
    },

    async writeSource(path: string, text: string): Promise<void> {
        await callWorker({ type: "write_source", payload: { path, text } }, "write_source_done");
    },

    async applyPatch(
        path: string,
        start: number,
        end: number,
        text: string,
    ): Promise<void> {
        await callWorker(
            { type: "apply_patch", payload: { path, start, end, text } },
            "apply_patch_done",
        );
    },

    async jumpFromClick(
        pageNumber: number,
        xPt: number,
        yPt: number,
        sourceRevision: number,
    ): Promise<PreviewJumpResult> {
        const reply = await callWorker(
            {
                type: "jump_from_click",
                payload: { pageNumber, xPt, yPt, sourceRevision },
            },
            "jump_done",
        );
        return reply.result;
    },

    async positionsForFocus(
        target: PreviewFocusTarget,
        sourceRevision: number,
    ): Promise<PreviewElementPositionsResult> {
        const reply = await callWorker(
            {
                type: "positions_for_focus",
                payload: { target, sourceRevision },
            },
            "positions_done",
        );
        return reply.result;
    },

    async exportPdf(ast: DocumentAST): Promise<Uint8Array> {
        await loadDocumentFontsLazy(ast);
        const reply = await callWorker({ type: "export_pdf" }, "export_pdf_done");
        return reply.bytes;
    },

    async exportPngPages(
        ast: DocumentAST,
        pixelPerPt: number,
    ): Promise<Uint8Array[]> {
        await loadDocumentFontsLazy(ast);
        const reply = await callWorker(
            { type: "export_png_pages", payload: { pixelPerPt } },
            "export_png_pages_done",
        );
        return reply.pages;
    },

    async exportSvgPages(ast: DocumentAST): Promise<string[]> {
        await loadDocumentFontsLazy(ast);
        const reply = await callWorker(
            { type: "export_svg_pages" },
            "export_svg_pages_done",
        );
        return reply.pages;
    },
};
