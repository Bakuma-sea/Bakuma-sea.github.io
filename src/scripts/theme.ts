const THEME_KEY = "theme";
const LIGHT = "light";
const DARK = "dark";
const PAPER = "paper";
const THEMES = [LIGHT, DARK, PAPER] as const;
type ThemeValue = (typeof THEMES)[number];

function isThemeValue(value: string | null): value is ThemeValue {
  return THEMES.includes(value as ThemeValue);
}

function getPreferredTheme(): ThemeValue {
  const stored = localStorage.getItem(THEME_KEY);
  if (isThemeValue(stored)) return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? DARK
    : LIGHT;
}

// Reuse the value already set by the inline FOUC-prevention script if available.
let themeValue: ThemeValue = isThemeValue(
  (window as unknown as { __theme?: { value: string } }).__theme?.value ?? null
)
  ? (window as unknown as { __theme: { value: ThemeValue } }).__theme.value
  : getPreferredTheme();

function persist(): void {
  localStorage.setItem(THEME_KEY, themeValue);
  reflect();
}

function reflect(): void {
  const root = document.firstElementChild;
  root?.setAttribute("data-theme", themeValue);
  root?.classList.toggle("dark", themeValue === DARK);
  document
    .querySelector("#theme-switcher")
    ?.setAttribute("data-current-theme", themeValue);
  document.querySelectorAll<HTMLElement>("[data-theme-option]").forEach(btn => {
    const active = btn.dataset.themeOption === themeValue;
    btn.setAttribute("aria-pressed", String(active));
  });

  // Fill <meta name="theme-color"> with the computed background colour so
  // Android's browser chrome matches the page background.
  const bg = window.getComputedStyle(document.body).backgroundColor;
  document
    .querySelector("meta[name='theme-color']")
    ?.setAttribute("content", bg);
}

function setup(): void {
  reflect();

  document.querySelectorAll<HTMLElement>("[data-theme-option]").forEach(btn => {
    if (btn.dataset.themeBound === "true") return;
    btn.dataset.themeBound = "true";

    btn.addEventListener("click", () => {
      const nextTheme = btn.dataset.themeOption ?? null;
      if (!isThemeValue(nextTheme)) return;
      themeValue = nextTheme;
      persist();
    });
  });
}

setup();

// Re-run after View Transitions navigation.
document.addEventListener("astro:after-swap", setup);

// Carry the theme-color value across View Transitions to prevent the
// Android navigation bar from flashing during page transitions.
document.addEventListener("astro:before-swap", event => {
  const color = document
    .querySelector("meta[name='theme-color']")
    ?.getAttribute("content");
  if (color) {
    (event as { newDocument: Document }).newDocument
      .querySelector("meta[name='theme-color']")
      ?.setAttribute("content", color);
  }
});

// Sync with OS-level dark/light preference changes.
window
  .matchMedia("(prefers-color-scheme: dark)")
  .addEventListener("change", ({ matches }) => {
    if (localStorage.getItem(THEME_KEY)) return;
    themeValue = matches ? DARK : LIGHT;
    reflect();
  });
