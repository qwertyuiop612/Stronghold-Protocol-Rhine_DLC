# Rhine v0.2.4-rhine.5 + 上游 v0.2.6 同步报告

日期：2026-10-14
本次同步三个来源：

- **Rhine `E:\DLC\Stronghold-Protocol-Rhine`**：`v0.2.4-rhine.5`
  （`bundle-manifest.json` sourceCommit `b159e574`；相对上一轮基准 `523cca24`（v0.2.2-rhine.3）共 411 个变更文件，
  其中 383 个参与逐文件合并；83 个提交）
- **上游 `E:\DLC\Stronghold-Protocol`**：`v0.2.6`（`MANIFEST.json` app 0.2.6）
  相对上一轮基准 `bc50cac0`（v0.2.4）共 279 个变更文件（62 新增 / 217 修改，排除生成物后 271 个）
- **DLC 战线 `https://github.com/UNDFFIO/Stronghold-Protocol-dlc`**：`3fd0be02`
  相对 fork 中的 `416fd95b` 共 32 个文件（+1380 / −453）

目标：`E:\DLC\Stronghold-Protocol-test`（本 fork = Rhine_DLC），起点 `bf183175`（上一轮同步的提交）。

方法：以工作树为 ours、旧来源为 base、新来源为 theirs，逐文件 `git merge-file -p --diff3` 三方合并，
顺序为 **Rhine → DLC → 上游**，两两冲突一律「保留扩展规则 / 采纳上游机制」逐 hunk 解决。
`data/**`、`test/golden/**`、`public/assets`、`public/vendor`、`packs`、`runtime`、`.cache`、`MANIFEST.json`、
`bundle-manifest.json`、`.github/workflows/**` 不参与逐文件合并，改为重建或单独审查。

## 一、Rhine v0.2.4-rhine.5

- 新增**雷姆必拓（Rem）援军线**：18 个 chess 记录（9 名干员 × 普通 / 精锐）、
  `server/sim/content/rem.js`、`server/sim/content/rem_traits.js`、`shared/rem.js`，
  9 个 `server/sim/content/kits/ops/chess_rem_*.js` 技能文件。
- 新增**援军集合点**玩法：`public/js/ui/remRally.js`、`server/match/beaconSupply.js`（六席信标供给），
  i18n 增加「雷姆必拓集合点」「集合点：{row}行 {col}列」等 5 条。
- 新增数据与素材工具：`tools/rem-data.mjs`、`tools/rem-data-fetch.mjs`、`tools/rem-data-source.json`、
  `tools/assets/rem-plan.mjs`、`tools/fetch-rem-assets.mjs`、`tools/preset-data.mjs`；
  `tools/build-data.mjs` 增加 `applyRemData` 覆写（本轮补回）。
- 新增测试：`test/rem_data.test.js`、`test/content/{rem,rem_traits,rem_native_kits,rem-price,rem-rally,rhine_magallan,kazdel-unite,rhine-upstream024}.test.js`、
  `test/render/rem-art.browser.test.js`、`test/sim/{rem,rhine}.browser.test.js`、`test/ui/rem-rally.browser.test.js`、
  `test/tools/rem-asset-plan.test.js`；新增文档 `docs/REM.md`、`docs/RHINE-024-GOLDEN.md`。
- 删除 `server/sim/content/kazdel/ascalon.js` 与 `test/content/kazdel_ascalon.test.js`（阿斯卡纶改由上游原生实现承载）。
- 行为调整：莱茵多萝西改回原生 IV 阶（不再作为莱茵新增棋子），`RHINE_ADDITIONS` 收为
  mayer / wuhoo / eunectes / ifrit / astgenne / magallan 六项。

## 二、DLC 战线 3fd0be02

- **超限模拟等级规则重构**：`shared/difficulty.js`、`server/sim/difficulty.js`、`public/js/ui/difficultyLevel.js`、
  `public/css/difficulty-level.css`、`test/sim/ascension.test.js`。
