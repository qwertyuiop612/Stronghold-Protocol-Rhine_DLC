import test from 'node:test';
import assert from 'node:assert/strict';
import { PHASE } from '../../shared/constants.js';
import { spectatorTarget } from '../../public/js/battle/observe.js';

const players = [
  { playerId: 'me', alive: false },
  { playerId: 'a', alive: true },
  { playerId: 'b', alive: true },
];
const pub = (phase, fields = [], rows = players) => ({ phase, fields, players: rows });

test('eliminated viewer follows the chosen teammate from battle through settlement and prep to the next battle', () => {
  const previous = { fieldId: 'n:b', players: ['b'] };
  for (const phase of [PHASE.SETTLE, PHASE.ROUND_START, PHASE.SP_DRAFT, PHASE.PREP]) {
    assert.deepEqual(spectatorTarget(pub(phase), 'me', { field: previous }), { playerId: 'b', fieldId: 'n:b' });
  }
  const pair = { fieldId: 'b1', players: ['a', 'b'] };
  assert.deepEqual(spectatorTarget(pub(PHASE.FINAL_ASSAULT, [pair]), 'me', { playerId: 'b' }), { playerId: 'b', fieldId: 'b1' });
  assert.deepEqual(spectatorTarget(pub(PHASE.PREP), 'me', { playerId: 'b', field: pair }), { playerId: 'b', fieldId: 'n:b' });
  const unite = { fieldId: 'u', players: ['a', 'b'] };
  assert.deepEqual(spectatorTarget(pub(PHASE.UNITE, [unite]), 'me', { playerId: 'b' }), { playerId: 'b', fieldId: 'u' });
});

test('automatic shared-field spectating picks a field member, while an explicit choice takes precedence', () => {
  const field = { fieldId: 'u', players: ['b', 'a'] };
  assert.deepEqual(spectatorTarget(pub(PHASE.PREP), 'me', { field }), { playerId: 'a', fieldId: 'n:a' });
  assert.deepEqual(spectatorTarget(pub(PHASE.PREP), 'me', { playerId: 'b', field }), { playerId: 'b', fieldId: 'n:b' });
});

test('an eliminated or departed target falls back to a live teammate, never the viewer', () => {
  for (const b of [{ playerId: 'b', alive: false }, { playerId: 'b', alive: true, status: 'left' }]) {
    assert.deepEqual(spectatorTarget(pub(PHASE.PREP, [], [players[0], players[1], b]), 'me', { playerId: 'b' }), { playerId: 'a', fieldId: 'n:a' });
  }
  assert.equal(spectatorTarget(pub(PHASE.PREP, [], [players[0]]), 'me'), null);
});

test('waits for authoritative battle fields and does not scout stale settlement fields or the result screen', () => {
  assert.equal(spectatorTarget(pub(PHASE.COMBAT), 'me', { playerId: 'b' }), null);
  assert.equal(spectatorTarget(pub(PHASE.SETTLE, [{ fieldId: 'n:b', players: ['b'] }]), 'me'), null);
  assert.equal(spectatorTarget(pub(PHASE.RESULT), 'me'), null);
});
