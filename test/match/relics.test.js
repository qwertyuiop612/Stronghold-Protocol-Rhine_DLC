import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PHASE } from '../../shared/constants.js';
import { validateC2S } from '../../shared/protocol.js';
import { RELICS, RELIC_TIERS, getRelic, dropWeights, pickRelic, pickRelicChoices, comebackWeights, relicModifiers, relicIncome } from '../../shared/relics.js';
import { createRng } from '../../server/sim/rng.js';
import { settleRelics, selectRelic } from '../../server/match/relics.js';
import { makeMatch } from './harness.js';
import { attachAudit } from '../../server/match/audit.js';
import { makeBattle, chessRec } from '../helpers/battleHarness.js';

test('原创收藏品：实际奖励池抽取与领取后下一场战斗生效', () => {
  for (const id of ['relic_154', 'relic_155']) {
    const h = makeMatch({ mode: 'solo', fake: true }).start();
    try {
      h.toPrep(7);
      const ps = h.ps('p_0');
      // 耗尽其他藏品，让真实服务端奖励池只剩待验证新品。
      ps.relics = RELICS.filter((r) => r.id !== id).map((r) => ({ id: r.id, round: 1 }));
      const offer = settleRelics(ps, { perfect: true, leaked: [] }, { completed: true });
      assert.deepEqual(offer.options, [id]);
      const before = relicModifiers(ps.battleInput().relics, 'WARRIOR', 'MELEE');
      assert.ok(before[id === 'relic_154' ? 'resToDef' : 'defToRes']);
      assert.equal(selectRelic(ps, offer.id, 0).id, id);
      const input = ps.battleInput();
      const battle = makeBattle({ players: [{ ...input, units: [{ uid: 1, kind: 'chess', chessId: 'r_custom', row: 10, col: 4 }] }],
        defs: { chess: { r_custom: chessRec({ id: 'r_custom', skill: null, stats: { maxHp: 2000, atk: 500, def: 200, res: 10 } }) } }, autoFinish: false });
      battle.step();
      const unit = battle.unit(1);
      assert.equal(unit.s.def, 0, '领取第二件后移除全部防御');
      assert.equal(unit.s.res, 0, '领取第二件后移除全部法抗');
      assert.ok(Math.abs(unit.s.physTakenMul - 0.1) < 1e-9);
      assert.ok(Math.abs(unit.s.artsTakenMul - 0.1) < 1e-9);
      assert.equal(selectRelic(ps, offer.id, 0), null);
    } finally { h.m.dispose(); }
  }
});

test('collection: every tier is populated, early pools cannot run out during ordinary play, definitions are immutable', () => {
  assert.equal(RELICS.length, 46);
  assert.equal(new Set(RELICS.map((r) => r.id)).size, RELICS.length);
  assert.ok(RELICS.filter((r) => r.tier === 1).length >= 9);
  for (const { tier } of RELIC_TIERS) assert.ok(RELICS.some((r) => r.tier === tier));
  for (const r of RELICS) {
    assert.ok(r.name && r.desc && r.sourceEffect);
    assert.ok(Object.isFrozen(r) && Object.isFrozen(r.mods));
  }
  assert.equal(getRelic('__proto__'), null);
});

test('drops: locked tiers stay impossible, even when every unlocked collectible is already owned', () => {
  for (let round = 1; round <= 15; round++) {
    const rng = createRng(round);
    for (let i = 0; i < 1000; i++) {
      const r = pickRelic(round, [], rng);
      assert.ok(RELIC_TIERS[r.tier - 1].unlockRound <= round);
    }
    const allUnlocked = RELICS.filter((r) => RELIC_TIERS[r.tier - 1].unlockRound <= round);
    assert.equal(pickRelic(round, allUnlocked, rng), null, 'an exhausted pool must never promote into a locked tier');
  }
  assert.equal(pickRelic(0, [], createRng(1)), null);
  assert.equal(pickRelic(1.5, [], createRng(1)), null);
});

