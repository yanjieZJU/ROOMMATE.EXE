import { JEV_MODEL } from "../../shared/constants";
import { AppError } from "../errors";
import type { SystemOneRequest, ZenClient } from "../providers/zen";

export interface MetricEvent { provider: string; model: string; inputTokens?: number; outputTokens?: number; questionCount: number; latencyMs: number; retryCount: number; estimatedCostUsd: number; errorCode?: string }
export interface MetricsSink { record(event: MetricEvent): void }
export class ContentFreeMetricsSink implements MetricsSink {
  private readonly events: MetricEvent[] = [];
  record(event: MetricEvent): void {
    this.events.push({ provider: event.provider, model: event.model, inputTokens: event.inputTokens, outputTokens: event.outputTokens, questionCount: event.questionCount, latencyMs: event.latencyMs, retryCount: event.retryCount, estimatedCostUsd: event.estimatedCostUsd, errorCode: event.errorCode });
  }
  snapshot(): MetricEvent[] { return structuredClone(this.events); }
}

export function withMetrics(client: ZenClient, sink: MetricsSink): ZenClient {
  return {
    async evaluate(request: SystemOneRequest, options) {
      const startedAt = performance.now();
      try {
        const response = await client.evaluate(request, options);
        sink.record({
          provider: "opencode-zen",
          model: response.model,
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          questionCount: Object.keys(request.questions).length,
          latencyMs: performance.now() - startedAt,
          retryCount: 0,
          estimatedCostUsd: 0,
        });
        return response;
      } catch (error) {
        sink.record({
          provider: "opencode-zen",
          model: JEV_MODEL,
          questionCount: Object.keys(request.questions).length,
          latencyMs: performance.now() - startedAt,
          retryCount: 0,
          estimatedCostUsd: 0,
          errorCode: error instanceof AppError ? error.code : "PROVIDER_UNAVAILABLE",
        });
        throw error;
      }
    },
  };
}
