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
    const ctx = await browser.newContext({ viewport: vp });
    const page = await ctx.newPage();
    console.log(`[${vpName}] /  (landing + mesh)`);
    await page.goto(APP + '/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    try { await page.waitForLoadState('networkidle', { timeout: 15000 }); } catch {}
    // Force any lazy images + scroll cycle so fullPage captures everything
    await page.evaluate(async () => {
      await new Promise((res) => {
        const total = document.body.scrollHeight;
        let y = 0;
        const tick = () => {
          y += 400;
          window.scrollTo(0, y);
          if (y >= total) { window.scrollTo(0, 0); setTimeout(res, 400); }
          else setTimeout(tick, 60);
        };
        tick();
      });
    });
    await sleep(1000);
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
