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

it("renders Obsidian inline syntax without interpreting it inside code", () => {
  const html = renderMarkdown(
    "[[folder/note|Alias]] ==**important**== $x^2$\n\n`[[literal]] ==literal== $x$`",
  );
  const root = document.createElement("div");
  root.innerHTML = html;
  expect(root.querySelector(".local-note-link")?.textContent).toBe("Alias");
  expect(root.querySelector("mark strong")?.textContent).toBe("important");
  expect(root.querySelectorAll(".katex")).toHaveLength(1);
  expect(root.querySelector("code")?.textContent).toBe(
    "[[literal]] ==literal== $x$",
  );
});

it("renders nested callout content, disabled note references and attachment placeholders safely", () => {
  const html = renderMarkdown(
    "> [!warning]- **Careful**\n> Text with [[Note]].\n>\n> - item\n\n[local](note.md) ![diagram](assets/diagram.png) ![[other.png]]",
  );
  const root = document.createElement("div");
  root.innerHTML = html;
  expect(
    root.querySelector(".callout-warning .callout-title strong")?.textContent,
  ).toBe("Careful");
  expect(root.querySelector(".callout li")?.textContent).toBe("item");
  expect(root.querySelectorAll("a, img")).toHaveLength(0);
  expect(root.querySelectorAll(".attachment-placeholder")).toHaveLength(2);
  expect(root.querySelectorAll(".local-note-link")).toHaveLength(2);
});

it("keeps scripts and unsafe formula commands inert in extended syntax", () => {
  const html = renderMarkdown(
    "[[<img src=x onerror=alert(1)>|<script>alert(1)</script>]]\n\n> [!tip] <img src=x onerror=alert(2)>\n> ==<script>alert(3)</script>==\n\n$\\href{javascript:alert(4)}{click}$\n\n$$\n\\htmlClass{unsafe}{x}\n$$",
  );
  const root = document.createElement("div");
  root.innerHTML = html;
  expect(
    root.querySelector("script, [onerror], a[href^='javascript:'], .unsafe"),
  ).toBeNull();
});

it("styles tasks consistently and leaves ordinary lists and currency alone", () => {
  const root = document.createElement("div");
  root.innerHTML = renderMarkdown(
    "- [x] Done\n- [ ] Todo\n- Ordinary\n\nCosts $10 and $20.",
  );
  expect(root.querySelectorAll(".task-item")).toHaveLength(2);
  expect(root.querySelectorAll(".task-complete")).toHaveLength(1);
  expect(
    root.querySelector(".task-complete input")?.hasAttribute("disabled"),
  ).toBe(true);
  expect(root.querySelector(".katex")).toBeNull();
});

it("renders aligned Markdown tables with inline formatting and keyboard scrolling", () => {
  const root = document.createElement("div");
  root.innerHTML = renderMarkdown(
    "| Item | Note | Value |\n| :--- | :---: | ---: |\n| **First** | A \\| B | 42 |\n| Second | ==important== | $x^2$ |",
  );
  const scroll = root.querySelector(".table-scroll")!;
  expect(scroll.getAttribute("tabindex")).toBe("0");
  expect(scroll.getAttribute("role")).toBe("region");
  expect(root.querySelectorAll("thead th")).toHaveLength(3);
  expect(root.querySelectorAll("tbody tr")).toHaveLength(2);
  const headers = root.querySelectorAll("th");
  expect(Array.from(headers, (cell) => cell.getAttribute("align"))).toEqual([
    "left",
    "center",
    "right",
  ]);
  expect(headers[0].getAttribute("scope")).toBe("col");
  expect(root.querySelector("td strong")?.textContent).toBe("First");
  expect(root.querySelectorAll("td")[1].textContent).toBe("A | B");
  expect(root.querySelector("td mark")?.textContent).toBe("important");
  expect(root.querySelector("td .katex")).toBeTruthy();
});

it("keeps incomplete tables and fenced examples as source text", () => {
  const root = document.createElement("div");
  root.innerHTML = renderMarkdown(
    "| A | B |\n| one | two |\n\n```md\n| A | B |\n| --- | --- |\n| a | b |\n```",
  );
  expect(root.querySelector("table")).toBeNull();
  expect(root.querySelector("code")?.textContent).toContain("| --- | --- |");
});
