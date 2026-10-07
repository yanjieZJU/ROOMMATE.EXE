# ROOMMATE.EXE MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the LIFE.EXE pixel-probability prototype with a complete 12–15 minute, seven-day cutaway-apartment simulation in which a visible Jev roommate autonomously selects executable macro actions and independently decides whether to renew the lease.

**Architecture:** Keep the existing Fastify/React shell, OpenCode Zen adapter, public guards, metrics, and IndexedDB patterns. Add a deterministic simulation core plus a Phaser 4 canvas layer; the client resolves legal affordances and commits atomic world transitions, while the server validates a bounded decision snapshot and asks `jev-1.13-free` one Choice question. React owns menus and ending/archive screens; Phaser owns the fixed cutaway, sprites, input, and animations.

**Tech Stack:** TypeScript 7, React 19, Phaser 4.2.1, Fastify 5, Zod 4, IndexedDB/idb, Vitest 5, Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-28-roommate-exe-design.md`

## Global Constraints

- Runtime floor is Node.js 20.12 because runtime `.env` loading uses `node:util.parseEnv`; update `package.json` from the stale `>=20.6` declaration.
- Pin `phaser` to exact version `4.2.1`; do not introduce a second rendering or physics engine.
- The full fixed cutaway remains visible at once: two private bedrooms and stair landing upstairs; kitchen, living room, bathroom, and entry/balcony downstairs.
- Default simulation length is seven 90,000 ms days, totaling roughly 12–15 minutes including transitions.
- Jev macro actions last 4,000–12,000 ms; a normal run targets 60–100 single-Choice calls with exactly 3–7 candidates per call.
- Only one Jev request may be in flight; stale state-hash responses never commit.
- Use only `https://opencode.ai/zen/v1/systemone` with `jev-1.13-free`; never silently use random behavior, an auxiliary model, or a paid model.
- Retry a retryable Jev decision exactly once with the same state and idempotency key; after exhaustion pause the world and require an explicit retry.
- Physical/world effects are deterministic engine rules. Jev chooses an action id but cannot create actions, effects, events, dialogue, art, or memories.
- No free text, photo upload, accounts, mobile controls, multi-agent town, procedural events, visible relationship meters, or generated personality summary in MVP.
- Preserve the user's uncommitted `.env.example`; every task stages exact paths and must never run `git add -A`.
- Before implementation begins, stop and ask the user to move the real key into ignored `.env` and restore `.env.example` to placeholders. Never automate, overwrite, or stage the current secret-bearing `.env.example` change.

## Review Focus

- A browser losing focus while a movement key is held must clear input rather than walking forever; Task 8 adds blur and visibility-change tests.
- A player action that changes the world while Jev is answering must invalidate the response and request again; Task 6 adds stale-hash and single-flight tests.
- Refresh during an unfinished animation or decision must restore only the last atomically committed transition; Task 7 adds crash-boundary repository tests.
- Any reachable Jev state must expose 3–7 legal actions, including a safe `wait` affordance when all object actions are blocked; Task 3 adds empty/blocked-world tests.
- Background-tab throttling or a large clock delta must not skip whole days or fire an event twice; Task 5 adds delta-clamp and idempotent-schedule tests.

---

