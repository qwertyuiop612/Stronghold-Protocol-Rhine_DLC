import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client, hasChrome, startRealServer, sleep } from '../e2e/client.mjs';

const enabled = process.env.SP_E2E === '1' && hasChrome();
const currentLevel = (c) => c.page.$eval('.level-wheel', (el) => Number(el.getAttribute('aria-valuenow')));
const alignment = (c) => c.page.evaluate(() => {
  const row = document.querySelector('.level-wheel__row.is-selected');
  const center = (el) => { const r = el.getBoundingClientRect(); return (r.top + r.bottom) / 2; };
  return { row: center(row), wheel: center(document.querySelector('.level-wheel')),
    number: center(row.querySelector('.level-wheel__number')), effect: center(row.querySelector('.level-wheel__effect')) };
});
const assertCentered = async (c, label) => {
  const a = await alignment(c);
  assert.ok(['row', 'number', 'effect'].every(key => Math.abs(a[key] - a.wheel) < 1), `${label}: ${JSON.stringify(a)}`);
};
const layout = (c) => c.page.evaluate(() => {
  const rect = (selector) => {
    const el = document.querySelector(selector), r = el?.getBoundingClientRect();
    return r ? { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height } : null;
  };
  return { panel: rect('.level-picker'), effects: rect('.level-wheel__row.is-selected .level-wheel__effect'), wheel: rect('.level-wheel'), tips: rect('.tips'),
    mode: rect('.mode-card'),
    footer: rect('.room-bar'), create: rect('.create-box button'), body: rect('.lobby-body'),
    scroll: document.querySelector('.lobby-body')?.scrollHeight, w: innerWidth, h: innerHeight };
});

