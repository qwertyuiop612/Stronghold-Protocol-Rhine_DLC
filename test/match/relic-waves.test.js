import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RELICS, pickRelicChoices } from '../../shared/relics.js';
import { createRng, deriveSeed } from '../../server/sim/rng.js';
import { redistributeRelicWaves } from '../../server/match/relicWaves.js';
import { settleRelics, selectRelic } from '../../server/match/relics.js';
import { buildBattleSpec, createBattleFromSpec, resultDigest } from '../../server/sim/spec.js';
import { makeMatch } from './harness.js';

const count = (list) => list.reduce((n, s) => n + (s.count || 1), 0);
const routes = [{ start: [12, 10], end: [10, 1], motion: 'WALK' }];
function plan(seat, owns = false, n = 5) {
  return { ps: { seat, playerId: `p_${seat}`, alive: true, left: false, relics: owns ? [{ id: 'relic_156' }, { id: 'relic_156' }] : [] }, routes,
    spawns: [{ enemyKey: 'test', count: n, time: 2, interval: 0.5, routeIndex: 0, mods: { hpMul: 2 }, bounty: { coins: 3, ownerPlayerId: `p_${seat}` } }] };
}

test('解压玩具：10% 边界、每人判定一次、多人触发选一人且守恒', () => {
  const plans = [plan(0, true), plan(1, true), plan(2)];
  const before = JSON.stringify(plans);
  for (const rolls of [[0.099, 0.1, 0], [0, 0, 0.99]]) {
    let calls = 0;
    const out = redistributeRelicWaves(plans, { rng: () => rolls[calls++] });
    const winner = rolls[2] ? 'p_1' : 'p_0';
    assert.equal(count(out.get(winner)), 14);
    assert.equal(count(out.get(winner === 'p_0' ? 'p_1' : 'p_0')), 0);
    assert.equal(count(out.get('p_2')), 1);
    assert.equal(calls, 3, '重复ID不增加判定次数');
    assert.equal(count([...out.values()].flat()), 15);
    assert.ok(out.get(winner).every((s) => s.ownerPlayerId === winner && s.mods.hpMul === 2));
  }
  const noTrigger = redistributeRelicWaves(plans, { rng: () => 0.1 });
  assert.notEqual(count(noTrigger.get('p_2')), 1, '恰好 10% 边界不触发');
  assert.equal(JSON.stringify(plans), before);
  const inactive = [plan(0, true), plan(1, true), plan(2), plan(3)];
  inactive[1].ps.left = true; inactive[3].ps.alive = false;
  const out = redistributeRelicWaves(inactive, { rng: () => 0 });
  assert.equal(count(out.get('p_0')), 9);
  assert.equal(count(out.get('p_2')), 1);
  assert.equal(count(out.get('p_1')), 0);
  assert.equal(count(out.get('p_3')), 0);
  const empty = [plan(0, true), plan(1)]; empty[1].spawns = [];
  assert.equal(count(redistributeRelicWaves(empty, { rng: () => 0 }).get('p_0')), 5, '原本没有敌人时不制造新敌人');
});

test('解压玩具：独立种子判定比例，重复预览及普通分配不重新抽取', () => {
  for (const holders of [1, 2]) {
    let triggered = 0;
    const plans = [plan(0, true), plan(1, holders === 2), plan(2)];
    for (let seed = 1; seed <= 20000; seed++) {
      const out = redistributeRelicWaves(plans, { seed, round: 4 });
      if (count(out.get('p_2')) === 1) triggered++;
      if (seed <= 10) assert.deepEqual(redistributeRelicWaves(plans, { seed, round: 4 }), out);
    }
    const expected = 1 - 0.9 ** holders;
    assert.ok(Math.abs(triggered / 20000 - expected) < 0.01, `${holders} 个持有者：触发比例 ${triggered / 20000}`);
  }
});

test('解压玩具：触发回合预览、实际波次和两端模拟均为 9 / 1', () => {
  const h = makeMatch({ humans: 2, fake: true }).start();
  try {
    h.toPrep(4);
    const m = h.m, ps = h.ps('p_0'), other = h.ps('p_1');
    ps.relics = [{ id: 'relic_156', round: 0 }];
    ps.bounties = []; other.bounties = [];
    m.wave = { ...m.wave, spawns: [{ ...m.wave.spawns[0], count: 5, time: 0, interval: 0.1 }] };
    for (let seed = 1; ; seed++) {
      if (createRng(deriveSeed(seed, `relic-wave-overload:${m.round}:${ps.seat}`))() < 0.1) { m.seed = seed; break; }
    }
    const before = m.rngWaves.state();
    for (const player of [ps, other]) {
      const expected = player === ps ? 9 : 1;
      const opts = m._normalOpts(player);
      assert.equal(count(m.nextEnemiesFor(player)), expected);
      assert.equal(count(opts.spawns), expected);
      assert.deepEqual(m._normalOpts(player).spawns, opts.spawns);
      const spec = buildBattleSpec({ ...opts, players: [{ ...player.battleInput(), units: [] }], content: m.battleContent, battleId: `toy:overload:${player.playerId}` });
      const a = createBattleFromSpec(spec, m.gd), b = createBattleFromSpec(JSON.parse(JSON.stringify(spec)), m.gd);
      a.runToEnd(120); b.runToEnd(120);
      assert.equal(a.total, expected);
      assert.deepEqual(resultDigest(a.result()), resultDigest(b.result()));
    }
    assert.equal(m.rngWaves.state(), before, '不消耗敌方波次随机流');
  } finally { h.m.dispose(); }
});

