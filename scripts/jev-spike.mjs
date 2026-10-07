import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";

export const ZEN_URL = "https://opencode.ai/zen/v1/systemone";
export const FREE_MODEL = "jev-1.13-free";

const ACTIONS = [
  ["cook_for_both", "为两个人做饭，需要消耗食材和时间"],
  ["eat_last_meal", "吃掉最后一份现成晚餐，立即缓解饥饿"],
  ["order_food", "自己点餐，需要花钱并等待"],
  ["ask_roommate", "先询问室友如何分配晚餐，会打断双方当前行动"],
  ["leave_note", "在留言板写下食物安排，不保证立刻得到回应"],
  ["clean_kitchen", "先清理厨房，暂时保持饥饿"],
  ["return_to_room", "回到自己的房间休息，不处理公共食物"],
];

const LEASE = [
  ["renew", "继续与当前室友合租下一期"],
  ["leave", "租约结束后搬走"],
];

export function buildScenario({ kind, candidateCount }) {
  const source = kind === "lease" ? LEASE : ACTIONS;
  if (!Number.isInteger(candidateCount) || candidateCount < 2 || candidateCount > source.length) {
    throw new TypeError("候选数量超出探针范围");
  }
  const candidates = source.slice(0, candidateCount);
  return {
    model: FREE_MODEL,
    state: {
      语言: "中文",
      当前日期: kind === "lease" ? "第七天夜晚" : "第二天晚上",
      当前公开事件: kind === "lease" ? "租约今晚到期" : "冰箱里只剩最后一份晚餐",
      可观察事实: ["玩家刚回到公寓", "Jev 有些饥饿", "厨房可以正常使用"],
      相关共同事实: ["昨天玩家整理了公共区域", "双方还没有约定食物分配规则"],
      尚未解决事项: ["晚餐归属尚未解决"],
    },
    questions: {
      roommateDecision: {
        type: "choice",
        instructions: kind === "lease"
          ? "只根据七日共同生活事实，判断 Jev 会续租还是搬走。"
          : "只根据可观察事实，选择 Jev 现在最可能实际执行的一个动作。",
        criteria: Object.fromEntries(candidates),
      },
    },
  };
}

function summarize(answer) {
  const probabilities = answer.probabilities;
  const ordered = Object.entries(probabilities).sort((left, right) => right[1] - left[1]);
  return {
    selected: answer.choice,
    confidence: answer.confidence,
    topProbability: ordered[0]?.[1] ?? null,
    probabilitySpread: ordered.length > 1 ? ordered[0][1] - ordered.at(-1)[1] : 0,
  };
}

function validatePayload(payload, candidateIds) {
  if (payload.model !== FREE_MODEL) return null;
  const answer = payload.answers?.roommateDecision;
  if (!answer || !candidateIds.includes(answer.choice)) return null;
  const probabilityIds = Object.keys(answer.probabilities ?? {});
  if (probabilityIds.length !== candidateIds.length || candidateIds.some((id) => !probabilityIds.includes(id))) return null;
  const values = Object.values(answer.probabilities);
  if (!values.every((value) => Number.isFinite(value) && value >= 0 && value <= 1)) return null;
  if (Math.abs(values.reduce((sum, value) => sum + value, 0) - 1) > 1e-6) return null;
  return answer;
}

export async function runTier({
  kind,
  candidateCount,
  fetchImpl = globalThis.fetch,
  apiKey = process.env.OPENCODE_API_KEY || process.env.TYPESAFE_API_KEY,
} = {}) {
  const base = { kind, candidateCount, model: FREE_MODEL, retryCount: 0 };
  if (!apiKey) return { ...base, ok: false, status: 0, elapsedMs: 0, error: "未配置 OpenCode API Key" };

  const request = buildScenario({ kind, candidateCount });
  const candidateIds = Object.keys(request.questions.roommateDecision.criteria);
  const idempotencyKey = `roommate-spike/${kind}/${candidateCount}/${randomUUID()}`;
  const startedAt = performance.now();
  let attempts = 0;

  while (attempts < 2) {
    try {
      const response = await fetchImpl(ZEN_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify(request),
      });
      if ((response.status === 429 || response.status === 529) && attempts === 0) {
        attempts += 1;
        continue;
      }
      const elapsedMs = Math.round((performance.now() - startedAt) * 100) / 100;
      if (!response.ok) return { ...base, retryCount: attempts, ok: false, status: response.status, elapsedMs, error: `Provider HTTP ${response.status}` };
      const payload = await response.json();
      const answer = validatePayload(payload, candidateIds);
      if (!answer) return { ...base, retryCount: attempts, ok: false, status: response.status, elapsedMs, error: "Provider 返回结构不完整" };
      return {
        ...base,
        retryCount: attempts,
        ok: true,
        status: response.status,
        elapsedMs,
        responseModel: payload.model,
        usage: payload.usage ?? null,
        answerCount: 1,
        distribution: summarize(answer),
      };
    } catch {
      if (attempts === 0) {
        attempts += 1;
        continue;
      }
      return {
        ...base,
        retryCount: attempts,
        ok: false,
        status: 0,
        elapsedMs: Math.round((performance.now() - startedAt) * 100) / 100,
        error: "网络或请求格式错误",
      };
    }
  }
}

export async function runProbe(options = {}) {
  const tiers = [];
  for (const tier of [
    { kind: "action", candidateCount: 3 },
    { kind: "action", candidateCount: 7 },
    { kind: "lease", candidateCount: 2 },
  ]) {
    const result = await runTier({ ...options, ...tier });
    tiers.push(result);
    if (!result.ok) break;
  }
  return { schemaVersion: "roommate-exe/jev-spike-1", createdAt: new Date().toISOString(), endpoint: ZEN_URL, tiers };
}

async function main() {
  const result = await runProbe();
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const artifactDir = path.resolve(scriptDir, "../artifacts");
  await mkdir(artifactDir, { recursive: true });
  const artifactPath = path.join(artifactDir, `roommate-jev-spike-${result.createdAt.replaceAll(":", "-")}.json`);
  await writeFile(artifactPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  for (const tier of result.tiers) {
    const state = tier.ok ? `${tier.answerCount} answer` : tier.error;
    console.log(`${tier.kind}:${tier.candidateCount} — ${tier.status} — ${tier.elapsedMs}ms — ${state}`);
  }
  console.log(`artifact: ${artifactPath}`);
  if (result.tiers.some((tier) => !tier.ok)) process.exitCode = 1;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) await main();
