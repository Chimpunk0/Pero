import { createRef } from "react";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditorView } from "@codemirror/view";
import { MarkdownEditor, type MarkdownEditorHandle } from "./MarkdownEditor";

afterEach(cleanup);

describe("MarkdownEditor live preview", () => {
  it("formats Markdown and exposes inactive task markers as checkboxes", async () => {
    const onChange = vi.fn();
    const { container } = render(
      <div style={{ width: 800, height: 600 }}>
        <MarkdownEditor
          value={"# Heading\n\n1. [ ] ordered task\n\n**strong**"}
          isDark={false}
          livePreview
          onChange={onChange}
        />
      </div>,
    );

    await waitFor(() => {
      expect(container.querySelector(".cm-live-heading")).toBeTruthy();
      expect(container.querySelector(".cm-live-checkbox")).toBeTruthy();
    });
    const checkbox =
      container.querySelector<HTMLInputElement>(".cm-live-checkbox");
    fireEvent.click(checkbox!);
    expect(onChange).toHaveBeenLastCalledWith(
      "# Heading\n\n1. [x] ordered task\n\n**strong**",
    );
  });

  it("updates its accessible label when Live mode changes", async () => {
    const ref = createRef<MarkdownEditorHandle>();
    const { rerender, getByLabelText } = render(
      <MarkdownEditor
        ref={ref}
        value="text"
        isDark={false}
        livePreview={false}
        onChange={() => undefined}
      />,
    );
    expect(getByLabelText("Markdown source editor")).toBeTruthy();

    rerender(
      <MarkdownEditor
        ref={ref}
        value="text"
        isDark={false}
        livePreview
        onChange={() => undefined}
      />,
    );
    await waitFor(() =>
      expect(getByLabelText("Markdown live preview editor")).toBeTruthy(),
    );
  });

  it("preserves CRLF line endings when editing", async () => {
    const onChange = vi.fn();
    const { getByLabelText } = render(
      <MarkdownEditor
        value={"first\r\nsecond"}
        lineSeparator={"\r\n"}
        isDark={false}
        livePreview={false}
        onChange={onChange}
      />,
    );

    const editor = getByLabelText("Markdown source editor");
    const view = EditorView.findFromDOM(editor as HTMLElement);
    view?.dispatch({
      changes: { from: view.state.doc.length, insert: "\r\nthird" },
    });

    expect(onChange).toHaveBeenLastCalledWith("first\r\nsecond\r\nthird");
  });
});

it("opens Find and Replace with the replacement field focused", () => {
  const ref = createRef<MarkdownEditorHandle>();
  const { container } = render(
    <MarkdownEditor
      ref={ref}
      value="a note"
      isDark={false}
      livePreview={false}
      onChange={() => undefined}
    />,
  );
  ref.current?.find(true);
  expect(
    container.querySelector('.cm-search input[name="replace"]'),
  ).toHaveFocus();
  ref.current?.find();
  expect(
    container.querySelector('.cm-search input[name="search"]'),
  ).toHaveFocus();
});

function liveEditor(value: string) {
  const onChange = vi.fn();
  const result = render(
    <MarkdownEditor
      value={value}
      isDark={false}
      livePreview
      onChange={onChange}
    />,
  );
  const view = EditorView.findFromDOM(
    result.getByLabelText("Markdown live preview editor"),
  )!;
  return { ...result, view, onChange };
}

