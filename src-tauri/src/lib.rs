mod document;
mod preferences;

use tauri::{AppHandle, Manager};

fn preferences_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|directory| directory.join("preferences.json"))
        .map_err(|error| format!("Could not locate the preferences folder: {error}"))
}

#[tauri::command]
async fn read_markdown_file(path: String) -> Result<document::MarkdownDocument, String> {
    tauri::async_runtime::spawn_blocking(move || document::read(&path))
        .await
        .map_err(|error| format!("The file task could not be completed: {error}"))?
}

#[tauri::command]
async fn write_markdown_file(
    path: String,
    contents: String,
    expected_revision: Option<String>,
) -> Result<document::MarkdownDocument, String> {
    tauri::async_runtime::spawn_blocking(move || {
        document::write(&path, &contents, expected_revision.as_deref())
    })
    .await
    .map_err(|error| format!("The file task could not be completed: {error}"))?
}

#[tauri::command]
async fn load_preferences(app: AppHandle) -> Result<preferences::Preferences, String> {
    let path = preferences_path(&app)?;
    tauri::async_runtime::spawn_blocking(move || preferences::load(&path))
        .await
        .map_err(|error| format!("Preferences could not be loaded: {error}"))
}

#[tauri::command]
async fn save_preferences(
    app: AppHandle,
    preferences: preferences::Preferences,
) -> Result<(), String> {
    let path = preferences_path(&app)?;
    tauri::async_runtime::spawn_blocking(move || preferences::save(&path, preferences))
        .await
        .map_err(|error| format!("Preferences could not be saved: {error}"))?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            read_markdown_file,
            write_markdown_file,
            load_preferences,
            save_preferences
        ])
        .run(tauri::generate_context!())
        .expect("error while running Pero");
}
