use std::sync::Arc;

use crate::compilation_queue::CompilationQueue;
use crate::document_session::DocumentSession;
use crate::preview_sync::PreviewSyncState;
use crate::vfs::VirtualFileSystem;

pub struct TauriAppState {
    pub vfs: Arc<VirtualFileSystem>,
    pub compilation_queue: Arc<CompilationQueue>,
    pub document_session: Arc<DocumentSession>,
    pub preview_sync: Arc<PreviewSyncState>,
}
