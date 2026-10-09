// Actual collection UI, including scroll reachability, spectator ownership and settlement retention.
// Opt in: SP_E2E=1 node --test test/ui/relics.e2e.test.js (CHROME_PATH optionally overrides the system browser).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const CHROME = process.env.CHROME_PATH || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
].find(existsSync);
const ENABLED = process.env.SP_E2E === '1' && CHROME;
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

async function closed(page) {
  await page.waitForFunction(() => !document.querySelector('.relic-panel'), { timeout: 2000 });
}

test('时光之末：自己的列表按钮复活队友、显示已使用，观战列表保持只读', {
  skip: !ENABLED && 'set SP_E2E=1 and provide system Chrome', timeout: 60000,
}, async () => {
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(`${base}/dev/game-mock.html?shot=1&phase=PREP`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.relic-icons__heading');
    const targetId = await page.evaluate(() => {
      let targetId;
      globalThis.__MOCK__.mutate((s) => {
        s.priv.relics = [{ id: 'relic_233', round: 7 }];
        s.priv.relicChessQueue = ['test_1', 'test_2'];
        const target = s.pub.players.find((p) => p.playerId !== s.priv.playerId);
        targetId = target.playerId;
        target.alive = false; target.canRevive = true; target.lp = 0; target.name = '待救队友';
      });
      return targetId;
    });
    await page.click('.relic-icons__heading');
    await page.waitForSelector('.relic-card__revive button');
    assert.equal(await page.$eval('.relic-card__revive button', (e) => e.disabled), false);
    assert.match(await page.$eval('.relic-panel', (e) => e.textContent), /2 名等待整备区空位/);
    await page.waitForSelector('.pbanner--overlay', { hidden: true });
    await page.screenshot({ path: `${OUT}/relic-time-end-revive.png` });
    await page.click('.relic-card__revive button');
    await page.waitForFunction(() => document.querySelector('.relic-card__used')?.textContent.includes('已使用'));
    const result = await page.evaluate((id) => ({
      requests: globalThis.__MOCK__.S().requests.filter(([t]) => t === 'g.relicRevive'),
      target: globalThis.__MOCK__.S().pub.players.find((p) => p.playerId === id),
    }), targetId);
    assert.deepEqual(result.requests, [['g.relicRevive', { relicId: 'relic_233', playerId: targetId }]]);
    assert.equal(result.target.alive, true); assert.equal(result.target.lp, 11);
    assert.equal(await page.$('.relic-card__revive button'), null);
    await page.keyboard.press('Escape'); await closed(page);
    await page.evaluate((id) => {
      globalThis.__MOCK__.mutate((s) => { s.pub.players.find((p) => p.playerId === id).relics = [{ id: 'relic_233', round: 7 }]; });
    }, targetId);
    await page.click('.team__row:not(.is-self) .team__btn');
    await page.waitForSelector('.gm__watching');
    await page.click('.relic-icons__heading');
    await page.waitForSelector('.relic-card__used');
    assert.match(await page.$eval('.relic-card__used', (e) => e.textContent), /未使用/);
    assert.equal(await page.$('.relic-card__revive button'), null);
    await page.keyboard.press('Escape'); await closed(page);
    // 被淘汰的本人在当前整备阶段获救，自动回到自己的阵地。
    await page.evaluate(() => globalThis.__MOCK__.mutate((s) => {
      s.priv.alive = false;
      s.pub.players.find((p) => p.playerId === s.priv.playerId).alive = false;
    }));
    await page.waitForSelector('.gm__dead');
    await page.evaluate(() => globalThis.__MOCK__.mutate((s) => {
      s.priv.alive = true; s.priv.lp = 11;
      s.pub.players.find((p) => p.playerId === s.priv.playerId).alive = true;
    }));
    await page.waitForSelector('.gm__watching', { hidden: true });
    await page.waitForSelector('.gm__dead', { hidden: true });
  } finally { await page.close(); }
});

