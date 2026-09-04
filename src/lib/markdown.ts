import DOMPurify from "dompurify";
import { marked } from "marked";

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
    }
  }

  return template.innerHTML;
}
