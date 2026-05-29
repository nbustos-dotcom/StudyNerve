# StudyNerve Frontend Audit
**Date:** 2026-05-28  
**Scope:** `frontend/src` — all pages, components, CSS, token definitions  
**Method:** Full source read + targeted grep scans  
**Status:** READ-ONLY — no changes made

---

## Section A: App Map

### Routes
| Route | File | What it is |
|---|---|---|
| `/login` | `pages/Login.jsx` | Auth page — sign in / create account, single card centered |
| `/` | `pages/Dashboard.jsx` | Home — greeting, stats, weak areas, activity feed, deadlines |
| `/notes` | `pages/Notes.jsx` | Note CRUD — paste text or upload file, extract topics, summarize |
| `/notes/:id/study-guide` | `pages/StudyGuide.jsx` | AI-generated study guide with ToC sidebar, editable |
| `/quiz` | `pages/Quiz.jsx` | Quiz — configure, generate, active session, summary, review |
| `/chat` | `pages/Chat.jsx` | AI tutor — chat interface with session history sidebar |
| `/flashcards` | `pages/Flashcards.jsx` | Flashcard decks — browse, generate, study with flip card |
| `/canvas` | `pages/Canvas.jsx` | Canvas LMS integration — upcoming assignments, courses |
| `/vision` | `pages/VisionBoard.jsx` | Vision boards — AI-breakdown of tasks into step lists |
| `/universe` | `pages/StudyUniverse.jsx` | 3D force graph of AI insights + topic mastery |
| `/settings` | `pages/Settings.jsx` | LLM provider config, Canvas LMS, clear memory, delete account |
| `/terms` | `pages/Terms.jsx` | Static terms of service |
| `/privacy` | `pages/Privacy.jsx` | Static privacy policy |

### Shared Components
| File | What it is |
|---|---|
| `components/Layout.jsx` | Top nav bar (desktop + mobile drawer), route outlet |
| `components/Logo.jsx` | SVG logo mark |
| `components/Toast.jsx` | Toast notification system with context provider |
| `components/Spinner.jsx` | Loading spinner, size prop: `sm` / `md` / `lg` |
| `components/SkeletonCard.jsx` | Shimmer skeleton for notes list loading state |
| `components/MarkdownRenderer.jsx` | Shared markdown renderer — KaTeX, syntax highlighting |
| `components/NeuralNetIcon.jsx` | Animated neural net SVG for AI branding |
| `components/CommandPalette.jsx` | Ctrl+K command palette |
| `components/OnboardingWizard.jsx` | First-run wizard overlay |
| `components/Confetti.jsx` | Confetti burst for quiz celebrations |
| `components/Sparkline.jsx` | Mini SVG sparkline chart |

---

## Section B: Token Source-of-Truth + Drift

### Tailwind config (`tailwind.config.js`) — the intended spec
```
accent.DEFAULT  #6366f1   accent.hover  #818cf8   accent.muted  rgba(99,102,241,0.15)
deep.bg #09090b  deep.surface #111113  deep.elevated #18181b
ink.primary #e4e4e7  ink.secondary #a1a1aa  ink.muted #71717a  ink.faint #52525b
border.subtle rgba(255,255,255,0.06)  border.hover rgba(255,255,255,0.1)
success #22c55e  danger #ef4444  warning #f59e0b
fonts: Plus Jakarta Sans (sans) / IBM Plex Mono (mono)
```

### CSS custom properties (`index.css`) — actual runtime values

**⚠️ FOUR tokens have drifted from the Tailwind definition:**

| Token | Tailwind (Tailwind classes) | CSS variable (used by CSS components) | Delta |
|---|---|---|---|
| `--accent` | `#6366f1` (indigo) | `#7c3aed` (violet) | **Different hue entirely** |
| `--accent-hover` | `#818cf8` | `#8b5cf6` | Different shade |
| `--accent-muted` | `rgba(99,102,241,0.15)` | `rgba(124,58,237,0.15)` | Matches `--accent` violet |
| `--deep-surface` | `#111113` | `#111114` | Off by 1 hex digit |

