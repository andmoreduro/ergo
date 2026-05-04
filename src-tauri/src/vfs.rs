use parking_lot::RwLock;
use serde::Serialize;
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};
use ts_rs::TS;
use typst::syntax::{FileId, Source, VirtualPath};

pub struct VirtualFileSystem {
    memory_sources: RwLock<HashMap<String, RetainedTextFile>>,
    memory_files: RwLock<HashMap<String, Vec<u8>>>,
    next_revision: AtomicU64,
}

#[derive(Clone)]
struct RetainedTextFile {
    source: Source,
    revision: u64,
    last_modified: u64,
}

#[derive(Clone, Debug, Serialize, TS)]
#[ts(export, export_to = "../../src/bindings/")]
#[serde(rename_all = "camelCase")]
pub struct VirtualTextFile {
    pub path: String,
    pub text: String,
    pub revision: u64,
    pub last_modified: u64,
}

impl VirtualFileSystem {
    pub fn new() -> Self {
        Self {
            memory_sources: RwLock::new(HashMap::new()),
            memory_files: RwLock::new(HashMap::new()),
            next_revision: AtomicU64::new(1),
        }
    }

    pub fn read_source(&self, path: &str) -> Result<String, String> {
        let path = normalize_path(path);
        self.memory_sources
            .read()
            .get(&path)
            .map(|file| file.source.text().to_string())
            .ok_or_else(|| format!("File not found: {}", path))
    }

    pub fn read_typst_source(&self, path: &str) -> Result<Source, String> {
        let path = normalize_path(path);
        self.memory_sources
            .read()
            .get(&path)
            .map(|file| file.source.clone())
            .ok_or_else(|| format!("File not found: {}", path))
    }

    pub fn read_text_file(&self, path: &str) -> Result<VirtualTextFile, String> {
        let path = normalize_path(path);
        self.memory_sources
            .read()
            .get(&path)
            .map(|file| VirtualTextFile {
                path: path.clone(),
                text: file.source.text().to_string(),
                revision: file.revision,
                last_modified: file.last_modified,
            })
            .ok_or_else(|| format!("File not found: {}", path))
    }

    pub fn source_revision(&self, path: &str) -> Result<u64, String> {
        let path = normalize_path(path);
        self.memory_sources
            .read()
            .get(&path)
            .map(|file| file.revision)
            .ok_or_else(|| format!("File not found: {}", path))
    }

    pub fn latest_revision(&self) -> u64 {
        self.next_revision.load(Ordering::SeqCst).saturating_sub(1)
    }

    pub fn has_file(&self, path: &str) -> bool {
        let path = normalize_path(path);
        self.memory_sources.read().contains_key(&path)
            || self.memory_files.read().contains_key(&path)
    }

    pub fn write_source(&self, path: &str, content: String) -> u64 {
        let path = normalize_path(path);
        let revision = self.next_revision.fetch_add(1, Ordering::SeqCst);
        let mut sources = self.memory_sources.write();

        if let Some(file) = sources.get_mut(&path) {
            file.source.replace(&content);
            file.revision = revision;
            file.last_modified = now_millis();
            return revision;
        }

        sources.insert(
            path.clone(),
            RetainedTextFile {
                source: Source::new(file_id_for_path(&path), content),
                revision,
                last_modified: now_millis(),
            },
        );
        revision
    }

    pub fn read_file(&self, path: &str) -> Result<Vec<u8>, String> {
        let path = normalize_path(path);
        if let Some(file) = self.memory_sources.read().get(&path) {
            return Ok(file.source.text().as_bytes().to_vec());
        }

        self.memory_files
            .read()
            .get(&path)
            .cloned()
            .ok_or_else(|| format!("File not found: {}", path))
    }

    pub fn write_file(&self, path: &str, content: Vec<u8>) {
        self.memory_files
            .write()
            .insert(normalize_path(path), content);
    }

    pub fn apply_patch(
        &self,
        path: &str,
        start: usize,
        end: usize,
        text: &str,
    ) -> Result<(), String> {
        let path = normalize_path(path);
        let mut sources = self.memory_sources.write();
        if let Some(file) = sources.get_mut(&path) {
            let content = file.source.text();
            let char_count = content.chars().count();
            if start <= end && end <= char_count {
                let byte_start: usize = content.chars().take(start).map(|c| c.len_utf8()).sum();
                let byte_end: usize = byte_start
                    + content
                        .chars()
                        .skip(start)
                        .take(end - start)
                        .map(|c| c.len_utf8())
                        .sum::<usize>();

                file.source.edit(byte_start..byte_end, text);
                file.revision = self.next_revision.fetch_add(1, Ordering::SeqCst);
                file.last_modified = now_millis();
                Ok(())
            } else {
                Err("Invalid patch range".to_string())
            }
        } else {
            Err("File not found".to_string())
        }
    }

