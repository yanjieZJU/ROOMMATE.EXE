import { JEV_MODEL } from "../../shared/constants";
import { UsageSchema, type ChoiceAnswer, type Usage } from "../../shared/schemas";
import type { SystemOneRequest, SystemOneResponse } from "./zen";

export type ZenResponseErrorReason = "syntax" | "shape" | "answers" | "choice" | "model";

export class ZenResponseError extends Error {
  constructor(readonly reason: ZenResponseErrorReason) {
    super(`Invalid Jev response: ${reason}`);
    this.name = "ZenResponseError";
  }

  toJSON() {
    return { name: this.name, reason: this.reason };
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function extract(payload: unknown): unknown {
  let value = payload;
  for (let depth = 0; depth < 3 && typeof value === "string"; depth += 1) {
    const stripped = value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    try { value = JSON.parse(stripped); }
    catch { throw new ZenResponseError("syntax"); }
  }
  return value;
}

function choiceId(value: unknown, criteria: Record<string, string>): string | null {
  const ids = Object.keys(criteria);
  if (typeof value === "string" && Object.hasOwn(criteria, value)) return value;
  const labels = typeof value === "string" ? ids.filter((id) => criteria[id] === value) : [];
  if (labels.length === 1) return labels[0]!;
  if (labels.length > 1) throw new ZenResponseError("choice");
  const index = typeof value === "number" ? value : typeof value === "string" && /^\d+$/.test(value) ? Number(value) : Number.NaN;
  return Number.isInteger(index) && index >= 1 && index <= ids.length ? ids[index - 1]! : null;
}

function probabilities(value: unknown, criteria: Record<string, string>): Record<string, number> {
  const input = record(value);
  if (!input) return {};
  const collected: Record<string, number> = {};
  for (const [key, probability] of Object.entries(input)) {
    const id = choiceId(key, criteria);
    if (!id || typeof probability !== "number" || !Number.isFinite(probability) || probability < 0) continue;
    collected[id] = (collected[id] ?? 0) + probability;
  }
  const total = Object.values(collected).reduce((sum, probability) => sum + probability, 0);
  if (total <= 0) return {};
  return Object.fromEntries(Object.entries(collected).map(([id, probability]) => [id, probability / total]));
}

function normalizeAnswer(value: unknown, criteria: Record<string, string>): ChoiceAnswer {
  const input = record(value);
  if (!input) throw new ZenResponseError("shape");
  if (input.type !== undefined && input.type !== "choice") throw new ZenResponseError("shape");
  const choice = choiceId(input.choice, criteria);
  if (!choice) throw new ZenResponseError("choice");
  const confidence = typeof input.confidence === "number" && input.confidence >= 0 && input.confidence <= 1 ? input.confidence : null;
  return { type: "choice", choice, probabilities: probabilities(input.probabilities, criteria), confidence };
}

export function normalizeZenResponse(payload: unknown, request: SystemOneRequest): SystemOneResponse {
  const input = record(extract(payload));
  if (!input) throw new ZenResponseError("shape");
  if (input.model !== JEV_MODEL) throw new ZenResponseError("model");
  const answers = record(input.answers);
  if (!answers) throw new ZenResponseError("answers");
  const requestedKeys = Object.keys(request.questions).sort();
  const answerKeys = Object.keys(answers).sort();
  if (requestedKeys.length !== answerKeys.length || requestedKeys.some((key, index) => key !== answerKeys[index])) throw new ZenResponseError("answers");

  const normalized: Record<string, ChoiceAnswer> = {};
  for (const key of requestedKeys) normalized[key] = normalizeAnswer(answers[key], request.questions[key]!.criteria);
  const usage: Usage = UsageSchema.safeParse(input.usage).success ? UsageSchema.parse(input.usage) : {};
  return { model: JEV_MODEL, answers: normalized, usage };
}
