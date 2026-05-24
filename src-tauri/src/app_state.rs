use std::sync::Arc;

use crate::document_session::DocumentSession;
use crate::typst_watch::TypstWatch;
use crate::vfs::VirtualFileSystem;

pub struct TauriAppState {
    pub vfs: Arc<VirtualFileSystem>,
    pub typst_watch: Arc<TypstWatch>,
    pub document_session: Arc<DocumentSession>,
}
