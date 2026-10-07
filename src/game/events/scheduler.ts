import type { MemoryFact, RoommateWorld } from "../../shared/roommate-schemas";
import { applyWorldCommand } from "../simulation/world-reducer";
import { SEVEN_DAY_EVENTS, type ScheduledEvent } from "./seven-day-events";

function position(day: number, elapsedMs: number): [number, number] {
  return [day, elapsedMs];
}

function reached(world: RoommateWorld, event: ScheduledEvent): boolean {
  const [day, elapsed] = position(world.day, world.elapsedMs);
  return day > event.day || (day === event.day && elapsed >= event.offsetMs);
}

export function eventsDue(_previous: RoommateWorld, next: RoommateWorld): ScheduledEvent[] {
  const applied = new Set(next.appliedEventIds);
  return SEVEN_DAY_EVENTS.filter((event) => !applied.has(event.id) && reached(next, event));
}

function object(world: RoommateWorld, id: string) {
  const found = world.objects.find((candidate) => candidate.id === id);
  if (!found) throw new TypeError(`Missing event object: ${id}`);
  return found;
}

function eventFact(event: ScheduledEvent): MemoryFact {
  return {
    id: `${event.id}:fact`,
    occurredAt: `day-${event.day}`,
    text: event.publicFact,
    actorIds: [],
    roomId: null,
    objectIds: [],
    status: event.day === 7 ? "ordinary" : "unresolved",
    sourceActionId: null,
  };
}

export function applyScheduledEvent(world: RoommateWorld, event: ScheduledEvent): RoommateWorld {
  if (world.appliedEventIds.includes(event.id)) return world;
  const prepared = structuredClone(world);
  switch (event.id) {
    case "day-1-move-in":
      object(prepared, "storage-cabinet").state.boxes = 3;
      object(prepared, "storage-cabinet").state.freeSlots = 0;
      object(prepared, "dining-table").state.clutter = 3;
      break;
    case "day-2-last-dinner":
      object(prepared, "fridge").state.portions = 1;
      break;
    case "day-3-quiet-night":
      object(prepared, "work-desk").state.quietRequired = true;
      object(prepared, "television").state.volumeLimited = true;
      break;
    case "day-4-visitor":
      object(prepared, "sofa").state.visitorPresent = true;
      break;
    case "day-5-broken-appliance":
      object(prepared, "fridge").state.working = false;
      break;
    case "day-6-illness-blackout": {
      object(prepared, "fuse-box").state.working = false;
      const jev = prepared.characters.find((character) => character.id === "jev");
      if (!jev) throw new TypeError("Missing Jev for day-six event");
      jev.needs.mood = Math.max(0, jev.needs.mood - 25);
      jev.needs.energy = Math.max(0, jev.needs.energy - 20);
      break;
    }
    case "day-7-lease":
      break;
    default:
      throw new TypeError(`Unknown scheduled event: ${event.id}`);
  }
  return applyWorldCommand(prepared, {
    type: "apply-event",
    eventId: event.id,
    label: event.publicFact,
    facts: [eventFact(event)],
  });
}
