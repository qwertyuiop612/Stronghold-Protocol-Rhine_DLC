import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, chessRec, enemyRec } from '../helpers/battleHarness.js';
import { damageRanking, damageTypes } from '../../shared/damageRanking.js';
import { compactResult } from '../../server/sim/spec.js';

function setup() {
  return makeBattle({
    defs: { chess: { guard: chessRec({ id: 'guard', skill: null, stats: { atk: 0 } }) }, enemies: { enemy_dummy: enemyRec({ key: 'enemy_dummy', hp: 10000, speed: 0, def: 0, res: 0 }) } },
    units: [{ uid: 1, chessId: 'guard', row: 9, col: 5 }],
    enemies: [{ key: 'enemy_dummy', pos: [9, 6] }], content: 'none', autoFinish: false,
  });
}

test('ranking counts actual enemy HP damage by type, not friendly damage or gauge buildup', () => {
  const h = setup();
  h.step();
  const op = h.unit('guard'), enemy = h.enemy('enemy_dummy');
  for (const type of ['phys', 'arts', 'true', 'elemental']) h.b.dealDamage(op, enemy, { amount: 100, type, canDodge: false });
  h.b.dealDamage(op, op, { amount: 50, type: 'true' });
  h.b.dealDamage(op, enemy, { amount: 10, type: 'element', element: 'burn' });
  const row = h.b.snapshot().damageRanking[0];
  assert.deepEqual(row.types, { phys: 100, arts: 100, true: 100, elemental: 100 });
  assert.equal(row.total, 400);
  assert.equal(row.ownerId, op.ownerId);
  h.b.retreat(op);
  assert.equal(h.b.snapshot().damageRanking[0].total, 400, 'retreat keeps the row');
  const result = compactResult(h.b.result());
  const pp = result.perPlayer[op.ownerId];
  assert.deepEqual(damageRanking(pp.unitStats)[0].types, row.types, 'client result retains type counters for prep');
});

test('overkill and shields only count actual HP removed', () => {
  const h = setup(); h.step();
  const op = h.unit('guard'), enemy = h.enemy('enemy_dummy');
  h.b.addBuff(enemy, { key: 'shield', shield: 200 });
  assert.equal(h.b.dealDamage(op, enemy, { amount: 100, type: 'true' }), 0);
  enemy.hp = 25;
  assert.equal(h.b.dealDamage(op, enemy, { amount: 500, type: 'arts' }), 25);
  assert.equal(h.b.snapshot().damageRanking[0].total, 25);
});

test('ranking separates owners/copies, excludes tokens, orders by total; wire counters are finite', () => {
  const units = [
    { id: 1, uid: 1, kind: 'op', ownerId: 'a', dmgTypes: { phys: 5 } },
    { id: 2, uid: 1, kind: 'op', ownerId: 'b', dmgTypes: { arts: 10 } },
    { id: 3, kind: 'token', dmgTypes: { true: 100 } },
  ];
  assert.deepEqual(damageRanking(units).map((r) => r.ownerId), ['b', 'a']);
  assert.deepEqual(damageTypes({ phys: Infinity, arts: -1, true: NaN, elemental: 1e20 }), { phys: 0, arts: 0, true: 0, elemental: 1e13 });
});
