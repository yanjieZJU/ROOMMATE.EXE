import type { DecisionSnapshot, RoommateDecision } from "../../shared/roommate-schemas";

export interface AutonomyDependencies {
  decide(snapshot: DecisionSnapshot): Promise<RoommateDecision>;
  currentStateHash(): string | Promise<string>;
  commit(decision: RoommateDecision): void | Promise<void>;
}

export class AutonomyConflictError extends Error {
  readonly code = "SESSION_CONFLICT" as const;

  constructor(message: string) {
    super(message);
    this.name = "AutonomyConflictError";
  }
}

export class JevAutonomyController {
  private pending = false;

  constructor(private readonly dependencies: AutonomyDependencies) {}

  async request(snapshot: DecisionSnapshot): Promise<"committed" | "stale"> {
    if (this.pending) throw new AutonomyConflictError("已有一个 Jev 判断正在进行");
    this.pending = true;
    try {
      const decision = await this.dependencies.decide(snapshot);
      const currentHash = await this.dependencies.currentStateHash();
      if (currentHash !== snapshot.stateHash || decision.stateHash !== snapshot.stateHash) return "stale";
      await this.dependencies.commit(decision);
      return "committed";
    } finally {
      this.pending = false;
    }
  }
}
