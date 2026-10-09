import { N_ } from './i18n.js';
// Match-scoped collectibles adapted from PRTS 沉沦者的黑流树海/拟造物质编目.
// Pure ESM: the match, browser UI and both battle simulators share the same definitions.
export const RELIC_SOURCE = 'https://prts.wiki/w/沉沦者的黑流树海/拟造物质编目'; // i18n-ignore: source URL
export const RELIC_CHOICE_SECONDS = 30;
export const RELIC_TIERS = Object.freeze([
  { tier: 1, name: N_('普通'), unlockRound: 1 },
  { tier: 2, name: N_('精良'), unlockRound: 1 },
  { tier: 3, name: N_('稀有'), unlockRound: 4 },
  { tier: 4, name: N_('史诗'), unlockRound: 7 },
  { tier: 5, name: N_('传说'), unlockRound: 7 },
].map((tier) => Object.freeze(tier)));

/**
 * @typedef {Object} RelicExtras
 * @property {string} [profession]
 * @property {string} [position]
 * @property {Readonly<{income: number}>} [economy]
 * @property {boolean} [reverseLpOnce]
 * @property {boolean} [hideNumbers]
 * @property {string} [previewDesc]
 * @property {number} [difficultyReduction]
 * @property {boolean} [multiplayerOnly]
 * @property {boolean} [redistributeEnemies]
 * @property {Readonly<{lp: number, operators: number}>} [reviveOnce]
 */
/**
 * @param {string} number
 * @param {string} name
 * @param {number} tier
 * @param {string} desc
 * @param {string} sourceEffect
 * @param {Record<string, number>} mods
 * @param {RelicExtras} [extra]
 */
const relic = (number, name, tier, desc, sourceEffect, mods, extra = {}) => Object.freeze({
  id: `relic_${number}`, number, name, tier, desc, sourceEffect, mods: Object.freeze(mods), ...extra,
});

