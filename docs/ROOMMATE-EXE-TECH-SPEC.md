# ROOMMATE.EXE 技术规格

## 1. 架构

应用由 React 外壳、Phaser 像素游戏层、Fastify API 和 OpenCode Zen/Jev 适配器组成。

```text
React HUD / 菜单 / 结局
          ↕ GameBridge
Phaser ApartmentScene
          ↕ 原子世界规则
Clock · Events · Actions · Memory · Archive
          ↕ DecisionSnapshot
POST /api/roommate/decision
          ↕
OpenCode Zen / jev-1.13-free
```

游戏规则、模型判断和渲染彼此隔离。只有 `WorldReducer` 应用确定性状态变化；Jev 只能选择动作 id，不能写入世界或生成后果。

## 2. 核心契约

`DecisionSnapshot` 包含会话 id、判断序号、日期、经过时间、公开事件、可观察状态、最多 12 条相关事实、未完成承诺、2–7 个候选动作与 SHA-256 状态哈希。普通动作必须有 3–7 个候选；续租必须恰好 2 个。会话 id 与序号供公开部署执行每日局数限制，状态哈希同时作为单次判断并发锁的一部分。

服务端将快照转换成单个中文 `Choice` 问题。返回结果必须：

- 模型严格等于 `jev-1.13-free`；
- 选择属于候选集合；
- 概率键与候选 id 完全一致且总和为 1；
- 状态哈希仍有效。

幂等键格式为 `roommate/{decisionPointId}/{stateHash}`，可重试错误最多调用两次。无付费模型或随机动作回退。

## 3. 模块职责

- `src/game/simulation`：初始世界、90 秒日时钟、哈希与唯一状态归约；
- `src/game/events`：七日固定事件和触发规则；
- `src/game/actions`：动作目录、前置条件和玩家动作；
- `src/game/memory`：共同事实、承诺及相关性筛选；
- `src/game/jev`：判断快照和自主行动控制器；
- `src/game/ending`：续租判断与关键决策筛选；
- `src/game/scenes`、`src/game/render`：固定镜头公寓、像素纹理和可交互对象；
- `src/client/roommate`：会话编排、HUD、菜单、暂停、结局与档案；
- `src/client/state/roommate-repository.ts`：IndexedDB 原子存档；
- `src/server/routes/roommate.ts`：唯一模型判断 API；
- `src/server/providers/zen.ts`：OpenCode Zen 传输、重试和响应校验。

## 4. API

### `POST /api/roommate/decision`

请求为 `DecisionSnapshot`，成功返回 `RoommateDecision`；格式错误返回 400，过期快照返回 409，上游不可用返回 503。请求头 `x-installation-id` 仅用于公开部署配额。

### `GET /api/health`

只返回：

```json
{
  "ok": true,
  "configured": true,
  "model": "jev-1.13-free",
  "simulationDayDurationMs": 90000
}
```

任何凭据都不得进入响应、指标或导出。

## 5. 持久化与恢复

浏览器使用独立 `roommateSessions` IndexedDB store 保存经过 schema 校验的完整会话。动作后果、事实与判断结果在一个提交点写入；刷新时忽略未完成请求和动画，只恢复最后一次完整提交。

## 6. 配置

- `OPENCODE_API_KEY`：首选凭据；兼容 `TYPESAFE_API_KEY`；
- `JEV_MODE=live|mock`：真实模型或确定性测试实现；
- `SIMULATION_DAY_MS`：仅 mock 模式可缩短一天时长；
- `PUBLIC_MODE`、`KILL_SWITCH`、`REDIS_URL` 与额度变量：公开部署保护；
- `JEV_API_URL`、`JEV_MODEL` 可读取，但服务校验仍拒绝非免费模型响应。

## 7. 验证策略

- 规则测试：时钟、事件、动作、状态、记忆、哈希与四种结局；
- 服务测试：schema、免费模型限制、配额、隐私、失效响应；
- 集成测试：固定 Jev 序列跑完七天；
- E2E：物品互动、刷新、Day 6 提示、续租揭晓、档案与 JSON 下载；
- 真实探针：3 动作、7 动作、2 续租选项，验证中文单 Choice、延迟、usage、完整概率和免费模型约束。

执行：

```powershell
npm test
npm run test:spike
npm run typecheck
npm run build
npm run test:e2e
```
