use super::*;
use crate::ast::{DocumentElement, DocumentSection};
use crate::document_session::{DocumentSession, FieldSourceMapEntry};
use crate::preview_sync_lookup::caret_utf16_distance_to_entry;
use crate::test_fixtures::preview_sync_document_ast;
use crate::vfs::VirtualFileSystem;
use crate::world::ErgoWorld;
use std::sync::Arc;
use typst_ide::IdeWorld;

#[test]
fn pick_closest_preview_position_prefers_nearest_source_offset() {
    let candidates = vec![
        (
            PreviewElementPosition {
                element_id: Some("inputs".to_string()),
                field_id: Some("/title".to_string()),
                caret_utf16_offset: Some(4),
                page_number: 1,
                x_pt: 10.0,
                y_pt: 20.0,
                caret_cue: Some(PreviewCaretCue {
                    top_y_pt: 18.0,
                    height_pt: 12.0,
                }),
                source_revision: 1,
            },
            40,
        ),
        (
            PreviewElementPosition {
                element_id: Some("inputs".to_string()),
                field_id: Some("/title".to_string()),
                caret_utf16_offset: Some(4),
                page_number: 3,
                x_pt: 10.0,
                y_pt: 80.0,
                caret_cue: Some(PreviewCaretCue {
                    top_y_pt: 78.0,
                    height_pt: 12.0,
                }),
                source_revision: 1,
            },
            12,
        ),
    ];

    let closest = pick_closest_preview_position(candidates, 10, None)
        .into_iter()
        .next()
        .expect("expected closest preview position");

    assert_eq!(closest.page_number, 3);
    assert_eq!(closest.y_pt, 80.0);
}

#[test]
fn pick_closest_preview_position_prefers_nearest_page_to_anchor_when_offsets_tie() {
    let candidates = vec![
        (
            PreviewElementPosition {
                element_id: Some("inputs".to_string()),
                field_id: Some("/title".to_string()),
                caret_utf16_offset: Some(4),
                page_number: 1,
                x_pt: 10.0,
                y_pt: 20.0,
                caret_cue: Some(PreviewCaretCue {
                    top_y_pt: 18.0,
                    height_pt: 12.0,
                }),
                source_revision: 1,
            },
            10,
        ),
        (
            PreviewElementPosition {
                element_id: Some("inputs".to_string()),
                field_id: Some("/title".to_string()),
                caret_utf16_offset: Some(4),
                page_number: 5,
                x_pt: 10.0,
                y_pt: 80.0,
                caret_cue: Some(PreviewCaretCue {
                    top_y_pt: 78.0,
                    height_pt: 12.0,
                }),
                source_revision: 1,
            },
            10,
        ),
        (
            PreviewElementPosition {
                element_id: Some("inputs".to_string()),
                field_id: Some("/title".to_string()),
                caret_utf16_offset: Some(4),
                page_number: 10,
                x_pt: 10.0,
                y_pt: 50.0,
                caret_cue: Some(PreviewCaretCue {
                    top_y_pt: 48.0,
                    height_pt: 12.0,
                }),
                source_revision: 1,
            },
            10,
        ),
    ];

    let closest = pick_closest_preview_position(candidates, 10, Some(4))
        .into_iter()
        .next()
        .expect("expected closest preview position");

    assert_eq!(closest.page_number, 5);
}

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
fn maps_preview_click_to_heading_element() {
    let vfs = Arc::new(VirtualFileSystem::new());
    let session = DocumentSession::new(Arc::clone(&vfs));
    let status = session.sync_snapshot(preview_sync_document_ast()).unwrap();
    let sync = compile_preview(
        Arc::clone(&vfs),
        status.source_revision,
        status.source_map.clone(),
        status.field_source_map.clone(),
    );

    let positions = match sync.positions_for_element("heading-ñ", status.source_revision) {
        PreviewElementPositionsResult::Matched { positions, .. } => positions,
        result => panic!("expected heading preview position, got {result:?}"),
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
            assert_eq!(target.element_id, "heading-ñ");
        }
        result => panic!("expected heading field jump, got {result:?}"),
    }
}

#[test]
fn maps_preview_click_to_heading_field_target() {
    let vfs = Arc::new(VirtualFileSystem::new());
    let session = DocumentSession::new(Arc::clone(&vfs));
    let status = session.sync_snapshot(preview_sync_document_ast()).unwrap();
    let sync = compile_preview(
        Arc::clone(&vfs),
        status.source_revision,
        status.source_map.clone(),
        status.field_source_map.clone(),
    );

    let positions = match sync.positions_for_element("heading-ñ", status.source_revision) {
        PreviewElementPositionsResult::Matched { positions, .. } => positions,
        result => panic!("expected heading preview position, got {result:?}"),
    };
    let first = positions.first().unwrap();
    let result = sync.jump_from_click(
        first.page_number,
        first.x_pt + 1.0,
        first.y_pt - 1.0,
        status.source_revision,
    );
    let result_json = serde_json::to_value(result).unwrap();

    assert_eq!(
        result_json,
        serde_json::json!({
            "status": "field",
            "target": {
                "elementId": "heading-ñ",
                "fieldId": "heading-ñ:text",
                "caretUtf16Offset": 0,
                "anchorPageNumber": null,
                "sourceRevision": status.source_revision,
            },
            "sourceRevision": status.source_revision,
        })
    );
}

