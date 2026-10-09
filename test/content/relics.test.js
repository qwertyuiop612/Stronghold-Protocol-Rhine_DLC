import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, chessRec, enemyRec, flatStage, flatRoutes, checkInvariants } from '../helpers/battleHarness.js';
import { install as installRelics } from '../../server/sim/content/relics.js';
import { DataSource } from '../../server/sim/simdata.js';
import { buildBattleSpec, createBattleFromSpec, resultDigest } from '../../server/sim/spec.js';

const ATK = 'relic_003';
const HP = 'relic_008';
const DEF = 'relic_047';
const GUARD_ATK = 'relic_145';
const SP = 'relic_038';
const PHYS = 'relic_043';
const REGEN = 'relic_080';
const BELL = 'relic_154';
const SHIRT = 'relic_155';

const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-7, `${message}: ${actual} != ${expected}`);
const op = (id, profession = 'WARRIOR', extra = {}) => chessRec({
  id, profession, skill: null,
  stats: { maxHp: 2000, atk: 500, def: 200, respawnTime: 0.5 },
  ...extra,
});
const piece = (chessId = 'r_guard', uid = 1, row = 10, col = 4) => ({ uid, kind: 'chess', chessId, row, col });
const player = (relics, units = [piece()], extra = {}) => ({ playerId: 'p1', seat: 0, side: 'L', relics, units, ...extra });
function fight(relics = [], extra = {}) {
  return makeBattle({
    defs: { chess: { r_guard: op('r_guard') } },
    players: [player(relics)], timeLimit: 60, autoFinish: false,
    ...extra,
  });
}
function healthy(h) {
  assert.deepEqual(h.b.errors, []);
  checkInvariants(h.b);
}

test('原创收藏品：整组兑换聚合属性，动态增益移除与重复安装不会累加', () => {
  for (const [id, expectedDef, expectedRes] of [[BELL, 0, 18.5], [SHIRT, 875, 0]]) {
    const h = fight([id, id, DEF], { defs: { chess: { r_guard: op('r_guard', 'WARRIOR', {
      stats: { maxHp: 2000, atk: 500, def: 275, res: 12.5, respawnTime: 0.5 },
    }) } } });
    h.step();
    const u = h.unit(1);
    close(u.s.def, id === BELL ? expectedDef : expectedDef + 41.25, '兑换前包含其他收藏品防御增益');
    close(u.s.res, expectedRes, '整组兑换，零头不保留');
    const buff = h.b.addBuff(u, { key: 'test:conversion', mods: { defFlat: 100, resFlat: 2 } });
    close(u.s.def, id === BELL ? 0 : 431.25 + 700, '属性变化后重新兑换');
    close(u.s.res, id === BELL ? 22.5 : 0, '属性变化后的法抗');
    h.b.removeBuff(u, buff);
    installRelics(h.b);
    close(u.s.def, id === BELL ? 0 : 916.25, '移除临时增益并重复安装不叠加');
    close(u.s.res, expectedRes, '重复安装法抗稳定');
    h.b.dealDamage(null, u, { amount: 10000, type: 'true' });
    assert.ok(h.runUntil(() => u.alive, 2));
    close(u.s.def, id === BELL ? 0 : 916.25, '再部署防御稳定');
    close(u.s.res, expectedRes, '再部署法抗稳定');
    healthy(h);
  }
});

test('原创收藏品：同时持有清空防御法抗并在真实伤害管线减少物理及法术伤害90%', () => {
  for (const relics of [[BELL, SHIRT], [SHIRT, BELL, BELL]]) {
    const h = fight(relics, { defs: { chess: { r_guard: op('r_guard', 'WARRIOR', {
      stats: { maxHp: 10000, atk: 500, def: 275, res: 12.5, respawnTime: 0.5 },
    }) } } });
    h.step();
    const u = h.unit(1);
    close(u.s.def, 0, '组合移除全部防御');
    close(u.s.res, 0, '组合移除全部法抗');
    h.b.addBuff(u, { key: 'test:extra-defense', mods: { defFlat: 1000, defPct: 1, resFlat: 80 } });
    close(u.s.def, 0, '其他来源防御也全部移除');
    close(u.s.res, 0, '其他来源法抗也全部移除');
    for (const [type, expected] of [['phys', 100], ['arts', 100], ['true', 1000], ['elemental', 1000]]) {
      const hp = u.hp;
      h.b.dealDamage(null, u, { amount: 1000, type });
      close(hp - u.hp, expected, type);
    }
    h.b.dealDamage(null, u, { amount: 100000, type: 'true' });
    assert.ok(h.runUntil(() => u.alive, 2));
    close(u.s.def, 0, '再部署继续清空防御');
    close(u.s.res, 0, '再部署继续清空法抗');
    close(u.s.physTakenMul, 0.1, '再部署保持物理减伤');
    close(u.s.artsTakenMul, 0.1, '再部署保持法术减伤');
    healthy(h);
  }
});

