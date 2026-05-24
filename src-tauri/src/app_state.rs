use std::sync::Arc;

use crate::document_session::DocumentSession;
use crate::vfs::VirtualFileSystem;

pub struct TauriAppState {
    pub vfs: Arc<VirtualFileSystem>,
    pub document_session: Arc<DocumentSession>,
}
