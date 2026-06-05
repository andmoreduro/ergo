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
        crate::test_fixtures::populate_versatile_apa(&vfs);
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

    /// New project AST + bundled `umb-apa` template spec → canonical `.ergproj` sources → Typst compile.
    #[test]
    fn new_umb_apa_project_from_bundled_template_compiles_to_svg() {
        use crate::test_fixtures::{default_umb_apa_project_ast, populate_umb_apa};

        let vfs = Arc::new(VirtualFileSystem::new());
        populate_umb_apa(&vfs);

        let session = DocumentSession::new(Arc::clone(&vfs));
        session.sync_snapshot(default_umb_apa_project_ast()).unwrap();

        let world = ErgoWorld::new(Arc::clone(&vfs), file_id_for_virtual_path("main.typ"));
        let document = compile_document(&world).unwrap();
        let svgs = render_svgs(&document);

        assert!(!svgs.is_empty());
        assert!(svgs[0].contains("<svg"));
    }

    /// Body with nested lists (including empty placeholder children), quotes, and table cell blocks.
    #[test]
    fn umb_apa_complex_body_compiles_to_svg() {
        use std::collections::HashMap;

        use crate::ast::{
            ContentSection, DocumentElement, DocumentSection, List, Paragraph, Quote,
            ReferenceEntry, Table, TableCell,
        };
        use crate::test_fixtures::{
            default_umb_apa_project_ast, list_item, populate_umb_apa, rich_text,
        };

        let mut nested_with_empty_child = list_item("item one");
        nested_with_empty_child.children = vec![list_item("")];

        let mut nested_parent = list_item("outer");
        nested_parent.children = vec![list_item("nested text")];

        let mut ast = default_umb_apa_project_ast();
        ast.references.push(ReferenceEntry {
            id: "ref-1".to_string(),
            citation_key: "ref-1".to_string(),
            biblatex: "@book{ref-1, title={Test}}".to_string(),
        });
        ast.sections = vec![DocumentSection::Content(ContentSection {
            id: "content-section".to_string(),
            is_optional: false,
            elements: vec![
                DocumentElement::List(List {
                    id: "list-1".to_string(),
                    items: vec![
                        nested_with_empty_child,
                        list_item("top two"),
                        nested_parent,
                    ],
                }),
                DocumentElement::Quote(Quote {
                    id: "quote-1".to_string(),
                    content: vec![rich_text("body quote")],
                    ..Default::default()
                }),
                DocumentElement::Table(Table {
                    id: "table-1".to_string(),
                    rows: 1,
                    cols: 1,
                    cells: vec![vec![TableCell {
                        elements: vec![
                            DocumentElement::Paragraph(Paragraph {
                                id: "cell-p1".to_string(),
                                content: vec![rich_text("first para")],
                            }),
                            DocumentElement::Quote(Quote {
                                id: "cell-q1".to_string(),
                                content: vec![rich_text("quoted")],
                                ..Default::default()
                            }),
                            DocumentElement::List(List {
                                id: "cell-l1".to_string(),
                                items: vec![list_item("cell item")],
                            }),
                        ],
                        row_span: None,
                        col_span: None,
                    }]],
                    column_sizes: vec!["1fr".to_string()],
                    extra_fields: HashMap::new(),
                }),
                DocumentElement::Paragraph(Paragraph {
                    id: "p-2".to_string(),
                    content: vec![rich_text("after table")],
                }),
            ],
        })];

        let vfs = Arc::new(VirtualFileSystem::new());
        populate_umb_apa(&vfs);
        let session = DocumentSession::new(Arc::clone(&vfs));
        session.sync_snapshot(ast).unwrap();

        let world = ErgoWorld::new(Arc::clone(&vfs), file_id_for_virtual_path("main.typ"));
        if let Err(error) = compile_document(&world) {
            for path in [
                "main.typ",
                "lib.typ",
                "elements/list-1.typ",
                "elements/table-1.typ",
                "elements/quote-1.typ",
            ] {
                if let Ok(source) = vfs.read_source(path) {
                    eprintln!("=== {path} ===\n{source}");
                }
            }
            panic!("compile failed: {error}");
        }
    }

    /// New project AST + bundled `apa7` template spec → canonical `.ergproj` sources → Typst compile.
    #[test]
    fn new_apa7_project_from_bundled_template_compiles_to_svg() {
        use crate::document_session::{DEPENDENCY_MANIFEST_PATH, TEMPLATE_PATH};
        use crate::test_fixtures::{default_apa7_project_ast, populate_versatile_apa};

        let vfs = Arc::new(VirtualFileSystem::new());
        populate_versatile_apa(&vfs);

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
            main_source.contains("title: [Contents]"),
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
    fn apa7_paragraph_with_bibliography_citation_compiles() {
        use crate::ast::{
            DocumentElement, DocumentSection, EquationSyntax, Paragraph, ReferenceEntry, RichText,
        };
        use crate::path_utils::file_id_for_virtual_path;
        use crate::test_fixtures::{default_apa7_project_ast, populate_versatile_apa, rich_text};
        use crate::vfs::VirtualFileSystem;
        use std::sync::Arc;

        let mut ast = default_apa7_project_ast();
        ast.references = vec![ReferenceEntry {
            id: "bib-ref-1".to_string(),
            citation_key: "smith2020".to_string(),
            biblatex: "@article{smith2020, author = {Smith}, title = {Demo}, year = {2020}}"
                .to_string(),
        }];
        let DocumentSection::Content(content) = &mut ast.sections[0];
        content.elements.push(DocumentElement::Paragraph(Paragraph {
            id: "p-1".to_string(),
            content: vec![
                rich_text("See "),
                RichText {
                    text: "smith2020".to_string(),
                    bold: None,
                    italic: None,
                    underline: None,
                    kind: Some("reference".to_string()),
                    reference_id: Some("bib-ref-1".to_string()),
                    equation_source: None,
                    equation_syntax: EquationSyntax::Typst,
                    ..Default::default()
                },
                rich_text(" for details."),
            ],
        }));

        let vfs = Arc::new(VirtualFileSystem::new());
        populate_versatile_apa(&vfs);
        let session = DocumentSession::new(Arc::clone(&vfs));
        session.sync_snapshot(ast).unwrap();

        if let Ok(source) = vfs.read_source("elements/p-1.typ") {
            eprintln!("=== elements/p-1.typ ===\n{source}");
        }
        if let Ok(source) = vfs.read_source("references.bib") {
            eprintln!("=== references.bib ===\n{source}");
        }

        let world = ErgoWorld::new(Arc::clone(&vfs), file_id_for_virtual_path("main.typ"));
        if let Err(error) = compile_document(&world) {
            panic!("compile failed: {error}");
        }
    }

    #[test]
    fn umb_apa_paragraph_with_bibliography_citation_compiles() {
        use crate::ast::{
            DocumentElement, DocumentSection, EquationSyntax, Paragraph, ReferenceEntry, RichText,
        };
        use crate::path_utils::file_id_for_virtual_path;
        use crate::test_fixtures::{default_umb_apa_project_ast, populate_umb_apa, rich_text};
        use crate::vfs::VirtualFileSystem;
        use std::sync::Arc;

        let mut ast = default_umb_apa_project_ast();
        ast.references = vec![ReferenceEntry {
            id: "bib-ref-1".to_string(),
            citation_key: "smith2020".to_string(),
            biblatex: "@article{smith2020, author = {Smith}, title = {Demo}, year = {2020}}"
                .to_string(),
        }];
        let DocumentSection::Content(content) = &mut ast.sections[0];
        content.elements.push(DocumentElement::Paragraph(Paragraph {
            id: "p-1".to_string(),
            content: vec![
                rich_text("See "),
                RichText {
                    text: "smith2020".to_string(),
                    bold: None,
                    italic: None,
                    underline: None,
                    kind: Some("reference".to_string()),
                    reference_id: Some("bib-ref-1".to_string()),
                    equation_source: None,
                    equation_syntax: EquationSyntax::Typst,
                    ..Default::default()
                },
                rich_text(" for details."),
            ],
        }));

        let vfs = Arc::new(VirtualFileSystem::new());
        populate_umb_apa(&vfs);
        let session = DocumentSession::new(Arc::clone(&vfs));
        session.sync_snapshot(ast).unwrap();

        let world = ErgoWorld::new(Arc::clone(&vfs), file_id_for_virtual_path("main.typ"));
        if let Err(error) = compile_document(&world) {
            panic!("umb-apa bibliography citation compile failed: {error}");
        }
    }

    #[test]
    fn apa7_minimal_bibliography_entry_with_citation_compiles() {
        use crate::ast::{
            DocumentElement, DocumentSection, EquationSyntax, Paragraph, ReferenceEntry, RichText,
        };
        use crate::path_utils::file_id_for_virtual_path;
        use crate::test_fixtures::{default_apa7_project_ast, populate_versatile_apa, rich_text};
        use crate::vfs::VirtualFileSystem;
        use std::sync::Arc;

        let mut ast = default_apa7_project_ast();
        ast.references = vec![ReferenceEntry {
            id: "ref-1".to_string(),
            citation_key: "ref-1".to_string(),
            biblatex: "@book{ref-1}".to_string(),
        }];
        let DocumentSection::Content(content) = &mut ast.sections[0];
        content.elements.push(DocumentElement::Paragraph(Paragraph {
            id: "p-1".to_string(),
            content: vec![
                rich_text("See "),
                RichText {
                    text: "ref-1".to_string(),
                    bold: None,
                    italic: None,
                    underline: None,
                    kind: Some("reference".to_string()),
                    reference_id: Some("ref-1".to_string()),
                    equation_source: None,
                    equation_syntax: EquationSyntax::Typst,
                    ..Default::default()
                },
                rich_text("."),
            ],
        }));

        let vfs = Arc::new(VirtualFileSystem::new());
        populate_versatile_apa(&vfs);
        let session = DocumentSession::new(Arc::clone(&vfs));
        session.sync_snapshot(ast).unwrap();

        let world = ErgoWorld::new(Arc::clone(&vfs), file_id_for_virtual_path("main.typ"));
        if let Err(error) = compile_document(&world) {
            panic!("compile failed: {error}");
        }
    }

    #[test]
    fn apa7_bibliography_citation_uses_biblatex_entry_key() {
        use crate::ast::{
            DocumentElement, DocumentSection, EquationSyntax, Paragraph, ReferenceEntry, RichText,
        };
        use crate::path_utils::file_id_for_virtual_path;
        use crate::test_fixtures::{default_apa7_project_ast, populate_versatile_apa};
        use crate::typst_source::{bibliography_citation_keys, typst_reference_marker};
        use crate::vfs::VirtualFileSystem;
        use std::sync::Arc;

        let references = vec![ReferenceEntry {
            id: "ref-1".to_string(),
            citation_key: "ref-1".to_string(),
            biblatex: "@article{smith2020, author = {Smith}, title = {Demo}, year = {2020}}"
                .to_string(),
        }];
        let keys = bibliography_citation_keys(&references);
        assert_eq!(
            typst_reference_marker("ref-1", &keys),
            "@smith2020"
        );

        let mut ast = default_apa7_project_ast();
        ast.references = references;
        let DocumentSection::Content(content) = &mut ast.sections[0];
        content.elements.push(DocumentElement::Paragraph(Paragraph {
            id: "p-1".to_string(),
            content: vec![RichText {
                text: "smith2020".to_string(),
                bold: None,
                italic: None,
                underline: None,
                kind: Some("reference".to_string()),
                reference_id: Some("ref-1".to_string()),
                equation_source: None,
                equation_syntax: EquationSyntax::Typst,
                ..Default::default()
            }],
        }));

        let vfs = Arc::new(VirtualFileSystem::new());
        populate_versatile_apa(&vfs);
        let session = DocumentSession::new(Arc::clone(&vfs));
        session.sync_snapshot(ast).unwrap();

        let element_source = vfs.read_source("elements/p-1.typ").unwrap();
        assert!(element_source.contains("@smith2020"));

        let world = ErgoWorld::new(Arc::clone(&vfs), file_id_for_virtual_path("main.typ"));
        compile_document(&world).expect("citation key mismatch should compile");
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
        crate::test_fixtures::populate_versatile_apa(&vfs);
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

    /// Diagnostic (run with `--ignored --nocapture`): compares per-compile cost
    /// of the apa7 vs umb-apa default documents, simulating edits between compiles
    /// so Typst's memoization does not hide the real cost.
    #[test]
    #[ignore]
    fn diagnose_compile_cost_apa7_vs_umb_apa() {
        use crate::ast::{DocumentElement, DocumentSection};
        use crate::path_utils::file_id_for_virtual_path;
        use crate::test_fixtures::{
            default_apa7_project_ast, default_umb_apa_project_ast, populate_umb_apa,
            populate_versatile_apa, rich_text,
        };
        use std::time::Instant;

        // Ensure the content section has an editable paragraph (apa7's default AST
        // ships with an empty body — without this the "edit" would be a no-op and
        // every recompile would be a memoization cache hit rather than real work).
        fn ensure_body_paragraph(ast: &mut DocumentAST) {
            use crate::ast::Paragraph;
            for section in &mut ast.sections {
                if let DocumentSection::Content(content) = section {
                    if !content
                        .elements
                        .iter()
                        .any(|e| matches!(e, DocumentElement::Paragraph(_)))
                    {
                        content.elements.push(DocumentElement::Paragraph(Paragraph {
                            id: "p-1".to_string(),
                            content: vec![rich_text("Body paragraph text.")],
                        }));
                    }
                    return;
                }
            }
        }

        fn set_body_paragraph_text(ast: &mut DocumentAST, text: &str) {
            for section in &mut ast.sections {
                if let DocumentSection::Content(content) = section {
                    for element in &mut content.elements {
                        if let DocumentElement::Paragraph(p) = element {
                            p.content = vec![rich_text(text)];
                            return;
                        }
                    }
                }
            }
        }

        fn measure(label: &str, populate: impl Fn(&VirtualFileSystem), mut base_ast: DocumentAST) {
            ensure_body_paragraph(&mut base_ast);
            let vfs = Arc::new(VirtualFileSystem::new());
            populate(&vfs);
            let session = DocumentSession::new(Arc::clone(&vfs));
            let world = ErgoWorld::new(Arc::clone(&vfs), file_id_for_virtual_path("main.typ"));
            let mut cache = SvgPageCache::new();

            // Warm up (first compile compiles everything + populates caches).
            session.sync_snapshot(base_ast.clone()).unwrap();
            let warm_start = Instant::now();
            let document = compile_document(&world).unwrap();
            let warm_ms = warm_start.elapsed().as_secs_f64() * 1000.0;
            let page_count = document.pages.len();
            let svgs = render_svgs_incremental(&document, &mut cache);
            let total_svg_bytes: usize = svgs.iter().map(|s| s.len()).sum();
            let max_page_bytes = svgs.iter().map(|s| s.len()).max().unwrap_or(0);

            // Simulate typing: change the body paragraph each iteration and recompile.
            const ITERS: usize = 12;
            let mut compile_total_ms = 0.0;
            let mut render_total_ms = 0.0;
            for i in 0..ITERS {
                let mut ast = base_ast.clone();
                set_body_paragraph_text(&mut ast, &format!("Body paragraph edit number {i}."));
                session.sync_snapshot(ast).unwrap();

                let c0 = Instant::now();
                let doc = compile_document(&world).unwrap();
                compile_total_ms += c0.elapsed().as_secs_f64() * 1000.0;

                let r0 = Instant::now();
                let _ = render_svgs_incremental(&doc, &mut cache);
                render_total_ms += r0.elapsed().as_secs_f64() * 1000.0;
            }

            println!(
                "[{label}] pages={page_count} warm_compile={warm_ms:.1}ms \
                 avg_edit_compile={:.1}ms avg_edit_svg_render={:.1}ms \
                 total_svg={}KB largest_page_svg={}KB",
                compile_total_ms / ITERS as f64,
                render_total_ms / ITERS as f64,
                total_svg_bytes / 1024,
                max_page_bytes / 1024,
            );
        }

        // Fairness: give apa7 a fully populated front matter so it renders a real
        // title/abstract page (not a blank one), matching umb-apa's filled inputs.
        let full_apa7 = {
            let mut ast = default_apa7_project_ast();
            ast.inputs
                .insert("title".into(), serde_json::json!("A Fully Populated Title"));
            ast.inputs.insert(
                "authors".into(),
                serde_json::json!([{ "name": "Author One", "affiliations": [0] }]),
            );
            ast.inputs
                .insert("affiliations".into(), serde_json::json!(["University of Somewhere"]));
            ast.inputs.insert(
                "abstract_text".into(),
                serde_json::json!("This is an abstract with several sentences of content. \
                    It describes the study, methods, and findings in enough words to fill a page."),
            );
            ast.inputs
                .insert("author_note".into(), serde_json::json!("Author note paragraph."));
            ast.inputs.insert("course".into(), serde_json::json!("PSY 101"));
            ast.inputs
                .insert("instructor".into(), serde_json::json!("Dr. Instructor"));
            ast.inputs
                .insert("due_date".into(), serde_json::json!("June 3, 2026"));
            ast.inputs
                .insert("keywords".into(), serde_json::json!(["alpha", "beta"]));
            ast
        };

        measure("apa7-empty-fm", populate_versatile_apa, default_apa7_project_ast());
        measure("apa7-full-fm", populate_versatile_apa, full_apa7);
        measure("umb-apa", populate_umb_apa, default_umb_apa_project_ast());

        // Isolation: hold the body element as the only thing that changes per edit
        // (like a real keystroke), and compare the full umb-apa main.typ against
        // variants with the front-matter call or the outlines stripped out.
        fn measure_variant(label: &str, main_src: &str, vfs: &Arc<VirtualFileSystem>) {
            vfs.write_source("main.typ", main_src.to_string());
            let world = ErgoWorld::new(Arc::clone(vfs), file_id_for_virtual_path("main.typ"));
            // warm
            let _ = compile_document(&world);
            const ITERS: usize = 12;
            let mut total = 0.0;
            for i in 0..ITERS {
                vfs.write_source(
                    "elements/p-1.typ",
                    format!("Body paragraph edit number {i}.\n"),
                );
                let t = Instant::now();
                let _ = compile_document(&world).unwrap();
                total += t.elapsed().as_secs_f64() * 1000.0;
            }
            println!("[isolate:{label}] avg_edit_compile={:.1}ms", total / ITERS as f64);
        }

        {
            let vfs = Arc::new(VirtualFileSystem::new());
            populate_umb_apa(&vfs);
            let session = DocumentSession::new(Arc::clone(&vfs));
            session.sync_snapshot(default_umb_apa_project_ast()).unwrap();
            let full = vfs.read_source("main.typ").unwrap();

            // Strip the `#front-matter( ... )` call (it ends right before the outlines).
            let no_frontmatter = match (full.find("#front-matter("), full.find("#outline(")) {
                (Some(fm), Some(ol)) if fm < ol => {
                    let mut s = full.clone();
                    s.replace_range(fm..ol, "");
                    s
                }
                _ => full.clone(),
            };

            // Strip every `#outline(...)`/`#appendix-outline(...)` + following pagebreak block.
            let mut no_outlines = String::new();
            for line in full.lines() {
                let t = line.trim_start();
                if t.starts_with("#outline(")
                    || t.starts_with("#appendix-outline(")
                    || t == "#pagebreak()"
                {
                    continue;
                }
                no_outlines.push_str(line);
                no_outlines.push('\n');
            }

            measure_variant("full", &full, &vfs);
            measure_variant("no-frontmatter", &no_frontmatter, &vfs);
            measure_variant("no-outlines", &no_outlines, &vfs);
        }
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