test('原创收藏品：组合只按同一持有者计算，队友与召唤物不参与兑换', () => {
  const h = makeBattle({ kind: 'unite', defs: {
    chess: { r_guard: op('r_guard', 'WARRIOR', { stats: { maxHp: 2000, def: 275, res: 12 } }) },
    tokens: { r_token: { name: 'test', stats: { maxHp: 2000, def: 275, res: 12 }, rangeGrid: [[0, 0]], skill: null } },
  }, players: [
    player([BELL], [piece(), { uid: 3, kind: 'token', tokenId: 'r_token', ownerUid: 1, row: 10, col: 5 }]),
    player([SHIRT], [piece('r_guard', 2)], { playerId: 'p2', seat: 1, colOffset: 8 }),
  ], autoFinish: false });
  h.step();
  close(h.unit(1).s.def, 0, '本人金钟罩');
  close(h.unit(1).s.res, 17, '本人兑换');
  close(h.unit(2).s.def, 875, '队友铁布衫独立兑换');
  close(h.unit(2).s.res, 0, '队友法抗扣除');
  close(h.unit(3).s.def, 275, '召唤物不兑换');
  close(h.unit(3).s.res, 12, '召唤物不加法抗');
  healthy(h);
});

test('原创收藏品：零属性、不足整组、法抗边界均保持有效', () => {
  for (const [id, def, res, wantDef, wantRes] of [
    [BELL, 49, 0, 0, 0], [BELL, 0, 10, 0, 10], [BELL, 10000, 80, 0, 100],
    [SHIRT, 10, 0.5, 10, 0], [SHIRT, 0, 0, 0, 0], [SHIRT, 200, 150, 5200, 0],
  ]) {
    const h = fight([id], { defs: { chess: { r_guard: op('r_guard', 'WARRIOR', { stats: { maxHp: 2000, def, res } }) } } });
    h.step();
    close(h.unit(1).s.def, wantDef, '边界防御');
    close(h.unit(1).s.res, wantRes, '边界法抗');
    healthy(h);
  }
});

test('relics: trusted IDs give real operator attributes and damage; duplicate, unknown and client modifiers are ignored', () => {
  const h = fight([ATK, HP, DEF, PHYS, ATK, '__unknown__', { id: ATK, mods: { atkPct: 999 } }], {
    defs: {
      chess: { r_guard: op('r_guard') },
      enemies: { r_dummy: enemyRec({ key: 'r_dummy', hp: 1e7, speed: 0, def: 0, res: 0 }) },
    },
  });
  h.step();
  const u = h.unit(1);
  close(u.s.atk, 540, 'ATK +8%');
  close(u.s.maxHp, 2300, 'HP +15%');
  close(u.hp, 2300, 'initial deployment at full augmented HP');
  close(u.s.def, 230, 'DEF +15%');
  const enemy = h.spawn('r_dummy', { pos: [10, 5] });
  const before = enemy.hp;
  h.b.dealDamage(u, enemy, { amount: u.s.atk, type: 'phys' });
  close(before - enemy.hp, 540 * 1.3, 'the real damage pipeline applies the physical damage relic');
  assert.equal(u.buffs.filter((b) => b.key.startsWith('relic:')).length, 1);
  healthy(h);
});

