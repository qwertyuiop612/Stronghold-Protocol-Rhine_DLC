import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PHASE } from '../../shared/constants.js';
import { DATA, makeMatch } from './harness.js';
import { damageRanking } from '../../shared/damageRanking.js';
import { buildBattleSpec, createBattleFromSpec, compactResult } from '../../server/sim/spec.js';
import { validateClientResult } from '../../server/match/fields.js';
import { DataSource } from '../../server/sim/simdata.js';

test('accepted client results retain damage types, prep publishes all players history, other phases omit it', () => {
  const h = makeMatch({ mode: 'coop', difficulty: 'NORMAL', humans: 2, bots: 1, seed: 9102, captureFrames: false, clientCombat: true });
  try {
    h.autoHumans();
    h.m.start();
    h.run(() => h.ended != null || (h.m.round >= 3 && h.m.phase === PHASE.PREP), { maxSteps: 5e6 });
    assert.equal(h.m.phase, PHASE.PREP);
    const players = h.m.publicView().players;
    for (const p of players) assert.deepEqual(p.lastDamageRanking, h.m.lastDamageResults.get(p.playerId) || []);
    assert.ok(players.some((p) => p.lastDamageRanking.length > 0));
    h.m.phase = PHASE.SP_DRAFT;
    assert.ok(h.m.publicView().players.every((p) => !('lastDamageRanking' in p)));
    const ds = new DataSource(DATA, null);
    const record = Object.values(DATA.chess).find((c) => !c.isGolden);
    const spec = buildBattleSpec({ battleId: 'rank', fieldId: 'n:p', kind: 'normal', round: 1, stageId: h.m.stageId,
      timeLimit: 1, players: [{ playerId: 'p', units: [{ uid: 1, chessId: record.chessId, row: 9, col: 3 }] }], spawns: [] });
    const b = createBattleFromSpec(spec, ds, { quiet: true });
    const result = compactResult(b.runToEnd(2));
    result.perPlayer.p.unitStats[0].dmgTypes = { phys: 12, arts: 34, true: 56, elemental: 78 };
    const accepted = validateClientResult(spec, result, { gd: h.m.gd });
    assert.ok(accepted.ok, accepted.reason);
    assert.deepEqual(damageRanking(accepted.result.perPlayer.p.unitStats)[0].types, { phys: 12, arts: 34, true: 56, elemental: 78 });
  } finally { h.m.dispose(); }
});
