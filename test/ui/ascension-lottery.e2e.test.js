import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

const CHROME = process.env.CHROME_PATH || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome',
].find(existsSync);
const ENABLED = process.env.SP_E2E === '1' && CHROME;
let srv, browser, base;
before(async () => {
  if (!ENABLED) return;
  const { startServer } = await import('../../server/index.js');
  const puppeteer = (await import('puppeteer-core')).default;
  srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true });
  base = `http://127.0.0.1:${srv.port}`;
  browser = await puppeteer.launch({ executablePath: CHROME, headless: true, pipe: true, args: ['--no-sandbox', '--disable-gpu'] });
});
after(async () => { await browser?.close(); await srv?.close(); });

for (const reward of [
  { kind: 'coins', amount: 15, ids: [], text: '15 金币' },
  { kind: 'operators', amount: 0, ids: [], text: '炎盟约干员：惊蛰、夕' },
  { kind: 'relics', amount: 0, ids: ['relic_003', 'relic_158'], text: '收藏品：橙味风暴、时间机器' },
  { kind: 'heal', amount: 8, ids: [], text: '恢复 8 点目标生命值' },
]) test(`fourth-round ${reward.kind} lottery result renders and dismisses without reappearing on private updates`, {
  skip: !ENABLED && 'set SP_E2E=1 and provide Chrome', timeout: 60000,
}, async () => {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    await page.setViewport(reward.kind === 'heal' ? { width: 390, height: 844, isMobile: true } : { width: 1440, height: 900 });
    await page.goto(`${base}/dev/game-mock.html?shot=1&phase=PREP`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.relic-icons__heading');
    assert.equal(await page.$('.ascension-lottery'), null);
    await page.evaluate((reward) => globalThis.__MOCK__.mutate((s) => {
      s.pub.round = 4;
      s.priv.ascensionLottery = { ...reward, round: 4, bondId: null };
    }), reward);
    await page.waitForSelector('.ascension-lottery');
    const text = await page.$eval('.ascension-lottery', (e) => e.textContent);
    assert.ok(text.includes(reward.text)); assert.ok(text.includes('25%'));
    if (reward.kind === 'relics') assert.equal((await page.$$('.ascension-lottery .relic-card')).length, 2);
    const box = await page.$eval('.ascension-lottery', (e) => {
      const r = e.getBoundingClientRect(); return { left: r.left, right: r.right, viewport: innerWidth };
    });
    assert.ok(box.left >= 0 && box.right <= box.viewport + 1, 'fits viewport');
    await page.click('.ascension-lottery .modal__actions button');
    await page.waitForFunction(() => !document.querySelector('.ascension-lottery'));
    await page.evaluate(() => globalThis.__MOCK__.mutate((s) => { s.priv.funds += 1; }));
    assert.equal(await page.$('.ascension-lottery'), null);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});
