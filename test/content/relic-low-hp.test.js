import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, chessRec, enemyRec, checkInvariants, flatStage, flatRoutes } from '../helpers/battleHarness.js';
import { install } from '../../server/sim/content/relics.js';
import { DataSource } from '../../server/sim/simdata.js';
import { buildBattleSpec, createBattleFromSpec, resultDigest } from '../../server/sim/spec.js';

const IDS = ['relic_125', 'relic_126', 'relic_127'];
const skill = (spType = 'INCREASE_WITH_TIME') => ({ spType, spCost: 1000, initSp: 0, trigger: { rule: 'NEVER' } });
const defs = { chess: {
  guard: chessRec({ id: 'guard', skill: skill(), rangeGrid: [[0, 0]],
    stats: { maxHp: 2000, atk: 500, def: 0, respawnTime: 0.5 } }),
  medic: chessRec({ id: 'medic', profession: 'MEDIC', subProf: 'medic', skill: null,
    rangeGrid: [[0, 0], [0, 1]], stats: { maxHp: 2000, atk: 500 } }),
}, enemies: { dummy: enemyRec({ key: 'dummy', stats: { maxHp: 100000, atk: 0, def: 0, moveSpeed: 0 } }) },
tokens: { token: { name: 'test', stats: { maxHp: 2000, atk: 500 }, rangeGrid: [[0, 0]], skill: null } } };
const piece = (chessId = 'guard', uid = 1, col = 4) => ({ kind: 'chess', chessId, uid, row: 10, col });
const players = (relics) => [{ playerId: 'p1', seat: 0, side: 'L', relics, units: [piece()] }];
function setup(relics = IDS, extra = {}) {
  const h = makeBattle({ defs, players: players(relics), autoFinish: false, ...extra });
  h.step();
  return h;
}
const barrier = (u) => u.findBuff('relic:125:barrier')?.shield ?? 0;
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
const healthy = (h) => { assert.deepEqual(h.b.errors, []); checkInvariants(h.b); };

test('液体化肥：真实多目标多段攻击只触发一次，屏障抵挡伤害但不抵挡自身流失', () => {
  const h = setup(['relic_125'], { enemies: [{ key: 'dummy', pos: [10, 5] }, { key: 'dummy', pos: [10, 6] }] });
  const u = h.unit(1);
  u.profile = { ...u.profile, hits: 3 };
  const hp = u.hp, shield = barrier(u);
  assert.equal(h.b.forceAttack(u, h.enemies()), true);
  assert.equal(u.hp, hp - 50);
  assert.equal(barrier(u), shield + 100);
  const hp2 = u.hp;
  h.b.dealDamage(null, u, { amount: 50, type: 'true' });
  assert.equal(u.hp, hp2);
  assert.equal(barrier(u), shield + 50);
  h.b.forceAttack(u, h.enemies());
  assert.equal(u.hp, hp2 - 50);
  assert.equal(barrier(u), shield + 150);
  healthy(h);
});

test('液体化肥：最低 1 HP、独立 140% 屏障上限、重复安装和再部署', () => {
  const h = setup(['relic_125', 'relic_125']), u = h.unit(1);
  const count = h.b._hooks.attack.length;
  install(h.b);
  assert.equal(h.b._hooks.attack.length, count);
  h.b.addBuff(u, { key: 'other', shield: 500 });
  u.hp = 20;
  for (let i = 0; i < 35; i++) h.b.emit('attack', { attacker: u });
  assert.equal(u.hp, 1);
  assert.equal(barrier(u), 2800);
  assert.equal(u.findBuff('other').shield, 500);
  assert.equal(u.s.shield, 3300);
  h.b.addBuff(u, { key: 'max', mods: { hpPct: 1 } });
  h.b.emit('attack', { attacker: u });
  assert.equal(barrier(u), 2900);
  for (let i = 0; i < 40; i++) h.b.emit('attack', { attacker: u });
  assert.equal(barrier(u), 5600);
  h.b.removeBuff(u, 'max');
  h.b.emit('attack', { attacker: u });
  assert.equal(barrier(u), 2800, 'next gain uses the current maximum HP');
  h.b.loseHp(u, 10000);
  assert.ok(h.runUntil(() => u.alive && u.deployed, 2));
  assert.equal(barrier(u), 0);
  h.b.emit('attack', { attacker: u });
  assert.equal(barrier(u), 100);
  assert.equal(u.hp, 1950);
  healthy(h);
});

