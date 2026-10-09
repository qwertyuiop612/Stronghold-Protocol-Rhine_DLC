import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ENABLED = process.env.SP_E2E === '1' && existsSync(CHROME);
const OUT = fileURLToPath(new URL('../e2e/out/', import.meta.url));
let srv, browser, base;
before(async () => {
  if (!ENABLED) return;
  const { startServer } = await import('../../server/index.js');
  const puppeteer = (await import('puppeteer-core')).default;
  srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true });
  base = `http://127.0.0.1:${srv.port}`;
  browser = await puppeteer.launch({ executablePath: CHROME, headless: true, pipe: true, args: ['--no-sandbox', '--disable-gpu'] });
  mkdirSync(OUT, { recursive: true });
});
after(async () => { await browser?.close(); await srv?.close(); });

test('收藏品图鉴：局内入口、完整效果、跨局与刷新持久化、移动端滚动及原章节切换', {
  skip: !ENABLED && 'set SP_E2E=1 and provide system Chrome', timeout: 120000,
}, async () => {
  for (const [width, height] of [[1920, 1080], [640, 360], [390, 844]]) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    try {
      await page.setViewport({ width, height });
      await page.setRequestInterception(true);
      page.on('request', async (req) => {
        if (req.url().endsWith('/data/local-assets.json')) {
          const guide = Object.fromEntries([['home', 9], ['shop', 6], ['handbook', 4]].flatMap(([chapter, count]) =>
            Array.from({ length: count }, (_, i) => [`autochess_${chapter}_${i + 1}`, { path: '/test-guide.svg' }])));
          // 手机降级场景明确提供空资源，避免本机已有说明图改变预期分支。
          await req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ groups: { guide: width === 390 ? {} : guide } }) });
        } else if (width === 390 && req.url().endsWith('/data/assets.json')) {
          // 上游增加公开镜像说明图；降级场景同时清除两个来源，仍验证文字要点。
          const manifest = JSON.parse(readFileSync(new URL('../../data/assets.json', import.meta.url), 'utf8'));
          manifest.ui = Object.fromEntries(Object.entries(manifest.ui).filter(([key]) => !key.startsWith('guide/')));
          await req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(manifest) });
        } else if (req.url().endsWith('/test-guide.svg')) {
          await req.respond({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="1024" height="1024" fill="#102c23"/></svg>' });
        } else if (req.url().startsWith(base) || req.url().startsWith('data:')) await req.continue();
        else await req.abort();
      });
      await page.goto(`${base}/dev/game-mock.html?shot=1&phase=PREP&render=fallback`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.gm__guide');
      await page.click('.gm__guide');
      await page.waitForSelector('.guide');
      await page.click('.guide__chapter:last-child');
      await page.waitForSelector('.guide__journal');
      assert.match(await page.$eval('.guide__journal', (e) => e.textContent), /尚未收录收藏品/);
      const chosen = await page.evaluate(async () => {
        const { RELICS } = await import('/shared/relics.js');
        const { store } = await import('/js/store.js');
        store.patch('match', { private: { ...store.get().match.private, relics: RELICS.map((r) => ({ id: r.id, round: 1 })) } });
        return RELICS.map(({ name, desc }) => ({ name, desc }));
      });
      await page.waitForFunction((count) => document.querySelectorAll('.guide__journal .relic-card').length === count, {}, chosen.length);
      const cards = await page.$$eval('.guide__journal .relic-card', (els) => els.map((e) => e.textContent));
      chosen.forEach((r, i) => { assert.ok(cards[i].includes(r.name)); assert.ok(cards[i].includes(r.desc)); });
      assert.equal(await page.$('.guide__journal .relic-card__round'), null);
      const bounds = await page.$eval('.guide__box', (e) => { const r = e.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, overflow: e.scrollWidth > e.clientWidth + 1 }; });
      assert.ok(bounds.left >= 0 && bounds.right <= width && bounds.top >= 0 && bounds.bottom <= height, JSON.stringify(bounds));
      assert.equal(bounds.overflow, false, `${width}: horizontal overflow`);
      await page.screenshot({ path: `${OUT}/relic-journal-${width}.png` });
      const reachable = await page.$eval('.guide__journal', (e) => {
        e.scrollTop = e.scrollHeight;
        const r = e.querySelector('.relic-card:last-child').getBoundingClientRect();
        const container = e.getBoundingClientRect();
        return r.bottom <= container.bottom && r.top >= container.top;
      });
      assert.ok(reachable, `${width}: last effect is not reachable`);
      await page.keyboard.press('d');
      assert.ok(await page.$('.guide__journal'), '游戏翻页快捷键不离开图鉴');
      await page.click('.guide__chapter:first-child');
      await page.waitForFunction(() => !document.querySelector('.guide__journal'));
      assert.ok(await page.$(width !== 390 ? '.guide__page' : '.guide__tips'));
      await page.click('.guide__close');
      await page.evaluate(async () => {
        const { store, emptyMatch } = await import('/js/store.js');
        store.set({ match: emptyMatch() });
      });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.gm__guide');
      await page.click('.gm__guide');
      await page.waitForSelector('.guide');
      await page.click('.guide__chapter:last-child');
      await page.waitForFunction((count) => document.querySelectorAll('.guide__journal .relic-card').length === count, {}, chosen.length);
      await page.waitForFunction(() => document.activeElement === document.querySelector('.guide__box'));
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('.guide'));
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
});
