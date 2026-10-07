import { hashDecisionState } from "../simulation/state-hash";
import { RoommateSessionSchema, type DecisionSnapshot, type RoommateDecision, type RoommateSession } from "../../shared/roommate-schemas";

export type LeaseChoice = "renew" | "leave";
export type LeaseEndingKind = "both-renew" | "player-renews" | "jev-renews" | "both-leave";

const ENDINGS: Record<LeaseEndingKind, string> = {
  "both-renew": "钥匙仍然留在两个人手里。第八天会从同一扇门开始。",
  "player-renews": "你留下了钥匙，Jev 却收好了最后一个箱子。公寓重新安静下来。",
  "jev-renews": "你决定搬走，Jev 仍愿意留下。门口只剩你拖走行李的声音。",
  "both-leave": "两张搬走卡同时翻开。你们在门口最后一次确认没有落下东西。",
};

export function submitPlayerLeaseChoice(session: RoommateSession, choice: LeaseChoice): RoommateSession {
  if (session.status !== "lease" || session.world.day !== 7) throw new Error("只有第七天租约阶段可以选择");
  return RoommateSessionSchema.parse({
    ...structuredClone(session),
    lease: { playerChoice: choice, jevChoice: null, revealed: false },
  });
}

async function leaseSnapshot(session: RoommateSession): Promise<DecisionSnapshot> {
  const candidates = (["renew", "leave"] as const).map((id) => ({
    id,
    definitionId: id,
    actorId: "jev" as const,
    label: id === "renew" ? "续租" : "搬走",
    knownCostText: id === "renew" ? "继续共同生活" : "结束这段合租生活",
    durationMs: 4_000,
    animationKey: "idle",
    target: { type: "self" as const, id: null },
    targetId: null,
    targetRoomId: "living-room",
    effects: [{ path: "characters.jev.needs.focus", operation: "increment" as const, value: 0 }],
    factTemplates: [id === "renew" ? "Jev 决定继续合租" : "Jev 决定搬走"],
  }));
  const withoutHash: Omit<DecisionSnapshot, "stateHash"> = {
    kind: "lease",
    sessionId: session.id,
    decisionIndex: session.decisions.length,
    decisionPointId: `lease:${session.id}`,
    requestedAt: new Date().toISOString(),
    day: 7,
    elapsedMs: session.world.elapsedMs,
    publicEvent: "租约今晚到期",
    observableState: ["七天共同生活已经结束", ...session.world.facts.slice(-12).map((fact) => fact.text)],
    relevantFacts: session.world.facts.slice(-12),
    commitments: session.world.commitments.filter((commitment) => commitment.status === "open"),
    candidates,
  };
  return { ...withoutHash, stateHash: await hashDecisionState(withoutHash) };
}

export async function requestJevLeaseChoice(
  session: RoommateSession,
  decide: (snapshot: DecisionSnapshot) => Promise<RoommateDecision>,
): Promise<RoommateSession> {
  if (!session.lease.playerChoice || session.lease.revealed) throw new Error("玩家必须先封存自己的选择");
  const decision = await decide(await leaseSnapshot(session));
  if (decision.selectedActionId !== "renew" && decision.selectedActionId !== "leave") throw new Error("Jev 返回了无效的续租选择");
  return RoommateSessionSchema.parse({
    ...structuredClone(session),
    status: "complete",
    updatedAt: decision.decidedAt,
    decisions: [...session.decisions, decision],
    lease: { playerChoice: session.lease.playerChoice, jevChoice: decision.selectedActionId, revealed: true },
  });
}

export function classifyLeaseEnding(player: LeaseChoice, jev: LeaseChoice): { kind: LeaseEndingKind; copy: string } {
  const kind: LeaseEndingKind = player === "renew"
    ? (jev === "renew" ? "both-renew" : "player-renews")
    : (jev === "renew" ? "jev-renews" : "both-leave");
  return { kind, copy: ENDINGS[kind] };
}
