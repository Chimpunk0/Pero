import { syntaxTree } from "@codemirror/language";
import { EditorState, StateField, type Range } from "@codemirror/state";
import { Decoration, EditorView, WidgetType } from "@codemirror/view";
import { renderMarkdown } from "../lib/markdown";
import { localLinkHint, readObsidianInline } from "../lib/obsidian";

class RenderedInline extends WidgetType {
  constructor(
    readonly source: string,
    readonly from: number,
  ) {
    super();
  }
  eq(other: RenderedInline) {
    return other.source === this.source && other.from === this.from;
  }
  toDOM(view: EditorView) {
    const span = document.createElement("span");
    span.className = "cm-live-rendered-inline";
    const content = document.createElement("template");
    content.innerHTML = renderMarkdown(this.source);
    const paragraph = content.content.querySelector("p");
    span.append(...Array.from((paragraph ?? content.content).childNodes));
    span.addEventListener("mousedown", (event) => event.preventDefault());
    span.addEventListener("click", () => {
      view.dispatch({ selection: { anchor: this.from + 1 } });
      view.focus();
    });
    return span;
  }
  ignoreEvent() {
    return true;
  }
}

// Decorations only change the view. The document, clipboard, and saved file
// always contain the original Markdown.
function selectionTouches(state: EditorState, from: number, to: number) {
  return state.selection.ranges.some((range) =>
    range.empty
      ? range.head >= from && range.head <= to
      : range.from < to && range.to > from,
  );
}

class TaskCheckbox extends WidgetType {
  constructor(
    readonly checked: boolean,
    readonly from: number,
  ) {
    super();
  }

  eq(other: TaskCheckbox) {
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
    // Keep the writing cursor in place while toggling a task.
    checkbox.addEventListener("mousedown", (event) => event.preventDefault());
    checkbox.addEventListener("click", (event) => {
      event.stopPropagation();
      view.dispatch({
        changes: {
          from: this.from,
          to: this.from + 3,
          insert: this.checked ? "[ ]" : "[x]",
        },
        userEvent: "input.task",
      });
    });
    return checkbox;
  }

  ignoreEvent() {
    return true;
  }
}

class Bullet extends WidgetType {
  toDOM() {
    const bullet = document.createElement("span");
    bullet.className = "cm-live-bullet";
    bullet.textContent = "•";
    bullet.setAttribute("aria-hidden", "true");
    return bullet;
  }
}

class RenderedBlock extends WidgetType {
  constructor(
    readonly source: string,
    readonly from: number,
    readonly kind: "table" | "rule" | "image" | "callout" | "math",
    readonly cells: readonly number[] = [],
  ) {
    super();
  }

  eq(other: RenderedBlock) {
    return (
      other.source === this.source &&
      other.from === this.from &&
      other.kind === this.kind
    );
  }

  toDOM(view: EditorView) {
    const block = document.createElement("div");
    block.className = `cm-live-rendered-block cm-live-${this.kind} markdown-body`;
    // Use the same sanitizer as Reading view, including for table cell HTML.
    block.innerHTML = renderMarkdown(this.source);
    // Tables already have a focusable scroll region. Avoid two Tab stops.
    block.tabIndex = this.kind === "table" ? -1 : 0;
    block.setAttribute("role", "group");
    block.setAttribute(
      "aria-label",
      `${this.kind === "rule" ? "Horizontal rule" : this.kind.charAt(0).toUpperCase() + this.kind.slice(1)}. Activate to edit Markdown.`,
    );
    block.title = "Click to edit Markdown";
    const edit = (target?: Element | null) => {
      const cell = target?.closest("th, td");
      const index = cell
        ? Array.from(block.querySelectorAll("th, td")).indexOf(cell)
        : -1;
      view.dispatch({
        selection: {
          anchor:
            this.cells[index] ?? this.from + (this.kind === "math" ? 2 : 0),
        },
        scrollIntoView: true,
      });
      view.focus();
    };
    block.addEventListener("mousedown", (event) => {
      // Leave the scroll region's scrollbar draggable.
      if (
        !(event.target instanceof Element) ||
        !event.target.classList.contains("table-scroll")
      )
        event.preventDefault();
    });
    block.addEventListener("click", (event) => {
      if (
        event.target instanceof Element &&
        event.target.classList.contains("table-scroll")
      )
        return;
      event.preventDefault();
      edit(event.target instanceof Element ? event.target : null);
    });
    block.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      edit();
    });
    block.querySelectorAll("img").forEach((image) => {
      image.addEventListener("load", () => view.requestMeasure());
      image.addEventListener("error", () => view.requestMeasure());
    });
    return block;
  }

  ignoreEvent() {
    return true;
  }
}