// Tiers describe the adapted strength, rather than the original rarity. "All" means the owner's operators only.
export const RELICS = Object.freeze([
  relic('158', N_('时间机器'), 1, N_('接下来一场战斗中，持有者的目标生命值扣除改为等量增加；仅生效一场。'),
    N_('原创：下一场战斗目标生命值扣除变为增加。'), {}, { reverseLpOnce: true }),
  relic('003', N_('橙味风暴'), 1, N_('干员攻击力提高 8%。'), N_('携带名额 +1；四种形态攻击提高 1/3/5/7%。'), { atkPct: 0.08 }),
  relic('002', N_('凉拌海草'), 1, N_('干员攻击速度提高 10 点。'), N_('携带名额 +1；四种形态攻速增加 1/3/5/7。'), { aspd: 10 }),
  relic('001', N_('精选兽肉罐头'), 1, N_('干员每秒额外恢复 50 点生命值。'), N_('携带名额 +1；四种形态每秒回血 3/5/8/10。'), { hpRegen: 50 }),
  relic('047', N_('异铁小圆盾'), 1, N_('干员防御力提高 15%。'), N_('防御提高 15%。'), { defPct: 0.15 }),
  relic('038', N_('香草沙士汽水'), 1, N_('干员技力自然回复速度提高 0.1 点/秒。'), N_('自然技力回复每秒增加 0.2。'), { spRecoveryFlat: 0.1 }),
  relic('008', N_('神音海螺'), 1, N_('干员最大生命值提高 15%。'), N_('部署名额 +1；四种形态生命提高 4/5/6/8%。'), { hpPct: 0.15 }),
  relic('007', N_('地形图'), 1, N_('干员防御力提高 10%。'), N_('部署名额 +1；四种形态防御提高 4/5/6/8%。'), { defPct: 0.1 }),
  relic('009', N_('林间夜话'), 1, N_('干员防御力提高 12%。'), N_('部署名额 +2；四种形态防御提高 6/7/8/10%。'), { defPct: 0.12 }),
  relic('010', N_('教堂救济餐券'), 1, N_('干员最大生命值提高 20%。'), N_('部署名额 +2；四种形态生命提高 6/7/8/10%。'), { hpPct: 0.2 }),
  relic('103', N_('设计师量尺'), 1, N_('干员物理闪避率提高 10 个百分点。'), N_('物理闪避增加 15%。'), { dodgePhys: 0.1 }),

  relic('159', N_('木棍'), 2, N_('从下回合整备阶段起，每回合额外获得 2 金币；持有期间，你整个游戏界面的每个数字字符都会被替换成■，仅影响显示。'),
    N_('原创：每回合额外 2 金币，持有者界面数字遮蔽。'), {}, { economy: Object.freeze({ income: 2 }), hideNumbers: true,
      previewDesc: N_('从下回合整备阶段起，每回合额外获得 2 金币。') }),
  relic('004', N_('尖叫樱桃'), 2, N_('干员攻击力提高 15%。'), N_('携带名额 +2；四种形态攻击提高 2/4/6/8%。'), { atkPct: 0.15 }),
  relic('005', N_('咖啡平原咖啡糖'), 2, N_('干员攻击速度提高 25 点。'), N_('携带名额 +2；四种形态攻速增加 2/4/6/8。'), { aspd: 25 }),
  relic('041', N_('锈蚀刀片'), 2, N_('干员造成的物理伤害提高 10%。'), N_('敌人受到的物理伤害提高 15%。'), { physDealtMul: 1.1 }),
  relic('044', N_('制式防暴用具'), 2, N_('干员造成的法术伤害提高 10%。'), N_('敌人受到的法术伤害提高 20%。'), { artsDealtMul: 1.1 }),
  relic('070', N_('活玫瑰'), 2, N_('干员受到的治疗量和生命回复效果提高 10%。'), N_('治疗与生命回复效果提高 20%。'), { healingTakenMul: 1.1 }),
  relic('145', N_('折戟-锋刃'), 2, N_('近卫干员攻击力提高 25%。'), N_('近卫攻击提高 25%。'), { atkPct: 0.25 }, { profession: 'WARRIOR' }),
  relic('050', N_('皇帝的恩宠'), 2, N_('近战干员攻击力提高 20%。'), N_('近战攻击提高 15%。'), { atkPct: 0.2 }, { position: 'MELEE' }),
  relic('053', N_('显圣吊坠'), 2, N_('远程干员攻击力提高 20%。'), N_('远程攻击提高 15%。'), { atkPct: 0.2 }, { position: 'RANGED' }),
  relic('104', N_('“法术杀手”'), 2, N_('干员法术闪避率提高 15 个百分点。'), N_('法术闪避增加 15%。'), { dodgeArts: 0.15 }),
  relic('105', N_('舞者手链'), 2, N_('干员物理与法术闪避率各提高 12 个百分点。'), N_('物理、法术闪避各增加 10%。'), { dodgePhys: 0.12, dodgeArts: 0.12 }),

  relic('039', N_('羽兽肝酱'), 3, N_('干员技力自然回复速度提高 0.25 点/秒。'), N_('自然技力回复每秒增加 0.35。'), { spRecoveryFlat: 0.25 }),
  relic('048', N_('军团护心镜'), 3, N_('干员防御力提高 25%。'), N_('防御提高 25%。'), { defPct: 0.25 }),
  relic('078', N_('急救药箱'), 3, N_('干员最大生命值提高 35%。'), N_('生命提高 35%。'), { hpPct: 0.35 }),
  relic('143', N_('钝爪-屡战'), 3, N_('先锋干员攻击力与防御力各提高 20%。'), N_('先锋攻击、防御各提高 50%。'), { atkPct: 0.2, defPct: 0.2 }, { profession: 'PIONEER' }),
  relic('150', N_('残弩-神速'), 3, N_('狙击干员攻击速度提高 45 点。'), N_('狙击攻速增加 70。'), { aspd: 45 }, { profession: 'SNIPER' }),
  relic('153', N_('医者-自医'), 3, N_('医疗干员技力自然回复速度提高 0.35 点/秒。'), N_('医疗自然技力回复每秒增加 0.3。'), { spRecoveryFlat: 0.35 }, { profession: 'MEDIC' }),
  relic('025', N_('至宝指环'), 3, N_('从下回合整备阶段起，你每回合额外获得 1 点固定资金。'), N_('战斗源石锭收益提高 50%。'), {}, { economy: Object.freeze({ income: 1 }) }),
  relic('157', N_('鸭梨手机'), 3, N_('领取后，全队累计难度降低 2 级，最低为 0；从下一场战斗开始生效，多名玩家领取可叠加。'),
    N_('原创：全队累计难度降低 2 级。'), {}, { difficultyReduction: 2 }),
  relic('156', N_('解压玩具'), 3, N_('仅多人模式：普通作战中，持有者原本刷新的敌人数量减半（向下取整），减少的敌人均分给其他存活且未离场的玩家。每名持有者各有 10% 概率触发：随机选一名触发者承受所有敌人，未持有者各保留 1 个，其他持有者不刷敌人；触发时替代减半效果。首领波次不生效。'),
    N_('原创：普通作战敌人减半转移，10% 概率集中敌人。'), {}, { multiplayerOnly: true, redistributeEnemies: true }),

  relic('042', N_('赶车夫的长鞭'), 4, N_('干员造成的物理伤害提高 20%。'), N_('敌人受到的物理伤害提高 25%。'), { physDealtMul: 1.2 }),
  relic('045', N_('皇帝的收藏'), 4, N_('干员造成的法术伤害提高 20%。'), N_('敌人受到的法术伤害提高 30%。'), { artsDealtMul: 1.2 }),
  relic('049', N_('古旧的蒸汽甲胄'), 4, N_('干员防御力提高 40%。'), N_('防御提高 50%。'), { defPct: 0.4 }),
  relic('079', N_('未知仪器'), 4, N_('干员最大生命值提高 50%。'), N_('生命提高 50%。'), { hpPct: 0.5 }),
  relic('040', N_('迷梦香精'), 4, N_('干员技力自然回复速度提高 0.4 点/秒。'), N_('自然技力回复每秒增加 0.5。'), { spRecoveryFlat: 0.4 }),
  relic('148', N_('铁卫-整固'), 4, N_('重装干员最大生命值提高 40%、防御力提高 35%，法术抗性提高 8 点。'), N_('重装生命、防御各提高 40%，法抗增加 20。'), { hpPct: 0.4, defPct: 0.35, resFlat: 8 }, { profession: 'TANK' }),
  relic('233', N_('“时光之末”'), 4, N_('仅一次：死亡时自动复活自己，恢复 11 点目标生命值；也可在整备阶段点击收藏品列表的按钮复活一名已淘汰且未离场的队友。队友恢复 11 点目标生命值，保留原有干员，并获得 4 名不超过其商店等级、属于其累计层数最高盟约的随机干员。'),
    N_('仅一次，特定战斗失败时不结束探索，目标生命 +1。'), {}, { reviveOnce: Object.freeze({ lp: 11, operators: 4 }) }),
  relic('154', N_('金钟罩'), 4, N_('扣除干员所有防御力，每扣除完整的 50 点防御力增加 1 点法抗；同时持有铁布衫时，改为移除全部防御力和法抗，受到的法术伤害减少 90%。'), N_('原创：防御转法抗，与铁布衫组合改为法术减伤。'), { defToRes: 1 }),
  relic('155', N_('铁布衫'), 4, N_('扣除干员所有法抗，每扣除完整的 1 点法抗增加 50 点防御力；同时持有金钟罩时，改为移除全部防御力和法抗，受到的物理伤害减少 90%。'), N_('原创：法抗转防御，与金钟罩组合改为物理减伤。'), { resToDef: 1 }),

  relic('006', N_('皮特水果什锦'), 5, N_('干员攻击力、防御力和最大生命值各提高 20%。'), N_('携带名额 +3；四种形态攻击、防御、生命各提高 3/4/5/7%。'), { atkPct: 0.2, defPct: 0.2, hpPct: 0.2 }),
  relic('080', N_('演出用香水'), 5, N_('干员每秒额外恢复 50 点生命值，并恢复相当于自身最大生命值 2% 的生命。'), N_('每秒回血为最大生命的 1%。'), { hpRegen: 50, hpRegenRatio: 0.02 }),
  relic('043', N_('“复仇者”'), 5, N_('干员造成的物理伤害提高 30%。'), N_('敌人受到的物理伤害提高 35%。'), { physDealtMul: 1.3 }),
  relic('046', N_('“璀璨悲泣”'), 5, N_('干员造成的法术伤害提高 30%。'), N_('敌人受到的法术伤害提高 40%。'), { artsDealtMul: 1.3 }),
  relic('052', N_('老近卫军之锋'), 5, N_('近战干员攻击力提高 35%。'), N_('近战攻击提高 35%。'), { atkPct: 0.35 }, { position: 'MELEE' }),
  relic('055', N_('损坏的左轮弹巢'), 5, N_('远程干员攻击力提高 35%。'), N_('远程攻击提高 35%。'), { atkPct: 0.35 }, { position: 'RANGED' }),
]);

