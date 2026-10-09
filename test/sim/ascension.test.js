import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Battle } from '../../server/sim/Battle.js';
import { DataSource } from '../../server/sim/simdata.js';
import { SkillRuntime } from '../../server/sim/skills.js';
import { canTargetEnemy } from '../../server/sim/targeting.js';
import { UF } from '../../shared/constants.js';
import { chessRec, enemyRec, flatStage } from '../helpers/battleHarness.js';

const stage = flatStage();
stage.rows[10] = stage.rows[10].replaceAll('h', 'r'); // ground tiles for the real contact/blocking checks
const data = new DataSource({ chess: { test_chess_a: chessRec({ skill: null }) }, enemies: {
  enemy_test: enemyRec({ hp: 1001, atk: 100, speed: 0 }),
  enemy_elite: enemyRec({ hp: 1001, atk: 100, speed: 0, rank: 'ELITE' }),
  enemy_boss: enemyRec({ hp: 1001, atk: 100, speed: 0, rank: 'BOSS' }),
} });
function field(level, key = 'enemy_test') {
  const b = new Battle({ difficultyLevel: level, stage, data, content: 'none', autoFinish: false,
    flags: { startOpCooldown: 0 }, timeLimit: 90, seed: 31, logger: { warn() {}, error() {} },
    players: [{ playerId: 'p1', units: [2, 3].map((col, i) => ({ chessId: 'test_chess_a', row: 10, col, uid: i + 1 })) }] });
  b.start();
  const e = b.spawnEnemy(key, { pos: [9, 10], tag: key === 'enemy_boss' ? 'boss' : null });
  return { b, e, a: b.allyUnits[0], other: b.allyUnits[1] };
}
const hit = (b, a, e, type = 'true', amount = 100) => b.dealDamage(a, e, { type, amount, isAttack: true, canDodge: false });
const run = (b, seconds) => { const end = b.time + seconds - 1e-9; while (!b.finished && b.time < end) b.step(); assert.deepEqual(b.errors, []); };
const skill = (b, a) => {
  a.skill = new SkillRuntime(b, a, {}, { kind: 'duration', duration: 1, spType: 'time', spCost: 100, initSp: 7, trigger: { rule: 'NEVER' } });
  a.skill.reset();
  return a.skill;
};

test('01: opening rush expires and real blocking cuts it short; leaders are excluded', () => {
  const { b, e, a } = field(1);
  assert.equal(e.findBuff('asc:rush').mods.moveMul, 1.5);
  e.x = a.x + 0.1; e.y = a.y;
  assert.equal(b._checkBlock(e), true);
  assert.equal(e.findBuff('asc:rush'), null);
  const fresh = b.spawnEnemy('enemy_test', { pos: [9, 10] });
  run(b, 5.1);
  assert.equal(fresh.findBuff('asc:rush'), null);
  assert.equal(field(1, 'enemy_boss').e.findBuff('asc:rush'), null);
});

test('02: death embers damage only allies in the fixed death area, with visible ground FX', () => {
  const { b, e, a, other } = field(2);
  e.x = a.x; e.y = a.y;
  const before = a.hp, outside = other.hp;
  b.kill(e, a);
  assert.ok(b.drainEvents().some(ev => ev[0] === 'fx' && ev[1] === 'ascEmbers'));
  run(b, 3.1);
  assert.equal(before - a.hp, 75);
  assert.equal(other.hp, outside);
  run(b, 1);
  assert.equal(before - a.hp, 75, 'hazard has stopped');
});

test('03: escort protection depends on living neighbors and ends as the group breaks up', () => {
  const { b, e, a } = field(3);
  const escort = b.spawnEnemy('enemy_test', { pos: [9, 10.5] });
  assert.equal(hit(b, a, e), 80);
  b.kill(escort, a);
  assert.equal(hit(b, a, e), 100);
});

test('04: actual healing of another ally exposes the healer, self healing and overheal do not', () => {
  const { b, a, other } = field(4);
  b.heal(other, a, 50);
  assert.equal(other.s.taunt, 0);
  a.hp -= 100;
  b.heal(a, a, 10);
  assert.equal(a.s.taunt, 0);
  b.heal(other, a, 50);
  assert.equal(other.s.taunt, 4);
  run(b, 4.1);
  assert.equal(other.s.taunt, 0);
});

test('05: first-hit shield is consumed once per enemy, never by zero damage or gauge fills', () => {
  const { b, e, a } = field(5);
  assert.ok(e.statusFlags & UF.SHIELD);
  hit(b, a, e, 'true', 0);
  b.dealDamage(a, e, { type: 'element', element: 'burn', amount: 10 });
  assert.equal(hit(b, a, e), 0);
  assert.equal(hit(b, a, e), 100);
  assert.equal(e.statusFlags & UF.SHIELD, 0);
});

