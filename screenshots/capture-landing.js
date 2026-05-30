const { chromium } = require('playwright');
const path = require('path');

const APP = 'http://localhost:5173';
const OUT = __dirname;

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 375, height: 812 },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const written = [];
  const browser = await chromium.launch({ headless: false });

  for (const [vpName, vp] of Object.entries(VIEWPORTS)) {
    // Fresh, signed-out context for each viewport so / lands on Landing.
    const ctx = await browser.newContext({ viewport: vp });
    const page = await ctx.newPage();
    console.log(`[${vpName}] /  (landing)`);
    await page.goto(APP + '/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    try {
      await page.waitForLoadState('networkidle', { timeout: 15000 });
    } catch {}
    // Wait for hero image + step images to actually paint
    try {
      await page.waitForFunction(
        () => Array.from(document.images).every((i) => i.complete && i.naturalWidth > 0),
        null,
        { timeout: 15000 }
      );
    } catch {
      console.log('  (some images did not finish loading — continuing)');
    }
    await sleep(1200);
    const file = path.join(OUT, `landing-${vpName}.png`);
    await page.screenshot({ path: file, fullPage: true });
    written.push(file);
    console.log(`  -> ${file}`);
    await ctx.close();
  }

  await browser.close();
  console.log('');
  console.log('Files written:');
  for (const f of written) console.log('  ' + f);
})().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
