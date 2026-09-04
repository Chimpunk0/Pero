I am not a developer, just a student trying to learn rust hone theirs skills in programming.

## Project Introduction

This project is a simple Markdown text editor built as a personal learning project in Rust. The main goal is to create a fast, clean, pleasant desktop editor for local Markdown files while learning practical Rust app development through Tauri.

The project should start small and stay focused. Version 1 is a basic Markdown editor, not an Obsidian replacement and not a full knowledge-management platform.

## Current Product Goal

Build a polished basic Markdown editor with:

- Opening `.md` files.
- Creating new Markdown files.
- Editing Markdown text.
- Saving files.
- Source mode for plain Markdown editing.
- Preview mode for rendered Markdown reading.
- Split mode for editing and previewing side by side.
- Light and dark themes.
- A simple, modern, uncluttered UI.
- Recent files and basic local preferences.

## Technical Direction

- Use **Tauri** for the desktop app shell.
- Use **Rust** for backend/native behavior such as file access, app commands, preferences, and future native integrations.
- Use **HTML/CSS/TypeScript** for the frontend UI.
- Use a capable editor component such as **CodeMirror** for the Markdown editing surface.
- Use a proven Markdown renderer for preview.
- Prioritize macOS first.

## Design Principles

- Keep the editor fast and focused.
- Make writing the central experience.
- Prefer simple, well-finished features over many incomplete ones.
- Treat typography, spacing, and themes as important product details.
- Avoid heavy dashboards, noisy navigation, or complex feature panels in the first version.
- Keep the app understandable for a beginner learning the codebase.

## Future Features

The following ideas are important, but they should be implemented later, after the basic Markdown editor is working well:

- Opening a folder as a note collection.
- Obsidian vault integration.
- Importing or opening files from an Obsidian vault.
- File list or vault browser.
- Search across notes.
- Tabs.
- Command palette.
- CSS snippets or richer theme customization.
- Custom URL scheme support.
- File association support for `.md` files.
- Obsidian plugin or right-click workflow integration.
- Backlinks and note links.
- Linux and Windows support.

## Development Guidance

- Do not start by building future features.
- Do not turn the app into a full Obsidian clone.
- Keep early milestones small and testable.
- Prefer readable code and clear structure over clever abstractions.
- When adding features, update `PLAN.md` if the project direction changes.
- Protect user notes: file operations should be careful, predictable, and easy to understand.
