import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, chessRec, checkInvariants, flatStage, flatRoutes } from '../helpers/battleHarness.js';
import { install } from '../../server/sim/content/relics.js';
import { RESIST_STATUSES } from '../../server/sim/buffs.js';
import { DataSource } from '../../server/sim/simdata.js';
import { buildBattleSpec, createBattleFromSpec, resultDigest } from '../../server/sim/spec.js';

const ID = 'relic_172';
const defs = { chess: {
  medic: chessRec({ id: 'medic', profession: 'MEDIC', subProf: 'medic', skill: null,
    rangeGrid: [[0, 0], [0, 1]], stats: { maxHp: 2000, atk: 500, respawnTime: 0.5 } }),
  guard: chessRec({ id: 'guard', skill: null, stats: { maxHp: 2000, atk: 0, respawnTime: 0.5 } }),
}, tokens: { token: { name: 'test', stats: { maxHp: 2000 }, rangeGrid: [[0, 0]], skill: null } } };
const piece = (chessId, uid, col) => ({ kind: 'chess', chessId, uid, row: 10, col });
const players = (relics) => [{ playerId: 'p1', seat: 0, side: 'L', relics,
  units: [piece('medic', 1, 4), piece('guard', 2, 5), piece('guard', 3, 7),
    { kind: 'token', tokenId: 'token', ownerUid: 1, uid: 4, row: 11, col: 4 }] }];
function setup(relics = [ID]) {
  const h = makeBattle({ defs, players: players(relics), autoFinish: false });
  h.step();
  return h;
}
const shield = (u) => u.findBuff('overheal')?.shield ?? 0;
const healthy = (h) => { assert.deepEqual(h.b.errors, []); checkInvariants(h.b); };

test('护愈之手：医疗真实普攻产生溢出屏障，重叠范围只转化一次', () => {
  const input = players([ID]);
  input[0].units.push(piece('medic', 5, 6));
  const h = makeBattle({ defs, players: input, autoFinish: false });
  h.step();
  const u = h.unit(2), second = h.unit(5);
  second.rangeKeySet = new Set(h.unit(1).rangeKeys);
  second.atkCd = 100;
  u.hp -= 100;
  assert.ok(h.runUntil(() => shield(u) > 0, 5));
  assert.equal(shield(u), 400, 'one 500-point heal restores 100 HP and converts 400');
  assert.equal(u.hp, u.s.maxHp);
  healthy(h);
});

test('护愈之手：范围、状态种类、死亡及再部署实时判断，重复安装不叠加', () => {
  const h = setup([ID, ID]), m = h.unit(1), u = h.unit(2), outside = h.unit(3);
  const hooks = h.b._hooks.beforeStatus.length;
  install(h.b);
  assert.equal(h.b._hooks.beforeStatus.length, hooks);
  for (const status of [...RESIST_STATUSES, 'palsy']) {
    assert.equal(h.b.applyStatus(u, status, { duration: 3 }), false, status);
    assert.equal(h.b.applyStatus(m, status, { duration: 3 }), false, `self: ${status}`);
  }
  assert.equal(h.b.applyStatus(outside, 'stun', { duration: 3 }), true);
  assert.equal(h.b.applyStatus(u, 'fragile', { duration: 3, value: 0.2 }), true, 'stat debuffs remain');
  assert.equal(h.b.applyStatus(u, 'resist', { duration: 3 }), true, 'positive status remains');
  m.rangeKeySet = new Set();
  assert.equal(h.b.applyStatus(u, 'freeze', { duration: 3 }), true, 'range loss is immediate');
  m.rangeKeySet = new Set(m.rangeKeys);
  h.step();
  assert.equal(u.findBuff('freeze'), null, 'entering coverage cleanses');
  h.b.dealDamage(null, m, { amount: 10000, type: 'true' });
  assert.equal(h.b.applyStatus(u, 'stun', { duration: 3 }), true, 'dead medic provides no aura');
  assert.ok(h.runUntil(() => m.alive && m.deployed, 2));
  assert.equal(u.findBuff('stun'), null);
  healthy(h);
});

