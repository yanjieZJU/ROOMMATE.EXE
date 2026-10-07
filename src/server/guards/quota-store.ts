export interface QuotaStore {
  incrementWithExpiry(key: string, amount: number, ttlSeconds: number): Promise<number>;
  getNumber(key: string): Promise<number>;
  acquireLock(key: string, ttlSeconds: number): Promise<boolean>;
}

interface Entry { value: number; expiresAt: number }

export class MemoryQuotaStore implements QuotaStore {
  private readonly counters = new Map<string, Entry>();
  private readonly locks = new Map<string, number>();
  constructor(private readonly now: () => number = Date.now) {}
  async incrementWithExpiry(key: string, amount: number, ttlSeconds: number): Promise<number> {
    const existing = this.counters.get(key);
    const current = existing && existing.expiresAt > this.now() ? existing.value : 0;
    const value = current + amount;
    this.counters.set(key, { value, expiresAt: this.now() + ttlSeconds * 1_000 });
    return value;
  }
  async getNumber(key: string): Promise<number> {
    const entry = this.counters.get(key);
    if (!entry || entry.expiresAt <= this.now()) { this.counters.delete(key); return 0; }
    return entry.value;
  }
  async acquireLock(key: string, ttlSeconds: number): Promise<boolean> {
    const expiry = this.locks.get(key) ?? 0;
    if (expiry > this.now()) return false;
    this.locks.set(key, this.now() + ttlSeconds * 1_000);
    return true;
  }
}

interface RedisLike {
  incrBy(key: string, amount: number): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options: { NX: true; EX: number }): Promise<string | null>;
}

export class RedisQuotaStore implements QuotaStore {
  constructor(private readonly redis: RedisLike) {}
  async incrementWithExpiry(key: string, amount: number, ttlSeconds: number) {
    const value = await this.redis.incrBy(key, amount);
    if (value === amount) await this.redis.expire(key, ttlSeconds);
    return value;
  }
  async getNumber(key: string) { return Number(await this.redis.get(key) ?? 0); }
  async acquireLock(key: string, ttlSeconds: number) { return (await this.redis.set(key, "1", { NX: true, EX: ttlSeconds })) === "OK"; }
}

class LazyRedisQuotaStore implements QuotaStore {
  private readonly client;
  private connecting?: Promise<unknown>;

  constructor(url: string) {
    this.client = createClient({ url });
  }

  private async ready() {
    if (this.client.isReady) return;
    this.connecting ??= this.client.connect();
    await this.connecting;
  }

  async incrementWithExpiry(key: string, amount: number, ttlSeconds: number) {
    await this.ready();
    return new RedisQuotaStore(this.client).incrementWithExpiry(key, amount, ttlSeconds);
  }

  async getNumber(key: string) {
    await this.ready();
    return new RedisQuotaStore(this.client).getNumber(key);
  }

  async acquireLock(key: string, ttlSeconds: number) {
    await this.ready();
    return new RedisQuotaStore(this.client).acquireLock(key, ttlSeconds);
  }
}

class UnavailableQuotaStore implements QuotaStore {
  private unavailable(): never { throw new Error("REDIS_URL is required in public mode"); }
  async incrementWithExpiry(): Promise<number> { return this.unavailable(); }
  async getNumber(): Promise<number> { return this.unavailable(); }
  async acquireLock(): Promise<boolean> { return this.unavailable(); }
}

export function createQuotaStore(options: { publicMode: boolean; redisUrl?: string }): QuotaStore {
  if (!options.publicMode) return new MemoryQuotaStore();
  return options.redisUrl ? new LazyRedisQuotaStore(options.redisUrl) : new UnavailableQuotaStore();
}
import { createClient } from "redis";
