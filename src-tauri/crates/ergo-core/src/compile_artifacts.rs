use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};

use typst::diag::{Severity, SourceDiagnostic};
use typst::layout::{Frame, FrameItem, Page, PagedDocument};

use crate::compilation_types::PreviewPageFile;
use crate::core_errors::CompileError;
use crate::vfs::VirtualFileSystem;
use crate::world::ErgoWorld;

pub fn compile_document(world: &ErgoWorld) -> Result<PagedDocument, CompileError> {
    match typst::compile::<PagedDocument>(world).output {
        Ok(document) => Ok(document),
        Err(errors) => Err(CompileError::Operation(format_source_diagnostics(&errors))),
    }
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

pub fn render_svgs(document: &PagedDocument) -> Vec<String> {
    use rayon::prelude::*;
    document.pages.par_iter().map(typst_svg::svg).collect()
}

pub fn fingerprint_page(page: &Page) -> u64 {
    let mut hasher = DefaultHasher::new();
    page.frame.width().hash(&mut hasher);
    page.frame.height().hash(&mut hasher);
    page.number.hash(&mut hasher);
    hash_frame_for_fingerprint(&page.frame, &mut hasher);
    hasher.finish()
}

fn hash_frame_for_fingerprint(frame: &Frame, hasher: &mut DefaultHasher) {
    frame.items().len().hash(hasher);
    for (_, item) in frame.items() {
        match item {
            FrameItem::Text(text) => {
                text.font.hash(hasher);
                text.size.hash(hasher);
                text.glyphs.len().hash(hasher);
                for glyph in &text.glyphs {
                    glyph.span.hash(hasher);
                    glyph.range.hash(hasher);
                    glyph.x_advance.hash(hasher);
                    glyph.y_offset.hash(hasher);
                }
            }
            FrameItem::Group(group) => {
                group.transform.hash(hasher);
                hash_frame_for_fingerprint(&group.frame, hasher);
            }
            FrameItem::Shape(shape, size) => {
                shape.hash(hasher);
                size.hash(hasher);
            }
            FrameItem::Image(image, size, _) => {
                image.hash(hasher);
                size.hash(hasher);
            }
            FrameItem::Link(_, _) | FrameItem::Tag(_) => {}
        }
    }
}

struct CachedSvgPage {
    fingerprint: u64,
    svg: String,
}

pub struct SvgPageCache {
    entries: Vec<CachedSvgPage>,
}

impl SvgPageCache {
    pub fn new() -> Self {
        Self {
            entries: Vec::new(),
        }
    }
}

pub fn render_svgs_incremental(document: &PagedDocument, cache: &mut SvgPageCache) -> Vec<String> {
    use rayon::prelude::*;

    let fingerprints: Vec<u64> = document.pages.par_iter().map(fingerprint_page).collect();

    let needs_render: Vec<bool> = fingerprints
        .iter()
        .enumerate()
        .map(|(i, fp)| cache.entries.get(i).map_or(true, |e| e.fingerprint != *fp))
        .collect();

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

    cache.entries = fingerprints
        .into_iter()
        .zip(svgs.iter().cloned())
        .map(|(fingerprint, svg)| CachedSvgPage { fingerprint, svg })
        .collect();

    svgs
}

pub fn write_svg_pages(
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
            width_pt: None,
            height_pt: None,
            content: if changed_pages[index] {
                Some(svgs[index].clone())
            } else {
                None
            },
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use super::*;
    use crate::ast::DocumentAST;
    use crate::document_session::DocumentSession;
    use crate::path_utils::file_id_for_virtual_path;
    use crate::test_fixtures::basic_document_ast;
    use crate::vfs::VirtualFileSystem;

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
        let world = ErgoWorld::new(Arc::clone(&vfs), file_id_for_virtual_path("main.typ"));

        let document = compile_document(&world).unwrap();
        let svgs = render_svgs(&document);

        assert!(!svgs.is_empty());
        assert!(svgs[0].contains("<svg"));
    }

    #[test]
    fn compile_errors_use_plain_diagnostics() {
        let vfs = Arc::new(VirtualFileSystem::new());
        vfs.write_source("main.typ", "#let =".to_string());
        let world = ErgoWorld::new(Arc::clone(&vfs), file_id_for_virtual_path("main.typ"));

        let error = compile_document(&world).unwrap_err().to_string();

        assert!(!error.contains("SourceDiagnostic"));
        assert!(!error.contains("Tracepoint"));
        assert!(!error.contains("hints:"));
        assert!(!error.trim().is_empty());
    }

    #[test]
    fn compiles_svg_from_document_session_sources() {
        let vfs = Arc::new(VirtualFileSystem::new());
        let session = DocumentSession::new(Arc::clone(&vfs));
        let world = ErgoWorld::new(Arc::clone(&vfs), file_id_for_virtual_path("main.typ"));
        session
            .sync_snapshot(basic_document_ast("Título con ñ", "Resumen breve."))
            .unwrap();

        let document = compile_document(&world).unwrap();
        let svgs = render_svgs(&document);

        assert!(!svgs.is_empty());
        assert!(svgs[0].contains("<svg"));
    }

    /// New project AST + bundled `apa7` template spec → canonical `.ergproj` sources → Typst compile.
    /// Requires `@preview/versatile-apa:7.2.0` in the local Typst package cache (`typst --version`).
    #[test]
    fn new_apa7_project_from_bundled_template_compiles_to_svg() {
        use crate::document_session::{DEPENDENCY_MANIFEST_PATH, TEMPLATE_PATH};
        use crate::package_resolver::{collect_package_files, PackageRef};
        use crate::test_fixtures::default_apa7_project_ast;

        let package = PackageRef::from_import("@preview/versatile-apa", "7.2.0").unwrap();
        let package_files = match collect_package_files(&package) {
            Ok(files) => files,
            Err(error) => {
                eprintln!(
                    "skipping new apa7 project compile test (Typst package cache): {error}"
                );
                return;
            }
        };

        let vfs = Arc::new(VirtualFileSystem::new());
        for file in package_files {
            vfs.write_file(&file.path, file.bytes);
        }

        let session = DocumentSession::new(Arc::clone(&vfs));
        session.sync_snapshot(default_apa7_project_ast()).unwrap();

        let template_json = vfs.read_source(TEMPLATE_PATH).unwrap();
        assert!(
            template_json.contains("\"template_id\":\"apa7\""),
            ".ergproj/template.json should record the bundled template; got:\n{template_json}"
        );

        let manifest_json = vfs.read_source(DEPENDENCY_MANIFEST_PATH).unwrap();
        assert!(
            manifest_json.contains("@preview/versatile-apa"),
            "dependency manifest should list the template package; got:\n{manifest_json}"
        );

        let main_source = vfs.read_source("main.typ").unwrap();
        assert!(
            main_source.contains("#outline()"),
            "main.typ should include document outline; got:\n{main_source}"
        );
        assert!(
            main_source.contains("#appendix-outline"),
            "main.typ should include appendix outline; got:\n{main_source}"
        );
        assert!(
            main_source.contains("#show: appendix"),
            "main.typ should enable appendix show rule; got:\n{main_source}"
        );

        let world = ErgoWorld::new(Arc::clone(&vfs), file_id_for_virtual_path("main.typ"));
        let document = compile_document(&world).unwrap();
        let svgs = render_svgs(&document);

        assert!(!svgs.is_empty());
        assert!(svgs[0].contains("<svg"));
    }

    #[test]
    fn incremental_svg_render_updates_when_page_text_changes() {
        let vfs = Arc::new(VirtualFileSystem::new());
        let mut cache = SvgPageCache::new();
        vfs.write_source("main.typ", "Alpha".to_string());
        let world = ErgoWorld::new(Arc::clone(&vfs), file_id_for_virtual_path("main.typ"));

        let first_document = compile_document(&world).unwrap();
        let first_cached = render_svgs_incremental(&first_document, &mut cache);

        vfs.write_source("main.typ", "Beta".to_string());
        let second_document = compile_document(&world).unwrap();
        let second_fresh = render_svgs(&second_document);
        let second_cached = render_svgs_incremental(&second_document, &mut cache);

        assert_ne!(first_cached, second_fresh);
        assert_eq!(second_cached, second_fresh);
    }

    fn assert_document_event_updates_preview_svg(
        initial_ast: DocumentAST,
        event: crate::document_session_types::DocumentEvent,
    ) {
        let vfs = Arc::new(VirtualFileSystem::new());
        let session = DocumentSession::new(Arc::clone(&vfs));
        let mut cache = SvgPageCache::new();
        let world = ErgoWorld::new(Arc::clone(&vfs), file_id_for_virtual_path("main.typ"));

        session.sync_snapshot(initial_ast).unwrap();
        let first_document = compile_document(&world).unwrap();
        let first_svgs = render_svgs_incremental(&first_document, &mut cache);
        write_svg_pages(&vfs, ".ergproj/preview/svg", &first_svgs);
        let first_files = (1..=first_svgs.len())
            .map(|page_number| {
                vfs.read_file(&format!(".ergproj/preview/svg/page-{page_number}.svg"))
                    .unwrap()
            })
            .collect::<Vec<_>>();

        session.apply_event(event).unwrap();
        let second_document = compile_document(&world).unwrap();
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
    fn document_session_events_update_preview_svg_artifacts() {
        use crate::document_session_types::DocumentEvent;

        assert_document_event_updates_preview_svg(
            basic_document_ast("Título con ñ", "Resumen breve."),
            DocumentEvent::UpdateHeading {
                element_id: "heading-1".to_string(),
                text: Some("Método con ñ".to_string()),
                level: None,
            },
        );

        assert_document_event_updates_preview_svg(
            basic_document_ast("Título inicial", "Resumen breve."),
            DocumentEvent::UpdateInput {
                path: "/title".to_string(),
                value: serde_json::json!("Título escrito"),
            },
        );
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
                    width_pt: None,
                    height_pt: None,
                    content: Some("<svg>uno</svg>".to_string()),
                },
                PreviewPageFile {
                    changed: true,
                    page_number: 2,
                    path: ".ergproj/preview/svg/page-2.svg".to_string(),
                    width_pt: None,
                    height_pt: None,
                    content: Some("<svg>dos</svg>".to_string()),
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
