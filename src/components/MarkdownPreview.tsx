import { useMemo, type MouseEvent } from "react";
import { renderMarkdown } from "../lib/markdown";
import { openMarkdownLink } from "../lib/links";

interface MarkdownPreviewProps {
  content: string;
  onLinkError: (message: string) => void;
}

export function MarkdownPreview({
  content,
  onLinkError,
}: MarkdownPreviewProps) {
  const html = useMemo(() => renderMarkdown(content), [content]);

  async function handleClick(event: MouseEvent<HTMLElement>) {
    const target = event.target as HTMLElement;
    const link = target.closest<HTMLAnchorElement>("a[href]");
    if (!link) return;

    const href = link.getAttribute("href") ?? "";
    if (href.startsWith("#")) return;

    event.preventDefault();
    try {
      await openMarkdownLink(href);
    } catch (cause) {
      onLinkError((cause as Error).message);
    }
  }

  if (content.trim() === "") {
    return (
      <section
        className="preview-pane preview-empty"
        aria-label="Markdown preview"
      >
        <div>
          <span aria-hidden="true">¶</span>
          <p>Your rendered preview will appear here.</p>
        </div>
      </section>
    );
  }

  return (
    <section
      className="preview-pane"
      aria-label="Markdown preview"
      onClick={handleClick}
    >
      <div
        className="preview-content markdown-body"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </section>
  );
}
