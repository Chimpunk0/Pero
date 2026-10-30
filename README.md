# Pero

Pero is a focused desktop Markdown editor built with Tauri, Rust, React, and CodeMirror. It reads and writes ordinary local Markdown files, so the same notes can also be used in Obsidian or any other Markdown tool.

## What works

- Create, open, edit, and safely save `.md`, `.markdown`, `.mdown`, and `.mkd` files.
- Source, Obsidian-style Live, Split, and Preview modes.
- GitHub-flavoured Markdown preview with sanitized user HTML.
- Live mode hides syntax outside the formatted text being edited, with proportional typography, rendered lists, quotes, code blocks, tables, and clickable tasks.
- New, Open, Save, Save As, and Open Recent live in the native File menu.
- Cmd/Ctrl-click external links in Live mode; click a rendered table to edit its Markdown.
- Consistent Live/Preview typography, writing width, tables and task styling.
- Wikilink labels and aliases, highlights, expanded callouts, and inline/display math via bundled KaTeX.
- Local note links are labeled references; local images and note embeds show attachment placeholders. Vault navigation and local attachment loading are not yet supported.
- The current note's parent folders appear below its filename; hover for the full path.
- System, light, and dark themes.
- Recent files and remembered preferences, including text size and writing width.
- Independent recovery drafts with Restore/Discard after an unexpected exit.
- Unsaved-change protection for New, Open, and window close.
- External-change detection with Reload or Keep My Changes; Save As preserves conflict protection when selecting the open file.
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
- `src-tauri/src/recovery.rs` — independent, atomic recovery snapshots.

The code intentionally stays small and direct so it can double as a Rust/Tauri learning project.

## Recovery and external changes

Unsaved text is copied to `recovery.json` in Tauri's application configuration directory after 350 ms without edits, and when the window loses focus. This is a local, unencrypted recovery copy, separate from your Markdown file. At the next launch, Restore brings the draft back into the editor; Discard deletes only the recovery copy. Recovery is cleared after saving or explicitly discarding changes when closing. A crash can still lose edits made since the last completed snapshot. If a draft is damaged, it is kept for manual recovery and new recovery writes are disabled for that session.

Pero checks the open file on window focus and every ten seconds while visible. Reload asks before discarding unsaved edits. Keep My Changes retains your text and directs Save to Save As, where you can choose a separate file. Selecting the original file still checks its revision and rejects a conflicting overwrite.

## Tables

Live and Preview render Markdown pipe tables, including aligned columns and inline formatting:

```markdown
| Item        | Value |
| :---------- | ----: |
| **Example** |    42 |
```

In Live, click a cell (or focus the table and press Enter) to edit its Markdown. Move the cursor outside the table to render it again. Wide tables scroll horizontally; `\|` inserts a literal pipe inside a cell.
