import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import {
  bracketMatching,
  defaultHighlightStyle,
  HighlightStyle,
  indentOnInput,
  syntaxTree,
  syntaxHighlighting,
} from "@codemirror/language";
import { searchKeymap } from "@codemirror/search";
import {
  Compartment,
  EditorState,
  type Extension,
  type Range,
} from "@codemirror/state";
import {
  crosshairCursor,
  Decoration,
  type DecorationSet,
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  placeholder,
  rectangularSelection,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import { tags } from "@lezer/highlight";

export interface MarkdownEditorHandle {
  focus: () => void;
}

interface MarkdownEditorProps {
  value: string;
  isDark: boolean;
  livePreview: boolean;
  lineSeparator?: "\n" | "\r\n" | "\r";
  onChange: (value: string) => void;
}

class TaskCheckboxWidget extends WidgetType {
  constructor(
    readonly checked: boolean,
    readonly from: number,
    readonly to: number,
  ) {
    super();
  }

  eq(other: TaskCheckboxWidget) {
    return other.checked === this.checked && other.from === this.from;
  }

  toDOM(view: EditorView) {
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = this.checked;
    checkbox.className = "cm-live-checkbox";
    checkbox.setAttribute(
      "aria-label",
      this.checked ? "Mark task incomplete" : "Mark task complete",
    );
    checkbox.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      view.dispatch({
        changes: {
          from: this.from,
          to: this.to,
          insert: this.checked ? "[ ]" : "[x]",
        },
      });
    });
    return checkbox;
  }

  ignoreEvent() {
    return true;
  }
}

function buildLivePreviewDecorations(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  const activeLines = view.state.selection.ranges.map((selection) => ({
    from: view.state.doc.lineAt(selection.from).from,
    to: view.state.doc.lineAt(selection.to).to,
  }));
  const touchesActiveLine = (from: number, to: number) =>
    activeLines.some((line) => from <= line.to && to >= line.from);

  const taskRanges: Array<{ from: number; to: number; checked: boolean }> = [];
  let line = view.state.doc.lineAt(view.viewport.from);
  while (line.from <= view.viewport.to) {
    const task = /^(\s*(?:[-*+]|\d+[.)])\s+)\[([ xX])\]/.exec(line.text);
    if (task) {
      const from = line.from + task[1].length;
      const to = from + 3;
      const checked = task[2].toLowerCase() === "x";
      taskRanges.push({ from, to, checked });
      if (touchesActiveLine(line.from, line.to)) {
        ranges.push(
          Decoration.mark({ class: "cm-live-task-source" }).range(from, to),
        );
      } else {
        ranges.push(
          Decoration.replace({
            widget: new TaskCheckboxWidget(checked, from, to),
          }).range(from, to),
        );
      }
    }
    if (line.to >= view.state.doc.length) break;
    line = view.state.doc.line(line.number + 1);
  }

  syntaxTree(view.state).iterate({
    from: view.viewport.from,
    to: view.viewport.to,
    enter(node) {
      if (
        taskRanges.some((task) => node.from >= task.from && node.to <= task.to)
      ) {
        return false;
      }
      const heading = /^ATXHeading([1-6])$/.exec(node.name);
      if (heading) {
        ranges.push(
          Decoration.mark({
            class: `cm-live-heading cm-live-h${heading[1]}`,
          }).range(node.from, node.to),
        );
      } else if (node.name === "StrongEmphasis") {
        ranges.push(
          Decoration.mark({ class: "cm-live-strong" }).range(
            node.from,
            node.to,
          ),
        );
      } else if (node.name === "Emphasis") {
        ranges.push(
          Decoration.mark({ class: "cm-live-emphasis" }).range(
            node.from,
            node.to,
          ),
        );
      } else if (node.name === "InlineCode") {
        ranges.push(
          Decoration.mark({ class: "cm-live-code" }).range(node.from, node.to),
        );
      } else if (node.name === "Link") {
        ranges.push(
          Decoration.mark({ class: "cm-live-link" }).range(node.from, node.to),
        );
      }

      const hiddenMarkers = new Set([
        "HeaderMark",
        "EmphasisMark",
        "CodeMark",
        "LinkMark",
        "QuoteMark",
        "CodeInfo",
      ]);
      const isLinkDestination =
        node.name === "URL" && node.node.parent?.name === "Link";
      if (
        (hiddenMarkers.has(node.name) || isLinkDestination) &&
        !touchesActiveLine(node.from, node.to)
      ) {
        ranges.push(Decoration.replace({}).range(node.from, node.to));
      }
    },
  });

  return Decoration.set(ranges, true);
}

const livePreviewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildLivePreviewDecorations(view);
    }

    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.selectionSet ||
        update.viewportChanged ||
        syntaxTree(update.startState) !== syntaxTree(update.state)
      ) {
        this.decorations = buildLivePreviewDecorations(update.view);
      }
    }
  },
  { decorations: (value) => value.decorations },
);

const livePreviewExtension: Extension = [
  livePreviewPlugin,
  EditorView.theme({
    ".cm-live-heading": {
      fontFamily: "var(--font-reading)",
      fontWeight: "700",
    },
    ".cm-live-h1": { fontSize: "1.85em", lineHeight: "1.5" },
    ".cm-live-h2": { fontSize: "1.5em", lineHeight: "1.55" },
    ".cm-live-h3": { fontSize: "1.25em", lineHeight: "1.6" },
    ".cm-live-h4, .cm-live-h5, .cm-live-h6": { fontSize: "1.08em" },
    ".cm-live-strong": { fontWeight: "750" },
    ".cm-live-emphasis": { fontStyle: "italic" },
    ".cm-live-code": {
      fontSize: ".9em",
      borderRadius: "4px",
      backgroundColor: "var(--inline-code)",
    },
    ".cm-live-link": { color: "var(--accent)", textDecoration: "underline" },
    ".cm-live-task-source": { color: "inherit", textDecoration: "none" },
    ".cm-live-checkbox": {
      margin: "0 .45em 0 0",
      verticalAlign: "-.12em",
      accentColor: "var(--accent)",
      cursor: "pointer",
    },
  }),
];

const lightHighlight = HighlightStyle.define([
  { tag: tags.heading, color: "#264f73", fontWeight: "650" },
  { tag: [tags.link, tags.url], color: "#356c8c" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strong, fontWeight: "700" },
  { tag: tags.quote, color: "#6f705f" },
  { tag: [tags.monospace, tags.atom], color: "#8d4a35" },
  { tag: tags.comment, color: "#7c7b73" },
  { tag: tags.meta, color: "#7b5a9b" },
]);

const darkHighlight = HighlightStyle.define([
  { tag: tags.heading, color: "#9dc8e3", fontWeight: "650" },
  { tag: [tags.link, tags.url], color: "#83b9d2" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strong, fontWeight: "700" },
  { tag: tags.quote, color: "#a6aa96" },
  { tag: [tags.monospace, tags.atom], color: "#e1a78f" },
  { tag: tags.comment, color: "#8f918c" },
  { tag: tags.meta, color: "#c3a3dd" },
]);

