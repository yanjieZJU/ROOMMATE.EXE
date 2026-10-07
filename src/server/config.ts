import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";

import { JEV_API_URL, JEV_MODEL, ROOMMATE_DAY_DURATION_MS } from "../shared/constants";

export interface AppConfig {
  port: number;
  jevMode: "live" | "mock";
  publicMode: boolean;
  killSwitch: boolean;
  redisUrl?: string;
  quotas: { dailyBudgetUsd: number; installationDailySessions: number; ipWindowLimit: number };
  jev: { apiUrl: string; model: string; apiKey?: string };
  simulation: { dayDurationMs: number };
}

const positiveInt = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const apiKey = env.OPENCODE_API_KEY || env.TYPESAFE_API_KEY || undefined;
  const jevMode = env.JEV_MODE === "mock" ? "mock" : "live";
  return {
    port: positiveInt(env.PORT, 3000),
    jevMode,
    publicMode: env.PUBLIC_MODE === "true",
    killSwitch: env.KILL_SWITCH === "true",
    ...(env.REDIS_URL ? { redisUrl: env.REDIS_URL } : {}),
    quotas: {
      dailyBudgetUsd: Math.max(0, Number(env.DAILY_BUDGET_USD || 0)),
      installationDailySessions: positiveInt(env.INSTALLATION_DAILY_SESSIONS, 3),
      ipWindowLimit: positiveInt(env.IP_WINDOW_LIMIT, 60),
    },
    jev: {
      apiUrl: env.JEV_API_URL || JEV_API_URL,
      model: env.JEV_MODEL || JEV_MODEL,
      ...(apiKey ? { apiKey } : {}),
    },
    simulation: {
      dayDurationMs: jevMode === "mock" ? positiveInt(env.SIMULATION_DAY_MS, ROOMMATE_DAY_DURATION_MS) : ROOMMATE_DAY_DURATION_MS,
    },
  };
}

export function loadRuntimeConfig(env: NodeJS.ProcessEnv = process.env, envPath = ".env"): AppConfig {
  const fromFile = existsSync(envPath) ? parseEnv(readFileSync(envPath, "utf8")) : {};
  const explicit = Object.fromEntries(Object.entries(env).filter((entry): entry is [string, string] => entry[1] !== undefined));
  return loadConfig({ ...fromFile, ...explicit });
}

export function publicConfig(config: AppConfig) {
  return { configured: Boolean(config.jev.apiKey), model: config.jev.model, simulationDayDurationMs: config.simulation.dayDurationMs };
}