describe("Obsidian-style editing transitions", () => {
  it("reveals only the inline formatting under the cursor, including link titles", () => {
    const source =
      'plain **bold** and *italic* and [label](https://example.com "a title")';
    const { container, view, onChange } = liveEditor(source);
    expect(container.querySelector(".cm-content")!.textContent).toBe(
      "plain bold and italic and label",
    );

    view.dispatch({ selection: { anchor: source.indexOf("bold") + 1 } });
    expect(container.querySelector(".cm-content")!.textContent).toBe(
      "plain **bold** and italic and label",
    );

    view.dispatch({ selection: { anchor: source.indexOf("label") + 1 } });
    expect(container.querySelector(".cm-content")!.textContent).toBe(
      'plain bold and italic and [label](https://example.com "a title")',
    );
    expect(view.state.sliceDoc()).toBe(source);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("keeps selected Markdown visible across multiple formatted ranges", () => {
    const source = "plain **bold** and *italic*";
    const { container, view } = liveEditor(source);
    view.dispatch({ selection: { anchor: 7, head: source.length } });
    expect(container.querySelector(".cm-content")!.textContent).toBe(source);
  });

  it("uses actual Markdown structure so tasks inside code never become checkboxes", () => {
    const source =
      "outside\n\n```md\n- [ ] literal\n**literal**\n```\n\n- [ ] real task";
    const { container, view } = liveEditor(source);
    expect(container.querySelectorAll(".cm-live-checkbox")).toHaveLength(1);
    expect(container.querySelector(".cm-content")!.textContent).not.toContain(
      "```md",
    );
    expect(container.querySelector(".cm-content")!.textContent).toContain(
      "**literal**",
    );

    view.dispatch({ selection: { anchor: source.indexOf("literal") } });
    expect(container.querySelector(".cm-content")!.textContent).toContain(
      "```md",
    );
    expect(container.querySelectorAll(".cm-live-checkbox")).toHaveLength(1);
    expect(view.state.sliceDoc()).toBe(source);
  });

  it("renders and sanitizes tables, then returns the clicked cell to editable Markdown", () => {
    const source =
      'outside\n\n| First | Second |\n| --- | --- |\n| **one** | <img src=https://example.com/x.png onerror="alert(1)"> |';
    const { container, view, onChange } = liveEditor(source);
    expect(container.querySelector("table strong")!.textContent).toBe("one");
    expect(container.querySelector("table img")!.hasAttribute("onerror")).toBe(
      false,
    );
    const cells = container.querySelectorAll("td");
    fireEvent.click(cells[0]);
    expect(container.querySelector("table")).toBeNull();
    expect(view.state.selection.main.head).toBe(source.indexOf("**one**"));
    view.dispatch({
      changes: {
        from: source.indexOf("one"),
        to: source.indexOf("one") + 3,
        insert: "two",
      },
    });
    view.dispatch({ selection: { anchor: 0 } });
    expect(container.querySelector("table strong")!.textContent).toBe("two");
    expect(onChange).toHaveBeenLastCalledWith(
      source.replace("**one**", "**two**"),
    );
  });

  it("allows keyboard users to reveal a rendered block", () => {
    const { container, view } = liveEditor("outside\n\n---\n\nafter");
    const block = container.querySelector<HTMLElement>(".cm-live-rule")!;
    block.focus();
    fireEvent.keyDown(block, { key: "Enter" });
    expect(container.querySelector("hr")).toBeNull();
    expect(view.state.selection.main.head).toBe(9);
  });

  it("switches Live and Source without changing text or losing undo history", () => {
    const source = "plain **bold**";
    const { container, view, rerender, onChange } = liveEditor(source);
    expect(container.querySelector(".cm-gutters")).toBeNull();
    view.dispatch({ changes: { from: source.length, insert: "!" } });
    rerender(
      <MarkdownEditor
        value={source + "!"}
        isDark={false}
        livePreview={false}
        onChange={onChange}
      />,
    );
    expect(container.querySelector(".cm-lineNumbers")).toBeTruthy();
    expect(container.querySelector(".cm-content")!.textContent).toBe(
      source + "!",
    );
    fireEvent.keyDown(view.contentDOM, {
      key: "z",
      code: "KeyZ",
      ctrlKey: true,
    });
    expect(view.state.sliceDoc()).toBe(source);
  });

  it("does not leave a list bullet beside a task checkbox while editing task text", () => {
    const source = "outside\n\n- [ ] task";
    const { container, view } = liveEditor(source);
    view.dispatch({ selection: { anchor: source.length } });
    expect(container.querySelector(".cm-live-checkbox")).toBeTruthy();
    expect(container.querySelector(".cm-live-bullet")).toBeNull();
    expect(container.querySelector(".cm-content")!.textContent).not.toContain(
      "-",
    );
  });
});

it("keeps nested block prefixes and unfinished code blocks safe to edit", () => {
  const source =
    "outside\n\n> | A | B |\n> | --- | --- |\n> | a | b |\n\n> ---\n\n```md\nfirst\nsecond\nthird";
  const { container, view } = liveEditor(source);
  expect(view.state.sliceDoc()).toBe(source);
  const lines = container.querySelectorAll(".cm-live-codeblock");
  expect(lines[0]).toHaveClass("cm-live-codeblock-start");
  expect(lines[1]).not.toHaveClass("cm-live-codeblock-end");
  expect(lines[2]).toHaveClass("cm-live-codeblock-end");
  view.dispatch({ selection: { anchor: source.length } });
  expect(container.querySelector(".cm-content")!.textContent).toContain(
    "```md",
  );
});

describe("Obsidian note compatibility", () => {
  it("renders aliases, highlights and math, revealing original Markdown at the cursor", () => {
    const source =
      "outside\n\n[[folder/Note|My note]] and ==**important**== and $E = mc^2$ and ![[chart.png|300]]";
    const { container, view, onChange } = liveEditor(source);
    expect(container.querySelector(".local-note-link")).toHaveTextContent(
      "My note",
    );
    expect(container.querySelector("mark strong")).toHaveTextContent(
      "important",
    );
    expect(container.querySelector(".katex")).toBeTruthy();
    expect(
      container.querySelector(".attachment-placeholder"),
    ).toHaveTextContent("chart.png");
    view.dispatch({ selection: { anchor: source.indexOf("My note") } });
    expect(container.querySelector(".cm-content")!.textContent).toContain(
      "[[folder/Note|My note]]",
    );
    expect(view.state.sliceDoc()).toBe(source);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("renders callouts and display math, with keyboard access to the original source", () => {
    const source =
      "outside\n\n> [!tip] **Read this**\n> A ==highlight==.\n\n$$\nx^2 + y^2\n$$";
    const { container, view } = liveEditor(source);
    expect(container.querySelector(".callout-title strong")).toHaveTextContent(
      "Read this",
    );
    expect(container.querySelector(".callout mark")).toHaveTextContent(
      "highlight",
    );
    expect(container.querySelector(".katex-display")).toBeTruthy();
    fireEvent.keyDown(container.querySelector(".cm-live-callout")!, {
      key: "Enter",
    });
    expect(container.querySelector(".callout")).toBeNull();
    expect(container.querySelector(".cm-content")!.textContent).toContain(
      "[!tip]",
    );
    expect(view.state.sliceDoc()).toBe(source);
  });

  it("keeps special syntax literal inside code and escapes, and does not advertise local links as clickable", () => {
    const source =
      "outside\n\n`[[note]] ==text== $x$`\n\n\\[[escaped]] and [local](note.md)\n\n```md\n> [!tip] literal\n![[embed]]\n```";
    const { container, view } = liveEditor(source);
    expect(
      container.querySelector(
        "mark, .katex, .callout, .attachment-placeholder",
      ),
    ).toBeNull();
    expect(container.querySelector("[data-live-href]")).toBeNull();
    expect(container.querySelector(".local-note-link")).toHaveAttribute(
      "title",
      expect.stringContaining("not available"),
    );
    expect(view.state.sliceDoc()).toBe(source);
  });
});

it("renders indented tables and preserves alignment, escaped pipes and Markdown when editing", () => {
  const source =
    "outside\n\n  | Item | Value |\n  | :--- | ---: |\n  | A \\| B | **42** |\n\nafter";
  const { container, view, onChange } = liveEditor(source);
  const region = container.querySelector<HTMLElement>(".table-scroll")!;
  expect(region).toBeTruthy();
  expect(container.querySelector('th[align="right"]')).toHaveTextContent(
    "Value",
  );
  expect(container.querySelector("td")).toHaveTextContent("A | B");
  expect(container.querySelector("td strong")).toHaveTextContent("42");
  fireEvent.click(container.querySelectorAll("td")[1]);
  expect(container.querySelector("table")).toBeNull();
  expect(view.state.selection.main.head).toBe(source.indexOf("**42**"));
  expect(view.state.sliceDoc()).toBe(source);
  view.dispatch({ selection: { anchor: source.length } });
  expect(container.querySelector("table")).toBeTruthy();
  expect(onChange).not.toHaveBeenCalled();
});

it("allows keyboard editing from a rendered table's scroll region", () => {
  const source = "outside\n\n| A | B |\n| --- | --- |\n| one | two |";
  const { container, view } = liveEditor(source);
  const region = container.querySelector<HTMLElement>(".table-scroll")!;
  region.focus();
  fireEvent.keyDown(region, { key: "Enter" });
  expect(container.querySelector("table")).toBeNull();
  expect(view.state.sliceDoc()).toBe(source);
  expect(view.state.selection.main.head).toBe(source.indexOf("| A"));
});

it("maps rendered empty and padded cells back to the correct source row", () => {
  const source =
    "outside\n\n| A | B |\n| --- | --- |\n| one |\n| | two |\n| x | y | extra |\n\nafter";
  const { container, view } = liveEditor(source);
  let rows = container.querySelectorAll("tbody tr");
  fireEvent.click(rows[0].querySelectorAll("td")[1]);
  expect(view.state.selection.main.head).toBe(
    source.indexOf("| one |") + "| one |".length,
  );
  view.dispatch({ selection: { anchor: source.length } });
  rows = container.querySelectorAll("tbody tr");
  fireEvent.click(rows[1].querySelectorAll("td")[1]);
  expect(view.state.selection.main.head).toBe(source.indexOf("two"));
  view.dispatch({ selection: { anchor: source.length } });
  rows = container.querySelectorAll("tbody tr");
  expect(rows[2].querySelectorAll("td")).toHaveLength(2);
  fireEvent.click(rows[2].querySelectorAll("td")[1]);
  expect(view.state.selection.main.head).toBe(source.indexOf("y | extra"));
  expect(view.state.sliceDoc()).toBe(source);
});
