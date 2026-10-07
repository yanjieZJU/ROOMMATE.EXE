import { completeMacroAction } from "../simulation/world-reducer";
import type { ActionTarget, CharacterId, MacroAction, RoommateWorld } from "../../shared/roommate-schemas";

export type ActionCategory = "movement-rest" | "food" | "care-repair" | "use-borrow-return" | "social";
type EffectTemplate = MacroAction["effects"][number];

export interface ActionDefinition {
  readonly id: string;
  readonly label: string;
  readonly category: ActionCategory;
  readonly knownCostText: string;
  readonly durationMs: number;
  readonly animationKey: string;
  readonly priority: number;
  readonly autonomousOnly: boolean;
  readonly targetKinds: readonly string[];
  readonly targetIds: readonly string[];
  readonly characterTarget: boolean;
  readonly effectTemplates: readonly EffectTemplate[];
  readonly factTemplates: readonly string[];
  isAvailable(world: RoommateWorld, actorId: CharacterId, target?: ActionTarget): boolean;
  toMacroAction(world: RoommateWorld, actorId: CharacterId, target?: ActionTarget): MacroAction;
  apply(world: RoommateWorld, action: MacroAction, completedAt: string): RoommateWorld;
}

interface DefinitionInput {
  id: string;
  label: string;
  category: ActionCategory;
  knownCostText: string;
  durationMs: number;
  animationKey: string;
  priority: number;
  autonomousOnly?: boolean;
  targetKinds?: readonly string[];
  targetIds?: readonly string[];
  characterTarget?: boolean;
  effects: readonly EffectTemplate[];
  facts: readonly string[];
  when?: (world: RoommateWorld, actorId: CharacterId, target: ActionTarget) => boolean;
}

function objectAvailable(world: RoommateWorld, actorId: CharacterId, targetId: string): boolean {
  const target = world.objects.find((object) => object.id === targetId);
  if (!target) return false;
  if (target.state.private === true) {
    if (target.id === "player-bed" && actorId !== "player") return false;
    if (target.id === "jev-bed" && actorId !== "jev") return false;
  }
  return true;
}

function renderPath(path: string, actorId: CharacterId, targetId: string | null): string {
  return path.replaceAll("{actorId}", actorId).replaceAll("{targetId}", targetId ?? "");
}

function define(input: DefinitionInput): ActionDefinition {
  const targetKinds = input.targetKinds ?? [];
  const targetIds = input.targetIds ?? [];
  const characterTarget = input.characterTarget ?? false;
  const needsTarget = characterTarget || targetKinds.length > 0 || targetIds.length > 0;
  return {
    ...input,
    autonomousOnly: input.autonomousOnly ?? false,
    targetKinds,
    targetIds,
    characterTarget,
    effectTemplates: input.effects,
    factTemplates: input.facts,
    isAvailable(world, actorId, target = { type: "self", id: null }) {
      if (!world.characters.some((character) => character.id === actorId)) return false;
      if (world.activeActions.some((entry) => entry.action.actorId === actorId)) return false;
      if (needsTarget && target.type === "self") return false;
      if (!needsTarget && target.type !== "self") return false;
      if (target.type === "object") {
        if (!objectAvailable(world, actorId, target.id)) return false;
        const object = world.objects.find((candidate) => candidate.id === target.id)!;
        if (targetKinds.length > 0 && !targetKinds.includes(object.kind)) return false;
        if (targetIds.length > 0 && !targetIds.includes(object.id)) return false;
      }
      if (target.type === "character" && (!characterTarget || target.id === actorId || !world.characters.some((character) => character.id === target.id))) return false;
      return input.when?.(world, actorId, target) ?? true;
    },
    toMacroAction(world, actorId, target = { type: "self", id: null }) {
      const targetObject = target.type === "object" ? world.objects.find((object) => object.id === target.id) : undefined;
      const targetCharacter = target.type === "character" ? world.characters.find((character) => character.id === target.id) : undefined;
      const actorName = actorId === "jev" ? "Jev" : "玩家";
      const targetName = targetObject?.label ?? targetCharacter?.displayName ?? "当前处境";
      return {
        id: `${input.id}@${target.id ?? actorId}`,
        definitionId: input.id,
        actorId,
        label: input.label,
        knownCostText: input.knownCostText,
        durationMs: input.durationMs,
        animationKey: input.animationKey,
        target,
        targetId: target.id,
        targetRoomId: targetObject?.roomId ?? targetCharacter?.roomId ?? world.characters.find((character) => character.id === actorId)?.roomId ?? null,
        effects: input.effects.map((effect) => ({ ...effect, path: renderPath(effect.path, actorId, target.id) })),
        factTemplates: input.facts.map((fact) => fact.replaceAll("{actor}", actorName).replaceAll("{target}", targetName)),
      };
    },
    apply: (world, action, completedAt) => completeMacroAction(world, action, completedAt),
  };
}

