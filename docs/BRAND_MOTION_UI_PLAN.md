# BRAND / MOTION UI PLAN (Issue #4)

## Goal
Start a safe, additive first pass of premium Hidur HaSTaM visual polish focused on dashboard presentation only, with no data/model/business/auth changes.

## Current UI Audit
- Dashboard already uses clean cards and charts but visual hierarchy is mostly generic SaaS (white cards + sky accents).
- Hero welcome area is text-only and does not communicate brand mood (Hidur / klaf / heritage).
- KPI cards are readable but mixed styling conventions reduce perceived cohesion.
- Motion exists (Framer Motion) and is generally light; can be tightened into more refined micro-interactions.
- Color tokens in `app/globals.css` already include premium-ready navy/gold/warm tones, so first pass can reuse existing tokens with no token-system rewrite.

## Visual Language Proposal
- Premium STaM tone: parchment warmth + ink-dark text + restrained gilded details.
- Keep clean UI structure; add depth via subtle gradients, borders, soft glow, and micro texture-like layering (CSS gradients only).
- Emphasize Hebrew-first elegance with stronger heading rhythm and better top-of-page framing.
- Avoid decorative overload; prioritize trust/seriousness over flashy effects.

## Color / Token Proposal (First Pass)
- Base surfaces: warm neutral (`background`, `card`) with delicate navy shadow.
- Brand accents: `primary` (deep navy) for structure + `accent/gold` for highlights.
- KPI emphasis:
  - Neutral/structural values: navy-slate tones
  - Positive/profitive values: restrained gold or emerald, not neon
  - Negative values: existing destructive red
- Keep using existing CSS variables/tokens; no global token remap in this pass.

## Typography Direction
- Keep existing Hebrew-safe font setup (no external font additions).
- Increase visual contrast:
  - Display-like top banner heading
  - Compact contextual subtitles
  - Tabular numbers in KPI values for premium financial readability
- Preserve RTL-first readability and avoid large text blocks.

## Component Targets
- New reusable brand surface component for dashboard banner and KPI cards.
- Dashboard hero/top banner polish.
- KPI cards (primary + secondary + monthly net card) style unification.
- Keep charts/data structures untouched in first pass.

## Dashboard First-Pass Plan
1. Add `BrandBannerCard` reusable UI primitive with variants (`banner`, `kpi`) and optional glow.
2. Wrap dashboard top greeting area in premium banner treatment.
3. Replace direct KPI card wrappers with `BrandBannerCard` while preserving existing labels/values and all data bindings.
4. Keep motion subtle:
   - Existing Framer Motion fade/slide
   - Gentle hover elevation only on relevant cards
5. Verify all existing dashboard flows still render with no logic changes.

## Exact Files Likely to Change
- `docs/BRAND_MOTION_UI_PLAN.md` (new)
- `components/dashboard/BrandBannerCard.tsx` (new reusable component)
- `app/page.tsx` (top banner first-pass polish + reuse component)
- `app/DashboardClient.tsx` (KPI card styling + reuse component)

Potential future phases (not in this pass):
- `app/torah/page.tsx`
- `app/crm/page.tsx`
- shared badge/ui primitives under `components/ui/*`

## Risks
- Over-styling may reduce information density/readability on finance-heavy dashboard cards.
- Motion can feel noisy if applied too broadly.
- Existing in-progress local CSS changes may overlap visually with dashboard updates.

## Rollback Plan
- All changes are component-level and additive:
  - Remove `components/dashboard/BrandBannerCard.tsx`
  - Revert `app/page.tsx` and `app/DashboardClient.tsx` to previous card wrappers
- No database, migrations, data writes, auth flow, or business logic touched.
- Revert can be completed with a single commit rollback/cherry-pick without schema impact.
