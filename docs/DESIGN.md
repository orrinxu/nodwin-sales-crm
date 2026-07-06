# Design System

## Architecture

The design system is a **token-backed CSS-variable layer** on top of Tailwind CSS v4 + shadcn/ui. Tokens are defined as
CSS custom properties at `:root` (light) and `.dark`, registered in Tailwind's `@theme inline` so every token is
available as a utility class (`bg-neutral-100`, `text-stage-qualify-fg`, etc.).

```
┌─────────────────────────────────────────────────┐
│  Component Primitives (DataTable, KpiCard, …)   │
├─────────────────────────────────────────────────┤
│  Semantic Tokens  (success, warning, …)         │
├─────────────────────────────────────────────────┤
│  Stage Tokens     (qualify → closed_lost)       │
├─────────────────────────────────────────────────┤
│  Brand / Accent    (brand, accent)             │
├─────────────────────────────────────────────────┤
│  Warm Neutral Scale (neutral-50 … neutral-950)  │
├─────────────────────────────────────────────────┤
│  Tailwind v4 @theme inline                       │
│  shadcn/ui theme (background, foreground, …)    │
└─────────────────────────────────────────────────┘
```

## Token Naming Convention

| Prefix          | Purpose                                    | Example                    |
|-----------------|--------------------------------------------|----------------------------|
| `--neutral-*`   | Warm grayscale, 50–950 scale               | `--neutral-100`            |
| `--brand-*`     | Primary brand accent, 50–950 scale         | `--brand-500`              |
| `--accent-*`    | Secondary accent, 50–950 scale             | `--accent-500`             |
| `--semantic-*`  | Success / warning / info / destructive     | `--semantic-success`       |
| `--stage-*-bg`  | Pipeline stage badge background            | `--stage-qualify-bg`       |
| `--stage-*-fg`  | Pipeline stage badge foreground/text       | `--stage-qualify-fg`       |
| `--stage-*-chart`| Pipeline stage chart solid fill           | `--stage-qualify-chart`    |

Tokens auto-register as Tailwind utilities: `--color-neutral-100` → `bg-neutral-100`, `text-neutral-100`, etc.

## Type Scale

| Token              | Value          | Tailwind Equivalent | Usage             |
|--------------------|----------------|---------------------|--------------------|
| `--text-overline`  | `0.625rem`     | `text-[0.625rem]`   | Labels, metadata   |
| `--text-caption`   | `0.75rem`      | `text-xs`           | Secondary text     |
| `--text-body-sm`   | `0.8125rem`    | `text-[0.8125rem]`  | Compact body       |
| `--text-body`      | `0.875rem`     | `text-sm`           | Body, tables       |
| `--text-body-lg`   | `1rem`         | `text-base`         | Card descriptions  |
| `--text-heading-sm`| `1rem`         | `text-base`         | Card titles        |
| `--text-heading`   | `1.125rem`     | `text-lg`           | Section headers    |
| `--text-heading-lg`| `1.5rem`       | `text-2xl`          | Page titles        |
| `--text-display`   | `1.875rem`     | `text-3xl`          | Dashboard KPIs     |

These are CSS custom properties, not Tailwind utilities. Components reference them directly
(e.g. `font-size: var(--text-body)`).

## STAGE Map

Every pipeline stage maps to three tokens: `bg` (badge background), `fg` (badge foreground), and `chart` (chart solid fill).

| Stage              | bg token                    | fg token                    | chart token                    |
|--------------------|-----------------------------|-----------------------------|-------------------------------|
| `qualify`          | `--stage-qualify-bg`        | `--stage-qualify-fg`        | `--stage-qualify-chart`       |
| `meet_and_present` | `--stage-meet-and-present-bg`| `--stage-meet-and-present-fg`| `--stage-meet-and-present-chart`|
| `propose`          | `--stage-propose-bg`        | `--stage-propose-fg`        | `--stage-propose-chart`       |
| `negotiate`        | `--stage-negotiate-bg`      | `--stage-negotiate-fg`      | `--stage-negotiate-chart`     |
| `verbal_agreement` | `--stage-verbal-agreement-bg`| `--stage-verbal-agreement-fg`| `--stage-verbal-agreement-chart`|
| `closed_won`       | `--stage-closed-won-bg`     | `--stage-closed-won-fg`     | `--stage-closed-won-chart`    |
| `closed_lost`      | `--stage-closed-lost-bg`    | `--stage-closed-lost-fg`    | `--stage-closed-lost-chart`   |

