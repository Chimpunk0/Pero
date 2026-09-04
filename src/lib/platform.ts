import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import type { MarkdownDocument, Preferences } from "../types";
import { normalizePreferences } from "./preferences";

const PREFERENCES_KEY = "pero.preferences";
let preferenceWriteQueue: Promise<void> = Promise.resolve();

export function isTauri(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

export async function loadPreferences(): Promise<Preferences> {
  if (isTauri()) {
    return normalizePreferences(await invoke("load_preferences"));
  }

  try {
    const stored = localStorage.getItem(PREFERENCES_KEY);
    return normalizePreferences(stored ? JSON.parse(stored) : null);
  } catch {
    return normalizePreferences(null);
  }
}

export async function persistPreferences(
  preferences: Preferences,
): Promise<void> {
  if (isTauri()) {
    preferenceWriteQueue = preferenceWriteQueue
      .catch(() => undefined)
      .then(() => invoke<void>("save_preferences", { preferences }));
    return preferenceWriteQueue;
  }

  localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
}

export async function chooseMarkdownFile(): Promise<string | null> {
  if (!isTauri()) {
    throw new Error("Opening files is available in the desktop app.");
  }

  const selection = await open({
    multiple: false,
    directory: false,
    title: "Open Markdown file",
    filters: [
      { name: "Markdown", extensions: ["md", "markdown", "mdown", "mkd"] },
    ],
  });

  return typeof selection === "string" ? selection : null;
}

export async function chooseSavePath(
  currentName: string,
): Promise<string | null> {
  if (!isTauri()) {
    throw new Error("Saving files is available in the desktop app.");
  }

  const selection = await save({
    title: "Save Markdown file",
    defaultPath: currentName.endsWith(".md")
      ? currentName
      : `${currentName}.md`,
    filters: [{ name: "Markdown", extensions: ["md", "markdown"] }],
  });

  if (!selection) return null;
  const fileName = selection.split(/[\\/]/u).pop() ?? selection;
  const finalDot = fileName.lastIndexOf(".");
  return finalDot > 0 && finalDot < fileName.length - 1
    ? selection
    : `${selection}.md`;
}

export async function readMarkdownFile(
  path: string,
): Promise<MarkdownDocument> {
  return invoke("read_markdown_file", { path });
}

export async function writeMarkdownFile(
  path: string,
  contents: string,
  expectedRevision: string | null,
): Promise<MarkdownDocument> {
  return invoke("write_markdown_file", { path, contents, expectedRevision });
}
