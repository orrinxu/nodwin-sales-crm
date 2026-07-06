# Design System Foundation

The Nodwin Sales CRM design system. All tokens live in `app/globals.css`
(Tailwind v4 CSS-first — there is no `tailwind.config`). This document is the
reference for the token bands, the colour ramps, the flash-free theming
mechanism, the type scale, and the shared primitives.

---

## 1. Token bands

Tokens are organised into three bands in `app/globals.css`:

| Band | Where | Contents | Mutable per tenant? |
|---|---|---|---|
| **Fixed** | `:root` + `.dark` | Warm neutrals, semantic colours, the 7-stage ramp, neutral chart-1..5, radius | No — these are the product's identity |
| **Injectable** | `:root` + `.dark`, via `var(--brand-*, <fallback>)` | `--primary`, `--accent`, `--ring`, `--sidebar-primary`, `--sidebar-ring` (+ their `-foreground` pairs) | Yes — a future org-theming feature overrides the brand only |
| **Aliases** | `@theme inline` | Exposes the above as Tailwind colour/utility names (`bg-success`, `text-stage-closed_won`, …) and the type-scale `@utility` classes | n/a |

The neutrals never move, so components can rely on `bg-card` / `text-muted-foreground`
looking the same across every tenant. Only the brand accent is swappable.

---

## 2. Warm-neutral rationale

The previous neutrals were tinted with the brand green (hue 145) at low chroma,
which made every surface subtly cold-green and coupled the neutral foundation to
the brand. They are now re-tuned to a **fixed warm hue (~70)** at very low chroma
so surfaces read as warm-gray, independent of whatever brand accent is injected.
Warm neutrals pair well with the green brand (and any future brand) without the
whole UI shifting hue when the accent changes.

### Warm neutral values

| Token | Light (`:root`) | Dark (`.dark`) |
|---|---|---|
| `--background` | `oklch(0.995 0.003 70)` | `oklch(0.16 0.008 70)` |
| `--foreground` | `oklch(0.18 0.01 70)` | `oklch(0.96 0.005 70)` |
| `--card` / `--popover` | `oklch(1 0.002 70)` | `oklch(0.2 0.01 70)` |
| `--secondary` | `oklch(0.95 0.008 70)` | `oklch(0.26 0.012 70)` |
| `--muted` | `oklch(0.97 0.006 70)` | `oklch(0.25 0.01 70)` |
| `--muted-foreground` | `oklch(0.52 0.02 70)` | `oklch(0.68 0.02 70)` |
| `--border` | `oklch(0.92 0.008 70)` | `oklch(0.28 0.012 70)` |
| `--input` | `oklch(0.9 0.01 70)` | `oklch(0.31 0.014 70)` |
| `--sidebar` | `oklch(0.985 0.005 70)` | `oklch(0.15 0.008 70)` |
| `--sidebar-accent` | `oklch(0.95 0.008 70)` | `oklch(0.24 0.012 70)` |

`secondary` and `sidebar-accent` are treated as fixed warm neutrals (they are
neutral surfaces, not brand accents).

---

## 3. Semantic colours (fixed)

Four semantic tokens, each with a `-foreground` pair. Use the subtle
`bg-<tone>/12` + `text-<tone>` pattern for pills (see `<StatusBadge>`).

| Token | Light | Dark |
|---|---|---|
| `--success` | `oklch(0.55 0.14 150)` | `oklch(0.68 0.16 150)` |
| `--success-foreground` | `oklch(0.99 0 0)` | `oklch(0.16 0.02 150)` |
| `--warning` | `oklch(0.72 0.15 75)` | `oklch(0.78 0.15 75)` |
| `--warning-foreground` | `oklch(0.26 0.05 75)` | `oklch(0.2 0.04 75)` |
| `--info` | `oklch(0.55 0.15 250)` | `oklch(0.66 0.15 250)` |
| `--info-foreground` | `oklch(0.99 0 0)` | `oklch(0.16 0.02 250)` |
| `--destructive` | `oklch(0.577 0.245 27.325)` | `oklch(0.704 0.191 22.216)` |
| `--destructive-foreground` | `oklch(0.99 0 0)` | `oklch(0.99 0 0)` |

Exposed to Tailwind as `--color-success`, `--color-warning`, `--color-info`
(and `-foreground`) — so `bg-success`, `text-warning`, etc. exist.

---

## 4. The 7-stage ramp (fixed)

One colour identity per canonical `DealStage`, each with three values:
`badge-bg` (subtle pill background), `badge-fg` (readable pill text), and
`chart` (saturated solid for recharts). The TypeScript source of truth is
`lib/theme/stage.ts` (`STAGE`), whose values are `var()` references into these
CSS vars — so a stage looks identical whether rendered as a `<StageBadge>` pill
or a chart bar.

### Chart solids

| Stage | Light `--stage-*-chart` | Dark `--stage-*-chart` |
|---|---|---|
| `qualify` (blue 250) | `oklch(0.6 0.14 250)` | `oklch(0.68 0.15 250)` |
| `meet_and_present` (violet 290) | `oklch(0.58 0.16 290)` | `oklch(0.66 0.17 290)` |
| `propose` (amber 75) | `oklch(0.72 0.14 75)` | `oklch(0.76 0.14 75)` |
| `negotiate` (orange 45) | `oklch(0.65 0.16 45)` | `oklch(0.7 0.16 45)` |
| `verbal_agreement` (teal 190) | `oklch(0.62 0.11 190)` | `oklch(0.7 0.11 190)` |
| `closed_won` (green 150) | `oklch(0.6 0.15 150)` | `oklch(0.7 0.16 150)` |
| `closed_lost` (red 25) | `oklch(0.58 0.2 25)` | `oklch(0.66 0.2 25)` |

