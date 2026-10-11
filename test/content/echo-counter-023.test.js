// Real reflected hits against a scaled hit-count enemy must finish without recursive hook overflow.
// The fork keeps Rhine's reflection-origin tags (a reflected pulse carries \`reflect\`), so the counter chain is
// bounded instead of running to the echo's last hit-count HP — the engine must still resolve the earned pulses
// exactly once and leave no state behind.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, checkInvariants } from '../helpers/battleHarness.js';
const ECHO = 'enemy_9023_acdums';
for (const chessId of ['chess_char_1_06_b', 'chess_char_2_08_a']) {
  test(`${chessId}: a 67-hit echo resolves its counter pulses without recursive hook overflow`, () => {
    const h = makeBattle({ units: [{ chessId, row: 10, col: 4 }], autoFinish: false, captureNoisy: true, hooks: ['damaged'] });
    h.step();
    const u = h.unit(chessId);
    h.b.addBuff(u, { key: 'test:survive', persist: true, mods: { hpFlat: 1e8 } });
    u.hp = u.s.maxHp;
    u.skill.sp = u.skill.spCost; u.skill.charges = 1;
    assert.ok(u.skill.activate('manual'));
    const echo = h.spawn(ECHO, { pos: [10, 5], mods: { hpMul: 6.7, speedMul: 0 } });
    assert.equal(echo.s.maxHp, 67);
    const t = h.eventsOf('fx').length;
    h.b.dealDamage(u, echo, { amount: 1, type: 'arts', isAttack: true });
    // the chain is bounded: the initial hit plus the one legal reflection, each pulsing once
    const pulses = h.eventsOf('fx').slice(t).filter((f) => f[1] === 'explode' && f[4]?.kind === 'echoPulse');
    assert.equal(pulses.length, 2, 'the hit and its one legal reflection');
    assert.equal(echo.mem.ab.pulses.length, 0, 'the pulse queue drains');
    assert.equal(echo.mem.ab.pulsing, false, 'the queue is not left mid-resolution');
    assert.equal(h.b.errors.length, 0, 'no hook recurs');
    checkInvariants(h.b);
  });
}
