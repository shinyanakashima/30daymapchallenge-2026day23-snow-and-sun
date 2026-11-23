// Usage: node scripts/check.js <base-url> [screenshot-path]
const { chromium } = require('playwright');
(async () => {
  const base = process.argv[2] || 'http://localhost:8000/';
  const shot = process.argv[3];
  const browser = await chromium.launch();
  const problems = [];
  for (const vp of [{ width: 1200, height: 900 }, { width: 390, height: 844 }]) {
    for (const lang of ['en', 'ja']) {
      const page = await browser.newPage({ viewport: vp });
      page.on('console', m => { if (m.type() === 'error') problems.push(`[console ${vp.width} ${lang}] ${m.text()}`); });
      page.on('pageerror', e => problems.push(`[pageerror ${vp.width} ${lang}] ${e.message}`));
      page.on('response', r => { if (r.status() >= 400) problems.push(`[${r.status()}] ${r.url()}`); });
      await page.goto(base + '?lang=' + lang, { waitUntil: 'networkidle' });
      const steps = await page.$$('.step');
      for (const s of steps) { await s.scrollIntoViewIfNeeded(); await page.waitForTimeout(250); }
      const leftover = await page.evaluate(() => document.body.innerText.match(/\{\w+\}/g));
      if (leftover) problems.push(`[placeholder ${lang}] ${leftover.join(' ')}`);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      if (overflow) problems.push(`[overflow ${vp.width} ${lang}]`);
      // SVG labels must survive a viewport change (rotation, window resize)
      await page.setViewportSize({ width: vp.height > vp.width ? vp.height : vp.width - 200, height: vp.height > vp.width ? vp.width : vp.height - 100 });
      await page.waitForTimeout(600);
      const empty = await page.$$eval('.spoon-text text, .season-row', t => t.filter(x => !x.textContent.trim()).length);
      if (empty) problems.push(`[empty svg labels after resize ${vp.width} ${lang}] ${empty}`);
      await page.setViewportSize(vp);
      await page.waitForTimeout(600);
      if (shot && vp.width === 1200 && lang === 'en') {
        await page.evaluate(() => document.querySelector('.step:not(.intro)[data-scene="japan"]').scrollIntoView({ block: 'center' }));
        await page.waitForTimeout(1500);
        await page.screenshot({ path: shot });
      }
      await page.close();
    }
  }
  // switching language with the button must give the same text as opening the page in that language
  for (const [from, to] of [['en', 'ja'], ['ja', 'en']]) {
    const direct = await browser.newPage();
    await direct.goto(base + '?lang=' + to, { waitUntil: 'networkidle' });
    const want = await direct.$eval('.steps', e => e.innerText);
    await direct.close();
    const page = await browser.newPage();
    await page.goto(base + '?lang=' + from, { waitUntil: 'networkidle' });
    await page.click(`.lang button[data-lang="${to}"]`);
    await page.waitForTimeout(300);
    const got = await page.$eval('.steps', e => e.innerText);
    if (got !== want) {
      const a = got.split('\n'), b = want.split('\n');
      const i = a.findIndex((l, k) => l !== b[k]);
      problems.push(`[language switch ${from}->${to}] differs: "${(a[i] || '').slice(0, 120)}"`);
    }
    await page.close();
  }
  await browser.close();
  console.log(problems.length ? problems.join('\n') : 'OK: no console errors, no 4xx/5xx, no leftover placeholders');
  process.exit(problems.length ? 1 : 0);
})();
