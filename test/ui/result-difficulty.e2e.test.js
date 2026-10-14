// Opt in: SP_E2E=1 (CHROME_PATH points to the system Chrome).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client, hasChrome, startRealServer } from '../e2e/client.mjs';

const enabled = process.env.SP_E2E === '1' && hasChrome();

test('settlement displays the ascension level from m.result, with a public-state fallback', { skip: !enabled, timeout: 120000 }, async () => {
  const srv = await startRealServer();
  const P = (await import('puppeteer-core')).default;
  const c = new Client(P, srv.base, 'result-difficulty');
  try {
    await c.open();
    await c.page.goto(`${srv.base}/dev/game-mock.html?shot=1&phase=RESULT`, { waitUntil: 'domcontentloaded' });
    await c.page.waitForSelector('.result__hero .dtag');
    for (const [level, expected] of [[12, 12], [20, 20], [0, 0], [null, 7]]) {
      await c.page.evaluate(async (value) => {
        const { store } = await import('/js/store.js');
        const match = store.get().match;
        store.patch('match', {
          public: { ...match.public, difficulty: 'ASCENSION', difficultyLevel: 7 },
          result: { ...match.result, difficulty: 'ASCENSION', difficultyLevel: value },
        });
      }, level);
      await c.page.waitForFunction((value) => document.querySelector('.result__hero .dtag')?.textContent.includes(`超限模拟 · ${value}`), {}, expected);
      assert.match(await c.page.$eval('.result__hero .dtag', el => el.textContent), new RegExp(`超限模拟 · ${expected}(?:\\s|$)`));
    }
    assert.deepEqual(c.problems.filter(s => s.startsWith('pageerror:')), []);
  } finally { await c.close(); await srv.stop(); }
});
