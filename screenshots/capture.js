const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const APP = 'http://localhost:5173';
const OUT = __dirname;

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 375, height: 812 },
};

const ROUTES = [
  { path: '/', name: 'dashboard' },
  { path: '/notes', name: 'notes' },
  { path: '/quiz', name: 'quiz' },
  { path: '/chat', name: 'chat' },
  { path: '/flashcards', name: 'flashcards' },
  { path: '/canvas', name: 'canvas' },
  { path: '/vision', name: 'vision' },
  { path: '/universe', name: 'universe', extraWaitMs: 4000 },
  { path: '/settings', name: 'settings' },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function gotoAndSettle(page, url, extraWaitMs = 0) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  try {
    await page.waitForLoadState('networkidle', { timeout: 15000 });
  } catch (e) {
    console.log(`  (networkidle timeout for ${url} — continuing)`);
  }
  await sleep(800 + extraWaitMs);
}

(async () => {
  const written = [];
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: VIEWPORTS.desktop });
  const page = await context.newPage();

  console.log('Navigating to app root...');
  await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(2500);

  if (page.url().includes('/login')) {
    console.log('');
    console.log('============================================================');
    console.log('  Landed on /login. Please LOG IN MANUALLY in the window.');
    console.log('  Waiting up to 5 minutes for navigation away from /login...');
    console.log('============================================================');
    console.log('');
    try {
      await page.waitForFunction(
        () => !window.location.pathname.startsWith('/login'),
        null,
        { timeout: 5 * 60 * 1000 }
      );
      console.log('Login detected.');
    } catch (e) {
      console.error('Timed out waiting for login. Aborting.');
      await browser.close();
      process.exit(1);
    }
    await sleep(2000);
  } else {
    console.log('Already authenticated (no /login redirect).');
  }

  // Mark this user as onboarded so the modal doesn't fire on every route.
  // Mirrors the App.jsx key: `mt_onboarded:<userId>`. We set the legacy flag too
  // so the in-memory React state on the next reload also picks it up cleanly.
  const onboardingSeeded = await page.evaluate(() => {
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
  if (onboardingSeeded.ok) {
    console.log(`Seeded onboarding flag for user.id=${onboardingSeeded.userId}. Reloading.`);
  } else {
    console.log(`WARNING: could not seed onboarding flag (${onboardingSeeded.reason}). Continuing anyway.`);
  }
  await page.reload({ waitUntil: 'domcontentloaded' });
  await sleep(1500);

  for (const route of ROUTES) {
    for (const [vpName, vp] of Object.entries(VIEWPORTS)) {
      await page.setViewportSize(vp);
      const url = APP + route.path;
      console.log(`[${vpName}] ${route.path}`);
      await gotoAndSettle(page, url, route.extraWaitMs || 0);
      const file = path.join(OUT, `${route.name}-${vpName}.png`);
      await page.screenshot({ path: file, fullPage: true });
      written.push(file);
      console.log(`  -> ${file}`);
    }
  }

  await context.close();

  console.log('');
  console.log('Opening CLEAN context for /login (logged-out)...');
  const cleanCtx = await browser.newContext({ viewport: VIEWPORTS.desktop });
  const cleanPage = await cleanCtx.newPage();
  for (const [vpName, vp] of Object.entries(VIEWPORTS)) {
    await cleanPage.setViewportSize(vp);
    console.log(`[${vpName}] /login (clean)`);
    await gotoAndSettle(cleanPage, APP + '/login');
    const file = path.join(OUT, `login-${vpName}.png`);
    await cleanPage.screenshot({ path: file, fullPage: true });
    written.push(file);
    console.log(`  -> ${file}`);
  }
  await cleanCtx.close();
  await browser.close();

  console.log('');
  console.log('Files written:');
  for (const f of written) console.log('  ' + f);
})().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