test('液体化肥：1 HP 时伤害先由屏障吸收（血量停在 1），屏障耗尽后照常被打死', () => {
  const h = setup(['relic_125']), u = h.unit(1);
  for (let i = 0; i < 40; i++) h.b.emit('attack', { attacker: u });
  assert.equal(u.hp, 1);
  assert.equal(barrier(u), 2800, 'the 140 % pool is full');
  h.b.dealDamage(null, u, { amount: 300, type: 'true' });
  assert.equal(u.hp, 1, 'a blow inside the pool never moves the last HP point');
  assert.equal(barrier(u), 2500);
  h.b.dealDamage(null, u, { amount: 2600, type: 'true' });
  assert.equal(barrier(u), 0);
  assert.equal(u.alive, false, 'the pool is spent, so the killing blow still lands');
  assert.ok(h.runUntil(() => u.alive && u.deployed, 2));
  assert.equal(u.hp, u.s.maxHp);
  healthy(h);
});

test('热辣可可与止痛片：即时血量插值、治疗回落、百分比叠加和最大生命变化', () => {
  const h = setup(['relic_126', 'relic_126', 'relic_127', 'relic_003']), u = h.unit(1);
  for (const [ratio, atkPct, sp] of [[1, 0, 1], [0.65, 0.75, 2], [0.3, 1.5, 3], [0.01, 1.5, 3]]) {
    u.hp = ratio * u.s.maxHp;
    near(u.s.atk, 500 * (1.08 + atkPct));
    near(u.s.spRecovery, sp);
  }
  u.hp = 600;
  h.b.heal(u, u, 700);
  near(u.s.atk, 915);
  near(u.s.spRecovery, 2);
  h.b.addBuff(u, { key: 'max', mods: { hpPct: 1 } });
  near(u.s.atk, 915);
  assert.equal(u.hp, 2600);
  near(u.s.spRecovery, 2);
  h.b.heal(u, u, 10000);
  near(u.s.atk, 540);
  near(u.s.spRecovery, 1);
  h.b.dealDamage(null, u, { amount: 2800, type: 'true' });
  near(u.s.atk, 1290);
  near(u.s.spRecovery, 3);
  healthy(h);
});

test('止痛片：真实自然回复增速与阻回，攻击/受击回复不获自然技力', () => {
  for (const spType of ['INCREASE_WITH_TIME', 'INCREASE_WHEN_ATTACK', 'INCREASE_WHEN_TAKEN_DAMAGE']) {
    const h = setup(['relic_127'], { defs: { ...defs, chess: { guard: chessRec({ ...defs.chess.guard, skill: skill(spType) }) } } });
    const u = h.unit(1);
    u.hp = 600;
    const start = u.skill.sp;
    h.step(30);
    near(u.skill.sp - start, spType === 'INCREASE_WITH_TIME' ? 3 : 0);
    h.b.addBuff(u, { key: 'noSp', flags: { noSp: true } });
    const blocked = u.skill.sp;
    h.step(30);
    near(u.skill.sp, blocked);
    healthy(h);
  }
});

test('止痛片：持续技能期间停回，晕眩不额外阻止自然回复', () => {
  const h = setup(['relic_127']), u = h.unit(1);
  u.hp = 600;
  u.skill.kind = 'duration'; u.skill.active = true; u.skill.timeLeft = 5;
  const start = u.skill.sp;
  h.step(30);
  near(u.skill.sp, start);
  u.skill.active = false;
  h.b.applyStatus(u, 'stun', { duration: 3 });
  h.step(30);
  near(u.skill.sp - start, 3);
  healthy(h);
});

