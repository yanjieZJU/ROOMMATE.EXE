# LIFE.EXE 技术设计与开发指南

> 版本：0.2  
> 日期：2026-09-24  
> 状态：待批注  
> 对应 PRD：`docs/LIFE-EXE-PRD.md`

## 1. 技术目标

实现一个可公开访问、默认不持久化用户内容的 Web 应用。服务端安全代理 TypeSafe Jev 与一个可替换的辅助多模态模型；浏览器负责会话状态、灰度画布渲染、快照、长卷和导出。

核心可验证链路：

```text
导演确认事件与三个行动
  → Jev 选择行动
  → 应用预锁定后果
  → 辅助模型返回受影响语义像素
  → Jev 批量判断 darken / preserve / fade
  → 固定公式更新灰度
  → 原子保存快照
```

## 2. 外部能力与边界

### 2.1 OpenCode Zen / Jev

使用 `POST https://opencode.ai/zen/v1/systemone`，模型固定为 `jev-1.13-free`。服务端使用 OpenCode Zen API Key，通过 `Authorization: Bearer <KEY>` 调用。请求与响应仍遵循 TypeSafe System One 的 `state + questions → answers` 结构。

`jev-1.13-free` 在 OpenCode Zen 当前价目中免费，但官方将其描述为限时免费型号。实现不得自动回退到付费的 `jev-1.13`；模型不可用时应暂停本轮并显示可重试错误。切换任何其他模型必须显式修改服务端配置，并记录到实验元数据。

MVP 只使用 `Choice`：

- 每轮 1 个行动 Choice；
- 首帧最多 576 个初始像素 Choice；
- 后续每轮约 60–150 个像素变化 Choice。

Jev 只接受文本或 JSON，不接收图片。所有问题对同一状态独立评估，因此坐标、语义角色和当前灰度必须写入每个像素问题的 `instructions`，不能依赖问题 key 传递语义。

参考：

