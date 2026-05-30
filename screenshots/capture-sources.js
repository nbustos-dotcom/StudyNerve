// Recapture the 4 product shots that feed the Landing page, against the
// CURRENT code (post-StatCard cleanup). User logs in manually so we can
// pick the populated account.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const APP = 'http://localhost:5173';
const PUBLIC_LANDING = path.join(__dirname, '..', 'frontend', 'public', 'landing');

// Source route → file name in public/landing/
const ROUTES = [
  { path: '/',         file: 'dashboard.png', extraWaitMs: 0    },
  { path: '/notes',    file: 'notes.png',     extraWaitMs: 0    },
  { path: '/quiz',     file: 'quiz.png',      extraWaitMs: 0    },
  { path: '/universe', file: 'ai-brain.png',  extraWaitMs: 4000 }, // WebGL settle
];

const DESKTOP = { width: 1440, height: 900 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function gotoAndSettle(page, url, extraWaitMs = 0) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  try {
    await page.waitForLoadState('networkidle', { timeout: 15000 });
  } catch {
    console.log(`  (networkidle timeout for ${url} — continuing)`);
  }
  await sleep(800 + extraWaitMs);
}

(async () => {
  if (!fs.existsSync(PUBLIC_LANDING)) fs.mkdirSync(PUBLIC_LANDING, { recursive: true });

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: DESKTOP });
  const page = await context.newPage();

  console.log('Navigating to /login...');
  // Go straight to /login so the manual-login flow is unambiguous. (After the
  // Landing page was added, an unauthenticated visit to / no longer redirects
  // to /login, so we can't gate auth on URL — we gate on localStorage.mt_user.)
  await page.goto(APP + '/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
  // Wipe any prior session so the user is forced to pick which account to use.
  // We keep onboarded-flag keys so the modal doesn't fire for the picked user.
  await page.evaluate(() => {
    localStorage.removeItem('mt_user');
    localStorage.removeItem('mt_token');
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await sleep(1500);

  const hasUser = await page.evaluate(() => Boolean(localStorage.getItem('mt_user')));
  if (!hasUser) {
    console.log('');
    console.log('============================================================');
    console.log('  Please log in as the POPULATED account in the window');
    console.log('  (real subject names, healthy quiz history, AI brain data).');
    console.log('  Waiting up to 5 minutes for mt_user to appear...');
    console.log('============================================================');
    console.log('');
    try {
      await page.waitForFunction(
        () => Boolean(localStorage.getItem('mt_user')),
        null,
        { timeout: 5 * 60 * 1000, polling: 500 }
      );
      console.log('Login detected.');
    } catch {
      console.error('Timed out waiting for login. Aborting.');
      await browser.close();
      process.exit(1);
    }
    await sleep(1500);
  } else {
    console.log('Already authenticated.');
  }

  // Seed onboarding-seen for whoever just logged in.
  const seeded = await page.evaluate(() => {
    try {
      const raw = localStorage.getItem('mt_user');
      if (!raw) return { ok: false, reason: 'no mt_user' };
      const u = JSON.parse(raw);
      if (u?.id == null) return { ok: false, reason: 'no user.id' };
      localStorage.setItem(`mt_onboarded:${u.id}`, '1');
      localStorage.setItem('mt_onboarded', '1');
      return { ok: true, userId: u.id };
    } catch (e) {
      return { ok: false, reason: String(e) };
    }
  });
  if (seeded.ok) {
    console.log(`Seeded onboarding flag for user.id=${seeded.userId}. Reloading.`);
  } else {
    console.log(`WARNING: could not seed onboarding flag (${seeded.reason}).`);
  }
  await page.reload({ waitUntil: 'domcontentloaded' });
  await sleep(1500);

  const written = [];
  for (const route of ROUTES) {
    console.log(`Capturing ${route.path} → ${route.file}`);
    await gotoAndSettle(page, APP + route.path, route.extraWaitMs);
    const dest = path.join(PUBLIC_LANDING, route.file);
    await page.screenshot({ path: dest, fullPage: true });
    written.push(dest);
    console.log(`  -> ${dest}`);
  }

  await context.close();
  await browser.close();

  console.log('');
  console.log('Files overwritten in public/landing/:');
  for (const f of written) console.log('  ' + f);
})().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