**Effect:** Every CSS-defined utility class that uses `var(--accent)` renders **violet**, while `bg-accent` / `text-accent` (Tailwind) renders **indigo**. These are simultaneously active in the UI:
- Violet path: `.btn-glow`, `.progress-glow`, `.nav-active-glow`, `.dashboard-spotlight`, `.hero-card::before`, `.pill-tab.active` — all CSS-only classes
- Indigo path: `bg-accent`, `text-accent`, `border-accent/*`, `bg-accent-muted` — Tailwind utilities

Additionally, `StudyUniverse.jsx` hardcodes `'#7c3aed'` for the core node color and `'#8b5cf6'` for its halo, intentionally using the violet accent. This creates a third accent variant in the 3D canvas context.

### Other drift
- `body` background is `radial-gradient(ellipse at 50% 0%, #0f0f18 0%, #09090b 70%)` — the inner `#0f0f18` is not a defined token (undocumented tint)
- `select option` background hardcodes `#18181b`, `#27272a` — outside token system
- `.kbd` uses `ui-monospace` fallback stack, not `IBM Plex Mono` first
- `.card` defines `border-radius: 8px` / `.card-solid` defines `border-radius: 8px` but numerous components use `rounded-xl` (12px) or `rounded-2xl` (16px) for "card-like" containers — no single canonical radius

---

## Section C: Findings Table