- **难度选择器交互与大厅提示**：`public/js/screens/room.js` 接收 `DifficultyLevelPicker`（大厅不再承载），
  加上协议说明体系。
- **收藏品扩展**：护愈之手、低血线增益（`server/sim/content/relics.js`、`shared/relics.js`、
  `docs/COLLECTIBLES.md`、`tools/assets/relics.mjs`、`data/assets.json`、`test/content/relic-low-hp.test.js`）。
- **角色 Spine 与资源清单**：新增模型及 `data/assets.json` 记录。

## 三、上游 v0.2.5 / v0.2.6

- **0.2.5**：3D 棋盘按战场显示官方场景（`node tools/setup.mjs --scenes`）；设置新增「官方伤害数字」；
  标题画面页脚新增项目仓库链接；首领配对改为每局随机（隐藏首领沿用同局分组）；固定赠品不再被共享库存阻断；
  洛洛 / 焰尾子池按实测权重；调度中心 4 / 5 级晋升奖励可出现五 / 六阶自选；驭械术师浮游改为本体攻击 + 附加伤害；
  若干规则修复（司霆惊蛰、斩业星熊、予愿安洁莉娜、联防阿戈尔、谢拉格不融冰、催泪瓦斯、自在无敌期等）。
- **0.2.6**：开服流量优化（静音不下背景音乐、1 KB 以上 WebSocket 消息 permessage-deflate、
  素材地址带内容哈希 + `.cache/asset-hashes.json` + `SP_ASSET_INDEX=0`、brotli、教程图 WebP、`/healthz?traffic=1`）；
  维什戴尔的魂灵之影只召唤到场上部署格；官方场景光照改回提取值；射击台 / 水上平台 / 封印地面重画；
  最后一个未选策略的玩家不再看到「跳过」；每回合开始按部署顺序重播入场动画；
  设置新增「弹药数量」（默认关闭）；场上单位多时按动作预留缓存画面；Windows 场景素材测试路径修复。
- 新增代码：`server/http/{assetIndex,assetViews,traffic}.js`、`shared/assetPaths.js`、`public/dev/sim-check.{html,js}`、
  `public/dev/simcheck/*`、`tools/sim-check.mjs`、`tools/local-extract/{fetch_scenes.py,scenes.py}`、
  `tools/i18n/corrections-en.json`、`docs/history/{0.2.5,0.2.6}.md`，以及约 45 个新测试文件。

## 四、冲突与解决原则

冲突文件合计 **80** 个：Rhine 46、DLC 8、上游 26。

- **扩展与 fork 专有行为一律保留**：`MatchRelics` / `autoSelectRelic` / `_waitRelicChoices`、`coinHud`、
  `keepFacing`、`combatSpeedMode`、`textSize`、`guardDifficultyDamage`、卡兹戴尔生命上限 `hpFinal`、
  DLC 低血线增益 `lowHpAtkPct` / `lowHpSpRecoveryFlat`、六席信标 `信标: 19` 与 `chess_item_6_03_m` 占位、
  收藏品与超限模拟的全部 i18n 条目。
- **上游新机制一律采纳**：洗牌配对 `pairPlayers(alive, rng, previous)`、共享库存取整与 `overdraw`、
  官方伤害标记链（`landedPreShield` / `officialDamageMark` / `officialExpectedAmount`）、素材索引、
  弹药数量设置、`headTilesForUnit` 重构等。
- 关键文件：`server/sim/damage.js` 同时保留 `guardDifficultyDamage` 与上游标记链；
  `server/sim/units.js` 以 DLC 版为基（含低血线缩放）再补回 `hpFinal`；
  `server/sim/content/index.js` 的 `DOMAIN_NAMES` 保留 `relics` / `rem` / `rem_traits`；
  `public/js/render/units.js` 采用上游 `headTilesForUnit` 并保留 `researchActor.look.head` 优先；
  `public/js/ui/loadoutSync.js` 保留 fork 的 `cache.snapshot()` / `snapshot.generation`，叠加上游 `revision` 竞争保护；
  `public/i18n/*.json` 以 fork 译文为主、补入 Rhine 与上游新增键。
