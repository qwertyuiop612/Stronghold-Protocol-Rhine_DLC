import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, chessRec, enemyRec, checkInvariants, flatStage, flatRoutes } from '../helpers/battleHarness.js';
import { install } from '../../server/sim/content/relics.js';
import { DataSource } from '../../server/sim/simdata.js';
import { buildBattleSpec, createBattleFromSpec, resultDigest } from '../../server/sim/spec.js';

const IDS = ['relic_139', 'relic_140'];
const skillDef = (extra = {}) => ({ spCost: 20, initSp: 0, duration: 0.2,
  spType: 'INCREASE_WHEN_ATTACK', trigger: { rule: 'NEVER' }, ...extra });
const piece = (uid = 1, col = 4) => ({ kind: 'chess', chessId: 'guard', uid, row: 10, col });
const players = (relics) => [{ playerId: 'p1', seat: 0, side: 'L', relics, units: [piece()] }];
function setup(relics = IDS, skill = skillDef(), extra = {}) {
  const h = makeBattle({ defs: { chess: { guard: chessRec({ id: 'guard', skill,
    stats: { respawnTime: 0.5 } }) },
  enemies: { dummy: enemyRec({ key: 'dummy', hp: 100000, atk: 0, speed: 0 }) },
  tokens: { token: { name: 'test', stats: { maxHp: 2000 }, rangeGrid: [[0, 0]], skill: null } } },
  players: players(relics), autoFinish: false, ...extra });
  h.step();
  for (const u of h.b.allyUnits) u.skill.setSpTotal(0);
  return h;
}
const healthy = (h) => { assert.deepEqual(h.b.errors, []); checkInvariants(h.b); };

test('技能结束返还：两件分别 +2/+4，叠加 +6，三种技力回复类型均可强制绕过阻回', () => {
  for (const spType of ['INCREASE_WITH_TIME', 'INCREASE_WHEN_ATTACK', 'INCREASE_WHEN_TAKEN_DAMAGE']) {
    for (const [ids, amount] of [[[], 0], [[IDS[0]], 2], [[IDS[1]], 4], [IDS, 6]]) {
      const h = setup(ids, skillDef({ spType })), u = h.unit(1);
      h.b.addBuff(u, { key: 'blocked', flags: { noSp: true } });
      assert.equal(u.skill.activate('manual', { free: true }), true);
      assert.equal(u.skill.sp, 0, '开启技能不提前返还');
      assert.equal(u.skill.gainSp(1, 'gift'), 0, '普通技力赠予仍受阻回限制');
      assert.ok(h.runUntil(() => !u.skill.active, 1));
      assert.equal(u.skill.sp, amount, `${spType}: ${ids}`);
      assert.equal(u.s.flags.noSp, true, '不移除其他来源的阻回');
      h.step(10);
      assert.equal(u.skill.sp, amount, '同一次结束只触发一次');
      healthy(h);
    }
  }
});

test('技能结束返还：即时技能和弹药耗尽走真实结束路径，充能不超过技力与储存上限', () => {
  const instant = setup(IDS, skillDef({ duration: 0 })), u = instant.unit(1);
  assert.equal(u.skill.activate('manual', { free: true }), true);
  assert.equal(u.skill.active, false);
  assert.equal(u.skill.sp, 6);
  healthy(instant);

  const ammo = setup(IDS, skillDef({ duration: -1, durationType: 'AMMO', bb: { ammo: 2 } }),
    { enemies: [{ key: 'dummy', pos: [10, 5] }] });
  const a = ammo.unit(1);
  assert.equal(a.skill.kind, 'ammo');
  assert.equal(a.skill.activate('manual', { free: true }), true);
  assert.equal(ammo.b.forceAttack(a, ammo.enemies()), true);
  assert.equal(a.skill.sp, 0);
  assert.equal(ammo.b.forceAttack(a, ammo.enemies()), true);
  assert.equal(a.skill.active, false);
  assert.equal(a.skill.sp, 6, '最后一发只返还一次，不附加攻击回复');
  healthy(ammo);

  const charged = setup(IDS, skillDef({ duration: 0, spCost: 2, maxChargeTime: 2 })), c = charged.unit(1);
  c.skill.activate('manual', { free: true });
  assert.equal(c.skill.charges, 2);
  assert.equal(c.skill.sp, 2);
  healthy(charged);
});

