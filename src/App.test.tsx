import { forwardRef } from "react";
import "@testing-library/jest-dom/vitest";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  cleanup,
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import { DEFAULT_PREFERENCES } from "./lib/preferences";
import * as platform from "./lib/platform";

const native = vi.hoisted(() => ({
  onClose: null as
    null | ((event: { preventDefault: () => void }) => Promise<void>),
  menu: null as null | ((event: { payload: string }) => void),
  close: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn((_name, handler) => {
    native.menu = handler;
    return Promise.resolve(() => {
      native.menu = null;
    });
  }),
}));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    setTitle: vi.fn().mockResolvedValue(undefined),
    close: native.close,
    onCloseRequested: vi.fn((handler) => {
      native.onClose = handler;
      return Promise.resolve(() => {
        native.onClose = null;
      });
    }),
  }),
}));

vi.mock("./components/MarkdownEditor", () => ({
  MarkdownEditor: forwardRef<
    unknown,
    { value: string; onChange: (value: string) => void }
  >(function MockEditor({ value, onChange }, _ref) {
    return (
      <textarea
        aria-label="Markdown source editor"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    );
  }),
}));

vi.mock("./components/MarkdownPreview", () => ({
  MarkdownPreview: ({ content }: { content: string }) => (
    <div aria-label="Markdown preview">{content}</div>
  ),
}));

vi.mock("./lib/platform", async () => {
  const actual =
    await vi.importActual<typeof import("./lib/platform")>("./lib/platform");
  return {
    ...actual,
    isTauri: vi.fn(() => false),
    syncNativeMenu: vi.fn().mockResolvedValue(undefined),
    loadPreferences: vi.fn(),
    loadRecovery: vi.fn(),
    persistRecovery: vi.fn(),
    persistPreferences: vi.fn(),
    chooseMarkdownFile: vi.fn(),
    chooseSavePath: vi.fn(),
    readMarkdownFile: vi.fn(),
    writeMarkdownFile: vi.fn(),
  };
});

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(platform.isTauri).mockReturnValue(false);
  native.close.mockClear();
  vi.mocked(platform.loadRecovery).mockResolvedValue(null);
  vi.mocked(platform.persistRecovery).mockResolvedValue();
  vi.mocked(platform.loadPreferences).mockResolvedValue(DEFAULT_PREFERENCES);
  vi.mocked(platform.persistPreferences).mockResolvedValue();
  vi.mocked(platform.chooseMarkdownFile).mockResolvedValue(null);
  vi.mocked(platform.chooseSavePath).mockResolvedValue(null);
  vi.mocked(platform.readMarkdownFile).mockReset();
  vi.mocked(platform.writeMarkdownFile).mockReset();
});

afterEach(cleanup);

async function renderReady() {
  const result = render(<App />);
  await waitFor(() =>
    expect(result.container.querySelector(".workspace")).not.toHaveAttribute(
      "inert",
    ),
  );
  return result;
}