test('drops: five-tier frequencies follow weights independently of unequal pool sizes', () => {
  const rng = createRng(20261003);
  const count = [0, 0, 0, 0, 0];
  const samples = 100000;
  for (let i = 0; i < samples; i++) count[pickRelic(13, [], rng).tier - 1]++;
  const weights = dropWeights(13);
  weights.forEach((weight, i) => assert.ok(Math.abs(count[i] / samples * 100 - weight) < 0.6, `${i + 1}: ${count[i]}`));
  assert.ok(count[1] > count[0], "后期精良出现概率高于普通");
});

test('drops: one uninterrupted perfect match earns distinct, progress-gated collectibles', () => {
  for (let seed = 1; seed <= 100; seed++) {
    const rng = createRng(seed);
    const owned = [];
    for (let round = 1; round <= 15; round++) {
      const r = pickRelic(round, owned, rng);
      assert.ok(r, `a real 15-round run never exhausts the eligible pool, seed ${seed} round ${round}`);
      assert.ok(!owned.some((o) => o.id === r.id));
      owned.push({ id: r.id, round });
    }
  }
});

test('balance: duplicate IDs, forged payloads, profession and position add without cumulative caps', () => {
  const all = RELICS.map((r) => r.id);
  const mods = relicModifiers(all, 'WARRIOR', 'MELEE');
  const expected = { atkPct: 1.23, hpPct: 1.4, defPct: 1.22, aspd: 35, spRecoveryFlat: 0.75, hpRegen: 100, hpRegenRatio: 0.02, dodgePhys: 0.22, dodgeArts: 0.27, physDealtMul: 1.6, artsDealtMul: 1.6, healingTakenMul: 1.1, artsTakenMul: 0.1, physTakenMul: 0.1, defResClear: 1 };
  assert.deepEqual(Object.keys(mods).sort(), Object.keys(expected).sort());
  for (const [key, value] of Object.entries(expected)) assert.ok(Math.abs(mods[key] - value) < 1e-9, key);
  assert.deepEqual(relicModifiers(['relic_003', 'relic_003', 'unknown', { id: 'unknown', mods: { atkPct: 999 } }]), { atkPct: 0.08 });
  assert.deepEqual(relicModifiers(['relic_145', 'relic_050'], 'MEDIC', 'RANGED'), {});
  assert.equal(relicIncome(['relic_025', 'relic_025']), 1);
});

test('掉落进度：普通奖励按新回合区间抽取，逆风概率维持独立表', () => {
  assert.deepEqual(RELIC_TIERS.map((r) => r.unlockRound), [1, 1, 4, 7, 7]);
  const normal = [
    [1, [80, 20, 0, 0, 0]], [3, [80, 20, 0, 0, 0]],
    [4, [60, 28, 12, 0, 0]], [6, [60, 28, 12, 0, 0]],
    [7, [50, 30, 15, 4, 1]], [9, [50, 30, 15, 4, 1]],
    [10, [20, 40, 25, 10, 5]], [12, [20, 40, 25, 10, 5]],
    [13, [10, 30, 35, 15, 10]], [15, [10, 30, 35, 15, 10]],
  ];
  normal.forEach(([round, weights]) => assert.deepEqual(dropWeights(round), weights));
  const comeback = [
    [3, [0, 0, 100, 0, 0]], [5, [0, 0, 100, 0, 0]],
    [6, [0, 0, 65, 35, 0]], [8, [0, 0, 65, 35, 0]],
    [9, [0, 0, 60, 30, 10]], [11, [0, 0, 60, 30, 10]],
    [12, [0, 0, 55, 30, 15]], [15, [0, 0, 55, 30, 15]],
  ];
  comeback.forEach(([round, weights]) => assert.deepEqual(comebackWeights(round), weights));
  const rng = createRng(42);
  const count = [0, 0, 0, 0, 0];
  for (let i = 0; i < 30000; i++) count[pickRelic(12, [], rng, { comeback: true }).tier - 1]++;
  comebackWeights(12).forEach((weight, i) => assert.ok(Math.abs(count[i] / 300 - weight) < 1));
  const exhausted = RELICS.filter((r) => r.tier >= 3).map((r) => r.id);
  const fallback = pickRelicChoices(3, exhausted, rng, { comeback: true });
  assert.equal(fallback.length, 3);
  fallback.forEach((id) => assert.ok(getRelic(id).tier <= 2));
});

