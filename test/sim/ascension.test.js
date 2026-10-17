import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Battle } from '../../server/sim/Battle.js';
import { DataSource, getDefaultSource } from '../../server/sim/simdata.js';
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
function field(level, key = 'enemy_test', options = {}) {
  const b = new Battle({ difficultyLevel: level, round: options.round ?? 1, stage, data: options.data ?? data, content: options.content ?? 'none', autoFinish: false,
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
  other.x = a.x + 1.11;
  const before = a.hp, outside = other.hp;
  b.kill(e, a);
  const emberFx = b.drainEvents().find(ev => ev[0] === 'fx' && ev[1] === 'ascEmbers');
  assert.ok(emberFx);
  assert.equal(emberFx[4].r, 1.1);
  assert.equal(emberFx[4].dur, 5);
  run(b, 1.1);
  assert.equal(before - a.hp, 15, 'each pulse deals 15% of the enemy base ATK');
  run(b, 2);
  assert.equal(before - a.hp, 45);
  run(b, 2);
  assert.equal(before - a.hp, 75, 'five one-second pulses');
  assert.equal(other.hp, outside);
  run(b, 1);
  assert.equal(before - a.hp, 75, 'hazard has stopped');
});

test('02: death embers reach allies beyond the old radius up to 1.1 tiles', () => {
  const { b, e, a, other } = field(2);
  e.x = a.x; e.y = a.y;
  a.x = e.x - 1.09;
  other.x = e.x + 1.11;
  const before = a.hp, outside = other.hp;
  b.kill(e, a);
  run(b, 5.1);
  assert.equal(before - a.hp, 75);
  assert.equal(other.hp, outside);
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

test('09: hit-count recipients are excluded by their active damage flags, including at higher levels', () => {
  for (const level of [9, 20]) for (const flag of ['hitCount', 'hitCountArts']) {
    const { b, e, a } = field(level);
    const counted = b.spawnEnemy('enemy_test', { pos: [9, 10.5] });
    b.addBuff(counted, { key: 'test:counted', persist: true, flags: { [flag]: true } });
    const fallen = b.spawnEnemy('enemy_test', { pos: [9, 11] });
    b.drainEvents();
    b.kill(fallen, a);
    assert.equal(e.findBuff('asc:gift').shieldHits, 1, 'ordinary neighbors still receive the gift');
    assert.equal(counted.findBuff('asc:gift'), null, `${flag} at level ${level}`);
    assert.ok(!b.drainEvents().some(ev => ev[0] === 'fx' && ev[1] === 'shield' && ev[4].id === counted.id));
    b.kill(e, a);
    assert.equal(hit(b, a, counted), 0, 'the separate first-hit barrier still applies');
    assert.equal(hit(b, a, counted), 1, 'the next eligible hit needs no extra gift-shield hit');
  }
});

test('09: all fourteen real hit-count objects, including Arts-only teaware, cannot receive death gifts', () => {
  const fullData = new DataSource(data.raw, getDefaultSource());
  const keys = ['enemy_1196_msfyin', 'enemy_1198_msfshu', 'enemy_1200_msfjin', 'enemy_1202_msfzhi',
    'enemy_1204_msfhu', 'enemy_1208_msfji', 'enemy_1210_msfden'].flatMap(key => [key, `${key}_2`]);
  for (const key of keys) {
    const { b, e, a } = field(9, 'enemy_test', { data: fullData, content: 'full' });
    const counted = b.spawnEnemy(key, { pos: [9, 10.5] });
    assert.ok(counted.s.flags.hitCount || counted.s.flags.hitCountArts, key);
    b.kill(e, a);
    assert.equal(counted.findBuff('asc:gift'), null, key);
    const hp = counted.hp;
    assert.equal(hit(b, a, counted), 0, 'the separate first-hit barrier still applies');
    assert.equal(hit(b, a, counted), 1, key);
    assert.equal(counted.hp, hp - 1, key);
    assert.deepEqual(b.errors, []);
  }
});

test('09: temporary ember and regeneration forms are excluded only while their hit-count mechanic is active', () => {
  const fullData = new DataSource(data.raw, getDefaultSource());
  for (const key of ['enemy_1288_duskls', 'enemy_1288_duskls_2', 'enemy_1292_duskld', 'enemy_9010_acpupp']) {
    const { b, e, a } = field(9, 'enemy_test', { data: fullData, content: 'full' });
    const changing = b.spawnEnemy(key, { pos: [9, 10.5] });
    changing.base.moveSpeed = 0;
    changing.markDirty();
    b.kill(e, a);
    const previousGift = changing.findBuff('asc:gift');
    assert.equal(previousGift.shieldHits, 1, `${key}: normal form can receive a gift`);
    b.kill(changing, a);
    assert.ok(changing.alive && changing.s.flags.hitCount, `${key}: knocked out into hit-count form`);
    const fallen = b.spawnEnemy('enemy_test', { pos: [9, 10] });
    b.kill(fallen, a);
    assert.equal(changing.findBuff('asc:gift'), previousGift, `${key}: no new gift during rebirth`);
    run(b, 1.1);
    changing.x = 10.5; changing.y = 9;
    const second = b.spawnEnemy('enemy_test', { pos: [9, 10] });
    b.kill(second, a);
    assert.equal(changing.findBuff('asc:gift'), previousGift, `${key}: no new gift in the active hit-count form`);
    assert.equal(hit(b, a, changing), 0, 'the separate first-hit barrier still applies');
    assert.equal(changing.findBuff('asc:gift'), null, 'the pre-transition gift is discarded before absorption');
    assert.equal(hit(b, a, changing), 1, `${key}: the old gift cannot block a hit-count loss`);
    run(b, changing.def.raw.talents.bb['Revive[Trigger].interval']);
    assert.ok(!changing.s.flags.hitCount, `${key}: returned to normal form`);
    changing.x = 10.5; changing.y = 9;
    const third = b.spawnEnemy('enemy_test', { pos: [9, 10] });
    b.kill(third, a);
    assert.equal(changing.findBuff('asc:gift').shieldHits, 1, `${key}: normal form receives gifts again`);
    assert.deepEqual(b.errors, []);
  }
});

test('10: armor rotates every 12 game seconds; late spawns inherit the current phase', () => {
  const { b, e, a } = field(10);
  a.x = 8; a.y = 9;
  hit(b, a, e);
  assert.equal(hit(b, a, e, 'phys'), 90);
  assert.equal(hit(b, a, e, 'arts'), 100);
  run(b, 4.1);
  assert.equal(e.s.physTakenMul, 0.9, 'the old four-second interval no longer switches armor');
  run(b, 7.8);
  assert.equal(e.s.physTakenMul, 0.9, 'physical reduction lasts until 12 seconds');
  run(b, 0.2);
  assert.equal(hit(b, a, e, 'phys'), 100);
  assert.equal(hit(b, a, e, 'arts'), 90);
  const late = b.spawnEnemy('enemy_test', { pos: [12, 10] });
  assert.equal(late.s.artsTakenMul, 0.9);
  assert.equal(late.s.physTakenMul, 1);
  assert.equal(hit(b, a, e), 100, 'true damage remains unaffected');
  run(b, 11.8);
  assert.equal(e.s.artsTakenMul, 0.9, 'arts reduction lasts until 24 seconds');
  run(b, 0.2);
  for (const enemy of [e, late]) {
    assert.equal(enemy.s.physTakenMul, 0.9, 'all enemies return to physical reduction together');
    assert.equal(enemy.s.artsTakenMul, 1);
  }
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
  assert.equal(b.total, 0, "runtime spawns stay outside the scheduled-enemy HUD counter");
  assert.equal(echo.counted, true, "the echo still counts for LP loss and perfect-round eligibility");
  assert.equal(echo.inTotal, false);
  b.kill(echo, a);
  assert.equal(b.total, 0);
  assert.equal(b.killed, 2);
  assert.equal(b.resolved, 0);
  assert.equal(b.enemies.filter(u => u.tag === 'asc_echo').length, 1);
});

test('15: skill end reduces ATK for 10 seconds, strengthens after round 10, and no longer blocks SP', () => {
  for (const level of [14, 15, 20]) for (const round of [1, 9, 10, 11, 15]) {
    const { b, a, other } = field(level, 'enemy_test', { round });
    const sk = skill(b, a), atk = a.s.atk;
    const reduction = level < 15 ? 0 : round > 10 ? 0.15 : 0.08;
    assert.equal(sk.sp, 7);
    sk.activate('manual', { free: true });
    assert.equal(a.findBuff('asc:fatigue'), null, 'skill start alone does not trigger fatigue');
    sk.end('end');
    assert.equal(a.s.atk, atk * (1 - reduction), `level ${level}, round ${round}`);
    assert.equal(other.findBuff('asc:fatigue'), null, 'only the skill owner is affected');
    assert.equal(!!a.s.flags.noSp, false);
    assert.equal(sk.gainSp(5, 'gift'), 5);
    assert.equal(sk.gainSp(1, 'attack'), 1);
    const sp = sk.sp;
    run(b, 2.1);
    assert.ok(sk.sp > sp, 'time-based SP recovery remains enabled');
    assert.equal(a.s.atk, atk * (1 - reduction), 'the old two-second window no longer applies');
    run(b, 7.8);
    assert.equal(a.s.atk, atk * (1 - reduction), 'fatigue lasts the full ten seconds');
    run(b, 0.2);
    assert.equal(a.findBuff('asc:fatigue'), null);
    assert.equal(a.s.atk, atk);
    assert.equal(a.s.spRecovery, 1);
  }
});

test('15: fatigue stacks additively twice and repeat skill ends refresh the shared ten-second timer', () => {
  for (const level of [15, 20]) for (const round of [10, 11]) {
    const { b, a } = field(level, 'enemy_test', { round });
    const sk = skill(b, a), atk = a.s.atk, reduction = round > 10 ? 0.15 : 0.08;
    const cast = () => { sk.activate('manual', { free: true }); sk.end('end'); };
    cast();
    assert.equal(a.findBuff('asc:fatigue').stacks, 1);
    run(b, 4);
    cast();
    assert.equal(a.findBuff('asc:fatigue').stacks, 2);
    assert.equal(a.s.atk, atk * (1 - 2 * reduction));
    run(b, 4);
    cast();
    assert.equal(a.findBuff('asc:fatigue').stacks, 2, 'third trigger cannot add a third layer');
    assert.equal(a.findBuff('asc:fatigue').timeLeft, 10);
    run(b, 9.9);
    assert.equal(a.s.atk, atk * (1 - 2 * reduction), 'both layers last from the latest trigger');
    run(b, 0.2);
    assert.equal(a.findBuff('asc:fatigue'), null);
    assert.equal(a.s.atk, atk);
  }
});

test('15: death-ended skills and non-operators do not receive fatigue', () => {
  const { b, a, other, e } = field(15);
  const sk = skill(b, a);
  sk.activate('manual', { free: true });
  sk.end('death');
  assert.equal(a.findBuff('asc:fatigue'), null);
  other.kind = 'token';
  for (const unit of [other, e]) b.emit('skillEnd', { unit, reason: 'end' });
  assert.equal(other.findBuff('asc:fatigue'), null);
  assert.equal(e.findBuff('asc:fatigue'), null);
  b.kill(a, e);
  b.emit('skillEnd', { unit: a, reason: 'end' });
  assert.equal(a.findBuff('asc:fatigue'), null);
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

test('19: unblockable enemies never receive goal stealth, including at level 20', () => {
  for (const level of [19, 20]) {
    const { b, e, a } = field(level);
    e.x = 3; e.y = 9;
    b.addBuff(e, { key: 'test:unblockable', flags: { unblockable: true }, persist: true });
    run(b, 0.3);
    assert.equal(e.findBuff('asc:goal'), null);
    assert.equal(!!e.s.flags.stealth, false);
    assert.equal(canTargetEnemy(a, e, {}), true);
  }
});

test('19: becoming unblockable removes only protocol stealth; becoming blockable restores eligibility', () => {
  for (const level of [19, 20]) for (const flag of ['unblockable', 'levitate', 'fear', 'sleep']) {
    const { b, e, a } = field(level);
    e.x = 3; e.y = 9;
    run(b, 0.3);
    assert.ok(e.findBuff('asc:goal'));
    b.addBuff(e, { key: 'test:blockFree', flags: { [flag]: true } });
    run(b, 0.3);
    assert.equal(e.findBuff('asc:goal'), null, `${flag} at level ${level}`);
    assert.equal(!!e.s.flags.stealth, false);
    const profile = { canHitFly: true, hitSleep: true };
    assert.equal(canTargetEnemy(a, e, profile), true);
    b.addBuff(e, { key: 'test:nativeStealth', flags: { stealth: true } });
    run(b, 0.3);
    assert.ok(e.findBuff('test:nativeStealth'), 'the enemy\'s own stealth is preserved');
    assert.equal(canTargetEnemy(a, e, profile), false);
    b.removeBuff(e, 'test:nativeStealth');
    b.removeBuff(e, 'test:blockFree');
    run(b, 0.3);
    assert.ok(e.findBuff('asc:goal'), 'blockable enemies near the goal qualify again');
  }
});

test('19: real unblockable ghost leaders remain targetable near the goal', () => {
  const fullData = new DataSource(data.raw, getDefaultSource());
  for (const level of [19, 20]) {
    const { b, e, a } = field(level, 'enemy_1026_aghost', { data: fullData, content: 'full' });
    e.x = 3; e.y = 9;
    e.base.moveSpeed = 0;
    e.markDirty();
    assert.equal(e.s.flags.unblockable, true);
    assert.equal(e.def.rank, 'NORMAL');
    run(b, 0.3);
    assert.equal(e.findBuff('asc:goal'), null);
    assert.equal(canTargetEnemy(a, e, {}), true);
  }
});

test('20: each actual damage instance shortens remaining debuff durations by 35%, only at level 20', () => {
  for (const level of [19, 20]) for (const key of ['enemy_test', 'enemy_elite', 'enemy_boss']) {
    const { b, e, a } = field(level, key);
    hit(b, a, e); // first-hit barrier
    b.applyStatus(e, 'stun', { duration: 10, source: a }); // spend elite control immunity
    if (!e.findBuff('stun')) b.applyStatus(e, 'stun', { duration: 10, source: a });
    b.applyStatus(e, 'weaken', { duration: 10, source: a });
    const raw = b.addBuff(e, { key: 'test:defCut', duration: 10, mods: { defPct: -0.2 }, source: a });
    b._tickBuffs(2);
    for (const source of [a, a, null]) {
      assert.equal(hit(b, source, e), 100);
    }
    const expected = level === 20 ? 8 * 0.65 * 0.65 * 0.65 : 8;
    for (const effect of [e.findBuff('stun'), e.findBuff('weaken'), raw]) {
      assert.ok(Math.abs(effect.timeLeft - expected) < 1e-9);
      assert.equal(effect.duration, 10, 'base duration is not changed');
    }
    assert.deepEqual(b.errors, []);
  }
});

test('20: zero, shields, dodge, cancelled hits, element gauges and HP loss do not shorten debuffs', () => {
  const { b, e, a } = field(20);
  b.applyStatus(e, 'resDown', { duration: 10 });
  const effect = e.findBuff('resDown');
  assert.equal(hit(b, a, e, 'true', 0), 0);
  assert.equal(hit(b, a, e), 0, 'first-hit barrier');
  b.addBuff(e, { key: 'test:shield', shield: 100 });
  assert.equal(hit(b, a, e), 0, 'HP shield');
  b.addBuff(e, { key: 'test:dodge', mods: { dodgePhys: 1 } });
  assert.equal(b.dealDamage(a, e, { type: 'phys', amount: 100 }), 0);
  const cancel = b.on('hit', ({ dmg }) => { dmg.cancel = true; });
  assert.equal(hit(b, a, e), 0);
  b.off(cancel);
  b.dealDamage(a, e, { type: 'element', element: 'burn', amount: 10 });
  b.loseHp(e, 10, { source: a });
  assert.equal(effect.timeLeft, 10);
  assert.equal(hit(b, a, e), 100);
  assert.equal(effect.timeLeft, 6.5);
});

test('20: positive buffs, enemy forms and permanent debuffs keep their timers and stacks', () => {
  const { b, e, a } = field(20);
  hit(b, a, e);
  const effects = [
    b.addBuff(e, { key: 'test:positive', duration: 10, source: a, mods: { atkMul: 1.2 } }),
    b.addBuff(e, { key: 'test:enemyForm', duration: 10, source: e, flags: { noMove: true } }),
    b.addBuff(e, { key: 'terrain:test', duration: 10, mods: { aspd: -20 } }),
    b.addBuff(e, { key: 'test:permanent', mods: { defFlat: -100 } }),
  ];
  b.applyStatus(e, 'palsy', { value: 3, source: a });
  b.applyStatus(e, 'resist', { duration: 10 });
  hit(b, a, e);
  assert.deepEqual(effects.map(x => x.timeLeft), [10, 10, 10, Infinity]);
  assert.equal(e.findBuff('palsy').stacks, 3);
  assert.equal(e.findBuff('resist').timeLeft, 10);
  assert.equal(e.findBuff('asc:rush').timeLeft, 5);
});

test('20: strongest debuff waiting tails shorten too and expire without restoring old durations', () => {
  const { b, e, a } = field(20);
  hit(b, a, e);
  b.applyStatus(e, 'weaken', { duration: 10, value: 0.2, source: a });
  b.applyStatus(e, 'weaken', { duration: 4, value: 0.5, source: a });
  b.time = 2;
  b._tickBuffs(2);
  hit(b, a, e);
  const effect = e.findBuff('weaken');
  assert.equal(effect.timeLeft, 1.3);
  assert.equal(effect.data.tail.until, 7.2);
  run(b, 1.4);
  assert.equal(e.findBuff('weaken').data.value, 0.2);
  run(b, 3.9);
  assert.equal(e.findBuff('weaken'), null);
});

test('20: DoT ticks shorten their own debuff and expiry callbacks still run normally', () => {
  const { b, e, a } = field(20);
  hit(b, a, e);
  let expired = 0;
  const dot = b.addBuff(e, { key: 'test:dot', duration: 4, source: a, interval: 1, tags: ['dot'],
    onTick: () => hit(b, a, e, 'arts', 10), onExpire: () => { expired++; } });
  run(b, 1.1);
  assert.ok(dot.timeLeft < 2, 'the tick shortens its own remaining timer');
  run(b, 3);
  assert.equal(e.findBuff('test:dot'), null);
  assert.equal(expired, 1);
});

test('20: elemental HP damage shortens timed burst effects and normal expiry resets the gauges', () => {
  const { b, e, a } = field(20);
  hit(b, a, e);
  b.dealDamage(a, e, { type: 'element', element: 'burn', amount: 1000 });
  // Use a fresh enemy with enough HP to survive the 7000 burst damage.
  const fresh = b.spawnEnemy('enemy_test', { pos: [9, 10], mods: { hpMul: 20 } });
  hit(b, a, fresh);
  b.dealDamage(a, fresh, { type: 'element', element: 'burn', amount: 1000 });
  assert.equal(fresh.findBuff('burnBurst').timeLeft, 6.5, 'burst HP damage counts, gauge fill does not');
  run(b, 6.6);
  assert.equal(fresh.findBuff('burnBurst'), null);
  assert.equal(fresh.elem.burn, 0);
});

test('20: the former periodic relay barrier is no longer installed', () => {
  const { b, e, a } = field(20);
  hit(b, a, e);
  run(b, 20.1);
  assert.equal(e.findBuff('asc:relay'), null);
  assert.equal(hit(b, a, e), 100);
});
