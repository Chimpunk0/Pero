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
- Support four viewing modes:
  - **Source mode**: plain Markdown editing.
  - **Live mode**: Obsidian-style editing with visual formatting and editable Markdown syntax.
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

## Version 1 Implementation Status

Implemented on the `codex/release-markdown-editor` branch:

- [x] CodeMirror Markdown editor with undo, search, line wrapping, and spellcheck.
- [x] Source, Live, Split, and Preview modes.
- [x] Live formatting for headings, emphasis, inline code, links, and clickable tasks.
- [x] Sanitized GitHub-flavoured Markdown preview.
- [x] New, Open, Save, and Save As workflows.
- [x] Atomic Rust writes and content-hash conflict detection for edits made by another app.
- [x] Dirty-state protection before replacing or closing a note.
- [x] System, light, and dark themes with persisted preferences.
- [x] Recent-files menu.
- [x] Keyboard shortcuts, focus states, responsive split mode, and accessible status messages.
- [x] Restrictive content security policy and narrow Tauri permissions.
- [x] Automated frontend security/state tests and Rust file/preference tests.
- [x] Pero application icon and release metadata.

Remaining distribution work requires macOS infrastructure rather than product code: validate the `.app`/DMG on macOS, configure an Apple signing identity, and notarize the final release artifact.

## Version 1 Definition of Done

- Notes are UTF-8 Markdown files no larger than 16 MB.
- Raw HTML may be rendered only after sanitization; scripts, event handlers, forms, embeds, and unsafe URLs are removed.
- New, Open, and Close never discard dirty text without an explicit Discard choice.
- A cancelled or failed Save leaves the current editor text intact and dirty.
- A file changed by another application is never silently overwritten; Save As remains available.
- Switching documents resets editor undo history, so Undo cannot restore a previous file.
- `npm run check`, Rust formatting, Clippy with warnings denied, and Rust tests must pass before release.
- macOS builds must be smoke-tested, signed, and notarized before public distribution.

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

## UI refinement — September 2026

- Rounded paper workspace and one document title inspired by the supplied mockup; multiple document tabs remain future work.
- File actions and recent notes live in native OS menus. Menu actions reuse the existing unsaved-change safeguards.
- A raised view dropdown contains Source, Live, Split, and Preview. Settings contains an Appearance tab with light, dark, and system choices.
- macOS uses an overlay title bar with real traffic-light controls. Windows and Linux retain native decorations to preserve genuine OS controls; removing their title bars requires further platform-specific work.

## Gradual improvement roadmap

Complete and verify each stage before expanding the next one.

### Stage 1: Native menus

- [x] Allow file and Close/Quit actions while Settings is open, dismissing Settings first.
- [x] Checkmark the active view and disable file actions during operations or unsaved-change prompts.
- [x] Expose Find and Replace through Edit, opening an editing mode from Preview.
- [x] Use short recent filenames; include parent paths only for duplicate names.

### Stage 2: Recovery and file safety

- [x] Persist an independent recovery draft and offer restoration after a crash.
- [x] Detect external changes and offer Reload or Keep My Changes without silent overwrites.

### Stage 3: Writing comfort

- [x] Persist font size and writing width for Source, Live, Split, and Preview.
- [ ] Add line-spacing and line-number preferences.
- [ ] Unify remaining editor colors and remove obsolete toolbar styles.
- [ ] Adjustable split divider and optional synchronized scrolling.

### Stage 4: Document continuity

- [ ] Resolve local Markdown images relative to the document with narrowly scoped file access.
- [ ] Optionally reopen the last note and restore cursor/scroll positions.

## Live Preview refinement — October 2026

- Use Obsidian's cursor-focused editing model: inline syntax appears when the cursor or selection enters that formatted span. Unrelated formatting on the same line stays rendered.
- Use proportional text and a readable writing width in Live; retain monospace text, line numbers, and the active-line indicator in Source and Split.
- Render headings, emphasis, strikethrough, inline code, bullets, tasks, blockquotes, fenced code, rules, and standalone tables. Clicking a table cell reveals its Markdown at that cell; Enter also reveals a focused rendered block.
- Render standalone HTTPS images through the existing sanitizer. Local images still require the future document-relative file-access work.
- Open external Markdown links with Cmd/Ctrl-click in Live using the same URL restrictions as Reading view.
- Keep New, Open, Save, Save As, and Open Recent in the native File menu. Remove the obsolete file-row styles; keep the existing unsaved-change safeguards and shortcuts.
- This stage originally targeted core Markdown. The later visual-consistency refinement adds basic callouts and math; local embeds and interactive table cell editing remain outside this version.

## File safety and writing comfort — October 2026

- Cancel document replacement if new edits arrive during the file read. Serialize document transitions across dialogs and reads.
- Keep revision protection for Save As to the current note, including symbolic-link aliases; preserve all supported Markdown extensions in the dialog.
- Write an independent recovery draft to the app configuration directory after 350 ms of inactivity and when leaving the window. Offer Restore or Discard at startup before file actions are enabled. Saved/discarded drafts are removed; original notes are never changed by recovery.
- Check the open note for external changes when returning to the window and every ten seconds while visible. Reload follows the existing unsaved-change confirmation; Keep My Changes directs the next save through Save As. Existing revision checks remain active.
- Add persisted text size (12–24 px) and writing width (600–1100 px) in Appearance. Older preferences receive defaults without losing theme or recent files.

## Visual consistency and Obsidian note readability — October 2026

- Share proportional typography, writing width, surface colors, headings, tables, quotes and task styling between Live and Preview.
- Use restrained toolbar shadows and explicit selected appearance controls.
- Show the current note's parent folders below its filename; retain the full path in the tooltip.
- Render wikilink labels/aliases, highlights, basic callouts and KaTeX formulas in Live and Preview. Editing reveals the original Markdown; saved text remains unchanged.
- Keep callouts expanded, including those with fold markers. Full Obsidian extension compatibility remains outside this version.
- Present local note references with a dotted underline and an explanatory tooltip. Local attachments and note embeds use labeled placeholders until document-relative access is implemented.
- Keep local-note navigation, attachment loading and vault indexing out of this visual refinement.

## Markdown tables — October 2026

- Render GFM pipe tables consistently in Live and Preview, including up to three leading spaces, inline formatting, escaped pipes and column alignment.
- Keep wide tables inside keyboard-focusable horizontal scroll regions instead of widening the note.
- Live tables reveal their original Markdown when a cell is clicked or Enter/Space is used on the focused table; moving the cursor outside renders the table again.
- Preserve sanitized rendering, raw saved Markdown and literal table examples inside fenced code blocks.
