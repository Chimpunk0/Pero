import type { MarkdownConfig } from "@lezer/markdown";

export const localLinkHint =
  "Local note links are not available yet. Edit the Markdown to change this reference.";
export const embedHint =
  "Local attachments and note embeds are not available yet.";

export function escapeHtml(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
}

// Shared recognition keeps Reading view and the editor's syntax tree in step.
export function readObsidianInline(source: string) {
  const wiki = /^(!?)\[\[([^\]\n]+)\]\]/.exec(source);
  if (wiki) {
    const [target, ...alias] = wiki[2].split("|");
    return {
      kind: wiki[1] ? "embed" : "wiki",
      raw: wiki[0],
      text: wiki[1] ? target : alias.join("|") || target,
      target,
    };
  }
  const highlight = /^==(?=\S)((?:[^=\n]|=(?!=))+?)==/.exec(source);
  if (highlight)
    return { kind: "highlight", raw: highlight[0], text: highlight[1] };
  // A dollar next to whitespace or a digit after its closing delimiter is
  // ordinary prose/currency. Code spans and escapes are handled by the parsers.
  const math = /^\$(?![\s$])((?:\\[^\n]|[^$\\\n])+?)(?<!\s)\$(?!\d)/.exec(
    source,
  );
  if (math) return { kind: "math", raw: math[0], text: math[1] };
  return null;
}

export const obsidianMarkdown: MarkdownConfig = {
  defineNodes: ["ObsidianInline"],
  parseInline: [
    {
      name: "ObsidianInline",
      before: "Link",
      parse(cx, next, pos) {
        if (![33, 91, 61, 36].includes(next)) return -1;
        const match = readObsidianInline(cx.slice(pos, cx.end));
        return match
          ? cx.addElement(cx.elt("ObsidianInline", pos, pos + match.raw.length))
          : -1;
      },
    },
  ],
};
