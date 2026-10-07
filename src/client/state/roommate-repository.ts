import { openDB, type DBSchema, type IDBPDatabase } from "idb";

import {
  RoommateSessionSchema,
  RoommateWorldSchema,
  type RoommateDecision,
  type RoommateSession,
  type RoommateWorld,
} from "../../shared/roommate-schemas";

interface RoommateDatabase extends DBSchema {
  roommateSessions: {
    key: string;
    value: RoommateSession;
    indexes: { updatedAt: string };
  };
}

export interface RoommateRepositoryOptions {
  dbName?: string;
  beforeSessionPut?: () => void | Promise<void>;
}

export interface CompletedTransition {
  world: RoommateWorld;
  completedAt: string;
  decision?: RoommateDecision;
}

function assertCommittedWorld(world: RoommateWorld): RoommateWorld {
  const parsed = RoommateWorldSchema.parse(world);
  if (parsed.activeActions.length > 0 || parsed.objects.some((object) => object.reservedBy !== null)) {
    throw new Error("只能保存已经完整结束的动作");
  }
  return parsed;
}

export class RoommateRepository {
  private readonly database: Promise<IDBPDatabase<RoommateDatabase>>;
  private readonly beforeSessionPut?: () => void | Promise<void>;

  constructor(options: RoommateRepositoryOptions = {}) {
    this.beforeSessionPut = options.beforeSessionPut;
    this.database = openDB<RoommateDatabase>(options.dbName ?? "roommate-exe", 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("roommateSessions")) {
          const store = db.createObjectStore("roommateSessions", { keyPath: "id" });
          store.createIndex("updatedAt", "updatedAt");
        }
      },
    });
  }

  async commitTransition(sessionInput: RoommateSession, transition: CompletedTransition): Promise<RoommateSession> {
    const session = RoommateSessionSchema.parse(sessionInput);
    const world = assertCommittedWorld(transition.world);
    if (world.revision <= session.world.revision) throw new Error("提交的世界版本必须更新");
    const next = RoommateSessionSchema.parse({
      ...structuredClone(session),
      updatedAt: transition.completedAt,
      world,
      decisions: transition.decision ? [...session.decisions, transition.decision] : session.decisions,
    });
    await this.putAtomically(next);
    return next;
  }

  async savePaused(sessionInput: RoommateSession): Promise<RoommateSession> {
    const session = RoommateSessionSchema.parse(sessionInput);
    assertCommittedWorld(session.world);
    const paused = RoommateSessionSchema.parse({ ...structuredClone(session), status: "paused", world: { ...session.world, paused: true } });
    await this.putAtomically(paused);
    return paused;
  }

  async loadLatest(): Promise<RoommateSession | null> {
    const values = await (await this.database).getAllFromIndex("roommateSessions", "updatedAt");
    const parsed = values.map((value) => RoommateSessionSchema.parse(value));
    return parsed.filter((session) => session.status !== "complete").sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0] ?? null;
  }

  async importSession(json: string): Promise<RoommateSession> {
    let value: unknown;
    try {
      value = JSON.parse(json);
    } catch {
      throw new Error("会话 JSON 无法解析");
    }
    const parsed = RoommateSessionSchema.safeParse(value);
    if (!parsed.success) throw new Error("会话格式或版本不受支持");
    assertCommittedWorld(parsed.data.world);
    await this.putAtomically(parsed.data);
    return parsed.data;
  }

  private async putAtomically(session: RoommateSession): Promise<void> {
    const db = await this.database;
    const tx = db.transaction("roommateSessions", "readwrite");
    try {
      await this.beforeSessionPut?.();
      await tx.store.put(structuredClone(session));
      await tx.done;
    } catch (error) {
      try { tx.abort(); } catch { /* transaction already aborted */ }
      await tx.done.catch(() => undefined);
      throw error;
    }
  }
}