- 合并期间发现的两个既有问题一并修复：
  已推送的 `public/css/components.css` 实为 3 份拷贝且含一段残留冲突块（标记 `css-new` / `css-old` / `css-mine`），
  已重建为单一 49 KB 文件；`tools/build-data.mjs` 缺少 `applyRemData` 调用，导致雷姆必拓数据整体缺失，已补回。

## 五、验证

- 数据重建：`node tools/build-data.mjs --offline` → 15 个文件 / 5.95 MB，
  chess=308（含 18 个雷姆必拓记录）、bonds=23、items=115、garrisons=249。
- golden 重建：`node tools/golden.mjs --update --jobs 4` → roster 49 / bonds 46 / fields 22 / matches 20 /
  standins 10 / diy 140 个场景。
- 定向测试：`test/content/*`、`test/match/*`、`test/diy.test.js`、`test/vanilla-data.test.js`、
  `test/rhine_equipment_data.test.js`、`test/kazdel_equipment_data.test.js`、`test/dorothy-tier.test.js` 全绿。
- 静态检查：`tsc --noEmit --checkJs -p jsconfig.json`（0 error）、ESLint（0 error / 152 warning）、
  `tools/check-imports.mjs`（3 条 allowed note）、`tools/i18n.mjs check`（en 1611/1611）、
  `node tools/ci.mjs --only setup,smoke,imports,typecheck` 全 `ok`；服务器冒烟 `/healthz` ok、app 0.2.6、首页 200。
- 全量测试（2026-10-17，`node --test`）：7411 项，7361 通过、0 失败、50 项条件跳过（原始数据缓存或可选浏览器环境）。
  同日把两个计时型用例改成与主机负载无关：`test/lobby.test.js` 的限流与泛洪各起一个把 `ratePerSec` / `abuseDropsPerSec`
  调小的独立服务器（默认 40 msg/s + 400 drops/s 的阈值在并行负载下根本触发不到），性能基准的 0.5 ms/tick 由
  `test/helpers/perfBudget.js` 在并行测试进程里按 `SUITE_LOAD = 6` 放宽（空闲机上同一首领战场 0.22 ms/tick，
  全量并行跑起来约 1.0 ms/tick；`SP_PERF_FACTOR=1` 回到串行口径）。

### 合并后的修补（逐文件结果之外）

- **逐文件合并没写进工作树的 hunk**：`resolve.mjs` 的 `ours` 只表示「不动工作树」，而冲突文件在合并时整体保持
  ours——对称地，theirs 在同一文件里的**非冲突**改动只存在于 `git merge-file` 的结果里。受影响的文件（字段判定、
  信标、界面文案等）已用 `merged-ours`（从冲突结果重放全部 hunk）与 `fix-upstream.mjs` 重做，并复查全库无残留
  冲突标记。
- **素材清单**：从本地莱茵整合包复制 117 个缺失素材（`public/assets`）后 `node tools/fetch-assets.mjs --offline`
  重写 `data/assets.json`（manifest 11379 个文件 / 582.9 MB）→ `test/assets.test.js` 54/54。
- **i18n 校正**：联网 `build-i18n --lang en` 会丢掉莱茵的自定义译法（覆盖率反而降到 96.3%），因此不重跑；
  改为把 `tools/i18n/corrections-en.json` 的措辞打进仓库自带的 `data/i18n/en.json`（维多利亚同盟文案）
  → `test/i18n-data.test.js` 11/11。
- **静态检查**：`public/css/difficulty-level.css` 不再使用 `container-type` / `cqh`（`test/client-static.test.js`
  禁用），改为 `room.css` 的默认头像尺寸 → 376/376。