for (const clientCombat of [false, true]) {
  test(`perfect own battle gives exactly one relic; a 联防 rescue never qualifies (${clientCombat ? 'client' : 'server'} combat)`, () => {
    const h = makeMatch({ humans: 2, fake: true, clientCombat,
      script: (b) => b.kind === 'normal' && b.round === 1 ? { leaks: { p_1: 1 } } : {} }).start();
    try {
      h.toPrep(1);
      const [p0, p1] = [h.ps('p_0'), h.ps('p_1')];
      const lp = p1.lp;
      h.toPrep(2);
      assert.equal(p1.lp, lp, 'helper caught the leaked enemy');
      assert.equal(p0.relics.length, 1);
      assert.equal(p1.relics.length, 0, 'rescue did not erase the original leak');
      assert.equal(getRelic(p0.relics[0].id).tier, 1);
      assert.equal(p0.relics[0].round, 1);
      assert.deepEqual(p0.battleInput().relics, [p0.relics[0].id]);
      const watched = h.m.publicView().players.find((p) => p.playerId === p0.playerId);
      assert.deepEqual(watched.relics, p0.relics, 'spectators receive acquired ids and rounds');
      assert.equal(watched.nextLpShield, p0.privateView().nextLpShield);
      assert.equal(watched.relicOffer, undefined, 'private reward choices are not exposed');
      watched.relics[0].id = 'forged';
      assert.notEqual(p0.relics[0].id, 'forged', 'public collection cannot mutate authoritative state');
      const view = p0.privateView();
      view.relics[0].id = 'forged';
      assert.notEqual(p0.relics[0].id, 'forged', 'a wire view is isolated from authoritative state');
      h.toPrep(3);
      assert.equal(p0.relics.length, 2);
      assert.equal(p1.relics.length, 1);
      assert.deepEqual(p0.relicReward, p0.relics[1]);
      h.invariants();
      assert.equal(h.m.errorCount, 0);
    } finally { h.m.dispose(); h.clients?.closeAll(); }
  });
}

test('settlement: repeated callbacks, missing/synthetic results, eliminated seats and non-completed battles never grant extras', () => {
  const h = makeMatch({ mode: 'solo', fake: true }).start();
  try {
    h.toPrep(1);
    const ps = h.ps('p_0');
    const result = { perfect: true, leaked: [] };
    assert.equal(settleRelics(ps, null, { completed: true }), null);
    assert.equal(settleRelics(ps, result), null);
    assert.equal(settleRelics(ps, { ...result, synthetic: true }, { completed: true }), null);
    ps.alive = false;
    assert.equal(settleRelics(ps, result, { completed: true }), null);
    ps.alive = true;
    ps.left = true;
    assert.equal(settleRelics(ps, result, { completed: true }), null);
    ps.left = false;
    const offer = settleRelics(ps, result, { completed: true });
    assert.ok(offer);
    assert.equal(ps.relics.length, 0);
    assert.equal(settleRelics(ps, result, { completed: true }), null);
    assert.ok(selectRelic(ps, offer.id, 0));
    assert.equal(ps.relics.length, 1);
  } finally { h.m.dispose(); }
});

