import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMatch } from './harness.js';
import { grantRelic } from '../../server/match/relics.js';
import { PHASE } from '../../shared/constants.js';
import { battleResultBox, battleOverSfx, uniteResultBox } from '../../public/js/ui/gameLogic.js';

test('settlement reports the collectible-adjusted LP charge to the result dialog, including shields and reversal', () => {
  const h = makeMatch({ mode: 'coop', humans: 2, fake: true }).start().toPrep();
  try {
    const shielded = h.ps('p_0'), reversed = h.ps('p_1');
    shielded.relicShield = 2;
    shielded.relicShieldRound = h.m.round;
    grantRelic(reversed, 'relic_158', { battleRound: h.m.round });
    for (const ps of [shielded, reversed]) h.m.lastResults.set(ps.playerId, {
      leaked: Array.from({ length: 2 }, () => ({ counted: true })), perfect: false,
    });
    const before = [shielded.lp, reversed.lp];
    h.m.settle();
    // Retain this round's view before the virtual settlement timer advances.
    const losses = h.m.publicView().roundLosses;
    assert.deepEqual(losses, { p_0: 0, p_1: -2 });
    assert.deepEqual([shielded.lp, reversed.lp], [before[0], before[1] + 2]);
    assert.equal(battleResultBox({ leaks: 2, loss: losses.p_0 }).sub, '全员无伤！');
    assert.equal(battleResultBox({ leaks: 2, loss: losses.p_1 }).sub, '生命值增加 +2');
    assert.equal(battleOverSfx({ leaks: 2, loss: losses.p_0 }), 'battleOverNormal');
    assert.equal(battleOverSfx({ leaks: 2, loss: losses.p_1 }), 'battleOverNormal');
    assert.equal(uniteResultBox({ through: 2, losses }, 'p_1').sub, '生命值增加 +2');
    losses.p_0 = 100;
    assert.equal(h.m.publicView().roundLosses.p_0, 0, 'the view is copied');
    h.m.round++;
    h.m.phase = PHASE.SETTLE;
    assert.equal(h.m.publicView().roundLosses, undefined, 'a boss settlement cannot reuse the previous round');
  } finally { h.m.dispose(); }
});
