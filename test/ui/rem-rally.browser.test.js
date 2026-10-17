import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import { startServer } from '../../server/index.js';

const chrome = process.env.CHROME_PATH || '/usr/bin/chromium';
const enabled = process.env.SP_E2E === '1' && existsSync(chrome);
test('rally component selects a legal tile, folds, moves, and becomes read-only during combat', { skip: !enabled }, async () => {
  const srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true });
  const puppeteer = (await import('puppeteer-core')).default;
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${srv.port}/healthz`);
    await page.evaluate(async () => {
      const { render, h } = await import('/vendor/preact.module.js');
      const { RemRally } = await import('/js/ui/remRally.js');
      document.body.innerHTML = '<main id="test" style="position:relative;width:800px;height:600px"></main>';
      const props = { enabled: true, editable: true, point: null,
        placeCtx: { deploy: { melee: new Set(['10,4']) } },
        view: { highlightTiles(tiles) { window.tiles = tiles; }, tileScreen(r,c) {
          return r === 10 && c === 4 ? { poly: [[400,400],[440,400],[440,440],[400,440]] } : null;
        } }, onSet(row,col) { window.selection = { row,col }; } };
      window.mountRally = editable => render(h(RemRally, { ...props, editable }), document.querySelector('#test'));
      window.mountRally(true);
    });
    // the picker button arms the mode; clicking the board picks the tile
    await page.waitForSelector('[data-testid="rem-rally-set"]');
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
    const box = (sel) => page.$eval(sel, e => { const r = e.getBoundingClientRect(); return { x:r.x, y:r.y, w:r.width, h:r.height }; });
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