function buildDecorations(state: EditorState) {
  const ranges: Range<Decoration>[] = [];
  const hidden: Range<Decoration>[] = [];
  const lines = new Map<number, Set<string>>();
  const mark = (
    from: number,
    to: number,
    className: string,
    attributes?: Record<string, string>,
  ) => {
    if (from < to)
      ranges.push(
        Decoration.mark({ class: className, attributes }).range(from, to),
      );
  };
  const hide = (from: number, to: number, widget?: WidgetType) => {
    if (from >= to) return;
    const range = Decoration.replace({ widget }).range(from, to);
    ranges.push(range);
    hidden.push(range);
  };
  const lineClass = (position: number, className: string) => {
    const from = state.doc.lineAt(position).from;
    const classes = lines.get(from) ?? new Set<string>();
    classes.add(className);
    lines.set(from, classes);
  };
  const activeLine = (position: number) => {
    const line = state.doc.lineAt(position);
    return selectionTouches(state, line.from, line.to);
  };
  const replaceBlock = (
    from: number,
    to: number,
    kind: "table" | "rule" | "image" | "callout" | "math",
    cells?: number[],
  ) => {
    ranges.push(
      Decoration.replace({
        block: true,
        widget: new RenderedBlock(state.sliceDoc(from, to), from, kind, cells),
      }).range(from, to),
    );
  };

  // CodeMirror parses incrementally; never force a synchronous parse of a large
  // note here. Rebuild when its background parser publishes more of the tree.
  syntaxTree(state).iterate({
    enter({ node, name, from, to }) {
      if (name === "ObsidianInline") {
        const source = state.sliceDoc(from, to);
        const match = readObsidianInline(source);
        if (!selectionTouches(state, from, to)) {
          hide(from, to, new RenderedInline(source, from));
        } else if (match?.kind === "highlight") {
          mark(from, to, "cm-live-highlight");
        } else mark(from, to, "cm-live-syntax");
        return false;
      }
      if (
        name === "Paragraph" &&
        /^\$\$\s*\n[\s\S]+\n\$\$\s*$/.test(state.sliceDoc(from, to)) &&
        state.doc.lineAt(from).from === from
      ) {
        if (!selectionTouches(state, from, to)) {
          replaceBlock(from, to, "math");
          return false;
        }
        return false;
      }
      if (
        name === "Blockquote" &&
        /^>\s*\[![\w-]+\]/.test(state.sliceDoc(from, to)) &&
        state.doc.lineAt(from).from === from
      ) {
        if (!selectionTouches(state, from, to))
          replaceBlock(from, to, "callout");
        // Reveal the whole callout while editing, including its type marker.
        // Otherwise Markdown's link parser can hide the brackets in [!tip].
        return false;
      }
      if (name === "FencedCode" || name === "CodeBlock") {
        const editing = selectionTouches(state, from, to);
        const fences = new Set<number>();
        const hiddenFences = new Set<number>();
        if (name === "FencedCode") {
          for (let child = node.firstChild; child; child = child.nextSibling) {
            if (child.name !== "CodeMark") continue;
            const line = state.doc.lineAt(child.from);
            fences.add(line.from);
            // Nested fences retain their list/quote prefixes.
            if (!editing && /^\s*(`{3,}|~{3,})/.test(line.text)) {
              hiddenFences.add(line.from);
              ranges.push(
                Decoration.replace({ block: true }).range(line.from, line.to),
              );
            }
          }
        }
        const start = state.doc.lineAt(from).number;
        const end = state.doc.lineAt(to).number;
        const firstVisible = hiddenFences.has(state.doc.line(start).from)
          ? start + 1
          : start;
        const lastVisible = hiddenFences.has(state.doc.line(end).from)
          ? end - 1
          : end;
        for (let number = start; number <= end; number++) {
          const line = state.doc.line(number);
          lineClass(line.from, "cm-live-codeblock");
          if (fences.has(line.from)) lineClass(line.from, "cm-live-fence");
          if (number === firstVisible)
            lineClass(line.from, "cm-live-codeblock-start");
          if (number === lastVisible)
            lineClass(line.from, "cm-live-codeblock-end");
        }
        return false;
      }

      if (name === "Table") {
        const line = state.doc.lineAt(from);
        const standalone = /^ {0,3}$/.test(state.sliceDoc(line.from, from));
        if (standalone && !selectionTouches(state, from, to)) {
          const cells: number[] = [];
          let columns = 0;
          for (let row = node.firstChild; row; row = row.nextSibling) {
            if (row.name !== "TableHeader" && row.name !== "TableRow") continue;
            const positions: number[] = [];
            let start = row.from;
            let content: number | undefined;
            for (let cell = row.firstChild; cell; cell = cell.nextSibling) {
              if (cell.name === "TableCell") content = cell.from;
              if (cell.name === "TableDelimiter") {
                if (cell.from !== row.from) positions.push(content ?? start);
                start = cell.to;
                content = undefined;
              }
            }
            if (state.sliceDoc(start, row.to).trim())
              positions.push(content ?? start);
            if (row.name === "TableHeader") columns = positions.length;
            // GFM pads short rows and ignores excess cells. Keep click targets
            // aligned with the rendered columns, including empty cells.
            for (let column = 0; column < columns; column++)
              cells.push(positions[column] ?? row.to);
          }
          replaceBlock(line.from, to, "table", cells);
          return false;
        }
        for (
          let number = state.doc.lineAt(from).number;
          number <= state.doc.lineAt(to).number;
          number++
        ) {
          lineClass(state.doc.line(number).from, "cm-live-table-source");
        }
      }

      if (
        name === "HorizontalRule" &&
        state.doc.lineAt(from).from === from &&
        !selectionTouches(state, from, to)
      ) {
        replaceBlock(from, to, "rule");
        return false;
      }

      // Local attachments get the same honest placeholder as Reading view.
      if (name === "Image") {
        const url = node.getChild("URL");
        const line = state.doc.lineAt(from);
        if (
          url &&
          line.from === from &&
          line.to === to &&
          !selectionTouches(state, from, to)
        ) {
          replaceBlock(from, to, "image");
        }
        return false;
      }

      const heading = /^(?:ATX|Setext)Heading([1-6])$/.exec(name);
      if (heading) lineClass(from, `cm-live-heading cm-live-h${heading[1]}`);
      if (name === "HeaderMark") {
        if (!selectionTouches(state, node.parent!.from, node.parent!.to)) {
          if (node.parent!.name.startsWith("Setext")) {
            const line = state.doc.lineAt(from);
            if (line.from === from) {
              ranges.push(
                Decoration.replace({ block: true }).range(line.from, line.to),
              );
            }
          } else {
            const space = /^\s*/.exec(
              state.sliceDoc(to, state.doc.lineAt(to).to),
            )![0].length;
            hide(from, to + space);
          }
        } else mark(from, to, "cm-live-syntax");
      }
      if (name === "Blockquote") {
        for (
          let number = state.doc.lineAt(from).number;
          number <= state.doc.lineAt(to).number;
          number++
        ) {
          lineClass(state.doc.line(number).from, "cm-live-quote");
        }
      }
      if (name === "QuoteMark") {
        if (!activeLine(from))
          hide(from, to + (state.sliceDoc(to, to + 1) === " " ? 1 : 0));
        else mark(from, to, "cm-live-syntax");
      }
      if (name === "ListItem") lineClass(from, "cm-live-list");
      if (name === "ListMark") {
        const task = node.parent?.getChild("Task");
        const unordered = /^[-*+]$/.test(state.sliceDoc(from, to));
        const marker = task?.getChild("TaskMarker");
        if (task && unordered && marker) {
          if (!selectionTouches(state, from, marker.to)) hide(from, to + 1);
          else mark(from, to, "cm-live-syntax");
        } else if (unordered && !selectionTouches(state, from, to)) {
          hide(from, to, new Bullet());
        } else mark(from, to, "cm-live-syntax");
      }
      if (name === "TaskMarker") {
        const checked = /[xX]/.test(state.sliceDoc(from, to));
        if (checked) lineClass(from, "cm-live-task-checked");
        if (!selectionTouches(state, from, to))
          hide(from, to, new TaskCheckbox(checked, from));
        else mark(from, to, "cm-live-syntax");
        return false;
      }

      const inlineClasses: Record<string, string> = {
        StrongEmphasis: "cm-live-strong",
        Emphasis: "cm-live-emphasis",
        Strikethrough: "cm-live-strike",
        InlineCode: "cm-live-code",
      };
      if (inlineClasses[name]) {
        mark(from, to, inlineClasses[name]);
        const editing = selectionTouches(state, from, to);
        for (let child = node.firstChild; child; child = child.nextSibling) {
          if (
            !["EmphasisMark", "StrikethroughMark", "CodeMark"].includes(
              child.name,
            )
          )
            continue;
          if (!editing) hide(child.from, child.to);
          else mark(child.from, child.to, "cm-live-syntax");
        }
        if (name === "InlineCode") return false;
      }
      if (name === "Link") {
        const open = node.firstChild;
        const close = open?.nextSibling;
        // Find the label's closing bracket (formatted labels have children).
        let labelEnd = close;
        while (labelEnd && labelEnd.name !== "LinkMark")
          labelEnd = labelEnd.nextSibling;
        const url = node.getChild("URL");
        if (open && labelEnd) {
          const href = url
            ? state.sliceDoc(url.from, url.to).replace(/^<|>$/g, "")
            : "";
          const external = /^https?:\/\//i.test(href) || /^mailto:/i.test(href);
          mark(
            open.to,
            labelEnd.from,
            external ? "cm-live-link" : "local-note-link",
            external
              ? { "data-live-href": href, title: "⌘/Ctrl-click to open link" }
              : { title: localLinkHint },
          );
          if (!selectionTouches(state, from, to)) {
            hide(open.from, open.to);
            hide(labelEnd.from, to);
          } else {
            mark(open.from, open.to, "cm-live-syntax");
            mark(labelEnd.from, to, "cm-live-syntax");
          }
        }
      }
      if (name === "Escape" && !selectionTouches(state, from, to))
        hide(from, from + 1);
    },
  });

  for (const [from, classes] of lines) {
    ranges.push(
      Decoration.line({ class: Array.from(classes).join(" ") }).range(from),
    );
  }
  return {
    decorations: Decoration.set(ranges, true),
    hidden: Decoration.set(hidden, true),
  };
}

const liveDecorations = StateField.define({
  create: buildDecorations,
  update(value, transaction) {
    return transaction.docChanged ||
      transaction.selection ||
      syntaxTree(transaction.startState) !== syntaxTree(transaction.state)
      ? buildDecorations(transaction.state)
      : value;
  },
  provide: (field) => [
    EditorView.decorations.from(field, (value) => value.decorations),
    EditorView.atomicRanges.of((view) => view.state.field(field).hidden),
  ],
});

export const livePreviewExtension = [
  liveDecorations,
  EditorView.editorAttributes.of({ class: "cm-live-preview" }),
];