const BY_ID = new Map(RELICS.map((r) => [r.id, r]));
export const getRelic = (id) => BY_ID.get(id) ?? null;
const idsOf = (owned) => new Set((Array.isArray(owned) ? owned : []).map((r) => typeof r === 'string' ? r : r?.id));

/** 仅累计持有者适用的藏品，不设上限；百分比相加，伤害倍率相加增幅。 */
export function relicModifiers(owned, profession, position) {
  const sums = {};
  const ids = idsOf(owned);
  const paired = ids.has('relic_154') && ids.has('relic_155');
  for (const id of ids) {
    const r = getRelic(id);
    if (!r || (r.profession && r.profession !== profession) || (r.position && r.position !== position)) continue;
    const mods = paired && id === 'relic_154' ? { artsTakenMul: 0.1, defResClear: 1 }
      : paired && id === 'relic_155' ? { physTakenMul: 0.1 } : r.mods;
    for (const [key, value] of Object.entries(mods)) sums[key] = (sums[key] || 0) + (key.endsWith('Mul') ? value - 1 : value);
  }
  const out = {};
  for (const [key, value] of Object.entries(sums)) out[key] = key.endsWith('Mul') ? 1 + value : value;
  return out;
}

export function relicIncome(owned) {
  let income = 0;
  for (const id of idsOf(owned)) income += getRelic(id)?.economy?.income || 0;
  return income;
}

