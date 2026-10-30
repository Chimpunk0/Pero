use crate::preferences::RecentFile;
use tauri::{
    menu::{CheckMenuItemBuilder, MenuBuilder, MenuItemBuilder, SubmenuBuilder},
    AppHandle,
};

#[derive(Default, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MenuState {
    pub mode: String,
    pub blocked: bool,
    pub can_save: bool,
}

// Only duplicate filenames need a path. Keep names readable in normal use.
fn recent_label(file: &RecentFile, files: &[RecentFile]) -> String {
    if files.iter().filter(|other| other.name == file.name).count() > 1 {
        let parent = std::path::Path::new(&file.path)
            .parent()
            .unwrap_or_else(|| std::path::Path::new(""));
        format!("{} — {}", file.name, parent.display())
    } else {
        file.name.clone()
    }
}

pub fn install(
    app: &AppHandle,
    recent_files: &[RecentFile],
    state: &MenuState,
) -> tauri::Result<()> {
    let settings = MenuItemBuilder::with_id("settings", "Settings…")
        .accelerator("CmdOrCtrl+,")
        .build(app)?;
    let quit = MenuItemBuilder::with_id("quit", "Quit Pero")
        .enabled(!state.blocked)
        .accelerator("CmdOrCtrl+Q")
        .build(app)?;
    let application = SubmenuBuilder::new(app, "Pero")
        .about(None)
        .separator()
        .item(&settings)
        .separator()
        .services()
        .separator()
        .hide()
        .hide_others()
        .show_all()
        .separator()
        .item(&quit)
        .build()?;
    let mut recent = SubmenuBuilder::new(app, "Open Recent");
    if recent_files.is_empty() {
        recent = recent.item(
            &MenuItemBuilder::new("No recent notes")
                .enabled(false)
                .build(app)?,
        );
    }
    for file in recent_files {
        recent = recent.item(
            &MenuItemBuilder::with_id(
                format!("recent:{}", file.path),
                recent_label(file, recent_files),
            )
            .enabled(!state.blocked)
            .build(app)?,
        );
    }
    let recent = recent
        .separator()
        .item(
            &MenuItemBuilder::with_id("clear-recent", "Clear Recent Notes")
                .enabled(!state.blocked && !recent_files.is_empty())
                .build(app)?,
        )
        .build()?;
    let mut file = SubmenuBuilder::new(app, "File");
    for (id, label, shortcut) in [
        ("new", "New", "CmdOrCtrl+N"),
        ("open", "Open…", "CmdOrCtrl+O"),
        ("save", "Save", "CmdOrCtrl+S"),
        ("save-as", "Save As…", "CmdOrCtrl+Shift+S"),
    ] {
        file = file.item(
            &MenuItemBuilder::with_id(id, label)
                .enabled(!state.blocked && (id != "save" || state.can_save))
                .accelerator(shortcut)
                .build(app)?,
        );
    }
    let file = file
        .item(&recent)
        .separator()
        .item(
            &MenuItemBuilder::with_id("close", "Close Window")
                .enabled(!state.blocked)
                .accelerator("CmdOrCtrl+W")
                .build(app)?,
        )
        .build()?;
    let edit = SubmenuBuilder::new(app, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .separator()
        .item(
            &MenuItemBuilder::with_id("find", "Find…")
                .accelerator("CmdOrCtrl+F")
                .enabled(!state.blocked)
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("replace", "Find and Replace…")
                .accelerator("CmdOrCtrl+Alt+F")
                .enabled(!state.blocked)
                .build(app)?,
        )
        .build()?;
    let mut view = SubmenuBuilder::new(app, "View");
    for (index, mode) in ["Source", "Live", "Split", "Preview"].iter().enumerate() {
        view = view.item(
            &CheckMenuItemBuilder::with_id(format!("mode:{}", mode.to_lowercase()), mode)
                .checked(state.mode == mode.to_lowercase())
                .enabled(!state.blocked)
                .accelerator(format!("CmdOrCtrl+{}", index + 1))
                .build(app)?,
        );
    }
    let view = view.separator().item(&settings).build()?;
    let window = SubmenuBuilder::new(app, "Window")
        .minimize()
        .maximize()
        .build()?;
    let mut menu = MenuBuilder::new(app);
    if cfg!(target_os = "macos") {
        menu = menu.item(&application);
    }
    menu = menu.items(&[&file, &edit, &view, &window]);
    if !cfg!(target_os = "macos") {
        menu = menu.item(
            &SubmenuBuilder::new(app, "Help")
                .about(None)
                .item(&quit)
                .build()?,
        );
    }
    app.set_menu(menu.build()?)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recent_names_only_include_paths_when_ambiguous() {
        let files: Vec<RecentFile> = serde_json::from_value(serde_json::json!([
            {"path": "/work/note.md", "name": "note.md", "openedAt": 3},
            {"path": "/home/note.md", "name": "note.md", "openedAt": 2},
            {"path": "/work/todo.md", "name": "todo.md", "openedAt": 1}
        ]))
        .unwrap();
        assert_eq!(recent_label(&files[0], &files), "note.md — /work");
        assert_eq!(recent_label(&files[1], &files), "note.md — /home");
        assert_eq!(recent_label(&files[2], &files), "todo.md");
    }
}
