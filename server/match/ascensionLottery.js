import { pickRelic, getRelic } from '../../shared/relics.js';
import { createRng, deriveSeed } from '../sim/rng.js';
import { grantRelic } from './relics.js';
import { t } from '../../shared/i18n.js';

/** One independent, server-owned, equal-probability draw per survivor at the start of ASCENSION R4. */
export function drawAscensionLottery(ps) {
  const m = ps.m;
  if (m.difficulty !== 'ASCENSION' || m.round !== 4 || !ps.alive || ps.left || ps.ascensionLottery) return null;
  const rng = createRng(deriveSeed(m.seed, `ascension-lottery:${ps.seat}:4`));
  const kind = ['coins', 'operators', 'relics', 'heal'][rng.int(4)];
  const reward = { round: 4, kind, ids: [], bondId: null, amount: 0, text: '' };
  // Record before acquisition hooks, so re-entrancy cannot grant a second reward.
  ps.ascensionLottery = reward;
  if (kind === 'coins') {
    ps.addFunds(15, { reason: 'ascension-lottery' });
    reward.amount = 15;
    reward.text = t('15 金币');
  } else if (kind === 'heal') {
    ps.lp += 8;
    reward.amount = 8;
    reward.text = t('恢复 8 点目标生命值');
    m.markPublic();
  } else if (kind === 'operators') {
    // Persistent layers, not activation tier. Inactive bonds with accumulated layers remain eligible.
    // With no accumulated layers, prefer bonds represented in the player's current lineup.
    const candidates = m.gd.bondIds.filter((bondId) => !m.gd.modeInactiveBonds.has(bondId)
      && [...m.pool.entries.keys()].some((id) => m.gd.chess(id).bonds?.includes(bondId)));
    const max = Math.max(0, ...candidates.map((id) => ps.layers[id] || 0));
    let ties = candidates.filter((id) => (ps.layers[id] || 0) === max);
    if (max === 0) {
      const represented = ties.filter((id) => ps.bonds[id]?.count > 0);
      if (represented.length) ties = represented;
    }
    reward.bondId = ties.length ? ties[rng.int(ties.length)] : null;
    const pool = [...m.pool.entries.keys()].filter((id) => m.gd.chess(id).bonds?.includes(reward.bondId));
    for (let i = 0; i < 2 && pool.length; i++) {
      const id = pool[rng.int(pool.length)];
      // Effect grants may create a copy when the shared pool is exhausted, as other direct grants do.
      if (ps.acquireChess(id, { source: 'ascension-lottery' })) reward.ids.push(id);
    }
    const bondName = m.gd.bond(reward.bondId)?.name || reward.bondId || t('盟约');
    reward.text = t('{bondName}盟约干员：{1}', { bondName, 1: reward.ids.map((id) => m.gd.chess(id).name).join('、') || t('整备区已满，未能领取') });
  } else {
    for (let i = 0; i < 2; i++) {
      const r = pickRelic(4, ps.relics, rng, { multiplayer: !m.isSolo });
      if (r && grantRelic(ps, r.id, { round: 4, battleRound: 4 })) reward.ids.push(r.id);
    }
    reward.text = t('收藏品：{0}', { 0: reward.ids.map((id) => getRelic(id).name).join('、') || t('可用收藏品已全部持有') });
  }
  ps.dirty();
  m.toast(ps, 'success', t('超限模拟 · 第 4 回合抽奖：{text}', { text: reward.text }));
  return reward;
}

export const ascensionLotteryView = (ps) => ps.ascensionLottery
  ? { ...ps.ascensionLottery, ids: [...ps.ascensionLottery.ids] } : null;
