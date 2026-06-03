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
    RenderPagePayload,
    RenderSvgPagePayload,
    VfsFileEntry,
} from "./compilerProtocol";
import {
    callWorker,
    callWorkerOn,
    getWorker,
    loadDocumentFontsLazy,
    resetDocumentFontsCache,
} from "./compilerWorker";

export {
    getWorker,
    loadDocumentFontsLazy,
    resetDocumentFontsCache,
    warmupCompiler,
} from "./compilerWorker";

export const CompilerClient = {
    async syncSnapshot(ast: DocumentAST): Promise<DocumentSessionStatus> {
        const reply = await callWorker(
            { type: "sync_snapshot", payload: ast },
            "sync_done",
        );
        return reply.status;
    },

    async syncEvents(
        events: DocumentEvent[],
    ): Promise<DocumentSessionStatus> {
        const reply = await callWorker(
            { type: "sync_events", payload: events },
            "sync_done",
        );
        return reply.status;
    },

    async compile(
        ast: DocumentAST,
        svgPageIndices: number[] = [],
    ): Promise<CompilationResult> {
        // Keyed + coalesced: a no-op when the font set is unchanged, but a
        // mid-session font change loads the new font before this render so the
        // change actually takes effect (bootstrap alone won't, it's per-session).
        await loadDocumentFontsLazy(ast);
        const reply = await callWorker(
            { type: "compile", payload: { svgPageIndices } },
            "compile_done",
        );
        return reply.result;
    },

    async bootstrap(
        payload: BootstrapPreviewPayload,
    ): Promise<BootstrapPreviewResult> {
        resetDocumentFontsCache();
        const worker = await getWorker();
        await callWorkerOn(worker, { type: "reset_fonts" }, "reset_fonts_done");
        try {
            await loadDocumentFontsLazy(payload.ast);
        } catch {
            // Preview with bundled Typst fonts only.
        }
        const reply = await callWorkerOn(
            worker,
            { type: "bootstrap", payload },
            "bootstrap_done",
        );
        return reply.payload;
    },

    async writeFiles(files: VfsFileEntry[]): Promise<void> {
        await callWorker({ type: "write_files", payload: files }, "write_files_done");
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

    async renderSvgPage(
        pageIndex: number,
        requestId: number,
    ): Promise<RenderSvgPagePayload> {
        const reply = await callWorker(
            {
                type: "render_svg_page",
                payload: { pageIndex, requestId },
            },
            "render_svg_done",
        );
        return reply.payload;
    },

    async renderResourceSvgPage(
        pageNumber: number,
        requestId: number,
    ): Promise<RenderSvgPagePayload> {
        const reply = await callWorker(
            {
                type: "render_resource_svg_page",
                payload: { pageNumber, requestId },
            },
            "render_resource_svg_done",
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