### Task 1: ROOMMATE.EXE contracts and Phaser foundation

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/shared/constants.ts`
- Modify: `src/shared/schemas.ts`
- Create: `src/shared/roommate-schemas.ts`
- Create: `src/game/simulation/initial-state.ts`
- Create: `tests/fixtures/roommate.ts`
- Create: `tests/shared/roommate-schemas.test.ts`

**Interfaces:**
- Consumes: existing `UsageSchema`, `ChoiceAnswerSchema`, Zod conventions, and Vite/React build.
- Produces: `RoommateWorld`, `RoommateSession`, `MemoryFact`, `Commitment`, `MacroAction`, `DecisionSnapshot`, `RoommateDecision`, `ROOMMATE_SCHEMA_VERSION`, `ROOMMATE_DAY_COUNT`, `ROOMMATE_DAY_DURATION_MS`, and `createInitialRoommateSession(now: string): RoommateSession`.

- [ ] **Step 1: Write the failing shared-contract test**

Assert `createInitialRoommateSession("2026-09-28T00:00:00.000Z")` parses through `RoommateSessionSchema`, has schema `roommate-exe/1`, day `1`, elapsed `0`, two characters, the seven specified rooms, all required object ids, no personality adjectives, no decisions, and status `playing`. Assert malformed duplicate object ids, an eighth day, an action lasting outside 4,000–12,000 ms, and a decision with probabilities that omit the selected action fail parsing.

- [ ] **Step 2: Run the contract test and verify RED**

Run: `npm test -- tests/shared/roommate-schemas.test.ts`  
Expected: FAIL because `roommate-schemas.ts` and `createInitialRoommateSession` do not exist.

- [ ] **Step 3: Add the dependency and minimal contracts**

Run: `npm install --save-exact phaser@4.2.1`.

Set `engines.node` to `>=20.12`. Define the schemas and exported inferred types in `roommate-schemas.ts`; implement `createInitialRoommateSession` in `initial-state.ts`; keep the legacy LIFE schemas untouched until Task 12. Put the fixed background facts, room/object ids, initial needs, and default 90,000 ms day duration in constants/fixture builders rather than UI code.

- [ ] **Step 4: Verify contracts, typecheck, and build**

Run: `npm test -- tests/shared/roommate-schemas.test.ts && npm run typecheck && npm run build`  
Expected: the new test passes; TypeScript and both Vite bundles succeed.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/shared/constants.ts src/shared/schemas.ts src/shared/roommate-schemas.ts src/game/simulation/initial-state.ts tests/fixtures/roommate.ts tests/shared/roommate-schemas.test.ts
git commit -m "feat: establish ROOMMATE.EXE contracts"
```

### Task 2: Deterministic world reducer and atomic action effects

**Files:**
- Create: `src/game/simulation/world-reducer.ts`
- Create: `src/game/simulation/state-hash.ts`
- Create: `tests/game/world-reducer.test.ts`
- Create: `tests/game/state-hash.test.ts`

**Interfaces:**
- Consumes: `RoommateWorld`, `MacroAction`, and `MemoryFact` from Task 1.
- Produces: `applyWorldCommand(world: RoommateWorld, command: WorldCommand): RoommateWorld`, `completeMacroAction(world: RoommateWorld, action: MacroAction, completedAt: string): RoommateWorld`, and `hashDecisionState(snapshot: DecisionSnapshot): Promise<string>`.

- [ ] **Step 1: Write failing reducer and hash tests**

Assert movement clamps to the fixed navigation graph; starting an action reserves its actor/object; completion atomically updates needs, inventory/object state, location, facts, revision, and clears reservations; invalid preconditions leave the original object untouched and throw `INVALID_INPUT`. Assert identical canonical decision snapshots hash equally regardless of object-key insertion order and a changed fact/action id changes the hash.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `npm test -- tests/game/world-reducer.test.ts tests/game/state-hash.test.ts`  
Expected: FAIL on missing modules.

- [ ] **Step 3: Implement immutable command handling**

Use a discriminated `WorldCommand` union for movement, action start, action completion, event application, pause/resume, and day transition. Validate before cloning; increment `world.revision` exactly once per successful command. Canonicalize recursively before SHA-256 hashing.

- [ ] **Step 4: Verify reducer tests and domain regression**

