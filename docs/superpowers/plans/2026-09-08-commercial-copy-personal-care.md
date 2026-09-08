# Commercial Copy for Personal-Care Businesses Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Market Nava's public home page to all supported personal-care business categories without changing page behavior or design.

**Architecture:** The public home page is a single client component. Update only its static Spanish strings so all sections share the same inclusive positioning; no components, routes, styles, or data contracts change.

**Tech Stack:** Next.js, React, TypeScript.

**Spec:** `docs/superpowers/specs/2026-09-08-commercial-copy-personal-care-design.md`

## Global Constraints

- Modify text only in `apps/web/app/page.tsx`.
- Use `negocios de cuidado personal` as the umbrella term.
- Keep current modules, links, images, prices, layout, and interactions unchanged.
- Explicitly name barberías, salones de belleza, estudios de uñas, spa y bienestar, centros de estética y otros negocios de cuidado personal in the hero.

---

### Task 1: Align public home-page copy

**Files:**
- Modify: `apps/web/app/page.tsx:79,540-546,570-575,609-617`

**Interfaces:**
- Consumes: the existing static `plans` data and home-page JSX.
- Produces: inclusive Spanish marketing copy rendered by the existing `/` route.

- [ ] **Step 1: Inspect the existing barber-only strings**

Run: `rg -n -i 'barbería|barberías|barberias' apps/web/app/page.tsx`

Expected: the plan summary, hero, statement, and module headings reveal the
barber-only language to replace.

- [ ] **Step 2: Replace only static copy**

Update the four locations to use `tu negocio`, identify Nava as software for
personal-care businesses, list the six supported categories in the hero, and
change `Barbería completa` to `Operación para tu local`.

- [ ] **Step 3: Inspect the final copy and diff**

Run: `rg -n -i -C 2 'barbería|barberías|barberias|cuidado personal' apps/web/app/page.tsx; git diff --check; git diff -- apps/web/app/page.tsx`

Expected: all remaining barber references are part of the inclusive category
list; `git diff --check` has no output; the diff contains text-only changes.

- [ ] **Step 4: Typecheck and create a production build**

Run: `pnpm --filter @barber-saas/web typecheck; $env:NEXT_PUBLIC_API_URL='https://api.navacloud.app'; pnpm --filter @barber-saas/web build`

Expected: both commands exit with code 0.

- [ ] **Step 5: Commit the text update**

Run: `git add -f docs/superpowers/specs/2026-09-08-commercial-copy-personal-care-design.md docs/superpowers/plans/2026-09-08-commercial-copy-personal-care.md; git add apps/web/app/page.tsx; git commit -m "chore(web): broaden commercial messaging"`

Expected: one commit contains the copy update plus its implementation record.

## Self-Review

1. **Spec coverage:** Task 1 changes every known barber-only string, preserves non-copy content, and verifies the web app compiles and builds.
2. **Placeholder scan:** No placeholders, TODO markers, or undefined interfaces are present.
3. **Type consistency:** This plan changes no type, property, API, or component interface.
