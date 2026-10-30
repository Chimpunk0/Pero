use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
};
use tempfile::NamedTempFile;

const MAX_DOCUMENT_BYTES: u64 = 16 * 1024 * 1024;
const MARKDOWN_EXTENSIONS: [&str; 4] = ["md", "markdown", "mdown", "mkd"];

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarkdownDocument {
    path: String,
    name: String,
    contents: String,
    revision: String,
}

fn validate_markdown_path(path: &Path) -> Result<(), String> {
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .map(str::to_lowercase);

    if extension
        .as_deref()
        .is_some_and(|value| MARKDOWN_EXTENSIONS.contains(&value))
    {
        Ok(())
    } else {
        Err("Pero supports Markdown files (.md, .markdown, .mdown, or .mkd).".into())
    }
}

fn revision_for_bytes(contents: &[u8]) -> String {
    Sha256::digest(contents)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn document_from_path(
    path: &Path,
    contents: String,
    revision: String,
) -> Result<MarkdownDocument, String> {
    let canonical = fs::canonicalize(path)
        .map_err(|error| format!("Could not resolve the file path: {error}"))?;
    let name = canonical
        .file_name()
        .map(|value| value.to_string_lossy().into_owned())
        .ok_or_else(|| "The selected path does not have a file name.".to_string())?;
    Ok(MarkdownDocument {
        path: canonical.to_string_lossy().into_owned(),
        name,
        contents,
        revision,
    })
}

pub fn read(path: &str) -> Result<MarkdownDocument, String> {
    let path = PathBuf::from(path);
    validate_markdown_path(&path)?;
    let metadata = fs::metadata(&path).map_err(|error| {
        if error.kind() == std::io::ErrorKind::NotFound {
            "The file was not found. It may have been moved or deleted.".to_string()
        } else {
            format!("Could not inspect the file: {error}")
        }
    })?;
    if !metadata.is_file() {
        return Err("The selected path is not a file.".into());
    }
    if metadata.len() > MAX_DOCUMENT_BYTES {
        return Err("This note is larger than Pero's 16 MB safety limit.".into());
    }

    let bytes = fs::read(&path).map_err(|error| format!("Could not read the file: {error}"))?;
    let revision = revision_for_bytes(&bytes);
    let mut contents = String::from_utf8(bytes)
        .map_err(|_| "This file is not valid UTF-8 text. Pero did not modify it.".to_string())?;
    if contents.starts_with('\u{feff}') {
        contents.remove(0);
    }
    document_from_path(&path, contents, revision)
}

fn ensure_revision_matches(path: &Path, expected_revision: Option<&str>) -> Result<(), String> {
    if !path.exists() && expected_revision.is_some() {
        return Err(
            "The file was deleted or moved after you opened it. Your text was not written. Use Save As to choose a new location."
                .into(),
        );
    }
    if path.exists() {
        if let Some(expected) = expected_revision {
            let current = fs::read(path)
                .map_err(|error| format!("Could not verify the current file: {error}"))?;
            if revision_for_bytes(&current) != expected {
                return Err(
                    "The file changed on disk after you opened it. Your text was not overwritten. Open the file again, or use Save As to keep both versions."
                        .into(),
                );
            }
        }
    }
    Ok(())
}

pub fn atomic_write(
    path: &Path,
    contents: &[u8],
    expected_revision: Option<&str>,
) -> Result<(), String> {
    let parent = path
        .parent()
        .filter(|value| !value.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    if !parent.exists() {
        return Err("The destination folder does not exist.".into());
    }

    let existing_permissions = fs::metadata(path)
        .ok()
        .map(|metadata| metadata.permissions());
    let mut temporary = NamedTempFile::new_in(parent)
        .map_err(|error| format!("Could not create a safe temporary file: {error}"))?;
    temporary
        .write_all(contents)
        .and_then(|_| temporary.as_file().sync_all())
        .map_err(|error| format!("Could not write the file safely: {error}"))?;
    if let Some(permissions) = existing_permissions {
        temporary
            .as_file()
            .set_permissions(permissions)
            .map_err(|error| format!("Could not preserve file permissions: {error}"))?;
    }
    ensure_revision_matches(path, expected_revision)?;
    temporary
        .persist(path)
        .map_err(|error| format!("Could not replace the file safely: {}", error.error))?;
    #[cfg(unix)]
    let _ = fs::File::open(parent).and_then(|directory| directory.sync_all());
    Ok(())
}

// Save As must retain conflict protection when an alias points to the open file.
// Resolve existing destinations before writing so a symlink itself is not replaced.
pub fn write_from_document(
    path: &str,
    contents: &str,
    expected_revision: Option<&str>,
    current_document_path: Option<&str>,
) -> Result<MarkdownDocument, String> {
    validate_markdown_path(Path::new(path))?;
    let destination = if Path::new(path).exists() {
        fs::canonicalize(path).map_err(|error| error.to_string())?
    } else {
        PathBuf::from(path)
    };
    let same_document = current_document_path.is_none_or(|original| {
        Path::new(path) == Path::new(original)
            || fs::canonicalize(original).is_ok_and(|original| original == destination)
    });
    write(
        destination
            .to_str()
            .ok_or("The file path is not valid UTF-8.")?,
        contents,
        if same_document {
            expected_revision
        } else {
            None
        },
    )
}

pub fn write(
    path: &str,
    contents: &str,
    expected_revision: Option<&str>,
) -> Result<MarkdownDocument, String> {
    if contents.len() as u64 > MAX_DOCUMENT_BYTES {
        return Err("This note is larger than Pero's 16 MB safety limit.".into());
    }
    let path = PathBuf::from(path);
    validate_markdown_path(&path)?;

    ensure_revision_matches(&path, expected_revision)?;

    atomic_write(&path, contents.as_bytes(), expected_revision)?;
    document_from_path(
        &path,
        contents.to_string(),
        revision_for_bytes(contents.as_bytes()),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn reads_and_atomically_replaces_markdown() {
        let directory = tempdir().unwrap();
        let path = directory.path().join("note.md");
        fs::write(&path, "first").unwrap();
        let opened = read(path.to_str().unwrap()).unwrap();
        let saved = write(path.to_str().unwrap(), "second", Some(&opened.revision)).unwrap();
        assert_eq!(saved.contents, "second");
        assert_eq!(fs::read_to_string(path).unwrap(), "second");
    }

    #[test]
    fn save_as_to_another_file_does_not_compare_unrelated_revisions() {
        let directory = tempdir().unwrap();
        let original = directory.path().join("original.md");
        let copy = directory.path().join("copy.md");
        fs::write(&original, "original").unwrap();
        let opened = read(original.to_str().unwrap()).unwrap();
        write_from_document(
            copy.to_str().unwrap(),
            "my edit",
            Some(&opened.revision),
            Some(&opened.path),
        )
        .unwrap();
        assert_eq!(fs::read_to_string(copy).unwrap(), "my edit");
        assert_eq!(fs::read_to_string(original).unwrap(), "original");
    }

    #[cfg(unix)]
    #[test]
    fn save_as_through_symlink_still_detects_external_changes() {
        let directory = tempdir().unwrap();
        let original = directory.path().join("original.md");
        let alias = directory.path().join("alias.md");
        fs::write(&original, "original").unwrap();
        std::os::unix::fs::symlink(&original, &alias).unwrap();
        let opened = read(original.to_str().unwrap()).unwrap();
        fs::write(&original, "external edit").unwrap();
        let error = write_from_document(
            alias.to_str().unwrap(),
            "my edit",
            Some(&opened.revision),
            Some(&opened.path),
        )
        .unwrap_err();
        assert!(error.contains("changed on disk"));
        assert_eq!(fs::read_to_string(original).unwrap(), "external edit");
        assert!(fs::symlink_metadata(alias)
            .unwrap()
            .file_type()
            .is_symlink());
    }

    #[test]
    fn rejects_non_markdown_files() {
        let directory = tempdir().unwrap();
        let path = directory.path().join("note.txt");
        fs::write(&path, "text").unwrap();
        assert!(read(path.to_str().unwrap())
            .unwrap_err()
            .contains("Markdown"));
    }

    #[test]
    fn reports_missing_files_without_modifying_anything() {
        let directory = tempdir().unwrap();
        let path = directory.path().join("missing.md");
        assert!(read(path.to_str().unwrap())
            .unwrap_err()
            .contains("not found"));
        assert!(!path.exists());
    }

    #[test]
    fn rejects_non_utf8_notes() {
        let directory = tempdir().unwrap();
        let path = directory.path().join("binary.md");
        fs::write(&path, [0xff, 0xfe, 0xfd]).unwrap();
        assert!(read(path.to_str().unwrap()).unwrap_err().contains("UTF-8"));
    }

    #[test]
    fn refuses_to_overwrite_a_changed_file() {
        let directory = tempdir().unwrap();
        let path = directory.path().join("note.md");
        fs::write(&path, "original").unwrap();
        let opened = read(path.to_str().unwrap()).unwrap();
        fs::write(&path, "changed!").unwrap();
        let error = write(path.to_str().unwrap(), "my edit", Some(&opened.revision)).unwrap_err();
        assert!(error.contains("changed on disk"));
        assert_eq!(fs::read_to_string(path).unwrap(), "changed!");
    }

    #[test]
    fn refuses_to_recreate_a_file_deleted_elsewhere() {
        let directory = tempdir().unwrap();
        let path = directory.path().join("note.md");
        fs::write(&path, "original").unwrap();
        let opened = read(path.to_str().unwrap()).unwrap();
        fs::remove_file(&path).unwrap();
        let error = write(path.to_str().unwrap(), "my edit", Some(&opened.revision)).unwrap_err();
        assert!(error.contains("deleted or moved"));
        assert!(!path.exists());
    }
}
