/* global rankingTest: readonly */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
const chrome = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

test('damage floating panel: live segmented rows, spectator owner switch, prep history, Escape and mobile bounds',
  { skip: process.env.SP_E2E !== '1' || !existsSync(chrome), timeout: 60000 }, async () => {
    const { startServer } = await import('../../server/index.js');
    const puppeteer = (await import('puppeteer-core')).default;
    const server = await startServer({ port: 0, host: '127.0.0.1', quiet: true });
    let browser;
    try {
      browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox'] });
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(`http://127.0.0.1:${server.port}/dev/game-mock.html`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('[aria-label="干员伤害排行"]');
      await page.evaluate(async () => {
        const { render, h } = await import('/vendor/preact.module.js');
        const { DamageRanking } = await import('/js/ui/damageRanking.js');
        const { net } = await import('/js/net.js');
        const root = document.createElement('div'); root.className = 'gm__corner';
        root.style.position = 'fixed'; root.style.zIndex = '200'; document.body.append(root);
        const props = { ownerId: 'a', ownerName: '我方', fieldId: 'shared', combat: true, prep: false, round: 1 };
        globalThis.rankingTest = {
          show: (patch) => { Object.assign(props, patch); render(h(DamageRanking, props), root); },
          emit: () => net._emit('b.snap', { fieldId: 'shared', damageRanking: [
            { id: 1, ownerId: 'a', name: '甲干员', total: 300, types: { phys: 100, arts: 200, true: 0, elemental: 0 } },
            { id: 2, ownerId: 'b', name: '乙干员', total: 500, types: { phys: 0, arts: 0, true: 500, elemental: 0 } },
          ] }), root,
        };
        rankingTest.show({});
      });
      await new Promise((r) => setTimeout(r, 150));
      await page.evaluate(() => { rankingTest.root.querySelector('button').click(); rankingTest.emit(); });
      await page.waitForFunction(() => rankingTest.root.textContent.includes('甲干员'));
      assert.equal(await page.evaluate(() => rankingTest.root.textContent.includes('乙干员')), false);
      const widths = await page.evaluate(() => [...rankingTest.root.querySelectorAll('.damage-rank__track span')].map((s) => parseFloat(s.style.width)));
      assert.ok(Math.abs(widths[0] - 100 / 3) < .01 && Math.abs(widths[1] - 200 / 3) < .01);
      await page.evaluate(() => rankingTest.show({ ownerId: 'b', ownerName: '队友' }));
      await page.waitForFunction(() => rankingTest.root.textContent.includes('乙干员') && !rankingTest.root.textContent.includes('甲干员'));
      await page.evaluate(() => rankingTest.show({ combat: false, prep: true, previous: [{ id: 2, name: '上一场干员', total: 20, types: { phys: 20 } }] }));
      await page.waitForFunction(() => rankingTest.root.textContent.includes('上一次战斗') && rankingTest.root.textContent.includes('上一场干员'));
      const beforeDrag = await page.evaluate(() => {
        const panel = rankingTest.root.querySelector('section').getBoundingClientRect();
        const header = rankingTest.root.querySelector('header').getBoundingClientRect();
        return { x: panel.x, y: panel.y, handleX: header.x + 30, handleY: header.y + 10 };
      });
      await page.mouse.move(beforeDrag.handleX, beforeDrag.handleY);
      await page.mouse.down();
      await page.mouse.move(beforeDrag.handleX + 160, beforeDrag.handleY - 80, { steps: 8 });
      await page.mouse.up();
      const afterDrag = await page.evaluate(() => {
        const r = rankingTest.root.querySelector('section').getBoundingClientRect(); return { x: r.x, y: r.y };
      });
      assert.ok(Math.abs(afterDrag.x - beforeDrag.x - 160) < 2 && Math.abs(afterDrag.y - beforeDrag.y + 80) < 2, 'header drag moves the panel');
      await page.evaluate(() => rankingTest.root.querySelector('button').click());
      await page.evaluate(() => rankingTest.root.querySelector('button').click());
      await page.waitForFunction((pos) => Math.abs(rankingTest.root.querySelector('section').getBoundingClientRect().x - pos.x) < 2, {}, afterDrag);
      await page.setViewport({ width: 390, height: 844 });
      await new Promise((r) => setTimeout(r, 150));
      const bounds = await page.evaluate(() => { const r = rankingTest.root.querySelector('section').getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; });
      assert.ok(bounds.left >= 0 && bounds.right <= 390 && bounds.top >= 0 && bounds.bottom <= 844);
      const header = await page.evaluate(() => { const r = rankingTest.root.querySelector('header').getBoundingClientRect(); return { x: r.x + 20, y: r.y + 10 }; });
      await page.mouse.move(header.x, header.y);
      await page.mouse.down();
      await page.mouse.move(-500, -500, { steps: 5 });
      await page.mouse.up();
      const clamped = await page.evaluate(() => { const r = rankingTest.root.querySelector('section').getBoundingClientRect(); return { x: r.x, y: r.y }; });
      assert.ok(clamped.x >= 0 && clamped.y >= 0, 'drag cannot move the panel outside the viewport');
      const touch = await page.createCDPSession();
      const handle = await page.evaluate(() => { const r = rankingTest.root.querySelector('header').getBoundingClientRect(); return { x: r.x + 20, y: r.y + 10 }; });
      await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: handle.x, y: handle.y }] });
      await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: handle.x + 20, y: handle.y + 60 }] });
      await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await new Promise((r) => setTimeout(r, 100));
      const touched = await page.evaluate(() => { const r = rankingTest.root.querySelector('section').getBoundingClientRect(); return { x: r.x, y: r.y }; });
      assert.ok(touched.x > clamped.x && touched.y > clamped.y, 'touch drag moves the panel');
      await touch.detach();
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !rankingTest.root.querySelector('section'));
      assert.deepEqual(errors, []);
    } finally { await browser?.close(); await server.close(); }
  });
