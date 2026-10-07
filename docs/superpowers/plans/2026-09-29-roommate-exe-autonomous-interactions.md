# ROOMMATE.EXE Autonomous Interactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn ROOMMATE.EXE into a playable two-character life simulation with queued player actions, visible Jev navigation, dynamic whole-apartment choices, concurrent object use, and non-blocking Jev failure recovery.

**Architecture:** Keep React as the session/UI shell, Phaser as the movement and animation surface, and `WorldReducer` as the only committed-state writer. Add pure navigation, queue, ranking, and response-normalization modules; a client action executor bridges those rules to Phaser and commits effects only after arrival and performance complete.

**Tech Stack:** TypeScript 7, React 19, Phaser 4.2.1, Fastify 5, Zod 4, Vitest 5, Playwright 1.63, IndexedDB/idb 8.

**Spec:** `docs/superpowers/specs/2026-09-29-roommate-exe-autonomous-interaction-design.md`

## Global Constraints

- Node.js must remain `>=20.12`; add no production dependency unless the user separately approves it.
- Keep `JEV_API_URL=https://opencode.ai/zen/v1/systemone` and `JEV_MODEL=jev-1.13-free`; never fall back to a paid or non-Jev model.
- Player queue capacity is exactly 3; unstarted entries are cancellable and reorderable.
- Normal Jev decisions contain at most 8 candidates and should contain 6–8 when enough legal, diverse actions exist; lease decisions remain exactly 2.
- Ship 19 MVP action definitions and four disruptive life events; move-in and lease expiry remain structural day markers rather than disruptions.
- Movement is part of a complete action intent; Jev never chooses raw coordinates or generated animation.
- Effects and facts commit atomically only after arrival and performance complete; cancellation or invalidation commits none.
- Player and simulation time continue through Jev request and parsing failures.
- API keys, raw provider payloads, and server prompts must never enter browser state, exports, logs, or error copy.
- Preserve the seven-day, 90-second-per-day default and existing renewal ending.

## Review Focus

- A queued target can disappear or become invalid before arrival: Task 3 pins invalidation with zero effects and continued queue processing.
- Both actors can arrive at the same object nearly together: Task 3 pins arrival-time reservation and loser re-planning.
- The world can change while Jev is answering: Task 7 pins stale-response discard without executing or pausing.
- Jev can wrap valid content in strings/code fences or omit optional probability data: Task 6 pins normalization without weakening model/candidate checks.
- The browser can reload during navigation or animation: Task 8 pins restoration of the last committed world with transient queues/actions cleared.

---

### Task 1: Versioned World and Action Contracts

**Files:**
- Modify: `src/shared/constants.ts`
- Modify: `src/shared/roommate-schemas.ts`
- Modify: `src/game/simulation/initial-state.ts`
- Modify: `src/game/actions/catalog.ts`
- Modify: `src/game/simulation/world-reducer.ts`
- Modify: `tests/shared/roommate-schemas.test.ts`
- Modify: `tests/fixtures/roommate.ts`

**Interfaces:**
- Produces: `ActionTarget { type: "self" | "object" | "character"; id: string | null }`, `QueuedAction { queueId: string; action: MacroAction }`, `ActiveAction { queueId: string; action: MacroAction; startedAt: string }`; Task 3 adopts the wrappers in live world execution.
- Produces: `RoommateWorld.relationship { trust: number; pressure: number }`, `environment { cleanliness: number; noise: number }`, and `jevControl { status: "active" | "paused"; consecutiveFailures: number }`. The old need fields remain intact until their atomic migration in Task 4.
- Produces: schema version `roommate-exe/2`; `MacroAction.definitionId` identifies the catalog rule while `MacroAction.id` uniquely identifies one candidate intent.

- [ ] **Step 1: Write failing schema tests**

Add tests asserting a fresh session parses with the new relationship, environment and Jev-control defaults; candidate ids remain unique when one definition targets two objects; action decisions accept 3–8 candidates while lease decisions require exactly 2; and a `roommate-exe/1` payload is rejected.

- [ ] **Step 2: Run the schema tests and verify failure**

Run: `npm test -- tests/shared/roommate-schemas.test.ts`

Expected: FAIL because the v2 fields and action wrapper schemas do not exist.

