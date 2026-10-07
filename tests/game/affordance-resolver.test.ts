import { describe, expect, it } from "vitest";

import { ACTION_CATALOG } from "../../src/game/actions/catalog";
import { resolveAffordances, resolveAllAffordances } from "../../src/game/actions/affordance-resolver";
import { selectDiverseCandidates } from "../../src/game/actions/candidate-ranking";
import { resolvePlayerTargetActions } from "../../src/game/actions/player-actions";
import { applyWorldCommand, completeMacroAction } from "../../src/game/simulation/world-reducer";
import { createRoommateFixture } from "../fixtures/roommate";

describe("legal affordance resolution", () => {
  it("offers Jev diverse actions across the whole reachable apartment", () => {
    const world = createRoommateFixture().world;

    const actions = resolveAffordances(world, "jev");

    expect(actions.length).toBeGreaterThanOrEqual(6);
    expect(actions.length).toBeLessThanOrEqual(8);
    expect(actions.map((action) => action.definitionId)).toContain("wait");
    expect(actions.some((action) => action.targetRoomId === "kitchen")).toBe(true);
    expect(actions.some((action) => action.targetRoomId === "living-room")).toBe(true);
    expect(new Set(actions.map((action) => ACTION_CATALOG.get(action.definitionId)?.category)).size).toBeGreaterThanOrEqual(3);
    expect(actions.every((action) => action.effects.length > 0 && action.factTemplates.length > 0)).toBe(true);
  });

  it("keeps arrival-time conflicts available but excludes broken and private targets", () => {
    const world = createRoommateFixture().world;
    world.objects.find((object) => object.id === "television")!.reservedBy = "player";
    world.objects.find((object) => object.id === "player-bed")!.state.private = true;
    world.objects.find((object) => object.id === "fridge")!.state.working = false;

    const actions = resolveAllAffordances(world, "jev");

    expect(actions.some((action) => action.targetId === "television")).toBe(true);
    expect(actions.some((action) => action.targetId === "player-bed")).toBe(false);
    expect(actions.some((action) => action.definitionId === "eat-meal" && action.targetId === "fridge")).toBe(false);
  });

  it("builds player object and character menus without replacing queued intent", () => {
    const world = createRoommateFixture().world;
    world.commitments.push({ id: "help-jev", createdAt: "2026-09-29T00:00:00.000Z", text: "帮 Jev 收拾", participantIds: ["player", "jev"], status: "open", dueDay: 1 });

    const objectActions = resolvePlayerTargetActions(world, { type: "object", id: "television" });
    const socialActions = resolvePlayerTargetActions(world, { type: "character", id: "jev" });

    expect(objectActions.some((action) => action.definitionId === "watch-tv")).toBe(true);
    expect(socialActions.map((action) => action.definitionId)).toEqual(expect.arrayContaining(["invite", "help"]));
    expect([...objectActions, ...socialActions].every((action) => ACTION_CATALOG.get(action.definitionId)?.autonomousOnly !== true)).toBe(true);
  });

  it("creates distinct candidate ids for each valid target", () => {
    const world = createRoommateFixture().world;
    const rests = resolveAllAffordances(world, "jev").filter((action) => action.definitionId === "rest");

    expect(rests.map((action) => action.id)).toEqual(expect.arrayContaining(["rest@jev-bed", "rest@sofa"]));
    expect(new Set(rests.map((action) => action.id)).size).toBe(rests.length);
  });

  it("raises food relevance when hunger is urgent and demotes immediate repeats", () => {
    const world = createRoommateFixture().world;
    world.characters.find((character) => character.id === "jev")!.needs.hunger = 95;
    const all = resolveAllAffordances(world, "jev");
    const hungry = selectDiverseCandidates(world, all);
    world.facts.push({
      id: "recent-tv",
      occurredAt: "2026-09-29T00:00:00.000Z",
      text: "Jev 刚看过电视",
      actorIds: ["jev"],
      roomId: "living-room",
      objectIds: ["television"],
      status: "ordinary",
      sourceActionId: "watch-tv@television",
    });
    const repeated = selectDiverseCandidates(world, all);

    expect(hungry.slice(0, 4).some((action) => action.definitionId === "eat-meal" || action.definitionId === "cook-meal")).toBe(true);
    expect(repeated.findIndex((action) => action.definitionId === "watch-tv"))
      .toBeGreaterThanOrEqual(hungry.findIndex((action) => action.definitionId === "watch-tv"));
  });

  it("applies relationship and environment consequences through the reducer", () => {
    let world = createRoommateFixture().world;
    world.characters.find((character) => character.id === "player")!.needs.energy = 10;
    world.commitments.push({ id: "help-jev", createdAt: "2026-09-29T00:00:00.000Z", text: "帮 Jev 收拾", participantIds: ["player", "jev"], status: "open", dueDay: 1 });
    const help = resolvePlayerTargetActions(world, { type: "character", id: "jev" }).find((action) => action.definitionId === "help")!;
    const helpEntry = { queueId: "help-1", action: help, startedAt: "2026-09-29T00:00:00.000Z" };
    world = completeMacroAction(applyWorldCommand(world, { type: "start-action", entry: helpEntry }), help, "2026-09-29T00:00:08.000Z");
    expect(world.relationship.trust).toBeGreaterThan(50);
    expect(world.relationship.pressure).toBeGreaterThan(20);

    const table = world.objects.find((object) => object.id === "dining-table")!;
    table.state.clutter = 2;
    const clean = resolvePlayerTargetActions(world, { type: "object", id: "dining-table" }).find((action) => action.definitionId === "clean")!;
    const cleanEntry = { queueId: "clean-1", action: clean, startedAt: "2026-09-29T00:00:09.000Z" };
    world = completeMacroAction(applyWorldCommand(world, { type: "start-action", entry: cleanEntry }), clean, "2026-09-29T00:00:17.000Z");

    expect(world.environment.cleanliness).toBeGreaterThan(70);
  });
});
