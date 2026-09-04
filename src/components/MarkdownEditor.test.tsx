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
