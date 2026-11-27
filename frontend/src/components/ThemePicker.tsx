import { ChangeEvent, useLayoutEffect, useState } from "react";

const STORAGE_KEY = "boardgamemanager:theme";
const themes = [
  { id: "glasshouse", name: "Pine & Parchment" },
  { id: "wildflower", name: "Copper Workshop" },
  { id: "honeyed-grove", name: "Moss & Mustard" },
  { id: "blue-hour", name: "Blue Hour & Brass" },
  { id: "rosewood", name: "Burgundy Parlour" },
  { id: "candlewick", name: "Walnut Reading Room" },
] as const;

type ThemeId = (typeof themes)[number]["id"];

function isThemeId(value: string | null): value is ThemeId {
  return themes.some((theme) => theme.id === value);
}

function savedTheme(): ThemeId {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return isThemeId(stored) ? stored : "glasshouse";
}

export function ThemePicker() {
  const [theme, setTheme] = useState<ThemeId>(savedTheme);

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  function changeTheme(event: ChangeEvent<HTMLSelectElement>) {
    const nextTheme = event.target.value;
    if (isThemeId(nextTheme)) setTheme(nextTheme);
  }

  return (
    <label className="theme-picker">
      <span className="theme-picker__label">Theme</span>
      <select aria-label="Choose a color theme" onChange={changeTheme} value={theme}>
        {themes.map((option) => (
          <option key={option.id} value={option.id}>{option.name}</option>
        ))}
      </select>
    </label>
  );
}
