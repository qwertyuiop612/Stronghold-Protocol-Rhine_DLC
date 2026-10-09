import { t, N_ } from './i18n.js';
// Ascension is a cumulative ruleset, shared by the picker and both simulation runtimes.
// Parameters live beside each rule so the mechanics and their descriptions have one source of truth.
export const MAX_DIFFICULTY_LEVEL = 20;
export const normalizeDifficultyLevel = (level) => Number.isInteger(level) ? Math.max(0, Math.min(MAX_DIFFICULTY_LEVEL, level)) : 0;
const rule = (level, key, name, params, describe, counter) => Object.freeze({ level, key, name,
  params: Object.freeze(params), description: describe(params), counter });
export const DIFFICULTY_RULES = Object.freeze([
  rule(1, 'openingRush', N_('先锋急行'), { duration: 5, speed: 1.5 },
    p => t('非领袖敌人登场后的 {duration} 秒内以 {speed} 倍速度移动，首次被阻挡即结束。', { duration: p.duration, speed: p.speed }), N_('用前排阻挡截停冲锋。')),
  rule(2, 'embers', N_('死亡余烬'), { duration: 3, radius: 0.75, damage: 0.25 },
    p => t('普通敌人死亡后留下 {duration} 秒余烬，每秒对 {radius} 格内我方造成其基础攻击 {2}% 的法术伤害。', { duration: p.duration, radius: p.radius, 2: p.damage * 100 }), N_('让敌人倒在防线外，避免近战扎堆。')),
  rule(3, 'escort', N_('结伴护卫'), { radius: 1.2, taken: 0.8 },
    p => t('敌人 {radius} 格内有其他敌人时，物理、法术和真实伤害减少 {1}%。', { radius: p.radius, 1: Math.round((1 - p.taken) * 100) }), N_('优先集火，拆散护卫群。')),
  rule(4, 'healerHunt', N_('猎医本能'), { duration: 4, taunt: 4 },
    p => t('干员为其他单位恢复生命后，{duration} 秒内更容易成为敌方远程攻击目标。', { duration: p.duration }), N_('保护医疗，利用掩护与嘲讽。')),
  rule(5, 'firstHitImmune', N_('首击屏障'), {},
    () => t('每名敌人免疫首次实际受到的伤害；元素损伤累积不消耗屏障。'), N_('用快攻或持续伤害先破盾。')),
  rule(6, 'longshot', N_('远射偏折'), { distance: 3, taken: 0.7 },
    p => t('来自 {distance} 格以外的物理、法术伤害减少 {1}%；真实与元素伤害不受影响。', { distance: p.distance, 1: Math.round((1 - p.taken) * 100) }), N_('将输出前移，或补充真实、元素伤害。')),
  rule(7, 'silencingHit', N_('噤声突袭'), { duration: 2 },
    p => t('每名敌人首次普通攻击造成伤害时，使被命中的干员沉默 {duration} 秒。', { duration: p.duration }), N_('用召唤物、护盾接下首击。')),
  rule(8, 'breakControl', N_('破困本能'), {},
    () => t('敌人生命首次降至一半时，立即清除自身控制状态；每名敌人只触发一次。'), N_('先压低血线，再接续关键控制。')),
  rule(9, 'lastGift', N_('临终馈赠'), { radius: 1.5, duration: 4 },
    p => t('普通敌人死亡时，为 {radius} 格内其他敌人提供一层持续 {duration} 秒的单次伤害护盾，不叠层。', { radius: p.radius, duration: p.duration }), N_('先处理威胁目标，再清理杂兵。')),
  rule(10, 'rotatingArmor', N_('甲壳轮转'), { period: 4, taken: 0.9 },
    p => t('敌方护甲每 {period} 秒在物理与法术之间轮转，当前类型伤害减少 {1}%；从物理护甲开始。', { period: p.period, 1: Math.round((1 - p.taken) * 100) }), N_('搭配物理与法术输出，真实伤害可穿透。')),
  rule(11, 'spStorm', N_('静默脉冲'), { period: 12, duration: 3 },
    p => t('每 {period} 秒触发一次脉冲，在场干员 {duration} 秒内无法获得技力，已就绪技能仍可释放。', { period: p.period, duration: p.duration }), N_('利用脉冲间隙蓄能，配置初始技力。')),
  rule(12, 'charge', N_('冲线号令'), { period: 15, duration: 2, speed: 1.8 },
    p => t('每 {period} 秒，在场未被阻挡的非领袖敌人获得 {duration} 秒、{speed} 倍移速的冲锋；阻挡可立即截停。', { period: p.period, duration: p.duration, speed: p.speed }), N_('保留后排阻挡，防止漏怪。')),
  rule(13, 'revenge', N_('复仇传染'), { radius: 2, duration: 4, aspd: 50 },
    p => t('敌人击倒干员时，令自身与 {radius} 格内敌人进入 {duration} 秒狂热（攻击速度 +{aspd}），不叠加。', { radius: p.radius, duration: p.duration, aspd: p.aspd }), N_('维持坦克生存，避免防线连锁崩溃。')),
  rule(14, 'echo', N_('双生回响'), { every: 4, hp: 0.35 },
    p => t('每第 {every} 名登场的普通敌人死亡后生成一个保留 {1}% 基础生命的回响，沿剩余路线前进；不再分裂、不带悬赏。', { every: p.every, 1: p.hp * 100 }), N_('为第二轮拦截预留输出。')),
  rule(15, 'skillFatigue', N_('过载余波'), { duration: 2 },
    p => t('干员技能结束后进入 {duration} 秒过载期，期间无法获得技力。', { duration: p.duration }), N_('错开技能周期，避免全队同时空档。')),
  rule(16, 'bombard', N_('定点轰击'), { every: 3, delay: 1, radius: 0.75, damage: 0.5 },
    p => t('敌人每第 {every} 次普通攻击会标记首个目标的位置，{delay} 秒后对 {radius} 格内我方追加基础攻击 {3}% 的法术轰击。', { every: p.every, delay: p.delay, radius: p.radius, 3: p.damage * 100 }), N_('分散站位，用召唤物吸引落点。')),
  rule(17, 'eliteResolve', N_('精英韧性'), {},
    () => t('每名精英与领袖免疫首次可生效的控制状态，此后控制正常生效。'), N_('用短控制试探，再投入长控制。')),
  rule(18, 'skillDebt', N_('燃命施法'), { duration: 3 },
    p => t('干员释放技能后的 {duration} 秒内无法恢复生命，护盾仍可获得。', { duration: p.duration }), N_('开技能前稳住血线，搭配护盾保护。')),
  rule(19, 'goalStealth', N_('潜行冲线'), { distance: 2 },
    p => t('普通地面敌人剩余路线不足 {distance} 格时进入隐匿；被阻挡时可被正常攻击。', { distance: p.distance }), N_('在目标点前保留近战阻挡。')),
  rule(20, 'relay', N_('终极协同'), { period: 20, duration: 6 },
    p => t('每 {period} 秒，在场敌人获得 {duration} 秒接力屏障：首位伤害来源登记后免伤，由另一名干员命中解除；召唤物按所属干员计。', { period: p.period, duration: p.duration }), N_('让两名干员覆盖同一目标，接力破盾。')),
]);

export function difficultyEffects(level = 0) {
  const n = normalizeDifficultyLevel(level);
  return { level: n, ...Object.fromEntries(DIFFICULTY_RULES.map(r => [r.key, n >= r.level])) };
}
