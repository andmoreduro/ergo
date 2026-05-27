# Direct OffscreenCanvas Render Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move preview and resource thumbnail bitmap painting into the WASM worker through transferred `OffscreenCanvas` ownership while preserving DOM layout, preview clicks, caret overlay, resource thumbnail behavior, and a main-thread canvas fallback.

**Architecture:** The DOM keeps `<canvas>` elements for layout, click coordinate conversion, datasets, and overlay positioning. Each canvas is transferred once to the worker when browser support exists; after that, render requests identify the canvas by a stable `canvasId`, and the worker paints pixels directly after `ergo-engine-wasm` rasterization. Unsupported environments continue through the current `RenderPagePayload` path.

**Tech Stack:** React 18, TypeScript, Vite web workers, `OffscreenCanvas`, Vitest/jsdom, `ergo-engine-wasm`, Typst rasterization via `typst_render`.

---

## File Structure

- Modify `src/workers/compilerProtocol.ts`: add canvas attach/detach/render message types and a pixel-free `RenderCanvasPayload`.
- Modify `src/workers/compilerWorker.ts`: allow `callWorker` and `callWorkerOn` to accept transfer lists.
- Modify `src/workers/compilerClient.ts`: expose `attachCanvas`, `detachCanvas`, `renderPageToCanvas`, and `renderResourcePageToCanvas`; keep `renderPage` and `renderResourcePage` as fallback APIs.
- Create `src/workers/workerCanvasRegistry.ts`: worker-local canvas map and paint helper, isolated for unit testing.
- Create `src/workers/workerCanvasRegistry.test.ts`: test canvas attach, paint, stale missing-canvas errors, and detach behavior without booting the real worker.
- Modify `src/workers/compiler.worker.ts`: handle new canvas messages and use `workerCanvasRegistry` to paint main/resource page images in the worker.
- Modify `src/hooks/useTypstCanvasPage.ts`: transfer canvases once, choose OffscreenCanvas rendering when available, preserve fallback `putImageData`, and keep DOM canvas sizing/datasets current.
- Modify `src/hooks/useTypstCanvasPage.test.tsx`: add coverage for attach-once rendering, fallback rendering, stale request handling, and detach on unmount.
- Modify `src/components/layout/Preview/Preview.tsx`: pass OffscreenCanvas renderer callbacks for main preview pages.
- Modify `src/components/layout/Sidebar/SidebarResources.tsx`: pass OffscreenCanvas renderer callbacks for resource thumbnails.
- Modify `src/components/layout/Preview/Preview.test.tsx` and `src/components/layout/Sidebar/Sidebar.test.tsx`: update compiler mocks for the new optional worker-canvas APIs.
- Update `context/component-diagram.md`, `context/sequence-diagrams.md`, and `context/state-diagrams.md`: describe worker-owned canvas painting and fallback boundaries as stable architecture.

## Commit Plan

1. Protocol + transfer support.
2. Worker canvas registry + worker/client APIs.
3. Hook refactor with fallback and tests.
4. Preview/sidebar wiring and integration test updates.
5. Context docs and final verification.

## Task 1: Protocol And Transfer Support

**Files:**
- Modify `src/workers/compilerProtocol.ts`
- Modify `src/workers/compilerWorker.ts`

- [ ] **Step 1: Add protocol types and expected replies**

Add these shapes to `WorkerRequest`, `WorkerResponse`, and exported payload types in `src/workers/compilerProtocol.ts`:

```ts
export type CanvasRenderPayload = {
    canvasId: string;
    requestId: number;
    pixelPerPt: number;
};

export type RenderMainPageToCanvasPayload = CanvasRenderPayload & {
    pageIndex: number;
};

export type RenderResourcePageToCanvasPayload = CanvasRenderPayload & {
    pageNumber: number;
};

export type RenderCanvasPayload = {
    pageIndex: number;
    width: number;
    height: number;
    requestId: number;
};
```

Extend `WorkerRequest`:

```ts
| {
      type: "attach_canvas";
      payload: { canvasId: string; canvas: OffscreenCanvas };
  }
| { type: "detach_canvas"; payload: { canvasId: string } }
| {
      type: "render_page_to_canvas";
      payload: RenderMainPageToCanvasPayload;
  }
| {
      type: "render_resource_page_to_canvas";
      payload: RenderResourcePageToCanvasPayload;
  }
```