Run: `npm test -- tests/game/world-reducer.test.ts tests/game/state-hash.test.ts tests/domain`  
Expected: all focused and legacy domain tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/game/simulation/world-reducer.ts src/game/simulation/state-hash.ts tests/game/world-reducer.test.ts tests/game/state-hash.test.ts
git commit -m "feat: add atomic apartment world rules"
```

### Task 3: Action catalog and legal affordance resolution

**Files:**
- Create: `src/game/actions/catalog.ts`
- Create: `src/game/actions/affordance-resolver.ts`
- Create: `src/game/actions/player-actions.ts`
- Create: `tests/game/action-catalog.test.ts`
- Create: `tests/game/affordance-resolver.test.ts`

**Interfaces:**
- Consumes: `RoommateWorld`, `MacroAction`, `completeMacroAction`.
- Produces: `ACTION_CATALOG: ReadonlyMap<string, ActionDefinition>`, `resolveAffordances(world: RoommateWorld, actorId: CharacterId): MacroAction[]`, and `resolvePlayerObjectActions(world: RoommateWorld, objectId: string): MacroAction[]`.

- [ ] **Step 1: Write failing catalog and affordance tests**

Assert the catalog contains 20–30 reusable actions across movement/rest, cook/eat, clean/repair, use/borrow/return, knock/invite/help/refuse/apologize/leave-interaction. Assert every definition has 4,000–12,000 ms duration, deterministic effects, an animation key, and at least one fact template. Assert a blocked world still returns `wait` plus enough observation/rest choices to keep Jev candidates between 3 and 7; occupied/broken/private objects exclude illegal actions; player menus use the same definitions but never include autonomous-only actions.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- tests/game/action-catalog.test.ts tests/game/affordance-resolver.test.ts`  
Expected: FAIL on missing action modules.

- [ ] **Step 3: Implement data-driven actions and pure resolvers**

Define `ActionDefinition` with `isAvailable(world, actorId, targetId?)`, `toMacroAction(...)`, and `apply(world, action)` boundaries. Sort candidates by stable priority and id, then cap at 7; guarantee at least 3 without inventing impossible object effects.

- [ ] **Step 4: Verify action and reducer suites**

Run: `npm test -- tests/game/action-catalog.test.ts tests/game/affordance-resolver.test.ts tests/game/world-reducer.test.ts`  
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/game/actions tests/game/action-catalog.test.ts tests/game/affordance-resolver.test.ts
git commit -m "feat: resolve executable roommate actions"
```

### Task 4: Memory ledger and bounded decision context

**Files:**
- Create: `src/game/memory/ledger.ts`
- Create: `src/game/memory/relevance.ts`
- Create: `src/game/jev/decision-snapshot.ts`
- Create: `tests/game/memory-ledger.test.ts`
- Create: `tests/game/decision-snapshot.test.ts`

**Interfaces:**
- Consumes: `RoommateWorld`, `MemoryFact`, `Commitment`, `MacroAction`, `hashDecisionState`.
- Produces: `appendFacts(world, facts): RoommateWorld`, `selectRelevantFacts(world, context, limit?: number): MemoryFact[]`, and `buildDecisionSnapshot(world, candidates): Promise<DecisionSnapshot>`.

- [ ] **Step 1: Write failing memory-selection tests**

Assert facts are idempotent by id; unresolved commitments/conflicts are always included; facts matching current people, room, or target objects outrank unrelated recency; at most 12 ordinary facts are emitted; the output uses concise Chinese factual sentences and contains no relationship score or personality adjective. Assert the snapshot includes 3–7 action ids/costs, observable state only, and a valid canonical hash.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- tests/game/memory-ledger.test.ts tests/game/decision-snapshot.test.ts`  
Expected: FAIL on missing memory/snapshot modules.

- [ ] **Step 3: Implement deterministic fact relevance**

Score only explicit features: unresolved first, then same actor/room/object, then recency, with fact id as final tiebreaker. Render needs as named levels (`饱足/有些饿/饥饿`, etc.); never send raw relationship or renewal values because none exist.

- [ ] **Step 4: Verify memory, action, and hash tests**

