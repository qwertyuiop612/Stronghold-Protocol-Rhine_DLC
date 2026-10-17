// Collection bonuses are resolved from shared, trusted definitions. A single persistent buff contains the
// collection modifiers, so death, redeployment and re-installation never multiply the same bonuses.
import { getRelic, relicModifiers } from '../../../shared/relics.js';
import { passiveBuff, playerOps, onField, inRange } from './support/index.js';
import { RESIST_STATUSES } from '../buffs.js';

const KEY = 'relic:collection';
const healingHandInstalled = new WeakSet();
const fertilizerInstalled = new WeakSet();
const skillEndSpInstalled = new WeakSet();

function installSkillEndSp(battle, byPlayer) {
  const refunds = new Map();
  for (const [pid, ids] of byPlayer) {
    const amount = ids.reduce((sum, id) => sum + (getRelic(id).skillEndSp ?? 0), 0);
    if (amount > 0) refunds.set(pid, amount);
  }
  if (!refunds.size || skillEndSpInstalled.has(battle)) return;
  skillEndSpInstalled.add(battle);
  // PRTS No.139/140: forced SP recovery bypasses 阻回, retaining the runtime's charge/cost caps.
  // [ASSUMED] Only a living, deployed operator receives the refund; death/retreat is not a completed cast.
  battle.on('skillEnd', ({ unit: u, skill, reason }) => {
    const amount = refunds.get(u?.ownerId);
    if (!amount || u?.kind !== 'op' || !onField(u) || u.removed || reason === 'death') return;
    skill.gainSp(amount, 'relic', false, { ignoreLock: true });
  });
}

function installFertilizer(battle, owners) {
  if (!owners.size || fertilizerInstalled.has(battle)) return;
  fertilizerInstalled.add(battle);
  // One proc per completed attack action (including healing attacks), never per target or hit.
  // [ASSUMED] Follow the engine's attack event, after the attack resolves; direct skill damage is not an attack.
  battle.on('attack', ({ attacker: u }) => {
    if (u?.kind !== 'op' || !onField(u) || u.removed || !owners.has(u.ownerId)) return;
    battle.loseHp(u, Math.min(50, Math.max(0, u.hp - 1)), { tags: ['relic:125'] });
    if (!onField(u) || u.removed) return;
    const key = 'relic:125:barrier';
    const cap = u.s.maxHp * 1.4;
    const shield = Math.min(cap, (u.findBuff(key)?.shield ?? 0) + 100);
    battle.addBuff(u, { key, shield, duration: Infinity });
  });
}
// [ASSUMED] Use the engine's control-status catalogue plus stack-based palsy. Attribute debuffs,
// elemental buildup and HP loss are not abnormal statuses. PRTS 护愈之手 (No.172), adapted by maintainer:
// every MEDIC, no prerequisite relic; both benefits apply to the owner's operators inside a medic's range.
const HAND_ABNORMAL = new Set([...RESIST_STATUSES, 'palsy']);

function installHealingHand(battle, owners) {
  if (!owners.size || healingHandInstalled.has(battle)) return;
  healingHandInstalled.add(battle);
  const covered = (target) => target?.kind === 'op' && onField(target) && !target.removed && owners.has(target.ownerId)
    && battle.allyUnits.some((u) => u.kind === 'op' && u.ownerId === target.ownerId && u.def?.profession === 'MEDIC'
      && onField(u) && !u.removed && inRange(u, target));
  battle.on('beforeStatus', (ctx) => {
    if (HAND_ABNORMAL.has(ctx.status) && covered(ctx.target)) ctx.cancel = true;
  });
  // [ASSUMED] Existing control statuses are removed when entering coverage. Passive coverage survives
  // a medic's inability to act; range, death and redeployment are checked live, without lingering aura buffs.
  const cleanse = () => {
    for (const u of battle.allyUnits) {
      if (!covered(u)) continue;
      for (const buff of u.buffs.slice()) if (HAND_ABNORMAL.has(buff.status)) battle.removeStatus(u, buff.status);
    }
  };
  battle.on('tick', cleanse);
  battle.on('deploy', cleanse);
  battle.on('heal', ({ target, opts }) => {
    // Ordinary targeting is unchanged. Regeneration is not a healing action; blocked heals never reach this hook.
    if (!opts.regen && covered(target)) opts.overheal = true;
  });
}

export function install(battle) {
  const byPlayer = new Map();
  for (const ps of battle.players) {
    const input = ps.input?.relics;
    const ids = Array.isArray(input) ? [...new Set(input.filter((id) => typeof id === 'string' && getRelic(id)))] : [];
    if (ids.length) byPlayer.set(ps.playerId, ids);
  }
  if (!byPlayer.size) return;
  installHealingHand(battle, new Set([...byPlayer].filter(([, ids]) => ids.includes('relic_172')).map(([pid]) => pid)));
  installFertilizer(battle, new Set([...byPlayer].filter(([, ids]) => ids.includes('relic_125')).map(([pid]) => pid)));
  installSkillEndSp(battle, byPlayer);

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