Extend `WorkerResponse`:

```ts
| { type: "canvas_attached" }
| { type: "canvas_detached" }
| { type: "canvas_render_done"; payload: RenderCanvasPayload }
```

- [ ] **Step 2: Add transfer list support**

Change `callWorkerOn` in `src/workers/compilerWorker.ts` from:

```ts
export async function callWorkerOn<T extends WorkerReply["type"]>(
    worker: Worker,
    request: WorkerRequest,
    expected: T,
): Promise<Extract<WorkerReply, { type: T }>> {
```

to:

```ts
export async function callWorkerOn<T extends WorkerReply["type"]>(
    worker: Worker,
    request: WorkerRequest,
    expected: T,
    transfer?: Transferable[],
): Promise<Extract<WorkerReply, { type: T }>> {
```

Then send:

```ts
const message: WorkerMessage = { ...request, id };
worker.postMessage(message, transfer ?? []);
```

Change `callWorker` to accept and forward the transfer list:

```ts
export async function callWorker<T extends WorkerReply["type"]>(
    request: WorkerRequest,
    expected: T,
    transfer?: Transferable[],
): Promise<Extract<WorkerReply, { type: T }>> {
    const worker = await getWorker();
    return callWorkerOn(worker, request, expected, transfer);
}
```

- [ ] **Step 3: Run focused TypeScript check through build**

Run:

```powershell
pnpm build
```

Expected: TypeScript accepts the new protocol and transfer signature. Vite may still build with old render behavior because the messages are not wired yet.

- [ ] **Step 4: Commit**

```powershell
git add src/workers/compilerProtocol.ts src/workers/compilerWorker.ts
git commit -m "Add OffscreenCanvas worker protocol"
```

## Task 2: Worker Canvas Registry

**Files:**
- Create `src/workers/workerCanvasRegistry.ts`
- Create `src/workers/workerCanvasRegistry.test.ts`
- Modify `src/workers/compiler.worker.ts`
- Modify `src/workers/compilerClient.ts`

- [ ] **Step 1: Write registry tests**

Create `src/workers/workerCanvasRegistry.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import {
    attachWorkerCanvas,
    detachWorkerCanvas,
    paintPageImageToWorkerCanvas,
    resetWorkerCanvasRegistryForTests,
} from "./workerCanvasRegistry";

class FakeOffscreenCanvas {
    width = 0;
    height = 0;
    readonly context = {
        imageSmoothingEnabled: true,
        putImageData: vi.fn(),
    };

    getContext(kind: string) {
        return kind === "2d" ? this.context : null;
    }
}

describe("workerCanvasRegistry", () => {
    it("attaches a canvas and paints page pixels into it", () => {
        resetWorkerCanvasRegistryForTests();
        const canvas = new FakeOffscreenCanvas();
        attachWorkerCanvas(
            "page-1",
            canvas as unknown as OffscreenCanvas,
        );

        const result = paintPageImageToWorkerCanvas("page-1", {
            width: 2,
            height: 1,
            pixels: new Uint8Array([0, 0, 0, 255, 255, 255, 255, 255]),
        });

        expect(result).toEqual({ width: 2, height: 1 });
        expect(canvas.width).toBe(2);
        expect(canvas.height).toBe(1);
        expect(canvas.context.imageSmoothingEnabled).toBe(false);
        expect(canvas.context.putImageData).toHaveBeenCalledTimes(1);
    });

    it("fails clearly when rendering to a detached canvas", () => {
        resetWorkerCanvasRegistryForTests();
        expect(() =>
            paintPageImageToWorkerCanvas("missing", {
                width: 1,
                height: 1,
                pixels: new Uint8Array([0, 0, 0, 0]),
            }),
        ).toThrow("No worker canvas attached for missing");
    });

    it("detaches canvases", () => {
        resetWorkerCanvasRegistryForTests();
        attachWorkerCanvas(
            "page-1",
            new FakeOffscreenCanvas() as unknown as OffscreenCanvas,
        );
        detachWorkerCanvas("page-1");
        expect(() =>
            paintPageImageToWorkerCanvas("page-1", {
                width: 1,
                height: 1,
                pixels: new Uint8Array([0, 0, 0, 0]),
            }),
        ).toThrow("No worker canvas attached for page-1");
    });
});
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```powershell
pnpm test -- src/workers/workerCanvasRegistry.test.ts
```

Expected: FAIL because `workerCanvasRegistry.ts` does not exist.

- [ ] **Step 3: Implement registry**

Create `src/workers/workerCanvasRegistry.ts`:

```ts
type PageImageLike = {
    width: number;
    height: number;
    pixels: Uint8Array;
};

