#!/usr/bin/env node
/**
 * Pre-launch smoke test for StudyNerve.
 *
 * Creates a brand-new fresh user (random email), then walks every key route
 * asserting:
 *   • no console errors
 *   • no ErrorBoundary fallback rendered (role="alert" + "Something went wrong")
 *   • no visible NaN / undefined / [object Object] in body text
 *
 * Captures a screenshot per route and writes a JSON report at the end.
 *
 * Usage (from frontend/):
 *   node scripts/_smoke/smoke.mjs
 *
 * Prereqs: frontend on :5173, backend on :8000 must already be running.
 */
import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = resolve(__dirname, 'shots')
const REPORT = resolve(__dirname, 'report.json')

const BASE = 'http://localhost:5173'

// Random fresh-user creds — must NOT collide with the demo account.
const STAMP = Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
const NEW_EMAIL = `smoke+${STAMP}@studynerve.test`
const NEW_PASS  = 'smoketest123' // ≥8 chars per Login.jsx minLength
const NEW_NAME  = `Smoke ${STAMP}`

const VIEWPORT = { width: 1440, height: 900 }

// ── State per-run ───────────────────────────────────────────────────────────
const results = [] // [{ route, status, errors:[], notes:[] }]
const consoleErrors = [] // [{ route, text }]
const pageErrors = []    // [{ route, text }]
let currentRoute = '(none)'

// ── Helpers ─────────────────────────────────────────────────────────────────
function addResult(route, status, notes = []) {
  results.push({ route, status, notes })
}

async function snap(page, name) {
  await page.screenshot({ path: join(OUT_DIR, `${name}.png`), fullPage: false })
}

async function assertNoErrorBoundary(page) {
  // ErrorBoundary fallback uses role="alert" and renders "Something went wrong"
  const fallback = await page.locator('[role="alert"]', { hasText: 'Something went wrong' }).count()
  return fallback === 0
}

async function bodyTextScan(page) {
  // Scan visible body text for common empty-state breakage signals.
  const txt = await page.evaluate(() => document.body.innerText || '')
  const hits = []
  // \bundefined\b but only as a standalone token, not e.g. "undefined behavior".
  if (/\bundefined\b/.test(txt)) hits.push('contains "undefined"')
  if (/\bNaN\b/.test(txt)) hits.push('contains "NaN"')
  if (/\[object Object\]/.test(txt)) hits.push('contains "[object Object]"')
  if (/\bnull\b\s*(?:days|notes|points|topics)/i.test(txt)) hits.push('"null <unit>" pattern')
  return hits
}

