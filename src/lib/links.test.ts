import { afterEach, describe, expect, it, vi } from "vitest";
import { openMarkdownLink } from "./links";

afterEach(() => vi.restoreAllMocks());

describe("Markdown links", () => {
  it("opens external links without giving the new page access to Pero", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    await openMarkdownLink("https://example.com/notes");
    expect(open).toHaveBeenCalledWith(
      "https://example.com/notes",
      "_blank",
      "noopener,noreferrer",
    );
  });

  it.each([
    "javascript:alert(1)",
    "file:///private/note.md",
    "obsidian://open?vault=test",
    "./note.md",
  ])("never launches an unsupported destination: %s", async (href) => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    await expect(openMarkdownLink(href)).rejects.toThrow("Local note links");
    expect(open).not.toHaveBeenCalled();
  });
});
