---
name: Zarix
description: >
  Design system for Zarix — the personal-finance app for Argentina (multi-currency
  net worth, budgets, recurring rules, investments). One brand color (emerald),
  token-driven light/dark themes, dense financial data rendered calmly.
exemplars: [supabase]
tokens:
  color:
    primary: "#22C55E"              # --primary (34 197 94) — the ONLY brand/CTA color
    primary-foreground: "#04120B"   # dark green ink on primary fills
    ring: "#22C55E"                 # --ring, focus outline everywhere
    canvas:
      dark: "#06070A"               # --background (dark)
      light: "#F7F8FB"              # --background (light)
    surface:
      dark:
        base: "#0A0C11"             # --surface
        elevated: "#12151C"         # --surface-elevated / --card
        soft: "#181C26"             # --surface-soft
        glass: "#0F121A"            # --surface-glass (blur panels)
      light:
        base: "#FFFFFF"
        elevated: "#FFFFFF"         # --card
        soft: "#F2F5FA"
        glass: "#FFFFFF"
    ink:
      dark: { high: "#F5F6F8", muted: "#A8ADB8" }   # --foreground / --muted-foreground
      light: { high: "#0C0F16", muted: "#606877" }
    border:
      dark: "#232733"               # --border, hairline 1px
      light: "#D9DFE9"
    semantic:
      up: "#22C55E"                 # income / gains — same value as primary
      down: "#F43F5E"               # expenses / losses (chart rose, softer than pure red)
      destructive: { light: "#EF4444", dark: "#FF453A" }  # errors, delete actions
      warning: "#FFB020"            # --warning, budget alerts
      info: "#3B82F6"               # --info — chips/badges ONLY, never CTAs or brand
      accent-invest: "#8B5CF6"      # violet — investments/ROI series only
  typography:
    family: "Inter (var(--font-inter)), SF Pro Text fallback, system-ui"
    numerals: tabular-nums          # set globally on body; .zx-num adds mono
  radius:
    card: "1.35rem"                 # --radius-card (1.05rem on <640px)
    control: "0.95rem"              # --radius-control
  layout:
    max-width: "72rem"              # --layout-max-width (.page-container / max-w-shell)
    gutter: "1rem / 1.25rem md / 1.5rem lg"   # --layout-gutter
    reading-width: "52rem"          # --reading-width, long-form copy cap
---

# Zarix Design System

## Overview

Zarix renders serious money data with one calm identity: a near-black canvas (or
soft off-white in light mode), hairline borders, glassy elevated panels, and a
single emerald brand color used for every call-to-action, focus ring, and
positive money movement. The reference feel is Supabase: dark, quiet chrome
where the green does all the talking. Everything is driven by the CSS custom
properties in `app/globals.css`, exposed as Tailwind utilities via
`tailwind.config.ts`. There is exactly one source of truth per color — no
parallel palettes per page.

The marketing landing (`app/page.tsx` + `components/landing/*`) pins the
`dark` class on its root and consumes the same tokens (`bg-background`,
`bg-card`, `text-foreground`, `text-muted-foreground`, `bg-primary`) — same
system, not a fork. Exception (2026-07-08): the hero and navbar are scoped
`light` (a `.light` class in `globals.css` re-applies the light token set
inside a dark root) over a full-bleed illustrated daylight scenery
(`HeroScenery.tsx`); every section below stays dark.

**Landing hero illustration** — `components/landing/HeroScenery.tsx` is
artwork (layered SVG alpine landscape, emerald-family palette). Its literal
SVG colors are exempt from the no-hex rule; all UI rendered on top of it
(headline, CTAs, browser-frame preview) keeps using tokens. The dashboard
preview inside the hero (`HeroDashboardPreview.tsx`) nests a `.dark` wrapper
so the app mock renders with real dark tokens.

## Colors

- **Primary — emerald `#22C55E`** (`--primary`, `bg-primary` / `text-primary`).
  The only color allowed for CTAs, active states, toggles, links, brand marks,
  and focus rings. Text on primary fills is `text-primary-foreground`
  (`#04120B`), never `text-white`.
- **Canvas** — `--background`: `#06070A` dark / `#F7F8FB` light. Page shells use
  `bg-background`, never `bg-slate-50` or a hex.
- **Surface ramp** — `surface` → `surface-elevated`/`card` → `surface-soft` →
  `surface-glass` (for `backdrop-blur` panels). Elevation is expressed by ramp
  step + soft shadow, not by lighter borders.
- **Borders** — hairline `1px` `border-border` (optionally `/80` opacity). No
  `border-white/10` or slate borders in new code.
- **Ink ramp** — `text-foreground` for primary copy, `text-muted-foreground`
  for secondary. Never `text-slate-400` for real copy on light surfaces.
- **Semantic money colors** — up/income `#22C55E` (= primary), down/expense
  `#F43F5E`, warning `#FFB020`, destructive `--destructive`. Progress and
  threshold UI walks success → warning → destructive.
