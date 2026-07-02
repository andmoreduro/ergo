import { useCallback, useMemo, useState } from "react";
import type { ActionInvocation } from "../../../bindings/ActionInvocation";
import type { ActionId } from "../../../bindings/ActionId";
import type { ExportFormat } from "../../../bindings/ExportFormat";
import { IconButton } from "../../atoms/IconButton/IconButton";
import { MenuItemButton } from "../../atoms/MenuItemButton/MenuItemButton";
import { TextInput } from "../../atoms/TextInput/TextInput";
import { ToolbarTextButton } from "../../atoms/ToolbarTextButton/ToolbarTextButton";
import { Toolbar, ToolbarSpacer } from "../../molecules/Toolbar/Toolbar";
import { DropdownMenu } from "../../molecules/DropdownMenu/DropdownMenu";
import {
    ArrowDownload24Regular,
    ChevronDown24Regular,
    ZoomIn24Regular,
    ZoomOut24Regular,
} from "@fluentui/react-icons";
import { m } from "../../../paraglide/messages.js";
import styles from "./Preview.module.css";

const EXPORT_FORMATS: ExportFormat[] = ["pdf", "png", "svg"];

const EXPORT_ACTION_ID: Record<ExportFormat, ActionId> = {
    pdf: "workspace::ExportPdf",
    png: "workspace::ExportPng",
    svg: "workspace::ExportSvg",
};

const exportFormatLabel = (format: ExportFormat): string => {
    switch (format) {
        case "pdf":
            return m.export_format_pdf();
        case "png":
            return m.export_format_png();
        case "svg":
            return m.export_format_svg();
    }
};

export interface PreviewToolbarProps {
    canZoomIn: boolean;
    canZoomOut: boolean;
    /** Display percent (already formatted) for the current zoom level. */
    zoomPercent: number;
    /** Label shown on the zoom trigger — varies by fit mode vs. manual. */
    zoomLabel: string;
    /** Apply a manual zoom value (0..1). Closes the zoom menu and switches mode. */
    applyManualZoom: (value: number) => void;
    dispatchAction: (invocation: ActionInvocation) => Promise<boolean>;
}

/**
 * Zoom and export controls for the preview pane. The zoom *model* (effective
 * zoom, fit-to-page math, manual-equivalent clamp) stays in Preview, which also
 * feeds `effectiveZoom` into page rendering; this component owns only the
 * toolbar interaction surface — the dropdowns, the editable zoom field, and the
 * export menu — plus the transient UI state those need.
 */
export const PreviewToolbar = ({
    canZoomIn,
    canZoomOut,
    zoomPercent,
    zoomLabel,
    applyManualZoom,
    dispatchAction,
}: PreviewToolbarProps) => {
    const [isZoomMenuOpen, setZoomMenuOpen] = useState(false);
    const [isExportMenuOpen, setExportMenuOpen] = useState(false);
    const [isEditingZoom, setEditingZoom] = useState(false);
    const [zoomDraft, setZoomDraft] = useState(String(zoomPercent));
    const zoomOptions = useMemo(
        () =>
            Array.from({ length: 26 }, (_, index) => {
                const percent = 50 + index * 10;
                return { percent, value: percent / 100 };
            }),
        [],
    );

    const commitZoomDraft = useCallback(() => {
        const percent = Number(zoomDraft);
        if (!Number.isFinite(percent)) {
            setEditingZoom(false);
            return;
        }
        applyManualZoom(percent / 100);
        setEditingZoom(false);
    }, [applyManualZoom, zoomDraft]);

    return (
        <Toolbar onClick={(event) => event.stopPropagation()}>
            <IconButton
                tabIndex={-1}
                title={m.menubar_zoom_out()}
                aria-label={m.menubar_zoom_out()}
                disabled={!canZoomOut}
                onClick={() => {
                    void dispatchAction({ id: "view::ZoomOut", payload: null });
                }}
            >
                <ZoomOut24Regular />
            </IconButton>
            <div className={styles.zoomMenuRoot}>
                {isEditingZoom ? (
                    <TextInput
                        autoFocus
                        aria-label={m.preview_zoom_custom()}
                        variant="toolbarZoom"
                        inputMode="decimal"
                        type="number"
                        value={zoomDraft}
                        onBlur={commitZoomDraft}
                        onChange={(event) => setZoomDraft(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === "Enter") {
                                commitZoomDraft();
                            }
                            if (event.key === "Escape") {
                                setEditingZoom(false);
                            }
                        }}
                    />
                ) : (
                    <DropdownMenu
                        align="center"
                        menuLabel={m.preview_zoom_options()}
                        open={isZoomMenuOpen}
                        onOpenChange={setZoomMenuOpen}
                        trigger={
                            <ToolbarTextButton
                                tabIndex={-1}
                                variant="zoom"
                                title={m.preview_zoom_options()}
                                aria-label={m.preview_zoom_options()}
                                onDoubleClick={() => {
                                    setZoomDraft(String(zoomPercent));
                                    setZoomMenuOpen(false);
                                    setEditingZoom(true);
                                }}
                            >
                                {zoomLabel}
                            </ToolbarTextButton>
                        }
                    >
                        <MenuItemButton
                            role="menuitem"
                            variant="dropdown"
                            onClick={() => {
                                void dispatchAction({
                                    id: "view::FitWidth",
                                    payload: null,
                                });
                                setZoomMenuOpen(false);
                            }}
                        >
                            {m.preview_zoom_fit_width()}
                        </MenuItemButton>
                        <MenuItemButton
                            role="menuitem"
                            variant="dropdown"
                            onClick={() => {
                                void dispatchAction({
                                    id: "view::FitHeight",
                                    payload: null,
                                });
                                setZoomMenuOpen(false);
                            }}
                        >
                            {m.preview_zoom_fit_height()}
                        </MenuItemButton>
                        {zoomOptions.map((option) => (
                            <MenuItemButton
                                key={option.percent}
                                role="menuitem"
                                variant="dropdown"
                                onClick={() => applyManualZoom(option.value)}
                            >
                                {m.preview_zoom_level({
                                    percent: option.percent,
                                })}
                            </MenuItemButton>
                        ))}
                    </DropdownMenu>
                )}
            </div>
            <IconButton
                tabIndex={-1}
                title={m.menubar_zoom_in()}
                aria-label={m.menubar_zoom_in()}
                disabled={!canZoomIn}
                onClick={() => {
                    void dispatchAction({ id: "view::ZoomIn", payload: null });
                }}
            >
                <ZoomIn24Regular />
            </IconButton>
            <ToolbarSpacer />
            <DropdownMenu
                align="end"
                open={isExportMenuOpen}
                onOpenChange={setExportMenuOpen}
                trigger={
                    <ToolbarTextButton>
                        <ArrowDownload24Regular aria-hidden />
                        {m.menubar_export()}
                        <ChevronDown24Regular />
                    </ToolbarTextButton>
                }
            >
                {EXPORT_FORMATS.map((format) => (
                    <MenuItemButton
                        key={format}
                        role="menuitem"
                        variant="dropdown"
                        onClick={() => {
                            setExportMenuOpen(false);
                            void dispatchAction({
                                id: EXPORT_ACTION_ID[format],
                                payload: null,
                            });
                        }}
                    >
                        {exportFormatLabel(format)}
                    </MenuItemButton>
                ))}
            </DropdownMenu>
        </Toolbar>
    );
};
