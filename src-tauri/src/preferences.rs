use crate::document::atomic_write;
use serde::{Deserialize, Serialize};
use std::{collections::HashSet, fs, path::Path};

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentFile {
    path: String,
    name: String,
    opened_at: f64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Preferences {
    theme: String,
    view_mode: String,
    recent_files: Vec<RecentFile>,
}

impl Default for Preferences {
    fn default() -> Self {
        Self {
            theme: "system".into(),
            view_mode: "live".into(),
            recent_files: Vec::new(),
        }
    }
}

fn normalized(mut preferences: Preferences) -> Preferences {
    if !["system", "light", "dark"].contains(&preferences.theme.as_str()) {
        preferences.theme = "system".into();
    }
    if !["source", "live", "split", "preview"].contains(&preferences.view_mode.as_str()) {
        preferences.view_mode = "live".into();
    }
    preferences.recent_files.retain(|file| {
        !file.path.trim().is_empty() && !file.name.trim().is_empty() && file.opened_at.is_finite()
    });
    preferences.recent_files.sort_by(|a, b| {
        b.opened_at
            .partial_cmp(&a.opened_at)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    let mut seen_paths = HashSet::new();
    preferences
        .recent_files
        .retain(|file| seen_paths.insert(file.path.clone()));
    preferences.recent_files.truncate(10);
    preferences
}

pub fn load(path: &Path) -> Preferences {
    let Ok(contents) = fs::read_to_string(path) else {
        return Preferences::default();
    };
    serde_json::from_str::<Preferences>(&contents)
        .map(normalized)
        .unwrap_or_default()
}

pub fn save(path: &Path, preferences: Preferences) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Could not create the preferences folder: {error}"))?;
    }
    let json = serde_json::to_vec_pretty(&normalized(preferences))
        .map_err(|error| format!("Could not encode preferences: {error}"))?;
    atomic_write(path, &json, None)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn corrupt_preferences_fall_back_to_defaults() {
        let directory = tempdir().unwrap();
        let path = directory.path().join("preferences.json");
        fs::write(&path, "not json").unwrap();
        let preferences = load(&path);
        assert_eq!(preferences.theme, "system");
        assert_eq!(preferences.view_mode, "live");
    }

    #[test]
    fn preferences_round_trip() {
        let directory = tempdir().unwrap();
        let path = directory.path().join("nested").join("preferences.json");
        let preferences = Preferences {
            theme: "dark".into(),
            view_mode: "split".into(),
            recent_files: vec![RecentFile {
                path: "/tmp/note.md".into(),
                name: "note.md".into(),
                opened_at: 10.0,
            }],
        };
        save(&path, preferences).unwrap();
        let loaded = load(&path);
        assert_eq!(loaded.theme, "dark");
        assert_eq!(loaded.recent_files.len(), 1);
    }

    #[test]
    fn duplicate_recent_paths_are_removed_even_when_separated() {
        let preferences = Preferences {
            theme: "system".into(),
            view_mode: "live".into(),
            recent_files: vec![
                RecentFile {
                    path: "/a.md".into(),
                    name: "new a".into(),
                    opened_at: 3.0,
                },
                RecentFile {
                    path: "/b.md".into(),
                    name: "b".into(),
                    opened_at: 2.0,
                },
                RecentFile {
                    path: "/a.md".into(),
                    name: "old a".into(),
                    opened_at: 1.0,
                },
            ],
        };
        let normalized = normalized(preferences);
        assert_eq!(normalized.recent_files.len(), 2);
        assert_eq!(normalized.recent_files[0].name, "new a");
    }
}