test('three distinct candidates exclude owned relics; comeback promotes each eligible tier once, capped at legendary', () => {
  for (let round = 1; round <= 15; round++) for (let seed = 0; seed < 100; seed++) {
    const ids = pickRelicChoices(round, ['relic_003'], createRng(seed));
    assert.equal(ids.length, 3);
    assert.equal(new Set(ids).size, 3);
    assert.ok(!ids.includes('relic_003'));
    ids.forEach((id) => assert.ok(RELIC_TIERS[getRelic(id).tier - 1].unlockRound <= round));
    if (round >= 3) {
      const comeback = pickRelicChoices(round, [], createRng(seed), { comeback: true });
      assert.equal(comeback.length, 3);
      comeback.forEach((id) => {
        const tier = getRelic(id).tier;
        assert.ok(tier >= 3);
        assert.ok(tier === 3 || RELIC_TIERS[tier - 2].unlockRound <= round);
      });
    }
  }
  assert.deepEqual(comebackWeights(3), [0, 0, 100, 0, 0]);
});

test('perfect settlement waits for a player choice; forged/stale choices cannot award or advance, and solo selection is untimed', () => {
  const h = makeMatch({ mode: 'solo', fake: true }).start();
  try {
    h.toPrep(1);
    assert.ok(h.drive(() => h.m.phase === PHASE.SETTLE));
    const ps = h.ps('p_0');
    const offer = ps.relicOffer;
    assert.equal(offer.options.length, 3);
    assert.equal(ps.relics.length, 0);
    assert.equal(h.m.deadline, 0);
    const wire = ps.privateView();
    wire.relicOffer.options[0] = 'forged';
    assert.notEqual(offer.options[0], 'forged');
    assert.equal(h.m.handle(ps.playerId, { t: 'g.relic', offerId: 'relic:other:1', idx: 0 }).error, 'BAD_TARGET');
    assert.equal(h.m.handle(ps.playerId, { t: 'g.relic', offerId: offer.id, idx: 3 }).error, 'BAD_TARGET');
    assert.equal(h.m.phase, PHASE.SETTLE);
    const chosen = offer.options[2];
    assert.ok(h.m.handle(ps.playerId, { t: 'g.relic', offerId: offer.id, idx: 2 }).ok);
    assert.deepEqual(ps.relics, [{ id: chosen, round: 1 }]);
    assert.equal(h.m.round, 2);
    assert.equal(h.m.handle(ps.playerId, { t: 'g.relic', offerId: offer.id, idx: 2 }).error, 'WRONG_PHASE');
  } finally { h.m.dispose(); }
});

test('multiplayer waits for each owner, rejects another seat offer, and defaults only outstanding choices at 30 seconds', () => {
  const h = makeMatch({ humans: 2, fake: true }).start();
  try {
    h.toPrep(1);
    assert.ok(h.drive(() => h.m.phase === PHASE.SETTLE));
    const [a, b] = [h.ps('p_0'), h.ps('p_1')];
    const first = b.relicOffer.options[0];
    assert.equal(h.m.deadline - h.sched.now(), 30000);
    assert.equal(h.m.publicView().relicChoosing, true);
    assert.equal(h.m.statusOf(a), 'deciding');
    assert.equal(h.m.handle(a.playerId, { t: 'g.relic', offerId: b.relicOffer.id, idx: 0 }).error, 'BAD_TARGET');
    assert.ok(h.m.handle(a.playerId, { t: 'g.relic', offerId: a.relicOffer.id, idx: 2 }).ok);
    assert.equal(h.m.phase, PHASE.SETTLE);
    assert.equal(a.relics.length, 1);
    assert.equal(h.m.statusOf(a), 'done');
    assert.equal(b.relics.length, 0);
    assert.equal(h.m.handle(a.playerId, { t: 'g.relic', offerId: 'relic:0:1', idx: 2 }).error, 'BAD_TARGET');
    h.sched.advance(29999);
    assert.equal(h.m.round, 1);
    assert.equal(b.relics.length, 0);
    h.sched.advance(1);
    assert.equal(h.m.round, 2);
    assert.deepEqual(b.relics, [{ id: first, round: 1 }]);
    assert.equal(a.relics.length, 1);
    assert.equal(h.m.publicView().relicChoosing, false);
    assert.equal(h.m.errorCount, 0);
  } finally { h.m.dispose(); }
});

