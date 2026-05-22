use std::collections::hash_map::DefaultHasher;
use std::fmt::Write as FmtWrite;
use std::hash::Hasher;
use std::sync::Arc;

use typst::diag::{Severity, SourceDiagnostic};
use typst::layout::{Page, PagedDocument};

use crate::compilation_types::{
    CompilationJob, CompilationResult, CompilationStatus, ExportFormat, PreviewPageFile,
};
use crate::core_errors::CompileError;
use crate::document_outline::DocumentOutline;
use crate::path_utils::file_id_for_virtual_path;
use crate::vfs::VirtualFileSystem;
use crate::world::{ErgoWorld, SnapshotWorld, WorldSourceSnapshot};

pub(crate) fn result_for_job(job: &CompilationJob, status: CompilationStatus) -> CompilationResult {
    CompilationResult {
        job_id: job.job_id,
        kind: job.kind.clone(),
        source_revision: job.source_revision,
        status,
        preview_pages: None,
        export_path: None,
        diagnostics: Vec::new(),
        outline: None,
        resources: None,
    }
}

pub(crate) fn failed_result(job: &CompilationJob, message: String) -> CompilationResult {
    let mut result = result_for_job(job, CompilationStatus::Failed);
    result.diagnostics = vec![message];
    result
}

pub(crate) fn successful_preview_result(
    job: &CompilationJob,
    preview_dir: &str,
    preview_pages: Vec<PreviewPageFile>,
    outline: DocumentOutline,
    resources: crate::document_resources::DocumentResources,
) -> CompilationResult {
    let mut result = result_for_job(job, CompilationStatus::Succeeded);
    result.preview_pages = Some(preview_pages);
    result.export_path = Some(preview_dir.to_string());
    result.outline = Some(outline);
    result.resources = Some(resources);
    result
}

fn compile_document(vfs: Arc<VirtualFileSystem>) -> Result<PagedDocument, CompileError> {
    let world = ErgoWorld::new(vfs, file_id_for_virtual_path("main.typ"));

    match typst::compile::<PagedDocument>(&world).output {
        Ok(document) => Ok(document),
        Err(errors) => Err(CompileError::Operation(format_source_diagnostics(&errors))),
    }
}

pub(crate) fn compile_document_snapshot(
    vfs: &Arc<VirtualFileSystem>,
) -> Result<(PagedDocument, WorldSourceSnapshot), CompileError> {
    let source_snapshot = WorldSourceSnapshot::from_vfs(vfs);
    let world = SnapshotWorld::new(
        source_snapshot.clone(),
        file_id_for_virtual_path("main.typ"),
    );

    match typst::compile::<PagedDocument>(&world).output {
        Ok(document) => Ok((document, source_snapshot)),
        Err(errors) => Err(CompileError::Operation(format_source_diagnostics(&errors))),
    }
}

fn compile_svgs(vfs: Arc<VirtualFileSystem>) -> Result<Vec<String>, CompileError> {
    let document = compile_document(vfs)?;
    Ok(render_svgs(&document))
}

fn format_source_diagnostics(errors: &[SourceDiagnostic]) -> String {
    errors
        .iter()
        .map(format_source_diagnostic)
        .collect::<Vec<_>>()
        .join("\n")
}

fn format_source_diagnostic(error: &SourceDiagnostic) -> String {
    let severity = match error.severity {
        Severity::Error => "error",
        Severity::Warning => "warning",
    };
    let mut lines = vec![format!("{severity}: {}", error.message)];
    lines.extend(error.hints.iter().map(|hint| format!("hint: {hint}")));
    lines.join("\n")
}

pub(crate) fn render_svgs(document: &PagedDocument) -> Vec<String> {
    use rayon::prelude::*;
    document.pages.par_iter().map(typst_svg::svg).collect()
}

/// Feeds `fmt::Debug` output directly into a `Hasher` without allocating a String.
struct DebugHasher(DefaultHasher);

impl FmtWrite for DebugHasher {
    fn write_str(&mut self, s: &str) -> std::fmt::Result {
        self.0.write(s.as_bytes());
        Ok(())
    }
}

fn fingerprint_page(page: &Page) -> u64 {
    let mut hasher = DebugHasher(DefaultHasher::new());
    let _ = write!(hasher, "{:?}", page);
    hasher.0.finish()
}

struct CachedSvgPage {
    fingerprint: u64,
    svg: String,
}

