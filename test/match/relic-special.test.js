import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMatch } from './harness.js';
import { makeBattle, enemyRec } from '../helpers/battleHarness.js';
import { RELICS, relicIncome } from '../../shared/relics.js';
import { settleRelics, selectRelic, previewRelicLpLoss } from '../../server/match/relics.js';
import { attachAudit } from '../../server/match/audit.js';

function claim(h, ps, id) {
  ps.relics = RELICS.filter((r) => r.id !== id).map((r) => ({ id: r.id, round: h.m.round }));
  const offer = settleRelics(ps, { perfect: true, leaked: [] }, { completed: true });
  assert.deepEqual(offer.options, [id]);
  assert.equal(selectRelic(ps, offer.id, 0).id, id);
  assert.equal(selectRelic(ps, offer.id, 0), null);
  ps.relics = ps.relics.filter((r) => r.id === id);
}
test('时间机器：实际抽取领取，下一场回血、低血不淘汰、护盾不消耗、仅生效一场及审计', () => {
  const h = makeMatch({ mode: 'solo', fake: true }).start();
  try {
    h.toPrep(1); const ps = h.ps('p_0'); claim(h, ps, 'relic_158');
    assert.equal(previewRelicLpLoss(ps, 3), 3);
    h.toPrep(2); const audit = attachAudit(h.m, { strict: true });
    ps.lp = 1; ps.relicShieldRound = 2; ps.relicShield = 2;
    assert.equal(previewRelicLpLoss(ps, 3), -3);
    const spec = { players: [ps.battleInput()], enemies: [{ key: 'r_leak', count: 3, time: 0 }],
      defs: { enemies: { r_leak: enemyRec({ key: 'r_leak', speed: 100 }) } }, seed: 123 };
    const battle = makeBattle(spec); battle.runToEnd();
    const replay = makeBattle(JSON.parse(JSON.stringify(spec))); replay.runToEnd();
    assert.deepEqual(replay.result(), battle.result(), 'JSON战斗输入在两端重放结果一致');
    const result = battle.result().perPlayer[ps.playerId];
    assert.equal(result.leaked.filter((e) => e.counted !== false).length, 3);
    h.m.lastResults.set(ps.playerId, result);
    h.m.settle(); assert.equal(ps.lp, 4); assert.equal(ps.alive, true); assert.equal(ps.stats.lpLost, 0);
    assert.equal(audit.violations.length, 0);
    h.toPrep(3); h.m.lastResults.set(ps.playerId, { leaked: [{}], perfect: false, coins: 0 });
    h.m.settle(); assert.equal(ps.lp, 3); assert.equal(ps.stats.lpLost, 1);
  } finally { h.m.dispose(); }
});
test('时间机器：无扣血也到期，持有者隔离、首领阵地扣血及全队超时份额', () => {
  const h = makeMatch({ humans: 2, fake: true }).start();
  try {
    h.toPrep(1); const a = h.ps('p_0'), b = h.ps('p_1'); claim(h, a, 'relic_158'); h.toPrep(2);
    assert.equal(previewRelicLpLoss(b, 3), 3);
    h.m.teamLp = 20; a.lpAtFinal = 10; b.lpAtFinal = 10;
    h.m._teamLpLoss(2, [a.playerId]); assert.equal(h.m.teamLp, 22);
    h.m._teamLpLoss(2, [b.playerId]); assert.equal(h.m.teamLp, 20);
    h.m._teamLpLoss(2); assert.equal(h.m.teamLp, 20, '各半份额：持有者+1，队友-1');
    h.m.teamLp = null; h.m.round = 3;
    assert.equal(previewRelicLpLoss(a, 2), 2, '即使上一场没有扣血也不延长');
  } finally { h.m.dispose(); }
});
test('木棍：真实候选领取，下回合资金+2，重复不叠加，队友和新局不受影响及收入审计', () => {
  const h = makeMatch({ humans: 2, fake: true }).start();
  try {
    h.toPrep(1); const a = h.ps('p_0'), b = h.ps('p_1'); claim(h, a, 'relic_159');
    const audit = attachAudit(h.m, { strict: true });
    a.endPrep(); b.endPrep();
    const before = a.funds; a.startRound(2);
    assert.equal(a.funds - before, h.m.gd.income(2) + 2);
    assert.equal(relicIncome(['relic_159', 'relic_159', 'relic_025']), 3);
    const bIncome = relicIncome(b.relics); const bBefore = b.funds; b.startRound(2);
    assert.equal(b.funds - bBefore, h.m.gd.income(2) + bIncome);
    assert.equal(audit.violations.length, 0);
    assert.ok(a.privateView().relics.some((r) => r.id === 'relic_159'));
  } finally { h.m.dispose(); }
  const fresh = makeMatch({ mode: 'solo', fake: true }).start();
  try { assert.equal(relicIncome(fresh.ps('p_0').relics), 0); } finally { fresh.m.dispose(); }
});
