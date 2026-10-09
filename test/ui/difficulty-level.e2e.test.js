import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client, hasChrome, startRealServer, sleep } from '../e2e/client.mjs';

const enabled = process.env.SP_E2E === '1' && hasChrome();
const currentLevel = (c) => c.page.$eval('.level-wheel', (el) => Number(el.getAttribute('aria-valuenow')));
const layout = (c) => c.page.evaluate(() => {
  const rect = (selector) => {
    const el = document.querySelector(selector), r = el?.getBoundingClientRect();
    return r ? { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height } : null;
  };
  return { panel: rect('.level-picker'), effects: rect('.level-effects'), wheel: rect('.level-wheel'),
    footer: rect('.room-bar'), create: rect('.create-box button'), body: rect('.lobby-body'),
    scroll: document.querySelector('.lobby-body')?.scrollHeight, w: innerWidth, h: innerHeight };
});

test('level wheel and effects render, scroll, synchronize and fit solo / co-op at desktop sizes', { skip: !enabled, timeout: 120000 }, async () => {
  const srv = await startRealServer();
  const P = (await import('puppeteer-core')).default;
  const c = new Client(P, srv.base, 'levels', { prefix: 'difficulty-level' });
  try {
    await c.open(); await c.enter('超限测试');
    await c.click('.mode-card', '独立模拟');
    await c.click('.diff-card', '超限模拟');
    await c.page.waitForSelector('.level-wheel');
    await c.page.focus('.level-wheel'); await c.page.keyboard.press('Home');
    await sleep(300);
    assert.equal(await currentLevel(c), 0);
    await c.page.focus('.level-wheel'); await c.page.keyboard.press('End');
    await sleep(350);
    assert.equal(await currentLevel(c), 20);
    assert.match(await c.page.$eval('.level-rule', (el) => el.textContent), /终极协同/);
    assert.match(await c.page.$eval('.level-rule', (el) => el.textContent), /另一名干员/);
    assert.equal(await c.page.$$eval('.level-effects__rule.is-active', (els) => els.length), 20);
    assert.equal(await c.page.$eval('.level-effects__list', (el) => el.scrollHeight > el.clientHeight), true);
    await c.page.$eval('.level-effects__list', (el) => { el.scrollTop = el.scrollHeight; });
    assert.equal(await c.page.$eval('.level-effects__list', (el) => el.scrollTop > 0), true);
    let r = await layout(c);
    assert.ok(r.effects.x >= r.wheel.right, 'effects are right of the numerical wheel');
    assert.ok(r.panel.bottom <= r.body.bottom + 2, `lobby panel fits ${JSON.stringify(r)}`);
    assert.ok(r.create.bottom <= r.h, `create button remains visible ${JSON.stringify(r)}`);
    await c.shot('lobby-20');
    await c.page.keyboard.press('Home'); await sleep(350);
    const wheel = await c.page.$('.level-wheel');
    const box = await wheel.boundingBox();
    await c.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await c.page.mouse.wheel({ deltaY: -350 });
    await c.page.waitForFunction(() => Number(document.querySelector('.level-wheel').getAttribute('aria-valuenow')) > 0);
    await sleep(500);
    assert.ok(await currentLevel(c) > 0, 'real mouse wheel changes the selected value');
    await c.page.focus('.level-wheel'); await c.page.keyboard.press('Home'); await sleep(350);
    await c.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await c.page.mouse.down();
    await c.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 90, { steps: 8 });
    await c.page.mouse.up(); await sleep(400);
    assert.ok(await currentLevel(c) > 0, 'mouse dragging also changes the selected value');
    await c.page.focus('.level-wheel'); await c.page.keyboard.press('End'); await sleep(350);
    await c.click('.create-box button', '开始独立模拟');
    await c.page.waitForSelector('.room-screen.has-level'); await sleep(300);
    assert.equal(await currentLevel(c), 20);
    assert.equal(await c.page.evaluate(() => globalThis.__SP__.store.get().room.difficultyLevel), 20);
    r = await layout(c);
    assert.ok(r.panel.bottom < r.footer.y, `solo panel fits ${JSON.stringify(r)}`);
    assert.ok(await c.page.evaluate(() => document.querySelector('.level-picker').getBoundingClientRect().bottom <= document.querySelector('.solo-brief').getBoundingClientRect().bottom - 10), 'level panel stays inside briefing card');
    await c.shot('solo-20');
    await c.page.focus('.level-wheel'); await c.page.keyboard.press('Home'); await sleep(500);
    assert.equal(await c.page.evaluate(() => globalThis.__SP__.store.get().room.difficultyLevel), 0);
    await c.page.keyboard.press('PageUp'); await sleep(500);
    assert.equal(await currentLevel(c), 5);
    assert.equal(await c.page.$$eval('.level-effects__rule.is-active', (els) => els.length), 5);
    assert.match(await c.page.$eval('.level-rule', (el) => el.textContent), /首击屏障/);
    await c.click('.level-effects__tabs button', '全部协议');
    assert.equal(await c.page.$$eval('.level-effects__rule', (els) => els.length), 20);
    assert.equal(await c.page.$$eval('.level-effects__rule:not(.is-active)', (els) => els.length), 15);
    await c.click('.level-effects__tabs button', '已启用');
    await c.page.setViewport({ width: 1280, height: 720 }); await sleep(400);
    r = await layout(c);
    assert.ok(r.panel.bottom < r.footer.y, 'solo layout fits at 1280x720');
    await c.shot('solo-5-small');
    await c.click('.topbar button[aria-label="离开同盟"]');
    await c.page.waitForSelector('.lobby-screen');
    await c.click('.mode-card', '同盟模拟');
    await c.click('.create-box button', '创建同盟');
    await c.page.waitForSelector('.room-screen.has-level'); await sleep(300);
    r = await layout(c);
    assert.ok(r.panel.bottom <= r.footer.y, `co-op panel fits ${JSON.stringify(r)}`);
    const overlaps = await c.page.evaluate(() => {
      const panel = document.querySelector('.room-level').getBoundingClientRect();
      return [...document.querySelectorAll('.seat')].some((el) => el.getBoundingClientRect().bottom > panel.y + 1);
    });
    assert.equal(overlaps, false, 'seat cards do not overlap the level panel');
    await c.shot('coop-20-small');
    await c.page.setViewport({ width: 844, height: 390, isMobile: true, hasTouch: true }); await sleep(400);
    r = await layout(c);
    assert.ok(r.panel.bottom <= r.footer.y, `touch panel fits ${JSON.stringify(r)}`);
    assert.ok(r.effects.right <= r.w, 'effects remain visible on landscape touch screens');
    await c.shot('coop-touch');
    assert.deepEqual(c.problems.filter((s) => s.startsWith('pageerror:')), []);
  } catch (e) { await c.shot('failure'); throw e; }
  finally { await c.close(); await srv.stop(); }
});