#[test]
fn returns_preview_position_for_field_focus_target() {
    let vfs = Arc::new(VirtualFileSystem::new());
    let session = DocumentSession::new(Arc::clone(&vfs));
    let status = session.sync_snapshot(preview_sync_document_ast()).unwrap();
    let sync = compile_preview(
        Arc::clone(&vfs),
        status.source_revision,
        status.source_map.clone(),
        status.field_source_map.clone(),
    );

    let result = sync.positions_for_focus(
        &PreviewFocusTarget {
            element_id: "heading-ñ".to_string(),
            field_id: Some("heading-ñ:text".to_string()),
            caret_utf16_offset: Some(0),
            anchor_page_number: None,
            source_revision: status.source_revision,
        },
        status.source_revision,
    );

    assert!(matches!(
        result,
        PreviewElementPositionsResult::Matched { ref positions, .. }
            if positions
                .iter()
                .any(|position| position.field_id.as_deref() == Some("heading-ñ:text"))
    ));
}

#[test]
fn returns_preview_position_for_abstract_input_focus_target() {
    let vfs = Arc::new(VirtualFileSystem::new());
    let session = DocumentSession::new(Arc::clone(&vfs));
    let mut ast = preview_sync_document_ast();
    ast.inputs.insert(
        "abstract_text".to_string(),
        serde_json::json!("Resumen con contenido visible."),
    );
    let status = session.sync_snapshot(ast).unwrap();
    let sync = compile_preview(
        Arc::clone(&vfs),
        status.source_revision,
        status.source_map.clone(),
        status.field_source_map.clone(),
    );

    let result = sync.positions_for_focus(
        &PreviewFocusTarget {
            element_id: "inputs".to_string(),
            field_id: Some("/abstract_text".to_string()),
            caret_utf16_offset: Some(0),
            anchor_page_number: None,
            source_revision: status.source_revision,
        },
        status.source_revision,
    );

    assert!(matches!(
        result,
        PreviewElementPositionsResult::Matched { ref positions, .. }
            if positions
                .iter()
                .any(|position| position.field_id.as_deref() == Some("/abstract_text"))
    ));
}

#[test]
fn focused_heading_caret_position_roundtrips_through_preview_click() {
    let vfs = Arc::new(VirtualFileSystem::new());
    let session = DocumentSession::new(Arc::clone(&vfs));
    let status = session.sync_snapshot(preview_sync_document_ast()).unwrap();
    let sync = compile_preview(
        Arc::clone(&vfs),
        status.source_revision,
        status.source_map.clone(),
        status.field_source_map.clone(),
    );
    let target = PreviewFocusTarget {
        element_id: "heading-ñ".to_string(),
        field_id: Some("heading-ñ:text".to_string()),
        caret_utf16_offset: Some("Introducción".encode_utf16().count()),
        anchor_page_number: None,
        source_revision: status.source_revision,
    };

    let result = sync.positions_for_focus(&target, status.source_revision);
    let position = match result {
        PreviewElementPositionsResult::Matched { positions, .. } => positions
            .into_iter()
            .find(|position| position.field_id.as_deref() == target.field_id.as_deref())
            .expect("expected focused field position"),
        result => panic!("expected matched preview position, got {result:?}"),
    };

    let jump = sync.jump_from_click(
        position.page_number,
        position.x_pt,
        position.y_pt,
        status.source_revision,
    );

    assert!(matches!(
        jump,
        PreviewJumpResult::Field { target: ref actual, .. }
            if actual.element_id == target.element_id
                && actual.field_id == target.field_id
                && actual.caret_utf16_offset == target.caret_utf16_offset
    ));
}

