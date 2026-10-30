use crate::document::atomic_write;
use serde::{Deserialize, Serialize};
use std::{fs, path::Path};

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryDraft {
    path: Option<String>,
    name: String,
    content: String,
    saved_content: String,
    revision: Option<String>,
    line_separator: String,
}

pub fn load(path: &Path) -> Result<Option<RecoveryDraft>, String> {
    match fs::read(path) {
        Ok(bytes) => serde_json::from_slice(&bytes).map(Some).map_err(|_| {
            "The recovery draft is damaged. Its file has been kept for manual recovery.".into()
        }),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(format!("Could not read the recovery draft: {error}")),
    }
}

pub fn save(path: &Path, draft: Option<RecoveryDraft>) -> Result<(), String> {
    let Some(draft) = draft else {
        return match fs::remove_file(path) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(format!("Could not remove the recovery draft: {error}")),
        };
    };
    if !["\n", "\r\n", "\r"].contains(&draft.line_separator.as_str()) {
        return Err("Invalid recovery line separator.".into());
    }
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let bytes = serde_json::to_vec(&draft).map_err(|error| error.to_string())?;
    atomic_write(path, &bytes, None)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn draft_survives_restart_and_can_be_discarded_without_touching_note() {
        let directory = tempfile::tempdir().unwrap();
        let note = directory.path().join("note.md");
        let path = directory.path().join("recovery.json");
        fs::write(&note, "original").unwrap();
        let draft = RecoveryDraft {
            path: Some(note.to_string_lossy().into_owned()),
            name: "note.md".into(),
            content: "unsaved changes".into(),
            saved_content: "original".into(),
            revision: Some("old revision".into()),
            line_separator: "\r\n".into(),
        };
        save(&path, Some(draft)).unwrap();
        let restored = load(&path).unwrap().unwrap();
        assert_eq!(restored.content, "unsaved changes");
        assert_eq!(restored.revision.as_deref(), Some("old revision"));
        assert_eq!(restored.line_separator, "\r\n");
        save(&path, None).unwrap();
        assert!(load(&path).unwrap().is_none());
        assert_eq!(fs::read_to_string(note).unwrap(), "original");
    }

    #[test]
    fn damaged_draft_is_reported_and_preserved() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("recovery.json");
        fs::write(&path, "damaged").unwrap();
        assert!(load(&path).is_err());
        assert_eq!(fs::read_to_string(path).unwrap(), "damaged");
    }
}
