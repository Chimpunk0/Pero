# macOS continuation handoff for an AI agent

You are continuing work on **Pero**, a small, focused Markdown desktop editor. Start by reading `AGENTS.md`, `PLAN.md`, and `README.md` completely. The user is a student learning Rust, so preserve the current readable structure and explain any non-obvious changes in code comments or documentation. Do not expand this into an Obsidian clone.

## Repository state

- Work is on branch: `codex/release-markdown-editor`
- The application is implemented with Tauri 2, Rust, React, TypeScript, CodeMirror 6, Marked, and DOMPurify.
- Windows release build and NSIS installer creation succeeded.
- 18 frontend tests, the TypeScript production build, Rust formatting, Clippy with warnings denied, 9 Rust tests, and the dependency audit pass on Windows.
- A Windows installer was produced locally at `src-tauri/target/release/bundle/nsis/Pero_0.1.0_x64-setup.exe`; build artifacts are ignored and are not part of the branch.
- A GitHub Actions workflow in `.github/workflows/ci.yml` verifies both Windows and macOS, but it has not run remotely yet.

## Product behavior already implemented

- New, Open, Save, and Save As for normal local UTF-8 Markdown files.
- Save As appends `.md` when the user enters a filename without an extension. Existing Markdown extensions remain unchanged.
- Source, Live, Split, and Preview modes.
- Live mode is intentionally a lightweight Obsidian-style experience: headings, emphasis, inline code, links, and task markers are visually formatted; Markdown syntax remains visible on the active line; task checkboxes can be clicked.
- Sanitized GitHub-flavoured Markdown preview. External web/mail links open outside the webview. Relative note links are deliberately not implemented in V1.
- System/light/dark themes, recent files, stored preferences, word/character status, keyboard shortcuts, and responsive layout.
- Dirty-note Save/Discard/Cancel protection for New, Open, recent-file navigation, and close.
- CodeMirror is remounted for a new document identity so Undo cannot restore content from the previous file.
- Rust file writes use a temporary file and atomic persistence. A SHA-256 content revision prevents silently overwriting a note changed by Obsidian or another editor.
- Existing LF, CRLF, or classic CR line endings are preserved while editing and saving.
- File and preferences I/O run in blocking worker tasks instead of the UI thread.
- Tauri permissions and CSP are restricted to the commands, dialogs, and external URL schemes the app uses.

## First commands to run on macOS

```bash
git switch codex/release-markdown-editor
npm ci
npm run check
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml --locked
npm run tauri build
```

If the branch has not yet been pushed, obtain the commit/bundle from the original device before doing anything else. Do not recreate the implementation from scratch.

## Required macOS manual verification

Run `npm run tauri dev` and test all of these with real temporary `.md` files. Use a copy of any Obsidian note, not the only copy.

1. Create a note, type Markdown in Live mode, use clickable task checkboxes, and Save As.
2. Open the saved note again and verify exact UTF-8 content.
   Also edit and save one CRLF note and confirm its CRLF line endings remain intact.
3. Exercise Source, Live, Split, and Preview; verify `Cmd+1` through `Cmd+4`.
4. Verify `Cmd+N`, `Cmd+O`, `Cmd+S`, and `Cmd+Shift+S` and native Open/Save dialogs.
5. Test light, dark, and system themes, then relaunch and verify the chosen theme, mode, and recent files persist.
6. Make a dirty edit, then test New, Open, recent-file navigation, the red close button, `Cmd+W`, and `Cmd+Q`. For each, verify Save, Discard, Cancel, and Escape. No path may lose text silently.
7. Open one note in Pero and Obsidian. Change/save it in Obsidian, then try saving the stale version in Pero. Pero must refuse to overwrite it and keep the editor contents dirty. Verify Save As can preserve Pero's version separately.
8. Check external HTTP(S) and `mailto:` preview links open in the default app without navigating the Pero webview.
9. Resize down to the configured minimum (720 × 520). Split mode should stack vertically at widths up to 780 px; toolbar controls must remain understandable.
10. Test VoiceOver navigation, keyboard focus indicators, the recent-files disclosure, and focus return after cancelling the unsaved-changes dialog.
11. Try a missing recent file, a read-only file, invalid UTF-8 renamed to `.md`, and a note larger than 16 MB. Errors must be clear and existing data must remain untouched.
12. Inspect Console logs for CSP violations and runtime exceptions in both development and the release `.app`.

## macOS packaging and distribution

- Confirm the generated `.app` launches directly and the DMG installs/launches on at least one clean macOS account.
- Confirm the custom Pero icon looks correct in Finder, Dock, Launchpad, and the DMG.
- Verify the bundle identifier `com.simonpollak.pero` is the identifier the user wants before signing; changing it later changes preference storage and signing identity.
- Ask the user for their intended distribution route and Apple Developer credentials before configuring signing. Never invent certificate names, team IDs, Apple IDs, passwords, app-specific passwords, or API keys.
- For public distribution, configure Developer ID signing, hardened runtime, and Apple notarization according to current official Tauri and Apple documentation. Treat credentials as secrets and use environment variables or CI secrets, never committed files.
- Do not claim a public macOS release is ready until Gatekeeper accepts the notarized artifact on another Mac.

## Focused review notes

- `src/App.tsx` owns the document lifecycle. Be especially conservative around `saveDocument`, `canReplaceDocument`, `operationRef`, `currentContentRef`, and close handling.
- `src-tauri/src/document.rs` is the data-safety boundary. Preserve extension validation, the 16 MB limit, UTF-8 validation, SHA-256 revision checks (both before and immediately before replacement), permission preservation, and atomic persistence.
- A UTF-8 BOM is currently accepted and removed from the editor text rather than restored on save. This is not a V1 blocker for normal Markdown/Obsidian notes, but record it explicitly if macOS testing expands to byte-for-byte fidelity.
- `src/components/MarkdownEditor.tsx` implements Live mode with CodeMirror decorations. Test long documents because Lezer parsing is incremental.
- `src/components/MarkdownPreview.tsx` and `src/lib/markdown.ts` are the preview security boundary. Do not render unsanitized HTML or let links navigate the app webview.
- `src/lib/platform.ts` serializes preference writes so older async writes cannot finish after newer state.
- The production editor bundle is relatively large because CodeMirror and its language packages are loaded at startup. The preview renderer is already lazy-loaded. Optimize further only if macOS startup measurement shows a real problem.

## Scope after the macOS release check

The user wants Pero to work as a lightweight sidekick to Obsidian, while keeping ordinary Markdown as the source of truth. The next sensible compatibility improvements—only after the V1 release checklist passes—would be opening a file passed by Finder/CLI, `.md` file association, and carefully scoped support for Obsidian-style local links/images. Vault browsing, backlinks, tabs, full WYSIWYG, plugins, and knowledge-management features remain future work.

When you finish, update `PLAN.md` only if product direction or the definition of done changes. Report exactly what was tested on macOS, what artifact was produced, and whether signing/notarization remains outstanding.