TypeScript helper: `stageTokens(stage: DealStage) → { bg: string; fg: string; chart: string }` (see `lib/utils.ts`).

## Warm Neutral Palette

Rendered from the neutral tokens defined in `globals.css`. Reference: 50 (lightest) → 950 (darkest).

| Token           | Light                        | Dark                         |
|-----------------|------------------------------|------------------------------|
| `neutral-50`    | `oklch(0.985 0.003 92)`     | `oklch(0.13 0.008 85)`      |
| `neutral-100`   | `oklch(0.97 0.005 92)`      | `oklch(0.17 0.009 85)`      |
| `neutral-200`   | `oklch(0.92 0.01 92)`       | `oklch(0.22 0.012 85)`      |
| `neutral-300`   | `oklch(0.87 0.015 90)`      | `oklch(0.28 0.015 85)`      |
| `neutral-400`   | `oklch(0.71 0.02 88)`       | `oklch(0.36 0.018 85)`      |
| `neutral-500`   | `oklch(0.56 0.025 85)`      | `oklch(0.48 0.022 85)`      |
| `neutral-600`   | `oklch(0.44 0.02 85)`       | `oklch(0.55 0.025 85)`      |
| `neutral-700`   | `oklch(0.36 0.018 85)`      | `oklch(0.72 0.02 88)`       |
| `neutral-800`   | `oklch(0.27 0.015 85)`      | `oklch(0.87 0.015 90)`      |
| `neutral-900`   | `oklch(0.21 0.01 85)`       | `oklch(0.92 0.01 92)`       |
| `neutral-950`   | `oklch(0.14 0.008 85)`      | `oklch(0.97 0.005 92)`      |

Note: Dark mode inverts the scale — `neutral-50` uses the darkest value, `neutral-950` uses the lightest.

## shadcn Divergence

The existing shadcn theme tokens (`--background`, `--foreground`, `--card`, `--muted`, `--border`, etc.)
have been updated to use warm neutral references instead of pure gray or green-tinted values.
See `globals.css` for exact mappings. The existing shadcn `Card`, `Badge`, `Table`, `Button`,
`Dialog`, `Select`, `Input` components remain unchanged — only their token values shift.

Breakdown:
- `--background` → `var(--neutral-50)` (was pure white)
- `--foreground` → `var(--neutral-950)` (was pure near-black)
- `--card` → `var(--neutral-50)` (was pure white)
- `--muted` → `var(--neutral-100)` (was oklch(0.97 0 0))
- `--muted-foreground` → `var(--neutral-500)` (was oklch(0.556 0 0))
- `--border` → `var(--neutral-200)` (was oklch(0.92 0.01 145))
- `--input` → `var(--neutral-200)` (was oklch(0.9 0.01 145))
- `--ring` → `var(--brand-500)` (was oklch(0.45 0.18 145))
- `--primary` → `var(--brand-600)`
- `--primary-foreground` → `var(--neutral-50)`
- `--secondary` → `var(--neutral-100)`
- `--secondary-foreground` → `var(--neutral-800)`
- `--accent` → `var(--neutral-100)`
- `--accent-foreground` → `var(--neutral-800)`
- `--destructive` → `var(--semantic-destructive)`

## Component Primitives

### `SectionHeader`
Card header with title, optional description, and optional action slot. Uses `CardHeader` + `CardTitle` + `CardDescription`.

### `KpiCard`
Stat card displaying a label, formatted value, optional trend indicator (up/down arrow with delta), and optional icon.
Uses `Card` with compact layout.

### `Badge` — Stage Variant
Extends the existing shadcn `Badge` with a `stage` variant that accepts a `stage: DealStage` prop and maps to
the correct `--stage-*-bg` / `--stage-*-fg` tokens.

Additional variants: `status` (success/warning/destructive/info), `tag` (neutral outline chip).

### `DataTable`
Thin wrapper around TanStack React Table. Provides:
- Consistent card container + border styling
- Toolbar slot for search/filters
- Empty state built-in
- Bulk action bar when rows are selected

### `DefinitionGrid`
A `<dl>`-based key-value grid for detail views. Renders term-description pairs in a responsive grid.

### `EmptyState`
Centered placeholder with icon, title, description, and optional action button. Used when lists/tables have no data.

### `FilterBar`
Horizontal bar of labeled filter controls (search input, select dropdowns, date pickers) with an active-filter indicator
and clear-all button.

### Chart Theme
CSS variables for Recharts: `--chart-1` through `--chart-5` mapped to the stage chart colors for pipeline charts,
plus a set of categorical chart colors for non-pipeline charts.
