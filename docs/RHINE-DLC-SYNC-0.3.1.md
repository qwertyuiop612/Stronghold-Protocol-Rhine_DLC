# 上游 v0.3.1 + Rhine v0.3.0-rhine.11 同步报告

本文件记录 `v0.3.1-test` 的三路合并：上游官方仓库、莱茵（Rhine）与 DLC 战线。前一版见 [v0.3.0 同步报告](RHINE-DLC-SYNC-0.3.0.md)。

| 来源 | 提交 | 说明 |
| --- | --- | --- |
| 上游 [sganggs/Stronghold-Protocol](https://github.com/sganggs/Stronghold-Protocol) | `b3deebd`（tag `v0.3.1`） | 官方 0.3.1：插件报价（offers）、干员皮肤、测试房间、特性层权限（trait layer）、插件工作台与 schema 扩充 |
| 莱茵 [YUYUYUYUYUYUYUTOUA/Stronghold-Protocol-Rhine](https://github.com/YUYUYUYUYUYUYUTOUA/Stronghold-Protocol-Rhine) | `8f6b98c2`（tag `v0.3.0-rhine.11`） | Rhine.10–11：公开预发行附件匿名验证、严格源检出证据、视图所有权释放、2D 棋盘美术容错、视口 scale 等待、legacy dev-hook guard |
| DLC 战线 `UNDFFIO/Stronghold-Protocol-dlc` | `d8d10f19` | 已在 `v0.3.0` 合入的收藏品、超限模拟与商店扩展基线 |

合并沿用「保留扩展规则、采纳上游机制」的原则：机制跟随上游 0.3.1，莱茵与 DLC 的玩法扩展全部保留。合并后的身份为 `v0.3.1-test`：`package.json` 版本 `0.3.1`。

## 一、上游 v0.3.1（`up-v0.3.0..v0.3.1`）

- 198 个提交，其中触代码 114 个、纯文档/测试/CI 84 个；相对 v0.3.0 的 537 个文件（+13709 / −960）。
- 新机制：
  - **插件报价（offers）**：`shared/plugins/offers.js`、`server/match/MatchOffers.js`、`room.offer` / `g.offer` / `g.offerRefresh` 协议，插件可在房间里投放一次性或可刷新的报价位（`PLUGIN_OFFER_SLOTS`）。
  - **干员皮肤**：`room.skins` 处理器、`freezeSkins()`、`match.setSkins`、席位 `seat.skins`、`operatorCharIds` / `checkSkinSelection`。
  - **测试房间**：`server/testMode.js`（`parseTestModeEnv` / `testModeGate` / `unrecognizedTestMode`）、`room.test` 标记、`g.test` 门禁、`setTestHost`、`MatchTestCommands`、`TEST_PUBLIC_LOG` 快照。
  - **特性层权限**：`requiresTraitLayerAuthority`、`morphBattleOpt(this.rules)` 与数据里的 `rangeExpand`。
- 工具与格式：`tools/plugin.mjs` 423→507 行、`tools/setup.mjs` 575→972、`server/plugins/registry.js` 838→1001、`server/studio/index.js` 1027→1081，`docs/PLUGINS.md` 1444→2180；schema 扩充（plugin 2098→2528、records 6108→8373、overlay 562→827，新增 operator-trait 1799 行）。
- 另有 15 个 0.3.0 CI 修复提交（测试等待放宽、watchdog 探针、Windows 加载器排除 `nodeData.js` 等）随合并进入。

## 二、莱茵 Rhine.10 / Rhine.11

- 相对 Rhine.9 共 9 个提交、21 个文件：浏览器视图所有权在 `pagehide` 释放、2D 棋盘美术失败容错、视口 scale 等待、legacy dev-hook guard，以及公开预发行的匿名附件验证与严格源检出证据链。
- 这些改动只涉及渲染与发布脚本，不改变玩法数值；`shared/`、`server/sim/` 的莱茵规则保持原样。

## 三、合并方式

两条历史与上游没有共同祖先，只能按内容三方合并：

1. **阶段 A（Rhine.11）**：以 Rhine.9 树为 base、本 fork 树为 ours、Rhine.11 树为 theirs，`git merge-tree --write-tree` 得到合并树；唯一冲突是 `README.md`（2 处），提交为 `b42d5ca8`。
2. **阶段 B（v0.3.1）**：以 v0.3.0 树为 base、阶段 A 树为 ours、v0.3.1 树为 theirs，得到 69 个冲突文件，逐个裁决后落地。

## 四、冲突与解决原则

- **扩展行为优先，上游独立新增并入**：`server/match/player/economy.js` 保留 DLC 的 `rollShop({ keepFrozen, round })` 与随回合变化的 `shopSlots`，同时插入上游的 `_consumeTestShop()`；`server/match/match/views.js` 同时输出 DLC 的 `roundLossesView` 与上游测试房间快照；`combat.js` / `clientCombat.js` 在 DLC 的倍速、难度字段之外追加 `...morphBattleOpt(this.rules)`。
- **协议取并集**：`shared/protocol.js` 的 `room.create` / `room.join` / `room.spectate` 同时接受 `rhineEnabled`、`difficultyLevel`、`test` / `testAck`、`password`，`g.choice` 之外新增 `g.offer` / `g.offerRefresh`。
- **设置项取上游默认值**：`public/js/ui/gameLogic/settings.js` 采用上游注释与默认值（`ammoEnergyCount`、`prepDeployFold`、`otherSkins`），并保留 DLC 的 `combatSpeedMode: 'attack'`；莱茵遗留的 `ammoCount` / `mysticEnergy` 死键删除。
- **入口与门面取并集**：`server/lobby.js` 合并皮肤、测试房间与 DLC 的倍速/难度字段；`scripts/launch.mjs` 同时装载 `finishInstallUpdate` 与 `testModeGate`；`server/net.js`、`server/match/host/proxy.js` 的键表取并集。
- **渲染层以 DLC 为主**：`public/js/render/fx/zones.js` 的 `tileFlash` 同时接受 DLC 的渲染选项包（`key`/`steady`/`anchor`/`bounds`）与上游的技能墙句柄（`owner`/`axis`/`dir`），`public/js/render/app.js` 采用上游的 `applyInfo` 命名并保留 `fx.syncKazdel`。
- **语言包结构合并**：`public/i18n/{en,ja,ko,zh-TW}.json` 以本 fork 的顺序为主，追加 0.3.1 新增键；合并后再补齐 ja／ko／zh-TW 缺失的 14 条 DLC 界面文本（倍速与集合点相关），四份语言包现均为 100% 覆盖。

## 五、数据与锁版

- `node tools/build-data.mjs` 重生成 15 个数据文件；相对上一版实际变化的是 `assets`、`backups`、`chess`、`config`、`emotes`、`factions`、`tuning`（0.3.1 的生成器新增 `rewards.milestones` / `rangeExpand` 等记录字段）。
- DLC 内容量复核（与上一版一致）：棋子 308、盟约 26、装备 123、卫戍 301、信物 31、效果 372、敌人 249、关卡 13、波次 38、赏金 40、首领 10、阵营 67。
- **原版数据 `data/vanilla/` 的锁版随本轮上移到上游 v0.3.1**：`tools/vanilla-data.mjs` 的 `VANILLA_UPSTREAM_COMMIT` 与 `test/vanilla-data.test.js` 的 `PIN` 同改为 `b3deebd`，快照由 `node tools/vanilla-data.mjs` 重新生成（22 个文件，逐字节等于该提交的 `data/`，manifest 记 `upstreamVersion: '0.3.1'`）。继续沿用 0.3.0 快照会让「原版 + 三扩展」的离线重建与 0.3.1 生成器新增的字段（`placeOnRanged`、`rewards.milestones`、`traitOverride.rangeExpand`）对不上。
- 生成器与发布快照分离：该快照还包含 `tools/build-data.mjs` 从不生成的 `assets`、`emotes`、`tuning`（来自 `tools/fetch-assets.mjs`）与四份语言包，所以 `tools/build-data.mjs` 只在目标目录缺少 `manifest.json` 时播种快照，不覆盖已发布的锁版；未部署用户服务器，也未改动原版玩法。

## 六、资源清单与音频槽位

- `data/assets.json` 不是 `tools/build-data.mjs` 的产物，而是 `node tools/fetch-assets.mjs` 生成的；本轮重生成时本机还没有 `public/assets/local/fx/index.json`（客户端本地解包，不入 Git），`assignSkillModeSfx` 只能按文件名字母回退，`audio.sfx.units.*.attacks` 的槽位因此错位（例如玛恩纳的 `_d` 落在槽 0），并多出 25 条引用。放入索引后日志变为 `[fx] skill modes for 210 operators`，清单恢复 `#679` 的「槽位来自技能模式表」语义。
- 重新生成的结果：16562 个文件、2238 个 Spine 模型；发布口径 484 单位 / 941 池 / 952 引用，本 fork 另有 19 个扩展干员带来的 37 条官方技能池引用（合计 978 池 / 989 引用）。
- 两处测试按 fork 口径做了最小适配，原因写进代码注释：
  - `test/audio-pools-data.test.js`：硬编码的 952/941 改为「对 `data/vanilla/assets.json`（锁定的上游清单）中的单位计数」，并断言锁版的每个池仍然存在；清单里所有单位（含扩展干员）仍逐条校验引用与音色参数。
  - `test/local-extract-operators.test.js`：合成 fixture 的 `load()` 用 `'chararts/' in p` 判断 bundle，Windows 路径是反斜杠，导致只导出一组模型；改为 `p.replace(chr(92), '/')`。

## 七、验证

- `test/data.test.js` 30/30 通过（含「离线重建与 `data/` 逐字节一致」）。
- `test/vanilla-data.test.js`、`test/docs-consistency.test.js`、`test/docs-paths.test.js`、`test/build-data-refresh.test.js` 共 46/46 通过。
- 启动冒烟：`node server/index.js` 后无头 Chrome 打开标题页，版本显示 `v0.3.1`，无 console / page 报错。
- 全量套件（`node --test`，9805 个用例 / 67 跳过）：除下述派生子进程的重型用例外全部通过；`setup`、`smoke`、`lint`（0 error）、`imports`、`typecheck` 五步 `node tools/ci.mjs --only` 全绿。
- 本机把 16 路并发下会超时的重型子进程用例单独成组复跑：`test/plugin-package.test.js`、`test/plugins/script-sandbox-integration.test.js`、`test/plugins/theme-notices.test.js`、`test/plugins/forgeImport.test.js`、`test/studio/review.test.js`、`test/studio/presentation.test.js` 合计 30/30（约 2 分钟）。这些用例每次各自生成 Node 子进程 / SES 沙箱 / 浏览器模块树，超时随机器负载浮动，与 0.3.0 时期一致，不是本轮合并引入的行为差异。
- 合并引入的两处 Windows 专属测试缺陷已修（Linux 上不触发）：`test/plugins/operator-traits.test.js` 用 `fileURLToPath` 取 fixture 路径（`.pathname` 在 Windows 得到 `/E:/…`，进 `pathToFileURL` 后变成 `E:\E:\…`）、`fs.cpSync` 的 filter 改判 `path.basename`（Windows 给反斜杠）；`test/plugins/forgeImport.test.js` 的 rose kit fixture 改回官方 `@sim/targeting.js` 导入，让被断言的那条拒绝路径仍然经过它。
- 浏览器套件（`SP_E2E=1` 等）本轮未跑，发布前按需执行；本轮未部署用户服务器。
