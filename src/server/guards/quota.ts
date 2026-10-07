import type { ApiError } from "../../shared/schemas";
import type { QuotaStore } from "./quota-store";

export interface QuotaContext { installationId: string; ip: string; sessionId: string; isSessionStart: boolean; providerAvailable: boolean }
export type QuotaDecision = { allowed: true } | { allowed: false; code: ApiError["error"]["code"]; message: string; retryable: boolean };
export interface QuotaOptions { killSwitch?: boolean; publicMode?: boolean; dailyBudgetUsd?: number; installationDailySessions?: number; ipWindowLimit?: number; dayKey?: () => string }

export class QuotaGuard {
  constructor(private readonly store: QuotaStore, private readonly options: QuotaOptions) {}
  async check(context: QuotaContext): Promise<QuotaDecision> {
    if (this.options.killSwitch) return { allowed: false, code: "BUDGET_EXCEEDED", message: "体验暂时关闭", retryable: false };
    if (!context.providerAvailable) return { allowed: false, code: "PROVIDER_UNAVAILABLE", message: "免费 Jev 模型暂时不可用", retryable: true };
    try {
      const day = (this.options.dayKey ?? (() => new Date().toISOString().slice(0, 10)))();
      if ((this.options.dailyBudgetUsd ?? 0) > 0 && await this.store.getNumber(`budget:${day}`) >= this.options.dailyBudgetUsd!) {
        return { allowed: false, code: "BUDGET_EXCEEDED", message: "今日体验预算已用完", retryable: false };
      }
      if (context.isSessionStart && this.options.installationDailySessions !== undefined) {
        const count = await this.store.incrementWithExpiry(`installation:${day}:${context.installationId}`, 1, 86_400);
        if (count > this.options.installationDailySessions) return { allowed: false, code: "QUOTA_EXCEEDED", message: "今天创建的人生次数已达上限", retryable: false };
      }
      if (this.options.ipWindowLimit !== undefined) {
        const count = await this.store.incrementWithExpiry(`ip:${context.ip}`, 1, 60);
        if (count > this.options.ipWindowLimit) return { allowed: false, code: "QUOTA_EXCEEDED", message: "请求过于频繁", retryable: true };
      }
      if (!await this.store.acquireLock(`session:${context.sessionId}`, 30)) {
        return { allowed: false, code: "SESSION_CONFLICT", message: "同一轮判断仍在进行", retryable: true };
      }
      return { allowed: true };
    } catch {
      return this.options.publicMode
        ? { allowed: false, code: "QUOTA_EXCEEDED", message: "额度服务不可用，已安全停止外部调用", retryable: true }
        : { allowed: true };
    }
  }
}