for (const item of [
  { id: 'relic_233', name: '“时光之末”', tier: '史诗', phrases: ['11 点', '4 名', '死亡时自动复活', '保留原有干员'], shot: 'time-end' },
  { id: 'relic_158', name: '时间机器', tier: '普通', phrases: ['目标生命值', '等量增加', '仅生效一场'], shot: 'time-machine' },
  { id: 'relic_159', name: '木棍', tier: '精良', phrases: ['2 金币'], hiddenPhrases: ['数字', '■', '仅影响显示'], shot: 'stick' },
  { id: 'relic_156', name: '解压玩具', phrases: ['向下取整', '首领波次不生效', '10%', '未持有者各保留 1 个', '触发时替代减半效果'], shot: 'toy' },
  { id: 'relic_157', name: '鸭梨手机', phrases: ['全队累计难度降低 2 级', '最低为 0', '下一场战斗', '多名玩家领取可叠加'], shot: 'phone' },
]) test(`${item.name}：三选一名称、稀有度、说明及透明图片可用，领取后收藏栏展示`, {
  skip: !ENABLED && 'set SP_E2E=1 and provide system Chrome', timeout: 60000,
}, async () => {
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1920, height: 1080 });
    await page.goto(`${base}/dev/game-mock.html?shot=1&phase=PREP`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.relic-icons__heading');
    await page.evaluate((id) => {
      globalThis.__MOCK__.setPhase('SETTLE');
      globalThis.__MOCK__.mutate((s) => {
        s.priv.relics = [];
        s.priv.relicOffer = { id: 'ui:custom', round: 4, reason: 'perfect', options: [id, 'relic_154', 'relic_155'] };
        s.pub.relicChoosing = true; s.pub.deadline = 0;
      });
    }, item.id);
    await page.waitForSelector('.relic-choice__card');
    const text = await page.$eval('.relic-choice__card', (e) => e.textContent);
    for (const phrase of [item.name, item.tier || '稀有', ...item.phrases]) assert.ok(text.includes(phrase), phrase);
    const label = await page.$eval('.relic-choice__card', (e) => e.getAttribute('aria-label'));
    for (const phrase of item.hiddenPhrases || []) {
      assert.ok(!text.includes(phrase), `领取前正文不透露：${phrase}`);
      assert.ok(!label.includes(phrase), `领取前无障碍标签不透露：${phrase}`);
    }
    await page.waitForFunction(() => {
      const img = document.querySelector('.relic-choice__card img');
      return img?.complete && img.naturalWidth > 0;
    });
    const alpha = await page.$eval('.relic-choice__card img', (img) => {
      const canvas = document.createElement('canvas'); canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let transparent = false, opaque = false;
      for (let i = 3; i < data.length; i += 4) { if (!data[i]) transparent = true; if (data[i] === 255) opaque = true; }
      return { transparent, opaque };
    });
    assert.deepEqual(alpha, { transparent: true, opaque: true });
    await page.screenshot({ path: `${OUT}/relic-${item.shot}-choice.png` });
    await page.click('.relic-choice__card');
    await page.waitForFunction(() => !document.querySelector('.relic-choice'));
    assert.equal(await page.evaluate(() => globalThis.__MOCK__.S().priv.relics.at(-1).id), item.id);
    await page.waitForSelector('.effect--relic img');
    await page.waitForFunction(() => document.querySelector('.effect--relic img')?.naturalWidth > 0);
    if (item.hiddenPhrases) {
      const ownedLabel = await page.$eval('.effect--relic', (e) => e.getAttribute('aria-label'));
      for (const phrase of item.hiddenPhrases) assert.ok(ownedLabel.includes(phrase), `领取后显示完整效果：${phrase}`);
      await page.click('.relic-icons__heading');
      await page.waitForSelector('.relic-card__desc');
      const ownedDesc = await page.$eval('.relic-card__desc', (e) => e.textContent);
      for (const phrase of [...item.phrases, ...item.hiddenPhrases]) assert.ok(ownedDesc.includes(phrase), phrase);
    }
  } finally { await page.close(); }
});