    pub fn clear(&self) {
        self.memory_sources.write().clear();
        self.memory_files.write().clear();
    }

    pub fn remove_path(&self, path: &str) {
        let path = normalize_path(path);
        self.memory_sources.write().remove(&path);
        self.memory_files.write().remove(&path);
    }

    pub fn get_all_files(&self) -> HashMap<String, Vec<u8>> {
        let mut files = self.memory_files.read().clone();
        for (path, file) in self.memory_sources.read().iter() {
            files.insert(path.clone(), file.source.text().as_bytes().to_vec());
        }
        files
    }
}

fn file_id_for_path(path: &str) -> FileId {
    FileId::new(None, VirtualPath::new(&normalize_path(path)))
}

fn normalize_path(path: &str) -> String {
    path.replace('\\', "/")
}

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

impl Default for VirtualFileSystem {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_vfs_read_write() {
        let vfs = VirtualFileSystem::new();
        let first_revision = vfs.write_source("main.typ", "Hello Typst".to_string());
        assert_eq!(vfs.read_source("main.typ").unwrap(), "Hello Typst");
        assert_eq!(vfs.read_file("main.typ").unwrap(), b"Hello Typst");
        assert_eq!(vfs.source_revision("main.typ").unwrap(), first_revision);

        let second_revision = vfs.write_source("main.typ", "Hello Érgo".to_string());
        assert!(second_revision > first_revision);
        assert_eq!(vfs.read_source("main.typ").unwrap(), "Hello Érgo");
        assert_eq!(
            vfs.read_typst_source("main.typ").unwrap().text(),
            "Hello Érgo"
        );
    }

    #[test]
    fn test_vfs_binary_read_write() {
        let vfs = VirtualFileSystem::new();
        vfs.write_file("exports/page-1.png", vec![137, 80, 78, 71]);

        assert_eq!(
            vfs.read_file("exports/page-1.png").unwrap(),
            vec![137, 80, 78, 71]
        );
    }

    #[test]
    fn test_vfs_apply_patch_ascii() {
        let vfs = VirtualFileSystem::new();
        vfs.write_source("main.typ", "Hello World".to_string());

        // Replace "World" with "Typst" (indices 6 to 11)
        vfs.apply_patch("main.typ", 6, 11, "Typst").unwrap();
        assert_eq!(vfs.read_source("main.typ").unwrap(), "Hello Typst");

        // Insert at beginning
        vfs.apply_patch("main.typ", 0, 0, "Well, ").unwrap();
        assert_eq!(vfs.read_source("main.typ").unwrap(), "Well, Hello Typst");
    }

    #[test]
    fn test_vfs_apply_patch_unicode() {
        let vfs = VirtualFileSystem::new();
        // '🌍' is 1 char, 4 bytes. 'é' is 1 char, 2 bytes.
        vfs.write_source("main.typ", "Hello 🌍! Érgo".to_string());

        // Replace "🌍" with "World" (char index 6 to 7)
        vfs.apply_patch("main.typ", 6, 7, "World").unwrap();
        assert_eq!(vfs.read_source("main.typ").unwrap(), "Hello World! Érgo");
        assert_eq!(
            vfs.read_typst_source("main.typ").unwrap().text(),
            "Hello World! Érgo"
        );

        // Replace "É" with "E" (char index 13 to 14)
        vfs.apply_patch("main.typ", 13, 14, "E").unwrap();
        assert_eq!(vfs.read_source("main.typ").unwrap(), "Hello World! Ergo");
    }

    #[test]
    fn test_vfs_apply_patch_multiline_and_revision() {
        let vfs = VirtualFileSystem::new();
        let first_revision = vfs.write_source("main.typ", "uno\ndos\ntres".to_string());

        vfs.apply_patch("main.typ", 4, 7, "dós\ncuatro").unwrap();

        let patched = "uno\ndós\ncuatro\ntres";
        assert_eq!(vfs.read_source("main.typ").unwrap(), patched);
        assert_eq!(vfs.read_typst_source("main.typ").unwrap().text(), patched);
        assert!(vfs.source_revision("main.typ").unwrap() > first_revision);
    }

    #[test]
    fn test_vfs_apply_patch_out_of_bounds() {
        let vfs = VirtualFileSystem::new();
        vfs.write_source("main.typ", "Hello".to_string());

        // Try to patch beyond the string length
        let result = vfs.apply_patch("main.typ", 0, 10, "No");
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "Invalid patch range");
    }
}
