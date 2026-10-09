import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMatch } from './harness.js';
import { attachAudit } from '../../server/match/audit.js';
import { grantRelic, settleRelics, selectRelic, revivalOperators, relicsView } from '../../server/match/relics.js';
import { RELICS, getRelic } from '../../shared/relics.js';
import { validateC2S } from '../../shared/protocol.js';

const ID = 'relic_233';
const setup = (opts = {}) => makeMatch({ mode: 'coop', humans: 2, fake: true, ...opts }).start().toPrep();
const request = (playerId = 'p_1', relicId = ID) => ({ t: 'g.relicRevive', relicId, playerId });
const kill = (ps) => { ps.lp = 0; ps.eliminate(ps.m.round); };

test('revival restores a DIY operator from the player stock without touching the shared or teammate stock', () => {
  const slot = 'chess_char_5_diy1_a';
  const diy = { [slot]: { charId: 'char_112_siege', skillIndex: 2, uniEquipId: 'uniequip_002_siege' } };
  const seats = [0, 1].map((seat) => ({ seat, playerId: 'p_' + seat, name: 'P' + seat, isBot: false, connected: true, diy }));
  const h = setup({ seats, seed: 11 });
  try {
    const owner = h.ps('p_0'), target = h.ps('p_1');
    grantRelic(owner, ID);
    const before = target.diyStock.snapshot()[slot];
    const ownerStock = owner.diyStock.snapshot()[slot];
    assert.equal(before, 8, 'the selected DIY slot is available for this seed');
    const piece = target.acquireChess(slot, { source: 'buy' });
    assert.ok(piece);
    assert.equal(target.diyStock.snapshot()[slot], before - 1);
    kill(target);
    assert.equal(target.diyStock.snapshot()[slot], before);
    assert.equal(h.m.handle(owner.playerId, request()).ok, true);
    assert.equal(target.find(piece.uid).piece.id, slot);
    assert.equal(target.find(piece.uid).piece.poolCopies, 1);
    assert.equal(target.diyStock.snapshot()[slot], before - 1);
    assert.equal(owner.diyStock.snapshot()[slot], ownerStock);
    assert.equal(h.m.pool.has(slot), false);
    h.invariants();
  } finally { h.m.dispose(); }
});

test('时光之末：真实候选及合法领取；使用后仍排除同名，协议拒绝伪造字段', () => {
  const h = setup();
  try {
    h.toPrep(7);
    const ps = h.ps('p_0');
    ps.relics = RELICS.filter((r) => r.id !== ID).map((r) => ({ id: r.id, round: 1 }));
    assert.equal(h.m.handle(ps.playerId, request()).error, 'BAD_TARGET');
    const offer = settleRelics(ps, { perfect: true, leaked: [] }, { completed: true });
    assert.deepEqual(offer.options, [ID]);
    assert.equal(getRelic(ID).tier, 4);
    assert.equal(selectRelic(ps, offer.id, 0).id, ID);
    assert.equal(grantRelic(ps, ID), null);
    assert.equal(validateC2S(request()), null);
    assert.equal(validateC2S({ ...request(), lp: 999, operators: ['forged'] }), null, '多余字段沿用协议规则，但不参与服务端效果计算');
    assert.ok(validateC2S({ t: 'g.relicRevive', relicId: ID }));
  } finally { h.m.dispose(); }
});

for (const clientCombat of [false, true]) test(`时光之末：致命结算自动自救一次，超量扣血恢复至11，审计正确 (${clientCombat})`, () => {
  const h = setup({ clientCombat });
  try {
    const ps = h.ps('p_0'), ally = h.ps('p_1');
    grantRelic(ps, ID);
    ps.lp = 1; ally.lp = 1;
    const result = { leaked: Array.from({ length: 5 }, () => ({ counted: true })), perfect: false, layerGains: {} };
    h.m.lastResults.set(ps.playerId, result); h.m.lastResults.set(ally.playerId, result);
    const audit = attachAudit(h.m);
    h.m.settle();
    assert.equal(ps.lp, 11); assert.equal(ps.alive, true);
    assert.equal(ally.alive, false); assert.equal(ally.lp, 0);
    assert.equal(ps.relics.find((r) => r.id === ID).used, true);
    assert.equal(ps.stats.lpLost, 5);
    assert.deepEqual(audit.violations, []);
    h.invariants();
    ps.relics.push({ id: ID, round: 1 }); // 重复记录不能刷新同名藏品的使用次数。
    ps.lp = 1;
    h.m.round++;
    h.m.settle();
    assert.equal(ps.alive, false); assert.equal(ps.lp, 0);
  } finally { h.m.dispose(); }
});