- [ ] **Step 3: Implement the v2 contracts and initial defaults**

Set initial `relationship` to `{ trust: 50, pressure: 20 }`, `environment` to `{ cleanliness: 70, noise: 10 }`, and `jevControl` to `{ status: "active", consecutiveFailures: 0 }`. Keep the existing hunger/energy/stress need contract unchanged in this commit; Task 4 replaces stress with mood/focus together with every consumer. Update fixture creation through `createInitialRoommateSession` rather than hand-authored compatibility data.

- [ ] **Step 4: Run contract verification**

Run: `npm test -- tests/shared/roommate-schemas.test.ts tests/game/world-reducer.test.ts && npm run typecheck`

Expected: PASS with no TypeScript errors.

- [ ] **Step 5: Commit**

```powershell
git add src/shared/constants.ts src/shared/roommate-schemas.ts src/game/simulation/initial-state.ts src/game/actions/catalog.ts src/game/simulation/world-reducer.ts tests/shared/roommate-schemas.test.ts tests/fixtures/roommate.ts
git commit -m "refactor: define autonomous interaction state"
```

### Task 2: Pure Apartment Navigation

**Files:**
- Create: `src/game/navigation/interaction-points.ts`
- Create: `src/game/navigation/pathfinder.ts`
- Create: `tests/game/pathfinder.test.ts`
- Modify: `src/game/render/apartment-layout.ts`

**Interfaces:**
- Consumes: object and room ids from the v2 world contract.
- Produces: `NavigationWaypoint { nodeId: string; roomId: string; x: number; y: number }`.
- Produces: `interactionPointFor(target: ActionTarget): NavigationWaypoint | null` and `findNavigationPath(fromRoomId: string, target: ActionTarget): NavigationWaypoint[] | null`.

- [ ] **Step 1: Write failing path tests**

Cover Jev-bedroom → fridge across landing/living-room/kitchen, player-bedroom → Jev character, same-room targets, unknown targets, and a disconnected room graph. Assert ordered room ids and final coordinates equal the target interaction point.

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npm test -- tests/game/pathfinder.test.ts`

Expected: FAIL because navigation modules are missing.

- [ ] **Step 3: Implement deterministic breadth-first pathfinding**

Store object and character interaction points beside the apartment layout. `findNavigationPath` must return the shortest room-node path plus the final interaction point and return `null` instead of throwing for unknown or unreachable targets.

- [ ] **Step 4: Verify navigation**

Run: `npm test -- tests/game/pathfinder.test.ts tests/game/apartment-layout.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/game/navigation src/game/render/apartment-layout.ts tests/game/pathfinder.test.ts
git commit -m "feat: add apartment action pathfinding"
```

### Task 3: Three-Slot Queue and Atomic Action Executor

**Files:**
- Create: `src/game/actions/action-queue.ts`
- Create: `src/game/actions/action-executor.ts`
- Create: `tests/game/action-queue.test.ts`
- Create: `tests/game/action-executor.test.ts`
- Modify: `src/game/simulation/world-reducer.ts`
- Modify: `src/shared/roommate-schemas.ts`
- Modify: `tests/game/world-reducer.test.ts`

**Interfaces:**
- Consumes: `findNavigationPath`, `QueuedAction`, `ActiveAction`, and `WorldCommand`.
- Produces: immutable `enqueue(queue, entry)`, `cancel(queue, queueId)`, `reorder(queue, queueId, toIndex)` with `PLAYER_QUEUE_CAPACITY = 3`.
- Produces: `ActionExecutionPort.navigate(actorId, queueId, waypoints, signal)` and `.perform(actorId, queueId, action, signal)` promises.
- Produces: `ActionExecutor.execute(entry): Promise<"completed" | "invalidated" | "cancelled">` and `cancel(queueId): void`.

- [ ] **Step 1: Write failing queue, conflict and cancellation tests**

Assert FIFO enqueue, fourth-entry rejection, reorder/cancel behavior, no reservation before arrival, first arrival reserves a shared object, the second arrival returns `invalidated`, cancellation before completion leaves needs/objects/facts unchanged, and an invalid first entry does not prevent the next queue entry from running.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm test -- tests/game/action-queue.test.ts tests/game/action-executor.test.ts tests/game/world-reducer.test.ts`