test('06: long-distance deflection has a spatial counter and does not affect true / element damage', () => {
  const { b, e, a } = field(6);
  hit(b, a, e);
  assert.equal(hit(b, a, e, 'arts'), 70);
  assert.equal(hit(b, a, e), 100);
  a.x = e.x - 2; a.y = e.y;
  assert.equal(hit(b, a, e, 'arts'), 100);
});

test('07: a fully absorbed first attack does not spend the silence; tokens can bait it', () => {
  const { b, e, a, other } = field(7);
  b.addBuff(a, { key: 'test:shield', shieldHits: 1 });
  assert.equal(hit(b, e, a), 0);
  assert.equal(!!e.difficultySilenced, false);
  hit(b, e, a);
  assert.equal(a.s.flags.silence, true);
  hit(b, e, other);
  assert.equal(!!other.s.flags.silence, false);
  const fresh = b.spawnEnemy('enemy_test', { pos: [12, 10] });
  other.kind = 'token';
  hit(b, fresh, other);
  assert.equal(fresh.difficultySilenced, true, 'a token spends the enemy\'s first damaging attack');
  assert.equal(!!other.s.flags.silence, false);
  run(b, 2.1);
  assert.equal(!!a.s.flags.silence, false);
  hit(b, fresh, a);
  assert.equal(!!a.s.flags.silence, false, 'a later hit cannot silence an operator');
});

test('08: half-health control cleanse fires once and preserves stat debuffs', () => {
  const { b, e, a } = field(8);
  hit(b, a, e);
  b.applyStatus(e, 'stun', { duration: 5 });
  b.applyStatus(e, 'bind', { duration: 5 });
  b.applyStatus(e, 'resDown', { duration: 5 });
  hit(b, a, e, 'true', 600);
  assert.equal(!!e.s.flags.stun, false);
  assert.equal(!!e.s.flags.bind, false);
  assert.ok(e.findBuff('resDown'));
  b.applyStatus(e, 'stun', { duration: 5 });
  hit(b, a, e);
  assert.equal(e.s.flags.stun, true);
});

test('09: a death gives neighbors one temporary shield, with no stacking or leaked-enemy trigger', () => {
  const { b, e, a } = field(9);
  const fallen = b.spawnEnemy('enemy_test', { pos: [9, 10.5] });
  b.kill(fallen, a);
  assert.equal(e.findBuff('asc:gift').shieldHits, 1);
  const second = b.spawnEnemy('enemy_test', { pos: [9, 10.5] });
  b.kill(second, a);
  assert.equal(e.findBuff('asc:gift').shieldHits, 1);
  hit(b, a, e); // first-hit barrier
  assert.equal(hit(b, a, e), 0);
  assert.equal(hit(b, a, e), 100);
  const leaked = b.spawnEnemy('enemy_test', { pos: [9, 10.5] });
  b.leak(leaked);
  assert.equal(e.findBuff('asc:gift'), null);
});

test('10: armor rotates on the game clock; late spawns inherit the current phase', () => {
  const { b, e, a } = field(10);
  a.x = 8; a.y = 9;
  hit(b, a, e);
  assert.equal(hit(b, a, e, 'phys'), 90);
  assert.equal(hit(b, a, e, 'arts'), 100);
  run(b, 4.1);
  assert.equal(hit(b, a, e, 'phys'), 100);
  assert.equal(hit(b, a, e, 'arts'), 90);
  const late = b.spawnEnemy('enemy_test', { pos: [12, 10] });
  assert.equal(late.s.artsTakenMul, 0.9);
  assert.equal(late.s.physTakenMul, 1);
});

test('11: SP storm blocks time / attack / gifted SP only inside its timed window, ready skills still activate', () => {
  const { b, a } = field(11);
  const sk = skill(b, a);
  assert.equal(a.s.spRecovery, 1);
  assert.equal(sk.gainSp(5, 'gift'), 5);
  run(b, 12.1);
  const sp = sk.sp;
  assert.equal(sk.gainSp(5, 'gift'), 0);
  assert.equal(sk.gainSp(1, 'attack'), 0);
  sk.tick(1);
  assert.equal(sk.sp, sp);
  assert.equal(sk.activate('manual', { free: true }), true);
  run(b, 3.1);
  assert.equal(!!a.s.flags.noSp, false);
  assert.equal(sk.gainSp(5, 'gift'), 5);
});

test('12: charge affects unblocked nonleaders; blocking removes it immediately', () => {
  const { b, e, a } = field(12);
  run(b, 15.1);
  assert.equal(e.findBuff('asc:charge').mods.moveMul, 1.8);
  e.x = a.x + 0.1; e.y = a.y;
  b._checkBlock(e);
  assert.equal(e.findBuff('asc:charge'), null);
});

