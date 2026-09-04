# Pero

Pero is a focused desktop Markdown editor built with Tauri, Rust, React, and CodeMirror. It reads and writes ordinary local Markdown files, so the same notes can also be used in Obsidian or any other Markdown tool.

## What works

- Create, open, edit, and safely save `.md`, `.markdown`, `.mdown`, and `.mkd` files.
- Source, Obsidian-style Live, Split, and Preview modes.
- GitHub-flavoured Markdown preview with sanitized user HTML.
- Clickable task checkboxes in Live mode.
- System, light, and dark themes.
- Recent files and remembered preferences.
- Unsaved-change protection for New, Open, and window close.
- External-change detection, so a file edited by Obsidian is not silently overwritten.
- `Cmd/Ctrl+N`, `Cmd/Ctrl+O`, `Cmd/Ctrl+S`, `Cmd/Ctrl+Shift+S`, and `Cmd/Ctrl+1…4` shortcuts.

## Run it locally

Requirements: Node.js 20+, Rust stable, and the [Tauri 2 platform prerequisites](https://v2.tauri.app/start/prerequisites/).

```bash
npm ci
npm run tauri dev
```

The plain browser preview is available with `npm run dev`, but native Open and Save dialogs only work inside Tauri.

## Verify it

```bash
npm run check
cd src-tauri
cargo fmt --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test --locked
```

## Build a desktop bundle

```bash
npm run tauri build
```

macOS distribution builds still need an Apple Developer signing identity and notarization credentials. The app itself does not require an Obsidian installation and never changes a vault's folder structure.

## Project map

- `src/App.tsx` — document lifecycle and main interface.
- `src/components/MarkdownEditor.tsx` — CodeMirror and Live mode.
- `src/components/MarkdownPreview.tsx` — safe rendered preview.
- `src/lib/platform.ts` — narrow bridge between React and Tauri.
- `src-tauri/src/document.rs` — validated reads, conflict detection, atomic writes.
- `src-tauri/src/preferences.rs` — local preferences and recent files.

The code intentionally stays small and direct so it can double as a Rust/Tauri learning project.