const workerCanvases = new Map<
    string,
    {
        canvas: OffscreenCanvas;
        ctx: OffscreenCanvasRenderingContext2D;
    }
>();

export function attachWorkerCanvas(
    canvasId: string,
    canvas: OffscreenCanvas,
): void {
    const ctx = canvas.getContext("2d");
    if (!ctx) {
        throw new Error(`Worker canvas ${canvasId} does not support 2D rendering`);
    }

    workerCanvases.set(canvasId, { canvas, ctx });
}

export function detachWorkerCanvas(canvasId: string): void {
    workerCanvases.delete(canvasId);
}

export function paintPageImageToWorkerCanvas(
    canvasId: string,
    pageImage: PageImageLike,
): { width: number; height: number } {
    const entry = workerCanvases.get(canvasId);
    if (!entry) {
        throw new Error(`No worker canvas attached for ${canvasId}`);
    }

    entry.canvas.width = pageImage.width;
    entry.canvas.height = pageImage.height;
    entry.ctx.imageSmoothingEnabled = false;
    entry.ctx.putImageData(
        new ImageData(
            new Uint8ClampedArray(
                pageImage.pixels.buffer,
                pageImage.pixels.byteOffset,
                pageImage.pixels.byteLength,
            ),
            pageImage.width,
            pageImage.height,
        ),
        0,
        0,
    );

    return { width: pageImage.width, height: pageImage.height };
}

