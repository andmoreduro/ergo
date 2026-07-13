use serde::{Deserialize, Serialize};
use thiserror::Error;
use ts_rs::TS;

/// Single cross-cutting error type for Érgo.
///
/// Variants carry the structured fields each failure category actually has, so
/// callers (and, via ts-rs, the frontend) can discriminate on `kind` instead of
/// substring-matching a free-form string. The `Display` text is stable — tests
/// and the frontend rely on it — so each `#[error(...)]` attribute is part of
/// the contract.
///
/// `Operation` is the generic fallback for host-side IO/serde/zip failures that
/// don't deserve their own variant; its `message` is the underlying error text.
#[derive(Debug, Error, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(tag = "kind", rename_all = "camelCase")]
#[ts(export)]
pub enum ErgoError {
    /// An element was the wrong variant for the operation (e.g. editing a
    /// heading field on a paragraph).
    #[error("element {element_id} is not a {expected}")]
    ElementType {
        element_id: String,
        expected: &'static str,
    },

    /// A backend input/asset path didn't match the `/key(/key)*` shape.
    #[error("invalid path format: {path}")]
    InvalidPath { path: String },

    /// A path segment that should have been an array index wasn't numeric.
    #[error("invalid array index '{index}'")]
    InvalidArrayIndex { index: String },

    /// The path parsed but named nothing that exists in the document.
    #[error("path {path} was not found")]
    PathNotFound { path: String },

    /// The path named an existing value but traversal expected an array.
    #[error("target at path {path} is not an array")]
    NotArray { path: String },

    /// The path tried to descend into a scalar (leaf) value.
    #[error("cannot traverse non-container at path {path}")]
    NotContainer { path: String },

    /// An empty path was supplied where a non-empty one is required.
    #[error("path cannot be empty")]
    EmptyPath,

    /// VFS lookup miss for a path that should exist.
    #[error("file not found: {path}")]
    VfsNotFound { path: String },

    /// Byte-range patch bounds were invalid.
    #[error("Invalid patch range")]
    InvalidPatchRange,

    /// Typst compilation produced diagnostics.
    #[error("compile failed:\n{diagnostics}")]
    Compile { diagnostics: String },

    /// Project archive (`.ergproj`) read/write failure.
    #[error("archive: {message}")]
    Archive { message: String },

    /// The `.ergproj/document_state.json` sidecar is missing on open.
    #[error(".ergproj/document_state.json is required")]
    DocumentStateRequired,

    /// Generic fallback for host-side IO, serde, docker, zip, and similar
    /// errors whose taxonomy is not load-bearing. The `message` is the
    /// underlying error's `to_string()`.
    #[error("{message}")]
    Operation { message: String },
}