const editorTheme = (isDark: boolean) => [
  EditorView.theme(
    {
      "&": {
        height: "100%",
        backgroundColor: "transparent",
        color: isDark ? "#e9e7e1" : "#282924",
      },
      ".cm-scroller": {
        fontFamily:
          '"SFMono-Regular", "Cascadia Code", "Roboto Mono", Consolas, monospace',
        fontSize: "14px",
        lineHeight: "1.75",
        overflow: "auto",
      },
      ".cm-content": {
        maxWidth: "820px",
        width: "100%",
        margin: "0 auto",
        padding: "40px 48px 96px",
        caretColor: isDark ? "#f0b77a" : "#9a5b23",
      },
      ".cm-line": { padding: "0" },
      ".cm-cursor, .cm-dropCursor": {
        borderLeftColor: isDark ? "#f0b77a" : "#9a5b23",
      },
      ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection":
        {
          backgroundColor: isDark ? "#3a4b55" : "#d9e6eb",
        },
      ".cm-gutters": {
        backgroundColor: "transparent",
        border: "none",
        color: isDark ? "#656862" : "#aaa99f",
        paddingLeft: "12px",
      },
      ".cm-activeLineGutter": { backgroundColor: "transparent" },
      ".cm-activeLine": {
        backgroundColor: isDark ? "#ffffff05" : "#00000004",
      },
      ".cm-panels": {
        backgroundColor: isDark ? "#272824" : "#f0eee8",
        color: isDark ? "#e9e7e1" : "#282924",
      },
      ".cm-panels.cm-panels-top": {
        borderBottom: `1px solid ${isDark ? "#3a3b36" : "#dedbd1"}`,
      },
      ".cm-searchMatch": {
        backgroundColor: isDark ? "#6b5736" : "#f4dc9a",
      },
      ".cm-searchMatch.cm-searchMatch-selected": {
        backgroundColor: isDark ? "#805f31" : "#edca70",
      },
      "&.cm-focused": { outline: "none" },
    },
    { dark: isDark },
  ),
  syntaxHighlighting(isDark ? darkHighlight : lightHighlight),
];

export const MarkdownEditor = forwardRef<
  MarkdownEditorHandle,
  MarkdownEditorProps
>(function MarkdownEditor(
  { value, isDark, livePreview, lineSeparator = "\n", onChange },
  ref,
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const themeCompartmentRef = useRef(new Compartment());
  const livePreviewCompartmentRef = useRef(new Compartment());
  const labelCompartmentRef = useRef(new Compartment());

  onChangeRef.current = onChange;

  useImperativeHandle(ref, () => ({
    focus: () => viewRef.current?.focus(),
  }));

  useEffect(() => {
    if (!hostRef.current) return;

    const themeCompartment = themeCompartmentRef.current;
    const state = EditorState.create({
      doc: value,
      extensions: [
        EditorState.lineSeparator.of(lineSeparator),
        lineNumbers(),
        highlightActiveLineGutter(),
        history(),
        drawSelection(),
        dropCursor(),
        EditorState.allowMultipleSelections.of(true),
        indentOnInput(),
        bracketMatching(),
        rectangularSelection(),
        crosshairCursor(),
        highlightActiveLine(),
        EditorView.lineWrapping,
        markdown(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        keymap.of([
          indentWithTab,
          ...defaultKeymap,
          ...historyKeymap,
          ...searchKeymap,
        ]),
        placeholder("Start writing in Markdown…"),
        EditorView.contentAttributes.of({
          spellcheck: "true",
        }),
        labelCompartmentRef.current.of(
          EditorView.contentAttributes.of({
            "aria-label": livePreview
              ? "Markdown live preview editor"
              : "Markdown source editor",
          }),
        ),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.sliceDoc());
          }
        }),
        themeCompartment.of(editorTheme(isDark)),
        livePreviewCompartmentRef.current.of(
          livePreview ? livePreviewExtension : [],
        ),
      ],
    });

    const view = new EditorView({ state, parent: hostRef.current });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // The editor instance owns its document; external value changes are synced below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || view.state.sliceDoc() === value) return;

    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
      selection: { anchor: 0 },
    });
  }, [value]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: themeCompartmentRef.current.reconfigure(editorTheme(isDark)),
    });
  }, [isDark]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: [
        livePreviewCompartmentRef.current.reconfigure(
          livePreview ? livePreviewExtension : [],
        ),
        labelCompartmentRef.current.reconfigure(
          EditorView.contentAttributes.of({
            "aria-label": livePreview
              ? "Markdown live preview editor"
              : "Markdown source editor",
          }),
        ),
      ],
    });
  }, [livePreview]);

  return <div className="editor-host" ref={hostRef} />;
});
