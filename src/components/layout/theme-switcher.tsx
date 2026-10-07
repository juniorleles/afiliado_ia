"use client";

import { applyTheme, themeNames, type ThemeName } from "@/lib/ui/theme";
import { Button } from "@/components/ui/button";

const labels: Record<ThemeName, string> = {
  light: "Claro",
  dark: "Escuro",
  system: "Sistema",
};

export function ThemeSwitcher({ theme, onThemeChange }: { theme: ThemeName; onThemeChange: (theme: ThemeName) => void }) {
  return (
    <div role="group" aria-label="Tema" className="flex items-center gap-ds-4">
      {themeNames.map((name) => (
        <Button
          key={name}
          type="button"
          size="sm"
          variant={theme === name ? "primary" : "ghost"}
          aria-pressed={theme === name}
          onClick={() => {
            onThemeChange(name);
            applyTheme(name);
          }}
        >
          {labels[name]}
        </Button>
      ))}
    </div>
  );
}
