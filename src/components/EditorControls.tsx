import { useEffect, useRef, useState } from "react";
import type { ThemePreference, ViewMode } from "../types";
import { CloseIcon, MoonIcon, SunIcon, SystemIcon } from "./Icons";

const modes: ViewMode[] = ["source", "live", "split", "preview"];
const labels = {
  source: "Source",
  live: "Live",
  split: "Split",
  preview: "Preview",
};
const descriptions = {
  source: "Plain Markdown",
  live: "Write with formatting",
  split: "Editor & preview",
  preview: "Reading view",
};

export function EditorControls({
  fontSize,
  onFontSizeChange,
  writingWidth,
  onWritingWidthChange,
  mode,
  onModeChange,
  theme,
  onThemeChange,
  settingsOpen,
  onSettingsOpenChange,
}: {
  fontSize: number;
  onFontSizeChange: (value: number) => void;
  writingWidth: number;
  onWritingWidthChange: (value: number) => void;
  mode: ViewMode;
  onModeChange: (mode: ViewMode) => void;
  theme: ThemePreference;
  onThemeChange: (theme: ThemePreference) => void;
  settingsOpen: boolean;
  onSettingsOpenChange: (open: boolean) => void;
}) {
  const [modeOpen, setModeOpen] = useState(false);
  const control = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const settingsTrigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!modeOpen) return;
    menu.current
      ?.querySelector<HTMLButtonElement>('[aria-checked="true"]')
      ?.focus();
    const outside = (event: PointerEvent) => {
      if (!control.current?.contains(event.target as Node)) setModeOpen(false);
    };
    window.addEventListener("pointerdown", outside);
    return () => window.removeEventListener("pointerdown", outside);
  }, [modeOpen]);

  useEffect(() => {
    if (settingsOpen) dialog.current?.showModal();
    else if (dialog.current?.open) {
      dialog.current.close();
      settingsTrigger.current?.focus();
    }
  }, [settingsOpen]);

  return (
    <div className="toolbar-group view-actions">
      <div
        className="view-control"
        ref={control}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setModeOpen(false);
            trigger.current?.focus();
          }
          if (event.key === "Tab") setModeOpen(false);
          if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key))
            return;
          event.preventDefault();
          if (!modeOpen) {
            setModeOpen(true);
            return;
          }
          const items = Array.from(
            menu.current?.querySelectorAll<HTMLButtonElement>("button") ?? [],
          );
          const current = items.indexOf(
            document.activeElement as HTMLButtonElement,
          );
          const next =
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? items.length - 1
                : (current +
                    (event.key === "ArrowUp" ? -1 : 1) +
                    items.length) %
                  items.length;
          items[next]?.focus();
        }}
      >
        <button
          ref={trigger}
          className="soft-button view-trigger"
          aria-label={`View mode: ${labels[mode]}`}
          aria-haspopup="menu"
          aria-expanded={modeOpen}
          aria-controls="view-menu"
          onClick={() => setModeOpen(!modeOpen)}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            aria-hidden="true"
          >
            <rect x="3" y="4" width="18" height="16" rx="3" />
            <path
              d={mode === "split" ? "M12 4v16" : "M7 9h10M7 13h10M7 17h6"}
            />
          </svg>
          <span>{labels[mode]}</span>
          <span className="chevron" aria-hidden="true">
            ⌄
          </span>
        </button>
        {modeOpen && (
          <div
            ref={menu}
            id="view-menu"
            className="view-menu"
            role="menu"
            aria-label="View mode"
          >
            <div className="menu-caption">View mode</div>
            {modes.map((value, index) => (
              <button
                key={value}
                role="menuitemradio"
                aria-checked={mode === value}
                onClick={() => {
                  onModeChange(value);
                  setModeOpen(false);
                  trigger.current?.focus();
                }}
              >
                <span className="mode-check" aria-hidden="true">
                  {mode === value ? "✓" : ""}
                </span>
                <span>
                  <strong>{labels[value]}</strong>
                  <small>{descriptions[value]}</small>
                </span>
                <kbd>
                  {/Mac/.test(navigator.platform) ? "⌘" : "Ctrl+"}
                  {index + 1}
                </kbd>
              </button>
            ))}
          </div>
        )}
      </div>
      <button
        ref={settingsTrigger}
        className="soft-button settings-trigger"
        aria-label="Settings"
        title="Settings"
        onClick={() => {
          setModeOpen(false);
          onSettingsOpenChange(true);
        }}
      >
        <svg
          width="19"
          height="19"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m9 3-.7 2.5-2 .9L4 5.7 2 9l1.8 1.8v2.4L2 15l2 3.3 2.3-.7 2 .9L9 21h6l.7-2.5 2-.9 2.3.7 2-3.3-1.8-1.8v-2.4L22 9l-2-3.3-2.3.7-2-.9L15 3z" />
          <circle cx="12" cy="12" r="3.2" />
        </svg>
      </button>
      <dialog
        ref={dialog}
        className="settings-dialog"
        aria-labelledby="settings-title"
        onCancel={() => onSettingsOpenChange(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            const r = event.currentTarget.getBoundingClientRect();
            if (
              event.clientX < r.left ||
              event.clientX > r.right ||
              event.clientY < r.top ||
              event.clientY > r.bottom
            )
              onSettingsOpenChange(false);
          }
        }}
      >
        <div className="settings-heading">
          <h2 id="settings-title">Settings</h2>
          <button
            className="soft-button settings-trigger"
            aria-label="Close settings"
            onClick={() => onSettingsOpenChange(false)}
          >
            <CloseIcon />
          </button>
        </div>
        <div className="settings-layout">
          <div role="tablist" aria-label="Settings sections">
            <button
              role="tab"
              id="appearance-tab"
              aria-controls="appearance-panel"
              aria-selected="true"
              className="appearance-tab"
            >
              <SunIcon />
              Appearance
            </button>
          </div>
          <section
            role="tabpanel"
            id="appearance-panel"
            aria-labelledby="appearance-tab"
          >
            <h3>Make yourself at home.</h3>
            <p>Choose a comfortable light for your writing.</p>
            <div className="theme-options" role="group" aria-label="Theme">
              {(["light", "dark", "system"] as const).map((value) => {
                const Icon =
                  value === "light"
                    ? SunIcon
                    : value === "dark"
                      ? MoonIcon
                      : SystemIcon;
                return (
                  <button
                    key={value}
                    className="theme-option"
                    aria-pressed={theme === value}
                    aria-label={`${value[0].toUpperCase()}${value.slice(1)} theme`}
                    onClick={() => onThemeChange(value)}
                  >
                    <span className="soft-button theme-knob">
                      <Icon />
                    </span>
                    <span>
                      {value[0].toUpperCase()}
                      {value.slice(1)}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="writing-options">
              <label htmlFor="font-size">
                Text size <output>{fontSize} px</output>
              </label>
              <input
                id="font-size"
                type="range"
                min="12"
                max="24"
                step="1"
                value={fontSize}
                onChange={(event) =>
                  onFontSizeChange(Number(event.target.value))
                }
              />
              <label htmlFor="writing-width">
                Writing width <output>{writingWidth} px</output>
              </label>
              <input
                id="writing-width"
                type="range"
                min="600"
                max="1100"
                step="20"
                value={writingWidth}
                onChange={(event) =>
                  onWritingWidthChange(Number(event.target.value))
                }
              />
            </div>
            <p className="settings-note">
              System follows your device’s appearance.
            </p>
          </section>
        </div>
      </dialog>
    </div>
  );
}
