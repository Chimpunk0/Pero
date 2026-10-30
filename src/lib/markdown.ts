import DOMPurify from "dompurify";
import { Marked } from "marked";
import katex from "katex";
import {
  embedHint,
  escapeHtml,
  localLinkHint,
  readObsidianInline,
} from "./obsidian";

const marked = new Marked();
marked.use({
  extensions: [
    {
      name: "obsidianInline",
      level: "inline",
      start(src) {
        return src.search(/!?\[\[|==|\$/);
      },
      tokenizer(src) {
        const match = readObsidianInline(src);
        return match ? { type: "obsidianInline", ...match } : undefined;
      },
      renderer(token) {
        if (token.kind === "highlight")
          return `<mark>${marked.parseInline(token.text, { async: false })}</mark>`;
        if (token.kind === "math")
          return `<span class="math-source" data-display="false">${escapeHtml(token.text)}</span>`;
        const hint = token.kind === "embed" ? embedHint : localLinkHint;
        return `<span class="${token.kind === "embed" ? "attachment-placeholder" : "local-note-link"}" title="${hint}">${token.kind === "embed" ? "Attachment: " : ""}${escapeHtml(token.text)}</span>`;
      },
    },
    {
      name: "displayMath",
      level: "block",
      start(src) {
        return src.indexOf("$$");
      },
      tokenizer(src) {
        const match =
          /^ {0,3}\$\$[ \t]*\n([\s\S]+?)\n {0,3}\$\$[ \t]*(?:\n|$)/.exec(src);
        return match
          ? { type: "displayMath", raw: match[0], text: match[1] }
          : undefined;
      },
      renderer(token) {
        return `<div class="math-source" data-display="true">${escapeHtml(token.text)}</div>`;
      },
    },
  ],
  renderer: {
    blockquote(token) {
      const callout = /^\[!([\w-]+)\]([+-])?[^\S\n]*([^\n]*)(?:\n|$)/.exec(
        token.text,
      );
      if (!callout) return false;
      const type = callout[1].toLowerCase();
      const tone =
        /^(warning|caution|attention|danger|error|failure|fail|missing|bug)$/.test(
          type,
        )
          ? "warning"
          : /^(tip|hint|success|check|done)$/.test(type)
            ? "tip"
            : "note";
      const title = callout[3] || type.charAt(0).toUpperCase() + type.slice(1);
      // Fold markers are preserved in the source; callouts stay expanded here.
      return `<aside class="callout callout-${tone}"><div class="callout-title">${marked.parseInline(title, { async: false })}</div><div class="callout-body">${marked.parse(token.text.slice(callout[0].length), { async: false })}</div></aside>`;
    },
  },
});

marked.setOptions({
  gfm: true,
  breaks: false,
});

export function renderMarkdown(markdown: string): string {
  const rendered = marked.parse(markdown, { async: false }) as string;
  const sanitized = DOMPurify.sanitize(rendered, {
    FORBID_TAGS: [
      "script",
      "style",
      "iframe",
      "object",
      "embed",
      "form",
      "button",
      "textarea",
      "select",
    ],
    FORBID_ATTR: ["style"],
  });

  const template = document.createElement("template");
  template.innerHTML = sanitized;

  for (const table of template.content.querySelectorAll("table")) {
    const scroll = document.createElement("div");
    scroll.className = "table-scroll";
    scroll.tabIndex = 0;
    scroll.setAttribute("role", "region");
    scroll.setAttribute("aria-label", "Markdown table");
    table.before(scroll);
    scroll.append(table);
    for (const header of table.querySelectorAll("thead th")) {
      header.setAttribute("scope", "col");
    }
  }

  for (const input of template.content.querySelectorAll<HTMLInputElement>(
    "input",
  )) {
    if (input.type !== "checkbox") {
      input.remove();
      continue;
    }
    input.disabled = true;
    input.removeAttribute("name");
    input.removeAttribute("value");
  }

  for (const link of template.content.querySelectorAll<HTMLAnchorElement>(
    "a[href]",
  )) {
    const href = link.getAttribute("href") ?? "";
    if (/^https?:\/\//i.test(href) || /^mailto:/i.test(href)) {
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    } else if (!href.startsWith("#")) {
      const reference = document.createElement("span");
      reference.className = "local-note-link";
      reference.title = localLinkHint;
      reference.append(...Array.from(link.childNodes));
      link.replaceWith(reference);
    }
  }

  for (const image of template.content.querySelectorAll<HTMLImageElement>(
    "img",
  )) {
    const src = image.getAttribute("src") ?? "";
    if (!/^https:\/\//i.test(src) && !/^data:image\//i.test(src)) {
      const placeholder = document.createElement("span");
      placeholder.className = "attachment-placeholder";
      placeholder.textContent = `Attachment: ${image.alt || src}`;
      placeholder.title = embedHint;
      image.replaceWith(placeholder);
    }
  }

  for (const checkbox of template.content.querySelectorAll<HTMLInputElement>(
    'input[type="checkbox"]',
  )) {
    checkbox.classList.add("task-checkbox");
    const item = checkbox.closest("li");
    item?.classList.add("task-item");
    if (checkbox.checked) item?.classList.add("task-complete");
  }

  // Only KaTeX creates the styles needed for formula layout, after user HTML
  // has been sanitized. trust:false prevents HTML, URLs and resource loading.
  for (const math of template.content.querySelectorAll<HTMLElement>(
    ".math-source",
  )) {
    katex.render(math.textContent ?? "", math, {
      displayMode: math.dataset.display === "true",
      throwOnError: false,
      trust: false,
      strict: "ignore",
      maxExpand: 1000,
      maxSize: 10,
    });
    math.classList.replace("math-source", "rendered-math");
    math.removeAttribute("data-display");
  }

  return template.innerHTML;
}