Run: `npm test -- tests/game/memory-ledger.test.ts tests/game/decision-snapshot.test.ts tests/game/state-hash.test.ts tests/game/affordance-resolver.test.ts`  
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/game/memory src/game/jev/decision-snapshot.ts tests/game/memory-ledger.test.ts tests/game/decision-snapshot.test.ts
git commit -m "feat: build bounded roommate memories"
```

### Task 5: Seven-day clock and fixed event scheduler

**Files:**
- Create: `src/game/simulation/clock.ts`
- Create: `src/game/events/seven-day-events.ts`
- Create: `src/game/events/scheduler.ts`
- Create: `tests/game/clock.test.ts`
- Create: `tests/game/event-scheduler.test.ts`

**Interfaces:**
- Consumes: `RoommateWorld`, `applyWorldCommand`, room/object ids from Task 1.
- Produces: `advanceSimulationClock(world, deltaMs, config?): ClockAdvance`, `eventsDue(previous, next): ScheduledEvent[]`, and `applyScheduledEvent(world, event): RoommateWorld`.

- [ ] **Step 1: Write failing clock and seven-event tests**

Assert default days last 90,000 ms; negative deltas are rejected; a foreground delta is clamped to 1,000 ms per tick; crossing a day boundary emits exactly one transition; replaying the same event id is idempotent. Assert the seven authored events occur in order and create concrete world changes for boxes, food, quiet-work constraint, visitor, broken appliance, illness/blackout, and lease decision. Assert every event exposes at least three legal handling paths through the action catalog.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- tests/game/clock.test.ts tests/game/event-scheduler.test.ts`  
Expected: FAIL on missing clock/event modules.

- [ ] **Step 3: Implement monotonic clock and idempotent schedule**

Advance only while status is `playing`; store applied event ids in the world. Permit `SIMULATION_DAY_MS` injection for tests but validate production values as positive integers. Day 7 stops at the lease phase rather than advancing to day 8.

- [ ] **Step 4: Verify clock/event and action suites**

Run: `npm test -- tests/game/clock.test.ts tests/game/event-scheduler.test.ts tests/game/affordance-resolver.test.ts`  
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/game/simulation/clock.ts src/game/events tests/game/clock.test.ts tests/game/event-scheduler.test.ts
git commit -m "feat: schedule seven days of apartment life"
```

### Task 6: Jev roommate decision service, route, and stale-response guard

**Files:**
- Create: `src/server/services/roommate-decision.ts`
- Create: `src/server/routes/roommate.ts`
- Modify: `src/server/providers/zen.ts`
- Modify: `src/server/app.ts`
- Modify: `src/client/api/client.ts`
- Create: `src/game/jev/autonomy-controller.ts`
- Create: `tests/server/roommate-decision.test.ts`
- Create: `tests/game/autonomy-controller.test.ts`

**Interfaces:**
- Consumes: `ZenClient`, `DecisionSnapshot`, `RoommateDecision`, `hashDecisionState`, metrics/quota-wrapped server app.
- Produces: `decideRoommateAction(snapshot, client): Promise<RoommateDecision>`, `POST /api/roommate/decision`, `ApiClient.decideRoommate(snapshot)`, and `JevAutonomyController.request(snapshot): Promise<"committed" | "stale">`.

- [ ] **Step 1: Write failing server and controller tests**

Assert the server sends one Chinese Choice question whose criteria keys exactly match 3–7 action ids; factual state contains no hidden numbers or unavailable actions; mismatched state hash, unknown selected id, incomplete probabilities, and paid model responses are rejected. Assert retryable errors cause exactly two attempts with one idempotency key; non-retryable errors attempt once. Assert a second request cannot start while one is pending, a changed world hash discards the first response, and the refreshed snapshot can commit.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- tests/server/roommate-decision.test.ts tests/game/autonomy-controller.test.ts`  
Expected: FAIL on missing service/controller.

- [ ] **Step 3: Implement one-Choice transport boundary**

Register the route behind existing public hooks. Recompute the canonical snapshot hash server-side before calling Zen. Extend the existing Zen adapter with an explicit per-call `maxAttempts` option and set it to `2` for roommate decisions; the service/controller must not add a second retry loop. Preserve endpoint/model enforcement and reuse the same idempotency key for both attempts.

- [ ] **Step 4: Verify roommate and Zen transport suites**

Run: `npm test -- tests/server/roommate-decision.test.ts tests/game/autonomy-controller.test.ts tests/server/zen.test.ts tests/server/quota.test.ts tests/server/privacy.test.ts`  
Expected: all pass and no content appears in metrics snapshots.

- [ ] **Step 5: Commit**

```bash
git add src/server/services/roommate-decision.ts src/server/routes/roommate.ts src/server/providers/zen.ts src/server/app.ts src/client/api/client.ts src/game/jev/autonomy-controller.ts tests/server/roommate-decision.test.ts tests/game/autonomy-controller.test.ts
git commit -m "feat: drive roommate actions with Jev"
```