/** Base tier weights for the just-completed round, before removing exhausted tiers. */
export function dropWeights(round) {
  if (!Number.isInteger(round) || round < 1) return [0, 0, 0, 0, 0];
  if (round <= 3) return [80, 20, 0, 0, 0];
  if (round <= 6) return [60, 28, 12, 0, 0];
  if (round <= 9) return [50, 30, 15, 4, 1];
  if (round <= 12) return [20, 40, 25, 10, 5];
  return [10, 30, 35, 15, 10];
}

/** 逆风补给沿用独立配置的概率表；最高为传说。 */
export function comebackWeights(round) {
  if (!Number.isInteger(round) || round < 3) return dropWeights(round);
  if (round < 6) return [0, 0, 100, 0, 0];
  if (round < 9) return [0, 0, 65, 35, 0];
  if (round < 12) return [0, 0, 60, 30, 10];
  return [0, 0, 55, 30, 15];
}

export function pickRelic(round, owned, rng, { comeback = false, multiplayer = false } = {}) {
  const ids = idsOf(owned);
  const weights = comeback ? comebackWeights(round) : dropWeights(round);
  const pools = RELIC_TIERS.map(({ tier }) => RELICS.filter((r) => r.tier === tier && !ids.has(r.id) && (!r.multiplayerOnly || multiplayer)));
  const total = weights.reduce((sum, w, i) => sum + (pools[i].length ? w : 0), 0);
  if (!total) return null;
  let roll = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    const w = pools[i].length ? weights[i] : 0;
    roll -= w;
    if (w > 0 && roll < 0) return pools[i][Math.floor(rng() * pools[i].length)];
  }
  return null;
}

/** Three distinct, unowned candidates. A nearly exhausted eligible pool may offer fewer. */
export function pickRelicChoices(round, owned, rng, { comeback = false, multiplayer = false } = {}) {
  const excluded = [...idsOf(owned)];
  const choices = [];
  for (let i = 0; i < 3; i++) {
    const r = pickRelic(round, excluded, rng, { comeback, multiplayer }) || (comeback ? pickRelic(round, excluded, rng, { multiplayer }) : null);
    if (!r) break;
    choices.push(r.id);
    excluded.push(r.id);
  }
  return choices;
}