test('时光之末：救队友还原原UID与装备，四名干员来自被救者最高层数盟约且不超过其商店等级', () => {
  const h = setup();
  try {
    const owner = h.ps('p_0'), target = h.ps('p_1');
    grantRelic(owner, ID);
    target.shop.level = 2;
    const base = [...h.m.pool.entries.keys()].find((id) => h.m.gd.goldenIdOf(id));
    const old = target.acquireChess(h.m.gd.goldenIdOf(base));
    let placed = false;
    for (let row = 9; row <= 12 && !placed; row++) for (let col = 2; col <= 10 && !placed; col++) placed = !!target.move(old.uid, { area: 'board', row, col }).ok;
    assert.equal(placed, true);
    const itemId = Object.keys(h.m.gd.raw.items).find((id) => h.m.gd.item(id)?.itemType === 'EQUIP');
    if (itemId) old.items.push(target.newPiece('item', itemId));
    const before = structuredClone(old);
    const eligibleBonds = h.m.gd.bondIds.filter((b) => [...h.m.pool.entries.keys()].some((id) => h.m.gd.tierOf(id) <= 2 && h.m.gd.chess(id).bonds?.includes(b)));
    target.layers[eligibleBonds[0]] = 100;
    owner.layers[eligibleBonds[1]] = 200;
    target.recompute();
    kill(target);
    assert.equal(h.m.publicView().players.find((p) => p.playerId === target.playerId).canRevive, true);
    const expected = revivalOperators(target, owner, 4);
    assert.equal(expected.ids.length, 4);
    assert.equal(expected.bondId, eligibleBonds[0]);
    assert.equal(h.m.handle(owner.playerId, request()).ok, true);
    assert.equal(target.lp, 11); assert.equal(target.alive, true); assert.equal(target.eliminatedRound, null);
    assert.deepEqual(target.find(old.uid).piece, before);
    assert.equal(target.round.gainedChess, 4);
    assert.deepEqual(target.relicChessQueue, []);
    for (const id of expected.ids) {
      assert.ok(h.m.gd.tierOf(id) <= target.shop.level);
      assert.ok(h.m.gd.chess(id).bonds.includes(expected.bondId));
    }
    assert.equal(h.m.handle(owner.playerId, request()).error, 'BAD_TARGET');
    const wire = relicsView(owner); wire.find((r) => r.id === ID).used = false;
    assert.equal(owner.relics.find((r) => r.id === ID).used, true);
    h.m.onReconnect(target.playerId);
    assert.equal(target.round.gainedChess, 4);
    h.invariants();
    // 救人后不可再自救。
    owner.lp = 1;
    h.m.lastResults.set(owner.playerId, { leaked: [{ counted: true }], perfect: false });
    h.m.settle();
    assert.equal(owner.alive, false);
  } finally { h.m.dispose(); }
});