### Task 7: Atomic roommate persistence, resume, and privacy-safe export

**Files:**
- Create: `src/client/state/roommate-repository.ts`
- Create: `src/client/export/roommate-export.ts`
- Create: `tests/client/roommate-repository.test.ts`
- Create: `tests/client/roommate-export.test.ts`

**Interfaces:**
- Consumes: `RoommateSessionSchema`, `RoommateWorld`, `RoommateDecision`, completed macro actions.
- Produces: `RoommateRepository.loadLatest()`, `commitTransition(session, transition)`, `savePaused(session)`, `importSession(json)`, and `exportRoommateSession(session): string`.

- [ ] **Step 1: Write failing persistence/export tests**

Use `fake-indexeddb/auto`. Assert completing an action atomically stores world, facts, and optional decision; throwing before transaction completion leaves the prior committed revision; refresh during an active action/decision loads the prior revision with no reservations; malformed/wrong-version import fails. Assert export retains seven-day facts and decisions but removes API keys, IPs, installation/quota ids, server log ids, raw prompts, and idempotency keys.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- tests/client/roommate-repository.test.ts tests/client/roommate-export.test.ts`  
Expected: FAIL on missing repository/export modules.

- [ ] **Step 3: Implement a separate versioned object store**

Use a `roommateSessions` store keyed by session id plus `updatedAt` index; do not mutate or migrate legacy LIFE sessions. Persist only completed transitions. Validate every read/import with `RoommateSessionSchema`.

- [ ] **Step 4: Verify persistence and legacy repository suites**

Run: `npm test -- tests/client/roommate-repository.test.ts tests/client/roommate-export.test.ts tests/client/session-repository.test.ts`  
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/client/state/roommate-repository.ts src/client/export/roommate-export.ts tests/client/roommate-repository.test.ts tests/client/roommate-export.test.ts
git commit -m "feat: persist atomic roommate sessions"
```

### Task 8: Phaser cutaway scene, pixel textures, and hybrid controls

**Files:**
- Create: `src/game/render/apartment-layout.ts`
- Create: `src/game/render/pixel-texture.ts`
- Create: `src/game/render/texture-atlas.ts`
- Create: `src/game/input/input-state.ts`
- Create: `src/game/scenes/ApartmentScene.ts`
- Create: `src/client/game/RoommateGame.tsx`
- Create: `src/client/game/game-bridge.ts`
- Create: `tests/game/apartment-layout.test.ts`
- Create: `tests/game/pixel-texture.test.ts`
- Create: `tests/game/input-state.test.ts`

**Interfaces:**
- Consumes: fixed rooms/objects, `RoommateWorld`, action animation keys, Phaser 4.2.1.
- Produces: `APARTMENT_LAYOUT`, `createPixelTexture(scene, definition)`, `InputState`, `ApartmentScene`, and bridge events `objectSelected`, `playerMoved`, `animationCompleted`, `sceneReady`.

- [ ] **Step 1: Write failing layout, texture, and input tests**