test('13: enemy-caused operator death spreads a temporary nonstacking revenge frenzy', () => {
  const { b, e, a, other } = field(13);
  b.kill(a, e);
  assert.equal(e.s.aspd, 150);
  b.kill(other, e);
  assert.equal(e.s.aspd, 150);
  run(b, 4.1);
  assert.equal(e.s.aspd, 100);
});

test('14: every fourth normal spawn creates one counted echo on death, keeps remaining route and cannot split', () => {
  const { b, e, a } = field(14);
  const originals = [e, ...Array.from({ length: 3 }, () => b.spawnEnemy('enemy_test', { pos: [9, 10] }))];
  const fourth = originals[3];
  fourth.route.legs = [{ t: 'move', r: 9, c: 8 }, { t: 'move', r: 9, c: 2, final: true }];
  fourth.route.legIdx = 1;
  b.kill(fourth, a);
  const echo = b.enemies.find(u => u.tag === 'asc_echo');
  assert.ok(echo);
  assert.equal(echo.s.maxHp, 1001 * 0.35);
  assert.equal(echo.base.atk, fourth.base.atk);
  assert.equal(echo.bounty, null);
  assert.deepEqual(echo.route.legs, fourth.route.legs.slice(1));
  assert.equal(b.total, 5);
  b.kill(echo, a);
  assert.equal(b.total, 5);
  assert.equal(b.enemies.filter(u => u.tag === 'asc_echo').length, 1);
});

test('15: natural skill end creates an SP recovery gap, initial SP and normal rate stay intact', () => {
  const { b, a } = field(15);
  const sk = skill(b, a);
  assert.equal(sk.sp, 7);
  sk.activate('manual', { free: true });
  sk.end('end');
  assert.equal(a.s.flags.noSp, true);
  assert.equal(sk.gainSp(5, 'gift'), 0);
  run(b, 2.1);
  assert.equal(sk.gainSp(5, 'gift'), 5);
  assert.equal(a.s.spRecovery, 1);
});

test('16: every third attack telegraphs then hits a fixed position, excluding allies outside its radius', () => {
  const { b, e, a, other } = field(16);
  const before = a.hp, outside = other.hp;
  for (let i = 0; i < 3; i++) b.emit('attack', { attacker: e, targets: [a] });
  assert.equal(a.hp, before);
  assert.ok(b.drainEvents().some(ev => ev[0] === 'fx' && ev[1] === 'ascBombMark'));
  run(b, 0.9);
  assert.equal(a.hp, before);
  run(b, 0.2);
  assert.equal(before - a.hp, 50);
  assert.equal(other.hp, outside);
});

test('17: elites and bosses resist the first eligible control once; ordinary enemies remain controllable', () => {
  for (const key of ['enemy_elite', 'enemy_boss']) {
    const { b, e } = field(17, key);
    assert.equal(b.applyStatus(e, 'resDown', { duration: 2 }), true, 'stat debuffs do not spend the immunity');
    assert.equal(b.applyStatus(e, 'stun', { duration: 2 }), false);
    assert.equal(b.applyStatus(e, 'stun', { duration: 2 }), true);
  }
  const { b, e } = field(17);
  assert.equal(b.applyStatus(e, 'stun', { duration: 2 }), true);
});

test('18: casting blocks all healing including self recovery, with shields still available', () => {
  const { b, a, other } = field(18);
  const sk = skill(b, a);
  a.hp -= 200;
  sk.activate('manual', { free: true });
  assert.equal(b.heal(other, a, 100), 0);
  assert.equal(b.heal(a, a, 100, { self: true }), 0);
  b.addBuff(a, { key: 'test:hpShield', shield: 100 });
  assert.equal(a.s.shield, 100);
  run(b, 3.1);
  assert.equal(b.heal(other, a, 100), 100);
});

test('19: ordinary ground enemies near the goal become stealthed; blockers can still target them', () => {
  const { b, e, a } = field(19);
  e.x = 3; e.y = 9;
  run(b, 0.3);
  assert.equal(e.s.flags.stealth, true);
  assert.equal(canTargetEnemy(a, e, {}), false);
  e.blockedBy = a;
  assert.equal(canTargetEnemy(a, e, {}), true);
});

test('20: relay needs another operator, summons share their owner, shield expires instead of deadlocking', () => {
  const { b, e, a, other } = field(20);
  run(b, 20.1);
  assert.equal(hit(b, a, e), 0);
  assert.equal(hit(b, a, e), 0);
  const token = { side: 'ally', kind: 'token', id: 99, ownerUnit: a, x: a.x, y: a.y, s: a.s, stats: { dmg: 0 } };
  assert.equal(hit(b, token, e), 0);
  assert.equal(hit(b, other, e), 100);
  assert.equal(e.difficultyRelay, null);
  assert.equal(hit(b, a, e), 100);
  run(b, 20);
  assert.ok(e.difficultyRelay);
  run(b, 6.1);
  assert.equal(e.difficultyRelay, null);
  assert.equal(hit(b, a, e), 100);
});
