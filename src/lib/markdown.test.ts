import { describe, expect, it } from "vitest";
import { renderMarkdown } from "./markdown";

describe("renderMarkdown", () => {
  it("renders common Markdown", () => {
    const html = renderMarkdown("# Title\n\n**strong** and `code`");
    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<strong>strong</strong>");
    expect(html).toContain("<code>code</code>");
  });

  it("removes executable HTML and event handlers", () => {
    const html = renderMarkdown(
      '<script>alert(1)</script><img src="x" onerror="alert(2)">',
    );
    expect(html).not.toContain("script");
    expect(html).not.toContain("onerror");
  });

  it("removes dangerous URLs", () => {
    const html = renderMarkdown("[unsafe](javascript:alert(1))");
    expect(html).not.toContain("javascript:");
  });

  it("opens web links outside the webview safely", () => {
    const html = renderMarkdown("[site](https://example.com)");
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("keeps fragment links inside the preview", () => {
    const html = renderMarkdown("[section](#section)");
    expect(html).toContain('href="#section"');
    expect(html).not.toContain('target="_blank"');
  });

  it("keeps safe task checkboxes but removes interactive inputs", () => {
    const html = renderMarkdown(
      '- [x] done\n\n<input type="text" value="secret">',
    );
    expect(html).toContain('type="checkbox"');
    expect(html).toContain("disabled");
    expect(html).not.toContain('type="text"');
    expect(html).not.toContain("secret");
  });
});
