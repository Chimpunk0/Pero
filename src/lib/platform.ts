import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import type { MarkdownDocument, Preferences, RecoveryDraft } from "../types";
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
    defaultPath: /\.(md|markdown|mdown|mkd)$/i.test(currentName)
      ? currentName
      : `${currentName}.md`,
    filters: [
      { name: "Markdown", extensions: ["md", "markdown", "mdown", "mkd"] },
    ],
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
  currentDocumentPath: string | null = null,
): Promise<MarkdownDocument> {
  return invoke("write_markdown_file", {
    path,
    contents,
    expectedRevision,
    currentDocumentPath,
  });
}

export async function syncNativeMenu(
  recentFiles: Preferences["recentFiles"],
  state: { mode: Preferences["viewMode"]; blocked: boolean; canSave: boolean },
): Promise<void> {
  if (isTauri()) await invoke("sync_native_menu", { recentFiles, state });
}

// Serialize recovery writes so an older snapshot cannot replace a newer one.
let recoveryWriteQueue: Promise<void> = Promise.resolve();
const RECOVERY_KEY = "pero.recovery";

export async function loadRecovery(): Promise<RecoveryDraft | null> {
  const value: unknown = isTauri()
    ? await invoke("load_recovery")
    : JSON.parse(localStorage.getItem(RECOVERY_KEY) ?? "null");
  if (value === null) return null;
  const draft = value as Partial<RecoveryDraft>;
  if (
    typeof draft !== "object" ||
    typeof draft.content !== "string" ||
    typeof draft.savedContent !== "string" ||
    typeof draft.name !== "string" ||
    !(draft.path === null || typeof draft.path === "string") ||
    !(draft.revision === null || typeof draft.revision === "string") ||
    !["\n", "\r\n", "\r"].includes(draft.lineSeparator ?? "")
  ) {
    throw new Error(
      "The recovery draft is damaged. Its file has been kept for manual recovery.",
    );
  }
  return draft as RecoveryDraft;
}

export function persistRecovery(draft: RecoveryDraft | null): Promise<void> {
  recoveryWriteQueue = recoveryWriteQueue
    .catch(() => undefined)
    .then(async () => {
      if (isTauri()) await invoke("save_recovery", { draft });
      else if (draft) localStorage.setItem(RECOVERY_KEY, JSON.stringify(draft));
      else localStorage.removeItem(RECOVERY_KEY);
    });
  return recoveryWriteQueue;
}
