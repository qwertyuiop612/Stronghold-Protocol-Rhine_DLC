import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RELICS } from '../../shared/relics.js';
import { RelicList, relicEntries, relicOdds, ownerRelics, revivalTargets } from '../../public/js/ui/relicPanel.js';
import { liveLp } from '../../public/js/ui/hud.js';
import { rowLp } from '../../public/js/ui/teamPanel.js';
import { PHASE } from '../../shared/constants.js';

function* walk(v) {
  if (Array.isArray(v)) { for (const c of v) yield* walk(c); return; }
  if (!v || typeof v !== 'object') return;
  yield v;
  yield* walk(v.props?.children);
}
function textOf(v) {
  if (v == null || typeof v === 'boolean') return '';
  if (typeof v !== 'object') return String(v);
  if (Array.isArray(v)) return v.map(textOf).join('');
  return textOf(v.props?.children);
}

test('the full collection renders every acquired effect and round beyond the ten-effect HUD limit', () => {
  const chosen = RELICS.slice(0, 15);
  assert.equal(chosen.length, 15);
  const acquired = chosen.map((r, i) => ({ id: r.id, round: i + 1 }));
  const view = RelicList({ relics: acquired, reward: acquired.at(-1) });
  const cards = [...walk(view)].filter((v) => v.type === 'li');
  assert.equal(cards.length, chosen.length);
  for (let i = 0; i < cards.length; i++) {
    const text = textOf(cards[i]);
    assert.ok(text.includes(chosen[i].name));
    assert.ok(text.includes(chosen[i].desc));
    assert.ok(text.includes(`第 ${i + 1} 回合获得`));
  }
  assert.equal(cards.filter((v) => v.props.class.includes('is-new')).length, 1);
});

test('older empty payloads explain how to obtain a relic; unknown ids remain visible without fabricating effects', () => {
  assert.match(textOf(RelicList({})), /每回合本人无漏怪/);
  assert.deepEqual(relicEntries(null), []);
  const list = relicEntries([null, {}, { id: 'future-relic', round: 4 }]);
  assert.deepEqual(list, [{ id: 'future-relic', round: 4 }]);
  assert.match(textOf(RelicList({ relics: list })), /效果资料暂不可用/);
});

test('collection follows the screen owner without leaking own rewards or shields to watched players', () => {
  const priv = { relics: [{ id: RELICS[0].id, round: 1 }], relicReward: { id: RELICS[0].id, round: 1 }, lpShield: 2, nextLpShield: 2 };
  const teammate = { playerId: 'other', relics: [{ id: RELICS[1].id, round: 2 }], lpShield: 1 };
  const pub = { players: [teammate] };
  const view = (ownerId) => ownerRelics({ pub, priv, myId: 'me', ownerId });
  assert.deepEqual(view('me'), { relics: priv.relics, reward: priv.relicReward, shield: 2, nextShield: 2 });
  assert.deepEqual(view('other'), { relics: teammate.relics, reward: null, shield: 1, nextShield: 0 });
  teammate.relics = [];
  assert.deepEqual(view('other').relics, []);
  assert.deepEqual(view('missing'), { relics: [], reward: null, shield: 0, nextShield: 0 });
  assert.equal(view('me').relics, priv.relics, 'returning home restores your collection');
});

test('displayed odds sum to 100% and lock high-strength tiers until their unlock round', () => {
  for (let round = 1; round <= 15; round++) {
    const odds = relicOdds(round);
    assert.equal(odds.length, 5);
    assert.ok(Math.abs(odds.reduce((sum, o) => sum + o.percent, 0) - 100) < 1e-8);
    for (const o of odds) if (round < o.unlock) assert.equal(o.percent, 0);
  }
});

test('时光之末：一次性使用状态、历史图鉴与可复活队友分别使用可信状态', () => {
  const records = [{ id: 'relic_233', round: 7, used: true }];
  assert.equal(relicEntries(records)[0].used, true);
  assert.match(textOf(RelicList({ relics: records })), /已使用 · 复活机会已消耗/);
  assert.ok(!textOf(RelicList({ relics: records, history: true })).includes('机会已消耗'));
  assert.match(textOf(RelicList({ relics: [{ id: 'relic_233', round: 7 }] })), /剩余 1 次/);
  const players = [
    { playerId: 'me', alive: false, canRevive: true },
    { playerId: 'dead', alive: false, canRevive: true },
    { playerId: 'left', alive: false, canRevive: false },
    { playerId: 'alive', alive: true, canRevive: true },
  ];
  assert.deepEqual(revivalTargets({ players }, 'me').map((p) => p.playerId), ['dead']);
});

test('live LP previews include shields, keep uncapped survivor counts and avoid subtracting a server preview twice', () => {
  const common = { round: 4, lp: 24, leaks: 20, cap: 10, shield: 2 };
  const normal = liveLp(null, { ...common, phase: PHASE.COMBAT });
  assert.equal(normal.pending, 8);
  assert.equal(normal.shown, 16);
  const saved = liveLp(normal.base, { ...common, phase: PHASE.UNITE, uniteLeft: 1 });
  assert.equal(saved.pending, 0);
  assert.equal(saved.left, 1);
  const pub = { phase: PHASE.UNITE, unite: { leakers: ['b'] } };
  const b = { playerId: 'b', alive: true, lp: 24, lpShield: 2, pendingLp: 8, uniteLeft: 20 };
  assert.equal(rowLp(b, pub).pending, 8, 'server already applied shield');
  assert.equal(rowLp(b, pub, null, { uniteLocal: { b: 3 } }).pending, 1);
  assert.equal(rowLp(b, pub, null, { uniteLocal: { b: 1 } }).pending, 0);
});


test('时间机器：普通与联防血量预览加血、不截断低血回血、结算后不重复预览', () => {
  const first = liveLp(null, { phase: 'COMBAT', round: 2, lp: 1, leaks: 3, shield: 2, reverseLp: true });
  assert.equal(first.shown, 4); assert.equal(first.pending, -3);
  const settled = liveLp(first.base, { phase: 'COMBAT', round: 2, lp: 4, leaks: 3, reverseLp: true });
  assert.equal(settled.shown, 4); assert.equal(settled.pending, 0);
  const unite = liveLp(null, { phase: 'UNITE', round: 2, lp: 1, leaks: 5, uniteLeft: 2, reverseLp: true });
  assert.equal(unite.shown, 3);
});