- **Info blue `#3B82F6`** (`--info`, `bg-info`/`text-info`) is *demoted to
  informational chips and categorical chart series only*. It must never appear
  on a CTA, button, gradient, brand mark, or focus ring.
- **Invest violet `#8B5CF6`** is reserved for investment/ROI chart series.
- **Charts** — all series colors come from `lib/chart-theme.ts` (`chartColors`,
  `chartPalette`, `paletteColor(i)`); tooltips use
  `components/ui/ChartTooltip`. `chartColors.income`/`pnl` equal `--primary`.

## Typography

Inter first (`var(--font-inter)`), falling back to SF Pro/system-ui — declared
once on `body` in `globals.css`. Numerals are `tabular-nums` globally; money
figures that need alignment use `.zx-num` (mono + tabular + tight tracking).
Page titles use `.page-title` (clamped ~1.55–2.35rem, `-0.015em` tracking,
semibold); supporting copy uses `.page-subtitle` (muted, 1.55 line-height).
Weights: semibold for headings/CTAs/values, medium for labels, regular for
body. No font-family overrides in components.

## Layout

Content lives in `.page-container`: `min(100% - gutter*2, 72rem)` centered,
with responsive vertical rhythm (`py-6→10`, `space-y-6→8`). Page roots use
`.page-shell` or `bg-background`. Gutter scales 1rem → 1.25rem (md) → 1.5rem
(lg). Long-form text caps at `--reading-width` (52rem). Mobile keeps a
`.pb-mobile-nav` reserve for the FAB/tab bar.

## Shapes

- Cards/panels: `rounded-card` (**1.35rem**, 1.05rem under 640px) via `.card`,
  `.zx-panel`, `.chart-shell`.
- Controls (inputs, buttons, selects): `rounded-control` (**0.95rem**) via
  `.btn` / `.input`.
- Chips/badges/pills: `rounded-full`.
- Shadows are soft and token-tinted (`--shadow-soft`/`--shadow-strong`), deeper
  in dark mode; glass panels add `backdrop-blur` (reduced radius on mobile for
  GPU cost).

## Components

- **Buttons** — `.btn` + `.btn-primary` (emerald fill, `primary-foreground`
  ink, `shadow-primary/30`), `.btn-secondary`, `.btn-ghost`, `.btn-danger`.
  One-off buttons compose `bg-primary hover:brightness-95
  text-primary-foreground rounded-control/xl`.
- **Inputs** — `.input`: card background, hairline border, `focus:ring-ring`.
  Min 16px font on mobile (iOS zoom guard), min 44px tap targets.
- **Cards** — `.card` (opaque) and `.zx-panel` (glass). KPIs use `.zx-kpi`.
- **Badges/chips** — `.badge-*`, `.story-chip`; live indicators `.zx-pill-live`.
  Informational blue chips use `bg-info/10 text-info`.
- **Progress** — `components/ui/ProgressBar` auto-colors success → warning
  (>50%) → destructive (>80%); `BudgetCard` thresholds use
  `rgb(var(--success|--warning|--destructive))`.
- **Charts** — Recharts only, styled through `lib/chart-theme.ts` (`axisProps`,
  `gridProps`, `areaGradientStops`, `animMs`) and `ChartTooltip`.
- **FAB** — `components/dashboard/FloatingAddButton`: solid `bg-primary`,
  `shadow-primary/30`.

## Do's and Don'ts

**Do**
- Use token utilities: `bg-background`, `bg-card`, `bg-surface-*`,
  `text-foreground`, `text-muted-foreground`, `border-border`, `bg-primary`.
- Use `focus:ring-ring` (the `--ring` token) for every focus state.
- Pull every chart color from `lib/chart-theme.ts` and render tooltips with
  `ChartTooltip`.
- Let the landing consume the same tokens under a `dark`-classed root.
- Walk success → warning → destructive for thresholds.

**Don't**
- No raw Tailwind palette classes (`bg-blue-500`, `text-slate-400`,
  `from-purple-500`…) in new code — use tokens.
- No hex literals in TSX. If a value is missing, add a token to
  `globals.css` + `tailwind.config.ts` first.
- No `dark:` color overrides outside `globals.css` in new code — tokens flip
  themes by themselves.
- No blue or purple CTAs, gradients, or brand marks — blue is info-chip only,
  violet is invest-series only.
- No per-component focus ring colors (`focus:ring-emerald-500`, `ring-blue-500`).
- No local chart palettes or one-off tooltip markups.

## Responsive

Mobile-first. Breakpoints: 640px (radius/paddings tighten, inputs ≥16px, `.btn`
≥44px tall), 768px (gutter 1.25rem, mobile-nav padding drops, blur radius
restored), 1024px (gutter 1.5rem, reading-width cap on subtitles). The FAB and
tab bar own the bottom safe-area (`env(safe-area-inset-bottom)`); scrollable
content pads with `.pb-mobile-nav`. Reduced-motion users get near-zero
animation durations globally; charts pass `animMs(reduce)`.
