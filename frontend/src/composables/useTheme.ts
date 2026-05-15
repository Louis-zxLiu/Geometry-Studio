import { onMounted, ref } from "vue";
import { appThemes, getTheme } from "../theme/themes";
import { defaultThemeId, type ThemeId } from "../theme/palettes";

const storageKey = "plotkitycat.theme";

export function useTheme() {
  const currentThemeId = ref<ThemeId>(loadThemeId());

  function setTheme(themeId: ThemeId) {
    currentThemeId.value = themeId;
    localStorage.setItem(storageKey, themeId);
    applyTheme(themeId);
  }

  function cycleTheme() {
    const currentIndex = appThemes.findIndex((theme) => theme.id === currentThemeId.value);
    const nextTheme = appThemes[(currentIndex + 1) % appThemes.length] ?? appThemes[0];
    setTheme(nextTheme.id);
  }

  onMounted(() => {
    applyTheme(currentThemeId.value);
  });

  return {
    currentThemeId,
    cycleTheme,
    setTheme,
    themes: appThemes,
  };
}

function applyTheme(themeId: ThemeId) {
  const theme = getTheme(themeId);
  const root = document.documentElement;

  root.dataset.theme = theme.id;
  root.style.colorScheme = theme.dark ? "dark" : "light";

  Object.entries(theme.tokens).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });
}

function loadThemeId(): ThemeId {
  const stored = localStorage.getItem(storageKey);
  if (stored && appThemes.some((theme) => theme.id === stored)) {
    return stored as ThemeId;
  }

  return defaultThemeId;
}
