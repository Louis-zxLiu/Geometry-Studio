import { themeSeeds, type ThemeId, type ThemeSeed } from "./palettes";

export type ThemeTokens = Record<string, string>;

export type AppTheme = ThemeSeed & {
  tokens: ThemeTokens;
};

export const appThemes: AppTheme[] = themeSeeds.map(createTheme);

export function getTheme(themeId: ThemeId) {
  return appThemes.find((theme) => theme.id === themeId) ?? appThemes[0];
}

function createTheme(seed: ThemeSeed): AppTheme {
  const tokens: ThemeTokens = {
    "--app-bg": seed.bg,
    "--sidebar-bg": seed.sidebar,
    "--notebook-bg": deriveNotebookSurface(seed),
    "--workspace-bg": seed.main,
    "--surface": seed.main,
    "--surface-soft": seed.sidebar,
    "--surface-raised": seed.accent,
    "--surface-hover": seed.accent,
    "--toolbar-control": "transparent",
    "--glass-line": seed.accent,
    "--text": seed.ink,
    "--muted": seed.smoke,
    "--subtle": seed.smoke,
    "--line": seed.accent,
    "--line-strong": seed.smoke,
    "--accent": seed.accent,
    "--accent-strong": seed.ink,
    "--run": seed.ink,
    "--run-hover": seed.ink,
    "--focus": seed.smoke,
    "--body-wash": seed.bg,
    "--hover-fill": seed.accent,
    "--active-fill": seed.accent,
    "--file-icon-bg": "transparent",
    "--file-icon-text": seed.smoke,
    "--dialog-bg": seed.main,
    "--dialog-input-surface": seed.dark
      ? "color-mix(in srgb, " + seed.sidebar + ", black 18%)"
      : "color-mix(in srgb, " + seed.main + ", " + seed.bg + " 42%)",
    "--dialog-input-bg": seed.dark
      ? "color-mix(in srgb, " + seed.main + ", white 4%)"
      : "color-mix(in srgb, " + seed.main + ", white 12%)",
    "--dialog-input-focus": seed.dark
      ? "color-mix(in srgb, " + seed.main + ", white 8%)"
      : "color-mix(in srgb, " + seed.bg + ", white 18%)",
    "--dialog-shadow": seed.dark ? "rgba(0, 0, 0, 0.34)" : "rgba(67, 52, 34, 0.1)",
    "--dialog-line": seed.accent,
    "--loading-track": seed.accent,
    "--loading-accent": seed.smoke,
    "--loading-glow": seed.accent,
    "--syntax-keyword": seed.dark ? "#d7b889" : "#7a5630",
    "--syntax-builtin": seed.dark ? "#a9bd93" : "#516247",
    "--syntax-string": seed.dark ? "#c2ad75" : "#6f6a45",
    "--syntax-number": seed.dark ? "#c99b86" : "#80685a",
    "--syntax-comment": seed.smoke,
    "--syntax-decorator": seed.dark ? "#9eb5b5" : "#6d7171",
    "--syntax-operator": seed.smoke,
  };

  return {
    ...seed,
    tokens,
  };
}

function deriveNotebookSurface(seed: ThemeSeed) {
  return seed.main;
}