export function resetWorkerCanvasRegistryForTests(): void {
    workerCanvases.clear();
}
```

- [ ] **Step 4: Run registry test**

Run:

```powershell
pnpm test -- src/workers/workerCanvasRegistry.test.ts
```

Expected: PASS.

- [ ] **Step 5: Add client APIs**

In `src/workers/compilerClient.ts`, import `RenderCanvasPayload` and add:

```ts
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
```

- [ ] **Step 6: Wire worker messages**

In `src/workers/compiler.worker.ts`, import:

```ts
import {
    attachWorkerCanvas,
    detachWorkerCanvas,
    paintPageImageToWorkerCanvas,
} from "./workerCanvasRegistry";
```

Add switch cases:

```ts
case "attach_canvas": {
    attachWorkerCanvas(message.payload.canvasId, message.payload.canvas);
    reply({ type: "canvas_attached", id });
    break;
}
case "detach_canvas": {
    detachWorkerCanvas(message.payload.canvasId);
    reply({ type: "canvas_detached", id });
    break;
}
case "render_page_to_canvas": {
    if (!compiler) return;
    const { canvasId, pageIndex, pixelPerPt, requestId } = message.payload;
    const pageImage = compiler.render_page(pageIndex, pixelPerPt);
    const painted = paintPageImageToWorkerCanvas(canvasId, pageImage);
    reply({
        type: "canvas_render_done",
        payload: { pageIndex, ...painted, requestId },
        id,
    });
    break;
}
case "render_resource_page_to_canvas": {
    if (!compiler) return;
    const { canvasId, pageNumber, pixelPerPt, requestId } = message.payload;
    const pageImage = compiler.render_resource_page(pageNumber, pixelPerPt);
    const painted = paintPageImageToWorkerCanvas(canvasId, pageImage);
    reply({
        type: "canvas_render_done",
        payload: { pageIndex: pageNumber, ...painted, requestId },
        id,
    });
    break;
}
```

- [ ] **Step 7: Run worker-focused tests**

Run:

```powershell
pnpm test -- src/workers/workerCanvasRegistry.test.ts
pnpm build
```

Expected: tests pass and TypeScript accepts worker/client protocol.

- [ ] **Step 8: Commit**

```powershell
git add src/workers/compiler.worker.ts src/workers/compilerClient.ts src/workers/workerCanvasRegistry.ts src/workers/workerCanvasRegistry.test.ts
git commit -m "Render worker canvases through OffscreenCanvas"
```

## Task 3: Hook-Level OffscreenCanvas Fallback

**Files:**
- Modify `src/hooks/useTypstCanvasPage.ts`
- Modify `src/hooks/useTypstCanvasPage.test.tsx`

- [ ] **Step 1: Write failing hook tests**

Add a new `CanvasProbe` prop shape to `src/hooks/useTypstCanvasPage.test.tsx`:

```ts
type OffscreenRenderer = {
    attachCanvas: (canvasId: string, canvas: OffscreenCanvas) => Promise<void>;
    detachCanvas: (canvasId: string) => Promise<void>;
    renderPageToCanvas: (
        canvasId: string,
        requestId: number,
        pixelPerPt: number,
    ) => Promise<{
        requestId: number;
        width: number;
        height: number;
    }>;
};
```

Extend `CanvasProbe` to pass `offscreenRenderer` through `options`.

Add this test:

```ts
it("transfers a visible canvas once and renders future frames in the worker", async () => {
    const offscreen = {} as OffscreenCanvas;
    const transferControlToOffscreen = vi.fn(() => offscreen);
    Object.defineProperty(HTMLCanvasElement.prototype, "transferControlToOffscreen", {
        configurable: true,
        value: transferControlToOffscreen,
    });

    const offscreenRenderer: OffscreenRenderer = {
        attachCanvas: vi.fn(async () => undefined),
        detachCanvas: vi.fn(async () => undefined),
        renderPageToCanvas: vi.fn(async (_canvasId, requestId, pixelPerPt) => ({
            requestId,
            width: Math.round(100 * pixelPerPt),
            height: Math.round(140 * pixelPerPt),
        })),
    };
    const fallbackRenderPage = vi.fn();

    render(
        <CanvasProbe
            zoom={1}
            renderPage={fallbackRenderPage}
            offscreenRenderer={offscreenRenderer}
        />,
    );

    await act(async () => {
        await Promise.resolve();
        await vi.advanceTimersByTimeAsync(PREVIEW_ZOOM_RENDER_DEBOUNCE_DEFAULT_MS);
        await Promise.resolve();
    });

    expect(transferControlToOffscreen).toHaveBeenCalledTimes(1);
    expect(offscreenRenderer.attachCanvas).toHaveBeenCalledTimes(1);
    expect(offscreenRenderer.renderPageToCanvas).toHaveBeenCalledTimes(1);
    expect(fallbackRenderPage).not.toHaveBeenCalled();

    const canvas = document.querySelector("canvas")!;
    expect(canvas.dataset.pageWidthPt).toBe("100");
    expect(canvas.dataset.pageHeightPt).toBe("140");
});
```

Add fallback test:

```ts
it("uses main-thread putImageData when OffscreenCanvas transfer is unavailable", async () => {
    const renderPage = vi.fn(async (requestId: number, pixelPerPt: number) => ({
        requestId,
        width: Math.round(100 * pixelPerPt),
        height: Math.round(140 * pixelPerPt),
        pixels: new Uint8Array(
            Math.round(100 * pixelPerPt) * Math.round(140 * pixelPerPt) * 4,
        ),
    }));

    render(<CanvasProbe zoom={1} renderPage={renderPage} />);

    await act(async () => {
        await Promise.resolve();
        await vi.advanceTimersByTimeAsync(PREVIEW_ZOOM_RENDER_DEBOUNCE_DEFAULT_MS);
        await Promise.resolve();
    });

    expect(renderPage).toHaveBeenCalledTimes(1);
    expect(HTMLCanvasElement.prototype.getContext).toHaveBeenCalled();
});
```

Add detach test:

```ts
it("detaches transferred canvases on unmount", async () => {
    Object.defineProperty(HTMLCanvasElement.prototype, "transferControlToOffscreen", {
        configurable: true,
        value: vi.fn(() => ({} as OffscreenCanvas)),
    });
    const offscreenRenderer: OffscreenRenderer = {
        attachCanvas: vi.fn(async () => undefined),
        detachCanvas: vi.fn(async () => undefined),
        renderPageToCanvas: vi.fn(async (_canvasId, requestId) => ({
            requestId,
            width: 100,
            height: 140,
        })),
    };

    const { unmount } = render(
        <CanvasProbe
            zoom={1}
            renderPage={vi.fn()}
            offscreenRenderer={offscreenRenderer}
        />,
    );

    await act(async () => {
        await Promise.resolve();
        await vi.advanceTimersByTimeAsync(PREVIEW_ZOOM_RENDER_DEBOUNCE_DEFAULT_MS);
    });
    unmount();

    expect(offscreenRenderer.detachCanvas).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run hook tests and verify failure**

Run:

```powershell
pnpm test -- src/hooks/useTypstCanvasPage.test.tsx
```

Expected: FAIL because `useTypstCanvasPage` does not accept `offscreenRenderer`.

- [ ] **Step 3: Implement hook API**

In `src/hooks/useTypstCanvasPage.ts`, add:

```ts
type RenderCanvasResult = {
    requestId: number;
    width: number;
    height: number;
};

type OffscreenCanvasRenderer = {
    attachCanvas: (canvasId: string, canvas: OffscreenCanvas) => Promise<void>;
    detachCanvas: (canvasId: string) => Promise<void>;
    renderPageToCanvas: (
        canvasId: string,
        requestId: number,
        pixelPerPt: number,
    ) => Promise<RenderCanvasResult>;
};
```

Extend `options`:

```ts
offscreenRenderer?: OffscreenCanvasRenderer;
```

Add refs:

```ts
const canvasIdRef = useRef<string | null>(null);
const offscreenAttachedRef = useRef(false);
const offscreenFailedRef = useRef(false);
```

Use this helper:

```ts
const ensureOffscreenCanvas = useCallback(async () => {
    const canvas = canvasRef.current;
    const renderer = options?.offscreenRenderer;
    if (
        !canvas ||
        !renderer ||
        offscreenAttachedRef.current ||
        offscreenFailedRef.current ||
        typeof canvas.transferControlToOffscreen !== "function"
    ) {
        return null;
    }

    try {
        const canvasId =
            canvasIdRef.current ??
            `typst-canvas-${pageIndex}-${Math.random().toString(36).slice(2)}`;
        canvasIdRef.current = canvasId;
        const offscreen = canvas.transferControlToOffscreen();
        await renderer.attachCanvas(canvasId, offscreen);
        offscreenAttachedRef.current = true;
        return canvasId;
    } catch (error) {
        offscreenFailedRef.current = true;
        onErrorRef.current?.(error);
        return null;
    }
}, [options?.offscreenRenderer, pageIndex]);
```

In the render effect, choose:

```ts
const canvasId = await ensureOffscreenCanvas();
const result =
    canvasId && options?.offscreenRenderer
        ? await options.offscreenRenderer.renderPageToCanvas(
              canvasId,
              requestId,
              pixelPerPt,
          )
        : await renderPageRef.current(requestId, pixelPerPt);
```

If the result has `pixels`, keep `putTypstPageOnCanvas`. If it has no `pixels`, only set `canvas.width`, `canvas.height`, `setCanvasPageMetrics`, and `applyCanvasDisplaySize`.

Detach on unmount:

```ts
useEffect(() => {
    return () => {
        const canvasId = canvasIdRef.current;
        if (canvasId && offscreenAttachedRef.current) {
            void options?.offscreenRenderer?.detachCanvas(canvasId);
        }
    };
}, [options?.offscreenRenderer]);
```

- [ ] **Step 4: Run hook tests**

Run:

```powershell
pnpm test -- src/hooks/useTypstCanvasPage.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/hooks/useTypstCanvasPage.ts src/hooks/useTypstCanvasPage.test.tsx
git commit -m "Use OffscreenCanvas from preview canvas hook"
```

## Task 4: Preview And Sidebar Wiring

**Files:**
- Modify `src/components/layout/Preview/Preview.tsx`
- Modify `src/components/layout/Sidebar/SidebarResources.tsx`
- Modify `src/components/layout/Preview/Preview.test.tsx`
- Modify `src/components/layout/Sidebar/Sidebar.test.tsx`

- [ ] **Step 1: Update test mocks**

In both preview and sidebar tests, add no-op mocks:

```ts
attachCanvas: vi.fn(),
detachCanvas: vi.fn(),
renderPageToCanvas: vi.fn(),
renderResourcePageToCanvas: vi.fn(),
```

Add a preview test in `src/components/layout/Preview/Preview.test.tsx`:

```ts
it("passes main preview pages to worker-owned canvas rendering when supported", async () => {
    Object.defineProperty(HTMLCanvasElement.prototype, "transferControlToOffscreen", {
        configurable: true,
        value: vi.fn(() => ({} as OffscreenCanvas)),
    });
    compilerClientMock.attachCanvas.mockResolvedValue(undefined);
    compilerClientMock.renderPageToCanvas.mockResolvedValue({
        pageIndex: 0,
        width: 100,
        height: 50,
        requestId: 1,
    });

    await renderPreviewAndGetCanvas();

    await waitFor(() => {
        expect(compilerClientMock.attachCanvas).toHaveBeenCalledTimes(1);
        expect(compilerClientMock.renderPageToCanvas).toHaveBeenCalledWith(
            expect.any(String),
            0,
            expect.any(Number),
            expect.any(Number),
        );
    });
});
```

Add a sidebar test in `src/components/layout/Sidebar/Sidebar.test.tsx` for resource thumbnails:

```ts
it("renders resource thumbnails through worker-owned canvas when supported", async () => {
    Object.defineProperty(HTMLCanvasElement.prototype, "transferControlToOffscreen", {
        configurable: true,
        value: vi.fn(() => ({} as OffscreenCanvas)),
    });
    compilerClientMock.attachCanvas.mockResolvedValue(undefined);
    compilerClientMock.renderResourcePageToCanvas.mockResolvedValue({
        pageIndex: 1,
        width: 80,
        height: 40,
        requestId: 1,
    });

    const resources = {
        groups: [
            {
                kind: "equation",
                label: "Equations",
                entries: [
                    {
                        id: "equation-1",
                        kind: "equation",
                        label: "Equation",
                        subtitle: "E = mc^2",
                        reference_token: "@ergo-equation-1",
                        source_element_id: "equation-1",
                        asset_id: null,
                        preview: {
                            status: "ready" as const,
                            path: null,
                            page_number: 1,
                            content: null,
                            diagnostic: null,
                        },
                    },
                ],
            },
        ],
    };

    render(
        <DocumentProvider>
            <Sidebar
                previewRevision={8}
                mainPreviewPaintedRevision={8}
                resourcePreviewRevisions={{ "equation-1": 8 }}
                resources={resources}
                previewZoomRenderDebounceMs={0}
            />
        </DocumentProvider>,
    );

    await waitFor(() => {
        expect(compilerClientMock.renderResourcePageToCanvas).toHaveBeenCalled();
    });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```powershell
pnpm test -- src/components/layout/Preview/Preview.test.tsx src/components/layout/Sidebar/Sidebar.test.tsx
```

Expected: FAIL because components do not pass `offscreenRenderer` yet.

- [ ] **Step 3: Wire main preview**

In `src/components/layout/Preview/Preview.tsx`, change the `useTypstCanvasPage` call options to include:

```tsx
offscreenRenderer: {
    attachCanvas: CompilerClient.attachCanvas,
    detachCanvas: CompilerClient.detachCanvas,
    renderPageToCanvas: (canvasId, requestId, pixelPerPt) =>
        CompilerClient.renderPageToCanvas(
            canvasId,
            pageIndex,
            pixelPerPt,
            requestId,
        ),
},
```

Keep the existing fallback render callback:

```tsx
(requestId, pixelPerPt) =>
    CompilerClient.renderPage(pageIndex, pixelPerPt, requestId)
```

- [ ] **Step 4: Wire resource previews**

In `src/components/layout/Sidebar/SidebarResources.tsx`, add:

```tsx
offscreenRenderer: {
    attachCanvas: CompilerClient.attachCanvas,
    detachCanvas: CompilerClient.detachCanvas,
    renderPageToCanvas: (canvasId, requestId, pixelPerPt) =>
        CompilerClient.renderResourcePageToCanvas(
            canvasId,
            pageNumber,
            pixelPerPt,
            requestId,
        ),
},
```

Keep the existing `CompilerClient.renderResourcePage(...)` callback as fallback.

- [ ] **Step 5: Run component tests**

Run:

```powershell
pnpm test -- src/components/layout/Preview/Preview.test.tsx src/components/layout/Sidebar/Sidebar.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/components/layout/Preview/Preview.tsx src/components/layout/Sidebar/SidebarResources.tsx src/components/layout/Preview/Preview.test.tsx src/components/layout/Sidebar/Sidebar.test.tsx
git commit -m "Wire preview canvases to worker rendering"
```

## Task 5: Context Docs

**Files:**
- Modify `context/component-diagram.md`
- Modify `context/sequence-diagrams.md`
- Modify `context/state-diagrams.md`

- [ ] **Step 1: Update component diagram notes**

In `context/component-diagram.md`, update the WASM worker component note to state:

```md
- **Preview Engine** wraps `DocumentSession`, `preview_pipeline`, dual `ErgoWorld` instances (main + resource previews with comemo), `PreviewSyncState`, and worker-owned preview canvas painting when `OffscreenCanvas` is supported.
```

Add a frontend note:

```md
- **Canvas Preview** owns DOM layout, viewport observation, click coordinate conversion, and caret overlays; the worker owns bitmap painting for transferred canvases, with a main-thread canvas fallback.
```

- [ ] **Step 2: Update sequence diagram**

In `context/sequence-diagrams.md` §1, replace:

```md
Preview->>Worker: render_page for viewport pages
Preview-->>User: Canvas preview update
```

with:

```md
Preview->>Worker: attach_canvas once per DOM canvas
Preview->>Worker: render_page_to_canvas for viewport pages
Worker-->>Preview: page metrics
Preview-->>User: Canvas preview update
```

Add note:

```md
- Supported WebViews transfer preview canvases to the WASM worker for bitmap painting. Unsupported environments use `render_page` and main-thread `putImageData`.
```

- [ ] **Step 3: Update state diagram**

In `context/state-diagrams.md` §4, add:

```md
    Waiting --> CanvasAttached : OffscreenCanvas supported
    CanvasAttached --> Rasterizing : page enters viewport
```

Add stable note:

```md
Worker-owned canvases paint pixels in the WASM worker and return page metrics to React. DOM canvas elements still provide layout metrics for click mapping and caret overlays.
```

- [ ] **Step 4: Commit**

```powershell
git add context/component-diagram.md context/sequence-diagrams.md context/state-diagrams.md
git commit -m "Document worker-owned canvas rendering"
```

## Task 6: Final Verification

**Files:**
- No new source changes expected unless verification exposes failures.

- [ ] **Step 1: Run focused tests**

Run:

```powershell
pnpm test -- src/workers/workerCanvasRegistry.test.ts src/hooks/useTypstCanvasPage.test.tsx src/components/layout/Preview/Preview.test.tsx src/components/layout/Sidebar/Sidebar.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run full frontend tests**

Run:

```powershell
pnpm test
```

Expected: PASS.

- [ ] **Step 3: Run frontend build**

Run:

```powershell
pnpm build
```

Expected: PASS. This validates worker bundling and TypeScript `OffscreenCanvas` types.

- [ ] **Step 4: Run Rust tests**

Run:

```powershell
cd src-tauri
cargo nextest run
```

Expected: PASS. No Rust behavior should change, but this guards generated WASM package interactions.

- [ ] **Step 5: Check whitespace**

Run:

```powershell
git diff --check
```

Expected: no whitespace errors.

- [ ] **Step 6: Manual validation**

Run the app manually:

```powershell
pnpm tauri dev
```

Validate:
- Opening a project renders the first visible preview page.
- Scrolling renders newly visible pages.
- Zooming changes CSS size immediately and rasterizes after the configured debounce.
- Preview click still focuses the matching editor field.
- Blue caret overlay remains aligned with rendered content.
- Resource thumbnails render after the main preview paint gate.
- Browser environments without `transferControlToOffscreen` still render through `putImageData`.

- [ ] **Step 7: Final commit**

If verification required fixes:

```powershell
git add <changed-files>
git commit -m "Stabilize worker canvas rendering"
```

If no fixes were required, do not create an empty commit.

## Self-Review

- Spec coverage: The plan moves bitmap painting into the worker, preserves DOM overlay/click behavior, keeps a fallback, covers resource thumbnails, and updates architecture docs.
- Placeholder scan: No implementation step uses undefined placeholder markers; each code-bearing step names exact files and APIs.
- Type consistency: `RenderCanvasPayload`, `attachCanvas`, `detachCanvas`, `renderPageToCanvas`, and `renderResourcePageToCanvas` are named consistently across protocol, client, worker, and hook tasks.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-27-direct-offscreen-canvas-render.md`. Two execution options:

1. Subagent-Driven (recommended) - dispatch a fresh subagent per task, review between tasks, fast iteration.
2. Inline Execution - execute tasks in this session using executing-plans, batch execution with checkpoints.
