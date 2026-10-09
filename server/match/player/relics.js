// PlayerState methods for restoring an eliminated roster and delivering DLC revival supplies.
// Installed on PlayerState.prototype by ../PlayerState.js.

import { PHASE } from '../../../shared/constants.js';
import { freeSlot } from '../board.js';

export class PlayerRelics {
  restoreEliminatedRoster() {
    const saved = this.eliminatedRoster;
    if (!saved) return;
    this.board = saved.board;
    this.hand = saved.hand;
    this.temp = saved.temp;
    this.relicChessQueue = saved.queue;
    this.eliminatedRoster = null;
    for (const p of this.allChess()) p.poolCopies = this.poolOf(this.gd.baseIdOf(p.id)).take(this.gd.baseIdOf(p.id), saved.copies.get(p.uid) || 0);
    // 死亡期间错过的整备不销毁还原的临时区物件，重新给一次完整处理机会。
    this._tempDue.clear();
    for (let i = 0; i < this.temp.length; i++) if (this.temp[i]) this._putTemp(i, this.temp[i]);
    this.invalidateDeployMap();
  }

  drainRelicChess() {
    if (this._drainingRelicChess || !this.alive || this.left || this.ready || this.m.phase !== PHASE.PREP) return;
    this._drainingRelicChess = true;
    try {
      while (this.relicChessQueue.length) {
        const id = this.relicChessQueue[0];
        if (freeSlot(this.hand) < 0 && freeSlot(this.temp) < 0 && !this.completesChessMerge(id)) break;
        this.relicChessQueue.shift();
        if (!this.acquireChess(id, { source: 'relic-revive' })) { this.relicChessQueue.unshift(id); break; }
      }
    } finally { this._drainingRelicChess = false; }
  }
}
