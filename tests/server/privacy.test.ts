import { expect, it } from "vitest";

import { ContentFreeMetricsSink, withMetrics } from "../../src/server/guards/metrics";
import { MockZenClient } from "../../src/server/providers/mock-zen";

it("records operational metrics and drops content, keys, IPs, and identifiers", () => {
  const sink = new ContentFreeMetricsSink();
  sink.record({
    provider: "opencode-zen", model: "jev-1.13-free", inputTokens: 100, outputTokens: 20, questionCount: 96,
    latencyMs: 840, retryCount: 1, estimatedCostUsd: 0, errorCode: undefined,
    prompt: "用户正文", apiKey: "secret", ip: "127.0.0.1", installationId: "private-id",
  } as never);
  const json = JSON.stringify(sink.snapshot());
  expect(json).toContain("opencode-zen");
  for (const forbidden of ["用户正文", "secret", "127.0.0.1", "private-id", "apiKey", "prompt"]) expect(json).not.toContain(forbidden);
});

it("instruments Jev calls without retaining their state or question content", async () => {
  const sink = new ContentFreeMetricsSink();
  const client = withMetrics(new MockZenClient(), sink);
  await client.evaluate({
    state: { privateNarrative: "不要记录我" },
    questions: { action: { type: "choice", instructions: "私密事件", criteria: { a: "行动 A", b: "行动 B" } } },
  });

  expect(sink.snapshot()).toMatchObject([{
    provider: "opencode-zen",
    model: "jev-1.13-free",
    questionCount: 1,
    inputTokens: 0,
    outputTokens: 0,
    retryCount: 0,
    estimatedCostUsd: 0,
  }]);
  expect(JSON.stringify(sink.snapshot())).not.toContain("不要记录我");
  expect(JSON.stringify(sink.snapshot())).not.toContain("私密事件");
});
