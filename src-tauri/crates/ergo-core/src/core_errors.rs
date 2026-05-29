use thiserror::Error;

#[derive(Debug, Error, PartialEq, Eq)]
pub enum VfsError {
    #[error("{0}")]
    Operation(String),
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum PreviewSyncError {
    #[error("{0}")]
    Unavailable(String),
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum ArchiveError {
    #[error("{0}")]
    Operation(String),
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum CompileError {
    #[error("{0}")]
    Operation(String),
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum SettingsError {
    #[error("{0}")]
    Operation(String),
}
