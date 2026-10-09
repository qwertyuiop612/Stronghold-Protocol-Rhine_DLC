import { getRelic } from '../../shared/relics.js';
import { routeByMotion, gateOf } from './waves.js';
import { createRng, deriveSeed } from '../sim/rng.js';

const ownsToy = (ps) => ps.relics.some((r) => getRelic(typeof r === 'string' ? r : r.id)?.redistributeEnemies);

/** 按原时间拆分并迁移一名敌人，保留属性与悬赏，改为接收玩家的路线和归属。 */
function moveSpawn(out, plan, target, s, i) {
  const transfer = target !== plan;
  const route = s.route || plan.routes[s.routeIndex ?? 0];
  const routeIndex = transfer && plan.routes !== target.routes ? routeByMotion(target.routes, route?.motion === 'FLY') : s.routeIndex;
  out.get(target.ps.playerId).push({
    ...s, count: 1, interval: 0, time: Math.max(0, Number(s.time) || 0) + i * Math.max(0, Number(s.interval) || 0),
    ownerPlayerId: target.ps.playerId, routeIndex,
    ...(transfer ? { route: undefined, pos: undefined } : {}),
    mods: s.mods ? { ...s.mods } : undefined,
    preview: s.preview ? { ...s.preview, ...(transfer ? { start: target.routes[routeIndex ?? 0]?.start, gate: gateOf(target.routes[routeIndex ?? 0]?.start, false) } : {}) } : undefined,
  });
}

/** 同时读取所有玩家原始波次；转移所得敌人不再次减半，整数余数按座位轮流分配。 */
export function redistributeRelicWaves(plans, { solo = false, round = 1, seed = 1, rng = null } = {}) {
  const out = new Map(plans.map(({ ps, spawns }) => [ps.playerId, []]));
  const participants = plans.filter(({ ps }) => ps.alive && !ps.left);
  const holders = participants.filter(({ ps }) => ownsToy(ps));
  // 持有者各自独立判定，重复预览不消耗对局其他随机流。多人触发时只选一个承受者。
  const triggered = !solo && participants.length > 1 ? holders.filter(({ ps }) =>
    (rng || createRng(deriveSeed(seed, `relic-wave-overload:${round}:${ps.seat}`)))() < 0.1) : [];
  if (triggered.length) {
    const choose = rng || createRng(deriveSeed(seed, `relic-wave-overload-winner:${round}`));
    const winner = triggered[Math.floor(choose() * triggered.length)];
    for (const plan of participants) {
      const reserve = !ownsToy(plan.ps);
      let index = 0;
      for (const s of plan.spawns) {
        const count = Math.max(1, Math.trunc(Number(s.count) || 1));
        for (let i = 0; i < count; i++, index++) moveSpawn(out, plan, reserve && index === 0 ? plan : winner, s, i);
      }
    }
    return out;
  }
  for (const plan of plans) {
    const { ps, spawns } = plan;
    const recipients = plans.filter((p) => p.ps !== ps && p.ps.alive && !p.ps.left);
    const active = !solo && ps.alive && !ps.left && recipients.length
      && ownsToy(ps);
    if (!active) { out.get(ps.playerId).push(...spawns); continue; }
    let index = 0, moved = 0;
    const offset = ((round - 1 + ps.seat) % recipients.length + recipients.length) % recipients.length;
    for (const s of spawns) {
      const count = Math.max(1, Math.trunc(Number(s.count) || 1));
      for (let i = 0; i < count; i++, index++) {
        // 交替保留与转移，避免只保留波次前半段；奇数时额外一个也转移。
        const target = index % 2 === 1 ? plan : recipients[(offset + moved++) % recipients.length];
        moveSpawn(out, plan, target, s, i);
      }
    }
  }
  return out;
}
