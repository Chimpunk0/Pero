import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  MarkdownEditor,
  type MarkdownEditorHandle,
} from "./components/MarkdownEditor";
import { CloseIcon } from "./components/Icons";
import { EditorControls } from "./components/EditorControls";
import { listen } from "@tauri-apps/api/event";
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
  loadRecovery,
  persistRecovery,
  persistPreferences,
  syncNativeMenu,
  readMarkdownFile,
  writeMarkdownFile,
} from "./lib/platform";
import type {
  RecentFile,
  ThemePreference,
  ViewMode,
  RecoveryDraft,
} from "./types";
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
  const [fontSize, setFontSize] = useState(DEFAULT_PREFERENCES.fontSize);
  const [writingWidth, setWritingWidth] = useState(
    DEFAULT_PREFERENCES.writingWidth,
  );
  const [recoveryLoaded, setRecoveryLoaded] = useState(false);
  const [recoveryDraft, setRecoveryDraft] = useState<RecoveryDraft | null>(
    null,
  );
  const [externalChange, setExternalChange] = useState(false);
  const [saveCopyRequired, setSaveCopyRequired] = useState(false);
  const [systemIsDark, setSystemIsDark] = useState(false);
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>([]);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("ready");
  const [error, setError] = useState<string | null>(null);
  const [unsavedReason, setUnsavedReason] = useState<string | null>(null);

  const editorRef = useRef<MarkdownEditorHandle>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const focusBeforeDialogRef = useRef<HTMLElement | null>(null);
  const decisionResolverRef = useRef<((value: UnsavedDecision) => void) | null>(
    null,
  );
  const closeAllowedRef = useRef(false);
  const operationRef = useRef(false);
  // Holds New/Open/Close across awaits; their own Save remains allowed.
  const transitionRef = useRef(false);
  const currentDocumentRef = useRef(documentState);
  currentDocumentRef.current = documentState;
  const recoveryEnabledRef = useRef(true);
  const recoveryClosingRef = useRef(false);
  const closingRequestRef = useRef(false);
  const acknowledgedDiskRef = useRef<string | null>(null);
  const observedDiskRef = useRef<string | null>(null);
  const recoveryTimerRef = useRef<number | undefined>(undefined);
  const recoveryBlocked = !recoveryLoaded || recoveryDraft !== null;
  const recoveryBlockedRef = useRef(recoveryBlocked);
  recoveryBlockedRef.current = recoveryBlocked;
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
        setFontSize(preferences.fontSize);
        setWritingWidth(preferences.writingWidth);
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
    let active = true;
    void loadRecovery()
      .then((draft) => {
        if (active) setRecoveryDraft(draft);
      })
      .catch((cause) => {
        recoveryEnabledRef.current = false;
        if (active)
          setError(`Recovery is unavailable: ${getErrorMessage(cause)}`);
      })
      .finally(() => {
        if (active) setRecoveryLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (
      recoveryBlocked ||
      !recoveryEnabledRef.current ||
      recoveryClosingRef.current
    )
      return;
    const draft = isDirty ? documentState : null;
    const saveDraft = () => {
      if (recoveryClosingRef.current) return;
      window.clearTimeout(recoveryTimerRef.current);
      void persistRecovery(draft).catch((cause) =>
        setError(
          `The recovery draft could not be saved: ${getErrorMessage(cause)}`,
        ),
      );
    };
    recoveryTimerRef.current = window.setTimeout(saveDraft, 350);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") saveDraft();
    };
    window.addEventListener("blur", saveDraft);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearTimeout(recoveryTimerRef.current);
      window.removeEventListener("blur", saveDraft);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [documentState, isDirty, recoveryBlocked]);

  async function discardRecovery() {
    try {
      await persistRecovery(null);
      setRecoveryDraft(null);
    } catch (cause) {
      setError(
        `Could not discard the recovery draft: ${getErrorMessage(cause)}`,
      );
    }
  }

  function restoreRecovery() {
    if (!recoveryDraft) return;
    setDocumentState((current) => ({ ...recoveryDraft, id: current.id + 1 }));
    setRecoveryDraft(null);
    setMode((current) => (current === "preview" ? "live" : current));
  }

  useEffect(() => {
    document.documentElement.dataset.theme = isDark ? "dark" : "light";
    document.documentElement.style.colorScheme = isDark ? "dark" : "light";
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", isDark ? "#1d1e1b" : "#f4f1ea");
  }, [isDark]);

  useEffect(() => {
    if (!preferencesLoaded) return;
    void persistPreferences({
      theme,
      viewMode: mode,
      recentFiles,
      fontSize,
      writingWidth,
    }).catch((cause) => {
      setError(`Preferences could not be saved: ${getErrorMessage(cause)}`);
    });
  }, [mode, preferencesLoaded, recentFiles, theme, fontSize, writingWidth]);

  useEffect(() => {
    const title = `${isDirty ? "• " : ""}${documentState.name} — Pero`;
    document.title = title;
    if (isTauri())
      void getCurrentWindow()
        .setTitle(title)
        .catch(() => undefined);
  }, [documentState.name, isDirty]);

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
    async (
      saveAs = false,
      duringTransition = false,
    ): Promise<string | null> => {
      if (
        operationRef.current ||
        decisionResolverRef.current ||
        recoveryBlockedRef.current ||
        (transitionRef.current && !duringTransition)
      )
        return null;
      operationRef.current = true;
      setBusy(true);
      setError(null);
      try {
        const snapshot = currentDocumentRef.current;
        const contentToSave = snapshot.content;
        let path = saveAs || saveCopyRequired ? null : snapshot.path;
        if (!path) {
          path = await chooseSavePath(snapshot.name);
          if (!path) return null;
        }
        setSaveState("saving");
        const saved = await writeMarkdownFile(
          path,
          contentToSave,
          snapshot.revision,
          snapshot.path,
        );
        setDocumentState((current) => ({
          ...current,
          path: saved.path,
          name: saved.name,
          savedContent: contentToSave,
          revision: saved.revision,
        }));
        acknowledgedDiskRef.current = null;
        observedDiskRef.current = null;
        setExternalChange(false);
        setSaveCopyRequired(false);
        rememberFile(saved);
        setSaveState("saved");
        window.setTimeout(() => setSaveState("ready"), 1600);
        return contentToSave;
      } catch (cause) {
        if (/changed on disk|deleted or moved/i.test(getErrorMessage(cause))) {
          setExternalChange(true);
        }
        setSaveState("error");
        setError(`Could not save the file: ${getErrorMessage(cause)}`);
        return null;
      } finally {
        operationRef.current = false;
        setBusy(false);
      }
    },
    [rememberFile, saveCopyRequired],
  );

  const canReplaceDocument = useCallback(
    async (reason: string) => {
      const current = currentDocumentRef.current;
      if (current.content === current.savedContent) return true;
      const answer = await askAboutUnsavedChanges(reason);
      if (answer === "cancel") return false;
      if (answer === "discard") return true;
      const savedSnapshot = await saveDocument(false, true);
      if (savedSnapshot === null) return false;
      if (currentContentRef.current !== savedSnapshot) {
        setError(
          "New edits were made while saving. Save once more before continuing.",
        );
        return false;
      }
      return true;
    },
    [askAboutUnsavedChanges, saveDocument],
  );

  const createNewDocument = useCallback(async () => {
    if (
      operationRef.current ||
      transitionRef.current ||
      decisionResolverRef.current ||
      recoveryBlockedRef.current
    )
      return;
    transitionRef.current = true;
    try {
      if (!(await canReplaceDocument("creating a new note"))) return;
      setDocumentState((current) => ({
        ...EMPTY_DOCUMENT,
        id: current.id + 1,
      }));
      acknowledgedDiskRef.current = null;
      observedDiskRef.current = null;
      setExternalChange(false);
      setSaveCopyRequired(false);
      setSaveState("ready");
      setError(null);
      setMode((current) => (current === "preview" ? "live" : current));
      window.requestAnimationFrame(() => editorRef.current?.focus());
    } finally {
      transitionRef.current = false;
    }
  }, [canReplaceDocument]);

  const openDocument = useCallback(
    async (knownPath?: string) => {
      if (
        transitionRef.current ||
        operationRef.current ||
        decisionResolverRef.current ||
        recoveryBlockedRef.current
      )
        return;
      transitionRef.current = true;
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
        const beforeRead = currentDocumentRef.current;
        const opened = await readMarkdownFile(path);
        if (
          currentDocumentRef.current.id !== beforeRead.id ||
          currentDocumentRef.current.content !== beforeRead.content
        ) {
          setError(
            "Opening was cancelled because you made new edits. Your text has been kept.",
          );
          return;
        }
        setDocumentState((current) => ({
          id: current.id + 1,
          path: opened.path,
          name: opened.name,
          content: opened.contents,
          savedContent: opened.contents,
          revision: opened.revision,
          lineSeparator: detectLineSeparator(opened.contents),
        }));
        acknowledgedDiskRef.current = null;
        observedDiskRef.current = null;
        setExternalChange(false);
        setSaveCopyRequired(false);
        rememberFile(opened);
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
        transitionRef.current = false;
        operationRef.current = false;
        setBusy(false);
      }
    },
    [canReplaceDocument, rememberFile],
  );

  useEffect(() => {
    if (!isTauri() || recoveryBlocked || !documentState.path) return;
    let disposed = false;
    let checking = false;
    const check = async () => {
      if (
        checking ||
        operationRef.current ||
        transitionRef.current ||
        decisionResolverRef.current
      )
        return;
      const snapshot = currentDocumentRef.current;
      if (!snapshot.path) return;
      checking = true;
      try {
        const disk = await readMarkdownFile(snapshot.path);
        if (
          !disposed &&
          !operationRef.current &&
          currentDocumentRef.current.id === snapshot.id &&
          currentDocumentRef.current.revision === snapshot.revision &&
          disk.revision !== snapshot.revision
        ) {
          observedDiskRef.current = disk.revision;
          if (acknowledgedDiskRef.current !== disk.revision)
            setExternalChange(true);
        }
      } catch {
        if (!disposed && currentDocumentRef.current.id === snapshot.id) {
          observedDiskRef.current = "unavailable";
          if (acknowledgedDiskRef.current !== "unavailable")
            setExternalChange(true);
        }
      } finally {
        checking = false;
      }
    };
    void check();
    window.addEventListener("focus", check);
    const timer = window.setInterval(() => {
      if (!document.hidden) void check();
    }, 10000);
    return () => {
      disposed = true;
      window.removeEventListener("focus", check);
      window.clearInterval(timer);
    };
  }, [
    documentState.id,
    documentState.path,
    documentState.revision,
    recoveryBlocked,
  ]);

  useEffect(() => {
    const shortcuts: Record<string, ViewMode> = {
      "1": "source",
      "2": "live",
      "3": "split",
      "4": "preview",
    };
    const shortcutsByCode: Record<string, ViewMode> = {
      Digit1: "source",
      Digit2: "live",
      Digit3: "split",
      Digit4: "preview",
    };
    function handleShortcut(event: KeyboardEvent) {
      if (
        decisionResolverRef.current ||
        settingsOpen ||
        recoveryBlockedRef.current
      )
        return;
      if (isTauri() && !shortcutsByCode[event.code]) return;
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
      } else if (shortcuts[key] ?? shortcutsByCode[event.code]) {
        event.preventDefault();
        setMode(shortcuts[key] ?? shortcutsByCode[event.code]);
      }
    }
    window.addEventListener("keydown", handleShortcut, { capture: true });
    return () =>
      window.removeEventListener("keydown", handleShortcut, { capture: true });
  }, [createNewDocument, openDocument, saveDocument, settingsOpen]);

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
    let disposed = false;
    if (isTauri()) {
      const appWindow = getCurrentWindow();
      void appWindow
        .onCloseRequested(async (event) => {
          if (closeAllowedRef.current) return;
          // Keep an offered draft intact if the user closes before deciding.
          if (recoveryBlockedRef.current) return;
          event.preventDefault();
          if (
            operationRef.current ||
            transitionRef.current ||
            closingRequestRef.current
          )
            return;
          transitionRef.current = true;
          closingRequestRef.current = true;
          setSettingsOpen(false);
          if (await canCloseRef.current("closing Pero")) {
            window.clearTimeout(recoveryTimerRef.current);
            recoveryClosingRef.current = true;
            try {
              const snapshot = currentDocumentRef.current;
              if (recoveryEnabledRef.current) await persistRecovery(null);
              if (currentDocumentRef.current.content !== snapshot.content)
                throw new Error(
                  "New edits were made while closing. Your text has been kept.",
                );
              closeAllowedRef.current = true;
              await appWindow.close();
            } catch (cause) {
              closeAllowedRef.current = false;
              recoveryClosingRef.current = false;
              const current = currentDocumentRef.current;
              if (
                recoveryEnabledRef.current &&
                current.content !== current.savedContent
              )
                void persistRecovery(current).catch(() => undefined);
              setError(
                `Pero could not close the window: ${getErrorMessage(cause)}`,
              );
            }
          }
          transitionRef.current = false;
          closingRequestRef.current = false;
        })
        .then((dispose) => {
          if (disposed) dispose();
          else unlisten = dispose;
        });
    }
    return () => {
      disposed = true;
      window.removeEventListener("beforeunload", beforeUnload);
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    if (!preferencesLoaded) return;
    void syncNativeMenu(recentFiles, {
      mode,
      blocked: busy || Boolean(unsavedReason) || recoveryBlocked,
      canSave: isDirty || documentState.path === null,
    }).catch((cause) =>
      setError(`Native menus could not update: ${getErrorMessage(cause)}`),
    );
  }, [
    mode,
    busy,
    unsavedReason,
    isDirty,
    documentState.path,
    recentFiles,
    preferencesLoaded,
    recoveryBlocked,
  ]);

  // Keep one native listener while always using the latest document state.
  const menuActionRef = useRef<(action: string) => void>(() => {});
  menuActionRef.current = (action) => {
    if (
      decisionResolverRef.current ||
      operationRef.current ||
      transitionRef.current ||
      recoveryBlockedRef.current
    )
      return;
    if (action === "settings") {
      setSettingsOpen(true);
      return;
    }
    // Dismiss the modal first so it cannot cover a file or unsaved-changes dialog.
    setSettingsOpen(false);
    if (action === "new") void createNewDocument();
    else if (action === "open") void openDocument();
    else if (action === "save") void saveDocument();
    else if (action === "save-as") void saveDocument(true);
    else if (action === "clear-recent") setRecentFiles([]);
    else if (action.startsWith("recent:")) void openDocument(action.slice(7));
    else if (action.startsWith("mode:")) setMode(action.slice(5) as ViewMode);
    else if (action === "find" || action === "replace") {
      setMode((current) => (current === "preview" ? "source" : current));
      window.requestAnimationFrame(() =>
        editorRef.current?.find(action === "replace"),
      );
    } else if (action === "close" || action === "quit")
      void getCurrentWindow()
        .close()
        .catch((cause) =>
          setError(`Pero could not close: ${getErrorMessage(cause)}`),
        );
  };
  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void listen<string>("menu-action", ({ payload }) =>
      menuActionRef.current(payload),
    )
      .then((cleanup) => {
        if (disposed) cleanup();
        else unlisten = cleanup;
      })
      .catch((cause) =>
        setError(`Native menus could not connect: ${getErrorMessage(cause)}`),
      );
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

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
    <main
      className="app-shell"
      aria-busy={busy}
      style={
        {
          "--writing-font-size": `${fontSize}px`,
          "--writing-width": `${writingWidth}px`,
        } as CSSProperties
      }
    >
      <header
        className={`toolbar ${isTauri() && /Mac/.test(navigator.platform) ? "mac-toolbar" : ""}`}
        data-tauri-drag-region
        inert={unsavedReason ? true : undefined}
      >
        <div
          className="document-title"
          data-tauri-drag-region
          title={documentState.path ?? "Not saved yet"}
        >
          <span
            className={isDirty ? "dirty-dot visible" : "dirty-dot"}
            aria-hidden="true"
          />
          <span className="document-label" data-tauri-drag-region>
            <span data-tauri-drag-region>{documentState.name}</span>
            {documentState.path && (
              <span className="document-folder" data-tauri-drag-region>
                {documentState.path
                  .replace(/\\/g, "/")
                  .split("/")
                  .slice(0, -1)
                  .filter(Boolean)
                  .slice(-2)
                  .join(" / ") || "/"}
              </span>
            )}
          </span>
          <span className="sr-only">
            {isDirty ? "Unsaved changes" : "All changes saved"}
          </span>
        </div>
        <EditorControls
          fontSize={fontSize}
          onFontSizeChange={setFontSize}
          writingWidth={writingWidth}
          onWritingWidthChange={setWritingWidth}
          mode={mode}
          onModeChange={setMode}
          theme={theme}
          onThemeChange={setTheme}
          settingsOpen={settingsOpen}
          onSettingsOpenChange={setSettingsOpen}
        />
      </header>

      {recoveryDraft && (
        <div
          className="notice-banner"
          role="region"
          aria-label="Recover unsaved note"
        >
          <span>
            Recover unsaved changes to <strong>{recoveryDraft.name}</strong>?
          </span>
          <button className="button primary" onClick={restoreRecovery}>
            Restore draft
          </button>
          <button
            className="button ghost"
            onClick={() => void discardRecovery()}
          >
            Discard draft
          </button>
        </div>
      )}
      {externalChange && !recoveryBlocked && (
        <div
          className="notice-banner"
          role="region"
          aria-label="File changed on disk"
          inert={unsavedReason ? true : undefined}
        >
          <span>
            This file changed or became unavailable on disk. Your text is safe.
          </span>
          <button
            className="button ghost"
            disabled={busy}
            onClick={() => void openDocument(documentState.path ?? undefined)}
          >
            Reload from disk
          </button>
          <button
            className="button primary"
            disabled={busy}
            onClick={() => {
              acknowledgedDiskRef.current = observedDiskRef.current;
              setExternalChange(false);
              setSaveCopyRequired(true);
            }}
          >
            Keep my changes
          </button>
        </div>
      )}
      {saveCopyRequired && !externalChange && (
        <div
          className="notice-banner"
          role="status"
          inert={unsavedReason ? true : undefined}
        >
          <span>
            Your changes are kept. Save to a different file to preserve both
            versions.
          </span>
          <button
            className="button primary"
            disabled={busy}
            onClick={() => void saveDocument(true)}
          >
            Save my version as…
          </button>
        </div>
      )}

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
        inert={unsavedReason || recoveryBlocked ? true : undefined}
      >
        <section className="editor-pane" aria-hidden={mode === "preview"}>
          <MarkdownEditor
            key={documentState.id}
            ref={editorRef}
            value={documentState.content}
            isDark={isDark}
            livePreview={mode === "live"}
            fontSize={fontSize}
            writingWidth={writingWidth}
            onLinkError={setError}
            lineSeparator={documentState.lineSeparator}
            onChange={(content) => {
              const next = { ...currentDocumentRef.current, content };
              currentDocumentRef.current = next;
              currentContentRef.current = content;
              setDocumentState(next);
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