for (const action of ['disconnect', 'autoplay', 'leave']) test(`an outstanding relic choice cannot stall multiplayer after ${action}`, () => {
  const h = makeMatch({ humans: 2, fake: true }).start();
  try {
    h.toPrep(1);
    assert.ok(h.drive(() => h.m.phase === PHASE.SETTLE));
    const [a, b] = [h.ps('p_0'), h.ps('p_1')];
    h.m.handle(a.playerId, { t: 'g.relic', offerId: a.relicOffer.id, idx: 0 });
    if (action === 'disconnect') h.m.onDisconnect(b.playerId);
    else if (action === 'autoplay') h.m.handle(b.playerId, { t: 'g.autoplay', on: true });
    else h.m.onLeave(b.playerId);
    assert.equal(h.m.round, 2);
    assert.equal(b.relics.length, action === 'leave' ? 0 : 1);
    assert.equal(h.m.publicView().relicChoosing, false);
    assert.equal(h.m.errorCount, 0);
    h.m.onReconnect(b.playerId);
    assert.equal(b.relics.length, action === 'leave' ? 0 : 1);
  } finally { h.m.dispose(); }
});

test('relic requests carry a bounded index and offer identity', () => {
  assert.equal(validateC2S({ t: 'g.relic', offerId: 'relic:0:1', idx: 2 }), null);
  for (const fields of [{ idx: 3 }, { idx: -1 }, { idx: 1.5 }, { offerId: '' }, { offerId: 'a'.repeat(65) }]) {
    assert.ok(validateC2S({ t: 'g.relic', offerId: 'relic:0:1', idx: 0, ...fields }));
  }
});

for (const clientCombat of [false, true]) test(`three rounds of rescued leaks still qualify for comeback (${clientCombat ? 'client' : 'server'})`, () => {
  const h = makeMatch({ humans: 2, fake: true, clientCombat,
    script: (b) => b.kind === 'normal' ? { leaks: { p_1: 1 } } : {} }).start();
  try {
    h.toPrep(1);
    const b = h.ps('p_1');
    const lp = b.lp;
    h.toPrep(4);
    assert.equal(b.lp, lp, 'all three personal leaks were caught by the ally');
    assert.equal(b.relics.length, 1);
    assert.equal(b.relics[0].round, 3);
    assert.equal(getRelic(b.relics[0].id).tier, 3);
    assert.equal(b.privateView().lpShield, 2);
    assert.equal(b.relicLeakStreak, 0);
  } finally { h.m.dispose(); h.clients?.closeAll(); }
});

test('normal damage is capped before applying the two-point shield', () => {
  const h = makeMatch({ mode: 'solo', fake: true, script: (b) => b.kind === 'normal' ? { leaks: { p_0: 40 } } : {} }).start();
  try {
    h.toPrep(1);
    const ps = h.ps('p_0');
    const lp = ps.lp;
    ps.relicShieldRound = 1;
    ps.relicShield = 2;
    assert.ok(h.drive(() => h.m.phase === PHASE.SETTLE));
    assert.equal(ps.lp, lp - 8);
    assert.equal(ps.stats.lpLost, 8);
    assert.equal(ps.relicShield, 0);
    assert.equal(ps.relicOffer, null);
    assert.equal(ps.relicLeakStreak, 1);
  } finally { h.m.dispose(); }
});