### Badge bg / fg

Light badges use a light tint (`bg ~ oklch(0.95 0.04 <hue>)`) with a dark
saturated text (`fg ~ oklch(0.45 0.13 <hue>)`). Dark badges invert: a low-L
tinted background (`~ oklch(0.30 0.06 <hue>)`) with bright text
(`~ oklch(0.82 0.12 <hue>)`). Exact per-stage values are in `app/globals.css`.

Exposed to Tailwind as `--color-stage-<id>` (mapped to the chart solid) so
`bg-stage-closed_won` / `text-stage-qualify` utilities exist.

**`STAGE` is the single source of truth.** The previously scattered colour maps
in `reports-view.tsx`, `reports-content.tsx`, `pipeline-chart.tsx`,
`recent-deals.tsx`, and the event colours in `stage-history-timeline.tsx` were
deleted and now consume `STAGE` / the semantic tokens via
`components/primitives/chart-theme.ts`. This also fixed a latent bug where the
old reports map keyed `won`/`lost` but the data emits canonical
`closed_won`/`closed_lost`, so those bars silently fell back to gray.

---

## 5. Injectable brand + flash-free theming

### Theme object

`lib/theme/theme-object.ts` holds `SEEDED_THEME` (the default green brand for
light + dark) and helpers. The seeded values are **identical** to the fallbacks
declared in `globals.css`, so "injected" and "not injected" render the same
until a tenant overrides the brand.

### Mechanism

1. `app/layout.tsx` (server component) reads the `nodwin-crm-theme` cookie,
   resolves the mode with `resolveThemeMode()` (falls back to the seeded default
   `dark` — the server cannot detect the OS "system" preference), and:
   - renders `class="dark"` (or not) on `<html>`, **and**
   - stamps `themeInjectionVars()` inline on `<html>` — this emits **both** the
     `--brand-*-light` and `--brand-*-dark` custom properties.
2. `globals.css` consumes them per mode with a fallback:
   ```css
   :root { --primary: var(--brand-primary-light, oklch(0.45 0.18 145)); }
   .dark { --primary: var(--brand-primary-dark,  oklch(0.65 0.2 145));  }
   ```
   Because both mode sets are present, a runtime light/dark toggle only flips the
   `.dark` class — no JS re-injection of brand vars, and no re-flash.
3. `components/theme/theme-provider.tsx` hydrates from the SSR-applied class for
   explicit `light`/`dark` preferences (flash-free), and only reconciles the OS
   value for the `system` preference. `setTheme` mirrors the choice to **both**
   `localStorage` and a cookie, so the next SSR paint is already correct.

This kills the previous flash where `<html>` shipped with no theme class and
`.dark` was only added client-side in a `useEffect`, so the first paint was
always light.

---

## 6. Type scale

Tailwind v4 `@utility` classes (compose with colour/weight utilities as needed):

| Utility | Size / line-height | Use |
|---|---|---|
| `text-display` | 2.25rem / 2.5rem, 600 | Hero / marketing figures |
| `text-title` | 1.5rem / 2rem, 600 | Page titles (`SectionHeader`) |
| `text-heading` | 1.125rem / 1.6rem, 600 | Card / section headings |
| `text-subheading` | 0.875rem / 1.25rem, 500 | Emphasised labels |
| `text-body` | 0.875rem / 1.4rem, 400 | Body copy |
| `text-caption` | 0.75rem / 1rem, 400 | Secondary / meta text |
| `text-eyebrow` | 0.6875rem, uppercase, tracked | Overlines |

Font family is **Inter** (`next/font/google`, self-hosted, no npm dependency),
wired to `--font-sans`.

---

## 7. Primitives

Under `components/primitives/`. They compose the base `components/ui/*` (shadcn
on `@base-ui/react`) — the base cva components are intentionally not edited.

| Primitive | Purpose |
|---|---|
| `SectionHeader` | Page/section title + description + right-aligned actions |
| `KpiCard` | Metric tile (label, value, optional icon / delta / hint) |
| `StageBadge` | Pipeline-stage pill — wraps `ui/badge`, feeds `STAGE` colours via inline style. Do not reproduce stage colours elsewhere |
| `StatusBadge` | Semantic status pill (`success`/`warning`/`info`/`destructive`/`neutral`) |
| `TagBadge` | Neutral tag/label pill with optional remove affordance |
| `DataTable` | Generic wrapper over `@tanstack/react-table` + `ui/table`; controlled sorting/selection optional |
| `DefinitionGrid` | Responsive label/value `<dl>` for detail panels |
| `EmptyState` | Centered zero-data placeholder |
| `FilterBar` / `FilterField` | Row of **labelled** filter controls |
| `chart-theme.ts` | `stageChartColor()`, `CHART_SERIES`, `chartTooltipStyle` — the only place recharts pulls fills, sharing `STAGE` |

### Usage notes

- **Stages** → `<StageBadge stage={s} />`. Never hard-code stage colours.
- **Charts** → `stageChartColor(stage)` for per-stage fills; `CHART_SERIES` for
  won/lost/created rollups; `chartTooltipStyle` for tooltip containers.
- **Generic outcomes / health** → `<StatusBadge tone="…">`.
- **Filters** → wrap controls in `<FilterBar>` with `<FilterField label>` so
  every control has a visible label (no unlabeled placeholder rows).
