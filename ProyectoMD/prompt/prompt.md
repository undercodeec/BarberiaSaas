# Summary

A warm, paper-toned feature comparison + pricing matrix for 'Tablr', a data-table component product. On desktop (>=1024px) it's a single CSS-grid matrix: a sticky-feeling pricing header row of three plan columns (Starter / Studio / Scale) over feature-group sections (Core grid, AI & automation, Team & governance, Support), where the recommended middle plan (Studio) is a full-height dark 'ink' column with rounded top/bottom corners and a terracotta 'Most popular' badge so the eye lands on it. Each feature row is a label cell plus a value cell per plan that renders either a numeric/text value (tabular-nums) or a check / dash glyph. Below 1024px the whole matrix reflows into three stacked per-plan cards led by the recommended Studio card, each card grouping the same features under labelled sub-headers in a definition-list. Sits inside a full landing page (sticky translucent nav, grain hero with a billing toggle, feature strip, footer) on Inter, in a cream + ink + terracotta + olive palette.

# Style

A warm, earthy editorial-SaaS aesthetic on a soft cream 'paper' canvas (#faf6f0) with near-black warm 'ink' text (#2b251d) and a two-accent system: a terracotta/clay family (#c4633f, deeper #a84f2e) as the primary action + highlight color and an olive/sage family (#6b7048, deep #565b39) as the secondary accent for 'included' checks and group labels. Surfaces are barely-there warm off-whites (card #fffdfa, warm band #f3ece1), borders are a soft sand hairline (#e6ddce / #efe8db), and the recommended plan inverts to a dark ink panel. Depth is gentle: a faint dotted paper grain, soft small shadows, and one lift shadow with a terracotta-tinted glow on the highlighted plan. Numbers use tabular-nums so prices and counts align. The whole thing feels hand-warm and document-like rather than cold/neon, all on a single Inter type system.

## Spec

Use a warm paper + ink + terracotta + olive design system. Page background is cream 'paper' #faf6f0; card surfaces are #fffdfa (paper.card) and a warmer band #f3ece1 (paper.warm). Text is warm near-black 'ink' #2b251d, with softer tones #5c5346 (ink.soft), #6e6557 (ink.faint), #8a8170 (ink.mute) for hierarchy. Primary accent is terracotta: #c4633f (terra) and #a84f2e (terra.deep) for buttons/badges/highlights, with #e8a888 (terra.soft) and a wash #f7e6dc for tints; an even darker #8f3f22 is the button hover. Secondary accent is olive/sage: #6b7048 (olive) and #565b39 (olive.deep) for 'included' check glyphs, group labels, and the savings pill, with #a9ad8c (olive.soft) and wash #e9ebdf. Hairline borders are sand: #e6ddce (line) and #efe8db (line.soft). The recommended plan column/card inverts to a dark ink #2b251d panel with cream text on it (use paper at /55 /70 opacities for secondary text, terra.soft #e8a888 for its check glyphs, paper/10 dividers). One typeface only: Inter (Google Fonts, weights 400/500/600/700/800/900). Numeric values use font-variant-numeric: tabular-nums. Add a subtle paper grain via a radial-gradient dot: radial-gradient(circle at 1px 1px, rgba(43,37,29,0.05) 1px, transparent 0) on a 22px tile. Shadows are soft and warm: a 'soft' shadow 0 1px 2px rgba(43,37,29,0.04), 0 8px 24px -12px rgba(43,37,29,0.12); a 'lift' shadow 0 2px 4px rgba(43,37,29,0.05), 0 24px 48px -20px rgba(168,79,46,0.28) used only on the highlighted plan; a 'nav' shadow 0 1px 0 rgba(43,37,29,0.06). Corners are rounded (lg ~8px on cells/buttons, 2xl ~16px on cards, full pills on badges/CTAs). Icons are Phosphor (ph:*) via Iconify; check/dash glyphs are inline 24x24 stroke-width-3 SVGs (check = M20 6 9 17l-5-5, dash = M6 12h12).

# Layout & Structure

A centered max-w-6xl (1152px) column with px-6 lg:px-8 gutters runs the whole page (nav, hero, matrix, feature strip, footer share it). The comparison section has a heading + billing toggle header row, then TWO renderings of the same data: a desktop-only (hidden lg:block) CSS grid matrix with 4 columns (label + 3 plans) where the middle plan is a continuous dark ink panel, and a mobile/tablet (lg:hidden) stack of three per-plan cards led by the recommended one. Feature rows are organized into four labelled groups (Core grid, AI & automation, Team & governance, Support) separated by hairline rules.

## Section header + billing toggle

Above the matrix, a `flex flex-col gap-6 md:flex-row md:items-end md:justify-between mb-8` header: on the left a max-w-md block with a terracotta uppercase eyebrow (`text-[12.5px] font-bold uppercase tracking-[0.18em] text-terra-deep` reading 'Pricing'), an `text-[30px] sm:text-[34px] font-extrabold tracking-tight` H2 ('Every column compared.'), and a `text-[15px] text-ink-soft` subhead. On the right, a self-start Monthly/Yearly billing toggle: a pill `inline-flex items-center gap-3 rounded-full border border-line bg-paper-card px-4 py-2.5 shadow-soft` holding a 'Monthly' label, a custom checkbox switch (a 44x24 rounded track that turns terracotta #c4633f when checked with a 20x20 knob that translateX(20px) on a cubic-bezier(.34,1.56,.64,1) spring), a 'Yearly' label, and an olive savings pill ('-20%' in `bg-olive-wash text-olive-deep`).

## Desktop matrix grid (>=1024px)

A `hidden lg:block` wrapper with an inner `min-w-[760px]` holding a `grid grid-cols-[minmax(180px,1.4fr)_repeat(3,minmax(150px,1fr))]`. Column 0 is the feature-label column; columns 1-3 are Starter / Studio / Scale. Render every cell as a direct grid child (no nested table) so the dark Studio column can be a continuous vertical panel. Group separators and group-label rows span the full width using `col-span-4` (a hairline rule) followed by four `col-span-1` cells (the label cell + three spacers, where the Studio spacer carries `bg-ink` to continue the dark column).

## Plan header row (3 pricing cards)

The first grid row is the pricing header. Column 0 is a brand cell (a 36x36 ink tile with a ph:table-fill icon + a two-line caption). Each plan cell shows the plan name (`text-[14px] font-bold`), a price lockup with a baseline-aligned '$' + a big tabular-nums number (`text-[34px] font-extrabold`) + a '/mo' suffix, a one-line description, and a full-width CTA. The Studio (recommended) cell is a dark ink panel `rounded-t-2xl bg-ink text-paper shadow-lift pt-9` carrying an absolutely-positioned terracotta 'Most popular' badge (`bg-terra-deep text-paper` pill with a star SVG) and a filled terracotta CTA; Starter/Scale use bordered `bg-paper-card` ghost CTAs.

## Feature group + rows

Each group starts with a full-width hairline (`col-span-4 border-t border-line` for the first, `border-line-soft` after) then a group-label row: the label cell holds a tiny uppercase group title (`text-[12px] font-bold uppercase tracking-[0.16em]`, alternating terra-deep / olive-deep), and the three value spacers keep the Studio column dark (`bg-ink`). Each feature row is four cells: a label cell (`.row-lbl`) and three value cells (`.row-val` for Starter/Scale, `.row-val-hl` with a dark ink background for Studio). A value cell renders either a tabular-nums text value (e.g. '100k', 'Unlimited', '25 / mo') or a glyph: an olive check (`.ico-chk` #6b7048) / terra-soft check on dark (`.ico-chk-hl` #e8a888), or a muted dash (`.ico-dash` #a89a78) / paper-50 dash on dark (`.ico-dash-hl`).

## Footer CTA row

Close the grid with a full-width `col-span-4 border-t border-line` then a final row of four cells: an empty label cell, then a 'Choose Starter' ghost button, the 'Choose Studio' filled terracotta button inside the dark column's `rounded-b-2xl bg-ink shadow-lift` closing panel, and a 'Choose Scale' ghost button, so the dark Studio column is capped top and bottom into one continuous rounded panel. Under the whole section, a centered `text-[13px] text-ink-faint` reassurance line ('All plans include a 14-day trial. Cancel any time...').

## Mobile/tablet reflow (<1024px)

A `lg:hidden space-y-5` stack replaces the grid below lg with three per-plan cards LED BY the recommended Studio card. The Studio card is a `rounded-2xl bg-ink text-paper shadow-lift` panel with a 'Most popular' badge top-right, a large price lockup, a filled terracotta 'Choose Studio' CTA, then the four feature groups each rendered as a labelled sub-header + a `<dl class="divide-y divide-paper/10">` definition list of `flex items-center justify-between py-2.5` rows (dt = feature label in paper/70, dd = value or check/dash glyph). Starter and Scale follow as `rounded-2xl border border-line bg-paper-card shadow-soft` light cards with the same group/dl structure (divide-y divide-line-soft, ink text). This is the key responsive move: the dense matrix becomes legible self-contained cards on small screens, recommended-first.

# Special Components

## Component

Make the middle (recommended) plan a continuous full-height dark ink #2b251d panel that runs from the pricing header through every feature group to the footer CTA, with rounded-t-2xl on the header cell and rounded-b-2xl on the footer cell and a warm terracotta-tinted lift shadow, so it reads as one elevated card embedded in the matrix. Keep it dark across all rows by giving the group-separator spacers and value cells in that column a bg-ink, and recolor its content for the dark surface (cream text, terra-soft #e8a888 checks, paper/10 dividers).

## Component

On the recommended plan, an absolutely-positioned pill badge `bg-terra-deep #a84f2e text-paper` (`text-[10.5px] font-bold uppercase tracking-[0.08em]`) reading 'Most popular' with a small inline star SVG, pinned top-left on desktop (top-3 left-5) and top-right on the mobile card (top-4 right-4).

## Component

A custom CSS toggle inside a bordered pill: a hidden checkbox drives a 44x24 (h-6 w-11) rounded track that transitions from sand #e6ddce to terracotta #c4633f when checked, with a 20x20 knob (bg paper.card, soft shadow) that translateX(20px) on a springy cubic-bezier(.34,1.56,.64,1) transition. Flank it with 'Monthly' / 'Yearly' labels (the active side in solid ink) and an olive '-20%' savings pill.

## Component

Render boolean feature availability as inline 24x24 stroke-width-3 round-cap SVGs, NOT emoji or font icons: included = a check (path 'M20 6 9 17l-5-5') colored olive #6b7048 on light cells and terra-soft #e8a888 on the dark Studio cells; not-included = a short dash (path 'M6 12h12') colored muted sand #a89a78 on light and paper-at-50% on dark. Numeric/text values (10k, 60, Unlimited, '25 / mo') use font-semibold with tabular-nums instead of a glyph.

## Component

The hero above the matrix uses the paper grain plus two large blurred radial blobs (a terra-wash #f7e6dc blob top-left, an olive-wash #e9ebdf blob top-right, both blur-3xl opacity-60) and a thin terracotta top hairline gradient, with a status-pill eyebrow ('The data table component for AI product teams', pulsing olive dot), an `text-[40px] sm:text-[56px] font-extrabold` H1 with the word 'earn' set in terracotta italic, and two CTAs (a filled terra-deep 'Compare plans' + a ghost 'Watch demo').

# Special Notes

Single typeface: Inter from Google Fonts (weights 400/500/600/700/800/900), set as the sans family; numeric values use font-variant-numeric: tabular-nums (the .tnum class). Icons are Phosphor via Iconify (ph:table-fill, ph:arrow-right-bold, ph:arrow-down-bold, ph:play-circle, ph:lightning-fill, ph:magic-wand-fill, ph:wheelchair-fill, ph:github-logo-fill); the check/dash availability marks and the 'Most popular' star are hand-inlined SVGs, not icon-font glyphs. Exact palette tokens: paper #faf6f0 (page), paper.card #fffdfa, paper.warm #f3ece1; ink #2b251d (text + dark panel), ink.soft #5c5346, ink.faint #6e6557, ink.mute #8a8170; terra #c4633f, terra.deep #a84f2e, terra.soft #e8a888, terra.wash #f7e6dc, plus #8f3f22 as the button-hover terracotta; olive #6b7048, olive.deep #565b39, olive.soft #a9ad8c, olive.wash #e9ebdf; line #e6ddce, line.soft #efe8db; helper glyph colors ico-dash #a89a78 (light) and rgba(250,246,240,0.5) (dark). The two named fixes vs a generic comparison table: (1) a real mobile reflow -- below lg the dense 4-column matrix becomes three stacked, self-contained per-plan definition-list cards led by the recommended plan, so nothing is squished or horizontally scrolled on phones; (2) contrast fixes -- 'included' checks are olive (not low-contrast gray), missing features use a clearly muted dash, the dark Studio column recolors its content to cream / terra-soft / paper-opacity tokens that clear contrast on #2b251d, and group labels + the eyebrow carry hierarchy via weight + uppercase tracking rather than faint color. Everything shares one centered max-w-6xl (1152px) container at px-6 lg:px-8, rendered cleanly with no overflow at 1280/768/390.