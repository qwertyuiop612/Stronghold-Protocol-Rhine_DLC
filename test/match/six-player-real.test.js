// One whole six-human production-mode match with the real simulation, real cards and unchanged game data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runFull } from './fullmatchRun.js';

test('six real client simulations traverse rounds 1–14 and settle every player without rejections', () => {
  // Scenario-only LP prevents early elimination so all three paired boss fields are exercised.
  const { h, res } = runFull({ mode: 'coop', difficulty: 'NORMAL', humans: 6, bots: 0, seed: 16005, boostLp: 200 });
  assert.deepEqual(res.players.map((p) => p.playerId), ['p_0', 'p_1', 'p_2', 'p_3', 'p_4', 'p_5']);
  assert.ok(res.roundsPassed >= 13, `all normal rounds passed before Final Assault (${res.roundsPassed})`);
  for (const [pid, client] of h.clients) {
    const rounds = new Set(client.starts.filter((s) => !s.watch).map((s) => s.spec.round));
    for (let round = 1; round <= 14; round++) assert.ok(rounds.has(round), `${pid} participated in round ${round}`);
    assert.ok(client.log.some((msg) => msg.t === 'b.result'), `${pid} uploaded normal battle results`);
  }
  // Pairing is shuffled per match (upstream 0.2.6), so the replica seat is not fixed: locate the boss field whose
  // two clients both opened a round-14 start, then check that exactly one of them owns the field.
  const byField = new Map();
  for (const [, client] of h.clients) {
    for (const s of client.starts) {
      if (!s.fieldId || s.watch || s.spec.round !== 14) continue;
      if (!byField.has(s.fieldId)) byField.set(s.fieldId, []);
      byField.get(s.fieldId).push(s);
    }
  }
  const paired = [...byField.values()].find((starts) => starts.length === 2);
  assert.ok(paired, 'one boss field carries both members of a pair');
  assert.equal(paired.filter((s) => s.authoritative).length, 1, 'exactly one client owns the paired field');
  const replica = paired.find((s) => !s.authoritative);
  assert.equal(replica.spec.players.length, 2, 'the replica receives both members of the pair');
  assert.deepEqual([...new Set(replica.spec.players.map((p) => p.side))].sort(), ['L', 'R']);
});
