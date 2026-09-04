import { useMemo, type MouseEvent } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { renderMarkdown } from "../lib/markdown";
import { isTauri } from "../lib/platform";

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
    if (!/^https?:\/\//i.test(href) && !/^mailto:/i.test(href)) {
      onLinkError("Local note links are planned for a later version of Pero.");
      return;
    }

    try {
      if (isTauri()) {
        await openUrl(href);
      } else {
        window.open(href, "_blank", "noopener,noreferrer");
      }
    } catch {
      onLinkError("Pero could not open that link.");
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
      className="preview-pane markdown-body"
      aria-label="Markdown preview"
      onClick={handleClick}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
