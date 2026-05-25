use serde::{Deserialize, Serialize};
use ts_rs::TS;
use typst::foundations::NativeElement;
use typst::layout::PagedDocument;
use typst_library::model::HeadingElem;

/// A single heading entry in the compiled document outline.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, TS)]
#[ts(export, export_to = "../../../../src/bindings/")]
#[serde(rename_all = "camelCase")]
pub struct OutlineEntry {
    /// Heading level (1 = `=`, 2 = `==`, etc.)
    pub level: u8,
    /// Plain text content of the heading.
    pub text: String,
    /// 1-based page number where this heading appears.
    pub page: usize,
}

/// Ordered list of headings extracted from a compiled `PagedDocument`.
#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq, Eq, TS)]
#[ts(export, export_to = "../../../../src/bindings/")]
#[serde(rename_all = "camelCase")]
pub struct DocumentOutline {
    pub entries: Vec<OutlineEntry>,
}

/// Extracts an ordered heading outline from a compiled [`PagedDocument`] using
/// `document.introspector`. This is a fast in-memory query over an already-built
/// index; for a typical academic document the cost is in the low microseconds.
pub fn extract_outline(document: &PagedDocument) -> DocumentOutline {
    use typst::foundations::Selector;

    let selector = Selector::Elem(HeadingElem::ELEM, None);
    let headings = document.introspector.query(&selector);

    let entries = headings
        .iter()
        .filter_map(|elem| {
            let heading = elem.to_packed::<HeadingElem>()?;
            let loc = elem.location()?;
            // `level` is `Smart<NonZeroUsize>`: Custom(n) is an explicit level; Auto falls back to 1.
            let styles = typst::foundations::StyleChain::default();
            let level = match heading.level.get(styles) {
                typst::foundations::Smart::Custom(n) => n.get() as u8,
                typst::foundations::Smart::Auto => 1u8,
            };
            if !heading.outlined.get(styles) {
                return None;
            }

            let text = heading.body.plain_text().trim().to_string();
            let page = document.introspector.page(loc).get();
            Some(OutlineEntry { level, text, page })
        })
        .collect();

    DocumentOutline { entries }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vfs::VirtualFileSystem;
    use crate::world::{SnapshotWorld, WorldSourceSnapshot};
    use std::sync::Arc;
    use typst::syntax::{FileId, VirtualPath};

    fn compile_with_source(source: &str) -> PagedDocument {
        let vfs = Arc::new(VirtualFileSystem::new());
        vfs.write_source("main.typ", source.to_string());
        let snapshot = WorldSourceSnapshot::from_vfs(&vfs);
        let main_id = FileId::new(None, VirtualPath::new("main.typ"));
        let world = SnapshotWorld::new(snapshot, main_id);
        typst::compile::<PagedDocument>(&world)
            .output
            .expect("test document should compile")
    }

    #[test]
    fn extracts_headings_from_compiled_document() {
        let doc = compile_with_source("= Introduction\n\n== Background\n\n=== Details\n");
        let outline = extract_outline(&doc);

        assert_eq!(outline.entries.len(), 3);
        assert_eq!(outline.entries[0].level, 1);
        assert_eq!(outline.entries[0].text, "Introduction");
        assert_eq!(outline.entries[1].level, 2);
        assert_eq!(outline.entries[1].text, "Background");
        assert_eq!(outline.entries[2].level, 3);
        assert_eq!(outline.entries[2].text, "Details");
    }

    #[test]
    fn empty_document_yields_empty_outline() {
        let doc = compile_with_source("No headings here.");
        let outline = extract_outline(&doc);

        assert!(outline.entries.is_empty());
    }

    #[test]
    fn heading_page_numbers_are_one_based() {
        let doc = compile_with_source("#pagebreak()\n= Second Page Heading\n");
        let outline = extract_outline(&doc);

        assert_eq!(outline.entries.len(), 1);
        assert_eq!(outline.entries[0].page, 2);
    }

    #[test]
    fn all_headings_on_same_page_report_correct_page_number() {
        let doc = compile_with_source("= First\n\n== Second\n\n=== Third\n");
        let outline = extract_outline(&doc);

        assert!(outline.entries.iter().all(|e| e.page == 1));
    }
}
