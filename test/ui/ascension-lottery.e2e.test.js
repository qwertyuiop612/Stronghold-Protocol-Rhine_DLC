import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import { getRelic } from '../../shared/relics.js';

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

async function openLottery(page, reward) {
  await page.goto(`${base}/dev/game-mock.html?shot=1&phase=PREP`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.relic-icons__heading');
  assert.equal(await page.$('.ascension-lottery'), null);
  await page.evaluate((reward) => {
    globalThis.__LOTTERY_STOPS__ = [];
    const observer = new MutationObserver(() => {
      const reels = [...document.querySelectorAll('.lottery-reel')];
      if (!reels.length) return;
      const stopped = reels.flatMap((e, i) => e.classList.contains('is-stopped') ? [i] : []);
      const seen = globalThis.__LOTTERY_STOPS__;
      if (JSON.stringify(stopped) !== JSON.stringify(seen.at(-1))) seen.push(stopped);
      if (reward.kind === 'coins' && stopped.length === 1 && !globalThis.__LOTTERY_PUSHED__) {
        globalThis.__LOTTERY_PUSHED__ = true;
        globalThis.__MOCK__.mutate((s) => { s.priv.funds += 1; });
      }
      if (stopped.length === 3) observer.disconnect();
    });
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
    globalThis.__MOCK__.mutate((s) => {
      s.pub.round = 4;
      s.priv.ascensionLottery = { ...reward, round: 4, bondId: null };
    });
  }, reward);
  await page.waitForSelector('.ascension-lottery');
  mkdirSync('test/e2e/out', { recursive: true });
}

for (const reward of [
  { kind: 'coins', amount: 15, ids: [], text: '15 金币' },
  { kind: 'operators', amount: 0, ids: [], text: '炎盟约干员：惊蛰、夕' },
  { kind: 'relics', amount: 0, ids: ['relic_003', 'relic_004', 'relic_139'], text: '收藏品：橙味风暴、尖叫樱桃、黄金平原' },
  { kind: 'legendary', amount: 0, ids: ['relic_006'], text: '稀有藏品：皮特水果什锦' },
]) test(`fourth-round ${reward.kind} lottery result renders and dismisses without reappearing on private updates`, {
  skip: !ENABLED && 'set SP_E2E=1 and provide Chrome', timeout: 60000,
}, async () => {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    await page.setViewport(reward.kind === 'legendary' ? { width: 390, height: 844, isMobile: true } : { width: 1440, height: 900 });
    await openLottery(page, reward);
    assert.equal((await page.$$('.lottery-reel')).length, 3);
    assert.equal(await page.$('.lottery-result__win'), null, 'result waits for the reels');
    assert.equal(await page.$('.ascension-lottery .relic-card'), null, 'details do not spoil the reveal');
    if (reward.kind === 'coins') {
      await page.screenshot({ path: 'test/e2e/out/lottery-spinning.png' });
    }
    await page.waitForSelector('.ascension-lottery.is-revealed');
    assert.deepEqual(await page.evaluate(() => globalThis.__LOTTERY_STOPS__), [[], [0], [0, 1], [0, 1, 2]],
      'reels stop left to right and private pushes do not restart them');
    const text = await page.$eval('.ascension-lottery', (e) => e.textContent);
    const collection = reward.kind === 'relics' || reward.kind === 'legendary';
    const expected = collection ? `本次抽中：${reward.ids.map((id) => getRelic(id).name).join('、')}` : `本次抽中：${reward.text}`;
    assert.equal(await page.$eval('.lottery-result__win', (e) => e.textContent.trim()), expected);
    assert.equal(await page.$eval('.ascension-lottery .modal__title', (e) => e.textContent), '超限补给');
    assert.equal(await page.$('.ascension-lottery .lottery-pool'), null);
    assert.equal(await page.$('.ascension-lottery .relic-panel__rule'), null);
    assert.equal(await page.$('.ascension-lottery .relic-panel__note'), null);
    assert.equal(text.includes('25%'), false, 'probability cards and explanations are removed');
    assert.deepEqual(await page.$$eval('.lottery-reel', (els) => els.map((e) => {
      const frame = e.getBoundingClientRect();
      const center = [...e.querySelectorAll('.lottery-symbol')].find((s) => {
        const rect = s.getBoundingClientRect();
        return Math.abs((rect.top + rect.bottom - frame.top - frame.bottom) / 2) < 2;
      });
      return { kind: e.dataset.prize, symbol: center?.classList.contains(`lottery-prize--${e.dataset.prize}`),
        relicId: center?.dataset.relicId || null, name: center?.querySelector('.lottery-symbol__name')?.textContent || null,
        image: !!center?.querySelector('.lottery-symbol__art img') };
    })), Array.from({ length: 3 }, (_, i) => {
      const id = reward.kind === 'legendary' ? reward.ids[0] : reward.kind === 'relics' ? reward.ids[i] : null;
      return { kind: reward.kind, symbol: true, relicId: id, name: id ? getRelic(id).name : null, image: !!id };
    }), 'visible reel art and names exactly match awarded IDs, with only one repeated legendary');
    assert.equal(await page.$('.ascension-lottery .relic-list'), null, 'no duplicated collection details below the result');
    const box = await page.$eval('.ascension-lottery', (e) => {
      const r = e.getBoundingClientRect();
      return { left: r.left, right: r.right, viewport: innerWidth, overflow: e.scrollWidth > e.clientWidth + 1 };
    });
    assert.ok(box.left >= 0 && box.right <= box.viewport + 1, 'fits viewport');
    assert.equal(box.overflow, false, 'no horizontal overflow');
    await page.screenshot({ path: `test/e2e/out/lottery-${reward.kind}.png` });
    await page.click('.ascension-lottery .modal__actions button');
    await page.waitForFunction(() => !document.querySelector('.ascension-lottery'));
    await page.evaluate(() => globalThis.__MOCK__.mutate((s) => { s.priv.funds += 1; }));
    assert.equal(await page.$('.ascension-lottery'), null);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('lottery skips while spinning and the revealed result follows language changes', {
  skip: !ENABLED && 'set SP_E2E=1 and provide Chrome', timeout: 60000,
}, async () => {
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 844, height: 390 });
    await openLottery(page, { kind: 'relics', ids: ['relic_003', 'relic_004', 'relic_139'],
      text: '收藏品：橙味风暴、尖叫樱桃、黄金平原' });
    await page.click('.ascension-lottery .modal__actions button');
    await page.waitForSelector('.ascension-lottery.is-revealed');
    assert.equal((await page.$$('.lottery-reel.is-stopped')).length, 3);
    await page.evaluate(async () => {
      const { initLang, switchLang } = await import('/js/ui/lang.js');
      await initLang();
      await switchLang('en');
      globalThis.__MOCK__.mutate((s) => { s.priv.funds += 1; });
    });
    await page.waitForFunction(() => document.querySelector('.lottery-result__win')?.textContent.includes('Reward:'));
    assert.equal(await page.$eval('.lottery-result__win', (e) => e.textContent.trim()), 'Reward: Orange Storm, Screaming Cherry, Golden Plains');
    assert.equal(await page.$eval('.ascension-lottery .modal__title', (e) => e.textContent), 'Ascension Supplies');
    await page.click('.ascension-lottery .modal__actions button');
    await page.waitForFunction(() => !document.querySelector('.ascension-lottery'));
    await page.evaluate(() => globalThis.__MOCK__.mutate((s) => { s.pub.round = 5; }));
    assert.equal(await page.$('.ascension-lottery'), null);
  } finally { await page.close(); }
});

for (const duringSpin of [false, true]) test(`reduced motion ${duringSpin ? 'enabled while spinning' : 'at entry'} reveals immediately`, {
  skip: !ENABLED && 'set SP_E2E=1 and provide Chrome', timeout: 60000,
}, async () => {
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 390, height: 844, isMobile: true });
    if (!duringSpin) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await openLottery(page, { kind: 'relics', ids: ['relic_003', 'relic_004', 'relic_139'], text: '收藏品：橙味风暴、尖叫樱桃、黄金平原' });
    if (duringSpin) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await page.waitForSelector('.ascension-lottery.is-revealed', { timeout: 1000 });
    assert.equal((await page.$$('.lottery-reel.is-stopped')).length, 3);
    assert.equal(await page.$('.ascension-lottery .relic-list'), null);
    assert.equal(await page.$eval('.lottery-result__win', (e) => e.textContent.trim()), '本次抽中：橙味风暴、尖叫樱桃、黄金平原');
    await page.screenshot({ path: `test/e2e/out/lottery-relics-phone-${duringSpin}.png` });
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('.ascension-lottery'));
  } finally { await page.close(); }
});
