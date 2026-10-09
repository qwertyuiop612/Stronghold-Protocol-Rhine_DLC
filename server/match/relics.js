import { getRelic, pickRelicChoices, RELIC_TIERS } from '../../shared/relics.js';
import { normalizeDifficultyLevel } from '../../shared/difficulty.js';
import { createRng, deriveSeed } from '../sim/rng.js';
import { t, msg } from '../../shared/i18n.js';

/** Process the owner's completed battle once; rescue and shields do not erase personal leaks. */
export function settleRelics(ps, result, { completed = false } = {}) {
  const round = ps.m.round;
  if (!completed || !ps.alive || ps.left || !result || result.synthetic
    || typeof result.perfect !== 'boolean' || !Array.isArray(result.leaked)
    || ps.relicSettledRounds.has(round)) return null;
  ps.relicSettledRounds.add(round);
  if (ps.relicLastRound !== round - 1) ps.relicLeakStreak = 0;
  ps.relicLastRound = round;
  const leaked = result.leaked.some((l) => l && l.counted !== false);
  ps.relicLeakStreak = leaked ? ps.relicLeakStreak + 1 : 0;
  const comeback = ps.relicLeakStreak >= 3;
  if (comeback) {
    ps.relicLeakStreak = 0;
    ps.relicNextShieldRound = round + 1;
  }
  ps.dirty();
  if ((!comeback && (leaked || !result.perfect)) || ps.relicOffer) return null;
  const rng = createRng(deriveSeed(ps.m.seed, `relic-choice:${ps.seat}:${round}`));
  const options = pickRelicChoices(round, ps.relics, rng, { comeback, multiplayer: !ps.m.isSolo });
  if (!options.length) return null;
  ps.relicOffer = { id: `relic:${ps.seat}:${round}`, round, reason: comeback ? 'comeback' : 'perfect', options };
  return ps.relicOffer;
}

/** Server-owned offer identity and index prevent stale, duplicate or forged choices. */
export function selectRelic(ps, offerId, idx) {
  const offer = ps.relicOffer;
  if (!ps.alive || ps.left || !offer || offer.id !== offerId || offer.round !== ps.m.round
    || !Number.isInteger(idx) || idx < 0 || idx >= offer.options.length) return null;
  const r = getRelic(offer.options[idx]);
  if (!r || (r.multiplayerOnly && ps.m.isSolo) || ps.relics.some((o) => o.id === r.id)) return null;
  ps.relicOffer = null;
  return grantRelic(ps, r.id, { round: offer.round });
}

/** Shared acquisition path for choices and immediate grants; preserves one-time collectible effects. */
export function grantRelic(ps, id, { round = ps.m.round, battleRound = round + 1 } = {}) {
  const r = getRelic(id);
  if (!ps.alive || ps.left || !r || (r.multiplayerOnly && ps.m.isSolo)
    || ps.relics.some((o) => o.id === id)) return null;
  const reward = { id: r.id, round };
  ps.relics.push(reward);
  // 合法领取时一次性降低全队等级；既有战斗保留原规则，后续所有阵地共用新等级。
  if (r.difficultyReduction) {
    ps.m.difficultyLevel = normalizeDifficultyLevel(ps.m.difficultyLevel - r.difficultyReduction);
    ps.m.markPublic();
  }
  if (r.reverseLpOnce) ps.relicReverseLpRound = battleRound;
  ps.relicReward = reward;
  ps.dirty();
  const tier = RELIC_TIERS[r.tier - 1];
  ps.m.toast(ps, 'success', msg('获得{tier}收藏品「{name}」', { tier: tier.name, name: r.name }));
  return reward;
}

export function autoSelectRelic(ps) {
  if (!ps.relicOffer) return;
  let idx = 0;
  if (ps.isBot || ps.autoplay) ps.relicOffer.options.forEach((id, i) => {
    if ((getRelic(id)?.tier || 0) > (getRelic(ps.relicOffer.options[idx])?.tier || 0)) idx = i;
  });
  selectRelic(ps, ps.relicOffer.id, idx);
}