test('时光之末：满整备区完整还原，四名补给排队、腾位自动发放且共享池耗尽不丢奖励', () => {
  const h = setup();
  try {
    const owner = h.ps('p_0'), target = h.ps('p_1');
    grantRelic(owner, ID);
    const itemIds = Object.keys(h.m.gd.raw.items).filter((id) => h.m.gd.item(id)?.itemType === 'EQUIP').slice(0, 15);
    assert.equal(itemIds.length, 15);
    for (const id of itemIds) target.stow(target.newPiece('item', id));
    kill(target);
    const expected = revivalOperators(target, owner, 4);
    for (const id of expected.ids) h.m.pool.entries.get(id).left = 0;
    assert.equal(h.m.handle(owner.playerId, request()).ok, true);
    assert.equal(target.hand.filter(Boolean).length, 10); assert.equal(target.temp.filter(Boolean).length, 5);
    assert.deepEqual(target.relicChessQueue, expected.ids);
    // 恢复测试池帐目，再腾位；补给自身不重复抽取。
    for (const id of new Set(expected.ids)) h.m.pool.entries.get(id).left = h.m.pool.entries.get(id).cap;
    target.ready = false;
    const uid = target.hand.find(Boolean).uid;
    assert.equal(target.destroy(uid).ok, true);
    assert.ok(target.round.gainedChess > 0);
    assert.equal(target.round.gainedChess + target.relicChessQueue.length, 4);
    const wire = target.privateView().relicChessQueue; wire.push('forged');
    assert.ok(!target.relicChessQueue.includes('forged'));
    h.invariants();
  } finally { h.m.dispose(); }
});

test('时光之末：并列最高选择单个盟约，空池仍直接发四名；新局使用状态重置', () => {
  const h = setup();
  try {
    const owner = h.ps('p_0'), target = h.ps('p_1');
    grantRelic(owner, ID); kill(target);
    const bonds = h.m.gd.bondIds.filter((b) => !h.m.gd.modeInactiveBonds.has(b)
      && [...h.m.pool.entries.keys()].some((id) => h.m.gd.tierOf(id) <= target.shop.level && h.m.gd.chess(id).bonds.includes(b))).slice(0, 2);
    for (const b of bonds) target.layers[b] = 50;
    const expected = revivalOperators(target, owner, 4);
    assert.ok(bonds.includes(expected.bondId));
    // 模拟候选副本全部耗尽，效果发放仍可创建不占池副本的干员。
    for (const id of new Set(expected.ids)) {
      const e = h.m.pool.entries.get(id);
      e.left = 0;
    }
    assert.equal(h.m.handle(owner.playerId, request()).ok, true);
    assert.equal(target.round.gainedChess, 4);
    assert.ok(target.allChess().every((p) => p.poolCopies === 0));
  } finally { h.m.dispose(); }
  const fresh = setup();
  try { assert.deepEqual(fresh.ps('p_0').relics, []); assert.deepEqual(fresh.ps('p_0').relicChessQueue, []); }
  finally { fresh.m.dispose(); }
});

for (const clientCombat of [false, true]) test(`时光之末：完整普通战斗自动自救，已使用不可再救队友 (${clientCombat})`, () => {
  const h = setup({ clientCombat, script: (b) => ({ leaks: Object.fromEntries(b.players.map((id) => [id, 2])) }) });
  try {
    const owner = h.ps('p_0'), target = h.ps('p_1');
    grantRelic(owner, ID); owner.lp = 1; target.lp = 1;
    h.toPrep(2);
    assert.equal(owner.lp, 11); assert.equal(target.alive, false);
    // 自救已经消耗，队友没有同名道具时不能再复活。
    assert.equal(h.m.handle(owner.playerId, request()).error, 'BAD_TARGET');
    h.invariants();
  } finally { h.m.dispose(); }
});

for (const clientCombat of [false, true]) test(`时光之末：完整回合淘汰、按钮救人、原干员及补给下一场参战 (${clientCombat})`, () => {
  const h = setup({ clientCombat, script: () => ({ leaks: { p_0: 1, p_1: 2 } }) });
  try {
    const owner = h.ps('p_0'), target = h.ps('p_1');
    grantRelic(owner, ID); owner.lp = 50; target.lp = 1;
    const base = [...h.m.pool.entries.keys()].find((id) => h.m.gd.goldenIdOf(id));
    const old = target.acquireChess(h.m.gd.goldenIdOf(base));
    let placed = false;
    for (let row = 9; row <= 12 && !placed; row++) for (let col = 2; col <= 10 && !placed; col++) placed = !!target.move(old.uid, { area: 'board', row, col }).ok;
    assert.ok(placed);
    h.toPrep(2);
    assert.equal(target.alive, false);
    assert.equal(h.m.handle(owner.playerId, request()).ok, true);
    assert.equal(target.lp, 11); assert.equal(target.round.gainedChess, 4);
    assert.ok(target.battleInput().units.some((u) => u.uid === old.uid));
    h.toPrep(3);
    assert.equal(target.alive, true); assert.equal(target.lp, 9);
    assert.ok(target.find(old.uid));
    h.invariants();
  } finally { h.m.dispose(); }
});

