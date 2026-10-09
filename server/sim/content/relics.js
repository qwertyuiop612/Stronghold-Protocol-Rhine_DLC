// Collection bonuses are resolved from shared, trusted definitions. A single persistent buff contains the
// collection modifiers, so death, redeployment and re-installation never multiply the same bonuses.
import { getRelic, relicModifiers } from '../../../shared/relics.js';
import { passiveBuff, playerOps } from './support/index.js';

const KEY = 'relic:collection';

export function install(battle) {
  const byPlayer = new Map();
  for (const ps of battle.players) {
    const input = ps.input?.relics;
    const ids = Array.isArray(input) ? [...new Set(input.filter((id) => typeof id === 'string' && getRelic(id)))] : [];
    if (ids.length) byPlayer.set(ps.playerId, ids);
  }
  if (!byPlayer.size) return;

  const apply = (unit) => {
    if (!unit || unit.kind !== 'op') return;
    const ids = byPlayer.get(unit.ownerId);
    if (!ids) return;
    const mods = relicModifiers(ids, unit.def?.profession, unit.def?.position);
    if (Object.keys(mods).length) passiveBuff(battle, unit, KEY, mods);
  };

  // Before the first deployment: HP bonuses are already included in its full-health / carry-ratio state.
  for (const pid of byPlayer.keys()) for (const unit of playerOps(battle, pid)) apply(unit);
  // Covers future operators too; the same key replaces the passive instead of stacking it on redeploy.
  battle.on('deploy', ({ unit }) => apply(unit));
}
