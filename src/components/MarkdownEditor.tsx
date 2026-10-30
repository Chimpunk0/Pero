import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { obsidianMarkdown } from "../lib/obsidian";
import { livePreviewExtension } from "./livePreview";
import { openMarkdownLink } from "../lib/links";
import {
  bracketMatching,
  defaultHighlightStyle,
  HighlightStyle,
  indentOnInput,
  syntaxHighlighting,
} from "@codemirror/language";
import { openSearchPanel, searchKeymap } from "@codemirror/search";
import { Compartment, EditorState } from "@codemirror/state";
import {
  crosshairCursor,
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  placeholder,
  rectangularSelection,
} from "@codemirror/view";
import { tags } from "@lezer/highlight";

export interface MarkdownEditorHandle {
  focus: () => void;
  find: (replace?: boolean) => void;
}

interface MarkdownEditorProps {
  value: string;
  isDark: boolean;
  livePreview: boolean;
  fontSize?: number;
  writingWidth?: number;
  lineSeparator?: "\n" | "\r\n" | "\r";
  onChange: (value: string) => void;
  onLinkError?: (message: string) => void;
}

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
        color: "var(--text)",
      },
      ".cm-scroller": {
        fontFamily:
          '"SFMono-Regular", "Cascadia Code", "Roboto Mono", Consolas, monospace',
        fontSize: "var(--writing-font-size, 16px)",
        lineHeight: "1.75",
        overflow: "auto",
      },
      ".cm-content": {
        maxWidth: "var(--writing-width, 820px)",
        width: "100%",
        margin: "0 auto",
        padding: "40px 48px 96px",
        caretColor: "var(--text)",
      },
      ".cm-line": { padding: "0" },
      ".cm-cursor, .cm-dropCursor": {
        borderLeftColor: "var(--text)",
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
        color: "var(--text)",
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
  {
    value,
    isDark,
    livePreview,
    lineSeparator = "\n",
    onChange,
    onLinkError,
    fontSize,
    writingWidth,
  },
  ref,
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onLinkErrorRef = useRef(onLinkError);
  const themeCompartmentRef = useRef(new Compartment());
  const livePreviewCompartmentRef = useRef(new Compartment());
  const labelCompartmentRef = useRef(new Compartment());

  onChangeRef.current = onChange;
  onLinkErrorRef.current = onLinkError;

  useImperativeHandle(ref, () => ({
    focus: () => viewRef.current?.focus(),
    find: (replace = false) => {
      const view = viewRef.current;
      if (!view) return;
      view.focus();
      openSearchPanel(view);
      if (replace)
        view.dom
          .querySelector<HTMLInputElement>('.cm-search input[name="replace"]')
          ?.focus();
    },
  }));

  useEffect(() => {
    if (!hostRef.current) return;

    const themeCompartment = themeCompartmentRef.current;
    const state = EditorState.create({
      doc: value,
      extensions: [
        EditorState.lineSeparator.of(lineSeparator),

        history(),
        drawSelection(),
        dropCursor(),
        EditorState.allowMultipleSelections.of(true),
        indentOnInput(),
        bracketMatching(),
        rectangularSelection(),
        crosshairCursor(),
        EditorView.lineWrapping,
        EditorView.domEventHandlers({
          click(event) {
            if (!event.metaKey && !event.ctrlKey) return false;
            const link = (event.target as Element).closest<HTMLElement>(
              "[data-live-href]",
            );
            if (!link?.dataset.liveHref) return false;
            event.preventDefault();
            void openMarkdownLink(link.dataset.liveHref).catch((cause: Error) =>
              onLinkErrorRef.current?.(cause.message),
            );
            return true;
          },
        }),
        markdown({ base: markdownLanguage, extensions: [obsidianMarkdown] }),
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
          livePreview
            ? livePreviewExtension
            : [
                lineNumbers(),
                highlightActiveLineGutter(),
                highlightActiveLine(),
              ],
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
          livePreview
            ? livePreviewExtension
            : [
                lineNumbers(),
                highlightActiveLineGutter(),
                highlightActiveLine(),
              ],
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

  useEffect(() => {
    // CSS variables changed outside CodeMirror; refresh cursor and wrap measurements.
    viewRef.current?.requestMeasure();
  }, [fontSize, writingWidth]);

  return <div className="editor-host" ref={hostRef} />;
});
