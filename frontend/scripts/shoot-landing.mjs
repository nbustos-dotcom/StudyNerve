#!/usr/bin/env node
/**
 * Regenerate the landing-page product screenshots.
 *
 * Drops PNGs into frontend/public/landing/ at the exact filenames Landing.jsx
 * references, so no Landing.jsx change is needed after running.
 *
 * Prerequisites (this script does NOT start them):
 *   • Backend on http://localhost:8000
 *   • Frontend dev server on http://localhost:5173 (`npm run dev`)
 *   • Demo account seeded — see backend/scripts/seed_demo_account.py
 *
 * Usage (from frontend/):
 *   npm run shoot:landing
 *
 * Re-runnable: overwrites the PNGs in place.
 */
import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// ── Config ────────────────────────────────────────────────────────────────────
const BASE_URL = 'http://localhost:5173'   // Vite default; vite.config.js doesn't override

const DEMO_EMAIL = 'demo@studynerve.app'
const DEMO_PASSWORD = 'demodemo123'

const VIEWPORT = { width: 1440, height: 900 }
const DEVICE_SCALE_FACTOR = 2              // crisp 2× output for landing

// Each entry: app route + the filename Landing.jsx hard-codes.
// settleMs = extra wait after networkidle (the 3D force-graph needs to tick).
const TARGETS = [
  { route: '/',         out: 'dashboard.png', settleMs: 800  },
  { route: '/notes',    out: 'notes.png',     settleMs: 600  },
  { route: '/quiz',     out: 'quiz.png',      settleMs: 600  },
  { route: '/universe', out: 'ai-brain.png',  settleMs: 5500 },
]

// ── Paths ─────────────────────────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = resolve(__dirname, '..', 'public', 'landing')

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  await mkdir(OUT_DIR, { recursive: true })

  console.log(`[shoot] Launching headless Chromium…`)
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
  })
  const page = await context.newPage()

  try {
    // ── Log in through the UI ─────────────────────────────────────────────────
    // Login.jsx renders <label>Email</label> + <input type="email">, no `for=`
    // wiring, so a `type=` locator is the stablest selector.
    console.log(`[shoot] Logging in as ${DEMO_EMAIL}…`)
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' })
    await page.locator('input[type="email"]').fill(DEMO_EMAIL)
    await page.locator('input[type="password"]').fill(DEMO_PASSWORD)
    await Promise.all([
      page.waitForURL(`${BASE_URL}/`, { timeout: 30_000 }),
      page.locator('form button[type="submit"]').click(),
    ])
    await page.waitForLoadState('networkidle')
    console.log(`[shoot] Logged in.`)

    // ── Dismiss the first-run onboarding wizard ───────────────────────────────
    // App.jsx gates the wizard on localStorage `mt_onboarded:<userId>` (with a
    // legacy `mt_onboarded` fallback) — that flag is missing in a fresh
    // headless context, so the modal blocks every screenshot. We set both keys
    // and reload; `showWizard` is initialized once from localStorage, so a
    // reload is required to suppress it.
    await page.evaluate(() => {
      try {
        const raw = localStorage.getItem('mt_user')
        const id = raw ? JSON.parse(raw)?.id : null
        if (id != null) localStorage.setItem(`mt_onboarded:${id}`, '1')
        localStorage.setItem('mt_onboarded', '1')
      } catch {}
    })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle')
    console.log(`[shoot] Onboarding wizard suppressed.`)

    // ── Capture each target ───────────────────────────────────────────────────
    const written = []
    for (const { route, out, settleMs } of TARGETS) {
      const url = `${BASE_URL}${route}`
      const file = join(OUT_DIR, out)
      console.log(`[shoot] ${route.padEnd(11)} → ${out}…`)
      await page.goto(url, { waitUntil: 'domcontentloaded' })
      await page.waitForLoadState('networkidle')
      if (settleMs > 0) await page.waitForTimeout(settleMs)
      await page.screenshot({ path: file, fullPage: false })
      written.push(file)
      console.log(`            wrote ${file}`)
    }

    console.log(`\n[shoot] Done — ${written.length} screenshot(s) regenerated.`)
  } finally {
    await context.close()
    await browser.close()
  }
}

main().catch((err) => {
  console.error(`[shoot] FAILED: ${err?.message ?? err}`)
  if (err?.stack) console.error(err.stack)
  process.exit(1)
})
