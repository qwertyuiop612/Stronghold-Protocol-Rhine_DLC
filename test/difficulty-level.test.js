import { test } from 'node:test';
import assert from 'node:assert/strict';
import { modeIdFor, difficultyEffects, DIFFICULTY_RULES, ERR } from '../shared/constants.js';
import { validateC2S } from '../shared/protocol.js';
import { buildBattleSpec, createBattleFromSpec } from '../server/sim/spec.js';
import { DataSource, getDefaultSource, spawnsFromTemplate } from '../server/sim/simdata.js';
import { startServer } from '../server/index.js';
import { TestClient } from './helpers/wsClient.js';
import { chessRec, enemyRec, flatStage, checkInvariants } from './helpers/battleHarness.js';
import { makeMatch } from './match/harness.js';

const data = new DataSource({
  chess: { test_chess_a: chessRec({ skill: { spCost: 100, trigger: { rule: 'NEVER' } } }) },
  enemies: { enemy_test: enemyRec({ hp: 1001, atk: 101, speed: 0 }) },
  stages: { flat: flatStage() },
});
function battle(level, extra = {}) {
  const spec = buildBattleSpec({ seed: 37, difficultyLevel: level, stageId: 'flat', content: 'none', timeLimit: 60,
    players: [{ playerId: 'p1', units: [{ chessId: 'test_chess_a', row: 10, col: 2, uid: 1 }] }], ...extra });
  const b = createBattleFromSpec(spec, data, { quiet: true });
  b.start();
  return { b, e: b.spawnEnemy('enemy_test', { pos: [9, 10], ...extra.enemyOpts }), a: b.allyUnits[0], spec };
}
const hit = (b, a, e, attackId = 0, extra = {}) => b.dealDamage(a, e, { amount: 100, type: 'true', isAttack: true, attackId, ...extra });

test('all 21 levels inherit ultimate stats and unlock exactly one unique cumulative rule per level', () => {
  assert.equal(modeIdFor('solo', 'ASCENSION'), modeIdFor('solo', 'ABYSS'));
  assert.equal(modeIdFor('coop', 'ASCENSION'), modeIdFor('coop', 'ABYSS'));
  for (let n = 0; n <= 20; n++) {
    const { b, e } = battle(n, { enemyOpts: { mods: { hpMul: 1.25, atkMul: 1.5 } } });
    assert.equal(e.s.maxHp, 1251.25);
    assert.equal(e.s.atk, 151.5);
    assert.equal(b.allyUnits[0].s.spRecovery, 1);
    const rules = difficultyEffects(n);
    assert.equal(DIFFICULTY_RULES.filter(r => rules[r.key]).length, n);
    for (const r of DIFFICULTY_RULES) assert.equal(rules[r.key], n >= r.level);
    const child = b.spawnEnemy('enemy_test', { pos: [9, 10] });
    assert.equal(child.s.maxHp, 1001, 'dynamic spawns retain ultimate stats');
    assert.equal(!!child.findBuff('asc:first'), n >= 5);
  }
  assert.equal(new Set(DIFFICULTY_RULES.map(r => r.key)).size, 20);
  assert.deepEqual(DIFFICULTY_RULES.map(r => r.level), Array.from({ length: 20 }, (_, i) => i + 1));
  for (const r of DIFFICULTY_RULES) assert.ok(r.description && r.counter);
});

test('level 10 armor parameters and picker description use a 12-second rotation', () => {
  const armor = DIFFICULTY_RULES.find(r => r.key === 'rotatingArmor');
  assert.equal(armor.level, 10);
  assert.deepEqual(armor.params, { period: 12, taken: 0.9 });
  assert.equal(armor.description, '所有敌人受到的物理或法术伤害-10%，减伤类型每12秒轮转一次（初始为物理减伤）');
});

test('level 15 fatigue parameters and description specify ATK loss, round scaling and two stacks', () => {
  const fatigue = DIFFICULTY_RULES.find(r => r.key === 'skillFatigue');
  assert.equal(fatigue.level, 15);
  assert.deepEqual(fatigue.params, { duration: 10, reduction: 0.08, lateReduction: 0.15, afterRound: 10, maxStacks: 2 });
  assert.equal(fatigue.description, '所有我方干员技能结束后的10秒内攻击力降低8%（第10回合后改为15%），最多叠加2层');
  assert.equal(fatigue.detail, '重复触发时刷新持续时间，叠层按加算结算');
  assert.equal(difficultyEffects(14).skillFatigue, false);
  assert.equal(difficultyEffects(15).skillFatigue, true);
});

