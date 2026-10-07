import Fastify, { type FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { type AppConfig, loadConfig, publicConfig } from "./config";
import { AppError } from "./errors";
import { createZenClient, type ZenClient } from "./providers/zen";
import { MockZenClient } from "./providers/mock-zen";
import { registerRoommateRoute } from "./routes/roommate";
import { QuotaGuard } from "./guards/quota";
import { createQuotaStore } from "./guards/quota-store";
import { ContentFreeMetricsSink, type MetricsSink, withMetrics } from "./guards/metrics";

export interface AppDependencies { config?: AppConfig; zenClient?: ZenClient; quotaGuard?: QuotaGuard; metricsSink?: MetricsSink }

export function createApp(deps: AppDependencies = {}): FastifyInstance {
  const config = deps.config ?? loadConfig();
  const app = Fastify({ logger: false, bodyLimit: 1_000_000 });
  const baseZenClient = deps.zenClient ?? (config.jevMode === "mock" ? new MockZenClient(Number(process.env.JEV_MOCK_DELAY_MS || 0)) : createZenClient(config));
  const zenClient = withMetrics(baseZenClient, deps.metricsSink ?? new ContentFreeMetricsSink());
  const quotaGuard = deps.quotaGuard ?? new QuotaGuard(createQuotaStore({ publicMode: config.publicMode, redisUrl: config.redisUrl }), {
    killSwitch: config.killSwitch,
    publicMode: config.publicMode,
    dailyBudgetUsd: config.quotas.dailyBudgetUsd,
    installationDailySessions: config.quotas.installationDailySessions,
    ipWindowLimit: config.quotas.ipWindowLimit,
  });
  if (config.publicMode) {
    app.addHook("preHandler", async (request, reply) => {
      if (!request.url.startsWith("/api/") || request.url === "/api/health") return;
      const body = request.body as Record<string, unknown> | undefined;
      const decision = await quotaGuard.check({
        installationId: String(request.headers["x-installation-id"] ?? "anonymous"),
        ip: request.ip,
        sessionId: `${String(body?.sessionId ?? "anonymous")}:${request.url}:${String(body?.stateHash ?? "invalid")}`,
        isSessionStart: request.url === "/api/roommate/decision" && body?.decisionIndex === 0,
        providerAvailable: config.jevMode === "mock" || Boolean(config.jev.apiKey),
      });
      if (!decision.allowed) {
        const { allowed: _allowed, ...error } = decision;
        return reply.status(decision.code === "SESSION_CONFLICT" ? 409 : 429).send({ error });
      }
    });
  }

  app.get("/api/health", async () => ({ ok: true, ...publicConfig(config) }));
  registerRoommateRoute(app, zenClient);
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AppError) {
      const status = error.code === "INVALID_INPUT" ? 400 : error.code === "SESSION_CONFLICT" ? 409 : 503;
      return reply.status(status).send(error.toJSON());
    }
    return reply.status(500).send(new AppError("PROVIDER_UNAVAILABLE", "服务暂时不可用", true).toJSON());
  });
  const clientRoot = fileURLToPath(new URL("../../dist/client/", import.meta.url));
  if (existsSync(clientRoot)) {
    app.register(fastifyStatic, { root: clientRoot });
    app.setNotFoundHandler((request, reply) => request.url.startsWith("/api/")
      ? reply.status(404).send({ error: { code: "INVALID_INPUT", message: "接口不存在", retryable: false } })
      : reply.sendFile("index.html"));
  }
  return app;
}