Assert all seven spaces and 12–16 objects fit inside a 480×270 logical canvas without overlap outside bounds; both characters have valid spawn/navigation nodes; every action animation key exists in the texture atlas; the palette uses the approved dark outline, cream, coral, warm orange, deep teal, cool blue, and green colors; texture scaling is integer and smoothing disabled. Assert opposite movement keys cancel deterministically, keyup clears movement, and `blur`/`visibilitychange` clear all held keys.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- tests/game/apartment-layout.test.ts tests/game/pixel-texture.test.ts tests/game/input-state.test.ts`  
Expected: FAIL on missing render/input modules.

- [ ] **Step 3: Implement the fixed scene and code-native pixel atlas**

Compose the cutaway from small palette-indexed pixel definitions so visuals remain crisp and testable without generated runtime art. Use Arcade movement only for the player; Jev follows the navigation graph/tweens selected by the action executor. Dynamically create/destroy one Phaser game per mounted `RoommateGame` and publish semantic bridge events rather than mutating React state from the scene.

- [ ] **Step 4: Verify renderer/input tests, typecheck, and build**

Run: `npm test -- tests/game/apartment-layout.test.ts tests/game/pixel-texture.test.ts tests/game/input-state.test.ts && npm run typecheck && npm run build`  
Expected: all tests pass; client/server bundles build with Phaser lazy-loaded into the game route.

- [ ] **Step 5: Commit**

```bash
git add src/game/render src/game/input src/game/scenes src/client/game tests/game/apartment-layout.test.ts tests/game/pixel-texture.test.ts tests/game/input-state.test.ts
git commit -m "feat: render the cutaway roommate apartment"
```

### Task 9: React game shell, contextual action menu, and diegetic HUD

**Files:**
- Create: `src/client/roommate/RoommateApp.tsx`
- Create: `src/client/roommate/use-roommate-session.ts`
- Create: `src/client/roommate/GameHud.tsx`
- Create: `src/client/roommate/ActionMenu.tsx`
- Create: `src/client/roommate/PauseOverlay.tsx`
- Create: `src/client/roommate/NeedCue.tsx`
- Modify: `src/client/main.tsx`
- Modify: `src/client/styles/tokens.css`
- Create: `src/client/styles/roommate.css`
- Create: `tests/client/roommate-app.test.tsx`
- Create: `tests/client/action-menu.test.tsx`

**Interfaces:**
- Consumes: `RoommateGame`, bridge events, `resolvePlayerObjectActions`, clock/scheduler, repository, autonomy controller.
- Produces: a start/resume game flow, date/time HUD, click-driven object/Jev action menu, keyboard movement, visible need cues, pause/retry overlay, and injectable dependencies for tests.

- [ ] **Step 1: Write failing UI orchestration tests**

Assert start creates the fixed factual Jev session; selecting an object lists only legal contextual actions; choosing an action closes the menu and commits after animation completion; no relationship/trust/renewal number is rendered; hungry/tired/stressed cues render as icons/animation labels; provider exhaustion pauses time and exposes one retry control. Assert focus loss clears movement through the bridge.

- [ ] **Step 2: Run focused UI tests and verify RED**

Run: `npm test -- tests/client/roommate-app.test.tsx tests/client/action-menu.test.tsx`  
Expected: FAIL on missing roommate components.

- [ ] **Step 3: Implement the React orchestration shell**

Keep simulation state in `useRoommateSession`; Phaser receives immutable snapshots and emits inputs/animation completion. React never updates physical state directly except through reducer commands. Add accessible keyboard equivalents for object selection and action choice.

- [ ] **Step 4: Verify UI, game, and API client tests**

Run: `npm test -- tests/client/roommate-app.test.tsx tests/client/action-menu.test.tsx tests/game tests/client/api-client.test.ts`  
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/client/roommate src/client/main.tsx src/client/styles/tokens.css src/client/styles/roommate.css tests/client/roommate-app.test.tsx tests/client/action-menu.test.tsx
git commit -m "feat: make the apartment playable"
```

### Task 10: Lease ending and post-game decision archive

**Files:**
- Create: `src/game/ending/lease-decision.ts`
- Create: `src/game/ending/key-decisions.ts`
- Create: `src/client/roommate/LeaseEnding.tsx`
- Create: `src/client/roommate/DecisionArchive.tsx`
- Create: `tests/game/lease-decision.test.ts`
- Create: `tests/game/key-decisions.test.ts`
- Create: `tests/client/lease-ending.test.tsx`

**Interfaces:**
- Consumes: day-7 `RoommateSession`, `DecisionArchive`, existing roommate decision endpoint.
- Produces: `submitPlayerLeaseChoice(session, choice)`, `requestJevLeaseChoice(session)`, `classifyLeaseEnding(player, jev): LeaseEndingKind`, and `selectKeyDecisions(session, limit?: number): ArchivedDecision[]`.

- [ ] **Step 1: Write failing ending/archive tests**

