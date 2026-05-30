# StudyNerve — Design Language

The single source of truth. Every page is built against this. If a page deviates, **the page is wrong, not the spec.** Read this before touching any page.

---

## 0. Principles
- **Flat, dark, focused.** Content is the UI. Decoration earns its place or it's gone.
- **Real data only.** No fake trends, placeholders, or zeros-as-failure. Missing data shows a real empty state.
- **One way to do each thing.** Same header, same card, same spacing, same buttons on every page.
- **Alive, not noisy.** Permitted life: hover lifts, the hero gradient border, progress glows, the graph canvas. Banned: animated/washed decorative backgrounds.

---

## 1. Color — use tokens, never hardcode
```
deep.bg        #09090b      deep.surface   #111113      deep.elevated  #18181b
ink.primary    #e4e4e7      ink.secondary  #a1a1aa      ink.muted      #71717a    ink.faint #52525b
accent         #6366f1      accent.hover   #818cf8      accent.muted   rgba(99,102,241,0.15)
border.subtle  rgba(255,255,255,0.06)        border.hover  rgba(255,255,255,0.10)
success        #22c55e      danger         #ef4444      warning        #f59e0b
```
- Semantic colors (success/danger/warning) are for **status only**, never decoration.
- `danger` is **never** used for a neutral value (no red 0%).
- No raw `zinc-*`, `indigo-*`, `text-white/NN`, or hex literals in components. If it's a color, it's a token.

## 2. Typography
Font: Plus Jakarta Sans (UI), IBM Plex Mono (code/optional numerals).
```
Page title       text-2xl font-bold        ink.primary
Page subtitle    text-sm                   ink.muted
Section header   text-xs font-semibold uppercase tracking-wider   ink.muted
Card title       text-sm font-medium       ink.primary
Body             text-sm                   ink.secondary
Metadata         text-xs                   ink.muted
Big stat number  text-3xl font-bold        ink.primary  (accent only for the single highlighted metric)
```

## 3. Spacing — 8px base
```
Page frame              max-w-6xl · mx-auto · px-6 · py-8
Between sections        space-y-8
Section header → body   mt-4
Card padding            p-6 (standard) / p-5 (compact)
Grid / flex gaps        gap-4
```
No arbitrary values (`p-[13px]`, `mt-[7px]`). Stay on the scale.

## 4. Page skeleton — every page, no exceptions
```
[ Page header ]   title + subtitle
[ Section ]       section-header + content
[ Section ]       ...
```
Same max-width, same padding, same vertical rhythm. No page invents its own frame.

## 5. Background
Faint static brand-mesh behind opaque content; never a glow or wash. The mesh is the same synapse motif as the logo — small accent dots with thin connecting hairlines, ~5–8% opacity, fixed behind the page. Cards and sections stay fully opaque so text contrast is untouched. The **only** alive surface is the graph canvas (AI Brain). No radial washes, no particle fields, no animated gradients behind content. The hero card's animated border and stat-card hover are the largest permitted accents — nothing full-bleed.

## 6. Components
- **Card** — `bg-deep-surface`, `border border-border-subtle`, `rounded-xl`, flat (no glassmorphism / backdrop-blur). Interactive cards add `hover:border-border-hover`.
- **Stat card** — section-header label + big number + optional sublabel + thin accent bottom bar. Identical on every page that shows stats.
- **Hero card** — animated gradient border. One per page max, for the primary action.
- **Buttons** — `primary` (bg-accent, white text, hover accent-hover) · `secondary` (border border-border-subtle, ink-secondary, hover border-hover + ink-primary) · `pill` (rounded-full secondary). One primary action per view.
- Every interactive element has a visible **hover and focus** state. Tap targets ≥ 40px on mobile.
- Canonical radius: `rounded-xl` for cards/containers, `rounded-full` for pills. Don't mix 8/12/16 ad hoc.

## 7. States — mandatory for every data-driven view
- **Loading** — skeleton (lists/cards) or centered spinner. Never a blank flash.
- **Empty** — icon + one-line explanation + a single CTA toward the next step. **Never a wall of zeros.**
- **Undefined metric** — show `—`, not `0%`. Accuracy with 0 attempts is `—` / "No quizzes yet."
- **Error** — short message + retry.
- A brand-new user sees **one clear next step**, not four empty modules.

## 8. Motion
Allowed: hover lift/border, hero gradient border, progress-glow, graph auto-orbit (pauses on interaction), node entrance. Banned: decorative animated backgrounds, full-bleed glows, anything that moves while the user is reading.

## 9. Brand
- **Logo** — the locked synapse mark (two nodes + connection). Tile (rounded square, `deep.elevated` bg) for app icon / favicon ≥16px; bare mark for nav. One-color capable. **The logo is fixed — never restyled or recolored per page.**
- **Nav** — mark + "StudyNerve" wordmark · Dashboard · Notes · Quiz · Tutor · Flashcards · More · ⌘K · settings · account. Active item = accent text + pill.

## 10. Pages
- **Graph pages consolidate to ONE: AI Brain** — the differentiator (the AI's model of you). The knowledge-constellation ("My Universe") folds in as a mode/toggle or is cut. No second standalone force-graph page.
- Every other page conforms to §4 skeleton, §6 components, §7 states.
