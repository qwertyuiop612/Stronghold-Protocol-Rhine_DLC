import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMatch } from './harness.js';
import { drawAscensionLottery, LOTTERY_RELIC_WEIGHTS, LOTTERY_LEGENDARY_WEIGHTS } from '../../server/match/ascensionLottery.js';
import { grantRelic, activeReverseLp } from '../../server/match/relics.js';
import { RELICS, getRelic, pickRelic, dropWeights } from '../../shared/relics.js';

const seeds = { coins: 1, operators: 4, relics: 7, legendary: 10 };
function setup(seed = 1, opts = {}) {
  const h = makeMatch({ mode: 'solo', difficulty: 'ASCENSION', seed, fake: true, ...opts }).start();
  h.toPrep();
  return h;
}

for (const difficulty of ['FUNNY', 'NORMAL', 'HARD', 'ABYSS']) test(`${difficulty}: no fourth-round lottery`, () => {
  const h = setup(1, { difficulty });
  try { h.m.startRound(4); assert.equal(h.ps('p_0').ascensionLottery, null); }
  finally { h.m.dispose(); }
});

test('ASCENSION: only round four, including level zero, grants once and publishes a safe private result', () => {
  const h = setup(seeds.coins, { difficultyLevel: 0 });
  try {
    const ps = h.ps('p_0');
    for (const r of [2, 3]) { h.m.startRound(r); assert.equal(ps.ascensionLottery, null); }
    const before = ps.funds;
    h.m.startRound(4);
    assert.equal(ps.ascensionLottery.kind, 'coins');
    assert.equal(ps.funds, before + h.m.gd.income(4) + 15);
    const funds = ps.funds;
    assert.equal(drawAscensionLottery(ps), null);
    assert.equal(ps.funds, funds);
    const wire = ps.privateView().ascensionLottery;
    wire.ids.push('forged'); wire.text = 'forged';
    assert.deepEqual(ps.ascensionLottery.ids, []);
    assert.equal(ps.ascensionLottery.text, '15 金币');
    h.m.startRound(5);
    assert.equal(ps.funds, funds + h.m.gd.income(5));
    h.invariants();
  } finally { h.m.dispose(); }
});

test('rare collectible draw grants exactly one legendary, without healing or multiplying its effect', () => {
  const h = setup(seeds.legendary);
  try {
    const ps = h.ps('p_0'); ps.lp = 5;
    h.m.startRound(4);
    assert.equal(ps.ascensionLottery.kind, 'legendary');
    assert.equal(ps.ascensionLottery.ids.length, 1);
    const [id] = ps.ascensionLottery.ids;
    assert.equal(getRelic(id).tier, 5);
    assert.deepEqual(ps.relics, [{ id, round: 4 }]);
    assert.deepEqual(ps.battleInput().relics, [id], 'three matching reel pictures represent one effective collectible');
    assert.equal(ps.lp, 5);
    assert.equal(h.m.publicView().players.find((p) => p.playerId === ps.playerId).lp, 5);
    assert.equal(drawAscensionLottery(ps), null);
    assert.equal(ps.relics.length, 1);
    h.invariants();
  } finally { h.m.dispose(); }
});

test('operator draw uses persistent highest layers even when inactive, not activation tier', () => {
  const h = setup(seeds.operators);
  try {
    const ps = h.ps('p_0');
    const bond = h.m.gd.bondIds.find((b) => h.m.gd.bond(b).isCore
      && [...h.m.pool.entries.keys()].some((id) => h.m.gd.chess(id).bonds.includes(b)));
    ps.layers[bond] = 20;
    assert.equal(ps.bonds[bond].active, false);
    h.m.startRound(4);
    const reward = ps.ascensionLottery;
    assert.equal(reward.kind, 'operators'); assert.equal(reward.bondId, bond);
    assert.equal(reward.ids.length, 2);
    for (const id of reward.ids) assert.ok(h.m.gd.chess(id).bonds.includes(bond));
    assert.equal(ps.round.gainedChess, 2);
    h.invariants();
  } finally { h.m.dispose(); }
});

test('operator draw ties choose one highest-layer bond and both operators share it; zero layers still grants two', () => {
  for (const tied of [false, true]) {
    const h = setup(seeds.operators);
    try {
      const ps = h.ps('p_0');
      const bonds = h.m.gd.bondIds.filter((b) => [...h.m.pool.entries.keys()].some((id) => h.m.gd.chess(id).bonds.includes(b))).slice(0, 2);
      if (tied) for (const b of bonds) ps.layers[b] = 10;
      h.m.startRound(4);
      const reward = ps.ascensionLottery;
      if (tied) assert.ok(bonds.includes(reward.bondId));
      assert.equal(reward.ids.length, 2);
      for (const id of reward.ids) assert.ok(h.m.gd.chess(id).bonds.includes(reward.bondId));
      h.invariants();
    } finally { h.m.dispose(); }
  }
});