- [OpenCode Zen：Jev endpoint、model id 与鉴权](https://opencode.ai/docs/en/zen/)
- [TypeSafe API reference](https://docs.typesafe.ai/api)
- [State](https://docs.typesafe.ai/concepts/state)
- [Choice](https://docs.typesafe.ai/primitives/choice)
- [Parallel questions](https://docs.typesafe.ai/cookbooks/parallel_questions)

### 2.2 辅助模型

通过统一 `AuxiliaryModelAdapter` 接口访问，不在业务逻辑中耦合具体供应商。

职责：

- 安全检查自由输入；
- 从可选照片提取允许的可见外观属性；
- 生成初始 24×24 语义蓝图；
- 生成或整理事件卡；
- 生成三个候选行动、自然语言代价和确定后果；
- 为行动生成中性行为向量；
- 在行动执行后返回受影响的语义像素集合。

禁止辅助模型：

- 替 Jev 选择行动；
- 根据 Jev 结果事后修改已锁定后果；
- 直接输出最终像素灰度；
- 根据照片推断人格、身份或敏感属性。

## 3. 推荐技术栈

为 MVP 建议使用：

- 前端：React + TypeScript + Vite；
- 后端：Node.js + TypeScript + Fastify；
- Schema：Zod；
- 画布：Canvas 2D API，关闭抗锯齿并按整数倍缩放；
- 本地持久化：IndexedDB；
- ZIP 导出：JSZip；
- 单元测试：Vitest；
- 端到端测试：Playwright；
- 公网限额：Redis 兼容存储；本地开发使用内存实现。

前后端可以部署为同一 Node 服务。不得把任何提供商 Key 编译进前端资源。

## 4. 组件边界

```text
Browser
├─ Director UI
├─ Session reducer
├─ Pixel canvas renderer
├─ Snapshot / scroll composer
├─ IndexedDB repository
└─ Exporter

Server
├─ HTTP API
├─ Session request validator
├─ Quota and budget guard
├─ Auxiliary model adapter
├─ OpenCode Zen Jev adapter
├─ Decision orchestrator
├─ Pixel batch orchestrator
└─ Anonymous metrics logger
```

### 4.1 浏览器职责

- 保存用户内容和完整人生记录；
- 展示并编辑事件与候选行动；
- 渲染 24×24 灰度画布；
- 对比快照；
- 组合人生长卷；
- 导入和导出实验文件；
- 只在完整轮次结束后提交本地事务。

### 4.2 服务端职责

- 保存 API Key；
- 验证所有请求 Schema 和大小；
- 执行配额、预算与并发限制；
- 调用辅助模型和 Jev；
- 验证模型结构化输出；
- 计算 Choice 到灰度的确定性映射；
- 返回原子结果，不长期保存用户正文。

## 5. 核心数据模型

以下为逻辑 Schema，实际实现使用 Zod 与 TypeScript 类型共同定义。

### 5.1 Session

```ts
interface LifeSession {
  schemaVersion: "life-exe/1";
  id: string;
  createdAt: string;
  updatedAt: string;
  status: "setup" | "playing" | "complete";
  seed: string;
  protagonist: Protagonist;
  world: WorldState;
  blueprint: SemanticBlueprint;
  canvas: SemanticCanvas | null; // 初始像素 Choice 成功后生成
  turns: Turn[];
  currentAct: 1 | 2 | 3;
  currentTurn: number; // 0..9
  experiment: ExperimentMetadata;
}
```

### 5.2 Protagonist

```ts
interface Protagonist {
  displayName: string;
  source: "anonymous" | "photo";
  appearance: {
    silhouette: string;
    hair: string | null;
    eyewear: string | null;
    clothing: string | null;
  };
}
```

不得保存原始照片、照片 URL、base64 或可逆的人脸嵌入。

### 5.3 WorldState

```ts
interface WorldState {
  resources: {
    level: number;          // 0..100，内部使用
    facts: string[];        // 提供给 Jev 的中文事实
  };
  energy: number;           // 0..100
  relationships: Array<{
    id: string;
    name: string;
    strength: number;       // -100..100，内部使用
    facts: string[];
  }>;
  opportunities: Array<{
    id: string;
    label: string;
    facts: string[];
  }>;
  memory: string[];         // 只记录已发生事实，不含人格总结
}
```

发给 Jev 的状态使用事实描述，不暴露内部数值和行为向量。

### 5.4 Event 和 Action

```ts
interface LifeEvent {
  id: string;
  act: 1 | 2 | 3;
  title: string;
  premise: string;
  participants: string[];
  source: "curated" | "generated" | "custom";
  actions: [CandidateAction, CandidateAction, CandidateAction];
  lockedAt: string | null;
  lockedHash: string | null;
}

interface CandidateAction {
  id: string;
  label: string;
  actionText: string;
  knownCostText: string;
  consequence: Consequence;
  behaviorVector: {
    risk: number;           // -1 谨慎，+1 冒险
    relation: number;       // -1 自我保护，+1 关系投入
    convention: number;     // -1 遵循规则，+1 灵活变通
    immediacy: number;      // -1 延迟观察，+1 立即行动
  };
}

interface Consequence {
  summary: string;
  stateDelta: {
    resources?: number;
    energy?: number;
    relationships?: Array<{ id: string; delta: number; fact: string }>;
    addOpportunities?: Array<{ id: string; label: string; facts: string[] }>;
    removeOpportunityIds?: string[];
  };
  newFacts: string[];
}
```

锁定时对规范化事件、三个行动、后果和行为向量计算 SHA-256。Jev 返回后再次校验 hash，防止并发编辑或重试时问题漂移。

### 5.5 SemanticCanvas

```ts
interface SemanticBlueprint {
  width: 24;
  height: 24;
  compositionSummary: string;
  regions: Array<{
    id: string;
    label: string;
    narrativeRole: string;
  }>;
  cells: BlueprintCell[];   // 固定 576 项，row-major，无灰度
}

interface BlueprintCell {
  x: number;                // 0..23
  y: number;                // 0..23
  regionId: string;
  semanticRole: string;
}

interface SemanticCanvas extends Omit<SemanticBlueprint, "cells"> {
  cells: PixelCell[];       // 初始像素 Choice 后生成，固定 576 项
}

interface PixelCell {
  x: number;                // 0..23
  y: number;                // 0..23
  regionId: string;
  semanticRole: string;
  darkness: number;         // 0 白，1 黑
}
```

### 5.6 Turn

```ts
interface Turn {
  index: number;            // 1..9
  act: 1 | 2 | 3;
  event: LifeEvent;
  actionDecision: {
    selectedActionId: string;
    probabilities: Record<string, number>;
    confidence: number;
    model: string;
    usage: Usage;
  };
  appliedConsequence: Consequence;
  affectedCellIds: string[];
  pixelDecisions: Record<string, PixelDecision>;
  frameBefore: number[];    // 576 个 darkness；实现可做增量压缩
  frameAfter: number[];
  completedAt: string;
}

interface PixelDecision {
  probabilities: {
    darken: number;
    preserve: number;
    fade: number;
  };
  selected: "darken" | "preserve" | "fade";
  confidence: number;
}
```

## 6. API 设计

所有写请求设置最大 body，拒绝未知字段，并返回稳定错误码。

### 6.1 `POST /api/aux/blueprint`

输入：可选临时照片、角色类型和可选显示名。未上传照片时使用匿名角色模板。  
输出：`Protagonist.appearance` 与 `SemanticBlueprint`。蓝图不包含任何灰度；初始 `SemanticCanvas` 由后续 Jev `ink / paper` Choice 生成。

要求：

- MIME 与魔数双重验证；
- 尺寸和文件大小上限；
- 不写入磁盘或日志；
- 请求结束释放 buffer；
- 失败时返回匿名角色蓝图。

### 6.2 `POST /api/events/suggest`

输入：幕、轮次、世界事实、最近事件摘要。  
输出：三张标准事件卡。

### 6.3 `POST /api/events/structure`

输入：导演选择或自由输入的事件。  
输出：三个候选行动、自然语言代价、确定后果和行为向量。

修改任一候选行动后必须重新调用此接口，不能沿用旧后果。

### 6.4 `POST /api/decisions/action`

输入：锁定事件、事实世界状态、历史事实。  
输出：Jev Choice 原始答案的验证后子集。

服务端请求示意：

```json
{
    "model": "jev-1.13-free",
  "state": {
    "主角": "UNTITLED_01",
    "已经发生的事实": ["……"],
    "当前处境": {"资源": "……", "精力": "……", "关系": ["……"], "机会": ["……"]},
    "本轮事件": "……"
  },
  "questions": {
    "action": {
      "type": "choice",
      "instructions": "在给定处境下，主角最可能采取哪个行动？请选择一个。",
      "criteria": {
        "action_1": "行动文本。已知代价：……",
        "action_2": "行动文本。已知代价：……",
        "action_3": "行动文本。已知代价：……"
      }
    }
  }
}
```

不得把行为向量、内部数值或最终指纹放入 Jev state。

### 6.5 `POST /api/canvas/affected-cells`

输入：语义蓝图、本轮事件、被选行动、锁定后果。  
输出：去重后的 cell id 集合和每格更新语义。

验证规则：

- cell 必须存在于当前 24×24 蓝图；
- 默认期望 60–150 格；
- 0 格需要辅助模型重试一次；
- 超过配置上限时按语义区域重要度裁剪，而不是随机裁剪；
- 辅助模型不得提供新的灰度值。

### 6.6 `POST /api/decisions/pixels`

输入：`mode: "initialize" | "evolve"`、初始化模式下的语义蓝图或演化模式下的当前画布、目标 cells，以及演化模式下的本轮事件与事实后果。  
输出：每个 cell 的三项概率、新灰度和调用元数据。

初始化模式覆盖全部 576 格并使用 `ink / paper`；演化模式只覆盖受影响格并使用 `darken / preserve / fade`。

每个问题必须在 instructions 中显式包含坐标和语义：

```json
{
  "type": "choice",
  "instructions": {
    "question": "本轮事件后，画布坐标 (7, 12) 应该如何变化？",
    "cell": {
      "region": "主角与朋友之间的道路",
      "semantic_role": "表现两人关系是否仍然连接",
      "current_darkness": 0.42
    },
    "event": "朋友深夜请求借钱",
    "chosen_action": "拒绝借钱，但让朋友留下过夜",
    "consequence": "资源没有减少，两人的关系保持但出现距离",
    "composition": "主角位于中央，朋友位于右侧，道路连接两人"
  },
  "criteria": {
    "darken": "该视觉含义被本轮事件强化，应留下更深的痕迹",
    "preserve": "该视觉含义仍然维持，应尽量保持原有深度",
    "fade": "该视觉含义正在远去或减弱，应留下更浅的痕迹"
  }
}
```

问题 key 使用 `px_y12_x07`，但不得假设 key 会参与模型推理。

## 7. 灰度算法

### 7.1 后续帧

`darkness` 定义为 `0 = 白，1 = 黑`。固定步长由版本配置：

```ts
const PIXEL_STEP = 0.28;

next = clamp01(
  previous + PIXEL_STEP * (pDarken - pFade)
);
```

`preserve` 不直接参与公式；它通过减少 `pDarken + pFade` 自然降低变化幅度。

所有计算使用完整精度保存，渲染时量化为五档：

```text
0.00, 0.25, 0.50, 0.75, 1.00
```

量化只影响显示和 PNG，不覆盖实验 JSON 中的原始值。

### 7.2 初始帧

初始蓝图没有历史灰度。对 576 格使用二选一 Choice：

- `ink`：该格需要承担构图或叙事信息；
- `paper`：该格应保留为空白。

初始 `darkness = P(ink)`，显示时同样量化为五档。

如果 576 个问题无法在单次请求内稳定处理，按固定 row-major 顺序分批。每个问题独立，分批不得改变问题内容。

## 8. 行为指纹算法

每轮每条轴计算概率加权值：

```ts
turnAxis = sum(
  actionProbability[actionId] * action.behaviorVector[axis]
);
```

九轮指纹：

```ts
sessionAxis = average(turnAxis[1..9]);
```

导出时同时保存：

- 加权后的四轴值；
- 每轮值；
- 每个行动原始向量与概率；
- 辅助模型版本。

若导演修改过候选行动，界面在最终指纹旁标记“候选行动曾由导演编辑”。

## 9. 本地持久化与原子性

### 9.1 IndexedDB stores

- `sessions`：会话元数据与当前完整状态；
- `frames`：按 `sessionId + turnIndex` 保存灰度数组；
- `exports`：可选保存最近一次生成的 Blob 元数据，不长期保存大文件。

### 9.2 提交规则

一轮只有在以下全部完成后才成为 committed：

1. 行动 Choice 验证通过；
2. 锁定后果应用成功；
3. 受影响 cells 验证通过；
4. 所有像素批次成功；
5. 新灰度数组完整；
6. Turn 与 frame 在同一 IndexedDB transaction 写入。

中断恢复时只显示最后一个 committed turn。未完成调用可以基于相同锁定输入重试。

## 10. 批处理、重试与幂等

### 10.1 Pixel batching

配置项：

```text
PIXEL_BATCH_SIZE=96        # 2026-09-28 真实探针验证
PIXEL_BATCH_CONCURRENCY=1  # 免费模型采用保守串行批处理
PIXEL_MAX_AFFECTED=160
```

每个批次使用稳定的 `sessionId / turn / batchIndex / lockedHash` 作为幂等键。服务端最多缓存 15 分钟的验证后输出，避免前端超时重试造成重复付费；缓存不得保存原始照片、用户输入正文或完整 provider 请求体。

### 10.2 Retry

- `429` 与 `529`：指数退避并尊重重试头；
- 网络错误与超时：最多重试两次；
- `401`、`403`、`422`：不自动重试；
- 部分像素批次永久失败：本轮不提交，保留上一帧。

禁止使用模拟概率、随机值或辅助模型结果代替失败的 Jev 调用。

## 11. 配额与预算

### 11.0 运行配置

至少通过服务端环境变量配置：

```text
OPENCODE_API_KEY
TYPESAFE_API_KEY             # 仅兼容当前本地 .env；OPENCODE_API_KEY 优先
JEV_API_URL=https://opencode.ai/zen/v1/systemone
JEV_MODEL=jev-1.13-free
AUX_BASE_URL
AUX_API_KEY
AUX_MODEL
DAILY_BUDGET_USD
INSTALLATION_DAILY_SESSIONS
REDIS_URL
```

辅助模型实现使用 OpenAI-compatible 的多模态、结构化输出接口作为首个适配器；具体供应商和模型由 `AUX_BASE_URL` 与 `AUX_MODEL` 决定，不写死在业务代码中。

Jev adapter 读取 Key 的优先级为 `OPENCODE_API_KEY` → `TYPESAFE_API_KEY`。兼容变量只用于迁移现有本地 `.env`，新环境统一使用 `OPENCODE_API_KEY`。启动日志只能输出“已配置／未配置”，不得输出 Key 内容。

### 11.1 Guard 顺序

每个付费请求依次检查：

1. 全站 kill switch；
2. 每日预算剩余；
3. 匿名浏览器额度；
4. IP 级速率限制；
5. 会话并发锁；
6. 预计问题数量与 body 大小。

### 11.2 匿名标识

浏览器生成随机 installation id，服务端只保存 HMAC 后的限额 key。不得使用稳定指纹技术。IP 只用于短窗口限流，不长期保存明文。

### 11.3 成本核算

每个外部调用记录：

- provider 和 resolved model；
- input/output token；
- 问题数量；
- 延迟；
- 重试次数；
- 估算成本；
- 成功／错误类型。

日志不包含用户正文。

## 12. 导出格式

### 12.1 PNG

- 使用 Canvas 离线组合九帧；
- 固定像素缩放倍率；
- 包含标题、主角名称、九个行动短标签和实验 id 前缀；
- 不包含概率详情和 API 元数据。

### 12.2 ZIP

```text
life-exe-<session-id>/
├─ scroll.png
├─ frame-01.png
├─ ...
├─ frame-09.png
└─ experiment.json
```

### 12.3 Experiment JSON

必须包含：

- schemaVersion；
- seed；
- model alias 与 resolved model；
- 辅助模型版本；
- 所有事件、行动、锁定 hash 与后果；
- 行动 Choice 完整概率；
- 像素 Choice 完整概率；
- 每帧原始灰度；
- 公式版本与 `PIXEL_STEP`；
- 行为向量与最终指纹；
- token、延迟和错误重试摘要。

不得包含 API Key、原始照片、IP、配额标识或服务端日志 id。

## 13. 重跑语义

导入实验 JSON 并选择“再活一次”时固定：

- 主角允许保存的外观属性；
- 初始语义蓝图；
- 九个事件；
- 三个候选行动；
- 所有确定后果；
- 行为向量；
- 每轮受影响 cell 集合；
- 灰度公式版本。

重新调用：

- 九个行动 Choice；
- 初始像素 Choice；
- 每轮受影响像素 Choice。

因此第二次运行可能从首帧开始产生不同画面。结果页比较每轮选择、概率差和最终指纹，不把差异解释为性格改变。

## 14. 安全与隐私

### 14.1 图片

- 接收前端压缩后的有限尺寸图片；
- 验证 MIME、魔数和像素尺寸；
- 内存中处理，不落盘；
- 不写日志、trace 或错误 payload；
- 完成或失败后立即释放；
- 辅助模型输出通过敏感属性字段黑名单验证。

### 14.2 文本

- 事件与行动设置字符上限；
- 自由输入先通过安全检查；
- 防止将用户文本拼接为系统指令；
- 所有模型响应按 Schema 解析，不执行生成代码或 HTML；
- 前端只使用文本节点显示用户和模型内容。

### 14.3 Secrets

- 使用环境变量或部署平台 secret store；
- 不在浏览器、本地导出、错误消息或 telemetry 中返回；
- 日志中对 Authorization 和可能的 provider payload 做结构化拦截。

## 15. 错误模型

统一响应：

```ts
interface ApiError {
  error: {
    code:
      | "INVALID_INPUT"
      | "CONTENT_BLOCKED"
      | "QUOTA_EXCEEDED"
      | "BUDGET_EXCEEDED"
      | "PROVIDER_UNAVAILABLE"
      | "PROVIDER_INVALID_RESPONSE"
      | "SESSION_CONFLICT"
      | "PIXEL_BATCH_INCOMPLETE";
    message: string;
    retryable: boolean;
    retryAfterSeconds?: number;
  };
}
```

前端不得显示原始 provider 错误体。

## 16. 测试策略

### 16.1 单元测试

- 世界状态 delta 与边界裁剪；
- 行动锁定 hash；
- 灰度公式、clamp 和五档显示量化；
- 行为指纹概率加权；
- 九帧长卷尺寸和顺序；
- JSON 导入导出往返一致；
- 隐私字段不会进入持久化或日志对象。

### 16.2 Contract tests

- Jev request 符合 API Schema；
- action Choice 与 pixel Choice 响应解析；
- 辅助模型四类结构化响应；
- 429、529、超时、422 和部分批次失败；
- provider model alias 与 resolved model 均被记录。

### 16.3 集成测试

- 匿名角色完整九轮；
- 照片处理后原始 buffer 不可恢复；
- 修改行动后旧后果失效；
- 刷新后从最后 committed turn 恢复；
- 达到额度与预算上限时阻止付费请求；
- 重跑固定实验内容但重新调用 Jev。

### 16.4 E2E

- 首次用户在 30 秒内进入第一轮；
- 键盘和移动触控均可完成；
- 打字机动画可跳过；
- 前后滑杆可访问；
- PNG、ZIP、JSON 均可下载并再次导入。

## 17. 可访问性

- 所有功能可用键盘完成；
- 老式窗口视觉不能替代语义化 HTML；
- 灰度对比满足正文可读性要求；
- 闪烁光标不超过高频闪烁阈值，并尊重 `prefers-reduced-motion`；
- 打字机区域使用完成后的完整文本更新无障碍名称，避免读屏逐字播报；
- Canvas 提供结构化文本替代，描述人物、场景和本轮事实变化。

## 18. 技术验证门槛

正式实现完整 UI 前，必须用真实 Jev Key 完成一次一次性验证：

1. OpenCode Zen 的 `jev-1.13-free` 是否接受 24×24 初始帧的 576 个二选一 Choice；
2. 单次 96、150 个三选一 Choice 的延迟、token 和错误率；
3. 同一像素问题重复 10 次的概率波动；
4. 分批与单批结果是否在可接受噪声内；
5. 中文语义 cell 描述能否产生非退化灰度分布；
6. 九轮预计总成本是否符合公开额度。

通过标准：

- 没有未记录的响应字段或 Schema 漂移；
- 150 个像素问题在产品等待上限内完成；
- 不出现几乎所有 cell 永远选择同一动作的退化；
- 失败可通过限定重试恢复；
- 单局成本能被配置的匿名额度覆盖。

若 24×24 不通过，按以下顺序降级：

1. 减小每批并发和批次大小；
2. 将受影响区域上限降至 96；
3. 将逻辑画布降至 16×16；
4. 不得用辅助模型直接生成灰度冒充 Jev 结果。

### 18.1 2026-09-28 探针结论

使用 `jev-1.13-free` 实测：1、96、150 个 Choice 均返回 HTTP 200 且答案数完整；单次 576 个 Choice 返回 HTTP 400。MVP 因此保留 24×24 逻辑画布，但初始 576 格固定按 row-major 拆为 6 个 96 格批次，并将并发设为 1。受影响区域仍允许最多 150 格，由同样的 96 格批次串行处理。探针输出只记录状态、延迟、usage 和分布摘要，不记录 Key 或请求正文。

## 19. 推荐开发顺序

1. **API spike**：验证 Jev 批量 Choice、延迟、成本和退化情况。
2. **纯数据内核**：Schema、事件锁定、世界 delta、灰度公式、指纹算法。
3. **模拟 provider 闭环**：九轮流程、本地恢复、长卷和导出，不接真实模型。
4. **OpenCode Zen Jev adapter**：行动与像素 Choice、重试、幂等和 usage。
5. **Auxiliary adapter**：事件、行动、蓝图、affected cells 与安全检查。
6. **主 UI**：老式窗口、打字机、选项确认、等待状态和滑杆。
7. **公开保护**：额度、预算、限流、指标和 kill switch。
8. **真实端到端验证**：匿名角色、照片角色、自由事件、重跑和失败恢复。

## 20. 上线检查

- OpenCode Zen 与辅助模型 Key 只存在于服务端；
- kill switch、每日预算和浏览器额度均已验证；
- 照片、事件正文和行动正文不进入日志；
- 隐私说明和“非心理测评”说明可见；
- 完成真实九轮成本测量；
- 导出 JSON 可在干净浏览器中导入；
- provider 故障不会发布半轮状态；
- 移动端可以完成全流程；
- `prefers-reduced-motion` 生效；
- 当前模型 alias 与 resolved model 正确记录。