test('护愈之手：实际溢出治疗、倍率、叠加上限、屏障承伤与再部署清理', () => {
  const h = setup([ID, ID]), m = h.unit(1), u = h.unit(2);
  u.hp -= 100;
  h.b.addBuff(m, { key: 'test:heal', mods: { healingDealtMul: 2 } });
  h.b.addBuff(u, { key: 'test:received', mods: { healingTakenMul: 1.5 } });
  assert.equal(h.b.heal(m, u, 200), 100);
  assert.equal(shield(u), 500, '600 effective healing less 100 HP restored');
  assert.equal(m.stats.heal, 100, 'shield is not reported as actual healing');
  h.b.heal(m, u, 200);
  assert.equal(shield(u), 1100);
  h.b.heal(m, u, 10000);
  assert.equal(shield(u), u.s.maxHp);
  h.b.dealDamage(null, u, { amount: 500, type: 'true' });
  assert.equal(u.hp, u.s.maxHp);
  assert.equal(shield(u), 1500);
  m.rangeKeySet = new Set();
  h.b.heal(m, u, 100);
  assert.equal(shield(u), 1500, 'leaving range keeps existing shield but stops new gains');
  h.b.dealDamage(null, u, { amount: 10000, type: 'true' });
  assert.ok(h.runUntil(() => u.alive && u.deployed, 2));
  assert.equal(shield(u), 0, 'barrier does not survive redeployment');
  healthy(h);
});

test('护愈之手：未领取、范围外、召唤物、队友、禁疗和回复均不转屏障，选项不外泄', () => {
  const h = setup(), m = h.unit(1), u = h.unit(2), out = h.unit(3), token = h.unit(4);
  const opts = {};
  h.b.heal(m, u, 100, opts);
  h.b.heal(m, out, 100, opts);
  assert.deepEqual(opts, {});
  assert.equal(shield(out), 0);
  m.rangeKeySet = new Set([...m.rangeKeys, token.tileR * 21 + token.tileC, out.tileR * 21 + out.tileC]);
  h.b.heal(m, token, 100);
  assert.equal(shield(token), 0);
  out.ownerId = 'p2';
  h.b.heal(m, out, 100);
  assert.equal(shield(out), 0);
  assert.equal(h.b.applyStatus(out, 'stun', { duration: 3 }), true);
  h.b.removeBuff(u, 'overheal');
  h.b.heal(u, u, 100, { regen: true });
  assert.equal(shield(u), 0);
  h.b.addBuff(u, { key: 'test:noHeal', flags: { noHeal: true } });
  h.b.heal(m, u, 100);
  assert.equal(shield(u), 0);
  const plain = setup([]);
  plain.b.heal(plain.unit(1), plain.unit(2), 500);
  assert.equal(shield(plain.unit(2)), 0);
  assert.equal(plain.b.applyStatus(plain.unit(2), 'stun', { duration: 3 }), true);
  healthy(h); healthy(plain);
});

test('护愈之手：JSON 战斗输入的两端重建提供相同免疫、屏障和结果', () => {
  const raw = { ...defs, stages: { hand: flatStage({ id: 'hand' }) } };
  const spec = buildBattleSpec({ battleId: 'hand', fieldId: 'n:p1', kind: 'normal', seed: 19,
    stageId: 'hand', round: 7, timeLimit: 2, players: players([ID]), routes: flatRoutes(), spawns: [] });
  const a = createBattleFromSpec(spec, new DataSource(raw, null), { quiet: true });
  const b = createBattleFromSpec(JSON.parse(JSON.stringify(spec)), new DataSource(JSON.parse(JSON.stringify(raw)), null), { quiet: true });
  for (const battle of [a, b]) {
    battle.step();
    const [m, u] = battle.allyUnits;
    u.hp -= 100;
    battle.heal(m, u, 500);
    assert.equal(shield(u), 400);
    assert.equal(battle.applyStatus(u, 'stun', { duration: 3 }), false);
    battle.runToEnd(3);
    assert.deepEqual(battle.errors, []);
    checkInvariants(battle);
  }
  assert.equal(resultDigest(a.result()).hash, resultDigest(b.result()).hash);
});
