import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  MarkdownEditor,
  type MarkdownEditorHandle,
} from "./components/MarkdownEditor";
import {
  CloseIcon,
  MoonIcon,
  NewIcon,
  OpenIcon,
  RecentIcon,
  SaveAsIcon,
  SaveIcon,
  SunIcon,
  SystemIcon,
} from "./components/Icons";
import {
  addRecentFile,
  DEFAULT_PREFERENCES,
  removeRecentFile,
} from "./lib/preferences";
import {
  chooseMarkdownFile,
  chooseSavePath,
  isTauri,
  loadPreferences,
  persistPreferences,
  readMarkdownFile,
  writeMarkdownFile,
} from "./lib/platform";
import type { RecentFile, ThemePreference, ViewMode } from "./types";
import "./App.css";

const MarkdownPreview = lazy(() =>
  import("./components/MarkdownPreview").then((module) => ({
    default: module.MarkdownPreview,
  })),
);

type SaveState = "ready" | "saving" | "saved" | "error";
type UnsavedDecision = "save" | "discard" | "cancel";

interface DocumentState {
  id: number;
  path: string | null;
  name: string;
  content: string;
  savedContent: string;
  revision: string | null;
  lineSeparator: "\n" | "\r\n" | "\r";
}

const EMPTY_DOCUMENT: DocumentState = {
  id: 0,
  path: null,
  name: "Untitled.md",
  content: "",
  savedContent: "",
  revision: null,
  lineSeparator: "\n",
};

function detectLineSeparator(content: string): "\n" | "\r\n" | "\r" {
  if (content.includes("\r\n")) return "\r\n";
  if (content.includes("\r")) return "\r";
  return "\n";
}

const MODE_LABELS: Record<ViewMode, string> = {
  source: "Source",
  live: "Live",
  split: "Split",
  preview: "Preview",
};

const THEME_LABELS: Record<ThemePreference, string> = {
  system: "System theme",
  light: "Light theme",
  dark: "Dark theme",
};

function getErrorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return "Something went wrong. Your text is still safe in the editor.";
}

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [delay, value]);
  return debounced;
}