test('液体化肥：治疗普攻计一次，独立技能伤害不增加屏障', () => {
  const input = players(['relic_125']);
  input[0].units = [piece('medic', 1, 4), piece('guard', 2, 5)];
  const h = setup(['relic_125'], { players: input }), medic = h.unit(1), guard = h.unit(2);
  guard.hp = 1500;
  assert.equal(h.b.forceAttack(medic, [guard]), true);
  assert.equal(guard.hp, 2000);
  assert.equal(medic.hp, 1950);
  assert.equal(barrier(medic), 100);
  h.b.dealDamage(medic, guard, { amount: 100, type: 'true', isSkill: true });
  assert.equal(barrier(medic), 100);
  healthy(h);
});

test('三件藏品：仅持有者干员受益，召唤物、队友、未领取与离场均不触发', () => {
  const input = players(IDS);
  input[0].units.push({ kind: 'token', tokenId: 'token', ownerUid: 1, uid: 2, row: 11, col: 4 });
  const h = setup(IDS, { players: input }), u = h.unit(1), token = h.unit(2);
  for (const t of [token, u]) {
    if (t === u) u.ownerId = 'p2';
    t.hp = 600;
    h.b.emit('attack', { attacker: t });
    assert.equal(t.hp, 600);
    assert.equal(barrier(t), 0);
  }
  // A real teammate is constructed without the owner's persistent buffs.
  const team = setup(IDS, { players: [...players(IDS), { playerId: 'p2', seat: 1, side: 'L', relics: [], units: [piece('guard', 3, 7)] }] });
  const other = team.unit(3);
  other.hp = 600;
  near(other.s.atk, 500); near(other.s.spRecovery, 1);
  const plain = setup([]), p = plain.unit(1);
  p.hp = 600;
  plain.b.emit('attack', { attacker: p });
  assert.equal(p.hp, 600); near(p.s.atk, 500); near(p.s.spRecovery, 1);
  u.ownerId = 'p1'; u.deployed = false;
  h.b.emit('attack', { attacker: u });
  assert.equal(u.hp, 600); assert.equal(barrier(u), 0);
  u.deployed = true;
  healthy(h); healthy(plain); healthy(team);
});

test('三件藏品：联防继承血量、再部署恢复与 JSON 两端一致', () => {
  const input = players(IDS);
  input[0].units[0].carryState = { hpPct: 0.3, sp: 0 };
  const raw = { ...defs, stages: { low: flatStage({ id: 'low' }) } };
  const spec = buildBattleSpec({ battleId: 'low', fieldId: 'u:p1', kind: 'unite', seed: 19,
    stageId: 'low', round: 7, timeLimit: 2, players: input, routes: flatRoutes(),
    spawns: [{ time: 10, enemyKey: 'dummy', routeIndex: 0 }] });
  const a = createBattleFromSpec(spec, new DataSource(raw, null), { quiet: true });
  const b = createBattleFromSpec(JSON.parse(JSON.stringify(spec)), new DataSource(JSON.parse(JSON.stringify(raw)), null), { quiet: true });
  for (const battle of [a, b]) {
    battle.step();
    const u = battle.allyUnits[0];
    near(u.s.atk, 1250); near(u.s.spRecovery, 3);
    battle.emit('attack', { attacker: u });
    assert.equal(u.hp, 550); assert.equal(barrier(u), 100);
    battle.loseHp(u, 10000);
    for (let i = 0; i < 40 && !u.alive; i++) battle.step();
    assert.ok(u.alive && u.deployed);
    near(u.s.atk, 500); near(u.s.spRecovery, 1);
    assert.equal(barrier(u), 0);
    battle.runToEnd(3);
    assert.deepEqual(battle.errors, []); checkInvariants(battle);
  }
  assert.equal(resultDigest(a.result()).hash, resultDigest(b.result()).hash);
});