Assert the player choice is stored but not revealed until Jev answers; Jev receives exactly `renew` and `leave`; all four combinations map to distinct ending copy; no best-ending score or personality summary is produced. Assert key-decision selection includes the final lease choice plus event-linked high-impact decisions, preserves original facts/candidates/probabilities/consequences, follows later fact references, and never regenerates content.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- tests/game/lease-decision.test.ts tests/game/key-decisions.test.ts tests/client/lease-ending.test.tsx`  
Expected: FAIL on missing ending modules.

- [ ] **Step 3: Implement simultaneous card reveal and archive UI**

Use the approved two-card stamp presentation. Hide probabilities until both cards are revealed; archive navigation is optional after reveal and ordered chronologically.

- [ ] **Step 4: Verify ending, UI, and export suites**

Run: `npm test -- tests/game/lease-decision.test.ts tests/game/key-decisions.test.ts tests/client/lease-ending.test.tsx tests/client/roommate-export.test.ts`  
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/game/ending src/client/roommate/LeaseEnding.tsx src/client/roommate/DecisionArchive.tsx tests/game/lease-decision.test.ts tests/game/key-decisions.test.ts tests/client/lease-ending.test.tsx
git commit -m "feat: reveal lease choices and Jev decisions"
```

### Task 11: Complete seven-day integration and browser E2E

**Files:**
- Modify: `src/server/config.ts`
- Modify: `src/server/app.ts`
- Modify: `e2e/life-flow.spec.ts` (rename to `e2e/roommate-flow.spec.ts`)
- Modify: `playwright.config.ts`
- Create: `tests/integration/seven-day-simulation.test.ts`

**Interfaces:**
- Consumes: all simulation/game/server/UI modules from Tasks 1–10.
- Produces: a production-served seven-day game, mock-Zen fast-time configuration, and one end-to-end executable acceptance scenario.

- [ ] **Step 1: Write failing integration and E2E scenarios**

The integration test runs seven 90,000 ms days with a deterministic Choice sequence and asserts each event applies once, 60–100 legal Jev decisions complete, the session reaches lease phase, and all transitions validate. The Playwright flow uses explicit `JEV_MODE=mock` and `SIMULATION_DAY_MS=900`, moves with keyboard, clicks an object, chooses a contextual action, observes a need cue, refreshes during an in-flight Jev decision, resumes the last commit, completes seven days, chooses renew, reveals both cards, opens the decision archive, and exports JSON.

- [ ] **Step 2: Run integration/E2E and verify RED**

Run: `npm test -- tests/integration/seven-day-simulation.test.ts && npm run test:e2e`  
Expected: FAIL until all orchestration/config wiring is complete and the old E2E is replaced.

- [ ] **Step 3: Wire fast-time mock config and final orchestration**

Add validated `simulation.dayDurationMs` server/public configuration; default 90,000 and allow 900 only in explicit mock/E2E environment. Serve the same client build and `/api/health`; keep real-provider code out of E2E.

- [ ] **Step 4: Run complete product verification**

Run: `npm test && npm run typecheck && npm run build && npm run test:e2e`  
Expected: every command exits 0; the E2E completes without a provider key.

- [ ] **Step 5: Commit**

```bash
git add src/server/config.ts src/server/app.ts e2e/roommate-flow.spec.ts playwright.config.ts tests/integration/seven-day-simulation.test.ts
git rm e2e/life-flow.spec.ts
git commit -m "feat: complete the seven-day roommate game"
```

### Task 12: Remove superseded LIFE.EXE product code and publish ROOMMATE.EXE docs

