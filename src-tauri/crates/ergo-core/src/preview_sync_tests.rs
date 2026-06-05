use super::*;
use crate::ast::{DocumentElement, DocumentSection};
use crate::document_session::{DocumentSession, FieldSourceMapEntry};
use crate::preview_sync_lookup::{caret_utf16_distance_to_entry, field_entry_closest_to_caret};
use crate::test_fixtures::preview_sync_document_ast;
use crate::vfs::VirtualFileSystem;
use crate::world::ErgoWorld;
use std::sync::Arc;
use typst_ide::IdeWorld;

#[test]
fn field_entry_closest_to_caret_prefers_matching_segment() {
    let near = FieldSourceMapEntry {
        element_id: "inputs".to_string(),
        section_id: "cover".to_string(),
        field_id: "/title".to_string(),
        file_path: "main.typ".to_string(),
        byte_start: 0,
        byte_end: 20,
        segments: vec![crate::document_session::FieldTextSegment {
            source_byte_start: 0,
            source_byte_end: 10,
            field_utf16_start: 0,
            field_utf16_end: 4,
        }],
        fallback_caret_utf16_offset: None,
    };
    let far = FieldSourceMapEntry {
        element_id: "inputs".to_string(),
        section_id: "cover".to_string(),
        field_id: "/title".to_string(),
        file_path: "sections/cover.typ".to_string(),
        byte_start: 0,
        byte_end: 20,
        segments: vec![crate::document_session::FieldTextSegment {
            source_byte_start: 0,
            source_byte_end: 10,
            field_utf16_start: 10,
            field_utf16_end: 20,
        }],
        fallback_caret_utf16_offset: None,
    };

    assert_eq!(caret_utf16_distance_to_entry(&near, 2), 0);
    assert!(caret_utf16_distance_to_entry(&far, 2) > 0);

    let picked = field_entry_closest_to_caret(&[&near, &far], Some(2))
        .expect("expected closest field entry");
    assert_eq!(picked.file_path, "main.typ");
}

fn compile_preview(
    vfs: Arc<VirtualFileSystem>,
    source_revision: SourceRevision,
    source_map: Vec<SourceMapEntry>,
    field_source_map: Vec<FieldSourceMapEntry>,
) -> PreviewSyncState {
    crate::test_fixtures::populate_versatile_apa(&vfs);
    let main_id = FileId::new(None, VirtualPath::new("main.typ"));
    let source_snapshot = WorldSourceSnapshot::from_vfs(&vfs);
    let world = SnapshotWorld::new(source_snapshot.clone(), main_id);
    let document = typst::compile::<PagedDocument>(&world).output.unwrap();
    let state = PreviewSyncState::default();
    state.store_preview(
        source_revision,
        Arc::new(document),
        source_map,
        field_source_map,
        source_snapshot,
    );
    state
}

#[test]
fn ergo_world_satisfies_ide_world() {
    fn assert_ide_world<T: IdeWorld>() {}
    assert_ide_world::<ErgoWorld>();
}

#[test]
fn returns_positions_for_heading_and_unicode_paragraph() {
    let vfs = Arc::new(VirtualFileSystem::new());
    let session = DocumentSession::new(Arc::clone(&vfs));
    let status = session.sync_snapshot(preview_sync_document_ast()).unwrap();
    let sync = compile_preview(
        Arc::clone(&vfs),
        status.source_revision,
        status.source_map,
        status.field_source_map,
    );

    let heading = sync.positions_for_element("heading-ñ", status.source_revision);
    let paragraph = sync.positions_for_element("paragraph-emoji", status.source_revision);

    assert!(matches!(
        heading,
        PreviewElementPositionsResult::Matched { ref positions, .. } if !positions.is_empty()
    ));
    assert!(matches!(
        paragraph,
        PreviewElementPositionsResult::Matched { ref positions, .. } if !positions.is_empty()
    ));
}

#[test]
fn maps_preview_click_to_paragraph_element() {
    let vfs = Arc::new(VirtualFileSystem::new());
    let session = DocumentSession::new(Arc::clone(&vfs));
    let status = session.sync_snapshot(preview_sync_document_ast()).unwrap();
    let sync = compile_preview(
        Arc::clone(&vfs),
        status.source_revision,
        status.source_map.clone(),
        status.field_source_map.clone(),
    );

    let positions = match sync.positions_for_element("paragraph-emoji", status.source_revision) {
        PreviewElementPositionsResult::Matched { positions, .. } => positions,
        result => panic!("expected paragraph preview position, got {result:?}"),
    };
    let first = positions.first().unwrap();
    let result = sync.jump_from_click(
        first.page_number,
        first.x_pt + 1.0,
        first.y_pt - 1.0,
        status.source_revision,
    );

    match result {
        PreviewJumpResult::Field { target, .. } => {
            assert_eq!(target.element_id, "paragraph-emoji");
        }
        result => panic!("expected paragraph field jump, got {result:?}"),
    }
}

#[test]
fn preview_click_uses_retained_sources_after_document_edits() {
    let vfs = Arc::new(VirtualFileSystem::new());
    let session = DocumentSession::new(Arc::clone(&vfs));
    let mut ast = preview_sync_document_ast();
    let status = session.sync_snapshot(ast.clone()).unwrap();
    let sync = compile_preview(
        Arc::clone(&vfs),
        status.source_revision,
        status.source_map.clone(),
        status.field_source_map.clone(),
    );

    let DocumentSection::Content(content) = &mut ast.sections[0];
    let DocumentElement::Paragraph(paragraph) = &mut content.elements[1] else {
        panic!("expected paragraph element");
    };
    paragraph.content[0].text = "Texto cambiado después del render.".to_string();

    let edited_status = session.sync_snapshot(ast).unwrap();
    assert_ne!(edited_status.source_revision, status.source_revision);

    let positions = match sync.positions_for_element("paragraph-emoji", status.source_revision) {
        PreviewElementPositionsResult::Matched { positions, .. } => positions,
        result => panic!("expected retained paragraph preview position, got {result:?}"),
    };
    let first = positions.first().unwrap();
    let result = sync.jump_from_click(
        first.page_number,
        first.x_pt + 1.0,
        first.y_pt - 1.0,
        status.source_revision,
    );

    match result {
        PreviewJumpResult::Field { target, .. } => {
            assert_eq!(target.element_id, "paragraph-emoji");
        }
        result => panic!("expected retained paragraph field jump, got {result:?}"),
    }
}

#[test]
fn stale_revision_is_unavailable() {
    let vfs = Arc::new(VirtualFileSystem::new());
    let session = DocumentSession::new(Arc::clone(&vfs));
    let status = session.sync_snapshot(preview_sync_document_ast()).unwrap();
    let sync = compile_preview(
        Arc::clone(&vfs),
        status.source_revision,
        status.source_map,
        status.field_source_map,
    );

    let result = sync.positions_for_element("heading-ñ", status.source_revision + 1);

    assert!(matches!(
        result,
        PreviewElementPositionsResult::Unavailable { .. }
    ));
}
