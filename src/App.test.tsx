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
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import { DEFAULT_PREFERENCES } from "./lib/preferences";
import * as platform from "./lib/platform";

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
    loadPreferences: vi.fn(),
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
  vi.mocked(platform.loadPreferences).mockResolvedValue(DEFAULT_PREFERENCES);
  vi.mocked(platform.persistPreferences).mockResolvedValue();
  vi.mocked(platform.chooseMarkdownFile).mockResolvedValue(null);
  vi.mocked(platform.chooseSavePath).mockResolvedValue(null);
  vi.mocked(platform.readMarkdownFile).mockReset();
  vi.mocked(platform.writeMarkdownFile).mockReset();
});

afterEach(cleanup);

describe("document lifecycle", () => {
  it("keeps dirty text when New is cancelled", async () => {
    const user = userEvent.setup();
    render(<App />);
    const editor = screen.getByLabelText("Markdown source editor");
    await user.type(editor, "draft");
    await user.click(screen.getByRole("button", { name: "New" }));
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(editor).toHaveValue("draft");
    expect(screen.getByText("Edited")).toBeTruthy();
  });

  it("keeps dirty text when Save As is cancelled", async () => {
    const user = userEvent.setup();
    render(<App />);
    const editor = screen.getByLabelText("Markdown source editor");
    await user.type(editor, "still here");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(platform.chooseSavePath).toHaveBeenCalledOnce());
    expect(editor).toHaveValue("still here");
    expect(platform.writeMarkdownFile).not.toHaveBeenCalled();
  });

  it("opens a selected Markdown file", async () => {
    const user = userEvent.setup();
    vi.mocked(platform.chooseMarkdownFile).mockResolvedValue(
      "/notes/opened.md",
    );
    vi.mocked(platform.readMarkdownFile).mockResolvedValue({
      path: "/notes/opened.md",
      name: "opened.md",
      contents: "# Opened",
      revision: "hash",
    });
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Open" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Markdown source editor")).toHaveValue(
        "# Opened",
      ),
    );
    expect(screen.getByText("opened.md")).toBeTruthy();
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
    render(<App />);
    await user.type(screen.getByLabelText("Markdown source editor"), "draft");
    await user.click(screen.getByRole("button", { name: "Open" }));
    expect(platform.readMarkdownFile).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Discard" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Markdown source editor")).toHaveValue(
        "replacement",
      ),
    );
  });
});