for (const clientCombat of [false, true]) test(`three consecutive leaks give a comeback choice and next-round shield exactly once (${clientCombat ? 'client' : 'server'})`, () => {
  const h = makeMatch({ mode: 'solo', fake: true, clientCombat,
    script: (b) => b.kind === 'normal' ? { leaks: { p_0: b.round === 4 ? 3 : 1 } } : {} }).start();
  try {
    const audit = attachAudit(h.m);
    h.toPrep(1);
    const ps = h.ps('p_0');
    ps.lp = 30;
    h.toPrep(4);
    assert.equal(ps.lp, 27);
    assert.equal(ps.relics.length, 1);
    assert.equal(ps.relics[0].round, 3);
    assert.equal(getRelic(ps.relics[0].id).tier, 3);
    assert.equal(ps.relicLeakStreak, 0);
    assert.equal(ps.privateView().lpShield, 2);
    assert.ok(h.drive(() => h.m.phase === PHASE.SETTLE && h.m.round === 4));
    assert.equal(ps.lp, 26, 'three leaks cost one LP after shielding');
    assert.equal(ps.stats.lpLost, 4);
    assert.equal(ps.stats.leaks, 6);
    assert.equal(ps.relicShield, 0);
    assert.equal(ps.relicOffer, null);
    assert.equal(ps.relicLeakStreak, 1);
    h.toPrep(5);
    assert.equal(ps.privateView().lpShield, 0);
    h.toPrep(7);
    assert.equal(ps.relics.length, 2);
    assert.equal(ps.relics[1].round, 6);
    assert.equal(ps.privateView().lpShield, 2);
    assert.equal(h.m.errorCount, 0);
    assert.deepEqual(audit.violations, []);
  } finally { h.m.dispose(); h.clients?.closeAll(); }
});

test('a perfect round breaks the leak streak; unused shield expires and cannot fake a perfect round', () => {
  const h = makeMatch({ mode: 'solo', fake: true,
    script: (b) => b.kind === 'normal' && [1, 2, 4, 5, 6].includes(b.round) ? { leaks: { p_0: 1 } } : {} }).start();
  try {
    h.toPrep(4);
    const ps = h.ps('p_0');
    ps.lp = 100;
    assert.equal(ps.relicNextShieldRound, 0);
    assert.equal(ps.relicLeakStreak, 0);
    h.toPrep(7);
    assert.equal(ps.relics.filter((r) => r.round === 6).length, 1);
    assert.equal(ps.privateView().lpShield, 2);
    const lp = ps.lp;
    h.toPrep(8);
    assert.equal(ps.lp, lp);
    assert.equal(ps.privateView().lpShield, 0);
  } finally { h.m.dispose(); }
});

test('boss shield credits raw client LP only once, preserves fallback acknowledgments, and does not use another field shield', () => {
  const h = makeMatch({ humans: 2, fake: true }).start();
  try {
    h.toPrep(1);
    const [a, b] = [h.ps('p_0'), h.ps('p_1')];
    a.relicShield = b.relicShield = 2;
    a.relicShieldRound = b.relicShieldRound = 1;
    h.m.teamLp = 10;
    h.m._bossLpBudget = () => 100;
    const f = { players: [a.playerId], lpReported: 0, lpAcked: 0, lpCum: 0 };
    h.m._creditLp(f, 3, true);
    assert.equal(h.m.teamLp, 9);
    assert.equal(a.relicShield, 0);
    assert.equal(b.relicShield, 2);
    h.m._creditLp(f, 3, true);
    assert.equal(h.m.teamLp, 9);
    h.m._creditLp(f, 3);
    assert.equal(h.m.teamLp, 9, 'fallback replay does not charge already-acknowledged leaks');
    h.m._creditLp(f, 1);
    assert.equal(h.m.teamLp, 8);
    h.m._teamLpLoss(2, [b.playerId]);
    assert.equal(h.m.teamLp, 8);
    assert.equal(b.relicShield, 0);
  } finally { h.m.dispose(); }
});

test('normal combat engine failure cannot fabricate a perfect-round reward', () => {
  const h = makeMatch({ mode: 'solo', fake: true, script: () => ({ throwInCtor: true }) }).start();
  try {
    h.toPrep(2);
    assert.equal(h.ps('p_0').relics.length, 0);
  } finally { h.m.dispose(); }
});

