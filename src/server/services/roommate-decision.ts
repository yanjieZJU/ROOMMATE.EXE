import { JEV_MODEL } from "../../shared/constants";
import {
  DecisionSnapshotSchema,
  RoommateDecisionSchema,
  type DecisionSnapshot,
  type RoommateDecision,
} from "../../shared/roommate-schemas";
import { hashDecisionState } from "../../game/simulation/state-hash";
import { AppError } from "../errors";
import type { SystemOneRequest, ZenClient } from "../providers/zen";

function buildRequest(snapshot: DecisionSnapshot): SystemOneRequest {
  return {
    state: {
      语言: "中文",
      当前日期: `第${snapshot.day}天`,
      当前公开事件: snapshot.publicEvent,
      可观察事实: snapshot.observableState,
      相关共同事实: snapshot.relevantFacts.map((fact) => fact.text),
      尚未解决事项: snapshot.commitments.map((commitment) => commitment.text),
    },
    questions: {
      roommateAction: {
        type: "choice",
        instructions: "只根据这些可观察事实，选择 Jev 现在最可能实际执行的一个动作。不要补充新动作或后果。",
        criteria: Object.fromEntries(snapshot.candidates.map((candidate) => [
          candidate.id,
          `${candidate.label}。已知代价：${candidate.knownCostText}`,
        ])),
      },
    },
  };
}

function validateAnswer(snapshot: DecisionSnapshot, response: Awaited<ReturnType<ZenClient["evaluate"]>>) {
  if (response.model !== JEV_MODEL) {
    throw new AppError("PROVIDER_INVALID_RESPONSE", "Jev 返回了非免费模型结果", false);
  }
  const answer = response.answers.roommateAction;
  const candidateIds = snapshot.candidates.map((candidate) => candidate.id);
  if (!answer || !candidateIds.includes(answer.choice)) {
    throw new AppError("PROVIDER_INVALID_RESPONSE", "Jev 返回了候选集合之外的动作", false);
  }
  const probabilityIds = Object.keys(answer.probabilities);
  if (probabilityIds.some((id) => !candidateIds.includes(id)) || (probabilityIds.length > 0 && !Object.hasOwn(answer.probabilities, answer.choice))) {
    throw new AppError("PROVIDER_INVALID_RESPONSE", "Jev 返回的动作概率无效", false);
  }
  return answer;
}

export async function decideRoommateAction(snapshotInput: DecisionSnapshot, client: ZenClient): Promise<RoommateDecision> {
  const parsed = DecisionSnapshotSchema.safeParse(snapshotInput);
  if (!parsed.success) throw new AppError("INVALID_INPUT", "室友判断快照格式无效", false);
  const snapshot = parsed.data;
  const actualHash = await hashDecisionState(snapshot);
  if (actualHash !== snapshot.stateHash) {
    throw new AppError("SESSION_CONFLICT", "室友判断快照已发生变化", false);
  }

  const request = buildRequest(snapshot);
  const baseKey = `roommate/${snapshot.decisionPointId}/${snapshot.stateHash}`;
  let response: Awaited<ReturnType<ZenClient["evaluate"]>> | undefined;
  let answer: ReturnType<typeof validateAnswer> | undefined;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const repair = attempt === 1;
    const attemptRequest = repair ? {
      ...request,
      questions: {
        ...request.questions,
        roommateAction: {
          ...request.questions.roommateAction!,
          instructions: `${String(request.questions.roommateAction!.instructions)} 仅返回一个候选 id；不要添加解释或代码块。`,
        },
      },
    } : request;
    try {
      response = await client.evaluate(attemptRequest, {
        idempotencyKey: repair ? `${baseKey}/repair` : baseKey,
        maxAttempts: 2,
      });
      answer = validateAnswer(snapshot, response);
      break;
    } catch (error) {
      if (!(error instanceof AppError) || error.code !== "PROVIDER_INVALID_RESPONSE" || repair) throw error;
    }
  }
  if (!response || !answer) throw new AppError("PROVIDER_INVALID_RESPONSE", "Jev 返回了无法识别的结果", false);
  const decision = {
    id: `${snapshot.decisionPointId}:${snapshot.stateHash.slice(0, 12)}`,
    decidedAt: new Date().toISOString(),
    stateHash: snapshot.stateHash,
    selectedActionId: answer.choice,
    probabilities: answer.probabilities,
    confidence: answer.confidence,
    model: response.model,
    usage: response.usage,
    snapshot,
  };
  const validated = RoommateDecisionSchema.safeParse(decision);
  if (!validated.success) throw new AppError("PROVIDER_INVALID_RESPONSE", "Jev 返回的判断结构无效", false);
  return validated.data;
}
