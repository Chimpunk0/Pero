import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { save } from "@tauri-apps/plugin-dialog";
import { chooseSavePath, loadRecovery, persistRecovery } from "./platform";

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn(), save: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

afterEach(() => {
  delete (window as Window & { __TAURI_INTERNALS__?: unknown })
    .__TAURI_INTERNALS__;
  localStorage.clear();
});

describe("Save As filenames", () => {
  it.each(["note.md", "note.markdown", "note.mdown", "note.mkd", "note.MD"])(
    "preserves the supported extension of %s",
    async (name) => {
      Object.assign(window, { __TAURI_INTERNALS__: {} });
      vi.mocked(save).mockResolvedValue(`/notes/${name}`);
      expect(await chooseSavePath(name)).toBe(`/notes/${name}`);
      expect(save).toHaveBeenCalledWith(
        expect.objectContaining({ defaultPath: name }),
      );
    },
  );

  it("adds .md when the selected name has no extension", async () => {
    Object.assign(window, { __TAURI_INTERNALS__: {} });
    vi.mocked(save).mockResolvedValue("/notes/new note");
    expect(await chooseSavePath("Untitled.md")).toBe("/notes/new note.md");
  });
});

describe("browser recovery storage", () => {
  it("serializes snapshots and deletion in the requested order", async () => {
    const draft = {
      path: null,
      name: "Untitled.md",
      content: "first",
      savedContent: "",
      revision: null,
      lineSeparator: "\n" as const,
    };
    const first = persistRecovery(draft);
    const second = persistRecovery({ ...draft, content: "latest" });
    await Promise.all([first, second]);
    expect((await loadRecovery())?.content).toBe("latest");
    await persistRecovery(null);
    expect(await loadRecovery()).toBeNull();
  });

  it("reports a malformed draft without deleting it", async () => {
    localStorage.setItem(
      "pero.recovery",
      JSON.stringify({ content: "valuable text" }),
    );
    await expect(loadRecovery()).rejects.toThrow("damaged");
    expect(localStorage.getItem("pero.recovery")).toContain("valuable text");
  });
});
