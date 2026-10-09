// Match methods for the DLC collectible choices and teammate revival.
// Installed on Match.prototype by ../Match.js.

import { PHASE, ERR } from '../../../shared/constants.js';
import { RELIC_CHOICE_SECONDS, getRelic } from '../../../shared/relics.js';
import { selectRelic, autoSelectRelic, unusedRevival, consumeRevival, revivalOperators } from '../relics.js';
import { OK, fail, DELAYS } from './common.js';
import { msg } from '../../../shared/i18n.js';

export class MatchRelics {
  reviveTeammate(ps, relicId, playerId) {
    if (this.phase !== PHASE.PREP || this.ended || this.isSolo) return fail(ERR.WRONG_PHASE);
    if (!ps.alive || ps.left) return fail(ERR.ELIMINATED);
    const target = this.players.get(playerId);
    if (!unusedRevival(ps, relicId) || !target || target === ps || target.alive || target.left || !target.eliminatedRoster) return fail(ERR.BAD_TARGET);
    // 先计算四名确定的补给；没有合法干员时拒绝，不消耗藏品。
    const effect = getRelic(relicId).reviveOnce;
    const reward = revivalOperators(target, ps, effect.operators);
    if (reward.ids.length !== effect.operators) return fail(ERR.BAD_TARGET);
    consumeRevival(ps, target.playerId, relicId);
    target.alive = true;
    target.lp = effect.lp;
    target.eliminatedRound = null;
    target.lpAtFinal = null;
    target.ready = false;
    target.restoreEliminatedRoster();
    // 首领回合的整备允许救人，重新配对后所有阵地沿用新的部署区域。
    if (this.round === this.gd.bossRound || this.round === this.gd.hiddenRound) this._planBossWaves();
    target.startRound(this.round);
    this.dispatch(target, 'onRoundStart', { round: this.round });
    this.dispatch(target, 'onPrepStart', { round: this.round });
    target.relicChessQueue.push(...reward.ids);
    for (const p of this.alivePlayers()) p.recompute();
    this.watchers.delete(target.playerId);
    this.sendTo(target.playerId, this.prepFieldMeta(target));
    if (target.botControlled) this.scheduleBotPrep(target);
    this.markPublic();
    this.toast(ps, 'success', msg('「时光之末」已使用，复活了 {name}', { name: target.name }));
    this.toast(target, 'success', msg('{name} 使用「时光之末」复活了你：{lp} 点生命、{operators} 名干员补给', { name: ps.name, lp: effect.lp, operators: effect.operators }));
    return OK;
  }

  _waitRelicChoices(continuation) {
    for (const ps of this.alivePlayers()) if (ps.isBot || ps.autoplay || !ps.connected) autoSelectRelic(ps);
    if (!this.alivePlayers().some((ps) => !ps.left && ps.relicOffer)) {
      this.setDeadline(DELAYS.SETTLE / 1000, continuation, { silent: this.soloUntimed });
      return;
    }
    this.phase = PHASE.SETTLE;
    this._relicContinue = continuation;
    if (this.soloUntimed) this.setDeadline(0);
    else this.setDeadline(RELIC_CHOICE_SECONDS, () => {
      for (const ps of this.alivePlayers()) autoSelectRelic(ps);
      this._completeRelicChoices();
    });
    this.markPublic();
  }

  _completeRelicChoices() {
    if (!this._relicContinue || this.alivePlayers().some((ps) => !ps.left && ps.relicOffer)) return;
    const next = this._relicContinue;
    this._relicContinue = null;
    this.cancel(this._phaseTimer);
    this._phaseTimer = null;
    this.deadline = 0;
    next();
  }

  pickRelicChoice(ps, offerId, idx) {
    if (this.phase !== PHASE.SETTLE || !this._relicContinue) return fail(ERR.WRONG_PHASE);
    if (!selectRelic(ps, offerId, idx)) return fail(ERR.BAD_TARGET);
    this.markPublic();
    this._completeRelicChoices();
    return OK;
  }
}