/// Per-page SVG rendering cache that stores fingerprints and rendered SVG
/// strings to skip re-rendering unchanged pages across compilations.
pub(crate) struct SvgPageCache {
    entries: Vec<CachedSvgPage>,
}

impl SvgPageCache {
    pub fn new() -> Self {
        Self {
            entries: Vec::new(),
        }
    }
}

/// Renders SVGs only for pages whose content fingerprint changed since the
/// last compilation. Unchanged pages reuse their cached SVG strings.
pub(crate) fn render_svgs_incremental(
    document: &PagedDocument,
    cache: &mut SvgPageCache,
) -> Vec<String> {
    use rayon::prelude::*;

    // 1. Compute fingerprints for all pages (parallel, cheap)
    let fingerprints: Vec<u64> = document.pages.par_iter().map(fingerprint_page).collect();

    // 2. Identify which pages need re-rendering
    let needs_render: Vec<bool> = fingerprints
        .iter()
        .enumerate()
        .map(|(i, fp)| cache.entries.get(i).map_or(true, |e| e.fingerprint != *fp))
        .collect();

    // 3. Render only changed pages in parallel
    let rendered: Vec<Option<String>> = (0..document.pages.len())
        .into_par_iter()
        .map(|i| {
            if needs_render[i] {
                Some(typst_svg::svg(&document.pages[i]))
            } else {
                None
            }
        })
        .collect();

    // 4. Assemble: new SVGs for changed pages, cached for unchanged
    let mut old_entries: Vec<Option<CachedSvgPage>> = cache.entries.drain(..).map(Some).collect();

    let svgs: Vec<String> = rendered
        .into_iter()
        .enumerate()
        .map(|(i, opt)| {
            opt.unwrap_or_else(|| {
                old_entries
                    .get_mut(i)
                    .and_then(|slot| slot.take())
                    .map(|entry| entry.svg)
                    .unwrap_or_default()
            })
        })
        .collect();

    // 5. Rebuild cache
    cache.entries = fingerprints
        .into_iter()
        .zip(svgs.iter().cloned())
        .map(|(fingerprint, svg)| CachedSvgPage { fingerprint, svg })
        .collect();

    svgs
}

pub(crate) fn write_svg_pages(
    vfs: &VirtualFileSystem,
    directory: &str,
    svgs: &[String],
) -> Vec<PreviewPageFile> {
    let mut changed_pages = Vec::with_capacity(svgs.len());
    for (index, svg) in svgs.iter().enumerate() {
        let path = format!("{}/page-{}.svg", directory, index + 1);
        let svg_bytes = svg.as_bytes();
        let existing = vfs.read_file(&path).ok();
        let changed = existing.as_deref() != Some(svg_bytes);
        if changed || vfs.has_retained_source(&path) {
            vfs.write_file(&path, svg_bytes.to_vec());
        }
        changed_pages.push(changed);
    }

    let mut stale_page_number = svgs.len() + 1;
    loop {
        let stale_path = format!("{}/page-{}.svg", directory, stale_page_number);
        if !vfs.has_file(&stale_path) {
            break;
        }
        vfs.remove_path(&stale_path);
        stale_page_number += 1;
    }

    (0..svgs.len())
        .map(|index| PreviewPageFile {
            changed: changed_pages[index],
            page_number: index + 1,
            path: format!("{}/page-{}.svg", directory, index + 1),
        })
        .collect()
}