Expected: FAIL because queue/executor and arrival-time reservation do not exist.

- [ ] **Step 3: Implement queue, executor and reducer commands**

Change reducer commands to `start-action` with `ActiveAction`, `complete-action` by matching `queueId`, and `cancel-action` that only releases a reservation. The executor must re-resolve the action at arrival, start/reserve then perform, and call `complete-action` only after `perform` resolves; an aborted signal must never complete effects.

- [ ] **Step 4: Verify atomic execution**

Run: `npm test -- tests/game/action-queue.test.ts tests/game/action-executor.test.ts tests/game/world-reducer.test.ts`

Expected: PASS, including simultaneous-arrival and invalidated-target cases.

- [ ] **Step 5: Commit**

```powershell
git add src/game/actions/action-queue.ts src/game/actions/action-executor.ts src/game/simulation/world-reducer.ts tests/game/action-queue.test.ts tests/game/action-executor.test.ts tests/game/world-reducer.test.ts
git commit -m "feat: execute queued actions atomically"
```

### Task 4: Whole-Apartment Actions and Diverse Jev Candidates

**Files:**
- Modify: `src/game/actions/catalog.ts`
- Modify: `src/game/actions/affordance-resolver.ts`
- Modify: `src/game/actions/player-actions.ts`
- Create: `src/game/actions/candidate-ranking.ts`
- Modify: `src/game/jev/decision-snapshot.ts`
- Modify: `src/game/events/scheduler.ts`
- Modify: `src/game/events/seven-day-events.ts`
- Modify: `src/game/ending/lease-decision.ts`
- Modify: `src/client/roommate/NeedCue.tsx`
- Modify: `src/shared/roommate-schemas.ts`
- Modify: `src/game/simulation/initial-state.ts`
- Modify: `tests/game/action-catalog.test.ts`
- Modify: `tests/game/affordance-resolver.test.ts`
- Modify: `tests/game/decision-snapshot.test.ts`

**Interfaces:**
- Consumes: target-aware `MacroAction`, navigation reachability, needs, relationship, environment, facts and events.
- Produces: `resolveAllAffordances(world, actorId): MacroAction[]`, `selectDiverseCandidates(world, actions, limit = 8): MacroAction[]`, and `resolvePlayerTargetActions(world, target): MacroAction[]`.

- [ ] **Step 1: Write failing whole-apartment and diversity tests**

Assert the catalog contains the specified 19 actions and the schedule contains the specified four disruptions plus two structural markers. Assert Jev in its bedroom receives reachable kitchen and living-room actions; two beds create distinct action ids; a rich world yields 6–8 candidates spanning at least three categories; urgent hunger raises food relevance without forcing the final choice; immediate repeats are demoted; clicking Jev exposes valid social actions; helping can increase both trust and pressure; cleaning changes visible environment state; unreachable targets are excluded.

- [ ] **Step 2: Run focused resolver tests and verify failure**

Run: `npm test -- tests/game/action-catalog.test.ts tests/game/affordance-resolver.test.ts tests/game/decision-snapshot.test.ts`

Expected: FAIL because availability still requires same-room targets and the resolver slices fixed priority order.

- [ ] **Step 3: Implement target-aware definitions and deterministic ranking**

Remove same-room and pre-reservation checks from catalog availability; keep private-object rules. Retain exactly these 19 definitions for MVP: wait, observe-room, rest, sleep, cook-meal, eat-meal, buy-food, clean, take-trash, repair, watch-tv, work, shower, read-board, knock, invite, help, refuse and apologize. Generate every valid target intent, score relevance from state without selecting for Jev, group by category, take diverse group leaders before remaining scores, and use stable id ordering for ties. Replace `stress` with `mood` and `focus` across schemas, initial state, snapshot copy, event effects, ending placeholders and `NeedCue`. Pin action consequences as follows: rest/sleep/shower raise mood; work raises focus while lowering energy; television raises mood, lowers focus and raises noise; cooking lowers cleanliness; cleaning and taking trash raise cleanliness; invite/help/apologize raise trust; refuse lowers trust and raises pressure; help may also raise pressure when either actor has low energy. Keep day 2 last dinner, day 3 quiet night, day 4 visitor and day 6 illness/blackout as the four disruptions; day 1 move-in and day 7 lease stay as structural markers.