test('relic draw grants three distinct unowned collectibles without replacing choice offers', () => {
  const h = setup(seeds.relics);
  try {
    const ps = h.ps('p_0');
    ps.relics = [{ id: 'relic_003', round: 1 }];
    const offer = ps.relicOffer = { id: 'pending', round: 3, options: ['relic_004'] };
    h.m.startRound(4);
    assert.equal(ps.ascensionLottery.kind, 'relics');
    const ids = ps.ascensionLottery.ids;
    assert.equal(ids.length, 3); assert.equal(new Set(ids).size, 3);
    assert.ok(!ids.includes('relic_003'));
    for (const id of ids) { assert.ok(getRelic(id).tier <= 3); assert.ok(!getRelic(id).multiplayerOnly); }
    assert.equal(ps.relics.length, 4);
    assert.equal(ps.relicOffer, offer);
    assert.equal(ps.battleInput().relics.length, 4);
    h.invariants();
  } finally { h.m.dispose(); }
});

test('lottery acquisition keeps special collectible effects: phone reduction and time machine on upcoming R4 battle', () => {
  const h = setup(seeds.relics, { difficultyLevel: 8 });
  try {
    const ps = h.ps('p_0');
    ps.relics = RELICS.filter((r) => !['relic_157', 'relic_158'].includes(r.id)).map((r) => ({ id: r.id, round: 1 }));
    h.m.startRound(4);
    assert.deepEqual([...ps.ascensionLottery.ids].sort(), ['relic_157', 'relic_158']);
    assert.equal(h.m.difficultyLevel, 6);
    assert.equal(activeReverseLp(ps), true);
    assert.equal(grantRelic(ps, 'relic_157'), null, 'duplicate grants do not reduce difficulty again');
    h.m.startRound(5);
    assert.equal(activeReverseLp(ps), false);
  } finally { h.m.dispose(); }
});

test('multiplayer: one draw per surviving human or bot, no draws for eliminated/left seats, reconnect does not redraw', () => {
  const h = setup(7, { mode: 'coop', humans: 3, bots: 1 });
  try {
    h.ps('p_1').eliminate(3);
    h.ps('p_2').left = true;
    h.m.startRound(4);
    assert.ok(h.ps('p_0').ascensionLottery);
    assert.ok(h.ps('ai_0').ascensionLottery);
    assert.equal(h.ps('p_1').ascensionLottery, null);
    assert.equal(h.ps('p_2').ascensionLottery, null);
    const before = JSON.stringify(h.ps('p_0').privateView());
    h.m.onReconnect('p_0');
    assert.equal(JSON.stringify(h.ps('p_0').privateView()), before);
  } finally { h.m.dispose(); }
});

for (const clientCombat of [false, true]) test(`normal round progression reaches R4 and grants once (${clientCombat ? 'client' : 'server'} combat)`, () => {
  const h = setup(seeds.relics, { clientCombat });
  try {
    h.toPrep(3);
    assert.equal(h.ps('p_0').ascensionLottery, null);
    h.toPrep(4);
    const reward = h.ps('p_0').ascensionLottery;
    assert.equal(reward.kind, 'relics');
    assert.equal(reward.ids.length, 3);
    h.toPrep(5);
    assert.equal(h.ps('p_0').ascensionLottery, reward);
    h.invariants();
  } finally { h.m.dispose(); }
});

test('same seed and seat give deterministic rewards', () => {
  for (const seed of Object.values(seeds)) {
    const draws = [];
    for (let i = 0; i < 2; i++) {
      const h = setup(seed);
      try { h.m.startRound(4); draws.push(h.ps('p_0').privateView().ascensionLottery); }
      finally { h.m.dispose(); }
    }
    assert.deepEqual(draws[0], draws[1]);
  }
});

test('supply-specific tier weights are exactly 5/65/30 and legendary-only; ordinary drops keep their own weights', () => {
  assert.deepEqual(LOTTERY_RELIC_WEIGHTS, [5, 65, 30, 0, 0]);
  assert.deepEqual(LOTTERY_LEGENDARY_WEIGHTS, [0, 0, 0, 0, 100]);
  assert.deepEqual(dropWeights(4), [60, 28, 12, 0, 0]);
  for (const [roll, expected] of [[0, 1], [0.04999, 1], [0.05, 2], [0.69999, 2], [0.7, 3], [0.99999, 3]]) {
    let calls = 0;
    const rng = () => calls++ === 0 ? roll : 0;
    assert.equal(pickRelic(4, [], rng, { tierWeights: LOTTERY_RELIC_WEIGHTS }).tier, expected);
  }
  assert.equal(pickRelic(4, [], () => 0, { tierWeights: LOTTERY_LEGENDARY_WEIGHTS }).tier, 5);
});

test('supply pools exclude owned collectibles and never substitute a disallowed tier when exhausted', () => {
  for (const kind of ['relics', 'legendary']) {
    const h = setup(seeds[kind]);
    try {
      const ps = h.ps('p_0');
      ps.relics = RELICS.filter((r) => kind === 'relics' ? r.tier <= 3 : r.tier === 5).map((r) => ({ id: r.id, round: 1 }));
      const count = ps.relics.length;
      h.m.startRound(4);
      assert.equal(ps.ascensionLottery.kind, kind);
      assert.deepEqual(ps.ascensionLottery.ids, []);
      assert.equal(ps.relics.length, count);
    } finally { h.m.dispose(); }
  }
  const h = setup(seeds.legendary);
  try {
    const ps = h.ps('p_0');
    const only = RELICS.find((r) => r.tier === 5).id;
    ps.relics = RELICS.filter((r) => r.tier === 5 && r.id !== only).map((r) => ({ id: r.id, round: 1 }));
    h.m.startRound(4);
    assert.deepEqual(ps.ascensionLottery.ids, [only]);
  } finally { h.m.dispose(); }
});
