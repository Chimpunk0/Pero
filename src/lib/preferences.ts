import type {
  Preferences,
  RecentFile,
  ThemePreference,
  ViewMode,
} from "../types";

export const DEFAULT_PREFERENCES: Preferences = {
  theme: "system",
  viewMode: "live",
  recentFiles: [],
  fontSize: 16,
  writingWidth: 820,
};

const themes: ThemePreference[] = ["system", "light", "dark"];
const modes: ViewMode[] = ["source", "live", "split", "preview"];

export function normalizePreferences(value: unknown): Preferences {
  if (!value || typeof value !== "object") return { ...DEFAULT_PREFERENCES };

  const candidate = value as Partial<Preferences>;
  return {
    theme: themes.includes(candidate.theme as ThemePreference)
      ? (candidate.theme as ThemePreference)
      : DEFAULT_PREFERENCES.theme,
    viewMode: modes.includes(candidate.viewMode as ViewMode)
      ? (candidate.viewMode as ViewMode)
      : DEFAULT_PREFERENCES.viewMode,
    recentFiles: normalizeRecentFiles(candidate.recentFiles),
    fontSize: validNumber(
      candidate.fontSize,
      12,
      24,
      DEFAULT_PREFERENCES.fontSize,
    ),
    writingWidth: validNumber(
      candidate.writingWidth,
      600,
      1100,
      DEFAULT_PREFERENCES.writingWidth,
    ),
  };
}

export function normalizeRecentFiles(value: unknown): RecentFile[] {
  if (!Array.isArray(value)) return [];

  const unique = new Map<string, RecentFile>();
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const candidate = item as Partial<RecentFile>;
    if (
      typeof candidate.path !== "string" ||
      candidate.path.trim() === "" ||
      typeof candidate.name !== "string" ||
      candidate.name.trim() === ""
    ) {
      continue;
    }

    const normalizedPath = candidate.path.trim();
    if (!unique.has(normalizedPath)) {
      unique.set(normalizedPath, {
        path: normalizedPath,
        name: candidate.name.trim(),
        openedAt:
          typeof candidate.openedAt === "number" &&
          Number.isFinite(candidate.openedAt)
            ? candidate.openedAt
            : 0,
      });
    }
  }

  return [...unique.values()]
    .sort((a, b) => b.openedAt - a.openedAt)
    .slice(0, 10);
}

export function addRecentFile(
  recentFiles: RecentFile[],
  file: Omit<RecentFile, "openedAt">,
  openedAt = Date.now(),
): RecentFile[] {
  return normalizeRecentFiles([
    { ...file, openedAt },
    ...recentFiles.filter((recent) => recent.path !== file.path),
  ]);
}

export function removeRecentFile(
  recentFiles: RecentFile[],
  path: string,
): RecentFile[] {
  return recentFiles.filter((recent) => recent.path !== path);
}

function validNumber(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.round(Math.min(max, Math.max(min, value)))
    : fallback;
}
