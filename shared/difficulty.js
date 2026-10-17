import { t, N_ } from './i18n.js';
// Ascension is a cumulative ruleset, shared by the picker and both simulation runtimes.
// Parameters live beside each rule so the mechanics and their descriptions have one source of truth.
export const MAX_DIFFICULTY_LEVEL = 20;
export const normalizeDifficultyLevel = (level) => Number.isInteger(level) ? Math.max(0, Math.min(MAX_DIFFICULTY_LEVEL, level)) : 0;
const rule = (level, key, name, params, describe, counter, detail = null) => Object.freeze({ level, key, name,
  params: Object.freeze(params), get description() { return describe(params); }, counter, detail });
export const DIFFICULTY_RULES = Object.freeze([
  rule(1, 'openingRush', N_('先锋急行'), { duration: 5, speed: 1.5 },
    p => t('所有非领袖单位登场后{duration}秒内移动速度+{percent}%，被阻挡时失去该效果', { duration: p.duration, percent: Math.round((p.speed - 1) * 100) }), N_('用前排阻挡截停冲锋。')),
  rule(2, 'embers', N_('死亡余烬'), { duration: 5, radius: 1.1, damage: 0.15 },
    p => t('所有普通敌人倒下后留下持续{duration}秒的余烬，每秒对周围{radius}格内的我方单位造成{percent}%基础攻击力的法术伤害', { duration: p.duration, radius: p.radius, percent: p.damage * 100 }), N_('让敌人倒在防线外，避免近战扎堆。')),
  rule(3, 'escort', N_('结伴护卫'), { radius: 1.2, taken: 0.8 },
    p => t('所有敌人周围{radius}格内存在其他敌人时，受到的物理、法术与真实伤害-{percent}%', { radius: p.radius, percent: Math.round((1 - p.taken) * 100) }), N_('优先集火，拆散护卫群。')),
  rule(4, 'healerHunt', N_('猎医本能'), { duration: 4, taunt: 4 },
    p => t('所有我方干员治疗其他单位后，{duration}秒内更容易成为敌方远程攻击目标', { duration: p.duration }), N_('保护医疗，利用掩护与嘲讽。')),
  rule(5, 'firstHitImmune', N_('首击屏障'), {},
    () => t('所有敌人登场时获得1层可抵挡一次伤害的屏障'), N_('用快攻或持续伤害先破盾。'), N_('仅抵挡实际伤害，元素损伤累积不消耗该屏障')),
  rule(6, 'longshot', N_('远射偏折'), { distance: 3, taken: 0.7 },
    p => t('所有敌人受到来自{distance}格以外的物理与法术伤害-{percent}%', { distance: p.distance, percent: Math.round((1 - p.taken) * 100) }), N_('将输出前移，或补充真实、元素伤害。'), N_('真实伤害与元素伤害不受影响')),
  rule(7, 'silencingHit', N_('噤声突袭'), { duration: 2 },
    p => t('所有敌人首次普通攻击造成伤害时，使目标干员沉默{duration}秒', { duration: p.duration }), N_('用召唤物、护盾接下首击。')),
  rule(8, 'breakControl', N_('破困本能'), {},
    () => t('所有敌人生命值首次降至50%以下时，立即清除自身所有控制状态'), N_('先压低血线，再接续关键控制。')),
  rule(9, 'lastGift', N_('临终馈赠'), { radius: 1.5, duration: 4 },
    p => t('所有普通敌人倒下时，使周围{radius}格内的其他敌人获得1层持续{duration}秒的护盾', { radius: p.radius, duration: p.duration }), N_('先处理威胁目标，再清理杂兵。'), N_('该护盾可抵挡一次伤害，不可叠加')),
  rule(10, 'rotatingArmor', N_('甲壳轮转'), { period: 12, taken: 0.9 },
    p => t('所有敌人受到的物理或法术伤害-{percent}%，减伤类型每{period}秒轮转一次（初始为物理减伤）', { percent: Math.round((1 - p.taken) * 100), period: p.period }), N_('搭配物理与法术输出，真实伤害可穿透。')),
  rule(11, 'spStorm', N_('静默脉冲'), { period: 12, duration: 3 },
    p => t('每{period}秒释放一次全场脉冲，使所有在场干员在{duration}秒内无法回复技力', { period: p.period, duration: p.duration }), N_('利用脉冲间隙蓄能，配置初始技力。'), N_('已就绪的技能仍可正常释放')),
  rule(12, 'charge', N_('冲线号令'), { period: 15, duration: 2, speed: 1.8 },
    p => t('每{period}秒使所有未被阻挡的非领袖单位移动速度+{percent}%，持续{duration}秒（被阻挡时立即解除）', { period: p.period, percent: Math.round((p.speed - 1) * 100), duration: p.duration }), N_('保留后排阻挡，防止漏怪。')),
  rule(13, 'revenge', N_('复仇传染'), { radius: 2, duration: 4, aspd: 50 },
    p => t('敌人击倒我方干员时，自身与周围{radius}格内的敌人攻击速度+{aspd}，持续{duration}秒（不可叠加）', { radius: p.radius, aspd: p.aspd, duration: p.duration }), N_('维持坦克生存，避免防线连锁崩溃。')),
  rule(14, 'echo', N_('双生回响'), { every: 4, hp: 0.35 },
    p => t('每第{every}名登场的普通敌人倒下后，在原地生成1个具有{percent}%最大生命值的【回响】继续前进', { every: p.every, percent: p.hp * 100 }), N_('为第二轮拦截预留输出。'), N_('【回响】继承原单位基础属性，沿剩余路线前进；倒下后不再分裂且不提供悬赏奖励')),
  rule(15, 'skillFatigue', N_('过载余波'), { duration: 10, reduction: 0.08, lateReduction: 0.15, afterRound: 10, maxStacks: 2 },
    p => t('所有我方干员技能结束后的{duration}秒内攻击力降低{percent}%（第{round}回合后改为{latePercent}%），最多叠加{stacks}层', { duration: p.duration, percent: p.reduction * 100, round: p.afterRound, latePercent: p.lateReduction * 100, stacks: p.maxStacks }), N_('错开技能周期，避免全队同时空档。'), N_('重复触发时刷新持续时间，叠层按加算结算')),
  rule(16, 'bombard', N_('定点轰击'), { every: 3, delay: 1, radius: 0.75, damage: 0.5 },
    p => t('所有敌人每第{every}次普通攻击会锁定主目标当前位置，{delay}秒后对该位置周围{radius}格内的我方单位造成{percent}%基础攻击力的法术伤害', { every: p.every, delay: p.delay, radius: p.radius, percent: p.damage * 100 }), N_('分散站位，用召唤物吸引落点。')),
  rule(17, 'eliteResolve', N_('精英韧性'), {},
    () => t('所有精英和领袖单位免疫首次受到的控制效果'), N_('用短控制试探，再投入长控制。')),
  rule(18, 'skillDebt', N_('燃命施法'), { duration: 3 },
    p => t('所有我方干员开启技能后的{duration}秒内无法恢复生命值', { duration: p.duration }), N_('开技能前稳住血线，搭配护盾保护。'), N_('期间仍可正常获得护盾')),
  rule(19, 'goalStealth', N_('潜行冲线'), { distance: 2 },
    p => t('所有普通地面敌人距离目标点不足{distance}格时获得【隐匿】', { distance: p.distance }), N_('在目标点前保留近战阻挡。'), N_('对不可被阻挡的敌人不生效；被我方单位阻挡时【隐匿】效果解除')),
  rule(20, 'debuffDecay', N_('终极协同'), { reduction: 0.35 },
    p => t('所有敌方单位每受到一次伤害后，自身负面效果的剩余持续时间减少{percent}%', { percent: p.reduction * 100 }), N_('减少低伤多段攻击，及时补充控制与削弱。'), N_('每次实际伤害分别结算；永久负面效果不受影响')),
]);

export function difficultyEffects(level = 0) {
  const n = normalizeDifficultyLevel(level);
  return { level: n, ...Object.fromEntries(DIFFICULTY_RULES.map(r => [r.key, n >= r.level])) };
}