function App() {
  const [documentState, setDocumentState] = useState(EMPTY_DOCUMENT);
  const [mode, setMode] = useState<ViewMode>(DEFAULT_PREFERENCES.viewMode);
  const [theme, setTheme] = useState<ThemePreference>(
    DEFAULT_PREFERENCES.theme,
  );
  const [systemIsDark, setSystemIsDark] = useState(false);
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>([]);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [recentOpen, setRecentOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("ready");
  const [error, setError] = useState<string | null>(null);
  const [unsavedReason, setUnsavedReason] = useState<string | null>(null);

  const editorRef = useRef<MarkdownEditorHandle>(null);
  const recentMenuRef = useRef<HTMLDivElement>(null);
  const recentButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const focusBeforeDialogRef = useRef<HTMLElement | null>(null);
  const decisionResolverRef = useRef<((value: UnsavedDecision) => void) | null>(
    null,
  );
  const closeAllowedRef = useRef(false);
  const operationRef = useRef(false);
  const currentContentRef = useRef(documentState.content);
  currentContentRef.current = documentState.content;

  const isDirty = documentState.content !== documentState.savedContent;
  const isDark = theme === "dark" || (theme === "system" && systemIsDark);
  const settledContent = useDebouncedValue(documentState.content, 140);
  const wordCount = useMemo(() => {
    const text = settledContent.trim();
    return text ? text.split(/\s+/u).length : 0;
  }, [settledContent]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setSystemIsDark(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    let active = true;
    void loadPreferences()
      .then((preferences) => {
        if (!active) return;
        setTheme(preferences.theme);
        setMode(preferences.viewMode);
        setRecentFiles(preferences.recentFiles);
      })
      .catch((cause) => {
        if (active)
          setError(
            `Preferences could not be loaded: ${getErrorMessage(cause)}`,
          );
      })
      .finally(() => {
        if (active) setPreferencesLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = isDark ? "dark" : "light";
    document.documentElement.style.colorScheme = isDark ? "dark" : "light";
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", isDark ? "#1d1e1b" : "#f4f1ea");
  }, [isDark]);

  useEffect(() => {
    if (!preferencesLoaded) return;
    void persistPreferences({ theme, viewMode: mode, recentFiles }).catch(
      (cause) => {
        setError(`Preferences could not be saved: ${getErrorMessage(cause)}`);
      },
    );
  }, [mode, preferencesLoaded, recentFiles, theme]);

  useEffect(() => {
    const title = `${isDirty ? "• " : ""}${documentState.name} — Pero`;
    document.title = title;
    if (isTauri())
      void getCurrentWindow()
        .setTitle(title)
        .catch(() => undefined);
  }, [documentState.name, isDirty]);

  useEffect(() => {
    if (!recentOpen) return;
    const outside = (event: PointerEvent) => {
      if (!recentMenuRef.current?.contains(event.target as Node))
        setRecentOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setRecentOpen(false);
        recentButtonRef.current?.focus();
      }
    };
    window.addEventListener("pointerdown", outside);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("pointerdown", outside);
      window.removeEventListener("keydown", escape);
    };
  }, [recentOpen]);

  const askAboutUnsavedChanges = useCallback((reason: string) => {
    if (decisionResolverRef.current) {
      return Promise.resolve<UnsavedDecision>("cancel");
    }
    focusBeforeDialogRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setUnsavedReason(reason);
    return new Promise<UnsavedDecision>((resolve) => {
      decisionResolverRef.current = resolve;
    });
  }, []);

  function answerUnsavedDialog(answer: UnsavedDecision) {
    setUnsavedReason(null);
    decisionResolverRef.current?.(answer);
    decisionResolverRef.current = null;
    window.requestAnimationFrame(() => focusBeforeDialogRef.current?.focus());
  }

  const rememberFile = useCallback((file: { path: string; name: string }) => {
    setRecentFiles((current) => addRecentFile(current, file));
  }, []);

  const saveDocument = useCallback(
    async (saveAs = false): Promise<string | null> => {
      if (operationRef.current || decisionResolverRef.current) return null;
      operationRef.current = true;
      setBusy(true);
      setError(null);
      try {
        const contentToSave = documentState.content;
        let path = saveAs ? null : documentState.path;
        if (!path) {
          path = await chooseSavePath(documentState.name);
          if (!path) return null;
        }
        setSaveState("saving");
        const saved = await writeMarkdownFile(
          path,
          contentToSave,
          saveAs ? null : documentState.revision,
        );
        setDocumentState((current) => ({
          ...current,
          path: saved.path,
          name: saved.name,
          savedContent: contentToSave,
          revision: saved.revision,
        }));
        rememberFile(saved);
        setSaveState("saved");
        window.setTimeout(() => setSaveState("ready"), 1600);
        return contentToSave;
      } catch (cause) {
        setSaveState("error");
        setError(`Could not save the file: ${getErrorMessage(cause)}`);
        return null;
      } finally {
        operationRef.current = false;
        setBusy(false);
      }
    },
    [documentState, rememberFile],
  );

  const canReplaceDocument = useCallback(
    async (reason: string) => {
      if (!isDirty) return true;
      const answer = await askAboutUnsavedChanges(reason);
      if (answer === "cancel") return false;
      if (answer === "discard") return true;
      const savedSnapshot = await saveDocument();
      if (savedSnapshot === null) return false;
      if (currentContentRef.current !== savedSnapshot) {
        setError(
          "New edits were made while saving. Save once more before continuing.",
        );
        return false;
      }
      return true;
    },
    [askAboutUnsavedChanges, isDirty, saveDocument],
  );

  const createNewDocument = useCallback(async () => {
    if (operationRef.current || decisionResolverRef.current) return;
    if (!(await canReplaceDocument("creating a new note"))) return;
    setDocumentState((current) => ({ ...EMPTY_DOCUMENT, id: current.id + 1 }));
    setSaveState("ready");
    setError(null);
    setRecentOpen(false);
    setMode((current) => (current === "preview" ? "live" : current));
    window.requestAnimationFrame(() => editorRef.current?.focus());
  }, [canReplaceDocument]);

  const openDocument = useCallback(
    async (knownPath?: string) => {
      if (operationRef.current || decisionResolverRef.current) return;
      setError(null);
      let path = knownPath;
      try {
        if (!path) {
          operationRef.current = true;
          setBusy(true);
          path = (await chooseMarkdownFile()) ?? undefined;
          operationRef.current = false;
          setBusy(false);
        }
        if (!path || !(await canReplaceDocument("opening another note")))
          return;
        if (operationRef.current) return;
        operationRef.current = true;
        setBusy(true);
        const opened = await readMarkdownFile(path);
        setDocumentState((current) => ({
          id: current.id + 1,
          path: opened.path,
          name: opened.name,
          content: opened.contents,
          savedContent: opened.contents,
          revision: opened.revision,
          lineSeparator: detectLineSeparator(opened.contents),
        }));
        rememberFile(opened);
        setRecentOpen(false);
        setSaveState("ready");
        window.requestAnimationFrame(() => editorRef.current?.focus());
      } catch (cause) {
        if (
          knownPath &&
          getErrorMessage(cause).toLowerCase().includes("not found")
        ) {
          setRecentFiles((files) => removeRecentFile(files, knownPath));
        }
        setError(`Could not open the file: ${getErrorMessage(cause)}`);
      } finally {
        operationRef.current = false;
        setBusy(false);
      }
    },
    [canReplaceDocument, rememberFile],
  );

  useEffect(() => {
    const shortcuts: Record<string, ViewMode> = {
      "1": "source",
      "2": "live",
      "3": "split",
      "4": "preview",
    };
    function handleShortcut(event: KeyboardEvent) {
      if (decisionResolverRef.current) return;
      if (!event.metaKey && !event.ctrlKey) return;
      const key = event.key.toLowerCase();
      if (key === "s") {
        event.preventDefault();
        void saveDocument(event.shiftKey);
      } else if (key === "o") {
        event.preventDefault();
        void openDocument();
      } else if (key === "n") {
        event.preventDefault();
        void createNewDocument();
      } else if (shortcuts[key]) {
        event.preventDefault();
        setMode(shortcuts[key]);
      }
    }
    window.addEventListener("keydown", handleShortcut, { capture: true });
    return () =>
      window.removeEventListener("keydown", handleShortcut, { capture: true });
  }, [createNewDocument, openDocument, saveDocument]);

  useEffect(() => {
    if (!unsavedReason) return;
    const cancelOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        answerUnsavedDialog("cancel");
        return;
      }
      if (event.key !== "Tab") return;
      const buttons = dialogRef.current?.querySelectorAll<HTMLButtonElement>(
        "button:not(:disabled)",
      );
      if (!buttons?.length) return;
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", cancelOnEscape);
    return () => window.removeEventListener("keydown", cancelOnEscape);
  }, [unsavedReason]);

  const dirtyRef = useRef(isDirty);
  const canCloseRef = useRef(canReplaceDocument);
  dirtyRef.current = isDirty;
  canCloseRef.current = canReplaceDocument;

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (closeAllowedRef.current || !dirtyRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);

    let unlisten: (() => void) | undefined;
    if (isTauri()) {
      const appWindow = getCurrentWindow();
      void appWindow
        .onCloseRequested(async (event) => {
          if (closeAllowedRef.current || !dirtyRef.current) return;
          event.preventDefault();
          if (await canCloseRef.current("closing Pero")) {
            closeAllowedRef.current = true;
            try {
              await appWindow.close();
            } catch (cause) {
              closeAllowedRef.current = false;
              setError(
                `Pero could not close the window: ${getErrorMessage(cause)}`,
              );
            }
          }
        })
        .then((dispose) => {
          unlisten = dispose;
        });
    }
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      unlisten?.();
    };
  }, []);

  function cycleTheme() {
    setTheme((current) =>
      current === "system" ? "light" : current === "light" ? "dark" : "system",
    );
  }

  const ThemeIcon =
    theme === "system" ? SystemIcon : theme === "dark" ? MoonIcon : SunIcon;
  const statusText = busy
    ? saveState === "saving"
      ? "Saving…"
      : "Working…"
    : isDirty
      ? "Edited"
      : saveState === "saved"
        ? "Saved"
        : "Up to date";

  return (
    <main className="app-shell" aria-busy={busy}>
      <header className="toolbar" inert={unsavedReason ? true : undefined}>
        <div className="toolbar-group file-actions" aria-label="File actions">
          <button
            className="tool-button"
            aria-label="New"
            onClick={() => void createNewDocument()}
            disabled={busy}
            title="New note (Ctrl/⌘ N)"
          >
            <NewIcon />
            <span>New</span>
          </button>
          <button
            className="tool-button"
            aria-label="Open"
            onClick={() => void openDocument()}
            disabled={busy}
            title="Open note (Ctrl/⌘ O)"
          >
            <OpenIcon />
            <span>Open</span>
          </button>
          <button
            className="tool-button"
            aria-label="Save"
            onClick={() => void saveDocument()}
            disabled={busy || (!isDirty && documentState.path !== null)}
            title="Save note (Ctrl/⌘ S)"
          >
            <SaveIcon />
            <span>Save</span>
          </button>
          <button
            className="tool-button save-as-button"
            aria-label="Save As"
            onClick={() => void saveDocument(true)}
            disabled={busy}
            title="Save note as… (Ctrl/⌘ Shift S)"
          >
            <SaveAsIcon />
            <span>Save As…</span>
          </button>
          <div className="recent-control" ref={recentMenuRef}>
            <button
              ref={recentButtonRef}
              className="tool-button"
              aria-label="Recent notes"
              aria-expanded={recentOpen}
              aria-controls="recent-notes"
              onClick={() => setRecentOpen((value) => !value)}
              title="Recent notes"
            >
              <RecentIcon />
              <span>Recent</span>
            </button>
            {recentOpen && (
              <div
                className="recent-menu"
                id="recent-notes"
                aria-label="Recent notes"
              >
                <div className="recent-heading">Recent notes</div>
                {recentFiles.length === 0 ? (
                  <p className="recent-empty">
                    Files you open will appear here.
                  </p>
                ) : (
                  recentFiles.map((file) => (
                    <div className="recent-item" key={file.path}>
                      <button
                        className="recent-file"
                        onClick={() => void openDocument(file.path)}
                      >
                        <strong>{file.name}</strong>
                        <span>{file.path}</span>
                      </button>
                      <button
                        className="recent-remove"
                        aria-label={`Remove ${file.name} from recent notes`}
                        title="Remove from recent notes"
                        onClick={() =>
                          setRecentFiles((files) =>
                            removeRecentFile(files, file.path),
                          )
                        }
                      >
                        <CloseIcon />
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        <div
          className="document-title"
          title={documentState.path ?? "Not saved yet"}
        >
          <span
            className={isDirty ? "dirty-dot visible" : "dirty-dot"}
            aria-hidden="true"
          />
          <span>{documentState.name}</span>
          <span className="sr-only">
            {isDirty ? "Unsaved changes" : "All changes saved"}
          </span>
        </div>

        <div className="toolbar-group view-actions">
          <div className="mode-switcher" role="group" aria-label="View mode">
            {(["source", "live", "split", "preview"] as ViewMode[]).map(
              (viewMode, index) => (
                <button
                  key={viewMode}
                  className={
                    mode === viewMode ? "mode-button active" : "mode-button"
                  }
                  aria-pressed={mode === viewMode}
                  onClick={() => setMode(viewMode)}
                  title={`${MODE_LABELS[viewMode]} view (Ctrl/⌘ ${index + 1})`}
                >
                  {MODE_LABELS[viewMode]}
                </button>
              ),
            )}
          </div>
          <button
            className="icon-button"
            onClick={cycleTheme}
            aria-label={`${THEME_LABELS[theme]}. Change theme.`}
            title={THEME_LABELS[theme]}
          >
            <ThemeIcon />
          </button>
        </div>
      </header>

      {error && (
        <div
          className="error-banner"
          role="alert"
          inert={unsavedReason ? true : undefined}
        >
          <span>{error}</span>
          <button aria-label="Dismiss error" onClick={() => setError(null)}>
            <CloseIcon />
          </button>
        </div>
      )}

      <div
        className={`workspace mode-${mode}`}
        inert={unsavedReason ? true : undefined}
      >
        <section className="editor-pane" aria-hidden={mode === "preview"}>
          <MarkdownEditor
            key={documentState.id}
            ref={editorRef}
            value={documentState.content}
            isDark={isDark}
            livePreview={mode === "live"}
            lineSeparator={documentState.lineSeparator}
            onChange={(content) => {
              setDocumentState((current) => ({ ...current, content }));
              setSaveState("ready");
            }}
          />
        </section>
        {(mode === "split" || mode === "preview") && (
          <Suspense
            fallback={
              <section
                className="preview-pane preview-empty"
                aria-label="Markdown preview"
              >
                Rendering preview…
              </section>
            }
          >
            <MarkdownPreview content={settledContent} onLinkError={setError} />
          </Suspense>
        )}
      </div>

      <footer className="status-bar" inert={unsavedReason ? true : undefined}>
        <span className={`save-status status-${saveState}`} aria-live="polite">
          {statusText}
        </span>
        <span>
          {wordCount} {wordCount === 1 ? "word" : "words"}
        </span>
        <span>{documentState.content.length} characters</span>
      </footer>

      {unsavedReason && (
        <div className="modal-backdrop" role="presentation">
          <section
            ref={dialogRef}
            className="confirm-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="unsaved-title"
            aria-describedby="unsaved-description"
          >
            <div className="dialog-mark" aria-hidden="true">
              ●
            </div>
            <h2 id="unsaved-title">Save your changes?</h2>
            <p id="unsaved-description">
              <strong>{documentState.name}</strong> has changes that have not
              been saved. Save them before {unsavedReason}?
            </p>
            <div className="dialog-actions">
              <button
                className="button ghost danger"
                onClick={() => answerUnsavedDialog("discard")}
              >
                Discard
              </button>
              <div className="dialog-actions-right">
                <button
                  className="button ghost"
                  autoFocus
                  onClick={() => answerUnsavedDialog("cancel")}
                >
                  Cancel
                </button>
                <button
                  className="button primary"
                  onClick={() => answerUnsavedDialog("save")}
                >
                  Save
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

export default App;