test('serialized battle round preserves level 15 fatigue scaling in both runtimes', () => {
  for (const round of [10, 11]) {
    const { spec } = battle(15, { round });
    for (const input of [spec, JSON.parse(JSON.stringify(spec))]) {
      const b = createBattleFromSpec(input, data, { quiet: true });
      b.start();
      const a = b.allyUnits[0], atk = a.s.atk;
      b.emit('skillEnd', { unit: a, reason: 'duration' });
      assert.equal(b.round, round);
      assert.equal(a.s.atk, atk * (1 - (round > 10 ? 0.15 : 0.08)));
      assert.equal(a.findBuff('asc:fatigue').duration, 10);
      assert.equal(!!a.s.flags.noSp, false);
      assert.deepEqual(b.errors, []);
    }
  }
});

test('level 19 keeps its effect description and explains unblockable exclusion only in the tooltip', () => {
  const stealth = DIFFICULTY_RULES.find(r => r.key === 'goalStealth');
  assert.equal(stealth.description, '所有普通地面敌人距离目标点不足2格时获得【隐匿】');
  assert.equal(stealth.detail, '对不可被阻挡的敌人不生效；被我方单位阻挡时【隐匿】效果解除');
});

test('level 20 debuff decay parameters and picker description use 35% per damage instance', () => {
  const decay = DIFFICULTY_RULES.find(r => r.level === 20);
  assert.equal(decay.key, 'debuffDecay');
  assert.deepEqual(decay.params, { reduction: 0.35 });
  assert.equal(decay.description, '所有敌方单位每受到一次伤害后，自身负面效果的剩余持续时间减少35%');
  assert.equal(difficultyEffects(19).debuffDecay, false);
  assert.equal(difficultyEffects(20).debuffDecay, true);
});

test('immunity starts at 5, does not consume zero damage or element fills, and applies independently per enemy', () => {
  for (const n of [0, 4, 5, 9]) {
    const { b, a, e } = battle(n);
    hit(b, a, e, 1, { amount: 0 });
    b.dealDamage(a, e, { amount: 10, type: 'element', element: 'burn' });
    assert.equal(hit(b, a, e, 2), n >= 5 ? 0 : 100);
    assert.equal(hit(b, a, e, 3), 100);
    const other = b.spawnEnemy('enemy_test', { pos: [12, 10] });
    assert.equal(hit(b, a, other, 4), n >= 5 ? 0 : 100);
  }
});

test('serialized battle specs reproduce all cumulative rules, event streams and states deterministically', () => {
  const { spec } = battle(20);
  const outputs = [spec, JSON.parse(JSON.stringify(spec))].map((s) => {
    const b = createBattleFromSpec(s, data, { quiet: true });
    b.autoFinish = false;
    b.start();
    const e = b.spawnEnemy('enemy_test', { pos: [9, 10] });
    const hits = Array.from({ length: 7 }, (_, i) => hit(b, b.allyUnits[0], e, i + 1));
    while (b.time < 41) b.step();
    return { hp: e.s.maxHp, atk: e.s.atk, sp: b.allyUnits[0].s.spRecovery, hits, snapshot: b.snapshot(), events: b.drainEvents(), errors: b.errors };
  });
  assert.deepEqual(outputs[0], outputs[1]);
  assert.deepEqual(outputs[0].hits, [0, 100, 100, 100, 100, 100, 100]);
  assert.deepEqual(outputs[0].errors, []);
});

test('level 20 runs a real two-player wave with full operator kits, summons and enemy content deterministically', () => {
  const ds = getDefaultSource(), stage = ds.getStage('act2autochess_m01');
  const names = ['星熊', '银灰', '莫斯提马', '白面鸮', '能天使', '赫默'];
  const melee = [...stage.raw.deployTiles.normal.melee].sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const ranged = [...stage.raw.deployTiles.normal.rangedOnly];
  const used = new Set();
  const units = names.map((name, i) => {
    const chessId = ds.chessIds().find(id => ds.rawChess(id).name === name && !ds.rawChess(id).isGolden);
    const pool = ds.rawChess(chessId).position === 'MELEE' ? melee : [...ranged, ...melee];
    const tile = pool.find(p => !used.has(p.join(',')));
    assert.ok(tile, `deploy tile for ${name}`);
    used.add(tile.join(','));
    return { chessId, row: tile[0], col: tile[1], uid: i + 1 };
  });
  const wave = spawnsFromTemplate(ds.getWave('act1autochess_escaped_multi'));
  const spec = buildBattleSpec({ seed: 41, kind: 'unite', difficultyLevel: 20, modeId: 'mode_multi_abyss',
    stageId: stage.id, timeLimit: 60, ...wave, players: [
      { playerId: 'left', units }, { playerId: 'right', colOffset: 8, units },
    ] });
  const play = s => {
    const b = createBattleFromSpec(s, ds, { quiet: true });
    while (!b.finished && b.time < 61) { b.step(); if (b.tickCount % 30 === 0) checkInvariants(b); }
    assert.deepEqual(b.errors, []);
    assert.equal(b.finished, true);
    return { result: b.result(), events: b.drainEvents(), snapshot: b.snapshot() };
  };
  assert.deepEqual(play(spec), play(JSON.parse(JSON.stringify(spec))));
});