- **golden**：roster 增大到 308（+18 雷姆必拓）后，旧的 `coop2-NORMAL-20-coverage-diy` 的 AI 不再上场推进之王；
  按该文件的既有做法换成 `coop2-NORMAL-68-coverage-diy`（seed 68，第 3–5 回合上场，商店抽到 2 次自选），
  已重录 `test/golden/matches.json`，并同步 `tools/golden.mjs` 的 `FAST_MATCHES` 与 `test/golden/README.md`。
- **上游 0.2.6 的洗牌配对**：`pairPlayers(alive, rng, previous)` 现在每局按 `deriveSeed(seed, 'boss-pairs')` 洗牌，
  于是 fork 自有的 5/6 人测试不能再假设「前两个座位同场」。已改成从 `m.fields[0].players` / `m.bossWaves` 推导
  （authority = 场内最小座位），涉及 `test/match/five-player.test.js`、`five-player-real.test.js`、
  `six-player.test.js`、`six-player-real.test.js`、`six-player-boss-hp.test.js`；`bot-smarter` 的拟态物质用例
  也要先把棋盘上「不是它造的那一对」收回一张（0.2.6 下 seed 6 的 board 上本来就有 `chess_char_1_07_a` ×2）。
- **受 seed 影响的重型路由测试**：`test/match/funnel-redeploy.test.js`（上游新增）原先写死 seed 8 的商店第 0/3 格；
  roster 变大后改为 seed 216 并按 id 查商店格子（`slotOf`），funnel 两跳路线保持原断言。
- **degraded 数据的 token 设备**：`server/match/player/research.js` 改取莱茵版（逐设备 `gd.token()` 守卫），
  fork 早期的 `_rhinePlayable()` 全有全无门会让「只缺一种 token 定义」时顺手拿走其余设备，
  与莱茵新增的 `test/match/rhineResearch.test.js` 预期不符；`test/match/fullmatch.test.js` 的纯 chess/bands 数据仍全锁。
- **DLC 侧 `shared/difficulty.js` 的重复实参**：3fd0be02 有 8 条 `rule(level, key, name, params, describe, counter,
  detail, detail)` 把第 7 个实参写了两遍（`rule` 只有 7 个形参），运行时被忽略但 `tsc --checkJs` 报 8 个 TS2554；
  已删掉重复的尾参（`rule` 的 `detail` 值不变），`tsc --noEmit` 归零。
- **本机素材清单**：`data/local-assets.json`（`.gitignore` 中的本机清单）补齐整合包带来的
  `spine/token/token_10031_swire2_gdtrap` 组（其余 61 组与整合包逐字节一致），`test/local-token-models.test.js` 8/8。

## 六、继续的入口

- `tools/vanilla-data.mjs` 的 `VANILLA_UPSTREAM_COMMIT` 仍钉在 `bc50cac019ff447eff3ab6c35f69d934bbc23b48f`（v0.2.4）：
  它是 fork 记录的「上游基线」，本轮不改；若要改钉 v0.2.6（`488db49f`）需连同 `test/vanilla-data.test.js` 的
  PIN 与 22 个基线文件一起重录。
- 上游 0.2.6 的场景 / 素材索引依赖本机提取缓存，仓库不存放官方文件；
  `public/dev/simcheck/data/` 已在 `.gitignore` 中。
- CI：`.github/workflows` 未参与逐文件合并，本轮沿用 fork 现有工作流。用干净克隆复现流水线（无 `public/assets`、
  无 `data/local-assets.json`、无 `public/fonts`、CI 的 `SP_*`/`NO_COLOR` 环境）后，确定性失败只有一个：
  `test/docs-paths.test.js` 的 `EXEMPT` 少了 `public/fonts/`（上游 0.2.6 的 `docs/ARCHITECTURE.md` 在
  `assetIndex.js` 一节里提到它，而 `.gitignore:13` 把它列为安装期生成物），已补进 `EXEMPT`；其余是并发/机器计时类
  （socket 限流 2 项与重型首领战场基准），同一条流水线上换一台机器或单跑即通过。