describe("document lifecycle", () => {
  it("keeps dirty text when New is cancelled", async () => {
    const user = userEvent.setup();
    await renderReady();
    const editor = screen.getByLabelText("Markdown source editor");
    await user.type(editor, "draft");
    fireEvent.keyDown(window, { key: "n", metaKey: true });
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(editor).toHaveValue("draft");
    expect(screen.getByText("Edited")).toBeTruthy();
  });

  it("keeps dirty text when Save As is cancelled", async () => {
    const user = userEvent.setup();
    await renderReady();
    const editor = screen.getByLabelText("Markdown source editor");
    await user.type(editor, "still here");
    fireEvent.keyDown(window, { key: "s", metaKey: true });
    await waitFor(() => expect(platform.chooseSavePath).toHaveBeenCalledOnce());
    expect(editor).toHaveValue("still here");
    expect(platform.writeMarkdownFile).not.toHaveBeenCalled();
  });

  it("opens a selected Markdown file", async () => {
    vi.mocked(platform.chooseMarkdownFile).mockResolvedValue(
      "/notes/opened.md",
    );
    vi.mocked(platform.readMarkdownFile).mockResolvedValue({
      path: "/notes/opened.md",
      name: "opened.md",
      contents: "# Opened",
      revision: "hash",
    });
    await renderReady();
    fireEvent.keyDown(window, { key: "o", metaKey: true });
    await waitFor(() =>
      expect(screen.getByLabelText("Markdown source editor")).toHaveValue(
        "# Opened",
      ),
    );
    expect(screen.getByText("opened.md")).toBeTruthy();
    expect(screen.getByText("notes")).toHaveClass("document-folder");
    expect(
      screen.getByText("notes").closest(".document-title"),
    ).toHaveAttribute("title", "/notes/opened.md");
  });

  it("requires an explicit discard before replacing dirty text", async () => {
    const user = userEvent.setup();
    vi.mocked(platform.chooseMarkdownFile).mockResolvedValue("/notes/other.md");
    vi.mocked(platform.readMarkdownFile).mockResolvedValue({
      path: "/notes/other.md",
      name: "other.md",
      contents: "replacement",
      revision: "hash-2",
    });
    await renderReady();
    await user.type(screen.getByLabelText("Markdown source editor"), "draft");
    fireEvent.keyDown(window, { key: "o", metaKey: true });
    expect(platform.readMarkdownFile).not.toHaveBeenCalled();
    await user.click(await screen.findByRole("button", { name: "Discard" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Markdown source editor")).toHaveValue(
        "replacement",
      ),
    );
  });
});

describe("keyboard shortcuts", () => {
  it("switches modes by physical digit key on localized keyboards", async () => {
    await renderReady();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "View mode: Live" }),
      ).toBeTruthy(),
    );

    const shortcuts = [
      ["Digit1", "+", "Source"],
      ["Digit2", "ľ", "Live"],
      ["Digit3", "š", "Split"],
      ["Digit4", "č", "Preview"],
    ] as const;

    for (const [code, key, mode] of shortcuts) {
      fireEvent.keyDown(window, { code, key, metaKey: true });
      expect(
        screen.getByRole("button", { name: `View mode: ${mode}` }),
      ).toBeTruthy();
    }
  });
});