- [ ] **Step 4: Verify candidate behavior**

Run: `npm test -- tests/game/action-catalog.test.ts tests/game/affordance-resolver.test.ts tests/game/decision-snapshot.test.ts tests/integration/seven-day-simulation.test.ts`

Expected: PASS; snapshots contain legal, unique candidates only.

- [ ] **Step 5: Commit**

```powershell
git add src/game/actions src/game/jev/decision-snapshot.ts src/game/events/scheduler.ts src/game/events/seven-day-events.ts src/game/ending/lease-decision.ts src/client/roommate/NeedCue.tsx src/shared/roommate-schemas.ts src/game/simulation/initial-state.ts tests/game/action-catalog.test.ts tests/game/affordance-resolver.test.ts tests/game/decision-snapshot.test.ts tests/integration/seven-day-simulation.test.ts
git commit -m "feat: generate diverse whole-apartment choices"
```

### Task 5: Visible Two-Character Navigation and Performance

**Files:**
- Modify: `src/client/game/game-bridge.ts`
- Modify: `src/game/scenes/ApartmentScene.ts`
- Modify: `src/client/game/RoommateGame.tsx`
- Create: `tests/client/game-bridge.test.ts`
- Create: `tests/game/apartment-scene.test.ts`

**Interfaces:**
- Consumes: `ActionExecutionPort`, navigation waypoints and target-aware actions.
- Produces bridge requests `navigateAction`, `performAction`, `cancelVisualAction`; completion events carry `queueId` so repeated action definitions cannot cross-complete.
- Produces `createBridgeExecutionPort(bridge): ActionExecutionPort`.

- [ ] **Step 1: Write failing bridge lifecycle tests**

Assert navigation promises resolve only on matching `queueId`, cancellation rejects only that request, repeated action definitions stay isolated, both actor sprites can move concurrently, Jev ends in the target room, and scene shutdown removes pending listeners.

- [ ] **Step 2: Run focused bridge/scene tests and verify failure**

Run: `npm test -- tests/client/game-bridge.test.ts tests/game/apartment-scene.test.ts`

Expected: FAIL because Jev is not retained and `playAction` is only a delay.

- [ ] **Step 3: Implement sprite registry, waypoint movement and simple state animation**

Store sprites in `Map<CharacterId, Phaser.Physics.Arcade.Sprite>`. Tween each path segment at the existing movement speed, update facing, emit room arrival, then run a deterministic animation/timed pose. Show a small intent icon above Jev during navigation/performance and clear it on completion, cancellation or shutdown.

- [ ] **Step 4: Verify visible execution**

Run: `npm test -- tests/client/game-bridge.test.ts tests/game/apartment-scene.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/client/game src/game/scenes/ApartmentScene.ts tests/client/game-bridge.test.ts tests/game/apartment-scene.test.ts
git commit -m "feat: animate roommate navigation and actions"
```

### Task 6: Tolerant Jev Response Adapter with Strict Semantics

**Files:**
- Create: `src/server/providers/zen-response-adapter.ts`
- Create: `tests/server/zen-response-adapter.test.ts`
- Modify: `src/server/providers/zen.ts`
- Modify: `src/server/services/roommate-decision.ts`
- Modify: `tests/server/zen.test.ts`
- Modify: `tests/server/roommate-decision.test.ts`

**Interfaces:**
- Consumes: raw provider `unknown` plus the exact `SystemOneRequest`.
- Produces: `normalizeZenResponse(payload, request): SystemOneResponse` and a sanitized `ZenResponseError.reason` enum.
- Produces: optional normalized probabilities/confidence at the provider boundary; `RoommateDecision` stores `{}` and `null` respectively when absent.

- [ ] **Step 1: Write failing response-variant tests**

Cover standard payload, JSON string, fenced JSON, choice by id, exact label and one-based index, missing probability/confidence, extra probability keys, ambiguous labels, unknown candidates, malformed JSON, wrong model and incomplete answer keys. Assert no thrown message contains the raw payload.

