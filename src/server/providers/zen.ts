import { JEV_API_URL, JEV_MODEL } from "../../shared/constants";
import type { ChoiceAnswer, Usage } from "../../shared/schemas";
import type { AppConfig } from "../config";
import { AppError } from "../errors";
import { normalizeZenResponse, ZenResponseError } from "./zen-response-adapter";

export interface ChoiceQuestion {
  type: "choice";
  instructions: string | Record<string, unknown>;
  criteria: Record<string, string>;
}

export interface SystemOneRequest {
  state: unknown;
  questions: Record<string, ChoiceQuestion>;
}

export interface SystemOneResponse {
  model: string;
  answers: Record<string, ChoiceAnswer>;
  usage: Usage;
}

export interface ZenClient {
  evaluate(request: SystemOneRequest, options?: { idempotencyKey?: string; maxAttempts?: number }): Promise<SystemOneResponse>;
}

const retryableStatuses = new Set([429, 529]);
const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function providerError(status: number, retryAfterSeconds?: number) {
  if (status === 422) return new AppError("PROVIDER_INVALID_RESPONSE", "Jev 拒绝了请求结构", false);
  if (retryableStatuses.has(status)) {
    return new AppError("PROVIDER_UNAVAILABLE", "Jev 暂时不可用，请稍后重试", true, retryAfterSeconds);
  }
  return new AppError("PROVIDER_UNAVAILABLE", "Jev 服务不可用", false);
}

export function createZenClient(config: AppConfig, fetchImpl: typeof fetch = globalThis.fetch): ZenClient {
  return {
    async evaluate(request, options = {}) {
      if (!config.jev.apiKey) throw new AppError("PROVIDER_UNAVAILABLE", "Jev 尚未配置", false);
      if (config.jev.apiUrl !== JEV_API_URL || config.jev.model !== JEV_MODEL) {
        throw new AppError("PROVIDER_UNAVAILABLE", "Jev 免费模型配置不符合 ROOMMATE.EXE 安全约束", false);
      }

      const maxAttempts = options.maxAttempts ?? 3;
      if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 5) {
        throw new AppError("INVALID_INPUT", "Jev 尝试次数必须是 1 到 5 之间的整数", false);
      }

      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        try {
          const response = await fetchImpl(JEV_API_URL, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${config.jev.apiKey}`,
              "Content-Type": "application/json",
              ...(options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {}),
            },
            body: JSON.stringify({ model: JEV_MODEL, state: request.state, questions: request.questions }),
            signal: AbortSignal.timeout(30_000),
          });

          if (response.ok) {
            try {
              return normalizeZenResponse(await response.text(), request);
            } catch (error) {
              if (error instanceof ZenResponseError) throw new AppError("PROVIDER_INVALID_RESPONSE", "Jev 返回了无法识别的结果", false);
              throw error;
            }
          }

          const retryAfterHeader = response.headers.get("retry-after");
          const parsedRetryAfter = retryAfterHeader === null ? undefined : Number(retryAfterHeader);
          const retryAfterSeconds = Number.isFinite(parsedRetryAfter) ? parsedRetryAfter : undefined;
          const error = providerError(response.status, retryAfterSeconds);
          if (!error.retryable || attempt === maxAttempts - 1) throw error;
          const waitMs = retryAfterSeconds === undefined ? Math.min(250 * 2 ** attempt, 1_000) : Math.min(retryAfterSeconds * 1_000, 1_000);
          await sleep(waitMs);
        } catch (error) {
          if (error instanceof AppError) throw error;
          if (attempt === maxAttempts - 1) throw new AppError("PROVIDER_UNAVAILABLE", "Jev 请求超时或网络不可用", true);
          await sleep(Math.min(250 * 2 ** attempt, 1_000));
        }
      }

      throw new AppError("PROVIDER_UNAVAILABLE", "Jev 服务不可用", true);
    },
  };
}