export const activeReverseLp = (ps) => ps.relicReverseLpRound > 0 && ps.relicReverseLpRound === ps.m.round;
/** 时间机器先反转应扣血量，护盾保留；负数表示回血。 */
export const previewRelicLpLoss = (ps, amount) => activeReverseLp(ps) ? -Math.max(0, amount) : shieldedLpLoss(ps, amount);
export const consumeRelicLpLoss = (ps, amount) => activeReverseLp(ps) ? -Math.max(0, amount) : consumeRelicShield(ps, amount);

export const activeRelicShield = (ps) => ps.relicShieldRound === ps.m.round ? Math.max(0, ps.relicShield) : 0;
export const shieldedLpLoss = (ps, amount) => Math.max(0, amount - activeRelicShield(ps));
export function consumeRelicShield(ps, amount) {
  const used = Math.min(Math.max(0, amount), activeRelicShield(ps));
  if (used > 0) { ps.relicShield -= used; ps.dirty(); }
  return Math.max(0, amount - used);
}
export function startRelicRound(ps, round) {
  ps.relicShield = ps.relicNextShieldRound === round ? 2 : 0;
  ps.relicShieldRound = round;
  ps.relicNextShieldRound = 0;
}

/** 自救与救队友共用持有记录中的一次使用机会，保留图鉴及本局获得记录。 */
export function unusedRevival(ps, id = null) {
  if (!ps.alive || ps.left) return null;
  const used = new Set(ps.relics.filter((r) => r.used).map((r) => r.id));
  return ps.relics.find((r) => (!id || r.id === id) && !used.has(r.id) && getRelic(r.id)?.reviveOnce) || null;
}

export function consumeRevival(ps, targetId, id = null) {
  const record = unusedRevival(ps, id);
  if (!record) return null;
  record.used = true;
  record.usedRound = ps.m.round;
  record.targetId = targetId;
  ps.dirty();
  return getRelic(record.id).reviveOnce;
}

export function reviveSelf(ps) {
  if (ps.lp > 0) return false;
  const effect = consumeRevival(ps, ps.playerId);
  if (!effect) return false;
  ps.lp = effect.lp;
  ps.dirty();
  ps.m.toast(ps, 'success', t('「时光之末」已自动使用，恢复 {lp} 点目标生命值', { lp: effect.lp }));
  return true;
}

/** 只从被救者当前可招募的盟约中选累计层数最高者；独立随机流不干扰商店。 */
export function revivalOperators(ps, owner, count) {
  const m = ps.m;
  const rng = createRng(deriveSeed(m.seed, `relic-revive:${owner.seat}:${ps.seat}:${m.round}`));
  const eligible = [...m.pool.entries.keys()].filter((id) => m.gd.tierOf(id) <= ps.shop.level);
  const bonds = m.gd.bondIds.filter((bondId) => !m.gd.modeInactiveBonds.has(bondId)
    && eligible.some((id) => m.gd.chess(id).bonds?.includes(bondId)));
  const max = Math.max(0, ...bonds.map((id) => ps.layers[id] || 0));
  let ties = bonds.filter((id) => (ps.layers[id] || 0) === max);
  if (max === 0) {
    const roster = ps.eliminatedRoster?.board || ps.board;
    const represented = ties.filter((id) => [...roster.values()].some((p) => p.kind === 'chess' && m.gd.chess(p.id)?.bonds?.includes(id)));
    if (represented.length) ties = represented;
  }
  const bondId = ties.length ? ties[rng.int(ties.length)] : null;
  const pool = eligible.filter((id) => m.gd.chess(id).bonds?.includes(bondId));
  return { bondId, ids: Array.from({ length: pool.length ? count : 0 }, () => pool[rng.int(pool.length)]) };
}

/** Fresh wire values: UI state and battle inputs must not share mutable references with a player's collection. */
export function relicsView(ps) {
  return ps.relics.filter((r) => getRelic(r.id)).map(({ id, round, used, usedRound, targetId }) => ({
    id, round, ...(used ? { used: true, usedRound, targetId } : {}),
  }));
}
export const relicOfferView = (ps) => ps.relicOffer ? { ...ps.relicOffer, options: [...ps.relicOffer.options] } : null;
