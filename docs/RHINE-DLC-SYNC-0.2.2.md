# Rhine v0.2.2 同步到 Stronghold-Protocol-Rhine_DLC

日期：2026-10-10
源：`E:\DLC\Stronghold-Protocol-Rhine`（Rhine 0.2.2 便携包，`bundle-manifest.json` sourceCommit `1cee58a8`）
目标：`E:\DLC\Stronghold-Protocol-test`（本 fork：Rhine v0.2.1-rhine.2 + DLC）

## 同步了什么

Rhine 侧 `codex/rhine-upstream-021` 的 **v0.2.2-rhine.1**（上游 v0.2.2 + 莱茵生命／卡兹戴尔扩展）：

- 上游 0.2.2：逐干员潜能与练度设置、日文干员语音、本机统计数据页、AI 队友最后轮选、
  顶栏胶囊口径、失衡、整数帧攻击间隔、确定性数学函数（`server/sim/detmath.js`）、
  领袖战场传送门、杜宾「教鞭」三选一、以及 0.2.1 之后的界面与干员修复。
- 莱茵 0.2.1-rhine.3 起新增的**卡兹戴尔**：众魂、战争巨炮、十名成员、BAN 数调整。
- 莱茵 v0.2.1-rhine.4 的数值调整（奥达／赫德雷无上限产层、维什戴尔炮击加成、钻机真伤口径）。
- 新增资源：日文语音（`public/assets/audio/voice/jp/`，2758 文件约 88 MB）、卡兹戴尔素材、
  魂灵模型等；`data/assets.json` 用 `fetch-assets --offline` 重建（10947 文件、约 596 MB、另有 197 名日文语音干员）。

DLC 侧完全保留：超限难度 0–20、收藏品／饰品、复活、时光之末、伤害排行、房主战斗倍速与时长倍率、
复活后观战视角恢复等。合并方式为逐文件三方合并（`git merge-file`：以 0.2.2 为基准，回放 DLC 改动），
冲突逐个手工解决。

## 关键决定

| 事项 | 决定 |
| --- | --- |
| 基线 | 上游与莱茵共用的 0.2.1 提交 `4aa6df59`（Rhine `codex/rhine-research` 与 test 树最接近的祖先） |
| 版本号 | `package.json` / `package-lock.json` / `APP_VERSION` 统一 `0.2.2`；`README` 标注 v0.2.2-test |
| 生成数据 | 本 fork 的 `data/*.json` 在 0.2.1 上与 Rhine 基线逐字节相同（只有 `assets.json` 是 DLC 自己的），故直接采用 0.2.2 包的生成数据，仅保留本 fork 的资源清单 |
| `shopSlots(level, round)` | 保留 DLC 的「第 9 回合起 +2 干员位」，调用方显式传 round |
| 文档 | 上游／莱茵参考文档取 0.2.2 版本；`RHINE*.md`、`KAZDEL.md` 取 v0.2.2-rhine.1；fork 自有文档（`COLLECTIBLES.md`、`README.md`）保留 DLC 内容 |

## 验证

- `npm run typecheck`：通过（无错误）
- `eslint .`：0 error
- `npm run check:imports`：仍只有基线原有的 3 条 `server/sim/nodeData.js` Node 专用导入提示
- `node tools/i18n.mjs check --lang en --strict`：1552/1552（100%）
- `node tools/golden.mjs --update` 后 `test/golden.test.js` 9/9 通过
- 全量测试（`node --test`）：

| | 用例 | 通过 | 失败 | 条件跳过 |
| --- | --- | --- | --- | --- |
| 同步前（本 fork） | 5682 | 5602 | 37 | 43 |
| 同步后 | 6465 | 6417 | 1 | 47 |

  唯一失败：`performance: heavy 2-player boss field (18 ops, ~130 enemies alive) averages < 0.5 ms/tick`，
  本机基线同样失败（best 0.83 ms/tick），属机器性能，与本次同步无关。
- HTTP 冒烟：`/`、`/healthz`、`/dev/game-mock.html`、`/js/{main,ui/combatSpeed,screens/cultivation,screens/stats}.js`、
  `/data/{chess,assets}.json`、`/i18n/en.json`、日文语音 `/assets/audio/voice/jp/…` 均 200。

## 已知差异／待办

- 两个性能用例（`test/sim/perf.test.js` 的重装领袖场、`test/tools/botbench` 的最坏场景）在本机基线上也超标，
  与本次同步无关，属机器性能／环境。
- `public/i18n/ja|ko|zh-TW.json` 对 DLC 新增 msgid 未翻译（沿用 0.2.2 包内容，缺 308 条），
  `--strict` 只对 `en` 强制，故测试通过；补齐翻译需人工。
- 上游 0.2.2 的参考文档（`DESIGN.md` §27、`SIM.md`、`DATA.md`、`META.md`、`research/13-14`）已随包更新；
  本 fork 的功能说明另见 `RHINE.md`、`COLLECTIBLES.md`、`KAZDEL.md`。