test('relics: ownership, profession and kind isolate bonuses on a shared field', () => {
  const h = makeBattle({
    kind: 'unite',
    defs: {
      chess: { r_guard: op('r_guard'), r_medic: op('r_medic', 'MEDIC') },
      tokens: { r_token: { name: 'test summon', profession: 'WARRIOR', stats: { maxHp: 2000, atk: 500, def: 200 }, rangeGrid: [[0, 0]], skill: null } },
    },
    players: [
      player([ATK, GUARD_ATK], [piece(), piece('r_medic', 2, 11, 4), { uid: 3, kind: 'token', tokenId: 'r_token', ownerUid: 1, row: 10, col: 5 }]),
      player([], [piece('r_guard', 4, 10, 4)], { playerId: 'p2', seat: 1, colOffset: 8 }),
    ],
    autoFinish: false,
  });
  h.step();
  close(h.unit(1).s.atk, 665, 'the owner guard receives global +8% and guard +25%');
  close(h.unit(2).s.atk, 540, 'a different profession receives only the global bonus');
  close(h.unit(3).s.atk, 500, 'a summon receives no operator relic even with WARRIOR profession');
  close(h.unit(4).s.atk, 500, 'the other player receives no bonus');
  healthy(h);
});

test('relics: death, redeployment and repeated installation preserve one copy of each collection bonus', () => {
  const h = fight([ATK, HP, GUARD_ATK], { flags: { dpInit: 100, dpMax: 100 } });
  h.step();
  const u = h.unit(1);
  installRelics(h.b);
  close(u.s.atk, 665, 're-installation replaces the collection buff');
  for (let i = 0; i < 3; i++) {
    h.b.kill(u);
    assert.ok(!u.alive);
    close(u.s.atk, 665, 'the bonus survives death');
    assert.ok(h.runUntil(() => u.alive && u.deployed, 2), 'the operator redeploys');
    close(u.s.atk, 665, 'redeployment keeps the original attack bonus');
    close(u.s.maxHp, 2300, 'redeployment keeps the original max HP');
    close(u.hp, 2300, 'redeployment restores full augmented HP');
    assert.equal(u.buffs.filter((b) => b.key.startsWith('relic:')).length, 1);
    healthy(h);
  }
});

test('relics: melee and ranged bonuses use the actual deployment position', () => {
  const h = makeBattle({
    defs: { chess: {
      r_melee: op('r_melee', 'WARRIOR'),
      r_ranged: op('r_ranged', 'SNIPER'),
    } },
    players: [player(['relic_050'], [piece('r_melee'), piece('r_ranged', 2, 11, 4)])],
    autoFinish: false,
  });
  h.step();
  close(h.unit(1).s.atk, 600, 'melee operators receive the +20% bonus');
  close(h.unit(2).s.atk, 500, 'ranged operators receive no melee bonus');
  healthy(h);
});

test('relics: overlapping global, profession and position attack bonuses add without a collection cap', () => {
  const h = fight([ATK, GUARD_ATK, 'relic_052']);
  h.step();
  close(h.unit(1).s.atk, 840, '8% + 25% + 35% adds to 68%');
  healthy(h);
});

test('relics: normal-to-unite carry preserves the HP ratio without multiplying the collection again', () => {
  const relics = [ATK, HP, GUARD_ATK];
  const h = fight(relics);
  h.step();
  const initial = h.unit(1);
  initial.hp = initial.s.maxHp * 0.4;
  const carry = h.result().perPlayer.p1.unitsEnd[0];
  const g = fight(relics, { kind: 'unite', players: [player(relics, [{ ...piece(), carryState: { hpPct: carry.hpPct, sp: carry.sp, skillActive: carry.skillActive } }])] });
  g.step();
  const joined = g.unit(1);
  close(joined.s.atk, 665, 'a fresh shared-field battle receives the same bonus once');
  close(joined.s.maxHp, 2300, 'shared-field max HP stays equal');
  close(joined.hp, 920, 'the carried HP ratio uses augmented max HP');
  healthy(g);

  const down = fight(relics, { kind: 'unite', players: [player(relics, [{ ...piece(), carryState: { hpPct: 0, down: true } }])] });
  down.step();
  assert.ok(!down.unit(1).alive, 'a knocked-down carried operator is forced out at shared-field start');
  assert.ok(down.runUntil(() => down.unit(1).alive, 2));
  close(down.unit(1).s.atk, 665, 'forced-exit redeployment also retains one copy');
  close(down.unit(1).hp, 2300, 'forced-exit redeployment restores full HP');
  healthy(down);
});

