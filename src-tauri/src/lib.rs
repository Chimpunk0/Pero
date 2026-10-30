mod document;
mod menu;
mod preferences;
mod recovery;

use tauri::{AppHandle, Emitter, Manager};

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
    current_document_path: Option<String>,
) -> Result<document::MarkdownDocument, String> {
    tauri::async_runtime::spawn_blocking(move || {
        document::write_from_document(
            &path,
            &contents,
            expected_revision.as_deref(),
            current_document_path.as_deref(),
        )
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

#[tauri::command]
async fn load_recovery(app: AppHandle) -> Result<Option<recovery::RecoveryDraft>, String> {
    let path = preferences_path(&app)?.with_file_name("recovery.json");
    tauri::async_runtime::spawn_blocking(move || recovery::load(&path))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn save_recovery(
    app: AppHandle,
    draft: Option<recovery::RecoveryDraft>,
) -> Result<(), String> {
    let path = preferences_path(&app)?.with_file_name("recovery.json");
    tauri::async_runtime::spawn_blocking(move || recovery::save(&path, draft))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
fn sync_native_menu(
    app: AppHandle,
    recent_files: Vec<preferences::RecentFile>,
    state: menu::MenuState,
) -> Result<(), String> {
    menu::install(&app, &recent_files, &state).map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let preferences = preferences::load(&preferences_path(app.handle())?);
            menu::install(
                app.handle(),
                &preferences.recent_files,
                &menu::MenuState {
                    mode: "live".into(),
                    blocked: true,
                    can_save: false,
                },
            )?;
            Ok(())
        })
        .on_menu_event(|app, event| {
            let _ = app.emit("menu-action", event.id().as_ref());
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            read_markdown_file,
            write_markdown_file,
            load_preferences,
            save_preferences,
            sync_native_menu,
            load_recovery,
            save_recovery
        ])
        .run(tauri::generate_context!())
        .expect("error while running Pero");
}
