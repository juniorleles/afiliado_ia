export const themeNames = ["light", "dark", "system"] as const;

export type ThemeName = (typeof themeNames)[number];

export function applyTheme(theme: ThemeName): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme === "system" ? "light dark" : theme;
}