test('relics: natural SP recovery affects time skills while attack recovery keeps its own rules', () => {
  const skill = (spType) => ({ spType, spCost: 1000, initSp: 0 });
  const h = makeBattle({
    defs: { chess: {
      r_time: op('r_time', 'WARRIOR', { skill: skill('INCREASE_WITH_TIME') }),
      r_attack: op('r_attack', 'WARRIOR', { skill: skill('INCREASE_WHEN_ATTACK') }),
    } },
    players: [player([SP], [piece('r_time'), piece('r_attack', 2, 11, 4)])],
    autoFinish: false,
  });
  h.run(10);
  close(h.unit(1).skill.sp, 11, 'natural recovery is 1.1 SP per second');
  close(h.unit(2).skill.sp, 0, 'attack recovery gets no passive time-based SP');
  healthy(h);
});

test('relics: passive regeneration scales from augmented max HP in the real tick loop', () => {
  const h = fight([HP, REGEN]);
  h.step();
  const u = h.unit(1);
  u.hp = 1000;
  h.run(1);
  close(u.hp, 1000 + 50 + 2300 * 0.02, '1 second heals 50 HP plus 2% of augmented max HP');
  healthy(h);
});

test('收藏品：固定回血与百分比回血完整相加，物理与法术伤害突破旧上限', () => {
  const h = fight(['relic_001', HP, REGEN, 'relic_041', 'relic_042', PHYS, 'relic_044', 'relic_045', 'relic_046'], {
    defs: {
      chess: { r_guard: op('r_guard') },
      enemies: { r_dummy: enemyRec({ key: 'r_dummy', hp: 1e7, speed: 0, def: 0, res: 0 }) },
    },
  });
  h.step();
  const u = h.unit(1);
  u.hp = 1000;
  h.run(1);
  close(u.hp, 1000 + 100 + 2300 * 0.02, '两件藏品的固定回血合计 100 点，与 2% 最大生命回血均完整生效');
  const enemy = h.spawn('r_dummy', { pos: [10, 5] });
  for (const type of ['phys', 'arts']) {
    const before = enemy.hp;
    h.b.dealDamage(u, enemy, { amount: 500, type });
    close(before - enemy.hp, 500 * 1.6, '10% + 20% + 30% 伤害增幅完整相加');
  }
  healthy(h);
});

test('relics: a JSON battle spec reconstructs the same bonuses and result on server and browser data sources', () => {
  const raw = {
    chess: { r_guard: op('r_guard') },
    enemies: { r_target: enemyRec({ key: 'r_target', hp: 1100, speed: 0, def: 0, res: 0 }) },
    stages: { relic_stage: flatStage({ id: 'relic_stage' }) },
  };
  const spec = buildBattleSpec({
    battleId: 'relic-test', fieldId: 'n:p1', kind: 'normal', seed: 77, stageId: 'relic_stage', round: 6,
    timeLimit: 20, players: [player([ATK, HP, PHYS, BELL, SHIRT])], routes: flatRoutes(),
    spawns: [{ time: 0, enemyKey: 'r_target', routeIndex: 0, pos: [10, 5] }],
  });
  const server = createBattleFromSpec(spec, new DataSource(raw, null), { quiet: true });
  const browser = createBattleFromSpec(JSON.parse(JSON.stringify(spec)), new DataSource(JSON.parse(JSON.stringify(raw)), null), { quiet: true });
  server.step(); browser.step();
  close(server.allyUnits[0].s.atk, 540, 'server spec gives the bonus');
  close(browser.allyUnits[0].s.maxHp, 2300, 'browser spec gives the HP bonus');
  server.runToEnd(30); browser.runToEnd(30);
  assert.equal(server.result().killed, 1, 'the real operator defeats the target');
  assert.equal(resultDigest(server.result()).hash, resultDigest(browser.result()).hash);
  assert.deepEqual(server.errors, []);
  assert.deepEqual(browser.errors, []);
  checkInvariants(server); checkInvariants(browser);
});