describe("editor controls", () => {
  beforeAll(() => {
    HTMLDialogElement.prototype.showModal = function () {
      this.open = true;
    };
    HTMLDialogElement.prototype.close = function () {
      this.open = false;
    };
  });
  it("chooses a view from the dropdown and restores focus", async () => {
    const user = userEvent.setup();
    await renderReady();
    await user.click(screen.getByRole("button", { name: "View mode: Live" }));
    await user.click(screen.getByRole("menuitemradio", { name: /Split/ }));
    expect(screen.queryByRole("menu")).toBeNull();
    expect(
      screen.getByRole("button", { name: "View mode: Split" }),
    ).toHaveFocus();
  });
  it("changes and persists appearance from settings", async () => {
    const user = userEvent.setup();
    await renderReady();
    await user.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.getByRole("tab", { name: "Appearance" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await user.click(screen.getByRole("button", { name: "Dark theme" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    await waitFor(() =>
      expect(platform.persistPreferences).toHaveBeenLastCalledWith(
        expect.objectContaining({ theme: "dark" }),
      ),
    );
    await user.click(screen.getByRole("button", { name: "Close settings" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "Settings" })).toHaveFocus();
  });
});

describe("native menu state", () => {
  it("closes Settings before handling native Quit", async () => {
    vi.mocked(platform.isTauri).mockReturnValue(true);
    const user = userEvent.setup();
    await renderReady();
    await user.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent(window, new Event("focus"));
    await import("@testing-library/react").then(({ act }) =>
      act(() => {
        native.menu?.({ payload: "quit" });
      }),
    );
    expect(native.close).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("publishes the selected mode and save availability", async () => {
    const user = userEvent.setup();
    await renderReady();
    await user.type(screen.getByLabelText("Markdown source editor"), "draft");
    fireEvent.keyDown(window, { key: "3", code: "Digit3", metaKey: true });
    await waitFor(() =>
      expect(platform.syncNativeMenu).toHaveBeenLastCalledWith([], {
        mode: "split",
        blocked: false,
        canSave: true,
      }),
    );
  });
});

describe("file safety regressions", () => {
  it("keeps edits typed while another file is being read", async () => {
    let finish!: (value: {
      path: string;
      name: string;
      contents: string;
      revision: string;
    }) => void;
    vi.mocked(platform.chooseMarkdownFile).mockResolvedValue("/notes/other.md");
    vi.mocked(platform.readMarkdownFile).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await renderReady();
    fireEvent.keyDown(window, { key: "o", metaKey: true });
    await waitFor(() =>
      expect(platform.readMarkdownFile).toHaveBeenCalledOnce(),
    );
    fireEvent.change(screen.getByLabelText("Markdown source editor"), {
      target: { value: "new draft" },
    });
    await act(async () =>
      finish({
        path: "/notes/other.md",
        name: "other.md",
        contents: "replacement",
        revision: "hash",
      }),
    );
    expect(screen.getByLabelText("Markdown source editor")).toHaveValue(
      "new draft",
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Opening was cancelled",
    );
  });

  it("keeps revision protection when Save As selects the current path", async () => {
    vi.mocked(platform.chooseMarkdownFile).mockResolvedValue(
      "/notes/current.md",
    );
    vi.mocked(platform.readMarkdownFile).mockResolvedValue({
      path: "/notes/current.md",
      name: "current.md",
      contents: "original",
      revision: "original-hash",
    });
    vi.mocked(platform.chooseSavePath).mockResolvedValue("/notes/current.md");
    vi.mocked(platform.writeMarkdownFile).mockResolvedValue({
      path: "/notes/current.md",
      name: "current.md",
      contents: "edit",
      revision: "new-hash",
    });
    await renderReady();
    fireEvent.keyDown(window, { key: "o", metaKey: true });
    await waitFor(() =>
      expect(screen.getByLabelText("Markdown source editor")).toHaveValue(
        "original",
      ),
    );
    fireEvent.change(screen.getByLabelText("Markdown source editor"), {
      target: { value: "edit" },
    });
    fireEvent.keyDown(window, { key: "s", metaKey: true, shiftKey: true });
    await waitFor(() =>
      expect(platform.writeMarkdownFile).toHaveBeenCalledWith(
        "/notes/current.md",
        "edit",
        "original-hash",
        "/notes/current.md",
      ),
    );
  });
});

describe("recovery", () => {
  const draft = {
    path: "/note.md",
    name: "note.md",
    content: "recovered text",
    savedContent: "old text",
    revision: "old-hash",
    lineSeparator: "\n" as const,
  };

  it("offers the draft before allowing file actions and restores it without writing the note", async () => {
    vi.mocked(platform.loadRecovery).mockResolvedValue(draft);
    render(<App />);
    const restore = await screen.findByRole("button", {
      name: "Restore draft",
    });
    fireEvent.keyDown(window, { key: "n", metaKey: true });
    expect(platform.persistRecovery).not.toHaveBeenCalled();
    fireEvent.click(restore);
    expect(screen.getByLabelText("Markdown source editor")).toHaveValue(
      "recovered text",
    );
    expect(screen.getByText("Edited")).toBeTruthy();
    expect(platform.writeMarkdownFile).not.toHaveBeenCalled();
    fireEvent(window, new Event("blur"));
    await waitFor(() =>
      expect(platform.persistRecovery).toHaveBeenCalledWith(
        expect.objectContaining(draft),
      ),
    );
  });

  it("keeps the offered draft when the window closes before a decision", async () => {
    vi.mocked(platform.isTauri).mockReturnValue(true);
    vi.mocked(platform.loadRecovery).mockResolvedValue(draft);
    render(<App />);
    await screen.findByRole("button", { name: "Restore draft" });
    const preventDefault = vi.fn();
    await act(async () => native.onClose!({ preventDefault }));
    expect(preventDefault).not.toHaveBeenCalled();
    expect(platform.persistRecovery).not.toHaveBeenCalled();
    expect(platform.writeMarkdownFile).not.toHaveBeenCalled();
  });

  it("discards only the recovery copy", async () => {
    vi.mocked(platform.loadRecovery).mockResolvedValue(draft);
    render(<App />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Discard draft" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("region", { name: "Recover unsaved note" }),
      ).toBeNull(),
    );
    expect(platform.persistRecovery).toHaveBeenCalledWith(null);
    expect(platform.writeMarkdownFile).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Markdown source editor")).toHaveValue("");
  });

  it("writes the latest draft and clears recovery after a successful save", async () => {
    vi.mocked(platform.chooseSavePath).mockResolvedValue("/saved.md");
    vi.mocked(platform.writeMarkdownFile).mockResolvedValue({
      path: "/saved.md",
      name: "saved.md",
      contents: "draft",
      revision: "new",
    });
    await renderReady();
    fireEvent.change(screen.getByLabelText("Markdown source editor"), {
      target: { value: "draft" },
    });
    await waitFor(() =>
      expect(platform.persistRecovery).toHaveBeenLastCalledWith(
        expect.objectContaining({ content: "draft" }),
      ),
    );
    fireEvent.keyDown(window, { key: "s", metaKey: true });
    await waitFor(() => expect(screen.getByText("Saved")).toBeTruthy());
    await waitFor(() =>
      expect(platform.persistRecovery).toHaveBeenLastCalledWith(null),
    );
  });

  it("clears recovery before a confirmed native close", async () => {
    vi.mocked(platform.isTauri).mockReturnValue(true);
    await renderReady();
    fireEvent.change(screen.getByLabelText("Markdown source editor"), {
      target: { value: "draft" },
    });
    let closing!: Promise<void>;
    act(() => {
      closing = native.onClose!({ preventDefault: vi.fn() });
    });
    fireEvent.click(await screen.findByRole("button", { name: "Discard" }));
    await act(async () => {
      await closing;
    });
    expect(platform.persistRecovery).toHaveBeenLastCalledWith(null);
    expect(native.close).toHaveBeenCalledOnce();
  });
});

describe("external changes", () => {
  it("keeps local edits and requires Save As after acknowledging an external change", async () => {
    vi.mocked(platform.isTauri).mockReturnValue(true);
    const user = userEvent.setup();
    const disk = {
      path: "/note.md",
      name: "note.md",
      contents: "original",
      revision: "original",
    };
    vi.mocked(platform.readMarkdownFile).mockResolvedValue(disk);
    vi.mocked(platform.chooseMarkdownFile).mockResolvedValue("/note.md");
    await renderReady();
    act(() => native.menu?.({ payload: "open" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Markdown source editor")).toHaveValue(
        "original",
      ),
    );
    fireEvent.change(screen.getByLabelText("Markdown source editor"), {
      target: { value: "my edits" },
    });
    vi.mocked(platform.readMarkdownFile).mockResolvedValue({
      ...disk,
      contents: "external",
      revision: "external",
    });
    fireEvent(window, new Event("focus"));
    await user.click(
      await screen.findByRole("button", { name: "Keep my changes" }),
    );
    expect(screen.getByLabelText("Markdown source editor")).toHaveValue(
      "my edits",
    );
    act(() => native.menu?.({ payload: "save" }));
    await waitFor(() => expect(platform.chooseSavePath).toHaveBeenCalled());
    expect(platform.writeMarkdownFile).not.toHaveBeenCalled();
    fireEvent(window, new Event("focus"));
    await act(async () => {});
    expect(
      screen.queryByRole("region", { name: "File changed on disk" }),
    ).toBeNull();
  });

  it("requires confirmation before reloading over unsaved edits", async () => {
    vi.mocked(platform.isTauri).mockReturnValue(true);
    const disk = {
      path: "/note.md",
      name: "note.md",
      contents: "original",
      revision: "original",
    };
    vi.mocked(platform.readMarkdownFile).mockResolvedValue(disk);
    vi.mocked(platform.chooseMarkdownFile).mockResolvedValue("/note.md");
    await renderReady();
    act(() => native.menu?.({ payload: "open" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Markdown source editor")).toHaveValue(
        "original",
      ),
    );
    fireEvent.change(screen.getByLabelText("Markdown source editor"), {
      target: { value: "local" },
    });
    vi.mocked(platform.readMarkdownFile).mockResolvedValue({
      ...disk,
      contents: "external",
      revision: "external",
    });
    fireEvent(window, new Event("focus"));
    fireEvent.click(
      await screen.findByRole("button", { name: "Reload from disk" }),
    );
    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    });
    expect(screen.getByLabelText("Markdown source editor")).toHaveValue(
      "local",
    );
    fireEvent.click(screen.getByRole("button", { name: "Reload from disk" }));
    fireEvent.click(await screen.findByRole("button", { name: "Discard" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Markdown source editor")).toHaveValue(
        "external",
      ),
    );
  });
});

describe("writing preferences", () => {
  it("applies saved sizes and persists changes", async () => {
    vi.mocked(platform.loadPreferences).mockResolvedValue({
      ...DEFAULT_PREFERENCES,
      fontSize: 18,
      writingWidth: 900,
    });
    const { container } = await renderReady();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.getByRole("slider", { name: /Text size/ })).toHaveValue("18");
    fireEvent.change(screen.getByRole("slider", { name: /Text size/ }), {
      target: { value: "20" },
    });
    fireEvent.change(screen.getByRole("slider", { name: /Writing width/ }), {
      target: { value: "1000" },
    });
    expect(container.querySelector("main")).toHaveStyle({
      "--writing-font-size": "20px",
      "--writing-width": "1000px",
    });
    await waitFor(() =>
      expect(platform.persistPreferences).toHaveBeenLastCalledWith(
        expect.objectContaining({ fontSize: 20, writingWidth: 1000 }),
      ),
    );
  });
});
