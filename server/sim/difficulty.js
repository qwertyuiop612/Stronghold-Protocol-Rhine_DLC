// Custom ascension rules. Uses the same hooks, buffs and game clock in server and browser battles.
import { DIFFICULTY_RULES } from '../../shared/difficulty.js';
import { RESIST_STATUSES } from './buffs.js';

const P = Object.fromEntries(DIFFICULTY_RULES.map(r => [r.key, r.params]));
const leader = e => e.isBoss || e.bossPool || e.def.rank === 'BOSS';
const ordinary = e => e.side === 'enemy' && !e.isBoss && !e.bossPool && e.def.rank === 'NORMAL' && e.tag !== 'part';
const op = u => u?.side === 'ally' && u.kind === 'op';
const liveEnemy = e => e.alive && e.deployed && !e.hidden && e.hp > 0;
const fx = (b, kind, u, extra = {}) => b.fx(kind, { x: u.x, y: u.y, id: u.id, ...extra });
const buff = (b, u, key, mods, duration, flags) => b.addBuff(u, { key: `asc:${key}`, mods, flags, duration, visible: true });

/** Rules run before normal shield absorption, after mitigation/dodge. Zero and element-gauge hits never spend wards. */
export function guardDifficultyDamage(b, source, target, amount, dmg) {
  const rules = b.difficulty;
  if (target.side !== 'enemy' || !(amount > 0) || !rules?.level) return amount;
  let first = false;
  if (rules.firstHitImmune && !target.difficultyFirstHitUsed) {
    target.difficultyFirstHitUsed = true;
    b.removeBuff(target, 'asc:first');
    fx(b, 'shieldBreak', target);
    first = true;
  }
  const relay = target.difficultyRelay;
  if (relay && b.time < relay.until) {
    // A summon and its operator are one participant. Unowned/environmental damage cannot unlock a relay.
    let owner = source;
    for (let i = 0; owner?.ownerUnit && i < 16; i++) owner = owner.ownerUnit;
    const id = op(owner) ? owner.id : null;
    if (id != null && relay.sourceId == null) relay.sourceId = id;
    else if (id != null && relay.sourceId !== id) {
      target.difficultyRelay = null;
      b.removeBuff(target, 'asc:relay');
      fx(b, 'shieldBreak', target);
    }
    if (target.difficultyRelay) return 0;
  }
  if (first) return 0;
  if (rules.escort && ['phys', 'arts', 'true'].includes(dmg.type)
      && b.enemiesInRadius(target.x, target.y, P.escort.radius, true).some(e => e !== target && liveEnemy(e))) amount *= P.escort.taken;
  if (rules.longshot && source?.side === 'ally' && !dmg.sourceless && ['phys', 'arts'].includes(dmg.type)
      && Math.hypot(source.x - target.x, source.y - target.y) > P.longshot.distance) amount *= P.longshot.taken;
  return amount;
}