test('protocol rejects fractional / out-of-range / nonnumeric levels, accepts old clients', () => {
  for (const t of ['room.create', 'room.setDifficulty']) {
    const msg = { t, mode: 'coop', difficulty: 'ASCENSION' };
    assert.equal(validateC2S(msg), null);
    for (const difficultyLevel of [0, 5, 10, 15, 20]) assert.equal(validateC2S({ ...msg, difficultyLevel }), null);
    for (const difficultyLevel of [-1, 21, 5.5, '10', null, NaN]) assert.ok(validateC2S({ ...msg, difficultyLevel }));
  }
});

test('room level changes are host-only, unready guests, survive resync, and reach the real match', async () => {
  const srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true });
  let host, guest;
  try {
    host = await TestClient.connect(`ws://127.0.0.1:${srv.port}/ws`);
    guest = await TestClient.connect(`ws://127.0.0.1:${srv.port}/ws`);
    const hw = await host.hello('Host');
    const gw = await guest.hello('Guest');
    await host.request({ t: 'room.create', mode: 'coop', difficulty: 'ASCENSION', difficultyLevel: 10 });
    const initial = await host.waitFor('room.state');
    await guest.request({ t: 'room.join', code: initial.code });
    await guest.request({ t: 'room.ready', ready: true });
    const bad = await guest.request({ t: 'room.setDifficulty', difficulty: 'ASCENSION', difficultyLevel: 15 });
    assert.equal(bad.code, ERR.NOT_HOST);
    await host.request({ t: 'room.setDifficulty', difficulty: 'ASCENSION', difficultyLevel: 15 });
    const state = await guest.waitFor('room.state', (s) => s.difficultyLevel === 15);
    assert.equal(state.seats.find((s) => s?.playerId === gw.playerId).ready, false);
    await guest.hello('Guest', gw.token);
    assert.equal((await guest.waitFor('room.state', (s) => s.difficultyLevel === 15)).difficultyLevel, 15);
    await host.request({ t: 'room.setMode', modeId: 'mode_multi_normal' });
    const normal = await guest.waitFor('room.state', (s) => s.difficulty === 'NORMAL');
    assert.equal(normal.difficultyLevel, 0, 'selecting an upstream mode clears the Ascension-only level');
    await host.request({ t: 'room.setDifficulty', difficulty: 'ASCENSION', difficultyLevel: 15 });
    await guest.waitFor('room.state', (s) => s.difficultyLevel === 15);
    await guest.request({ t: 'room.ready', ready: true });
    await host.request({ t: 'room.start' });
    const m = srv.lobby.rooms.get(initial.code).match;
    assert.equal(m.difficultyLevel, 15);
    assert.equal(m.gd.difficulty, 'ABYSS');
    assert.equal((await host.waitFor('m.public')).difficultyLevel, 15);
    assert.equal(m.players.has(hw.playerId), true);
  } finally {
    await host?.close(); await guest?.close(); await srv.close();
  }
});

test('all field kinds, boss pool and hidden core inherit the level; level zero keeps ultimate setup', () => {
  const base = makeMatch({ mode: 'solo', difficulty: 'ABYSS', seed: 37, fake: true });
  const zero = makeMatch({ mode: 'solo', difficulty: 'ASCENSION', difficultyLevel: 0, seed: 37, fake: true });
  const high = makeMatch({ mode: 'solo', difficulty: 'ASCENSION', difficultyLevel: 20, seed: 37, fake: true });
  try {
    for (const h of [base, zero, high]) h.start().toPrep(1);
    assert.equal(zero.m.stageId, base.m.stageId);
    assert.deepEqual(zero.m.disabledBonds, base.m.disabledBonds);
    for (const kind of ['normal', 'unite', 'boss', 'hidden']) {
      const field = high.m._ccField({ fieldId: kind, kind, players: ['p_0'], opts: {} });
      assert.equal(field.spec.difficultyLevel, 20);
      assert.equal(high.m.newBattle({ kind, players: [] }).opts.difficultyLevel, 20);
    }
    for (const h of [base, zero, high]) { h.m.round = h.m.gd.bossRound; h.m.startFinalAssault(false); }
    assert.equal(zero.m.bossPool.maxHp, base.m.bossPool.maxHp);
    assert.equal(high.m.bossPool.maxHp, base.m.bossPool.maxHp);
  } finally { for (const h of [base, zero, high]) h.m.dispose(); }
});