- [ ] **Step 2: Run provider tests and verify failure**

Run: `npm test -- tests/server/zen-response-adapter.test.ts tests/server/zen.test.ts tests/server/roommate-decision.test.ts`

Expected: FAIL because parsing is strict and generic.

- [ ] **Step 3: Implement extraction, normalization and one repair retry**

Normalize syntax first, then map the choice uniquely to request criteria and finally enforce model/candidate semantics. Filter unknown probability keys and normalize the remaining sum when present. On a normalization error, `decideRoommateAction` retries once with the same snapshot and candidates, an added format-repair instruction, and a derived `/repair` idempotency-key suffix so an upstream cache cannot replay the malformed result; network retry limits remain unchanged.

- [ ] **Step 4: Verify secure response handling**

Run: `npm test -- tests/server/zen-response-adapter.test.ts tests/server/zen.test.ts tests/server/roommate-decision.test.ts tests/server/privacy.test.ts`

Expected: PASS with sanitized failures and no secret/raw-response leakage.

- [ ] **Step 5: Commit**

```powershell
git add src/server/providers src/server/services/roommate-decision.ts src/shared/schemas.ts src/shared/roommate-schemas.ts tests/server
git commit -m "fix: normalize valid Jev choice responses"
```

### Task 7: Non-Blocking Jev Autonomy and Session Orchestration

**Files:**
- Modify: `src/game/jev/autonomy-controller.ts`
- Modify: `src/client/roommate/use-roommate-session.ts`
- Modify: `tests/game/autonomy-controller.test.ts`
- Modify: `tests/client/roommate-app.test.tsx`
- Create: `tests/client/roommate-session.test.tsx`

**Interfaces:**
- Consumes: diverse candidates, `ActionExecutor`, bridge execution port and v2 Jev control state.
- Produces: `request(snapshot): Promise<"committed" | "stale" | "failed">`; failures increment only Jev control state and success resets it.
- Produces hook commands `enqueuePlayerAction`, `cancelQueuedAction`, `reorderQueuedAction`, `retryJev`; exposes `playerQueue`, `selectedTarget`, `thoughtEntries` and `jevStatus`.

- [ ] **Step 1: Write failing orchestration tests**

Assert player time and movement continue during a pending request; a changed revision discards the result; one/two failures create a no-effect hesitation then retry later; the third pauses only Jev; manual retry resumes Jev; success resets the count; an invalidated Jev target immediately requests a fresh decision; and player/Jev executors run concurrently.

- [ ] **Step 2: Run controller/session tests and verify failure**

Run: `npm test -- tests/game/autonomy-controller.test.ts tests/client/roommate-session.test.tsx tests/client/roommate-app.test.tsx`

Expected: FAIL because the current hook pauses the world on any Jev error and supports only one pending action per actor.

- [ ] **Step 3: Replace pending maps with queue/executor orchestration**

Maintain transient player/Jev execution state outside committed saves, start the next player entry automatically, and request Jev only after completion/invalidation/important event. Never dispatch world `pause` for provider errors. Add a timed, no-effect hesitation visual for failures and set `jevControl.status="paused"` only at three consecutive failures.

- [ ] **Step 4: Verify autonomous recovery and concurrency**

Run: `npm test -- tests/game/autonomy-controller.test.ts tests/client/roommate-session.test.tsx tests/client/roommate-app.test.tsx tests/integration/seven-day-simulation.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/game/jev/autonomy-controller.ts src/client/roommate/use-roommate-session.ts tests/game/autonomy-controller.test.ts tests/client/roommate-session.test.tsx tests/client/roommate-app.test.tsx tests/integration/seven-day-simulation.test.ts
git commit -m "feat: keep life running through Jev failures"
```

### Task 8: Context Actions, Queue UI, Thought Log and Safe Persistence

**Files:**
- Modify: `src/client/roommate/ActionMenu.tsx`
- Create: `src/client/roommate/ActionQueue.tsx`
- Create: `src/client/roommate/ThoughtLog.tsx`
- Create: `src/client/roommate/JevStatus.tsx`
- Modify: `src/client/roommate/RoommateApp.tsx`
- Modify: `src/client/roommate/GameHud.tsx`
- Modify: `src/client/styles/roommate.css`
- Modify: `src/client/state/roommate-repository.ts`
- Modify: `tests/client/action-menu.test.tsx`
- Create: `tests/client/action-queue.test.tsx`
- Modify: `tests/client/roommate-repository.test.ts`

