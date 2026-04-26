# Brand Motion UI Plan

Issue: #4, Brand Motion UI polish for Hidur HaSTaM dashboard

Branch: `codex/brand-motion-ui-polish`

## 1. Current UI Audit

The app already has a useful design foundation: Tailwind v4 theme tokens, RTL layout, Hebrew-first typography, `framer-motion`, reusable `Card` primitives, and motion helpers in `lib/motion.ts`. The global tokens already point toward a Hidur HaSTaM direction with parchment, midnight navy, champagne gold, and display typography.

The dashboard is functional and data-rich, but the first viewport still reads like a standard operations dashboard. KPI cards use mostly white cards with border color changes, and the greeting area is plain text above the working surface. Motion exists, but it is local to cards and not yet composed into a clear premium dashboard entrance.

## 2. Visual Language Proposal

Use a restrained STaM/Judaica operating-room language rather than a marketing hero. The dashboard should feel like a quiet studio ledger: warm parchment surfaces, ink-black text, fine gold rules, deep navy framing, and small illuminated details. Texture should be subtle and CSS-based for now, with no external image or font dependency.

The visual thesis for this pass: a parchment-and-ink command surface with gold calibration marks, calm financial hierarchy, and gentle entrance motion that supports scanning.

## 3. Color/Token Proposal

Keep the current token direction and avoid a new palette. Treat these as the first-pass dashboard vocabulary:

- `--background`: warm parchment base.
- `--foreground`: ink/navy reading color.
- `--primary`: midnight navy for structural emphasis.
- `--accent` / `--gold`: restrained gold for highlights and separators.
- `--muted`: low-contrast parchment/platinum support surfaces.
- Semantic number colors: keep positive, negative, neutral behavior from the existing number utilities.

Future token work should consolidate repeated hard-coded chart colors into named chart or semantic tokens.

## 4. Component Targets

- Dashboard top banner: reusable brand banner shell with parchment texture, navy/gold framing, and a quiet status area.
- KPI cards: reusable dashboard KPI card component with consistent labels, tabular numbers, optional semantic tone, and subtle hover motion.
- Torah project summary: later pass can align progress treatment with the same brand language.
- CRM cards and badges: later pass can introduce contact role badges and cleaner empty states.

## 5. Dashboard First-Pass Plan

This branch will implement only a low-risk dashboard polish pass:

- Replace the plain greeting area with a reusable dashboard brand banner.
- Replace the top KPI card markup with a reusable KPI card component.
- Use existing `framer-motion` and motion tokens only.
- Keep all data fetching, calculations, auth checks, Supabase calls, and routing unchanged.
- Avoid external font files and avoid new dependencies.

## 6. Files Likely To Change

- `docs/BRAND_MOTION_UI_PLAN.md`
- `app/page.tsx`
- `app/DashboardClient.tsx`
- `components/dashboard/BrandDashboardBanner.tsx`
- `components/dashboard/BrandKpiCard.tsx`

## 7. Risks

- Build risk from client/server component boundaries, especially if motion components are imported into a server component.
- RTL and Hebrew text rendering can regress if layout spacing is changed too broadly.
- Over-polishing financial surfaces can reduce scan speed, so changes should keep numbers prominent and predictable.
- Existing Google font usage remains in the app; this pass does not add or change font loading.

## 8. Rollback Plan

The pass is additive and reversible. To roll back, remove the two new dashboard components and restore the previous markup in `app/page.tsx` and `app/DashboardClient.tsx`. No database, migration, auth, or business logic state is touched.