pub(crate) fn run_export_job(
    vfs: &Arc<VirtualFileSystem>,
    job: &CompilationJob,
    format: &ExportFormat,
) -> CompilationResult {
    match format {
        ExportFormat::Svg => match compile_svgs(Arc::clone(vfs)) {
            Ok(svgs) => {
                let export_dir = ".ergproj/exports/svg";
                write_svg_pages(vfs, export_dir, &svgs);

                let mut result = result_for_job(job, CompilationStatus::Succeeded);
                result.export_path = Some(export_dir.to_string());
                result
            }
            Err(error) => failed_result(job, error.to_string()),
        },
        ExportFormat::Pdf => match compile_document(Arc::clone(vfs)) {
            Ok(document) => match typst_pdf::pdf(&document, &typst_pdf::PdfOptions::default()) {
                Ok(bytes) => {
                    let export_path = ".ergproj/exports/document.pdf";
                    vfs.write_file(export_path, bytes);
                    let mut result = result_for_job(job, CompilationStatus::Succeeded);
                    result.export_path = Some(export_path.to_string());
                    result
                }
                Err(errors) => failed_result(job, format_source_diagnostics(&errors)),
            },
            Err(error) => failed_result(job, error.to_string()),
        },
        ExportFormat::Png => match compile_document(Arc::clone(vfs)) {
            Ok(document) => {
                let export_dir = ".ergproj/exports/png";
                for (index, page) in document.pages.iter().enumerate() {
                    let pixmap = typst_render::render(page, 2.0);
                    match pixmap.encode_png() {
                        Ok(bytes) => {
                            vfs.write_file(&format!("{}/page-{}.png", export_dir, index + 1), bytes)
                        }
                        Err(error) => return failed_result(job, error.to_string()),
                    }
                }

                let mut result = result_for_job(job, CompilationStatus::Succeeded);
                result.export_path = Some(export_dir.to_string());
                result
            }
            Err(error) => failed_result(job, error.to_string()),
        },
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use super::*;
    use crate::compilation_types::{CompilationJobKind, CompilationPriority};
    use crate::document_outline::{DocumentOutline, OutlineEntry};
    use crate::document_resources::{
        DocumentResources, ResourceEntry, ResourceGroup, ResourceKind, ResourcePreview,
        ResourcePreviewStatus,
    };
    use crate::document_session::DocumentSession;
    use crate::test_fixtures::basic_document_ast;

    fn preview_job() -> CompilationJob {
        CompilationJob {
            job_id: 42,
            kind: CompilationJobKind::PreviewSvg,
            priority: CompilationPriority::Preview,
            source_revision: 7,
        }
    }

    #[test]
    fn successful_preview_result_includes_outline() {
        let pages = vec![PreviewPageFile {
            changed: true,
            page_number: 1,
            path: ".ergproj/preview/svg/page-1.svg".to_string(),
        }];
        let outline = DocumentOutline {
            entries: vec![OutlineEntry {
                level: 2,
                text: "Method".to_string(),
                page: 1,
            }],
        };

        let result = successful_preview_result(
            &preview_job(),
            ".ergproj/preview/svg",
            pages.clone(),
            outline.clone(),
            DocumentResources::default(),
        );

        assert_eq!(result.status, CompilationStatus::Succeeded);
        assert_eq!(result.preview_pages, Some(pages));
        assert_eq!(result.export_path, Some(".ergproj/preview/svg".to_string()));
        assert_eq!(result.outline, Some(outline));
    }

    #[test]
    fn successful_preview_result_includes_resources() {
        let pages = vec![PreviewPageFile {
            changed: true,
            page_number: 1,
            path: ".ergproj/preview/svg/page-1.svg".to_string(),
        }];
        let outline = DocumentOutline { entries: vec![] };
        let resources = DocumentResources {
            groups: vec![ResourceGroup {
                kind: ResourceKind::Equation,
                label: "Equations".to_string(),
                entries: vec![ResourceEntry {
                    id: "equation-1".to_string(),
                    kind: ResourceKind::Equation,
                    label: "Equation".to_string(),
                    subtitle: None,
                    reference_token: "@ergo-equation-1".to_string(),
                    source_element_id: Some("equation-1".to_string()),
                    asset_id: None,
                    preview: ResourcePreview {
                        status: ResourcePreviewStatus::Ready,
                        path: Some(".ergproj/resource-previews/svg/equation-1.svg".to_string()),
                        diagnostic: None,
                    },
                }],
            }],
        };

        let result = successful_preview_result(
            &preview_job(),
            ".ergproj/preview/svg",
            pages,
            outline,
            resources.clone(),
        );

        assert_eq!(result.resources, Some(resources));
    }

    #[test]
    fn failed_preview_result_has_no_outline() {
        let result = failed_result(&preview_job(), "compile failed".to_string());

        assert_eq!(result.status, CompilationStatus::Failed);
        assert_eq!(result.diagnostics, vec!["compile failed"]);
        assert!(result.outline.is_none());
    }

    #[test]
    fn compiles_svg_from_multifile_vfs_sources() {
        let vfs = Arc::new(VirtualFileSystem::new());
        vfs.write_source(
            "main.typ",
            "#set page(paper: \"us-letter\")\n#include \"sections/content.typ\"\n".to_string(),
        );
        vfs.write_source(
            "sections/content.typ",
            "= Título\n\nTexto con ñ.\n".to_string(),
        );

        let svgs = compile_svgs(vfs).unwrap();

        assert!(!svgs.is_empty());
        assert!(svgs[0].contains("<svg"));
    }

    #[test]
    fn compile_errors_use_plain_diagnostics() {
        let vfs = Arc::new(VirtualFileSystem::new());
        vfs.write_source("main.typ", "#let =".to_string());

        let error = compile_svgs(vfs).unwrap_err().to_string();

        assert!(!error.contains("SourceDiagnostic"));
        assert!(!error.contains("Tracepoint"));
        assert!(!error.contains("hints:"));
        assert!(!error.trim().is_empty());
    }

    #[test]
    fn compiles_svg_from_document_session_sources() {
        let vfs = Arc::new(VirtualFileSystem::new());
        let session = DocumentSession::new(Arc::clone(&vfs));
        session
            .sync_snapshot(basic_document_ast("Título con ñ", "Resumen breve."))
            .unwrap();

        if let Ok(main_content) = vfs.read_file("main.typ") {
            println!(
                "=== main.typ ===\n{}",
                String::from_utf8(main_content).unwrap()
            );
        }
        if let Ok(abstract_content) = vfs.read_file("sections/abstract-page.typ") {
            println!(
                "=== abstract-page.typ ===\n{}",
                String::from_utf8(abstract_content).unwrap()
            );
        }

        let svgs = compile_svgs(vfs).unwrap();

        assert!(!svgs.is_empty());
        assert!(svgs[0].contains("<svg"));
    }

    #[test]
    fn incremental_svg_render_updates_when_page_text_changes() {
        let vfs = Arc::new(VirtualFileSystem::new());
        let mut cache = SvgPageCache::new();
        vfs.write_source("main.typ", "Alpha".to_string());

        let (first_document, _) = compile_document_snapshot(&vfs).unwrap();
        let first_cached = render_svgs_incremental(&first_document, &mut cache);

        vfs.write_source("main.typ", "Beta".to_string());
        let (second_document, _) = compile_document_snapshot(&vfs).unwrap();
        let second_fresh = render_svgs(&second_document);
        let second_cached = render_svgs_incremental(&second_document, &mut cache);

        assert_ne!(first_cached, second_fresh);
        assert_eq!(second_cached, second_fresh);
    }

    #[test]
    fn document_session_text_events_update_preview_svg_artifacts() {
        let vfs = Arc::new(VirtualFileSystem::new());
        let session = DocumentSession::new(Arc::clone(&vfs));
        let mut cache = SvgPageCache::new();

        session
            .sync_snapshot(basic_document_ast("Título con ñ", "Resumen breve."))
            .unwrap();
        let (first_document, _) = compile_document_snapshot(&vfs).unwrap();
        let first_svgs = render_svgs_incremental(&first_document, &mut cache);
        write_svg_pages(&vfs, ".ergproj/preview/svg", &first_svgs);
        let first_files = (1..=first_svgs.len())
            .map(|page_number| {
                vfs.read_file(&format!(".ergproj/preview/svg/page-{page_number}.svg"))
                    .unwrap()
            })
            .collect::<Vec<_>>();

        session
            .apply_event(
                crate::document_session_types::DocumentEvent::UpdateHeading {
                    element_id: "heading-1".to_string(),
                    text: Some("Método con ñ".to_string()),
                    level: None,
                },
            )
            .unwrap();
        let (second_document, _) = compile_document_snapshot(&vfs).unwrap();
        let second_svgs = render_svgs_incremental(&second_document, &mut cache);
        let pages = write_svg_pages(&vfs, ".ergproj/preview/svg", &second_svgs);
        let second_files = (1..=second_svgs.len())
            .map(|page_number| {
                vfs.read_file(&format!(".ergproj/preview/svg/page-{page_number}.svg"))
                    .unwrap()
            })
            .collect::<Vec<_>>();

        assert!(pages.iter().any(|page| page.changed));
        assert!(pages.iter().any(|page| {
            let index = page.page_number - 1;
            page.changed && first_files.get(index) != second_files.get(index)
        }));
    }

    #[test]
    fn document_session_title_input_events_update_preview_svg_artifacts() {
        let vfs = Arc::new(VirtualFileSystem::new());
        let session = DocumentSession::new(Arc::clone(&vfs));
        let mut cache = SvgPageCache::new();

        session
            .sync_snapshot(basic_document_ast("Título inicial", "Resumen breve."))
            .unwrap();
        let (first_document, _) = compile_document_snapshot(&vfs).unwrap();
        let first_svgs = render_svgs_incremental(&first_document, &mut cache);
        write_svg_pages(&vfs, ".ergproj/preview/svg", &first_svgs);
        let first_files = (1..=first_svgs.len())
            .map(|page_number| {
                vfs.read_file(&format!(".ergproj/preview/svg/page-{page_number}.svg"))
                    .unwrap()
            })
            .collect::<Vec<_>>();

        session
            .apply_event(crate::document_session_types::DocumentEvent::UpdateInput {
                path: "/title".to_string(),
                value: serde_json::json!("Título escrito"),
            })
            .unwrap();
        let (second_document, _) = compile_document_snapshot(&vfs).unwrap();
        let second_svgs = render_svgs_incremental(&second_document, &mut cache);
        let pages = write_svg_pages(&vfs, ".ergproj/preview/svg", &second_svgs);
        let second_files = (1..=second_svgs.len())
            .map(|page_number| {
                vfs.read_file(&format!(".ergproj/preview/svg/page-{page_number}.svg"))
                    .unwrap()
            })
            .collect::<Vec<_>>();

        assert!(pages.iter().any(|page| page.changed));
        assert!(pages.iter().any(|page| {
            let index = page.page_number - 1;
            page.changed && first_files.get(index) != second_files.get(index)
        }));
    }

    #[test]
    fn writes_preview_svg_pages_to_vfs_files() {
        let vfs = VirtualFileSystem::new();

        let pages = write_svg_pages(
            &vfs,
            ".ergproj/preview/svg",
            &["<svg>uno</svg>".to_string(), "<svg>dos</svg>".to_string()],
        );

        assert_eq!(
            pages,
            vec![
                PreviewPageFile {
                    changed: true,
                    page_number: 1,
                    path: ".ergproj/preview/svg/page-1.svg".to_string(),
                },
                PreviewPageFile {
                    changed: true,
                    page_number: 2,
                    path: ".ergproj/preview/svg/page-2.svg".to_string(),
                },
            ]
        );
        assert_eq!(
            vfs.read_file(".ergproj/preview/svg/page-1.svg").unwrap(),
            b"<svg>uno</svg>"
        );
        assert_eq!(
            vfs.read_file(".ergproj/preview/svg/page-2.svg").unwrap(),
            b"<svg>dos</svg>"
        );
        assert!(
            vfs.read_source(".ergproj/preview/svg/page-1.svg").is_err(),
            "preview SVG artifacts should not be retained as Typst Source values"
        );
    }

    #[test]
    fn marks_only_changed_preview_svg_files_without_retained_sources() {
        let vfs = VirtualFileSystem::new();

        write_svg_pages(
            &vfs,
            ".ergproj/preview/svg",
            &["<svg>uno</svg>".to_string(), "<svg>dos</svg>".to_string()],
        );
        let pages = write_svg_pages(
            &vfs,
            ".ergproj/preview/svg",
            &["<svg>uno</svg>".to_string(), "<svg>tres</svg>".to_string()],
        );

        assert!(!pages[0].changed);
        assert!(pages[1].changed);
        assert_eq!(
            vfs.read_file(".ergproj/preview/svg/page-1.svg").unwrap(),
            b"<svg>uno</svg>"
        );
        assert_eq!(
            vfs.read_file(".ergproj/preview/svg/page-2.svg").unwrap(),
            b"<svg>tres</svg>"
        );
        assert!(
            vfs.read_source(".ergproj/preview/svg/page-2.svg").is_err(),
            "changed preview SVG artifacts should not be retained as Typst Source values"
        );
    }

    #[test]
    fn writes_preview_svg_as_file_when_no_file_artifact_exists() {
        let vfs = VirtualFileSystem::new();
        vfs.write_source(
            ".ergproj/preview/svg/page-1.svg",
            "<svg>uno</svg>".to_string(),
        );

        let pages = write_svg_pages(
            &vfs,
            ".ergproj/preview/svg",
            &["<svg>uno</svg>".to_string()],
        );

        assert!(!pages[0].changed);
        assert_eq!(
            vfs.read_file(".ergproj/preview/svg/page-1.svg").unwrap(),
            b"<svg>uno</svg>"
        );
        assert!(
            vfs.read_source(".ergproj/preview/svg/page-1.svg").is_err(),
            "preview SVG artifacts should be stored as generated file bytes"
        );
    }
}
