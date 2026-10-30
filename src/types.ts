export type ViewMode = "source" | "live" | "split" | "preview";
export type ThemePreference = "system" | "light" | "dark";

export interface RecentFile {
  path: string;
  name: string;
  openedAt: number;
}

export interface Preferences {
  theme: ThemePreference;
  viewMode: ViewMode;
  recentFiles: RecentFile[];
  fontSize: number;
  writingWidth: number;
}

export interface MarkdownDocument {
  path: string;
  name: string;
  contents: string;
  revision: string;
}

export interface RecoveryDraft {
  path: string | null;
  name: string;
  content: string;
  savedContent: string;
  revision: string | null;
  lineSeparator: "\n" | "\r\n" | "\r";
}