async function closeWithEscape(page) {
  // The declarative Modal renders before its useEffect installs the keyboard listener. Its documented
  // autofocus runs 30 ms AFTER installation: wait for that observable lifecycle signal, not a sleep or
  // a longer close timeout. The entry click focused the entry, so this focus change can only come from Modal.
  await page.waitForFunction(() => {
    const panel = document.querySelector('.relic-panel');
    return panel && document.activeElement === panel.querySelector('.modal__actions button');
  }, { timeout: 2000 });
  await page.keyboard.press('Escape');
  await closed(page);
}

test('phone/desktop: icons wrap, tooltips stay clear of three-choice dialogs, and chosen rewards survive observation and settlement', {
  skip: !ENABLED && 'set SP_E2E=1 and provide system Chrome', timeout: 120000,
}, async () => {
  for (const [width, height] of [[640, 360], [1920, 1080]]) {
    const page = await browser.newPage();
    try {
      await page.setViewport({ width, height, hasTouch: width < 768, isMobile: width < 768 });
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      // External asset mirrors are optional for this DOM/UI check and must not hold navigation open.
      await page.setRequestInterception(true);
      page.on('request', (req) => req.url().startsWith(base) || req.url().startsWith('data:') ? req.continue() : req.abort());
      await page.goto(`${base}/dev/game-mock.html?shot=1&phase=PREP`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.relic-icons__heading');
      assert.match(await page.$eval('.relic-icons__heading', (el) => el.textContent), /RELICS\s*0/);
      assert.equal(await page.$('.relic-entry'), null);
      const entryPosition = await page.$eval('.relic-icons__heading', (el) => {
        const r = el.getBoundingClientRect();
        return { reachable: el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)), left: r.left, right: r.right, top: r.top, bottom: r.bottom };
      });
      assert.ok(entryPosition.reachable, `${width}: entry is covered`);
      assert.ok(entryPosition.left >= 0 && entryPosition.right <= width && entryPosition.top >= 0 && entryPosition.bottom <= height);
      assert.ok(entryPosition.left > width * .75, `${width}: collection is not on the right`);
      await page.click('.relic-icons__heading');
      await page.waitForSelector('.relic-panel');
      assert.match(await page.$eval('.relic-panel', (el) => el.textContent), /尚未获得收藏品/);
      // The close button works immediately, even before the Modal's after-paint effect has run.
      await page.click('.relic-panel .modal__actions button');
      await closed(page);
      // Separately exercise actual Escape handling after the reusable Modal becomes keyboard-ready.
      await page.click('.relic-icons__heading');
      await page.waitForSelector('.relic-panel');
      await closeWithEscape(page);
      // Two icons: inspect the actual requested frame, source art and shared tooltip before testing overflow.
      const first = await page.evaluate(async () => {
        const { RELICS } = await import('/shared/relics.js');
        globalThis.__MOCK__.mutate((s) => { s.priv.relics = RELICS.slice(0, 2).map((r, i) => ({ id: r.id, round: i + 1 })); });
        return RELICS[0];
      });
      await page.waitForFunction(() => document.querySelectorAll('.effect--relic').length === 2);
      const frames = await page.evaluate(() => {
        const icon = document.querySelector('.effect--relic').getBoundingClientRect();
        const effect = document.querySelector('.gm__effect-base .effect').getBoundingClientRect();
        return { same: icon.width === effect.width && icon.height === effect.height, x: icon.x, y: icon.y, width: icon.width, height: icon.height };
      });
      assert.ok(frames.same, `${width}: collectible frame differs from active effects`);
      await page.waitForFunction(() => [...document.querySelectorAll('.effect--relic img')].every((i) => i.complete && i.naturalWidth > 0));
      assert.equal(await page.$$eval('.effect--relic img', (els) => new Set(els.map((e) => e.src)).size), 2);
      if (width === 640) {
        await page.touchscreen.touchStart(frames.x + frames.width / 2, frames.y + frames.height / 2);
      } else {
        await page.hover('.effect--relic');
      }
      await page.waitForFunction((name) => document.querySelector('.tooltip.is-shown .efftip > b')?.textContent === name, {}, first.name);
      assert.equal(await page.$eval('.tooltip .efftip > b', (e) => e.textContent), first.name);
      assert.equal(await page.$eval('.tooltip .efftip > p', (e) => e.textContent), first.desc);
      assert.match(await page.$eval('.tooltip .efftip__kind', (e) => e.textContent), /收藏品 · I · 普通 · 第 1 回合获得/);
      const tooltipBounds = await page.$eval('.tooltip', (e) => { const r = e.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; });
      assert.ok(tooltipBounds.left >= 0 && tooltipBounds.right <= width && tooltipBounds.top >= 0 && tooltipBounds.bottom <= height);
      await page.screenshot({ path: `${OUT}/relic-icons-${width === 640 ? 'phone' : 'desktop'}.png` });
      if (width === 640) await page.touchscreen.touchEnd();
      else await page.mouse.move(0, 0);
      await page.waitForFunction(() => !document.querySelector('.tooltip .efftip'));
      if (width !== 640) {
        await page.focus('.effect--relic');
        await page.waitForFunction((name) => document.querySelector('.tooltip.is-shown .efftip > b')?.textContent === name, {}, first.name);
        assert.equal(await page.$eval('.tooltip .efftip > p', (e) => e.textContent), first.desc);
      }
      // Keyboard focus and touch long-press share the same Tooltip as other components; a tap opens the list.
      await page.click('.effect--relic');
      await page.waitForSelector('.relic-panel');
      assert.equal(await page.$$eval('.relic-panel .relic-card', (els) => els.length), 2);
      await closeWithEscape(page);
      const names = await page.evaluate(async () => {
        const { RELICS } = await import('/shared/relics.js');
        const chosen = RELICS.slice(0, 15);
        globalThis.__MOCK__.mutate((s) => {
          s.priv.relics = chosen.map((r, i) => ({ id: r.id, round: i + 1 }));
          s.priv.relicReward = s.priv.relics.at(-1);
          s.pub.round = 13;
        });
        return chosen.map((r) => r.name);
      });
      await page.waitForSelector('.relic-icon__new');
      assert.equal(await page.$$eval('.effect--relic', (els) => els.length), 15);
      const wrapping = await page.$eval('.relic-icons__grid', (el) => {
        const last = el.querySelector('.tt-anchor:last-child .effect--relic');
        const r = last.getBoundingClientRect();
        const icons = [...el.querySelectorAll('.effect--relic')].map((e) => e.getBoundingClientRect());
        const rows = new Set(icons.map((r) => Math.round(r.top)));
        const columns = new Set(icons.map((r) => Math.round(r.left)));
        const ordered = icons.every((r, i) => i === 0 || (i % 5 === 0
          ? r.left < icons[i - 1].left && r.top === icons[0].top
          : r.left === icons[i - 1].left && r.top > icons[i - 1].top));
        const style = getComputedStyle(el);
        return { noScroll: style.overflowX === 'visible' && style.overflowY === 'visible', visible: last.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)), rows: rows.size, columns: columns.size, ordered, right: r.right, bottom: r.bottom };
      });
      assert.ok(wrapping.noScroll && wrapping.visible && wrapping.rows === 5 && wrapping.columns === 3 && wrapping.ordered, `${width}: icons must fill columns downwards from right to left ${JSON.stringify(wrapping)}`);
      assert.ok(wrapping.right <= width && wrapping.bottom <= height);
      await page.click('.relic-icons__heading');
      await page.waitForSelector('.relic-card');
      assert.equal(await page.$$eval('.relic-panel .relic-card', (els) => els.length), 15);
      assert.deepEqual(await page.$$eval('.relic-panel .relic-card__name', (els) => els.map((e) => e.textContent)), names);
      await page.screenshot({ path: `${OUT}/relics-${width === 640 ? 'phone' : 'desktop'}.png` });
      const bounds = await page.$eval('.relic-panel', (el) => {
        const r = el.getBoundingClientRect();
        const body = el.querySelector('.modal__body');
        body.scrollTop = body.scrollHeight;
        const last = el.querySelector('.relic-card:last-child').getBoundingClientRect();
        const b = body.getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, lastVisible: last.bottom <= b.bottom + 1 && last.bottom > b.top, bodyScrollable: body.scrollHeight > body.clientHeight };
      });
      assert.ok(bounds.left >= 0 && bounds.right <= width && bounds.top >= 0 && bounds.bottom <= height, `${width}: modal escapes viewport`);
      assert.ok(bounds.lastVisible, `${width}: last acquired relic cannot be scrolled into view`);
      if (width === 640) assert.ok(bounds.bodyScrollable);
      await closeWithEscape(page);
      // Scouting follows public teammate records, not the viewer's private collection.
      const watchedNames = await page.evaluate(async () => {
        const { RELICS } = await import('/shared/relics.js');
        const chosen = RELICS.slice(20, 22);
        globalThis.__MOCK__.mutate((s) => {
          for (const p of s.pub.players) if (p.playerId !== 'p1') {
            p.relics = chosen.map((r) => ({ id: r.id, round: 2 }));
          }
        });
        globalThis.__MOCK__.pushPublic();
        return chosen.map((r) => r.name);
      });
      await page.click('.team__row:not(.is-self) .team__btn');
      await page.waitForSelector('.gm__watching');
      assert.match(await page.$eval('.relic-icons__heading', (el) => el.textContent), /RELICS\s*2/);
      assert.equal(await page.$$eval('.effect--relic', (els) => els.length), 2);
      await page.click('.relic-icons__heading');
      await page.waitForSelector('.relic-panel');
      assert.deepEqual(await page.$$eval('.relic-panel .relic-card__name', (els) => els.map((e) => e.textContent)), watchedNames);
      await closeWithEscape(page);
      await page.click('.gm__watching button');
      await page.waitForFunction(() => document.querySelectorAll('.effect--relic').length === 15);
      // The user's target is the battle HUD: the collectible column must also clear COST and battle controls.
      await page.evaluate(() => {
        const own = globalThis.__MOCK__.S().priv.relics;
        globalThis.__MOCK__.setPhase('COMBAT');
        globalThis.__MOCK__.mutate((s) => { s.priv.relics = own; });
      });
      await page.waitForSelector('.gm--combat .dpbox');
      await page.waitForFunction(() => document.querySelectorAll('.effect--relic').length === 15);
      await page.waitForFunction(() => !document.querySelector('.pbanner'));
      const combatBounds = await page.$eval('.relic-icons__grid', (el) => {
        const last = el.querySelector('.tt-anchor:last-child .effect--relic');
        const r = last.getBoundingClientRect();
        const dp = document.querySelector('.dpbox').getBoundingClientRect();
        return { visible: last.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)), clearOfCost: r.right < dp.left, bottom: r.bottom };
      });
      assert.ok(combatBounds.visible && combatBounds.clearOfCost && combatBounds.bottom <= height, `${width}: battle HUD covers a collectible`);
      if (width === 640) {
        const r = await page.$eval('.effect--relic', (e) => { const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; });
        await page.touchscreen.touchStart(r.x, r.y);
      } else await page.hover('.effect--relic');
      await page.waitForFunction((name) => document.querySelector('.tooltip.is-shown .efftip > b')?.textContent === name, {}, first.name);
      await page.screenshot({ path: `${OUT}/relic-icons-combat-${width === 640 ? 'phone' : 'desktop'}.png` });
      if (width === 640) await page.touchscreen.touchEnd();
      else await page.mouse.move(0, 0);
      // Both qualifying reasons automatically show exactly three cards; clicking sends the offer id and index.
      for (const reason of ['perfect', 'comeback']) {
        const expected = await page.evaluate(async (reason) => {
          const { RELICS } = await import('/shared/relics.js');
          const own = globalThis.__MOCK__.S().priv.relics;
          globalThis.__MOCK__.setPhase('SETTLE');
          const cards = reason === 'perfect'
            ? [RELICS.find((r) => r.id === 'relic_154'), RELICS.find((r) => r.id === 'relic_155'), RELICS[20]]
            : ['relic_025', 'relic_156', 'relic_042'].map((id) => RELICS.find((r) => r.id === id));
          globalThis.__MOCK__.mutate((s) => {
            s.priv.relics = own;
            s.priv.relicOffer = { id: `ui:${reason}`, round: 13, reason, options: cards.map((r) => r.id) };
            s.priv.nextLpShield = reason === 'comeback' ? 2 : 0;
            s.pub.relicChoosing = true;
            s.pub.deadline = reason === 'perfect' ? 0 : Date.now() + 30000;
          });
          return { id: cards[1].id, desc: cards[1].desc, offerId: `ui:${reason}`, before: own.length };
        }, reason);
        await page.waitForSelector('.relic-choice');
        await page.waitForFunction(() => !document.querySelector('.tooltip.is-shown'));
        await page.keyboard.press('Escape');
        assert.equal(await page.$$eval('.relic-choice', (els) => els.length), 1, 'reward waits for a selection');
        assert.equal(await page.$$eval('.relic-choice__card', (els) => els.length), 3);
        assert.match(await page.$eval('.relic-choice', (e) => e.textContent), reason === 'perfect' ? /无漏怪奖励/ : /下回合获得 2 点护盾/);
        assert.ok((await page.$eval('.relic-choice', (e) => e.textContent)).includes(expected.desc));
        if (reason === 'perfect') {
          const text = await page.$eval('.relic-choice', (e) => e.textContent);
          assert.ok(text.includes('金钟罩') && text.includes('铁布衫') && text.includes('史诗'));
          assert.match(text, /90%/);
        }
        assert.match(await page.$eval('.relic-choice__note', (e) => e.textContent), reason === 'perfect' ? /选好后进入下一阶段/ : /超时自动选择第一件/);
        await page.waitForFunction(() => [...document.querySelectorAll('.relic-choice__art img')].every((i) => i.complete && i.naturalWidth > 0));
        if (reason === 'perfect') {
          const alpha = await page.$$eval('.relic-choice__art img', (imgs) => imgs.slice(0, 2).map((img) => {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0);
            const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
            let transparent = false, opaque = false;
            for (let i = 3; i < data.length; i += 4) {
              if (data[i] === 0) transparent = true;
              if (data[i] === 255) opaque = true;
            }
            return { transparent, opaque };
          }));
          assert.ok(alpha.every((a) => a.transparent && a.opaque), '原创图片可解码且含真实透明背景和实体物件');
        }
        const layout = await page.$$eval('.relic-choice__card', (els) => els.map((e) => { const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }; }));
        await page.screenshot({ path: `${OUT}/relic-choice-layout-${width}-${reason}.png` });
        assert.ok(layout.every((r) => r.top === layout[0].top && r.bottom <= height && r.left >= 0 && r.right <= width), JSON.stringify({ width, height, reason, layout }));
        await page.screenshot({ path: `${OUT}/relic-choice-${reason}-${width === 640 ? 'phone' : 'desktop'}.png` });
        await page.click('.relic-choice__card:nth-child(2)');
        await page.waitForFunction(() => !document.querySelector('.relic-choice'));
        const picked = await page.evaluate(() => ({ relics: globalThis.__MOCK__.S().priv.relics, requests: globalThis.__MOCK__.S().requests }));
        assert.equal(picked.relics.length, expected.before + 1);
        assert.equal(picked.relics.at(-1).id, expected.id);
        assert.deepEqual(picked.requests.filter(([t]) => t === 'g.relic').at(-1), ['g.relic', { offerId: expected.offerId, idx: 1 }]);
      }
      // Return to the original count for the settlement ownership regression below.
      await page.evaluate(() => globalThis.__MOCK__.mutate((s) => { s.priv.relics = s.priv.relics.slice(0, 15); }));
      await page.evaluate(async () => {
        const { store } = await import('/js/store.js');
        const own = store.get().match.private.relics;
        globalThis.__MOCK__.setPhase('RESULT');
        const result = store.get().match.result;
        store.patch('match', { result: { ...result, players: result.players.map((p) => ({ ...p, relics: p.playerId === 'p1' ? own : own.slice(0, 2) })) } });
      });
      await page.waitForSelector('.rcard__relics');
      assert.match(await page.$eval('.rcard.is-self .rcard__relics > summary', (el) => el.textContent), /本局收藏品 · 15/);
      await page.click('.rcard.is-self .rcard__relics > summary');
      assert.equal(await page.$$eval('.rcard.is-self .relic-card', (els) => els.length), 15);
      assert.equal(await page.$$eval('.rcard:not(.is-self) .relic-card', (els) => els.length), 6);
      assert.deepEqual(errors, []);
    } catch (err) {
      await page.screenshot({ path: `${OUT}/relic-icons-failed-${width}.png` });
      throw err;
    } finally { await page.close(); }
  }
});