test('lobby shows tactical tips for ascension; room level controls render, synchronize and fit solo / co-op', { skip: !enabled, timeout: 120000 }, async () => {
  const srv = await startRealServer();
  const P = (await import('puppeteer-core')).default;
  const c = new Client(P, srv.base, 'levels', { prefix: 'difficulty-level' });
  const peer = new Client(P, srv.base, 'peer', { prefix: 'difficulty-level-peer' });
  try {
    await c.open();
    await c.page.evaluate(() => localStorage.setItem('sp.pref.lobby.difficultyLevel', '20'));
    await c.enter('超限测试');
    for (const [width, height] of [[1920, 1080], [1280, 720]]) {
      await c.page.setViewport({ width, height });
      for (const mode of ['独立模拟', '同盟模拟']) {
        await c.click('.mode-card', mode);
        await c.click('.diff-card', '终极模拟');
        await sleep(500); // Measure after the mode card's entrance animation.
        const standard = await layout(c);
        await c.click('.diff-card', '超限模拟');
        await c.page.waitForSelector('.tips');
        const ascension = await layout(c);
        assert.equal(ascension.panel, null, 'the lobby does not show a level picker');
        assert.equal(ascension.wheel, null, 'the lobby does not show a level wheel');
        assert.deepEqual(ascension.mode, standard.mode, 'ascension keeps the same mode-card layout');
        assert.deepEqual(ascension.tips, standard.tips, 'ascension keeps the same tactical-tips layout');
        assert.ok(ascension.tips.bottom <= ascension.h, `lobby tips fit ${JSON.stringify(ascension)}`);
        assert.ok(ascension.create.bottom <= ascension.h, `create button remains visible ${JSON.stringify(ascension)}`);
        const index = await c.page.$eval('.tips__idx', el => el.textContent);
        await c.click('.tips__nav[aria-label="下一条"]');
        await c.page.waitForFunction(previous => document.querySelector('.tips__idx').textContent !== previous, {}, index);
        await c.shot(`lobby-tips-${width}-${mode === '独立模拟' ? 'solo' : 'coop'}`);
      }
    }
    await c.page.setViewport({ width: 1920, height: 1080 });
    await c.click('.mode-card', '独立模拟');
    await c.click('.create-box button', '开始独立模拟');
    await c.page.waitForSelector('.room-screen.has-level');
    await c.page.waitForSelector('.level-wheel');
    assert.equal(await currentLevel(c), 20);
    assert.equal(await c.page.evaluate(() => globalThis.__SP__.store.get().room.difficultyLevel), 20, 'room creation preserves the stored level');
    await c.page.focus('.level-wheel'); await c.page.keyboard.press('Home');
    await sleep(300);
    assert.equal(await currentLevel(c), 0);
    assert.match(await c.page.$eval('.level-wheel__row.is-selected', el => el.textContent), /无附加协议.*第4回合开始时额外获得1次【超限补给】/s);
    await c.page.hover('.level-wheel__row.is-selected .level-rule__help');
    await c.page.waitForSelector('.tooltip.is-shown');
    assert.match(await c.page.$eval('.tooltip', el => el.textContent), /等概率.*15金币.*恢复8点目标生命值/s);
    await c.page.focus('.level-wheel'); await c.page.keyboard.press('End');
    await sleep(350);
    assert.equal(await currentLevel(c), 20);
    assert.match(await c.page.$eval('.level-wheel__row.is-selected', (el) => el.textContent), /终极协同/);
    assert.match(await c.page.$eval('.level-wheel__row.is-selected', (el) => el.textContent), /另一名干员/);
    assert.equal(await c.page.$eval('.level-effects__head', el => el.textContent.trim()), 'LEVEL 20');
    assert.equal(await c.page.$$eval('.level-wheel__row.is-active', (els) => els.length), 20);
    assert.equal(await c.page.$('.solo-brief .level-rule, .solo-brief .level-effects'), null, 'solo has no separate effect panel');
    assert.equal(await c.page.$eval('.level-wheel', (el) => el.scrollHeight > el.clientHeight), true);
    let r = await layout(c);
    assert.ok(await c.page.evaluate(() => {
      const row = document.querySelector('.level-wheel__row.is-selected');
      const number = row.querySelector('.level-wheel__number').getBoundingClientRect();
      const effect = row.querySelector('.level-wheel__effect').getBoundingClientRect();
      return effect.left >= number.right && Math.abs((effect.top + effect.bottom - number.top - number.bottom) / 2) < 1;
    }), 'the selected number and effect are aligned in the same row');
    assert.ok(r.panel.bottom < r.footer.y, `solo panel fits ${JSON.stringify(r)}`);
    await c.shot('solo-20');
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
    assert.equal(await c.page.$$eval('.level-wheel__row.is-active', (els) => els.length), 5);
    assert.match(await c.page.$eval('.level-wheel__row.is-selected', (el) => el.textContent), /首击屏障/);
    await c.page.hover('.level-wheel__row.is-selected .level-rule__help');
    await c.page.waitForFunction(() => document.querySelector('.tooltip.is-shown')?.textContent.includes('元素损伤累积不消耗该屏障'));
    assert.equal(await c.page.$$eval('.level-wheel__row', (els) => els.length), 21);
    const colors = await c.page.evaluate(() => {
      const rows = [...document.querySelectorAll('.level-wheel__row')];
      const color = (row) => getComputedStyle(row.querySelector('.level-wheel__number')).color;
      return { above: color(rows.find(r => !r.matches('.is-selected, .is-active'))),
        selected: color(rows.find(r => r.matches('.is-selected'))), active: color(rows.find(r => r.matches('.is-active'))) };
    });
    assert.notEqual(colors.above, colors.active, 'inactive and activated rows have different colors');
    assert.notEqual(colors.selected, colors.active, 'the current selection is brighter than earlier activated levels');
    await c.page.setViewport({ width: 1280, height: 720 }); await sleep(400);
    r = await layout(c);
    assert.ok(r.panel.bottom < r.footer.y, 'solo layout fits at 1280x720');
    await c.shot('solo-5-small');
    await c.page.setViewport({ width: 844, height: 390, isMobile: true, hasTouch: true });
    await c.page.waitForSelector('.solo-brief .level-picker--integrated'); await sleep(400);
    assert.equal(await currentLevel(c), 5, 'resizing preserves the selected level');
    assert.ok(await c.page.evaluate(() => {
      const row = document.querySelector('.level-wheel__row.is-selected').getBoundingClientRect();
      const wheel = document.querySelector('.level-wheel').getBoundingClientRect();
      const effect = document.querySelector('.is-selected .level-wheel__effect').getBoundingClientRect();
      return Math.abs((row.top + row.bottom - wheel.top - wheel.bottom) / 2) < 1 && effect.right <= wheel.right && effect.top >= row.top && effect.bottom <= row.bottom;
    }), 'the touch layout centers the selected row and fits its effect');
    await c.shot('solo-5-touch');
    await c.page.setViewport({ width: 1280, height: 720, isMobile: false, hasTouch: false });
    await c.page.waitForSelector('.room-bar'); await sleep(400);
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
    assert.equal(await c.page.$('.room-level .level-rule, .room-level .level-effects'), null, 'co-op also uses the combined wheel');
    await c.page.focus('.level-wheel'); await c.page.keyboard.press('Home'); await sleep(400);
    await c.page.keyboard.press('PageUp'); await sleep(400);
    assert.equal(await currentLevel(c), 5);
    assert.match(await c.page.$eval('.level-wheel__row.is-selected', el => el.textContent), /首击屏障/);
    await assertCentered(c, 'co-op number and effect are centered at 1280x720');
    await peer.open(); await peer.enter('超限队友');
    const code = await c.page.evaluate(() => globalThis.__SP__.store.get().room.code);
    await peer.page.type('.join-row input', code);
    await peer.click('.join-row button', '加入同盟');
    await peer.page.waitForSelector('.room-level .level-picker--integrated.is-readonly');
    await peer.page.waitForFunction(() => document.querySelector('.level-wheel')?.getAttribute('aria-valuenow') === '5');
    assert.equal(await peer.page.$eval('.level-wheel', el => el.getAttribute('aria-readonly')), 'true');
    assert.equal(await peer.page.$$eval('.level-wheel__row', els => els.every(el => el.disabled)), true, 'a teammate cannot change difficulty');
    await c.page.keyboard.press('PageUp');
    await peer.page.waitForFunction(() => document.querySelector('.level-wheel')?.getAttribute('aria-valuenow') === '10');
    assert.match(await peer.page.$eval('.level-wheel__row.is-selected', el => el.textContent), /甲壳轮转/);
    await c.page.keyboard.press('Home'); await sleep(400);
    await c.page.keyboard.press('PageUp'); await sleep(400);
    await c.shot('coop-20-small');
    await c.page.setViewport({ width: 1920, height: 1080 }); await sleep(400);
    r = await layout(c);
    assert.ok(r.panel.bottom <= r.footer.y && r.effects.right <= r.w, 'desktop co-op panel fits');
    await assertCentered(c, 'co-op number and effect are centered at 1920x1080');
    for (const key of ['Home', 'End', 'Home', 'PageUp', 'PageUp', 'PageUp', 'ArrowUp']) {
      await c.page.focus('.level-wheel'); await c.page.keyboard.press(key); await sleep(350);
      await assertCentered(c, `co-op remains centered after ${key}`);
    }
    assert.equal(await currentLevel(c), 16);
    assert.match(await c.page.$eval('.level-wheel__row.is-selected', el => el.textContent), /定点轰击/);
    await c.shot('coop-16-desktop');
    await c.page.setViewport({ width: 844, height: 390, isMobile: true, hasTouch: true });
    // Device detection may briefly remount the screen when switching from mouse to touch.
    await c.page.waitForSelector('.room-bar');
    await c.page.waitForSelector('.room-level .level-picker');
    await sleep(400);
    r = await layout(c);
    assert.ok(r.panel.bottom <= r.footer.y, `touch panel fits ${JSON.stringify(r)}`);
    assert.ok(r.effects.right <= r.w, 'effects remain visible on landscape touch screens');
    await assertCentered(c, 'co-op number and effect are centered on touch screens');
    assert.ok(await c.page.evaluate(() => {
      const row = document.querySelector('.level-wheel__row.is-selected').getBoundingClientRect();
      const effect = document.querySelector('.is-selected .level-wheel__effect').getBoundingClientRect();
      const panel = document.querySelector('.room-level').getBoundingClientRect();
      const avatarsFit = [...document.querySelectorAll('.seats .avatar')].every(el => {
        const avatar = el.getBoundingClientRect(), art = el.closest('.seat__art').getBoundingClientRect();
        return avatar.top >= art.top && avatar.bottom <= art.bottom;
      });
      return effect.top >= row.top && effect.bottom <= row.bottom && avatarsFit && [...document.querySelectorAll('.seat')].every(el => el.getBoundingClientRect().bottom <= panel.top + 1);
    }), 'the co-op effect fits its row and the panel does not overlap seats on touch screens');
    await c.shot('coop-touch');
    assert.deepEqual(c.problems.filter((s) => s.startsWith('pageerror:')), []);
  } catch (e) { await c.shot('failure'); throw e; }
  finally { await peer.close(); await c.close(); await srv.stop(); }
});