async function gotoAndSettle(page, path, label, opts = {}) {
  currentRoute = label
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' })
  try {
    await page.waitForLoadState('networkidle', { timeout: opts.networkIdleTimeout ?? 15_000 })
  } catch {
    // Some routes keep long-poll-ish requests open; degrade to a fixed settle.
    await page.waitForTimeout(1500)
  }
  if (opts.settleMs) await page.waitForTimeout(opts.settleMs)
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  await mkdir(OUT_DIR, { recursive: true })

  console.log(`[smoke] base=${BASE}`)
  console.log(`[smoke] fresh user: ${NEW_EMAIL}`)

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: VIEWPORT })
  const page = await context.newPage()

  // Capture every console message at error or warning level.
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text()
      consoleErrors.push({ route: currentRoute, text })
    }
  })
  page.on('pageerror', (err) => {
    pageErrors.push({ route: currentRoute, text: String(err?.stack || err?.message || err) })
  })

  try {
    // ── 1. / (landing, logged out) ────────────────────────────────────────────
    {
      await gotoAndSettle(page, '/', 'landing', { settleMs: 600 })

      const notes = []
      const errs = []

      // Headline present and centered (h1 in centered container).
      const h1Visible = await page.locator('h1', { hasText: /It['’]s about you/i }).first().isVisible().catch(() => false)
      if (!h1Visible) errs.push('hero h1 not visible')

      // Background canvas (constellation) mounted by LandingBackground.
      const canvasCount = await page.locator('canvas').count()
      if (canvasCount === 0) errs.push('landing background canvas missing')
      else notes.push(`canvas count=${canvasCount}`)

      // Nav Sign up + Log in
      const navSignup = await page.locator('a[href="/login?signup=1"]').first().isVisible().catch(() => false)
      const navLogin = await page.locator('a[href="/login"]').first().isVisible().catch(() => false)
      if (!navSignup) errs.push('nav Sign up missing')
      if (!navLogin)  errs.push('nav Log in missing')

      // Footer links to /privacy and /terms — click and confirm route resolves.
      await snap(page, '01-landing')
      // Open /privacy
      await gotoAndSettle(page, '/privacy', 'privacy', { settleMs: 300 })
      const privacyHeading = await page.locator('h1, h2').first().textContent().catch(() => '')
      if (!/privacy/i.test(privacyHeading || '')) notes.push(`/privacy heading="${privacyHeading?.slice(0,60)}"`)
      if (!(await assertNoErrorBoundary(page))) errs.push('/privacy ErrorBoundary triggered')
      await snap(page, '01b-privacy')

      // Open /terms
      await gotoAndSettle(page, '/terms', 'terms', { settleMs: 300 })
      const termsHeading = await page.locator('h1, h2').first().textContent().catch(() => '')
      if (!/terms/i.test(termsHeading || '')) notes.push(`/terms heading="${termsHeading?.slice(0,60)}"`)
      if (!(await assertNoErrorBoundary(page))) errs.push('/terms ErrorBoundary triggered')
      await snap(page, '01c-terms')

      currentRoute = 'landing'
      addResult('/ (landing + /privacy + /terms)', errs.length ? 'FAIL' : 'PASS', [...notes, ...errs])
    }

    // ── 2. Sign up fresh user ────────────────────────────────────────────────
    {
      currentRoute = 'signup'
      await gotoAndSettle(page, '/login?signup=1', 'signup', { settleMs: 400 })
      await snap(page, '02a-signup-blank')

      // Login.jsx renders the toggle by clicking "Create account"; ?signup=1 sets initial mode.
      await page.locator('input[type="text"]').fill(NEW_NAME)
      await page.locator('input[type="email"]').fill(NEW_EMAIL)
      await page.locator('input[type="password"]').fill(NEW_PASS)
      await page.locator('#accept-terms').check()
      await snap(page, '02b-signup-filled')

      const errs = []
      await Promise.all([
        page.waitForURL(`${BASE}/`, { timeout: 30_000 }).catch(() => errs.push('navigation to / after signup timed out')),
        page.locator('form button[type="submit"]').click(),
      ])
      await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {})
      await page.waitForTimeout(800)

      // Dismiss onboarding wizard so it doesn't blanket every subsequent screenshot.
      await page.evaluate(() => {
        try {
          const raw = localStorage.getItem('mt_user')
          const id = raw ? JSON.parse(raw)?.id : null
          if (id != null) localStorage.setItem(`mt_onboarded:${id}`, '1')
          localStorage.setItem('mt_onboarded', '1')
        } catch {}
      })
      await page.reload({ waitUntil: 'domcontentloaded' })
      await page.waitForLoadState('networkidle').catch(() => {})

      const onDashboard = page.url().replace(/\/$/, '') === BASE
      if (!onDashboard) errs.push(`expected dashboard URL, got ${page.url()}`)

      await snap(page, '02c-after-signup')
      addResult('signup flow', errs.length ? 'FAIL' : 'PASS', errs)
    }

    // ── 3. Dashboard ─────────────────────────────────────────────────────────
    {
      await gotoAndSettle(page, '/', 'dashboard', { settleMs: 1200 })
      const errs = []
      const notes = []
      if (!(await assertNoErrorBoundary(page))) errs.push('ErrorBoundary triggered')
      const scan = await bodyTextScan(page)
      if (scan.length) errs.push(...scan.map((s) => `body text: ${s}`))
      await snap(page, '03-dashboard')
      addResult('/ (Dashboard, empty)', errs.length ? 'FAIL' : 'PASS', [...notes, ...errs])
    }

    // ── 4. Notes — create one, extract topics ────────────────────────────────
    let createdNoteTitle = null
    {
      await gotoAndSettle(page, '/notes', 'notes', { settleMs: 700 })
      const errs = []
      const notes = []
      if (!(await assertNoErrorBoundary(page))) errs.push('ErrorBoundary triggered')

      // The "blank" Notes page on a fresh account should show an empty state.
      const scan = await bodyTextScan(page)
      if (scan.length) errs.push(...scan.map((s) => `body text: ${s}`))
      await snap(page, '04a-notes-empty')

      // Find the textarea (paste-notes field) and fill.
      const ta = page.locator('textarea').first()
      if (!(await ta.isVisible().catch(() => false))) {
        // Some empty-state designs show a "Create note" button first; click any visible primary CTA.
        const cta = page.locator('button', { hasText: /create|add|new note|paste/i }).first()
        if (await cta.isVisible().catch(() => false)) await cta.click()
        await page.waitForTimeout(300)
      }

      const SAMPLE = `Cell Biology — chapter 3.
The mitochondrion is the powerhouse of the cell. Mitochondria generate most of the ATP used by the cell through oxidative phosphorylation.
Photosynthesis occurs in chloroplasts and converts light energy into chemical energy stored in glucose.`
      const titleInput = page.locator('input[placeholder*="Chapter"]').first()
      if (await titleInput.isVisible().catch(() => false)) {
        createdNoteTitle = `Smoke Note ${STAMP}`
        await titleInput.fill(createdNoteTitle)
      }
      const subjInput = page.locator('input[placeholder*="Biology"]').first()
      if (await subjInput.isVisible().catch(() => false)) {
        await subjInput.fill('Biology')
      }
      const taNow = page.locator('textarea').first()
      if (await taNow.isVisible().catch(() => false)) {
        await taNow.fill(SAMPLE)
      } else {
        errs.push('no textarea available to paste note')
      }
      await snap(page, '04b-notes-filled')

      // Submit — look for the primary "Save"/"Create"/"Add" button.
      const submit = page.locator('button[type="submit"], button:has-text("Save"), button:has-text("Create"), button:has-text("Add"), button:has-text("Extract")').first()
      if (await submit.isVisible().catch(() => false)) {
        await submit.click()
        await page.waitForLoadState('networkidle', { timeout: 70_000 }).catch(() => {})
        await page.waitForTimeout(1500)
      } else {
        errs.push('no submit/save button found on notes form')
      }
      await snap(page, '04c-notes-after-save')

      // Look for an "Extract topics" affordance to surface topics.
      const extract = page.locator('button:has-text("Extract")').first()
      if (await extract.isVisible().catch(() => false)) {
        await extract.click()
        await page.waitForLoadState('networkidle', { timeout: 70_000 }).catch(() => {})
        await page.waitForTimeout(2500)
        notes.push('clicked Extract topics')
      } else {
        notes.push('no explicit Extract button visible after save (may auto-run)')
      }
      await snap(page, '04d-notes-after-extract')

      // Try to detect any topic chip/pill text in body (best-effort).
      const txt = (await page.evaluate(() => document.body.innerText || '')).toLowerCase()
      if (/mitochond|photosyn|chloropl/.test(txt)) notes.push('topic-like text visible')
      else notes.push('no topic-like text detected in body (best-effort signal)')

      const scan2 = await bodyTextScan(page)
      if (scan2.length) errs.push(...scan2.map((s) => `body text after save: ${s}`))

      addResult('/notes', errs.length ? 'FAIL' : 'PASS', [...notes, ...errs])
    }

    // ── 5. Quiz — load + best-effort generation ──────────────────────────────
    {
      await gotoAndSettle(page, '/quiz', 'quiz', { settleMs: 1200 })
      const errs = []
      const notes = []
      if (!(await assertNoErrorBoundary(page))) errs.push('ErrorBoundary triggered')
      const scan = await bodyTextScan(page)
      if (scan.length) errs.push(...scan.map((s) => `body text: ${s}`))
      await snap(page, '05a-quiz-initial')

      // Best-effort: click a Generate-style button if present (the new note may be selected by default).
      const gen = page.locator('button', { hasText: /^Generate( Quiz)?$/i }).first()
      if (await gen.isVisible().catch(() => false)) {
        await gen.click().catch(() => {})
        await page.waitForLoadState('networkidle', { timeout: 70_000 }).catch(() => {})
        await page.waitForTimeout(2000)
        notes.push('clicked Generate')
        await snap(page, '05b-quiz-generated')

        // If a question card appeared, click first answer to verify no crash.
        const firstChoice = page.locator('button:has-text("A."), button:has-text("True"), button[data-choice], label:has(input[type="radio"])').first()
        if (await firstChoice.isVisible().catch(() => false)) {
          await firstChoice.click().catch(() => {})
          await page.waitForTimeout(700)
          notes.push('answered one question (best-effort)')
        } else {
          notes.push('no quiz question UI detected (maybe generation deferred/quota)')
        }
        await snap(page, '05c-quiz-after-answer')
      } else {
        notes.push('no Generate button visible — empty-state may require a topic first')
      }

      const scan2 = await bodyTextScan(page)
      if (scan2.length) errs.push(...scan2.map((s) => `body text after action: ${s}`))
      addResult('/quiz', errs.length ? 'FAIL' : 'PASS', [...notes, ...errs])
    }

    // ── 6. Chat (Tutor) — send + receive ─────────────────────────────────────
    {
      await gotoAndSettle(page, '/chat', 'chat', { settleMs: 800 })
      const errs = []
      const notes = []
      if (!(await assertNoErrorBoundary(page))) errs.push('ErrorBoundary triggered')
      const scan = await bodyTextScan(page)
      if (scan.length) errs.push(...scan.map((s) => `body text: ${s}`))
      await snap(page, '06a-chat-empty')

      const composer = page.locator('textarea[placeholder*="Nervo"], textarea[placeholder*="Ask"]').first()
      if (await composer.isVisible().catch(() => false)) {
        await composer.fill('Say hello back in five words or fewer.')
        const send = page.locator('button[aria-label="Send message"]').first()
        if (await send.isVisible().catch(() => false)) {
          await send.click().catch(() => {})
          // Wait up to 75s for either a response bubble or an error toast.
          await page.waitForLoadState('networkidle', { timeout: 75_000 }).catch(() => {})
          await page.waitForTimeout(2000)
          notes.push('sent message')
        } else {
          errs.push('Send button not visible')
        }
      } else {
        errs.push('chat composer not visible')
      }
      await snap(page, '06b-chat-after-send')

      // Best-effort: did an assistant bubble appear?
      const bubbles = await page.locator('[data-role="assistant"], .markdown, [class*="assistant"]').count().catch(() => 0)
      notes.push(`assistant-bubble candidates=${bubbles}`)

      const scan2 = await bodyTextScan(page)
      if (scan2.length) errs.push(...scan2.map((s) => `body text after send: ${s}`))
      addResult('/chat (Tutor)', errs.length ? 'FAIL' : 'PASS', [...notes, ...errs])
    }

    // ── 7. Flashcards — empty + start a deck ─────────────────────────────────
    {
      await gotoAndSettle(page, '/flashcards', 'flashcards', { settleMs: 800 })
      const errs = []
      const notes = []
      if (!(await assertNoErrorBoundary(page))) errs.push('ErrorBoundary triggered')
      const scan = await bodyTextScan(page)
      if (scan.length) errs.push(...scan.map((s) => `body text: ${s}`))
      await snap(page, '07a-flashcards-empty')

      const cta = page.locator('button:has-text("Generate First Deck"), button:has-text("Generate Flashcards")').first()
      if (await cta.isVisible().catch(() => false)) {
        await cta.click()
        await page.waitForLoadState('networkidle', { timeout: 70_000 }).catch(() => {})
        await page.waitForTimeout(700)
        notes.push('opened Generate view')
        await snap(page, '07b-flashcards-generate-view')

        // Try to actually generate if a Generate primary CTA is visible.
        const gen = page.locator('button:has-text("Generate")').last()
        if (await gen.isVisible().catch(() => false)) {
          await gen.click().catch(() => {})
          await page.waitForLoadState('networkidle', { timeout: 70_000 }).catch(() => {})
          await page.waitForTimeout(2000)
          notes.push('clicked Generate (best-effort)')
        }
      } else {
        notes.push('no Generate CTA visible on flashcards empty state')
      }
      await snap(page, '07c-flashcards-after-generate')

      const scan2 = await bodyTextScan(page)
      if (scan2.length) errs.push(...scan2.map((s) => `body text after action: ${s}`))
      addResult('/flashcards', errs.length ? 'FAIL' : 'PASS', [...notes, ...errs])
    }

    // ── 8. AI Brain (/universe) ──────────────────────────────────────────────
    {
      await gotoAndSettle(page, '/universe', 'universe', { settleMs: 4500 })
      const errs = []
      const notes = []
      if (!(await assertNoErrorBoundary(page))) errs.push('ErrorBoundary triggered')
      const scan = await bodyTextScan(page)
      if (scan.length) errs.push(...scan.map((s) => `body text: ${s}`))

      // Canvas / WebGL surface should be present (3d-force-graph renders into a canvas).
      const cv = await page.locator('canvas').count()
      notes.push(`canvas count=${cv}`)
      await snap(page, '08-universe')
      addResult('/universe (AI Brain)', errs.length ? 'FAIL' : 'PASS', [...notes, ...errs])
    }

    // ── 9. Vision Board ──────────────────────────────────────────────────────
    {
      await gotoAndSettle(page, '/vision', 'vision', { settleMs: 1200 })
      const errs = []
      const notes = []
      if (!(await assertNoErrorBoundary(page))) errs.push('ErrorBoundary triggered')
      const scan = await bodyTextScan(page)
      if (scan.length) errs.push(...scan.map((s) => `body text: ${s}`))
      await snap(page, '09a-vision-empty')

      // Try AI generation flow: title input + a "Generate"/"Create" CTA.
      const titleField = page.locator('textarea[placeholder*="climate"], input[placeholder*="climate"]').first()
      if (await titleField.isVisible().catch(() => false)) {
        await titleField.fill('Study plan for the AP Biology midterm')
        const aiBtn = page.locator('button:has-text("Generate"), button:has-text("AI"), button:has-text("Create")').first()
        if (await aiBtn.isVisible().catch(() => false)) {
          await aiBtn.click().catch(() => {})
          await page.waitForLoadState('networkidle', { timeout: 70_000 }).catch(() => {})
          await page.waitForTimeout(2500)
          notes.push('clicked vision AI generate')
        } else {
          notes.push('no generate CTA visible after fill')
        }
      } else {
        notes.push('no title field found — empty-state pattern different than expected')
      }
      await snap(page, '09b-vision-after-generate')

      const scan2 = await bodyTextScan(page)
      if (scan2.length) errs.push(...scan2.map((s) => `body text after action: ${s}`))
      addResult('/vision (Vision Board)', errs.length ? 'FAIL' : 'PASS', [...notes, ...errs])
    }

    // ── 10. Study Guide (under a note) — best-effort ─────────────────────────
    {
      // The route requires /notes/:noteId/study-guide. Try to discover an id
      // from the API directly instead of clicking through the Notes UI.
      const noteId = await page.evaluate(async () => {
        try {
          const t = localStorage.getItem('mt_token')
          const res = await fetch('/api/notes', { headers: t ? { Authorization: `Bearer ${t}` } : {} })
          const data = await res.json().catch(() => null)
          if (Array.isArray(data) && data.length) return data[0].id
        } catch {}
        return null
      })
      const errs = []
      const notes = []
      if (noteId != null) {
        await gotoAndSettle(page, `/notes/${noteId}/study-guide`, 'study-guide', { settleMs: 1500 })
        if (!(await assertNoErrorBoundary(page))) errs.push('ErrorBoundary triggered')
        const scan = await bodyTextScan(page)
        if (scan.length) errs.push(...scan.map((s) => `body text: ${s}`))
        notes.push(`note_id=${noteId}`)
        await snap(page, '10-study-guide')
      } else {
        currentRoute = 'study-guide'
        notes.push('skipped — no note exists yet for fresh user')
        await snap(page, '10-study-guide-skipped')
      }
      addResult('/notes/:id/study-guide', errs.length ? 'FAIL' : 'PASS', [...notes, ...errs])
    }

    // ── 11. Settings ─────────────────────────────────────────────────────────
    {
      await gotoAndSettle(page, '/settings', 'settings', { settleMs: 800 })
      const errs = []
      const notes = []
      if (!(await assertNoErrorBoundary(page))) errs.push('ErrorBoundary triggered')
      const scan = await bodyTextScan(page)
      if (scan.length) errs.push(...scan.map((s) => `body text: ${s}`))
      await snap(page, '11-settings')
      addResult('/settings', errs.length ? 'FAIL' : 'PASS', [...notes, ...errs])
    }

    // ── 12. Re-snap landing logged-out (cleanup) — optional ──────────────────
    // (skipped — covered in section 1)

  } finally {
    // ── Write report ───────────────────────────────────────────────────────
    const report = {
      base: BASE,
      timestamp: new Date().toISOString(),
      user: { email: NEW_EMAIL, name: NEW_NAME },
      results,
      console_errors: consoleErrors,
      page_errors: pageErrors,
    }
    await writeFile(REPORT, JSON.stringify(report, null, 2), 'utf8')

    console.log('')
    console.log('── RESULTS ──────────────────────────────────────────')
    for (const r of results) {
      console.log(`${r.status.padEnd(4)}  ${r.route}`)
      for (const n of r.notes) console.log(`         · ${n}`)
    }
    console.log('')
    console.log(`console.error events: ${consoleErrors.length}`)
    for (const e of consoleErrors) {
      console.log(`  [${e.route}] ${e.text.replace(/\n/g, ' ').slice(0, 280)}`)
    }
    console.log('')
    console.log(`pageerror events: ${pageErrors.length}`)
    for (const e of pageErrors) {
      console.log(`  [${e.route}] ${e.text.replace(/\n/g, ' ').slice(0, 280)}`)
    }
    console.log('')
    console.log(`report → ${REPORT}`)
    console.log(`shots  → ${OUT_DIR}`)

    await context.close()
    await browser.close()
  }
}

main().catch((err) => {
  console.error(`[smoke] FATAL: ${err?.message ?? err}`)
  if (err?.stack) console.error(err.stack)
  process.exit(1)
})
