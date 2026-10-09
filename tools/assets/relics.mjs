// Original collectible art linked by https://prts.wiki/w/沉沦者的黑流树海/拟造物质编目.
// 原作映射核对于 2026-10-03；运行图片在忽略目录，原创原稿随源码保存。
import { readFile, mkdir, copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isCompletePng } from './formats.mjs';

export const CUSTOM_RELIC_ICON_FILES = Object.freeze({
  relic_154: 'relic_154.png',
  relic_155: 'relic_155.png',
  relic_156: 'relic_156.png',
  relic_157: 'relic_157.png',
  relic_158: 'relic_158.png',
  relic_159: 'relic_159.png',
});

/** 原创原稿随源码保存；离线及强制重建都从原稿恢复运行副本。 */
export async function prepareCustomRelicIcons(assetsRoot) {
  const source = fileURLToPath(new URL('./custom-relics/', import.meta.url));
  await mkdir(join(assetsRoot, 'relics'), { recursive: true });
  for (const [id, file] of Object.entries(CUSTOM_RELIC_ICON_FILES)) {
    const path = join(source, file);
    if (!isCompletePng(await readFile(path))) throw new Error(`原创收藏品 PNG 损坏：${file}`);
    await copyFile(path, join(assetsRoot, 'relics', `${id}.png`));
  }
}

export const RELIC_ICON_FILES = Object.freeze({
  "relic_233": "rogue_6_relic_legacy_94.png", // “时光之末”，No.233，核对于 2026-10-05
  "relic_003": "rogue_6_relic_legacy_24.png", // 橙味风暴
  "relic_002": "rogue_6_relic_legacy_23.png", // 凉拌海草
  "relic_001": "rogue_6_relic_legacy_22.png", // 精选兽肉罐头
  "relic_047": "rogue_6_relic_legacy_12.png", // 异铁小圆盾
  "relic_038": "rogue_6_relic_legacy_2.png", // 香草沙士汽水
  "relic_008": "rogue_6_relic_legacy_29.png", // 神音海螺
  "relic_007": "rogue_6_relic_legacy_28.png", // 地形图
  "relic_009": "rogue_6_relic_legacy_30.png", // 林间夜话
  "relic_010": "rogue_6_relic_legacy_31.png", // 教堂救济餐券
  "relic_103": "rogue_6_relic_legacy_128.png", // 设计师量尺
  "relic_004": "rogue_6_relic_legacy_25.png", // 尖叫樱桃
  "relic_005": "rogue_6_relic_legacy_26.png", // 咖啡平原咖啡糖
  "relic_041": "rogue_6_relic_legacy_5.png", // 锈蚀刀片
  "relic_044": "rogue_6_relic_legacy_8.png", // 制式防暴用具
  "relic_070": "rogue_6_relic_legacy_81.png", // 活玫瑰
  "relic_145": "rogue_6_relic_legacy_66.png", // 折戟-锋刃
  "relic_050": "rogue_6_relic_legacy_15.png", // 皇帝的恩宠
  "relic_053": "rogue_6_relic_legacy_18.png", // 显圣吊坠
  "relic_104": "rogue_6_relic_legacy_129.png", // “法术杀手”
  "relic_105": "rogue_6_relic_legacy_130.png", // 舞者手链
  "relic_039": "rogue_6_relic_legacy_3.png", // 羽兽肝酱
  "relic_048": "rogue_6_relic_legacy_13.png", // 军团护心镜
  "relic_078": "rogue_6_relic_legacy_89.png", // 急救药箱
  "relic_143": "rogue_6_relic_legacy_64.png", // 钝爪-屡战
  "relic_150": "rogue_6_relic_legacy_71.png", // 残弩-神速
  "relic_153": "rogue_6_relic_legacy_74.png", // 医者-自医
  "relic_025": "rogue_6_relic_legacy_59.png", // 至宝指环
  "relic_042": "rogue_6_relic_legacy_6.png", // 赶车夫的长鞭
  "relic_045": "rogue_6_relic_legacy_9.png", // 皇帝的收藏
  "relic_049": "rogue_6_relic_legacy_14.png", // 古旧的蒸汽甲胄
  "relic_079": "rogue_6_relic_legacy_90.png", // 未知仪器
  "relic_040": "rogue_6_relic_legacy_4.png", // 迷梦香精
  "relic_148": "rogue_6_relic_legacy_69.png", // 铁卫-整固
  "relic_006": "rogue_6_relic_legacy_27.png", // 皮特水果什锦
  "relic_080": "rogue_6_relic_legacy_91.png", // 演出用香水
  "relic_043": "rogue_6_relic_legacy_7.png", // “复仇者”
  "relic_046": "rogue_6_relic_legacy_10.png", // “璀璨悲泣”
  "relic_052": "rogue_6_relic_legacy_17.png", // 老近卫军之锋
  "relic_055": "rogue_6_relic_legacy_20.png", // 损坏的左轮弹巢
});

export function relicIconTemplate() {
  return Object.fromEntries([...Object.entries(RELIC_ICON_FILES).map(([id, file]) => [id, { alts: [{
    rel: `relics/${id}.png`, kind: 'png',
    urls: [`https://torappu.prts.wiki/assets/roguelike_topic_itempic/${file}`],
  }] }]), ...Object.keys(CUSTOM_RELIC_ICON_FILES).map((id) => [id, { alts: [{
    rel: `relics/${id}.png`, kind: 'png', urls: [],
  }] }])]);
}
