# ROOMMATE.EXE / 合租七日

一个由 Jev 判断驱动的七日像素生活模拟。你和 Jev 室友住在同一套房屋剖面中：你直接移动、使用物品并安排生活，Jev 则在每个真实可执行的生活动作间使用 `Choice` 自主判断。第七晚，双方秘密决定续租还是搬走。

## 当前系统设计

ROOMMATE.EXE 的重点不是让玩家在预写的按钮中替 Jev 选答案，而是把 Jev 的判断变成可观察、可被共同生活影响的行动：它决定“现在去哪里、做什么、如何回应”，游戏负责寻路、表现与后果。

- **玩家是室友，不是上帝。** 玩家可用 WASD 或方向键自由移动；点击任意可达的物品或 Jev，选择当前情境下的动作。玩家可编排最多三个跨房间行动，并可取消或调整尚未开始的步骤。
- **Jev 判断完整意图。** 引擎从整套公寓生成当前合法、可达且有差异的 6–8 个目标行动，例如做饭、休息、处理设备、观察或与玩家互动。Jev 只选择动作 id；它不生成坐标、路径或世界后果。
- **选择必须落到画面。** 每个行动经历“排队 → 寻路 → 到达校验/占用 → 动画执行 → 原子提交后果”。Jev 与玩家各自执行，能同时活动；争用同一物体时，以先抵达者为准，另一方重新规划。
- **世界会记住。** 饥饿、精力、心情、专注、食物与设备、整洁度和噪音，以及独立的信任/压力和共同事实，会改变下一次可做的事和 Jev 看到的自然语言情境。任何已完成行动都应留下可见或可追溯的结果。
- **模型异常不冻结生活。** 服务端接受 JSON、代码块、动作 id、动作名称和候选序号等等价格式；解析失败会先做一次格式修复重试。仍失败时，Jev 只会短暂犹豫，玩家、时间和世界继续运行；连续三次失败才单独暂停 Jev，并允许玩家手动重试。
- **结局是共同生活的回顾。** 第七晚的续租选择仍由双方秘密作出；结束后展示关键行动、关系与房屋变化、以及 Jev 的重要决策记录，而不是用一段“人格评语”概括它。

当前重构优先完成：全屋动作生成、三格玩家队列、网格寻路、双角色并发、原子后果、Jev 响应适配与失败恢复、意图反馈和思绪记录。自由聊天、多角色小镇、开放世界、模型生成路径或后果均不属于本轮 MVP。

## 运行

需要 Node.js 20.12 或更高版本。

```powershell
npm install
Copy-Item .env.example .env
# 在 .env 中填写 OPENCODE_API_KEY
npm run dev
```

打开 [http://127.0.0.1:3000](http://127.0.0.1:3000)。开发服务器同时提供前端页面和 API，不需要另开 Vite 终端。

生产构建：

```powershell
npm run build
npm start
```

## 操作与规则

- WASD 或方向键移动；
- 点击任意可达物品或 Jev，使用随情境变化的动作菜单互动；
- 最多可连续安排三项行动；打开菜单、记录或队列不会暂停时间；
- 七天会持续推进，Jev 也会独立生活、移动并产生可见后果；
- 第七晚选择续租或搬走，再同时揭晓双方决定；
- 结局后可查看关键判断概率并下载脱敏 JSON。

## Jev / OpenCode Zen

- Endpoint：`https://opencode.ai/zen/v1/systemone`
- Model：`jev-1.13-free`
- Key：优先读取 `OPENCODE_API_KEY`，兼容 `TYPESAFE_API_KEY`
- 不会自动回退到付费 `jev-1.13`

真实探针会依次验证 3 动作、7 动作和 2 个续租选项，只输出脱敏指标：

```powershell
node --env-file=.env scripts/jev-spike.mjs
```

## 架构与隐私

React 负责 HUD、情境菜单、动作队列、思绪记录和结局；Phaser 渲染固定镜头公寓与两名角色的移动/动作；确定性规则维护世界、事件、路径、占用、动作和共同记忆；Fastify 只暴露 `/api/roommate/decision` 与 `/api/health`。Jev 只能选择引擎给出的动作 id，不能生成后果或直接改写世界。

完整会话保存在浏览器 IndexedDB。服务端不保存生活正文；指标只含模型、token、问题数、延迟、重试与错误码。健康检查和导出都不会包含 API Key、IP 或 installation id。模型响应在提交前会重新校验候选与世界版本，过期结果不会执行。

`JEV_MODE=mock` 可用于无网络开发；`SIMULATION_DAY_MS` 只在 mock 模式生效。公开部署可通过 `PUBLIC_MODE`、`KILL_SWITCH`、`REDIS_URL` 与额度变量启用保护。

## 验证

```powershell
npm test
npm run test:spike
npm run typecheck
npm run build
npm run test:e2e
```

产品说明见 [docs/ROOMMATE-EXE-PRD.md](docs/ROOMMATE-EXE-PRD.md)，技术规格见 [docs/ROOMMATE-EXE-TECH-SPEC.md](docs/ROOMMATE-EXE-TECH-SPEC.md)，本轮交互重构设计见 [docs/superpowers/specs/2026-09-29-roommate-exe-autonomous-interaction-design.md](docs/superpowers/specs/2026-09-29-roommate-exe-autonomous-interaction-design.md)。旧 LIFE.EXE 原型文档已归档到 `docs/archive/`。