test('技能结束返还：重复 ID、伪造 ID 和重复安装不叠加，再部署后继续正常返还', () => {
  const h = setup([...IDS, ...IDS, 'unknown', { id: IDS[0], skillEndSp: 999 }]), u = h.unit(1);
  const count = h.b._hooks.skillEnd.length;
  install(h.b);
  assert.equal(h.b._hooks.skillEnd.length, count);
  u.skill.activate('manual', { free: true });
  h.runUntil(() => !u.skill.active, 1);
  assert.equal(u.skill.sp, 6);
  u.skill.activate('manual', { free: true });
  h.b.loseHp(u, 10000);
  assert.equal(u.skill.sp, 6, '死亡打断不再次返还');
  assert.ok(h.runUntil(() => u.alive && u.deployed, 2));
  assert.equal(u.skill.sp, 0, '再部署沿用初始技力');
  u.skill.activate('manual', { free: true });
  h.runUntil(() => !u.skill.active, 1);
  assert.equal(u.skill.sp, 6);
  healthy(h);
});

test('技能结束返还：只给持有者的在场干员，队友、召唤物、被动和无技能单位不受益', () => {
  const h = setup(IDS, skillDef({ duration: 0 }), { players: [
    { ...players(IDS)[0], units: [piece(), { kind: 'token', tokenId: 'token', ownerUid: 1, uid: 3, row: 11, col: 4 }] },
    { playerId: 'p2', seat: 1, side: 'L', relics: [], units: [piece(2, 6)] },
  ] });
  for (const uid of [1, 2]) h.unit(uid).skill.activate('manual', { free: true });
  assert.equal(h.unit(1).skill.sp, 6);
  assert.equal(h.unit(2).skill.sp, 0);
  const token = h.unit(3);
  h.b.emit('skillEnd', { unit: token, skill: { gainSp: () => assert.fail('召唤物不返还') }, reason: 'instant' });
  const owner = h.unit(1);
  owner.deployed = false;
  h.b.emit('skillEnd', { unit: owner, skill: owner.skill, reason: 'instant' });
  assert.equal(owner.skill.sp, 6);
  owner.deployed = true;
  healthy(h);
  for (const def of [null, skillDef({ skillType: 'PASSIVE' })]) {
    const p = setup(IDS, def), unit = p.unit(1);
    p.b.emit('skillEnd', { unit, skill: unit.skill, reason: 'end' });
    assert.equal(unit.skill.sp, 0);
    healthy(p);
  }
});

test('技能结束返还：联防继承技力且服务端与 JSON 重建的浏览器战斗结果一致', () => {
  const input = players(IDS);
  input[0].units[0].carryState = { hpPct: 0.7, sp: 1 };
  const raw = { chess: { guard: chessRec({ id: 'guard', skill: skillDef({
    spCost: 5, initSp: 5, spType: 'INCREASE_WITH_TIME', trigger: { rule: 'SP_FULL' },
  }) }) }, stages: { refund: flatStage({ id: 'refund' }) },
  enemies: { dummy: enemyRec({ key: 'dummy', hp: 100000, atk: 0, speed: 0 }) } };
  const spec = buildBattleSpec({ battleId: 'refund', fieldId: 'u:p1', kind: 'unite', seed: 19,
    stageId: 'refund', round: 7, timeLimit: 10, players: input, routes: flatRoutes(),
    spawns: [{ time: 20, enemyKey: 'dummy', routeIndex: 0 }] });
  const a = createBattleFromSpec(spec, new DataSource(raw, null), { quiet: true });
  const b = createBattleFromSpec(JSON.parse(JSON.stringify(spec)),
    new DataSource(JSON.parse(JSON.stringify(raw)), null), { quiet: true });
  for (const battle of [a, b]) {
    battle.step();
    const unit = battle.allyUnits[0];
    assert.ok(unit.skill.sp >= 1 && unit.skill.sp < 2, '继承技力不赠送结束奖励');
    battle.runToEnd(11);
    assert.ok(unit.skill.activations >= 2, '充能后通过真实 tick 反复释放');
    assert.deepEqual(battle.errors, []);
    checkInvariants(battle);
  }
  assert.equal(resultDigest(a.result()).hash, resultDigest(b.result()).hash);
});
