# Markdown Editor Project Plan

## Summary

Build a simple, fast, beautiful Markdown editor as a personal learning project in Rust. The app should start small: a reliable Markdown editor for macOS using Tauri, with Rust handling native/backend work and the frontend handling the polished editor interface.

The first goal is not to replace Obsidian. The first goal is to build a useful editor that opens quickly, feels pleasant to write in, and teaches practical programming concepts step by step.

## Core Direction

- Use **Tauri** as the main framework.
- Use **Rust** for native app commands, file access, configuration, and future vault features.
- Use **HTML/CSS/TypeScript** for the user interface.
- Focus on **macOS first**.
- Consider Linux later.
- Consider Windows only after the app feels solid on macOS and Linux.
- Keep **Vizia** as a side experiment, not the foundation of version 1.

## Version 1 Goals

The first version should be intentionally small and finishable.

- Open `.md` files.
- Edit Markdown text.
- Save files.
- Create new Markdown files.
- Support three viewing modes:
  - **Source mode**: plain Markdown editing.
  - **Preview mode**: rendered Markdown reading view.
  - **Split mode**: editor and preview side by side.
- Use a strong editor component, most likely **CodeMirror**.
- Use a proven Markdown renderer.
- Support light and dark themes.
- Provide a clean, modern, calm interface.
- Remember recent files.
- Store simple app preferences locally.

## Design Goals

- The app should feel simple, focused, and modern.
- It should avoid visual clutter.
- It should open quickly and make writing feel direct.
- The editor should be the main focus, not heavy navigation or dashboards.
- Typography, spacing, and color should be treated as important parts of the product.
- The UI should feel native enough on macOS, even though it is built with web technology inside Tauri.

## Styling Ideas

- Start with built-in light and dark themes.
- Allow Markdown preview styling through CSS.
- Later, explore user CSS snippets inspired by Obsidian.
- Keep editor styling and preview styling separate where possible.
- Avoid building a full theme/plugin system too early.

## Future Features

These should come after the basic editor feels good.

- Open a folder as a note collection.
- Link the app to an existing Obsidian vault.
- Show a simple file list for a selected folder or vault.
- Add a quick way to open recently edited notes.
- Add search across files.
- Add tabs.
- Add a command palette.
- Add custom URL scheme support.
- Add file association support for `.md` files.
- Investigate an Obsidian plugin for opening notes in this editor from Obsidian.
- Explore backlinks and note links after vault support exists.

## Obsidian Integration Direction

Obsidian integration should be treated as compatibility with Markdown files and vault folders first.

Version 1 should not try to support:

- Obsidian plugins.
- Obsidian themes.
- Every Obsidian-specific Markdown extension.
- Full graph view behavior.
- Full backlink databases.

Later integration can focus on:

- Opening an Obsidian vault folder.
- Opening Markdown files from that folder.
- Respecting normal wiki links where practical.
- Importing or creating notes inside the vault.
- Possibly using a custom URL scheme or Obsidian plugin for right-click workflows.

## Technical Shape

Frontend:

- Tauri webview UI.
- HTML/CSS/TypeScript.
- CodeMirror for editing.
- Markdown renderer for preview.
- CSS for layout, themes, and preview styling.

Backend:

- Rust Tauri commands.
- File open/save operations.
- App configuration.
- Recent files list.
- Future vault indexing and search.

Local data:

- Store preferences such as theme, last mode, recent files, and optional vault paths.
- Keep the storage format simple at first, likely JSON.

## Suggested Milestones

### Milestone 1: Project Setup

- Create a basic Tauri app.
- Confirm it runs on macOS.
- Learn the project structure.
- Add a simple app window with placeholder editor layout.

### Milestone 2: Basic Editor

- Add CodeMirror.
- Type and edit Markdown text.
- Add basic layout and styling.
- Add source, preview, and split mode controls.

### Milestone 3: Markdown Preview

- Render Markdown into HTML.
- Update preview when text changes.
- Add basic preview typography.
- Add light and dark theme support.

### Milestone 4: File Operations

- Open a Markdown file from disk.
- Save edits back to disk.
- Create a new file.
- Show current file name and unsaved state.

### Milestone 5: Preferences

- Remember theme.
- Remember last selected mode.
- Remember recent files.
- Add a simple recent files area.

### Milestone 6: Polish

- Improve keyboard shortcuts.
- Improve empty states.
- Improve error messages.
- Test with real notes.
- Package the app for macOS.

## Learning Goals

- Learn Rust through practical app features.
- Learn how a desktop app reads and writes files.
- Learn how frontend and Rust communicate in Tauri.
- Learn basic TypeScript, HTML, and CSS as needed.
- Learn how app state, settings, and UI modes work.
- Keep every step small enough to understand.

## Test Plan

- Open a Markdown file and confirm its contents appear correctly.
- Edit the file and save it.
- Reopen the file and confirm changes were saved.
- Create a new Markdown file.
- Switch between source, preview, and split modes.
- Confirm Markdown preview updates when the source text changes.
- Switch between light and dark themes.
- Restart the app and confirm preferences are remembered.
- Test with a few real notes from an Obsidian vault, without modifying the vault structure.

## Non-Goals For Version 1

- Full Obsidian replacement.
- Plugin system.
- Cloud sync.
- Mobile app.
- Collaboration.
- Graph view.
- Complex database.
- Full WYSIWYG editor.
- Advanced Markdown extensions before the core editor works well.

## Assumptions

- This is primarily a personal learning project.
- Tauri is the main path for the real app.
- Vizia may be explored separately for learning and comparison.
- The app should prioritize simplicity and beauty over feature count.
- The first version should be useful even if it only edits local Markdown files.