test('时光之末：首领整备复活重新配对，保留旧阵容并进入共享首领战', () => {
  const h = setup({ humans: 3 });
  try {
    const owner = h.ps('p_0'), target = h.ps('p_1');
    grantRelic(owner, ID);
    const piece = target.acquireChess([...h.m.pool.entries.keys()][0]);
    const uid = piece.uid;
    kill(target);
    h.m.startRound(h.m.gd.bossRound); h.runToPhase('PREP');
    assert.equal(h.m.handle(owner.playerId, request()).ok, true);
    assert.ok(target.find(uid));
    assert.equal(h.m.bossWaves.flatMap((g) => g.players).length, 3);
    h.invariants();
    for (const ps of h.m.order) { ps.resolveTemp(); ps.setReady(true); }
    h.runToPhase('FINAL_ASSAULT');
    assert.ok(h.m.fields.some((f) => f.players.includes(target.playerId)));
    h.invariants();
  } finally { h.m.dispose(); }
});

test('时光之末：无层数也发四名；并列最高与同种子确定；离场、活人、陌生人、观战藏品及错误阶段拒绝', () => {
  const outcomes = [];
  for (let i = 0; i < 2; i++) {
    const h = setup();
    try {
      const owner = h.ps('p_0'), target = h.ps('p_1');
      grantRelic(owner, ID);
      assert.equal(h.m.handle(owner.playerId, request()).error, 'BAD_TARGET');
      kill(target);
      assert.equal(h.m.handle(target.playerId, request('p_0')).error, 'ELIMINATED');
      assert.equal(h.m.handle(owner.playerId, request('stranger')).error, 'BAD_TARGET');
      assert.equal(h.m.handle(owner.playerId, request('p_1', 'relic_079')).error, 'BAD_TARGET');
      target.left = true;
      assert.equal(h.m.handle(owner.playerId, request()).error, 'BAD_TARGET');
      target.left = false;
      h.m.phase = 'COMBAT';
      assert.equal(h.m.handle(owner.playerId, request()).error, 'WRONG_PHASE');
      h.m.phase = 'PREP';
      assert.equal(owner.relics.find((r) => r.id === ID).used, undefined);
      const reward = revivalOperators(target, owner, 4);
      assert.equal(reward.ids.length, 4);
      outcomes.push(reward);
      assert.equal(h.m.handle(owner.playerId, request()).ok, true);
      assert.equal(target.round.gainedChess, 4);
    } finally { h.m.dispose(); }
  }
  assert.deepEqual(outcomes[0], outcomes[1]);
});

for (const clientCombat of [false, true]) test(`时光之末：首领共享血池耗尽按座位每次仅消耗一件、继续作战 (${clientCombat})`, () => {
  const h = setup({ clientCombat });
  try {
    for (const ps of h.m.order) { grantRelic(ps, ID); ps.lpAtFinal = 1; ps.lp = 1; }
    h.m.phase = 'FINAL_ASSAULT'; h.m.teamLp = 2;
    h.m._teamLpLoss(20);
    assert.equal(h.m.teamLp, 11);
    assert.equal(h.ps('p_0').relics.find((r) => r.id === ID).used, true);
    assert.ok(!h.ps('p_1').relics.find((r) => r.id === ID).used);
    assert.equal(h.m.order.reduce((n, ps) => n + ps.lp, 0), 11);
    h.m._teamLpLoss(20);
    assert.equal(h.m.teamLp, 11);
    assert.equal(h.ps('p_1').relics.find((r) => r.id === ID).used, true);
    h.m._teamLpLoss(20);
    assert.equal(h.m.teamLp, 0);
  } finally { h.m.dispose(); }
});
