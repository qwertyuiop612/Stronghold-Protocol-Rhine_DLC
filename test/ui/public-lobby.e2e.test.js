// Real-browser public discovery, access settings, password entry and responsive controls.
// SP_E2E=1 CHROME_PATH=<Chrome executable> node --test test/ui/public-lobby.e2e.test.js
import { describe, test, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { startServer } from '../../server/index.js';
import { CHROME, hasChrome, OUT, waitForFunctionLong } from '../e2e/client.mjs';

describe('public lobby and room settings (real browser)', { skip: process.env.SP_E2E !== '1' || !hasChrome() }, () => {
  let browser;
  let srv;
  let contexts;
  let problems;
  before(async () => {
    const puppeteer = (await import('puppeteer-core')).default;
    browser = await puppeteer.launch({ executablePath: CHROME, headless: true,
      args: ['--no-sandbox', '--force-device-scale-factor=1', '--mute-audio', '--disable-background-timer-throttling'] });
    mkdirSync(OUT, { recursive: true });
  });
  after(async () => { await browser?.close(); });
  beforeEach(async () => {
    contexts = [];
    problems = [];
    srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true });
  });
  afterEach(async (context) => {
    if (!context.passed) {
      for (let i = 0; i < contexts.length; i++) {
        const pages = await contexts[i].pages();
        for (const page of pages) {
          await page.screenshot({ path: path.join(OUT, `public-lobby-failure-${i}.png`) });
          console.error('public lobby failure state', await page.evaluate(() => ({
            text: document.querySelector('.app-root')?.textContent.slice(-1000), route: document.querySelector('.screen')?.className,
            connection: globalThis.__SP__?.store.get().connection, room: globalThis.__SP__?.store.get().room,
          })));
        }
      }
    }
    for (const context of contexts) await context.close();
    await srv?.close();
    assert.deepEqual(problems, [], 'no browser script errors');
  });
  const open = async (name, query = '') => {
    const context = await browser.createBrowserContext();
    contexts.push(context);
    const page = await context.newPage();
    await page.setViewport({ width: 1600, height: 900 });
    page.on('pageerror', (e) => problems.push(e.message));
    await page.goto(`http://127.0.0.1:${srv.port}/${query}`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('input');
    await page.type('input', name);
    await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => /^(开始|Start)$/.test(b.textContent.trim()))?.click());
    await waitForFunctionLong(page, () => globalThis.__SP__?.store.get().connection.status === 'online');
    return page;
  };
  const create = async (page) => {
    await page.waitForSelector('.lobby-screen');
    await page.click('.create-box button');
    await page.waitForSelector('.room-screen');
    return page.evaluate(() => globalThis.__SP__.store.get().room.code);
  };
  const row = (code) => `[data-room-code="${code}"]`;
  const settings = async (page) => {
    await page.click('[data-testid="room-settings-open"]');
    await page.waitForSelector('.room-config');
  };
  const save = async (page) => {
    await page.click('.room-config .modal__actions .btn--primary');
    await waitForFunctionLong(page, () => !document.querySelector('.room-config'));
  };
  const enterPassword = async (page, password) => {
    await page.waitForSelector('.room-access input');
    await page.click('.room-access input');
    await page.keyboard.down('Control');
    await page.keyboard.press('KeyA');
    await page.keyboard.up('Control');
    await page.keyboard.press('Backspace');
    await page.type('.room-access input', password);
    await page.click('.room-access .btn--primary');
  };
  const screenshot = async (page, name) => {
    await waitForFunctionLong(page, () => {
      const modal = document.querySelector('.modal');
      const opaque = !modal || Number(getComputedStyle(modal).opacity) > .99 && Number(getComputedStyle(modal.firstElementChild).opacity) > .99;
      const settled = document.querySelector('.app-root').getAnimations({ subtree: true })
        .every((a) => a.effect.getTiming().iterations === Infinity || a.playState !== 'running');
      return opaque && settled;
    });
    return page.screenshot({ path: path.join(OUT, `public-lobby-${name}.png`) });
  };

  test('settings publish live, password join/spectate and private invitations work, cancellation preserves settings', { timeout: 120000 }, async () => {
    const host = await open('Host');
    const code = await create(host);
    const viewer = await open('Guest');
    await waitForFunctionLong(viewer, () => document.querySelector('.public-hall__empty')?.textContent.includes('暂无公开房间'));
    await settings(host);
    await host.click('[data-testid="room-public-toggle"]');
    await host.type('input[name="room-new-password"]', 'First password');
    await save(host);
    await viewer.waitForSelector(row(code));
    await viewer.$eval('.public-hall', (el) => el.scrollIntoView({ block: 'start' }));
    await waitForFunctionLong(viewer, () => document.querySelector('.lobby-body').scrollTop > 0);
    await screenshot(viewer, 'hall');
    assert.match(await viewer.$eval(row(code), (el) => el.textContent), /密码房间/);

    await viewer.click(`${row(code)} [data-testid="hall-join"]`);
    await enterPassword(viewer, 'wrong');
    await viewer.waitForSelector('.room-access [role="alert"]');
    assert.match(await viewer.$eval('.room-access [role="alert"]', (el) => el.textContent), /密码错误/);
    await enterPassword(viewer, 'First password');
    await viewer.waitForSelector('.room-screen');
    await settings(viewer);
    assert.equal(await viewer.$eval('[data-testid="room-public-toggle"]', (el) => el.disabled), true);
    assert.equal(await viewer.$('input[name="room-new-password"]'), null);
    await viewer.keyboard.press('Escape');
    await waitForFunctionLong(viewer, () => !document.querySelector('.room-config'));
    await viewer.click('.room-screen .topbar__left .btn--danger');
    await viewer.waitForSelector(row(code));
    await viewer.click(`${row(code)} [data-testid="hall-spectate"]`);
    await enterPassword(viewer, 'First password');
    await viewer.waitForSelector('.specbar__who.is-me');
    assert.equal(await viewer.evaluate(() => globalThis.__SP__.store.get().room.seats.some((s) => s?.playerId === globalThis.__SP__.store.get().me.playerId)), false);
    await viewer.reload({ waitUntil: 'networkidle0' });
    await viewer.waitForSelector('.specbar__who.is-me');
    assert.equal(await viewer.$('.room-access'), null, 'resume needs no password');

    await settings(host);
    await host.click('[data-testid="room-public-toggle"]');
    await host.keyboard.press('Escape');
    await waitForFunctionLong(host, () => !document.querySelector('.room-config'));
    assert.equal(await host.evaluate(() => globalThis.__SP__.store.get().room.isPublic), true);
    await settings(host);
    await host.click('[data-testid="room-public-toggle"]');
    await host.type('input[name="room-new-password"]', 'Second password');
    await save(host);
    const lobby = await open('Lobby');
    await waitForFunctionLong(lobby, () => document.querySelector('.public-hall__empty')?.textContent.includes('暂无公开房间'));
    await lobby.type('.join-row input', code);
    await lobby.click('.join-row .btn--amber');
    await enterPassword(lobby, 'First password');
    await lobby.waitForSelector('.room-access [role="alert"]');
    await lobby.keyboard.press('Escape');
    await waitForFunctionLong(lobby, () => !document.querySelector('.room-access'));
    assert.equal(await lobby.evaluate(() => globalThis.__SP__.store.get().room), null);
    const invited = await open('Invited', `?room=${code}`);
    await enterPassword(invited, 'Second password');
    await invited.waitForSelector('.room-screen');

    await settings(host);
    await host.click('[data-testid="room-password-clear"]');
    await save(host);
    await waitForFunctionLong(invited, () => !globalThis.__SP__.store.get().room.hasPassword);
    await lobby.click('.join-row .btn--amber');
    await lobby.waitForSelector('.room-screen');
    assert.equal(await lobby.$('.room-access'), null);
  });

  test('room controls and settings stay in view on desktop/tablet/landscape phone; English strings render', { timeout: 90000 }, async () => {
    const host = await open('Host');
    await create(host);
    for (const [width, height] of [[1920, 1080], [1366, 768], [1180, 820], [844, 390], [640, 360]]) {
      await host.setViewport({ width, height });
      await waitForFunctionLong(host, () => {
        const el = document.querySelector('[data-testid="room-settings-open"]');
        const r = el?.getBoundingClientRect();
        return r && r.x >= 0 && r.y >= 0 && r.right <= innerWidth && r.bottom <= innerHeight;
      });
      const actions = await host.$$eval('.room-bar__right button', (buttons) => buttons.map((b) => {
        const r = b.getBoundingClientRect();
        return { text: b.textContent.trim(), inside: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight,
          hittable: b.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)) };
      }));
      assert.ok(actions.every((x) => x.inside), `${width}×${height}: ${JSON.stringify(actions)}`);
      assert.ok(actions.every((x) => x.hittable), `unobstructed actions at ${width}×${height}: ${JSON.stringify(actions)}`);
      await screenshot(host, `room-${width}`);
      await settings(host);
      const box = await host.$eval('.room-config', (el) => {
        const r = el.getBoundingClientRect();
        return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight;
      });
      assert.equal(box, true, `settings inside ${width}×${height}`);
      await screenshot(host, `settings-${width}`);
      await host.keyboard.press('Escape');
      await waitForFunctionLong(host, () => !document.querySelector('.room-config'));
    }
    await host.setViewport({ width: 1920, height: 1080 });
    await host.click('.dpick [role="radio"]:last-child');
    await waitForFunctionLong(host, () => globalThis.__SP__.store.get().room.difficulty === 'ASCENSION');
    for (const [width, height] of [[1366, 768], [640, 360]]) {
      await host.setViewport({ width, height });
      await waitForFunctionLong(host, () => {
        const b = document.querySelector('[data-testid="room-settings-open"]');
        const r = b?.getBoundingClientRect();
        return r && r.right <= innerWidth && r.bottom <= innerHeight && b.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
      });
      await screenshot(host, `ascension-${width}`);
      await settings(host);
      await host.keyboard.press('Escape');
      await waitForFunctionLong(host, () => !document.querySelector('.room-config'));
    }
    const english = await open('English', '?lang=en');
    await english.waitForSelector('.lobby-screen');
    assert.match(await english.$eval('.public-hall', (el) => el.textContent), /Lobby|Loading public rooms/);
    await create(english);
    await settings(english);
    const text = await english.$eval('.room-config', (el) => el.textContent);
    assert.match(text, /Room Settings/);
    assert.match(text, /Public room/);
    assert.match(text, /Room password/);
  });

  test('full and running rooms remain in the hall; running rooms allow spectator entry', { timeout: 90000 }, async () => {
    const host = await open('Host');
    const code = await create(host);
    await settings(host);
    await host.click('[data-testid="room-public-toggle"]');
    await save(host);
    const viewer = await open('Viewer');
    await viewer.waitForSelector(row(code));
    for (let i = 1; i <= 3; i++) {
      await host.click('.seat--empty button');
      await waitForFunctionLong(host, (count) => globalThis.__SP__.store.get().room.seats.filter((s) => s?.isBot).length === count, {}, i);
    }
    await waitForFunctionLong(viewer, (code) => document.querySelector(`[data-room-code="${code}"] [data-testid="hall-join"]`)?.disabled, {}, code);
    assert.match(await viewer.$eval(row(code), (el) => el.textContent), /房间已满/);
    await host.click('.room-bar__right .btn--xl');
    await waitForFunctionLong(viewer, (code) => document.querySelector(`[data-room-code="${code}"]`)?.textContent.includes('模拟进行中'), {}, code);
    assert.equal(await viewer.$eval(`${row(code)} [data-testid="hall-join"]`, (el) => el.disabled), true);
    assert.equal(await viewer.$eval(`${row(code)} [data-testid="hall-spectate"]`, (el) => el.disabled), false);
    await viewer.click(`${row(code)} [data-testid="hall-spectate"]`);
    await waitForFunctionLong(viewer, () => globalThis.__SP__.store.get().room?.inMatch);
    assert.equal(await viewer.evaluate(() => globalThis.__SP__.store.get().match.private), null);
    assert.ok(await viewer.evaluate(() => globalThis.__SP__.store.get().room.spectators.some((s) => s.playerId === globalThis.__SP__.store.get().me.playerId)));
  });

  test('a disconnected lobby clears stale rooms and resubscribes with the current seats on reconnect', { timeout: 60000 }, async () => {
    const host = await open('Host');
    const code = await create(host);
    await settings(host);
    await host.click('[data-testid="room-public-toggle"]');
    await save(host);
    const viewer = await open('Viewer');
    await viewer.waitForSelector(row(code));
    await viewer.setOfflineMode(true);
    await viewer.evaluate(() => globalThis.__SP__.net.ws.close());
    await waitForFunctionLong(viewer, () => document.querySelector('.public-hall__empty')?.textContent.includes('正在连接服务器'));
    assert.equal(await viewer.$(row(code)), null, 'no stale join button while offline');
    await host.click('.seat--empty button');
    await waitForFunctionLong(host, () => globalThis.__SP__.store.get().room.seats.filter(Boolean).length === 2);
    await viewer.setOfflineMode(false);
    await viewer.waitForSelector(row(code));
    await waitForFunctionLong(viewer, (code) => document.querySelector(`[data-room-code="${code}"]`)?.textContent.includes('博士 2/4'), {}, code);
    assert.equal(await viewer.$eval(`${row(code)} [data-testid="hall-join"]`, (el) => el.disabled), false);
  });

  test('setup stays above the hall: small wheel gestures settle back, continued scrolling reaches the list', { timeout: 60000 }, async () => {
    const host = await open('Host');
    const code = await create(host);
    await settings(host);
    await host.click('[data-testid="room-public-toggle"]');
    await save(host);
    const viewer = await open('Viewer');
    await viewer.waitForSelector(row(code));
    const layout = await viewer.evaluate(() => {
      const body = document.querySelector('.lobby-body');
      const setup = document.querySelector('.lobby-setup');
      const hall = document.querySelector('.public-hall');
      return { scrollTop: body.scrollTop, snap: getComputedStyle(body).scrollSnapType,
        body: body.getBoundingClientRect().toJSON(), setup: setup.getBoundingClientRect().toJSON(),
        hall: hall.getBoundingClientRect().toJSON(), last: body.lastElementChild === hall };
    });
    assert.equal(layout.last, true);
    assert.equal(layout.scrollTop, 0);
    assert.equal(layout.snap.replace(' proximity', ''), 'y');
    assert.ok(layout.hall.top >= layout.body.bottom - 1, 'room list starts below the first view');
    await screenshot(viewer, 'setup-top');
    await viewer.mouse.move(layout.body.x + layout.body.width / 2, layout.body.y + layout.body.height / 2);
    await viewer.mouse.wheel({ deltaY: 40 });
    await new Promise((resolve) => setTimeout(resolve, 600));
    const shortScroll = await viewer.$eval('.lobby-body', (el) => el.scrollTop);
    // An oversized setup can settle just far enough to expose its last controls (native snap-area semantics).
    const setupOverflow = Math.max(0, layout.setup.bottom - layout.body.bottom);
    assert.ok(shortScroll <= Math.ceil(setupOverflow) + 1, `a short gesture stays in the setup: ${JSON.stringify({ shortScroll, layout })}`);
    for (let i = 0; i < 9; i++) {
      await viewer.mouse.wheel({ deltaY: layout.body.height * .18 });
      await new Promise((resolve) => setTimeout(resolve, 60));
    }
    await waitForFunctionLong(viewer, () => {
      const body = document.querySelector('.lobby-body').getBoundingClientRect();
      const hall = document.querySelector('.public-hall').getBoundingClientRect();
      return hall.top >= body.top - 1 && hall.top < body.top + 50;
    });
    await screenshot(viewer, 'bottom-rooms');
    assert.equal(await viewer.$eval(`${row(code)} [data-testid="hall-join"]`, (el) => el.disabled), false);

    await viewer.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await viewer.$eval('.lobby-body', (el) => { el.scrollTop = 0; });
    assert.equal(await viewer.$eval('.lobby-body', (el) => getComputedStyle(el).scrollSnapType), 'none');
    await viewer.mouse.wheel({ deltaY: 40 });
    await new Promise((resolve) => setTimeout(resolve, 600));
    assert.ok(await viewer.$eval('.lobby-body', (el) => el.scrollTop >= 30), 'reduced motion uses ordinary scrolling');

    await viewer.emulateMediaFeatures([]);
    await viewer.setViewport({ width: 844, height: 390, hasTouch: true, isMobile: true, isLandscape: true });
    await viewer.waitForSelector('.lobby-setup');
    await viewer.$eval('.lobby-body', (el) => { el.scrollTop = 0; });
    const touch = await viewer.createCDPSession();
    const swipe = async () => {
      await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 420, y: 320 }] });
      for (const y of [290, 240, 190, 140, 90]) {
        await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 420, y }] });
        await new Promise((resolve) => setTimeout(resolve, 30));
      }
      await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    };
    await swipe();
    await swipe();
    await waitForFunctionLong(viewer, () => {
      const body = document.querySelector('.lobby-body').getBoundingClientRect();
      const hall = document.querySelector('.public-hall').getBoundingClientRect();
      return hall.top >= body.top - 1 && hall.top < body.top + 50;
    });
    await screenshot(viewer, 'bottom-touch');
    await touch.detach();
  });
});