| file:line | category | current value | expected | severity |
|---|---|---|---|---|
| `index.css:2` | Token drift | `--accent: #7c3aed` | `#6366f1` | **HIGH** |
| `index.css:3` | Token drift | `--accent-hover: #8b5cf6` | `#818cf8` | **HIGH** |
| `index.css:4` | Token drift | `--accent-muted: rgba(124,58,237,0.15)` | `rgba(99,102,241,0.15)` | **HIGH** |
| `index.css:7` | Token drift | `--deep-surface: #111114` | `#111113` | MED |
| `api/client.js:16-17` | console.log in production | `console.log('[reqMultipart]…')` | Remove | **HIGH** |
| `pages/StudyUniverse.jsx:166` | console.log in production | `console.log('Universe insights:', …)` | Remove | MED |
| `pages/Chat.jsx:794` | Raw Tailwind color | `hover:bg-indigo-400` | `hover:bg-accent-hover` | **HIGH** |
| `pages/Chat.jsx:699` | Raw Tailwind color | `text-indigo-200` | `text-accent-hover` or `text-white/80` | MED |
| `pages/StudyGuide.jsx:78-191` | Inline-style island | All heading/body/list/table/code styles via `style={{}}` | Token classes | **HIGH** |
| `pages/StudyGuide.jsx:93-110` | Hardcoded colors | `color: '#f1f5f9'`, `color: 'rgba(255,255,255,0.82)'`, `color: '#818cf8'` etc. | ink tokens | **HIGH** |
| `pages/StudyGuide.jsx:403-478` | Off-token layout | `padding: '32px'`, `border-radius: '...'`, raw `rgba(255,255,255,0.03)` container | `.card p-8` + token | MED |
| `App.jsx:115-135` | Inline-style island | ShortcutHelp modal fully inline-styled (`#18181b`, `rgba(255,255,255,0.07)`, `#e4e4e7`, `#71717a`, `rgba(99,102,241,0.12)`) | Token classes | MED |
| `pages/Dashboard.jsx:338` | Violet leak | `rgba(124,58,237,0.4)` in gradient | Should use accent token or be `rgba(99,102,241,0.4)` | MED |
| `pages/Dashboard.jsx:47-53` | Raw zinc classes | `text-zinc-100` used as text color | `text-ink-primary` (zinc-100 = #f4f4f5 ≠ ink-primary #e4e4e7) | MED |
| `pages/Dashboard.jsx` (many) | Raw zinc classes | `text-zinc-100`, `text-zinc-400`, `text-zinc-500`, `text-zinc-600`, `bg-zinc-800` throughout | `text-ink-primary/secondary/muted/faint`, `bg-deep-elevated` | MED |
| `pages/VisionBoard.jsx:84,119,123,127` | Raw opacity | `text-white/45`, `text-white/35`, `text-white/25`, `text-white/20`, `text-white/15` | `text-ink-secondary/muted/faint` | MED |
| `pages/VisionBoard.jsx:182` | Raw opacity | `text-white/50` for subtitle | `text-ink-muted` | LOW |
| `pages/Chat.jsx:590-596` | Duplicate keyframe | `<style>` injected in JSX defining `@keyframes bounce` | Already in index.css — remove JSX injection | MED |
| `pages/Canvas.jsx:598` | Off-scale spacing | `mt-[7px]` | `mt-1.5` (6px) or `mt-2` (8px) | LOW |
| `pages/Flashcards.jsx:20,105,112,213,217,304,335,340,341,363,433,638` | Dev comments | `// FIX 1:`, `// FIX 2:`, … `// FIX 6:` | Remove — these are stale task notes | LOW |
| `pages/Layout.jsx:65` | Hardcoded color | `background: '#09090b'` inline | `className="bg-deep-bg"` | MED |
| `pages/Layout.jsx:108,197` | Hardcoded color | `background: '#18181b'` inline dropdown | `bg-deep-elevated` | LOW |
| `pages/Layout.jsx:253` | Hardcoded color | `background: '#111113'` inline | `bg-deep-surface` | LOW |
| `pages/Settings.jsx:441-443` | JS hover color | `onMouseEnter/Leave` to swap `style.color` | CSS hover class | LOW |
| `pages/Notes.jsx:317` | Typography | `text-xl font-bold` h1 | `text-2xl font-bold` | LOW |
| `pages/Quiz.jsx:985` | Typography | `text-xl font-bold` h1 | `text-2xl font-bold` | LOW |
| `pages/Flashcards.jsx:647` | Typography | `text-xl font-semibold` h1 | `text-2xl font-bold` | LOW |
| `pages/Settings.jsx:291` | Typography | `text-xl font-bold` h1 | `text-2xl font-bold` | LOW |
| `pages/StudyGuide.jsx:381` | Typography | `text-xl font-semibold` h1 | `text-2xl font-bold` | LOW |
| `pages/VisionBoard.jsx:180` | Typography | `text-xl font-semibold` h1 | `text-2xl font-bold` | LOW |
| `pages/MarkdownRenderer.jsx:1-12` | Comment block | 12-line multi-paragraph docstring | Remove or reduce to 1 line | LOW |
| `pages/Quiz.jsx:666` | Hardcoded color | `rgba(52,211,153,0.6)` and `rgba(248,113,113,0.6)` inline border | `border-success/60` and `border-danger/60` | LOW |
| `pages/Chat.jsx:196,253` | Mobile sidebar width | `style={{ width: 256 }}` hardcoded | `w-64` class | LOW |
| `pages/StudyGuide.jsx:206-230` | Inline styles | TableOfContents rendered entirely via `style={{}}` | Token classes | MED |
| `pages/Dashboard.jsx:297-302` | Hardcoded color | `rgba(248,113,113,0.7)`, `rgba(251,191,36,0.6)` inline `borderLeft` | `border-danger`, `border-warning` | LOW |

---

## Section D: Per-Page Honest Verdicts

### Login
Reads as intentionally designed. Centered card, proper use of `.card`/`.btn-primary`/`.input`, clean toggle between sign-in/register. Labels use `text-xs font-medium text-ink-secondary` — slightly off from spec `label` class (which is `text-[11px] uppercase tracking-widest text-ink-faint`) but consistent within itself. **Worst thing:** no loading skeleton between submit and response; the button just disables. Minor but noticeable on slow connections.

### Dashboard
The most complete and polished page. Hero card, quick actions, streak grid, stat cards, weak areas, activity feed, deadlines all cohere. **However:** it uses raw `text-zinc-*` classes pervasively instead of `text-ink-*` tokens. `zinc-100` (#f4f4f5) is visually lighter than `ink-primary` (#e4e4e7) — you'd see the mismatch next to any component using the correct token. The `rgba(124,58,237,0.4)` violet leaks in the stat card gradient. The animated glow progress bar is a design detail, not a problem. **Worst thing:** zinc vs ink token confusion — looks fine in isolation, creates color inconsistency at the boundaries with correctly-tokenized components.

### Notes
Well-structured, all three states (loading, empty, populated) covered. Filter bar with archive toggles is complex but controlled. The note card design is clean. **Worst thing:** the `h1` uses `text-xl` instead of `text-2xl` — visually the page header feels undersized compared to Dashboard. The AI merge suggestion banners use hardcoded `rgba(99,102,241,0.06)` inline instead of `bg-accent-muted` but these are functionally identical, just not using the abstraction.

### Quiz
The most feature-complete page — 5 phases, keyboard shortcuts, resume flow, flag system, adaptive mode. All states are handled. The configure/history tabs with per-topic accuracy table are well done. **Worst thing:** the summary view's question result cards use `style={{ borderLeft: '3px solid ...' }}` with raw rgba hex. Three different colors for correct/incorrect/flagged are defined inline at each callsite rather than being a shared utility. Also: `text-emerald-400` for correct, `text-red-400` for incorrect are raw Tailwind instead of `text-success`/`text-danger` tokens.

### Chat
The most intentionally designed page — the sidebar/main split, message bubbles, mode toggle, file attachment, study nudge all feel considered. **Worst thing:** `hover:bg-indigo-400` on the send button — this is a raw off-token class that causes the send button's hover to use indigo-400 (#818cf8, which actually equals accent-hover) but via the wrong abstraction. More visible: the active mode toggle button uses `text-indigo-200` instead of an ink token, creating a hardcoded color dependency. The `<style>` injection for bounce keyframes is the worst-smell code in the file — a CSS keyframe silently re-defined in JSX.

### Flashcards
Clean 3-view architecture (decks / generate / study). Flip card with 3D CSS transform is the UI highlight of the page — well-executed. All states handled. **Worst thing:** the `// FIX 1:` through `// FIX 6:` inline comments are living bug-fix documentation that belongs in git history, not source code. They signal the file was iteratively patched and not cleaned up after. Also: the "Back to Decks" / "Start New" buttons in StudyView use a custom one-off button style (`rounded-xl text-sm border border-border-subtle text-ink-muted`) instead of `btn-secondary`.

### StudyGuide
This page is an **inline-style island** — the `makeComponents()` factory returns JSX with every color, spacing, and typography value hardcoded as `style={{}}` objects. `color: '#f1f5f9'`, `color: 'rgba(255,255,255,0.82)'`, `color: '#818cf8'`, padding in pixels, margin in pixels — none of it uses Tailwind or the token system. It is completely decoupled from the design system. The ToC sidebar is the same. If you change a token, this page doesn't follow. **Worst thing:** The entire markdown component map is a token-free zone. There's a duplicate of this pattern in `MarkdownRenderer.jsx` (which at least uses some token classes) — two similar but divergent markdown component maps exist.

### Canvas
Only partially read (Canvas.jsx is large). What was visible: correct use of ink tokens, proper urgency coloring. `mt-[7px]` is the only off-scale spacing found anywhere in the codebase. Canvas has loading/empty/error states visible in the data structures.

### VisionBoard
The task management UI is well-designed — the drag-to-reorder, inline checkbox, sub-steps, and progress bar all cohere. **Worst thing:** pervasive use of `text-white/45`, `text-white/35`, `text-white/25` instead of ink tokens. These fractional-opacity utilities are not defined in the token system — if the background color changes, the perceived text color changes unpredictably because it's composited. The text/subtitle/placeholder colors are also inconsistent with the rest of the app's `text-ink-*` pattern.

### StudyUniverse
A 3D force-graph page using react-force-graph-3d/THREE.js. The page-level shell has a `console.log` left in. Colors for graph nodes are hardcoded (`'#8b5cf6'`, `'#34d399'`, `'#f87171'`, `'#60a5fa'`) — these are Three.js materials, not CSS, so token classes can't apply directly. But `#8b5cf6` is violet (matches CSS `--accent-hover`) while the spec wants `#818cf8`. The 3D canvas is effectively outside the design system by necessity. Loading/empty states need verification.

### Settings
Clean sectioned layout using the `SectionCard` wrapper component consistently. Provider grid, Canvas form, danger zone all well-handled with confirm modals. **Worst thing:** The Disconnect button uses `onMouseEnter`/`onMouseLeave` to swap `style.color` via direct DOM mutation — this is the only case in the codebase of JS-driven hover that should just be a CSS hover class. Also: the `EyeIcon` component is a private-to-the-file component that could be shared, but that's organizational not visual.

---

## Section E: Top 10 Highest-Leverage Fixes (ranked)

### 1. Resolve the accent color split [HIGH — affects every page]
**file:** `index.css:2-4`  
The CSS custom properties (`--accent: #7c3aed`, `--accent-hover: #8b5cf6`, `--accent-muted`) use violet while Tailwind tokens use indigo. Every CSS-class component (nav glow, button glow, progress glow, pill tab active, hero card border) renders a different accent hue than `bg-accent` / `text-accent` Tailwind utilities. Decision: pick one color and sync both systems. The Tailwind config is the declared spec — update `index.css` `--accent` to `#6366f1`, `--accent-hover` to `#818cf8`, `--accent-muted` to `rgba(99,102,241,0.15)`. Also fix `--deep-surface: #111114` → `#111113`.

### 2. Remove console.log from production [HIGH]
**files:** `api/client.js:16-17`, `pages/StudyUniverse.jsx:166`  
`reqMultipart` logs every file upload (URL + fields) to the console in production. StudyUniverse logs raw insight objects on every load. Both should be removed unconditionally.

### 3. Replace `hover:bg-indigo-400` and `text-indigo-200` in Chat [HIGH]
**file:** `pages/Chat.jsx:794, 699`  
The only two raw Tailwind color classes in the codebase that break the token contract. Replace with `hover:bg-accent-hover` and `text-white/80` or `text-accent-hover`. Tiny change, high signal-to-noise for a design partner reading the diff.

### 4. Normalize Dashboard from zinc- to ink- tokens [MED — cosmetic correctness]
**file:** `pages/Dashboard.jsx` (multiple lines)  
`text-zinc-100` renders as #f4f4f5 but `text-ink-primary` renders as #e4e4e7 — a visible brightness difference. The page uses `zinc-*` classes exclusively while every other page uses `ink-*`. Replace `text-zinc-100` → `text-ink-primary`, `text-zinc-400` → `text-ink-secondary`, `text-zinc-500` → `text-ink-muted`, `text-zinc-600` → `text-ink-faint`, `bg-zinc-800` → `bg-deep-elevated`.

### 5. Migrate StudyGuide makeComponents() to token classes [HIGH — but scoped]
**file:** `pages/StudyGuide.jsx:78-191, 206-237`  
The entire markdown render surface is a token-free zone with ~40 hardcoded `style={{}}` values. Rewrite using Tailwind token classes matching the `MarkdownRenderer.jsx` pattern (which is already partially tokenized). This eliminates the dual markdown-component-map problem too — `StudyGuide` should just use `<MarkdownRenderer>`.

### 6. Standardize page h1 typography [LOW — fast sweep]
**files:** `Notes.jsx:317`, `Quiz.jsx:985`, `Flashcards.jsx:647`, `Settings.jsx:291`, `StudyGuide.jsx:381`, `VisionBoard.jsx:180`  
Six pages use `text-xl` (or `text-xl font-semibold`) instead of the spec `text-2xl font-bold`. Dashboard is the only page that gets this right. One-line change per file — highest ROI per effort of any typography fix.

### 7. Remove FIX comments from Flashcards [LOW — code hygiene]
**file:** `pages/Flashcards.jsx` (12 locations)  
`// FIX 1:` through `// FIX 6:` are bug-fix annotations that belong in git commit messages. They signal to a design partner that this file was iteratively patched. Remove all of them.

### 8. Replace VisionBoard text-white/N with ink tokens [MED]
**file:** `pages/VisionBoard.jsx` (multiple)  
`text-white/45`, `text-white/35`, `text-white/25`, `text-white/20`, `text-white/15` are fractional-opacity utilities that composite against background unpredictably. Replace with `text-ink-secondary`, `text-ink-muted`, `text-ink-faint` as appropriate. One file, isolated scope.

### 9. Delete Chat.jsx's injected `<style>` bounce keyframe [MED]
**file:** `pages/Chat.jsx:590-596`  
`bounce` is already defined in `index.css`. The JSX `<style>` tag is redundant and injects a style block into the DOM on every Chat render. Remove the `<style>` block; the existing index.css definition covers it.

### 10. Convert inline Layout colors to Tailwind classes [LOW]
**file:** `pages/Layout.jsx:65, 108, 197, 253`  
The nav bar header, dropdown menus, and mobile drawer all use hardcoded `background: '#09090b'` / `'#111113'` / `'#18181b'` inline styles. These should be `bg-deep-bg`, `bg-deep-surface`, `bg-deep-elevated`. The Layout component is rendered on every authenticated page — fixing it here propagates everywhere.

---

*Audit produced without modifying any source files.*
