import { openUrl } from "@tauri-apps/plugin-opener";
import { isTauri } from "./platform";

export async function openMarkdownLink(href: string): Promise<void> {
  if (!/^https?:\/\//i.test(href) && !/^mailto:/i.test(href)) {
    throw new Error(
      "Local note links are planned for a later version of Pero.",
    );
  }
  try {
    if (isTauri()) await openUrl(href);
    else window.open(href, "_blank", "noopener,noreferrer");
  } catch {
    throw new Error("Pero could not open that link.");
  }
}