const characterEffect = (need: "hunger" | "energy" | "mood" | "focus", value: number): EffectTemplate => ({ path: `characters.{actorId}.needs.${need}`, operation: "increment", value });
const relationshipEffect = (key: "trust" | "pressure", value: number): EffectTemplate => ({ path: `relationship.${key}`, operation: "increment", value });
const environmentEffect = (key: "cleanliness" | "noise", value: number): EffectTemplate => ({ path: `environment.${key}`, operation: "increment", value });
const targetStateEffect = (key: string, operation: "set" | "increment", value: unknown): EffectTemplate => ({ path: `objects.{targetId}.state.${key}`, operation, value });

const definitions = [
  define({ id: "wait", label: "稍等片刻", category: "movement-rest", knownCostText: "停留四秒", durationMs: 4_000, animationKey: "idle", priority: 0, autonomousOnly: true, effects: [characterEffect("mood", 1)], facts: ["{actor}停下来等了一会儿"] }),
  define({ id: "observe-room", label: "观察房间", category: "movement-rest", knownCostText: "留意周围四秒", durationMs: 4_000, animationKey: "look", priority: 1, autonomousOnly: true, effects: [characterEffect("focus", 2)], facts: ["{actor}观察了房间里的动静"] }),
  define({ id: "rest", label: "坐下休息", category: "movement-rest", knownCostText: "占用座位八秒", durationMs: 8_000, animationKey: "sit", priority: 10, targetKinds: ["seat", "bed"], effects: [characterEffect("energy", 12), characterEffect("mood", 4)], facts: ["{actor}在{target}休息了一会儿"] }),
  define({ id: "sleep", label: "睡一会儿", category: "movement-rest", knownCostText: "占用床十二秒", durationMs: 12_000, animationKey: "sleep", priority: 11, targetKinds: ["bed"], effects: [characterEffect("energy", 25), characterEffect("mood", 5)], facts: ["{actor}在{target}睡了一会儿"] }),
  define({ id: "cook-meal", label: "做一顿饭", category: "food", knownCostText: "使用食材十二秒", durationMs: 12_000, animationKey: "cook", priority: 12, targetIds: ["stove"], effects: [characterEffect("hunger", -10), environmentEffect("cleanliness", -3)], facts: ["{actor}用{target}做了一顿饭"], when: (world) => Number(world.objects.find((object) => object.id === "fridge")?.state.portions ?? 0) > 0 }),
  define({ id: "eat-meal", label: "吃一份食物", category: "food", knownCostText: "消耗一份食物", durationMs: 8_000, animationKey: "eat", priority: 13, targetIds: ["fridge"], effects: [targetStateEffect("portions", "increment", -1), characterEffect("hunger", -30)], facts: ["{actor}从{target}取出并吃掉了一份食物"], when: (world, _actor, target) => target.type === "object" && world.objects.find((object) => object.id === target.id)?.state.working !== false && Number(world.objects.find((object) => object.id === target.id)?.state.portions ?? 0) > 0 }),
  define({ id: "buy-food", label: "添置食物", category: "food", knownCostText: "离开公寓十秒", durationMs: 10_000, animationKey: "carry", priority: 14, targetIds: ["message-board"], effects: [{ path: "objects.fridge.state.portions", operation: "increment", value: 2 }], facts: ["{actor}带回了两份食物"] }),
  define({ id: "clean", label: "清理一下", category: "care-repair", knownCostText: "花费八秒", durationMs: 8_000, animationKey: "clean", priority: 15, targetKinds: ["surface", "container"], effects: [targetStateEffect("clutter", "set", 0), environmentEffect("cleanliness", 12)], facts: ["{actor}清理了{target}"], when: (world, _actor, target) => target.type === "object" && Number(world.objects.find((object) => object.id === target.id)?.state.clutter ?? 0) > 0 }),
  define({ id: "take-trash", label: "倒垃圾", category: "care-repair", knownCostText: "花费八秒", durationMs: 8_000, animationKey: "carry", priority: 16, targetIds: ["trash-bin"], effects: [targetStateEffect("fullness", "set", 0), environmentEffect("cleanliness", 10)], facts: ["{actor}清空了{target}"], when: (world, _actor, target) => target.type === "object" && Number(world.objects.find((object) => object.id === target.id)?.state.fullness ?? 0) > 0 }),
  define({ id: "repair", label: "尝试修理", category: "care-repair", knownCostText: "花费十二秒", durationMs: 12_000, animationKey: "repair", priority: 17, targetKinds: ["appliance", "fixture", "utility"], effects: [targetStateEffect("working", "set", true)], facts: ["{actor}修好了{target}"], when: (world, _actor, target) => target.type === "object" && world.objects.find((object) => object.id === target.id)?.state.working === false }),
  define({ id: "watch-tv", label: "看一会儿电视", category: "use-borrow-return", knownCostText: "可能产生声音", durationMs: 10_000, animationKey: "watch", priority: 20, targetIds: ["television"], effects: [targetStateEffect("on", "set", true), characterEffect("mood", 10), characterEffect("focus", -4), environmentEffect("noise", 12)], facts: ["{actor}打开{target}看了一会儿"] }),
  define({ id: "work", label: "处理工作", category: "use-borrow-return", knownCostText: "占用桌面十二秒", durationMs: 12_000, animationKey: "work", priority: 21, targetIds: ["work-desk"], effects: [characterEffect("energy", -8), characterEffect("focus", 12)], facts: ["{actor}在{target}处理了工作"] }),
  define({ id: "shower", label: "洗个澡", category: "use-borrow-return", knownCostText: "占用浴室十秒", durationMs: 10_000, animationKey: "shower", priority: 22, targetIds: ["shower"], effects: [characterEffect("mood", 8)], facts: ["{actor}使用了{target}"] }),
  define({ id: "read-board", label: "查看留言", category: "use-borrow-return", knownCostText: "花费四秒", durationMs: 4_000, animationKey: "read", priority: 23, targetIds: ["message-board"], effects: [characterEffect("focus", 2)], facts: ["{actor}查看了{target}"] }),
  define({ id: "knock", label: "敲门", category: "social", knownCostText: "等待回应六秒", durationMs: 6_000, animationKey: "knock", priority: 26, targetKinds: ["door"], effects: [relationshipEffect("pressure", -1)], facts: ["{actor}先敲了{target}"], when: (_world, actorId, target) => target.type === "object" && target.id !== (actorId === "player" ? "player-door" : "jev-door") }),
  define({ id: "invite", label: "邀请一起活动", category: "social", knownCostText: "发出邀请六秒", durationMs: 6_000, animationKey: "talk", priority: 27, characterTarget: true, effects: [relationshipEffect("trust", 4), characterEffect("mood", 2)], facts: ["{actor}邀请{target}一起活动"] }),
  define({ id: "help", label: "主动帮忙", category: "social", knownCostText: "投入八秒", durationMs: 8_000, animationKey: "help", priority: 28, characterTarget: true, effects: [characterEffect("energy", -3), relationshipEffect("trust", 6), relationshipEffect("pressure", 2)], facts: ["{actor}主动帮了{target}一个忙"], when: (world) => world.commitments.some((commitment) => commitment.status === "open") }),
  define({ id: "refuse", label: "拒绝请求", category: "social", knownCostText: "立即说明边界", durationMs: 4_000, animationKey: "talk", priority: 29, characterTarget: true, effects: [relationshipEffect("trust", -3), relationshipEffect("pressure", 5)], facts: ["{actor}拒绝了{target}的请求"], when: (world) => world.commitments.some((commitment) => commitment.status === "open") }),
  define({ id: "apologize", label: "道歉", category: "social", knownCostText: "停下六秒说明", durationMs: 6_000, animationKey: "talk", priority: 30, characterTarget: true, effects: [relationshipEffect("trust", 5), relationshipEffect("pressure", -6)], facts: ["{actor}向{target}道歉"], when: (world) => world.facts.some((fact) => fact.status === "unresolved") }),
] satisfies ActionDefinition[];

export const ACTION_CATALOG: ReadonlyMap<string, ActionDefinition> = new Map(definitions.map((definition) => [definition.id, definition]));
