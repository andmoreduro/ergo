use std::sync::Arc;

use typst::layout::PagedDocument;

use crate::compilation_types::{
    CompilationJob, CompilationResult, CompilationStatus, ExportFormat, PreviewPageFile,
};
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
    }
}

pub(crate) fn failed_result(job: &CompilationJob, message: String) -> CompilationResult {
    let mut result = result_for_job(job, CompilationStatus::Failed);
    result.diagnostics = vec![message];
    result
}

fn compile_document(vfs: Arc<VirtualFileSystem>) -> Result<PagedDocument, String> {
    let world = ErgoWorld::new(vfs, file_id_for_virtual_path("main.typ"));

    match typst::compile::<PagedDocument>(&world).output {
        Ok(document) => Ok(document),
        Err(errors) => Err(format!("{:?}", errors)),
    }
}

pub(crate) fn compile_document_snapshot(
    vfs: &Arc<VirtualFileSystem>,
) -> Result<(PagedDocument, WorldSourceSnapshot), String> {
    let source_snapshot = WorldSourceSnapshot::from_vfs(vfs);
    let world = SnapshotWorld::new(
        source_snapshot.clone(),
        file_id_for_virtual_path("main.typ"),
    );

    match typst::compile::<PagedDocument>(&world).output {
        Ok(document) => Ok((document, source_snapshot)),
        Err(errors) => Err(format!("{:?}", errors)),
    }
}

fn compile_svgs(vfs: Arc<VirtualFileSystem>) -> Result<Vec<String>, String> {
    let document = compile_document(vfs)?;
    Ok(render_svgs(&document))
}

pub(crate) fn render_svgs(document: &PagedDocument) -> Vec<String> {
    document.pages.iter().map(typst_svg::svg).collect()
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
            Err(message) => failed_result(job, message),
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
                Err(errors) => failed_result(job, format!("{:?}", errors)),
            },
            Err(message) => failed_result(job, message),
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
            Err(message) => failed_result(job, message),
        },
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use super::*;
    use crate::document_session::DocumentSession;
    use crate::test_fixtures::basic_document_ast;

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
    fn compiles_svg_from_document_session_sources() {
        let vfs = Arc::new(VirtualFileSystem::new());
        let session = DocumentSession::new(Arc::clone(&vfs));
        session
            .sync_snapshot(basic_document_ast("Título con ñ", "Resumen breve."))
            .unwrap();

        let svgs = compile_svgs(vfs).unwrap();

        assert!(!svgs.is_empty());
        assert!(svgs[0].contains("<svg"));
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