**Files:**
- Delete: `src/client/canvas/`
- Delete: `src/client/screens/EventScreen.tsx`
- Delete: `src/client/screens/RevealScreen.tsx`
- Delete: `src/client/screens/SetupScreen.tsx`
- Delete: `src/client/components/ProbabilityBars.tsx`
- Delete: `src/client/components/WorldStatus.tsx`
- Delete: `src/domain/fingerprint.ts`
- Delete: `src/domain/locking.ts`
- Delete: `src/domain/pixels.ts`
- Delete: `src/domain/world.ts`
- Delete: `src/server/providers/auxiliary.ts`
- Delete: `src/server/providers/mock-auxiliary.ts`
- Delete: `src/server/routes/action.ts`
- Delete: `src/server/routes/blueprint.ts`
- Delete: `src/server/routes/events.ts`
- Delete: `src/server/routes/pixels.ts`
- Delete: `src/server/services/action-decision.ts`
- Delete: `src/server/services/blueprint.ts`
- Delete: `src/server/services/event-service.ts`
- Delete: `src/server/services/pixel-decision.ts`
- Delete: corresponding legacy tests and fixtures after new E2E/build pass
- Create: `docs/ROOMMATE-EXE-PRD.md`
- Create: `docs/ROOMMATE-EXE-TECH-SPEC.md`
- Move: `docs/LIFE-EXE-PRD.md` to `docs/archive/LIFE-EXE-PRD.md`
- Move: `docs/LIFE-EXE-TECH-SPEC.md` to `docs/archive/LIFE-EXE-TECH-SPEC.md`
- Modify: `README.md`
- Modify: `scripts/jev-spike.mjs`
- Modify: `scripts/jev-spike.test.mjs`
- Create: `tests/release/roommate-release.test.ts`

**Interfaces:**
- Consumes: green production build/E2E from Task 11 and the approved design spec.
- Produces: one coherent ROOMMATE.EXE repository with no reachable LIFE pixel/event API surface, current public documentation, and unchanged Jev/guard infrastructure.

- [ ] **Step 1: Add failing dead-surface and documentation checks**

Create `tests/release/roommate-release.test.ts` that imports the production app, asserts old `/api/decisions/pixels`, `/api/events/suggest`, `/api/aux/blueprint`, and `/api/decisions/action` return 404, asserts `/api/roommate/decision` exists, and asserts public health/model configuration remains secret-free.

- [ ] **Step 2: Run the release test and verify RED**

Run: `npm test -- tests/release/roommate-release.test.ts`  
Expected: FAIL because legacy routes/modules remain.

- [ ] **Step 3: Remove old product surfaces only after a green Task 11 build**

Delete legacy files/tests with exact `git rm` paths, then remove legacy schema exports/constants only after `rg` confirms no ROOMMATE import depends on them. Write the user-facing PRD and technical spec from the approved design, archive rather than erase the old docs, and update README commands/privacy/architecture. Rewrite the Jev spike and its test to exercise 3- and 7-action roommate decisions plus the 2-option lease decision. Do not alter or stage `.env.example` while the user's secret-bearing change exists; obsolete variable cleanup waits until the user has moved the key to ignored `.env` and restored the example file themselves.

- [ ] **Step 4: Run final verification and real free-model probe**

Run: `npm test && npm run typecheck && npm run build && npm run test:e2e && node --test scripts/jev-spike.test.mjs`  
Run: `rg -n "SemanticCanvas|PixelDecision|LifeEvent|auxiliary" src` and inspect every remaining match; production imports/routes must have none.  
Then run one redacted real probe using `.env` for 3 and 7 action candidates plus the 2-option lease decision. Expected: all local commands pass; real calls use only `jev-1.13-free`, return complete distributions, record latency/usage/retry count, and never print the key or scenario text. If the real probe fails, document that the product is not public-ready; do not enable a paid fallback.

- [ ] **Step 5: Commit**

```bash
git add README.md docs/ROOMMATE-EXE-PRD.md docs/ROOMMATE-EXE-TECH-SPEC.md docs/archive/LIFE-EXE-PRD.md docs/archive/LIFE-EXE-TECH-SPEC.md scripts/jev-spike.mjs scripts/jev-spike.test.mjs tests/release/roommate-release.test.ts
git commit -m "feat: replace LIFE.EXE with ROOMMATE.EXE"
```

## Final Review Checklist

- [ ] Compare every section of `docs/superpowers/specs/2026-09-28-roommate-exe-design.md` to Tasks 1–12; no requirement is unowned.
- [ ] Confirm all cross-task types and names match the Interfaces blocks.
- [ ] Confirm every Review Focus item has the named regression test.
- [ ] Inspect `git diff` for `.env` values, user-owned changes, paid-model strings, raw prompts in metrics, and accidental legacy route reachability.
- [ ] Run the complete verification command from Task 12 on final HEAD before claiming completion.
