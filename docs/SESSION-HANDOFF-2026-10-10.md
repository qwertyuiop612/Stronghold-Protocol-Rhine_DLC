# Stronghold-Protocol-Rhine_DLC 工作交接摘要

更新时间：2026-10-10

## 项目定位

- 项目名称：`Stronghold-Protocol-Rhine_DLC`
- 项目类型：上游 `sganggs/Stronghold-Protocol` 的 fork。
- 参考并整合：
  - `YUYUYUYUYUYUYUTOUA/Stronghold-Protocol-Rhine`
  - `UNDFFIO/Stronghold-Protocol-dlc`
- README 开头已注明：项目使用 AI 辅助进行代码分析、功能开发、测试和文档整理。
- 项目为非官方、非商业同人扩展，保留原许可证、版权和素材声明。

## GitHub 状态

- GitHub 仓库：<https://github.com/qwertyuiop612/Stronghold-Protocol-Rhine_DLC>
- 默认上传分支：`main`
- 最近提交：`2b7a9a1 Integrate Rhine DLC and add combat speed modes`
- 本地 `origin`：`https://github.com/qwertyuiop612/Stronghold-Protocol-Rhine_DLC.git`
- 本地 `upstream`：`https://github.com/sganggs/Stronghold-Protocol.git`
- GitHub 页面已确认 `main` 分支上传成功，README、代码、数据和测试均已存在。
- 当前仓库尚未创建 GitHub Release。

## 已完成的功能

### Rhine 与 DLC 合并

- 莱茵生命盟约、科研装置、装备、新干员和相关数据已合并。
- DLC 超限难度、奖励饰品、选择、复活和后期奖励已合并。
- 房间支持 Rhine / 原版数据切换，房主控制，开局后锁定。
- 保留原项目的协议、战斗模拟、浏览器客户端、测试和文档体系。

### 房主战斗倍速

- 房主可控制战斗倍速，范围为 `x1` 到 `x5`。
- 前端控件已从按钮改为滑块。
- 默认战斗倍速为 `x2`。
- 支持攻速模式和攻击力模式：
  - 攻速模式：只改变战斗时钟速度。
  - 攻击力模式：对攻击伤害应用相应倍率。
- 其他玩家只能查看，不能修改。
- 准备阶段可修改，战斗开始后锁定。

### 战斗时长倍率

- 新增独立的战斗时长倍率，范围为 `x1` 到 `x5`。
- 基于 `x1` 倍速的基础战斗时限计算，再乘以时长倍率。
- 默认时长倍率为 `x1`。
- 普通战斗和联防均使用该倍率。
- 倍率通过房间状态、Match、公开对局状态和协议同步。

## 主要改动文件

- `shared/constants.js`：倍速和时长倍率常量。
- `shared/protocol.js`：房间和对局消息校验。
- `server/lobby.js`：房间保存、房主权限和状态广播。
- `server/match/Match.js`：对局保存倍速与时长倍率。
- `server/match/match/intents.js`：局内房主设置路由。
- `server/match/match/views.js`：公开状态字段。
- `server/match/match/combat.js`：普通战斗时限倍率。
- `server/match/match/unitePhase.js`：联防时限倍率。
- `public/js/ui/combatSpeed.js`：滑块和时长选择控件。
- `public/js/screens/room.js`：等待室房主控制。
- `public/js/screens/game.js`：局内设置请求。
- `public/js/ui/hud.js`：局内倍速控件。
- `public/css/components.css`：倍速滑块样式。
- `README.md`：项目名称、AI 声明和 fork 关系。
- `package.json`：项目名称和 GitHub 仓库元数据。

## 验证状态

已通过：

- `npm.cmd run typecheck`
- `test/room-rhine-profile.test.js`
- `test/ui/gameLogic.test.js`
- `test/match/fuzz.test.js`
- 数据、静态模块、文档一致性相关测试。
- 完整测试套件已运行，未发现失败。
- 之前唯一失败的旧 UI 断言已补上 `combatSpeedMode: 'attack'`。

## 服务器状态

- 本地开发服务器已停止。
- 之前使用地址：`http://localhost:3000`。
- 换窗口后如需启动：

```powershell
Set-Location 'E:\DLC\Stronghold-Protocol-test'
npm.cmd start
```

## 联网更新的重要限制

当前 `联网更新.bat` / `更新旧版.bat` 使用的是 Rhine 便携包更新器，不是 Git 源码同步工具。

- 更新器脚本：`scripts/rhine-online-update.mjs`。
- 当前固定仓库：`YUYUYUYUYUYUYUTOUA/Stronghold-Protocol-Rhine`。
- 目标安装目录必须是 Windows x64 Rhine 便携包，并包含：
  - `bundle-manifest.json`
  - `runtime/node/node.exe`
- 更新前必须结束对局并关闭服务器；工具不会自动停服。
- 更新器会校验 Release、SHA256、包内清单，备份到目标目录的 `.rhine-updates`，并保留配置和清单外文件。
- 当前 GitHub fork `qwertyuiop612/Stronghold-Protocol-Rhine_DLC` 尚无 Release，因此现有联网更新器暂时不能从该 fork 获取新内容，也不能把源码目录直接当成便携包更新。

当前 Rhine 便携包更新用法：

```powershell
.\联网更新.bat --check
.\联网更新.bat
```

源码版同步 fork 用法：

```powershell
Set-Location 'E:\DLC\Stronghold-Protocol-test'
git pull --ff-only origin main
npm.cmd ci
```

## 后续建议

如果要让联网更新器同步 `qwertyuiop612/Stronghold-Protocol-Rhine_DLC`：

1. 生成带 `bundle-manifest.json` 的 Windows x64 Rhine 整合包。
2. 在 fork 创建符合更新器格式的正式 Release，包含完整包和 `SHA256SUMS.txt`。
3. Release 标签需要符合类似 `v0.2.1-rhine.3` 的格式。
4. 修改 `scripts/rhine-online-update.mjs` 中的 `REPOSITORY` 为：

```js
export const REPOSITORY = 'qwertyuiop612/Stronghold-Protocol-Rhine_DLC';
```

5. 同步更新 `docs/RHINE-UPDATE.md`、README 和启动说明中的下载地址。
6. 重新测试更新器的 Release 校验、下载、冲突检测、备份、回退和配置保留流程。

不要把 GitHub 自动生成的 Source code ZIP 当作便携包更新源；它没有运行时和有效的 Rhine `bundle-manifest.json`。