test('木棍：整个界面逐位方块、输入值保留、更新与观战持续、Pixi文本及退出恢复', {
  skip: !ENABLED && 'set SP_E2E=1 and provide system Chrome', timeout: 60000,
}, async () => {
  const page = await browser.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  try {
    await page.goto(`${base}/dev/game-mock.html?shot=1&phase=PREP`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.relic-icons__heading');
    await page.evaluate(() => {
      const input = document.createElement('input'); input.id = 'mask-input'; input.value = '金币123'; document.body.append(input);
      globalThis.__MOCK__.mutate((s) => { s.priv.relics = [{ id: 'relic_159', round: 7 }]; });
    });
    await page.waitForFunction(() => document.querySelector('#mask-input').style.fontFamily.startsWith('RelicDigits'));
    const font = await page.evaluate(async () => {
      await document.fonts.load('30px RelicDigits');
      const canvas = document.createElement('canvas'); canvas.width = 100; canvas.height = 50;
      const c = canvas.getContext('2d'); c.font = '30px RelicDigits';
      const pixels = (text) => { c.clearRect(0, 0, 100, 50); c.fillText(text, 5, 35); return Array.from(c.getImageData(0, 0, 100, 50).data); };
      const a = pixels('1'), b = pixels('8');
      return { same: a.every((n, i) => n === b[i]), ink: a.some((n) => n > 0), loaded: document.fonts.check('30px RelicDigits'), value: document.querySelector('#mask-input').value,
        all: [...document.body.querySelectorAll('*')].filter((e) => e instanceof HTMLElement && !['SCRIPT', 'STYLE'].includes(e.tagName)).every((e) => e.style.fontFamily.startsWith('RelicDigits')) };
    });
    assert.deepEqual(font, { same: true, ink: true, loaded: true, value: '金币123', all: true });
    const pixi = await page.evaluate(async () => {
      const { ensurePixi } = await import('/js/render/app.js'); const P = await ensurePixi();
      const { installPixiNumberMask } = await import('/js/ui/numberMask.js'); installPixiNumberMask(P);
      const text = new P.Text('123', { fontFamily: 'sans-serif', fontSize: 20 }); text.updateText(true);
      const { ensureDamageFonts } = await import('/js/render/fx.js'); ensureDamageFonts();
      const bitmap = new P.BitmapText('123', { fontName: 'sp-dmg-phys', fontSize: 24 }); bitmap.updateText();
      const width = text.width; const square = new P.Text('■■■', { fontFamily: 'sans-serif', fontSize: 20 }); square.updateText(true);
      const bitmapSquare = new P.BitmapText('■■■', { fontName: 'sp-dmg-phys', fontSize: 24 }); bitmapSquare.updateText();
      const masked = Math.abs(width - square.width) < .01 && Math.abs(bitmap.width - bitmapSquare.width) < .01;
      const raw = text.text; if (bitmap.text !== '123') throw new Error('位图原始数字被修改');
      bitmapSquare.destroy();
      globalThis.__maskText = text; square.destroy(); bitmap.destroy(); return { masked, raw };
    });
    assert.deepEqual(pixi, { masked: true, raw: '123' });
    await page.screenshot({ path: `${OUT}/relic-stick-masked.png` });
    await page.evaluate(() => globalThis.__MOCK__.mutate((s) => { s.priv.relics = []; }));
    await page.waitForFunction(() => !document.querySelector('#mask-input').style.fontFamily.includes('RelicDigits'));
    assert.equal(await page.evaluate(() => globalThis.__maskText.text), '123');
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});
