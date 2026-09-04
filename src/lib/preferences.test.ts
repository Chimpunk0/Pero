import { describe, expect, it } from "vitest";
import {
  addRecentFile,
  DEFAULT_PREFERENCES,
  normalizePreferences,
  removeRecentFile,
} from "./preferences";

describe("preferences", () => {
  it("uses safe defaults for malformed data", () => {
    expect(normalizePreferences("broken")).toEqual(DEFAULT_PREFERENCES);
    expect(normalizePreferences({ theme: "neon", viewMode: "pages" })).toEqual(
      DEFAULT_PREFERENCES,
    );
  });

  it("accepts the live preview mode", () => {
    expect(normalizePreferences({ viewMode: "live" }).viewMode).toBe("live");
  });

  it("moves reopened files to the front without duplicates", () => {
    const first = addRecentFile([], { path: "/notes/a.md", name: "a.md" }, 1);
    const second = addRecentFile(
      first,
      { path: "/notes/b.md", name: "b.md" },
      2,
    );
    const reopened = addRecentFile(
      second,
      { path: "/notes/a.md", name: "a.md" },
      3,
    );
    expect(reopened.map((file) => file.name)).toEqual(["a.md", "b.md"]);
  });

  it("caps the recent list at ten items", () => {
    let files = DEFAULT_PREFERENCES.recentFiles;
    for (let index = 0; index < 15; index += 1) {
      files = addRecentFile(
        files,
        { path: `/notes/${index}.md`, name: `${index}.md` },
        index,
      );
    }
    expect(files).toHaveLength(10);
    expect(files[0].name).toBe("14.md");
  });

  it("removes a recent file without affecting the others", () => {
    const files = [
      { path: "/a.md", name: "a.md", openedAt: 2 },
      { path: "/b.md", name: "b.md", openedAt: 1 },
    ];
    expect(removeRecentFile(files, "/a.md")).toEqual([files[1]]);
  });
});