export function installDifficulty(b) {
  const rules = b.difficulty;
  if (!rules.level) return;
  let normalSpawns = 0;
  const armor = e => {
    const physical = Math.floor((b.time + 1e-9) / P.rotatingArmor.period) % 2 === 0;
    buff(b, e, 'armor', physical ? { physTakenMul: P.rotatingArmor.taken } : { artsTakenMul: P.rotatingArmor.taken });
    fx(b, physical ? 'ascPhysicalArmor' : 'ascArtsArmor', e);
  };
  b.on('enemySpawn', ({ enemy: e }) => {
    if (rules.openingRush && !leader(e)) buff(b, e, 'rush', { moveMul: P.openingRush.speed }, P.openingRush.duration);
    if (rules.firstHitImmune) buff(b, e, 'first', null, Infinity, { ascensionShield: true });
    if (rules.rotatingArmor) armor(e);
    if (rules.echo && ordinary(e) && e.tag !== 'asc_echo') e.difficultyHasEcho = ++normalSpawns % P.echo.every === 0;
  });
  b.on('blocked', ({ enemy: e }) => {
    b.removeBuff(e, 'asc:rush');
    b.removeBuff(e, 'asc:charge');
  });
  if (rules.healerHunt) b.on('heal', ({ source, target, amount }) => {
    if (op(source) && source !== target && amount > 0 && target.hp < target.s.maxHp) {
      buff(b, source, 'healer', { taunt: P.healerHunt.taunt }, P.healerHunt.duration);
      fx(b, 'mark', source);
    }
  });
  if (rules.silencingHit || rules.breakControl) b.on('damaged', ({ source, target, amount, type, dmg }) => {
    if (!(amount > 0) || type === 'element' || !(target.hp > 0)) return;
    if (rules.silencingHit && source?.side === 'enemy' && dmg?.isAttack && !source.difficultySilenced) {
      source.difficultySilenced = true;
      if (op(target)) b.applyStatus(target, 'silence', { source, duration: P.silencingHit.duration });
    }
    if (rules.breakControl && target.side === 'enemy' && !target.difficultyCleansed && target.hp <= target.s.maxHp / 2) {
      target.difficultyCleansed = true;
      // Catalogue control effects only; do not erase debuffs, elemental bursts or the enemy's own passives.
      for (const effect of target.buffs.slice()) if (RESIST_STATUSES.has(effect.status ?? effect.key) || effect.key === 'palsy') b.removeBuff(target, effect);
      fx(b, 'cleanse', target);
    }
  });
  if (rules.eliteResolve) b.on('beforeStatus', ctx => {
    const e = ctx.target;
    if (!ctx.cancel && e.side === 'enemy' && (e.isBoss || ['ELITE', 'BOSS'].includes(e.def.rank))
        && !e.difficultyResisted && (RESIST_STATUSES.has(ctx.status) || ctx.status === 'palsy')) {
      e.difficultyResisted = true;
      ctx.cancel = true;
      fx(b, 'shieldBreak', e);
    }
  }, { priority: -100 });
  if (rules.embers || rules.lastGift || rules.echo || rules.revenge) b.on('death', ({ unit: u, reason, killer }) => {
    if (reason !== 'killed') return;
    if (ordinary(u)) {
      if (rules.embers && u.base.atk > 0) {
        const { x, y } = u;
        b.fx('ascEmbers', { x, y, r: P.embers.radius, dur: P.embers.duration });
        for (let i = 1; i <= P.embers.duration; i++) b.after(i, () => {
          for (const a of b.alliesInRadius(x, y, P.embers.radius)) b.dealDamage(u, a,
            { type: 'arts', amount: u.base.atk * P.embers.damage, canDodge: false, tags: ['asc:embers'] });
        });
      }
      if (rules.lastGift) for (const e of b.enemiesInRadius(u.x, u.y, P.lastGift.radius, true)) if (liveEnemy(e)) {
        b.addBuff(e, { key: 'asc:gift', shieldHits: 1, duration: P.lastGift.duration, visible: true });
        fx(b, 'shield', e);
      }
      if (rules.echo && u.difficultyHasEcho && u.tag !== 'asc_echo') {
        const e = b.spawnEnemy(u.defId, { def: u.def, pos: [u.y, u.x], tag: 'asc_echo', countInTotal: true,
          ownerPlayerId: u.ownerId, sourcePlayerId: u.sourcePlayerId,
          mods: { ...(u.mods || {}), hpMul: u.base.maxHp / u.def.maxHp * P.echo.hp } });
        if (e) {
          // Keep the remaining compiled legs (teleports / waits included), recomputing paths from the death position.
          e.route.legs = u.route.legs.slice(u.route.legIdx).map(leg => ({ ...leg }));
          fx(b, 'revive', e);
        }
      }
    }
    if (rules.revenge && op(u) && killer?.side === 'enemy') for (const e of b.enemiesInRadius(killer.x, killer.y, P.revenge.radius, true)) if (liveEnemy(e)) {
      buff(b, e, 'revenge', { aspd: P.revenge.aspd }, P.revenge.duration);
      fx(b, 'buff', e);
    }
  });
  if (rules.rotatingArmor) b.every(P.rotatingArmor.period, () => { for (const e of b.aliveEnemies()) armor(e); });
  if (rules.spStorm) b.every(P.spStorm.period, () => {
    for (const a of b.allies()) if (op(a)) {
      buff(b, a, 'storm', null, P.spStorm.duration, { noSp: true });
      fx(b, 'ascSpStorm', a, { dur: P.spStorm.duration });
    }
  });
  if (rules.charge) b.every(P.charge.period, () => {
    for (const e of b.aliveEnemies()) if (!leader(e) && !e.blockedBy) {
      buff(b, e, 'charge', { moveMul: P.charge.speed }, P.charge.duration);
      fx(b, 'buff', e);
    }
  });
  if (rules.skillFatigue) b.on('skillEnd', ({ unit: u, reason }) => {
    if (op(u) && u.alive && reason !== 'death') buff(b, u, 'fatigue', null, P.skillFatigue.duration, { noSp: true });
  });
  if (rules.skillDebt) b.on('skillStart', ({ unit: u }) => {
    if (op(u)) buff(b, u, 'debt', { healingTakenMul: 0 }, P.skillDebt.duration);
  });
  if (rules.bombard) b.on('attack', ({ attacker: e, targets }) => {
    if (e.side !== 'enemy' || e.def.dmgType === 'heal' || !targets[0]) return;
    e.difficultyShots = (e.difficultyShots ?? 0) + 1;
    if (e.difficultyShots % P.bombard.every) return;
    const { x, y } = targets[0], amount = e.base.atk * P.bombard.damage;
    b.fx('ascBombMark', { x, y, r: P.bombard.radius, dur: P.bombard.delay });
    b.after(P.bombard.delay, () => {
      b.fx('explosion', { x, y, r: P.bombard.radius });
      for (const a of b.alliesInRadius(x, y, P.bombard.radius)) b.dealDamage(e, a,
        { type: 'arts', amount, canDodge: false, tags: ['asc:bombard'] });
    });
  });
  if (rules.goalStealth) b.every(0.25, () => {
    for (const e of b.aliveEnemies()) if (ordinary(e) && e.motion !== 'FLY' && !e.hidden
        && b.remainingDistance(e) < P.goalStealth.distance) {
      if (!e.findBuff('asc:goal')) buff(b, e, 'goal', null, Infinity, { stealth: true });
    }
  });
  if (rules.relay) b.every(P.relay.period, () => {
    for (const e of b.aliveEnemies()) {
      const relay = { sourceId: null, until: b.time + P.relay.duration };
      e.difficultyRelay = relay;
      b.addBuff(e, { key: 'asc:relay', duration: P.relay.duration, flags: { ascensionShield: true }, visible: true,
        onExpire: () => { if (e.difficultyRelay === relay) e.difficultyRelay = null; } });
      fx(b, 'ascRelay', e);
    }
  });
}