test('economy and lifetime: fixed income starts in the next prep; results retain collection and a fresh match resets it', () => {
  const h = makeMatch({ mode: 'solo', fake: true }).start();
  try {
    h.toPrep(1);
    const ps = h.ps('p_0');
    ps.relics.push({ id: 'relic_025', round: 7 });
    ps.funds = 0;
    ps.startRound(8);
    assert.equal(ps.funds, h.m.gd.income(8) + 1);
    h.m.finish({ victory: false, reason: 'abandoned' });
    assert.deepEqual(h.ended.players[0].relics, [{ id: 'relic_025', round: 7 }]);
    const fresh = makeMatch({ mode: 'solo', fake: true });
    assert.deepEqual(fresh.ps('p_0').relics, []);
    fresh.m.dispose();
  } finally { h.m.dispose(); }
});

for (const clientCombat of [false, true]) {
  test(`boss and Hidden Core wins award one perfect-round relic each (${clientCombat ? 'client' : 'server'} combat)`, () => {
    const h = makeMatch({ mode: 'solo', difficulty: 'HARD', fake: true, clientCombat,
      script: (b) => b.kind === 'boss' || b.kind === 'hidden' ? { bossDps: 1e8, duration: Infinity } : {} }).start();
    try {
      h.toPrep(1);
      h.ps('p_0').lp = 999;
      h.toPrep(14);
      // Use the real active-bond layer gate; endPrep recomputes hiddenLayerSum from player bonds.
      const ps = h.ps('p_0');
      ps.bondCountBonus.yanShip = 3;
      ps.layers.yanShip = 600;
      ps.recompute();
      assert.ok(h.m.hiddenBossId);
      assert.ok(h.drive(() => h.m.phase === PHASE.PREP && h.m.round === 15));
      assert.ok(h.ps('p_0').relics.some((r) => r.round === 14));
      assert.ok(h.drive(() => !!h.ended));
      const relics = h.ended.players[0].relics;
      assert.equal(relics.filter((r) => r.round === 15).length, 1);
      assert.equal(relics.length, 15);
      assert.equal(new Set(relics.map((r) => r.id)).size, 15);
    } finally { h.m.dispose(); h.clients?.closeAll(); }
  });
}

test('a defeated boss battle or a victorious boss battle with personal leaks gives no relic', () => {
  for (const victory of [false, true]) {
    const h = makeMatch({ mode: 'solo', difficulty: 'HARD', fake: true,
      script: (b) => b.kind === 'boss' ? { bossDps: victory ? 1e8 : 0, duration: Infinity,
        leaks: victory ? { p_0: 1 } : {} } : {} }).start();
    try {
      h.toPrep(14);
      h.ps('p_0').lp = 1;
      assert.ok(h.drive(() => !!h.ended));
      assert.equal(h.ended.victory, victory);
      assert.equal(h.ended.players[0].relics.filter((r) => r.round === 14).length, 0);
    } finally { h.m.dispose(); }
  }
});

for (const clientCombat of [false, true]) {
  test(`a surviving co-op player with a zero LP share still earns the perfect boss reward (${clientCombat ? 'client' : 'server'})`, () => {
    const h = makeMatch({ humans: 2, difficulty: 'NORMAL', fake: true, clientCombat,
      script: (b) => b.kind === 'boss' ? { bossDps: 1e8, duration: Infinity } : {} }).start();
    try {
      h.toPrep(14);
      h.ps('p_0').lp = 1;
      h.ps('p_1').lp = 0; // shared pool still has one LP; this seat has not been eliminated
      assert.ok(h.drive(() => !!h.ended));
      assert.equal(h.ended.victory, true);
      assert.equal(h.ended.teamLp, 1);
      const p = h.ended.players.find((p) => p.playerId === 'p_1');
      assert.equal(p.alive, true);
      assert.equal(p.lp, 0);
      assert.equal(p.relics.filter((r) => r.round === 14).length, 1);
    } finally { h.m.dispose(); h.clients?.closeAll(); }
  });
}
