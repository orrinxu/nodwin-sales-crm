/**
 * Injectable brand/accent theme object.
 *
 * The FIXED design tokens (warm neutrals, semantic colours, the 7-stage ramp)
 * live entirely in `app/globals.css` and are never injected. Only the BRAND
 * layer — primary / accent / ring / active sidebar item — is injectable, so a
 * future "org theming" feature can override it per tenant without touching the
 * neutral foundation.
 *
 * Mechanism (flash-free):
 *   1. `app/layout.tsx` reads the resolved theme and writes BOTH the light and
 *      dark brand values as inline CSS custom properties on <html>
 *      (`--brand-*-light` / `--brand-*-dark`) via {@link themeInjectionVars}.
 *   2. `globals.css` consumes them with a fallback:
 *        :root  { --primary: var(--brand-primary-light, <seeded light>); }
 *        .dark  { --primary: var(--brand-primary-dark,  <seeded dark>);  }
 *      so SSR-without-injection still renders (fallback == seeded default) and
 *      a runtime light/dark toggle only flips the `.dark` class — both brand
 *      sets are already present, so there is no re-flash and no JS re-injection.
 */

export interface ThemeColors {
  primary: string
  primaryForeground: string
  accent: string
  accentForeground: string
  ring: string
  sidebarPrimary: string
  sidebarPrimaryForeground: string
  sidebarRing: string
}

export interface ThemeObject {
  light: ThemeColors
  dark: ThemeColors
}

export type ThemeMode = "light" | "dark"

/**
 * Seeded default brand. These values MUST equal the fallbacks declared in
 * `globals.css` so that "injected" and "not injected" render identically until
 * a tenant overrides the brand.
 */
export const SEEDED_THEME: ThemeObject = {
  light: {
    primary: "oklch(0.45 0.18 145)",
    primaryForeground: "oklch(0.985 0 0)",
    accent: "oklch(0.93 0.05 145)",
    accentForeground: "oklch(0.25 0.06 145)",
    ring: "oklch(0.45 0.18 145)",
    sidebarPrimary: "oklch(0.45 0.18 145)",
    sidebarPrimaryForeground: "oklch(0.985 0 0)",
    sidebarRing: "oklch(0.45 0.18 145)",
  },
  dark: {
    primary: "oklch(0.65 0.2 145)",
    primaryForeground: "oklch(0.12 0.02 145)",
    accent: "oklch(0.22 0.04 145)",
    accentForeground: "oklch(0.9 0.02 145)",
    ring: "oklch(0.6 0.18 145)",
    sidebarPrimary: "oklch(0.6 0.2 145)",
    sidebarPrimaryForeground: "oklch(0.12 0.02 145)",
    sidebarRing: "oklch(0.55 0.16 145)",
  },
}

/** Cookie / localStorage key that stores the user's theme preference. */
export const THEME_STORAGE_KEY = "nodwin-crm-theme"

/** Seeded default when no preference is known (SSR cannot detect "system"). */
export const DEFAULT_THEME_MODE: ThemeMode = "light"

/**
 * Resolve a stored preference string ("light" | "dark" | "system" | undefined)
 * to a concrete mode for server rendering. "system" and unknown values fall
 * back to the seeded default because the server cannot read the OS preference.
 */
export function resolveThemeMode(preference?: string | null): ThemeMode {
  if (preference === "light" || preference === "dark") return preference
  return DEFAULT_THEME_MODE
}

function brandVarsForMode(
  colors: ThemeColors,
  suffix: ThemeMode,
): Record<string, string> {
  return {
    [`--brand-primary-${suffix}`]: colors.primary,
    [`--brand-primary-foreground-${suffix}`]: colors.primaryForeground,
    [`--brand-accent-${suffix}`]: colors.accent,
    [`--brand-accent-foreground-${suffix}`]: colors.accentForeground,
    [`--brand-ring-${suffix}`]: colors.ring,
    [`--brand-sidebar-primary-${suffix}`]: colors.sidebarPrimary,
    [`--brand-sidebar-primary-foreground-${suffix}`]:
      colors.sidebarPrimaryForeground,
    [`--brand-sidebar-ring-${suffix}`]: colors.sidebarRing,
  }
}

/**
 * Produce the inline CSS custom properties to stamp on <html>. Emits BOTH the
 * `-light` and `-dark` brand vars so the class toggle alone switches modes.
 */
export function themeInjectionVars(
  theme: ThemeObject = SEEDED_THEME,
): Record<string, string> {
  return {
    ...brandVarsForMode(theme.light, "light"),
    ...brandVarsForMode(theme.dark, "dark"),
  }
}
