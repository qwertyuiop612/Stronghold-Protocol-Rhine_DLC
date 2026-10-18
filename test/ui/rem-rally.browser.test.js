import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import { startServer } from '../../server/index.js';

const chrome = process.env.CHROME_PATH || '/usr/bin/chromium';
const enabled = process.env.SP_E2E === '1' && existsSync(chrome);
test('rally component opens folded beside the exit button, selects a legal tile, folds, moves, survives a view switch, and becomes read-only during combat', { skip: !enabled }, async () => {
  const srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true });
  const puppeteer = (await import('puppeteer-core')).default;
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${srv.port}/healthz`);
    await page.evaluate(async () => {
      const { render } = await import('/vendor/preact.module.js');
      const { RemRally } = await import('/js/ui/remRally.js');
      document.body.innerHTML = '<main id="test" style="position:relative;width:800px;height:600px"></main>';
      const props = { enabled: true, editable: true, point: null,
        placeCtx: { deploy: { melee: new Set(['10,4']) } },
        view: { highlightTiles(tiles) { window.tiles = tiles; }, tileScreen(r,c) {
          return r === 10 && c === 4 ? { poly: [[400,400],[440,400],[440,440],[400,440]] } : null;
        } }, onSet(row,col) { window.selection = { row,col }; } };
      // the game's HUD row: the exit button and the rally panel share one positioned box, and the screen drops the
      // panel (null) while the player watches another field — the same remount this test reproduces
      const { html } = await import('/js/ui/components.js');
      window.mountRally = (editable, show = true) => render(html`<div class="gm__hud" style="position:absolute;inset:0">
        <button class="gtop__exit" style="position:absolute;left:12px;top:6px;width:40px;height:40px">exit</button>
        ${show ? html`<${RemRally} ...${props} editable=${editable} />` : null}
      </div>`, document.querySelector('#test'));
      window.mountRally(true);
    });
    const box = (sel) => page.$eval(sel, e => { const r = e.getBoundingClientRect(); return { x:r.x, y:r.y, w:r.width, h:r.height }; });

    // out of the box: folded, and parked right of the exit button in the top-left corner
    await page.waitForSelector('[data-testid="rem-rally-drag"]');
    assert.equal(await page.$('[data-testid="rem-rally-body"]'), null, 'the panel opens folded');
    const hud = await box('.gm__hud'), exit = await box('.gtop__exit'), opened = await box('.rem-rally');
    assert.ok(Math.abs(opened.x - hud.x - (exit.x + exit.w - hud.x + 8)) <= 1.5, `the panel sits right of the exit button: ${opened.x} / ${exit.x + exit.w + 8}`);
    assert.ok(Math.abs(opened.y - exit.y) <= 1.5, `the panel tops out with the exit button: ${opened.y} / ${exit.y}`);
    assert.ok(opened.w < 250, `the folded panel is a pill, not the full width: ${opened.w}`);

    // unfolding brings the body back
    await page.click('[data-testid="rem-rally-collapse"]');
    await page.waitForSelector('[data-testid="rem-rally-body"]');

    // the picker button arms the mode; clicking the board picks the tile
    await page.click('[data-testid="rem-rally-set"]');
    await page.waitForFunction('window.tiles?.length === 1');
    await page.mouse.click(420,420);
    await page.waitForFunction('window.selection?.row === 10');
    assert.deepEqual(await page.evaluate(() => window.selection), { row:10, col:4 });

    // the collapse toggle folds the body away and brings it back (the 0.2.6-fork panel parity)
    await page.click('[data-testid="rem-rally-collapse"]');
    await page.waitForFunction('!document.querySelector(\'[data-testid="rem-rally-body"]\')');
    await page.click('[data-testid="rem-rally-collapse"]');
    await page.waitForSelector('[data-testid="rem-rally-body"]');

    // the header drags the panel; the new position is clamped inside the parent box
    const before = await box('.rem-rally');
    const handle = await page.$eval('[data-testid="rem-rally-drag"]', e => {
      const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    await page.mouse.move(handle.x, handle.y);
    await page.mouse.down();
    await page.mouse.move(handle.x + 80, handle.y + 60, { steps: 6 });
    await page.mouse.up();
    const after = await box('.rem-rally');
    assert.ok(after.x > before.x + 40, `panel moved right: ${before.x} -> ${after.x}`);
    assert.ok(after.y > before.y + 30, `panel moved down: ${before.y} -> ${after.y}`);

    // arrow keys nudge the focused header without a mouse
    await page.focus('[data-testid="rem-rally-drag"]');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    const nudged = await box('.rem-rally');
    assert.ok(nudged.x < after.x - 20, `keyboard moved the panel left: ${after.x} -> ${nudged.x}`);

    // a view switch (the panel unmounts while another field is on screen) keeps both the placement and the fold
    await page.evaluate(() => window.mountRally(true, false));
    assert.equal(await page.$('.rem-rally'), null, 'the panel leaves with the own field');
    await page.evaluate(() => window.mountRally(true, true));
    await page.waitForSelector('[data-testid="rem-rally-drag"]');
    const back = await box('.rem-rally');
    assert.ok(Math.abs(back.x - nudged.x) <= 1.5 && Math.abs(back.y - nudged.y) <= 1.5,
      `the panel returns where the player left it: ${nudged.x},${nudged.y} -> ${back.x},${back.y}`);
    assert.ok(await page.$('[data-testid="rem-rally-body"]'), 'the unfold survives the view switch');

    // in combat the picker is locked, and the fold/move affordances stay usable
    await page.evaluate(() => window.mountRally(false));
    assert.equal(await page.$eval('[data-testid="rem-rally-set"]', e => e.disabled), true);
    if (existsSync('public/assets/bond/rem.png')) {
      assert.equal(await page.$eval('.rem-rally img', async e => { await e.decode(); return e.naturalWidth > 0; }), true);
      mkdirSync('test/e2e/out', { recursive:true });
      await page.screenshot({ path:'test/e2e/out/rem-rally-original-icon.png' });
    }
  } finally { await browser.close(); await srv.close(); }
});