test('解压玩具：仅多人抽取，普通进度与逆风补足均过滤单人限定', () => {
  const owned = RELICS.filter((r) => r.id !== 'relic_156').map((r) => r.id);
  for (const comeback of [false, true]) {
    assert.deepEqual(pickRelicChoices(7, owned, createRng(1), { comeback }), []);
    assert.deepEqual(pickRelicChoices(7, owned, createRng(1), { comeback, multiplayer: true }), ['relic_156']);
  }
  assert.deepEqual(pickRelicChoices(1, owned, createRng(1), { multiplayer: true }), []);
});

test('解压玩具：奇偶数、均分余数、多人持有同时处理、重复ID与输入不变', () => {
  for (const n of [1, 2, 5, 6, 17]) {
    const plans = [plan(0, true, n), plan(1), plan(2), plan(3)];
    const before = JSON.stringify(plans);
    const out = redistributeRelicWaves(plans, { round: 4 });
    assert.equal(count(out.get('p_0')), Math.floor(n / 2));
    const others = [1, 2, 3].map((i) => count(out.get(`p_${i}`)) - 5);
    assert.equal(others.reduce((a, b) => a + b), Math.ceil(n / 2));
    assert.ok(Math.max(...others) - Math.min(...others) <= 1);
    assert.equal(JSON.stringify(plans), before);
    const moved = [...out.entries()].filter(([id]) => id !== 'p_0').flatMap(([, s]) => s).filter((s) => s.bounty.ownerPlayerId === 'p_0');
    assert.ok(moved.every((s) => s.mods.hpMul === 2 && s.ownerPlayerId !== 'p_0' && s.time >= 2 && s.routeIndex === 0));
  }
  const both = redistributeRelicWaves([plan(0, true), plan(1, true)]);
  assert.equal(count(both.get('p_0')), 5);
  assert.equal(count(both.get('p_1')), 5);
  const one = plan(0, true);
  assert.deepEqual(redistributeRelicWaves([one]).get('p_0'), one.spawns);
  const two = [plan(0, true), plan(1)];
  assert.equal(count(redistributeRelicWaves(two, { solo: true }).get('p_0')), 5);
  two[1].ps.left = true;
  assert.equal(count(redistributeRelicWaves(two).get('p_0')), 5);
  two[1].ps.left = false; two[1].ps.alive = false;
  assert.equal(count(redistributeRelicWaves(two).get('p_0')), 5);
});

test('解压玩具：真实服务端领取后，预览与两端战斗spec一致，首领波次保持不变', () => {
  const h = makeMatch({ humans: 2, fake: true }).start();
  try {
    h.toPrep(4);
    const m = h.m, ps = h.ps('p_0'), other = h.ps('p_1');
    m.wave = { ...m.wave, spawns: [{ ...m.wave.spawns[0], count: 5, time: 0, interval: 0.1 }] };
    ps.bounties = []; other.bounties = [];
    ps.relics = RELICS.filter((r) => r.id !== 'relic_156').map((r) => ({ id: r.id, round: 1 }));
    assert.equal(count(m._normalOpts(ps).spawns), 5, '候选未领取不生效');
    const offer = settleRelics(ps, { perfect: true, leaked: [] }, { completed: true });
    assert.deepEqual(offer.options, ['relic_156']);
    assert.equal(selectRelic(ps, offer.id, 0).id, 'relic_156');
    assert.equal(selectRelic(ps, offer.id, 0), null);
    assert.equal(count(m._normalOpts(ps).spawns), 2);
    assert.equal(count(m._normalOpts(other).spawns), 8);
    assert.equal(count(m.nextEnemiesFor(ps)), 2);
    assert.equal(count(m.nextEnemiesFor(other)), 8);
    for (const player of [ps, other]) {
      const opts = { ...m._normalOpts(player), players: [{ ...player.battleInput(), units: [] }], content: m.battleContent, battleId: `toy:${player.playerId}` };
      const spec = buildBattleSpec(opts);
      const a = createBattleFromSpec(spec, m.gd), b = createBattleFromSpec(JSON.parse(JSON.stringify(spec)), m.gd);
      a.runToEnd(120); b.runToEnd(120);
      assert.equal(a.total, player === ps ? 2 : 8);
      assert.deepEqual(resultDigest(a.result()), resultDigest(b.result()));
    }
    m._planBossWaves();
    const bossPreview = m.nextEnemiesFor(ps);
    ps.relics = ps.relics.filter((r) => r.id !== 'relic_156');
    assert.deepEqual(m.nextEnemiesFor(ps), bossPreview);
  } finally { h.m.dispose(); }
});

test('解压玩具：单人伪造候选无法领取', () => {
  const h = makeMatch({ mode: 'solo', fake: true }).start();
  try {
    const ps = h.ps('p_0');
    ps.relicOffer = { id: 'forged', round: h.m.round, options: ['relic_156'] };
    assert.equal(selectRelic(ps, 'forged', 0), null);
    assert.equal(ps.relics.length, 0);
  } finally { h.m.dispose(); }
});

for (const hidden of [false, true]) test(`解压玩具：${hidden ? '隐秘核心' : '最终攻势'}实际发送的波次不变`, () => {
  const snapshots = [];
  for (const owns of [false, true]) {
    const h = makeMatch({ humans: 2, fake: true, clientCombat: true, clients: false, instant: false }).start();
    try {
      if (owns) h.ps('p_0').relics = [{ id: 'relic_156', round: 1 }];
      h.m.startFinalAssault(hidden);
      snapshots.push(h.m.fields.map((f) => f.spec.spawns));
    } finally { h.m.dispose(); }
  }
  assert.deepEqual(snapshots[1], snapshots[0]);
});
