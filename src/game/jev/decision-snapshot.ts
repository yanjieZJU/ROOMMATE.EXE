import {
  DecisionSnapshotSchema,
  type DecisionSnapshot,
  type MacroAction,
  type NeedState,
  type RoommateWorld,
} from "../../shared/roommate-schemas";
import { selectRelevantFacts } from "../memory/relevance";
import { hashDecisionState } from "../simulation/state-hash";

function hungerLabel(value: number): string {
  if (value <= 20) return "饱足";
  if (value <= 60) return "有些饿";
  return "饥饿";
}

function energyLabel(value: number): string {
  if (value >= 70) return "精力充足";
  if (value >= 35) return "精力一般";
  return "疲惫";
}

function moodLabel(value: number): string {
  if (value >= 70) return "心情不错";
  if (value >= 35) return "心情平稳";
  return "心情低落";
}

function focusLabel(value: number): string {
  if (value >= 70) return "专注清晰";
  if (value >= 35) return "专注一般";
  return "难以专注";
}

function renderNeeds(needs: NeedState): string {
  return `${hungerLabel(needs.hunger)}，${energyLabel(needs.energy)}，${moodLabel(needs.mood)}，${focusLabel(needs.focus)}`;
}

export async function buildDecisionSnapshot(
  world: RoommateWorld,
  candidates: readonly MacroAction[],
  identity?: { sessionId: string; decisionIndex: number },
): Promise<DecisionSnapshot> {
  if (candidates.length < 3 || candidates.length > 8) {
    throw new RangeError("Jev 决策必须包含 3–8 个动作");
  }
  if (candidates.some((candidate) => candidate.actorId !== "jev")) {
    throw new TypeError("Jev 决策候选只能属于 Jev");
  }
  const jev = world.characters.find((character) => character.id === "jev");
  if (!jev) throw new TypeError("世界中缺少 Jev");
  const room = world.rooms.find((candidate) => candidate.id === jev.roomId);
  if (!room) throw new TypeError("Jev 位于未知房间");
  const visibleObjects = world.objects.filter((object) => object.roomId === jev.roomId);
  const visibleCharacters = world.characters.filter((character) => character.id !== "jev" && character.roomId === jev.roomId);
  const relevantFacts = selectRelevantFacts(world, {
    actorIds: ["jev", ...visibleCharacters.map((character) => character.id)],
    roomId: jev.roomId,
    objectIds: visibleObjects.map((object) => object.id),
  });
  const withoutHash: Omit<DecisionSnapshot, "stateHash"> = {
    kind: "action",
    ...(identity ?? {}),
    decisionPointId: `day-${world.day}:revision-${world.revision}`,
    requestedAt: new Date().toISOString(),
    day: world.day,
    elapsedMs: world.elapsedMs,
    publicEvent: world.publicEvent,
    observableState: [
      `现在是第${world.day}天，Jev 位于${room.label}`,
      `Jev 目前${renderNeeds(jev.needs)}`,
      visibleCharacters.length > 0 ? `室友也在${room.label}` : `室友不在${room.label}`,
      visibleObjects.length > 0 ? `${room.label}里可以看到${visibleObjects.map((object) => object.label).join("、")}` : `${room.label}里没有可互动物品`,
    ],
    relevantFacts,
    commitments: world.commitments.filter((commitment) => commitment.status === "open"),
    candidates: structuredClone(candidates) as MacroAction[],
  };
  const stateHash = await hashDecisionState(withoutHash);
  return DecisionSnapshotSchema.parse({ ...withoutHash, stateHash });
}
