# Rhine v0.3.0-rhine.9 + DLC 战线 + 上游 v0.3.0 同步报告

本文件记录 `v0.3.0-test` 的三路合并：莱茵（Rhine）、DLC 战线与上游官方仓库。

| 来源 | 提交 | 说明 |
| --- | --- | --- |
| 上游 [sganggs/Stronghold-Protocol](https://github.com/sganggs/Stronghold-Protocol) | `c24e17ee`（tag `v0.3.0`） | 官方 0.3.0：插件系统、3D 战场场景、官方特效与弹药数字、原版数据档案 `data/vanilla/` |
| 莱茵 [YUYUYUYUYUYUYUTOUA/Stronghold-Protocol-Rhine](https://github.com/YUYUYUYUYUYUYUTOUA/Stronghold-Protocol-Rhine) | `bec8e325`（tag `v0.3.0-rhine.9`） | 阵营拓展与雷姆必拓、科研装置与钻机、Kazdel 预览脚本、发行验收与浏览器验收脚本 |
| DLC 战线 `UNDFFIO/Stronghold-Protocol-dlc` | `d8d10f19`（基线 `c24e17ee`） | 收藏品、超限 0–20 级、低血线增益、时光之末、伤害排行、公共房间与密码、分阶段商店扩展 |

合并以「保留扩展规则、采纳上游机制」为原则：数据与机制跟随上游 0.3.0，玩法扩展（莱茵、DLC 与 fork 自有内容）全部保留。合并后的身份为 `v0.3.0-test`：`package.json` 版本 `0.3.0`，`shared/constants.js` 的 `APP_VERSION = '0.3.0'`。

## 一、莱茵 v0.3.0-rhine.9

- 相对上游 584 个文件（+102324 / −1998），其中源码与脚本占大部分：`data/vanilla/*` 原版数据档案、`.github/workflows/rhine-release.yml` 与 `.github/scripts/rhine-*`（发行、浏览器验收、渲染诊断）、`Start-Kazdel-Preview.cmd`/`Restart-Kazdel-Preview.*`（Kazdel 预览）、`public/art/{rhine,kazdel}` 阵营美术。
- 扩展规则全部保留：雷姆必拓援军与覆盖寻敌、存活成长、默认模组，科研装置与钻机，Kazdel 的众魂、战争巨炮与 `hpFinal`，以及 5–6 人局的商店 +1 与掉线托管。
- 发行脚本（`tools/verify-rhine-release.mjs`、`tools/rhine-*`、`.github/workflows/rhine-release.yml`）保留在本 fork，发布渠道与验收门槛沿用莱茵的写法。

## 二、DLC 战线 `d8d10f19`

- 相对上游 199 个文件（+11864 / −1209）。保留的规则：收藏品与遗物图标集（`relics.relic_*`）、超限模拟 0–20 级、低血线增益、时光之末、伤害排行与战斗速度模式、公共房间与密码、`shopSlots` 第 9 回合起 +2 的阶段商店扩展、`combatSpeedMode`、DLC 难度选择器（`public/js/screens/room.js`）。
- 上游 0.3.0 的机制优先：`data/vanilla/`、插件系统、3D 场景与官方特效、首领配对、资产索引等一律采用上游实现；DLC 侧的旧实现（如 `server/match/bot.js` 的旧版备战启发式）不覆盖上游新代码，只保留其后加的一行 `shopSlots(L, m.round)`。
- `b27a4f60`（pip 缓存 + 镜像默认值 + `--asset-source` 报错提示）此前已单独并入本 fork（`dfe4def0`），三路合并时按本 fork 版本保留。

## 三、上游 v0.3.0 `c24e17ee`

- 插件系统（`plugins/`、`tools/plugin.mjs`、`/studio/` 工作台、插件沙箱与 CSP）、`data/vanilla/` 原版档案、3D 战场场景与官方特效/弹药数字、首领配对的每局洗牌、资产索引与流量统计、WebP 教学图。
- `docs/` 新增插件指南与参考、`UPSTREAM-0.3.0.md`（黄金场景迁移说明）等；README 的发布说明与工具段整段采用上游措辞，再叠加本 fork 的差异章节。

## 四、冲突与解决原则

42 个文件出现文本冲突，逐文件以 `git merge-file --diff3` 三方合并后人工裁决：

```
.gitignore, README.md, docs/history/0.2.4.md, public/css/screens/room.css, public/dev/game-mock.js,
public/i18n/{en,ja,zh-TW}.json, public/js/render/fx/kinds.js, public/js/screens/{game,lobby,room}.js,
server/lobby.js, server/match/{PlayerState,gamedata}.js, server/match/host/proxy.js,
server/match/match/{bossRounds,clientCombat,combat,views}.js, server/match/player/round.js,
server/sim/{Battle,buffs,damage,spec,units}.js, server/sim/content/index.js, shared/protocol.js,
test/docs-consistency.test.js, test/match/{bot,bot-smarter,funnel-redeploy}.test.js, test/match/harness.js,
test/plugins/{contentBattle,dsl-data,script-integration,script-review}.test.js, test/studio/{review,trial}.test.js,
test/version.test.js, tools/{package,plugin}.mjs
```

裁决要点：

- **协议**：`shared/protocol.js` 采用上游 0.3.0 全部键，并保留 `room.create` 的 `rhineEnabled`/`difficultyLevel` 与 0..8 的 `g.choice`。
- **模拟层**：`server/sim/Battle.js` 同时保留 `withGameData(...)` 与 `installDifficulty(this)`；`buffs.js` 的 ADD_KEYS 取并集（`hpFinal` + `defToRes`/`resToDef`/`defResClear`）；`units.js` 的 `_recalc()` 里 `+ a('hpFinal')` 与低血线增益并存；`damage.js` 同时接入 Kazdel 巨炮归属与难度伤害守卫；`content/index.js` 的领域顺序为 `… 'kazdel', 'relics', 'rem', 'rem_traits'`。
- **大厅与房间**：`server/lobby.js` 的 `Room` 构造器与 `create()` 同时接收 `rhineEnabled` 与 `difficultyLevel`；`host/proxy.js` 沿用上游的插件对局代理并保留 DLC 的难度选关。
- **前端**：`game.js` 只保留一个 `.gm__effects`（DLC 收藏品进上游 flex 列容器，RhineDock 同级）；`room.css` 去掉容器查询（`test/client-static.test.js` 禁止），难度选择器沿用上游布局。
- **i18n**：键数 en 2285 / ja 2283 / zh-TW 2283，值冲突一律取莱茵译法，删除 DLC 父本自带的 4 个重复键（`元素`/`当前战斗`/`总伤害`/`干员伤害排行`）。
- **测试**：`test/version.test.js` 用本 fork 的身份口径；`test/match/funnel-redeploy.test.js` 以 DLC 的 `rockrockSlot()` + `g.refresh` 取代写死商店格；探针超时统一用 `SCRIPT_PROBE_TIMEOUT_MS`（5000）。
- **工具**：`tools/plugin.mjs` 取莱茵的 `scriptTestArgs`（`file:` URL），丢弃 DLC 的 `--test-reporter=tap`（无消费者，`test/plugins/tool.test.js` 断言 argv）；`tools/package.mjs` 保留两端新增的打包条目。

## 五、合并后的修补

- **数据重建**：`node tools/build-data.mjs --offline`（15 文件 / 5.95 MB）。`data/chess.json` 308 条（`chess_rem_` 18、`chess_rhine_` 12、`chess_kazdel_` 12），`data/items.json` 123 条，`bonds` 23，`garrisons` 249。
- **文本重建**：`node tools/build-i18n.mjs` 会让 `data/i18n/en.json` 退回官方译法（覆盖率 96.3 %，`bonds` 88.5 %），所以该文件直接采用莱茵 v0.3.0-rhine.9 的版本（97.4 %，`texts` 23881，`bonds` 100 %）；再用一次性脚本把 fork 专属的 74 个 msgid（战斗倍速、雷姆必拓集合点、DLC 藏品文案等）并进 `public/i18n/en.json`，键数 2285 → 2359。`node tools/i18n.mjs check`：2229 个在用 msgid 全部有译文，0 missing、0 错误。
- **素材清单**：本机 `public/assets` 不含 0.3.0 新增素材，离线重扫会把 6632 个叶子判为丢失并拒绝写盘（`droppedLeaves`）。先 `SP_GITHUB_PROXY=https://ghfast.top/ node tools/fetch-assets.mjs --asset-source=mirror --concurrency=32`（301 s，`ok` 5624 / `skip` 8271 / `err` 258），再 `node tools/fetch-assets.mjs --offline --allow-shrink` 写出正式清单：摘要 `328ce6eec9e0`、`stats.files` 17642、`bytes` 801065645、`spineModels` 709、`relics` 52。只差 4 条新增动画（`char_134_ifrit`、`char_4087_ines` 的 `skill.via`），上游素材库暂未收录。
- **golden 重算**：新语料合并后场景摘要全部变化，`node tools/golden.mjs --update` 重算 6 个家族共 290 个场景（roster 49、bonds 46、fields 22、matches 23、standins 10、diy 140）。
- **测试适配**：
  - `test/match/bot-smarter.test.js` 的「购买会挤出羁绊成员」用例：购买决策仍是契约（手牌放不下被撤回的成员时不买），但买下之后 0.3.0 的机器人可能再花掉空位（例如合并道具）并把另一份手牌退回卡池，因此只断言被撤回的那名成员仍留在棋位上，未购买时羁绊仍然生效。
  - `test/full-potential.test.js`：本 fork 的「全形态」语料是官方 258 条 + 莱茵/卡兹戴尔/雷姆必拓 42 条映射，断言数改为 300；天赋候选用例跳过 `char_242_otter`（莱茵把梅尔改成 1–2 只机械水獭，与官方 3/4/5 不同）。
  - `test/feedback7-voices.test.js`：扩展歌伴名单由 6 人扩到 13 人（`audio.voiceJp` 实为 205 个，vanilla 192 人 + 13 人 × 14 行 = 2870 行）。
  - `test/golden-diy.test.js`：新语料下 seed 24 的 AI 只抽不派，覆盖「完整商店 → 部署 → 战斗」路径改用 seed 5（`coop2-NORMAL-5-coverage-diy`）。
- **身份**：README 标题、`本轮版本：v0.3.0-test`、维护者/分支、Releases 与 Issues 链接、docs 表（新增本文件）与英文 Fork 段逐项对齐；`test/version.test.js` 断言 fork 的包名与仓库地址。

### 合并后回植的 fork 功能（用户复查时发现的三处）

- **3D 战场场景与背景**：官方场景素材（`public/assets/local/scene/**`，12 套场景）是 git-ignored 的资源，干净工作树里没有，所以浏览器 `board3d/scene.js` 拿不到 `data/local-assets.json` 的 `scene` 组、背景不显示。这不是代码丢失；把 DLC 树的 `public/assets/local/**` 与 `data/local-assets.json`（`count` 1690）复制进工作树后复验通过。本次从 DLC 树复制 148 MB 场景素材（`test/local-token-models.test.js` + `test/scene-assets.test.js` 13/13）。
- **战斗倍速（DLC 0.2.x 的 `room.setCombatSpeed` + `g.setCombatSpeed`）**：上游 0.3.0 重写了房间与战斗调度，这两个命令随之消失，房间与对局 UI 里的倍速选择器、`CombatHud` 的倍速按钮、`combatSpeedMode`（`attack`/`power`）一并丢失。已按 HEAD 之前的实现逐文件回植：`shared/constants.js`（`COMBAT_SPEEDS`/`COMBAT_DURATION_MULTIPLIERS`/`COMBAT_SPEED_MODES`）、`shared/protocol.js`（`room.setCombatSpeed`、`g.setCombatSpeed`）、`server/lobby.js`（房间字段、`snapshot()`、`setCombatSpeed`、建房时传给对局）、`server/match/Match.js`、`server/match/match/intents.js`、`combat.js`/`clientCombat.js`/`unitePhase.js`（战斗时长乘数）、`server/sim/Battle.js` + `server/sim/damage.js`（`power` 模式的攻击力换算）、前端 `public/js/screens/room.js`、`public/js/ui/hud.js`、`public/js/screens/game.js`、`public/js/ui/gameLogic/settings.js` 与 `public/css/components.css`；`test/room-rhine-profile.test.js` 与 `test/match/fuzz.test.js` 补了对应断言。
- **雷姆必拓集合点（`g.remRally`）**：上游 0.3.0 主动退役了该功能（`test/match/rem-rally.test.js` 被改写为「retired rally commands are rejected」，`server/sim/content/rem.js` 把玩家选的集合点换成了自动 `vehicleStop`）。按 fork 「保留扩展规则」的约定回植：`shared/protocol.js` 的 `g.remRally`、`server/match/PlayerState.js` 字段、`server/match/player/placement.js` 的 `setRemRally`/`remRallyView`、`server/match/player/views.js` 与 `round.js` 的私有视图/战斗输入、`server/match/match/intents.js` 分发、`server/sim/spec.js` 的白名单清洗、`server/sim/content/rem.js`（玩家选了合法近战格就用它，否则回落到自动停车点）、前端 `public/js/ui/gameActions.js` 与 `public/js/screens/game.js`；测试恢复 fork 版本的 `test/match/rem-rally.test.js`、`test/sim/rem.browser.test.js`、`test/ui/rem-rally.browser.test.js`，`test/match/rem-round-carry.test.js` 的 spec 用例改为「合法集合点进战斗、伪造/畸形值被清成 null」，`test/match/fuzz.test.js` 重新生成 `g.remRally` 意图。

## 六、验证

- 静态检查：`tsc --noEmit --checkJs -p jsconfig.json` 0 error、ESLint `154 problems (0 errors, 154 warnings)`、`tools/check-imports.mjs` 3 条既有 allowed note、`node tools/ci.mjs --only setup,smoke,imports,typecheck` 全 ok。
- 全量测试：`node --test --test-concurrency=4` → **8806 项，8737 通过、0 失败、69 项条件跳过**，用时约 39 分钟。并发度必须用 4（与 4 核 CI 一致）：`test/match/plugin-host.test.js`、`test/plugin-package.test.js`、`test/studio/review.test.js` 里有嵌套启动 node/python 子进程并按固定超时等待的用例，在 16 核机器上并发 8 时冷启动超时会假失败，单跑或并发 4 全部通过。
  - 为让「并发 4 的高负载全量」稳定，本轮把三处串行机器的时间假设改成按负载放宽（与 `test/helpers/perfBudget.js` 同一思路，而不是靠重跑）：`test/helpers/wsClient.js` 的默认等待帧上限 2 s → 5 s（`CI` 下 8 s，`SP_WAIT_MS` 可覆盖）；`test/studio/review.test.js` 的真实子进程试跑预算 ×3（测试超时 90 s，标记/退出等待改为按截止时间而非次数）；`test/match/realtime.test.js` 对自己战斗 `b.result` 的上报改为有界等待（最多 6 s）。
  - 顺带修掉 `test/ui/gameLogic.test.js` 的 `sanitizeSettings` 期望值：设置里新增的 `combatSpeedMode` 必须出现在默认设置快照里。

## 七、继续的入口

- 上游机制与本 fork 扩展的交界处集中在 `server/match/bot.js`（备战启发式）、`server/match/gamedata.js`（`shopSlots`/`handSlots`）与 `shared/protocol.js`；下次同步上游时应先看这三处的上游 diff。
- `data/assets.json` 是本次用镜像补齐素材后离线生成的正式清单；仍有 4 条新增动画缺失（`char_134_ifrit`、`char_4087_ines` 的 `skill.via`），等上游素材库收录后重跑 `node tools/fetch-assets.mjs --offline` 即可。
- 全量测试请用 `node --test --test-concurrency=4`；性能基准的放宽系数见 `test/helpers/perfBudget.js`（`SP_PERF_FACTOR=N` 可强制指定）。
