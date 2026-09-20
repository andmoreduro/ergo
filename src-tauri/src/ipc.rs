//! Shared helpers for IPC commands.
//!
//! Tauri runs a non-`async` command on the main thread, which on Linux is also
//! the thread that drives the WebView: a slow command freezes painting and
//! input for its whole duration. Commands that do file, archive, font or
//! document-sized work therefore run their body through [`blocking`].
//!
//! Byte payloads never cross IPC as JSON number arrays (four bytes of text per
//! byte, parsed on the UI thread): responses use [`tauri::ipc::Response`] with a
//! raw body, and requests send a raw body with metadata in headers. Several
//! files travel in one raw body as a *file bundle*:
//!
//! ```text
//! u32 count, then per file: u32 path length, path (UTF-8), u32 byte length, bytes
//! ```
//!
//! All integers are little-endian. `src/api/fileBundle.ts` implements the same
//! framing on the frontend.

use ergo_core::core_errors::ErgoError;
use tauri::ipc::{InvokeBody, Request, Response};

/// Runs blocking work on the async runtime's blocking pool.
pub async fn blocking<T, F>(work: F) -> Result<T, ErgoError>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, ErgoError> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|error| ErgoError::Operation {
            message: format!("background task failed: {error}"),
        })?
}

pub fn encode_file_bundle<'a>(files: impl IntoIterator<Item = (&'a str, &'a [u8])>) -> Vec<u8> {
    let files: Vec<(&str, &[u8])> = files.into_iter().collect();
    let total: usize = 4 + files
        .iter()
        .map(|(path, bytes)| 8 + path.len() + bytes.len())
        .sum::<usize>();
    let mut out = Vec::with_capacity(total);
    out.extend_from_slice(&(files.len() as u32).to_le_bytes());
    for (path, bytes) in files {
        out.extend_from_slice(&(path.len() as u32).to_le_bytes());
        out.extend_from_slice(path.as_bytes());
        out.extend_from_slice(&(bytes.len() as u32).to_le_bytes());
        out.extend_from_slice(bytes);
    }
    out
}

pub fn decode_file_bundle(bytes: &[u8]) -> Result<Vec<(String, Vec<u8>)>, ErgoError> {
    fn read_u32(bytes: &[u8], offset: &mut usize) -> Result<usize, ErgoError> {
        let end = *offset + 4;
        let slice = bytes.get(*offset..end).ok_or_else(|| ErgoError::Operation {
            message: "truncated file bundle".to_string(),
        })?;
        *offset = end;
        Ok(u32::from_le_bytes([slice[0], slice[1], slice[2], slice[3]]) as usize)
    }
    fn read_slice<'a>(bytes: &'a [u8], offset: &mut usize, len: usize) -> Result<&'a [u8], ErgoError> {
        let end = *offset + len;
        let slice = bytes.get(*offset..end).ok_or_else(|| ErgoError::Operation {
            message: "truncated file bundle".to_string(),
        })?;
        *offset = end;
        Ok(slice)
    }

    let mut offset = 0;
    let count = read_u32(bytes, &mut offset)?;
    let mut files = Vec::with_capacity(count.min(1024));
    for _ in 0..count {
        let path_len = read_u32(bytes, &mut offset)?;
        let path = String::from_utf8(read_slice(bytes, &mut offset, path_len)?.to_vec())
            .map_err(|_| ErgoError::Operation {
                message: "file bundle path is not UTF-8".to_string(),
            })?;
        let byte_len = read_u32(bytes, &mut offset)?;
        let content = read_slice(bytes, &mut offset, byte_len)?.to_vec();
        files.push((path, content));
    }
    Ok(files)
}

/// A raw IPC response carrying a file bundle.
pub fn file_bundle_response<'a>(files: impl IntoIterator<Item = (&'a str, &'a [u8])>) -> Response {
    Response::new(encode_file_bundle(files))
}

/// The raw body of a request that was sent with a byte payload.
pub fn raw_body(request: &Request<'_>) -> Result<Vec<u8>, ErgoError> {
    match request.body() {
        InvokeBody::Raw(bytes) => Ok(bytes.clone()),
        InvokeBody::Json(_) => Err(ErgoError::Operation {
            message: "expected a raw byte body".to_string(),
        }),
    }
}

/// A percent-encoded (`encodeURIComponent`) text header of a raw request.
pub fn header_text(request: &Request<'_>, name: &str) -> Result<String, ErgoError> {
    let value = request
        .headers()
        .get(name)
        .and_then(|value| value.to_str().ok())
        .ok_or_else(|| ErgoError::Operation {
            message: format!("missing request header {name}"),
        })?;
    percent_decode(value).ok_or_else(|| ErgoError::Operation {
        message: format!("request header {name} is not valid percent-encoded UTF-8"),
    })
}

fn percent_decode(value: &str) -> Option<String> {
    let bytes = value.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' {
            let hex = std::str::from_utf8(bytes.get(index + 1..index + 3)?).ok()?;
            out.push(u8::from_str_radix(hex, 16).ok()?);
            index += 3;
        } else {
            out.push(bytes[index]);
            index += 1;
        }
    }
    String::from_utf8(out).ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn file_bundle_round_trips_paths_and_bytes() {
        let files: Vec<(String, Vec<u8>)> = vec![
            ("assets/ñandú.png".to_string(), vec![0, 255, 1, 2]),
            ("empty".to_string(), Vec::new()),
        ];
        let encoded = encode_file_bundle(
            files.iter().map(|(path, bytes)| (path.as_str(), bytes.as_slice())),
        );
        assert_eq!(decode_file_bundle(&encoded).unwrap(), files);
        assert!(decode_file_bundle(&encoded[..encoded.len() - 1]).is_err());
        assert_eq!(decode_file_bundle(&encode_file_bundle([])).unwrap(), Vec::new());
    }

    #[test]
    fn percent_decoding_matches_encode_uri_component() {
        assert_eq!(
            percent_decode("%2Fhome%2Fada%2Fmi%20tesis%20%C3%B1.pdf").as_deref(),
            Some("/home/ada/mi tesis ñ.pdf")
        );
        assert_eq!(percent_decode("%zz"), None);
    }
}