#[test]
fn apa_title_caret_position_roundtrips_through_preview_click() {
    let vfs = Arc::new(VirtualFileSystem::new());
    let session = DocumentSession::new(Arc::clone(&vfs));
    let status = session.sync_snapshot(preview_sync_document_ast()).unwrap();
    let sync = compile_preview(
        Arc::clone(&vfs),
        status.source_revision,
        status.source_map.clone(),
        status.field_source_map.clone(),
    );
    let expected_caret = "Título con ñ".encode_utf16().count();
    let target = PreviewFocusTarget {
        element_id: "inputs".to_string(),
        field_id: Some("/title".to_string()),
        caret_utf16_offset: Some(expected_caret),
        anchor_page_number: None,
        source_revision: status.source_revision,
    };

    let result = sync.positions_for_focus(&target, status.source_revision);
    let position = match result {
        PreviewElementPositionsResult::Matched { positions, .. } => positions
            .into_iter()
            .find(|position| {
                position.field_id.as_deref() == target.field_id.as_deref()
                    && position.caret_cue.is_some()
            })
            .unwrap_or_else(|| panic!("expected focused title caret position")),
        result => panic!("expected matched preview position, got {result:?}"),
    };

    let jump = sync.jump_from_click(
        position.page_number,
        position.x_pt,
        position.y_pt,
        status.source_revision,
    );

    match jump {
        PreviewJumpResult::Field {
            target: ref actual, ..
        } => {
            assert_eq!(actual.element_id, target.element_id);
            assert_eq!(actual.field_id, target.field_id);
            assert_eq!(
                actual.caret_utf16_offset,
                Some(expected_caret),
                "title click at x={} y={} mapped to caret {:?}, expected {expected_caret}",
                position.x_pt,
                position.y_pt,
                actual.caret_utf16_offset,
            );
        }
        result => panic!("expected title field jump, got {result:?}"),
    }
}

#[test]
fn returns_preview_positions_for_nested_template_input_focus_targets() {
    let vfs = Arc::new(VirtualFileSystem::new());
    let session = DocumentSession::new(Arc::clone(&vfs));
    let mut ast = preview_sync_document_ast();
    ast.inputs.insert(
        "affiliations".to_string(),
        serde_json::json!(["Universidad Norte"]),
    );
    ast.inputs.insert(
        "authors".to_string(),
        serde_json::json!([
            {
                "name": "Ada Lovelace",
                "affiliations": ["1"]
            }
        ]),
    );
    let status = session.sync_snapshot(ast).unwrap();
    let sync = compile_preview(
        Arc::clone(&vfs),
        status.source_revision,
        status.source_map.clone(),
        status.field_source_map.clone(),
    );

    for field_id in [
        "/authors/0/name",
        "/authors/0/affiliations/0",
        "/affiliations/0",
    ] {
        let result = sync.positions_for_focus(
            &PreviewFocusTarget {
                element_id: "inputs".to_string(),
                field_id: Some(field_id.to_string()),
                caret_utf16_offset: Some(0),
                anchor_page_number: None,
                source_revision: status.source_revision,
            },
            status.source_revision,
        );

        assert!(
            matches!(
                result,
                PreviewElementPositionsResult::Matched { ref positions, .. }
                    if positions
                        .iter()
                        .any(|position| position.field_id.as_deref() == Some(field_id))
            ),
            "expected matched preview position for {field_id}, got {result:?}",
        );
    }
}

#[test]
fn apa_author_and_affiliation_caret_positions_roundtrip_through_preview_click() {
    let vfs = Arc::new(VirtualFileSystem::new());
    let session = DocumentSession::new(Arc::clone(&vfs));
    let mut ast = preview_sync_document_ast();
    ast.inputs.insert(
        "affiliations".to_string(),
        serde_json::json!(["Universidad Norte"]),
    );
    ast.inputs.insert(
        "authors".to_string(),
        serde_json::json!([
            {
                "name": "Ada Lovelace",
                "affiliations": ["1"]
            }
        ]),
    );
    let status = session.sync_snapshot(ast).unwrap();
    let sync = compile_preview(
        Arc::clone(&vfs),
        status.source_revision,
        status.source_map.clone(),
        status.field_source_map.clone(),
    );

    for (field_id, text) in [
        ("/authors/0/name", "Ada Lovelace"),
        ("/affiliations/0", "Universidad Norte"),
    ] {
        let target = PreviewFocusTarget {
            element_id: "inputs".to_string(),
            field_id: Some(field_id.to_string()),
            caret_utf16_offset: Some(text.encode_utf16().count()),
            anchor_page_number: None,
            source_revision: status.source_revision,
        };
        let result = sync.positions_for_focus(&target, status.source_revision);
        let position = match result {
            PreviewElementPositionsResult::Matched { positions, .. } => positions
                .into_iter()
                .find(|position| {
                    position.field_id.as_deref() == Some(field_id) && position.caret_cue.is_some()
                })
                .unwrap_or_else(|| panic!("expected focused APA caret position for {field_id}")),
            result => {
                panic!("expected matched preview position for {field_id}, got {result:?}")
            }
        };

        let jump = sync.jump_from_click(
            position.page_number,
            position.x_pt,
            position.y_pt,
            status.source_revision,
        );

        assert!(
            matches!(
                jump,
                PreviewJumpResult::Field { target: ref actual, .. }
                    if actual.element_id == target.element_id
                        && actual.field_id == target.field_id
                        && actual.caret_utf16_offset == target.caret_utf16_offset
            ),
            "expected APA preview click to roundtrip to {field_id}, got {jump:?}",
        );
    }
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

    if let DocumentSection::Content(content) = &mut ast.sections[0] {
        if let DocumentElement::Paragraph(paragraph) = &mut content.elements[1] {
            paragraph.content[0].text = "Texto cambiado después del render.".to_string();
        }
    }

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