**Interfaces:**
- Consumes: selected object/character target, player queue commands, thought entries and Jev control status.
- Produces: accessible action menu near the target, three-slot queue controls, non-modal thought log and “让 Jev 再想一次” recovery button.
- Produces repository behavior that ignores v1 sessions and restores only committed v2 state with empty transient queues/executors.

- [ ] **Step 1: Write failing UI and persistence tests**

Assert selecting another target leaves queued entries intact; object and Jev menus expose their current legal actions; queue shows three ordered slots and supports cancel plus drag/keyboard reorder; thought log labels selected action without requiring probabilities; Jev status is non-modal; v1 saves are ignored; reload during a mocked active action restores the previous committed world with no reservation or queued entry.

- [ ] **Step 2: Run focused UI/repository tests and verify failure**

Run: `npm test -- tests/client/action-menu.test.tsx tests/client/action-queue.test.tsx tests/client/roommate-repository.test.ts tests/client/roommate-app.test.tsx`

Expected: FAIL because the current modal menu clears selection and active execution is not version-safe.

- [ ] **Step 3: Implement compact non-modal controls and v2 recovery**

Keep scene visibility unobstructed, use at least 12px canvas labels and 14px React control text, do not apply pixelated rendering to text, and preserve keyboard focus/ARIA labels. Repository loading must use `safeParse`, skip unsupported sessions, and never persist transient queue or in-flight execution state.

- [ ] **Step 4: Verify UI, persistence and readability contracts**

Run: `npm test -- tests/client/action-menu.test.tsx tests/client/action-queue.test.tsx tests/client/roommate-repository.test.ts tests/client/roommate-app.test.tsx && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/client/roommate src/client/styles/roommate.css src/client/state/roommate-repository.ts tests/client
git commit -m "feat: add roommate action queue and thought log"
```

### Task 9: End-to-End Life Simulation and Release Verification

**Files:**
- Modify: `e2e/roommate-flow.spec.ts`
- Create: `e2e/roommate-failure-recovery.spec.ts`
- Modify: `tests/integration/seven-day-simulation.test.ts`
- Modify: `tests/release/roommate-release.test.ts`
- Modify: `src/server/providers/mock-zen.ts`
- Modify: `README.md`
- Modify: `docs/ROOMMATE-EXE-TECH-SPEC.md`

**Interfaces:**
- Consumes: the complete v2 browser and server flow.
- Produces: release evidence for queueing, visible Jev movement, conflict recovery, non-blocking provider failure, reload safety and seven-day ending.

- [ ] **Step 1: Write failing browser journeys**

The main journey must queue three actions across two rooms, verify the queue drains in order, observe Jev leave its bedroom and complete an object action, open the thought log, reload after a committed action, and finish the renewal ending. The recovery journey must inject three invalid responses, verify the clock/player continue, see “Jev 暂时走神了”, trigger retry, then observe a successful Jev movement.

- [ ] **Step 2: Run E2E tests and fix only integration defects**

Run: `npm run test:e2e`

Expected before fixes: FAIL at newly added v2 expectations; after integration corrections: all Playwright tests PASS without timing sleeps longer than the simulated action itself.

- [ ] **Step 3: Update product-facing technical documentation**

Document the three-slot queue, whole-apartment Jev decisions, arrival-time reservation, response normalization, Jev-only pause state, v2 save reset and local start instructions. Remove claims that any model error pauses the whole world.

- [ ] **Step 4: Run the complete release gate**

Run: `npm test && npm run typecheck && npm run build && npm run test:e2e`

Expected: every command exits 0. Then manually inspect the standard desktop viewport and confirm readable Chinese, both moving characters, intent icon, target menu, queue, thought log and Jev recovery status.

- [ ] **Step 5: Commit**

```powershell
git add e2e tests/integration tests/release src/server/providers/mock-zen.ts README.md docs/ROOMMATE-EXE-TECH-SPEC.md
git commit -m "test: verify autonomous roommate gameplay"
```
