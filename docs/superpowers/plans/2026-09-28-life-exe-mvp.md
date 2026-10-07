# LIFE.EXE MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing ticket-triage prototype with a public, Chinese-language LIFE.EXE demo in which Jev chooses a protagonist's actions and evolves a 24×24 semantic grayscale canvas across a nine-turn life.

**Architecture:** A React/Vite browser app owns the full user session, IndexedDB persistence, canvas rendering, comparison slider, and exports. A Fastify server validates requests, protects provider keys, calls OpenCode Zen and an OpenAI-compatible auxiliary multimodal provider, and returns atomic typed results without retaining user content. Pure domain modules own consequences, fingerprints, pixel math, locking, and replay semantics so the behavior is testable without either provider.

**Tech Stack:** Node.js 24+, TypeScript, React, Vite, Fastify, Zod, Canvas 2D, IndexedDB (`idb`), JSZip, Vitest, Playwright, npm.

**Spec:** `docs/LIFE-EXE-TECH-SPEC.md` and `docs/LIFE-EXE-PRD.md`

## Global Constraints

- UI and all Jev state/question content are Chinese; no translation layer.
- OpenCode Zen endpoint is `https://opencode.ai/zen/v1/systemone`; model is `jev-1.13-free`; never auto-fallback to a paid model.
- Read the Zen key from `OPENCODE_API_KEY`, falling back to the existing `TYPESAFE_API_KEY`; never log either value.
- The auxiliary model may create semantic structure but may not choose the protagonist's action or output final pixel darkness.
- MVP uses only Jev `Choice`: one action Choice, initial `ink/paper` Choices, and evolving `darken/preserve/fade` Choices.
- Canvas dimensions are exactly 24×24. Darkness is stored at full precision in `[0,1]` and rendered in five grayscale levels.
- A turn commits only after every provider result and the complete `frameAfter` are available.
- Original photos never enter IndexedDB, logs, exports, traces, or disk storage.
- No account system, server-side content database, public gallery, Noul, Score, hard black/white mode, or per-pixel inspector.
- The current directory is not a Git repository. Do not run `git init` or create commits unless the user separately requests it; treat each full green test run as the task checkpoint.

## File Structure

```text
jev-ticket-demo/
├─ package.json                     # scripts and dependencies
├─ tsconfig.json                    # shared TypeScript configuration
├─ vite.config.ts                   # client build and dev proxy
├─ playwright.config.ts             # browser test configuration
├─ index.html                       # Vite entry document
├─ .env.example                     # variable names and non-secret defaults
├─ scripts/
│  ├─ jev-spike.mjs                 # real Zen batch feasibility probe
│  └─ jev-spike.test.mjs            # mocked probe safety tests
├─ src/
│  ├─ shared/
│  │  ├─ schemas.ts                 # Zod contracts and inferred shared types
│  │  └─ constants.ts               # 24×24, 9 turns, model id, pixel step
│  ├─ domain/
│  │  ├─ world.ts                   # deterministic consequence application
│  │  ├─ pixels.ts                  # gray update, quantization, cell ids
│  │  ├─ fingerprint.ts             # probability-weighted four-axis result
│  │  └─ locking.ts                 # canonical JSON and SHA-256 lock hash
│  ├─ server/
│  │  ├─ index.ts                   # process entry and static production serving
│  │  ├─ app.ts                     # Fastify app factory
│  │  ├─ config.ts                  # validated environment, no secret logging
│  │  ├─ errors.ts                  # stable ApiError mapping
│  │  ├─ providers/
│  │  │  ├─ zen.ts                  # OpenCode Zen System One adapter
│  │  │  ├─ auxiliary.ts            # OpenAI-compatible auxiliary adapter
│  │  │  └─ mock-auxiliary.ts       # explicit local/test provider only
│  │  ├─ services/
│  │  │  ├─ idempotency-cache.ts     # short-lived validated-output cache
│  │  │  ├─ action-decision.ts       # action prompt and validated choice
│  │  │  ├─ pixel-decision.ts        # pixel prompts, batching, atomic result
│  │  │  ├─ blueprint.ts             # photo/anonymous blueprint orchestration
│  │  │  └─ event-service.ts         # cards, structure, lock validation
│  │  ├─ guards/
│  │  │  ├─ quota.ts                 # installation/day, IP window, kill switch
│  │  │  ├─ quota-store.ts           # memory/local and Redis/public stores
│  │  │  └─ metrics.ts               # content-free provider telemetry
│  │  └─ routes/
│  │     ├─ health.ts
│  │     ├─ blueprint.ts
│  │     ├─ events.ts
│  │     ├─ action.ts
│  │     └─ pixels.ts
│  └─ client/
│     ├─ main.tsx
│     ├─ App.tsx                     # screen-level state machine
│     ├─ state/
│     │  ├─ session-reducer.ts
│     │  └─ session-repository.ts    # IndexedDB atomic storage/import
│     ├─ api/client.ts               # typed API client
│     ├─ canvas/
│     │  ├─ PixelCanvas.tsx
│     │  ├─ BeforeAfterSlider.tsx
│     │  └─ render.ts                # Canvas 2D and long-scroll composition
│     ├─ export/export-session.ts    # PNG, ZIP, experiment JSON
│     ├─ screens/
│     │  ├─ HomeScreen.tsx
│     │  ├─ SetupScreen.tsx
│     │  ├─ EventScreen.tsx
│     │  ├─ RevealScreen.tsx
│     │  └─ EndingScreen.tsx
│     ├─ components/
│     │  ├─ RetroWindow.tsx
│     │  ├─ TypewriterText.tsx
│     │  ├─ ProbabilityBars.tsx
│     │  └─ WorldStatus.tsx
│     └─ styles/
│        ├─ tokens.css
│        └─ app.css
├─ tests/
│  ├─ domain/
│  ├─ server/
│  ├─ client/
│  └─ fixtures/
└─ e2e/life-flow.spec.ts
```

## Review Focus

- A user edits a locked action while an earlier request is in flight: reject stale results using `lockedHash`; tested in Task 6.
- One pixel batch fails after others succeed: publish no partial frame and preserve the previous committed turn; tested in Task 5.
- A photo has a forged MIME type, oversized dimensions, or sensitive attributes in the provider response: reject/delete it and return the anonymous blueprint; tested in Task 7.
- A browser refreshes during pixel generation or IndexedDB writing: recover only the last committed turn; tested in Task 8.
- The free Jev model is unavailable or rate-limited: retry only retryable statuses, never switch to paid `jev-1.13`, and surface a resumable error; tested in Tasks 4 and 6.

---

### Task 0: OpenCode Zen batch feasibility spike

**Files:**
- Create: `scripts/jev-spike.mjs`
- Create: `scripts/jev-spike.test.mjs`
- Create: `artifacts/.gitkeep`

**Interfaces:**
- Produces: `buildQuestions(count, mode): Record<string, Question>`, `runTier({ count, mode, fetchImpl }): Promise<SpikeTierResult>`, and CLI output `artifacts/jev-spike-<timestamp>.json`.
- Consumes: `OPENCODE_API_KEY` with fallback to `TYPESAFE_API_KEY`; never consumes `TYPESAFE_MODEL`.

- [ ] **Step 1: Write the failing safety tests**

Assert the probe always calls `https://opencode.ai/zen/v1/systemone` with `jev-1.13-free`, creates exactly the requested number of Chinese Choice questions, redacts Authorization from result/error JSON, stops after a failed tier, and never retries with `jev-1.13`.

- [ ] **Step 2: Run the tests and verify failure**

Run: `node --test scripts/jev-spike.test.mjs`  
Expected: FAIL because `jev-spike.mjs` does not exist.

- [ ] **Step 3: Implement the dependency-free probe**

Use native `fetch`, `performance.now()`, and `process.env`. Probe tiers in order: action Choice `1`, evolving pixel Choices `96`, evolving pixel Choices `150`, then initial `ink/paper` Choices `576` only if every earlier tier succeeds. Record status, elapsed milliseconds, response model, usage, answer count, and probability-degeneration summary; record no state text or key.

- [ ] **Step 4: Run mocked safety tests**

Run: `node --test scripts/jev-spike.test.mjs`  
Expected: PASS.

- [ ] **Step 5: Run the real probe with the existing `.env`**

Run: `node --env-file=.env scripts/jev-spike.mjs`  
Expected: a redacted JSON artifact and a compact terminal summary. If 150 or 576 fails, apply the Spec's degradation order before continuing Task 1 and update `CANVAS_SIZE`/batch defaults in the plan and Spec.

- [ ] **Step 6: Checkpoint**

Record the artifact path and chosen canvas/batch limits in the plan; do not expose the Key.

Checkpoint (2026-09-28): the redacted local artifact is `artifacts/jev-spike-2026-09-28T01-46-45.060Z.json`. Tiers 1, 96, and 150 returned complete HTTP 200 responses; a single 576-question request returned HTTP 400. Keep the 24×24 canvas and use deterministic row-major batches of 96 with concurrency 1; keep the affected-cell ceiling at 150.

### Task 1: TypeScript application shell and contract foundation

**Files:**
- Modify: `package.json`
- Modify: `.env.example`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `index.html`
- Create: `src/shared/constants.ts`
- Create: `src/shared/schemas.ts`
- Create: `src/server/config.ts`
- Create: `src/server/app.ts`
- Create: `src/server/index.ts`
- Create: `src/client/main.tsx`
- Create: `src/client/App.tsx`
- Create: `tests/server/health.test.ts`

**Interfaces:**
- Produces: `createApp(deps?: AppDependencies): FastifyInstance`, `loadConfig(env: NodeJS.ProcessEnv): AppConfig`, and all shared Zod schemas/types named in the Spec.
- Produces scripts: `dev`, `build`, `start`, `test`, `test:watch`, `test:e2e`, `typecheck`.

- [ ] **Step 1: Replace package metadata and install exact dependencies**

Run:

```powershell
npm install fastify @fastify/static @fastify/multipart react react-dom zod idb jszip redis
npm install -D typescript vite @vitejs/plugin-react vitest @vitest/coverage-v8 @playwright/test tsx @types/node @types/react @types/react-dom @testing-library/react @testing-library/user-event jsdom fake-indexeddb
```

Preserve `private: true` and Node `>=20.6`. Set `AUX_MODE=mock`, Zen URL/model, quota defaults, and empty secret placeholders in `.env.example`; never copy values from `.env`.

- [ ] **Step 2: Write the failing health/config tests**

Assert `/api/health` returns `{ ok: true, configured: false, model: "jev-1.13-free" }` without keys; assert `loadConfig()` prefers `OPENCODE_API_KEY`, falls back to `TYPESAFE_API_KEY`, and exposes no secret in a serializable public view.

- [ ] **Step 3: Run the focused tests and verify failure**

Run: `npm test -- tests/server/health.test.ts`  
Expected: FAIL because the TypeScript app and config do not exist.

- [ ] **Step 4: Implement the minimal server/client shell and shared contracts**

Define Zod schemas for `LifeSession`, `WorldState`, `LifeEvent`, `CandidateAction`, `Consequence`, `SemanticBlueprint`, `BlueprintCell`, `SemanticCanvas`, `PixelCell`, `Turn`, `PixelDecision`, `Usage`, and `ApiError`. Render a minimal `LIFE.EXE` client root.

- [ ] **Step 5: Verify foundation**

Run: `npm test -- tests/server/health.test.ts && npm run typecheck && npm run build`  
Expected: all commands PASS and Vite emits `dist/client`.

- [ ] **Step 6: Checkpoint**

Record Task 1 as complete in this plan after the green command; do not commit because the directory is not a Git repository.

### Task 2: Pure domain rules

**Files:**
- Create: `src/domain/world.ts`
- Create: `src/domain/pixels.ts`
- Create: `src/domain/fingerprint.ts`
- Create: `src/domain/locking.ts`
- Create: `tests/domain/world.test.ts`
- Create: `tests/domain/pixels.test.ts`
- Create: `tests/domain/fingerprint.test.ts`
- Create: `tests/domain/locking.test.ts`

**Interfaces:**
- Produces: `applyConsequence(world: WorldState, consequence: Consequence): WorldState`.
- Produces: `cellId(x: number, y: number): string`, `updateDarkness(previous: number, probabilities: PixelProbabilities, step?: number): number`, `quantizeDarkness(value: number): 0 | 0.25 | 0.5 | 0.75 | 1`.
- Produces: `computeFingerprint(turns: Turn[]): BehaviorVector`.
- Produces: `lockEvent(event: LifeEvent): Promise<{ lockedHash: string; lockedAt: string }>` and `verifyEventLock(event: LifeEvent): Promise<boolean>`.

- [ ] **Step 1: Write failing tests for consequence boundaries and immutability**

Assert resource/energy clamp to `0..100`, relationship strength clamps to `-100..100`, opportunity adds/removes are idempotent, memory only gains `newFacts`, and the input object is unchanged.

- [ ] **Step 2: Write failing tests for pixel math and malformed probabilities**

Assert `0.42 + 0.28 * (0.58 - 0.10) = 0.5544`, clamping at 0/1, exact five-level quantization boundaries, invalid coordinates, negative probabilities, and probability sums outside tolerance are rejected.

- [ ] **Step 3: Write failing tests for fingerprint and locking**

Assert four-axis values use all action probabilities, not only the winner; edited candidate text invalidates the hash; property order does not change canonical hash.

- [ ] **Step 4: Run domain tests and verify failure**

Run: `npm test -- tests/domain`  
Expected: FAIL because domain modules do not exist.

- [ ] **Step 5: Implement the four pure modules with the exact signatures above**

Use `PIXEL_STEP = 0.28`, `CANVAS_SIZE = 24`, and SHA-256 over canonical UTF-8 JSON. Do not import provider or browser modules.

- [ ] **Step 6: Verify domain behavior**

Run: `npm test -- tests/domain && npm run typecheck`  
Expected: PASS.

- [ ] **Step 7: Checkpoint**

Record Task 2 complete after the green command.

### Task 3: OpenCode Zen transport adapter

**Files:**
- Create: `src/server/providers/zen.ts`
- Create: `src/server/errors.ts`
- Create: `tests/server/zen.test.ts`
- Create: `tests/fixtures/zen-choice.json`

**Interfaces:**
- Consumes: `AppConfig`, shared `ApiError`, and `ChoiceAnswer` schema.
- Produces: `ZenClient.evaluate(request: SystemOneRequest, options?: { idempotencyKey?: string }): Promise<SystemOneResponse>`.
- Produces: `createZenClient(config: AppConfig, fetchImpl?: typeof fetch): ZenClient`.

- [ ] **Step 1: Write failing request-shape and secret tests**

Assert POST URL is exactly `https://opencode.ai/zen/v1/systemone`, model remains `jev-1.13-free`, headers contain Bearer authentication, and serialized logs/errors contain neither environment key.

- [ ] **Step 2: Write failing response/error tests**

Cover valid Choice, invalid probabilities, mismatched answer type, timeout, `401/422` non-retry, and `429/529` retry with capped exponential backoff. Assert no retry changes the model id.

- [ ] **Step 3: Run the adapter tests and verify failure**

Run: `npm test -- tests/server/zen.test.ts`  
Expected: FAIL because `createZenClient` does not exist.

- [ ] **Step 4: Implement the adapter**

Use injected `fetch`, `AbortSignal.timeout`, Zod response parsing, two retry attempts for retryable failures, and stable error codes from the Spec. Never implement a paid-model fallback.

- [ ] **Step 5: Verify adapter behavior**

Run: `npm test -- tests/server/zen.test.ts && npm run typecheck`  
Expected: PASS.

- [ ] **Step 6: Checkpoint**

Record Task 3 complete after the green command.

### Task 4: Action decision service and route

**Files:**
- Create: `src/server/services/action-decision.ts`
- Create: `src/server/routes/action.ts`
- Create: `tests/server/action-decision.test.ts`
- Modify: `src/server/app.ts`

**Interfaces:**
- Consumes: `ZenClient.evaluate`, `verifyEventLock`, `WorldState`, and locked `LifeEvent`.
- Produces: `decideAction(input: ActionDecisionInput): Promise<ActionDecision>`.
- Produces HTTP: `POST /api/decisions/action`.

- [ ] **Step 1: Write failing prompt contract tests**

Assert Jev sees Chinese factual memory, current situation, premise, exactly three `criteria`, and natural-language costs; assert it never sees numeric state values, behavior vectors, fingerprint labels, or unselected consequences.

- [ ] **Step 2: Add stale-lock and unavailable-free-model tests**

Assert a bad `lockedHash` returns `SESSION_CONFLICT`; `429/529` exhaustion returns retryable `PROVIDER_UNAVAILABLE`; no response references `jev-1.13`.

- [ ] **Step 3: Run focused tests and verify failure**

Run: `npm test -- tests/server/action-decision.test.ts`  
Expected: FAIL because the service/route do not exist.

- [ ] **Step 4: Implement service and route**

Return only selected id, probabilities, confidence, resolved model, usage, and the verified `lockedHash`. Validate that selected id is one of the three locked actions.

- [ ] **Step 5: Verify**

Run: `npm test -- tests/server/action-decision.test.ts tests/server/zen.test.ts`  
Expected: PASS.

- [ ] **Step 6: Checkpoint**

Record Task 4 complete after the green command.

### Task 5: Pixel prompt construction, batching, and atomic updates

**Files:**
- Create: `src/server/services/pixel-decision.ts`
- Create: `src/server/services/idempotency-cache.ts`
- Create: `src/server/routes/pixels.ts`
- Create: `tests/server/pixel-decision.test.ts`
- Create: `tests/server/idempotency-cache.test.ts`
- Modify: `src/server/app.ts`

**Interfaces:**
- Consumes: `ZenClient.evaluate`, `updateDarkness`, `SemanticBlueprint` for initialization, `SemanticCanvas` for evolution, and event/action/consequence facts.
- Produces: `initializePixels(input: InitializePixelsInput): Promise<PixelBatchResult>`.
- Produces: `evolvePixels(input: EvolvePixelsInput): Promise<PixelBatchResult>`.
- Produces HTTP: `POST /api/decisions/pixels` with `mode: "initialize" | "evolve"`.

- [ ] **Step 1: Write failing initialization tests**

Assert exactly 576 cell questions, each instruction includes coordinate/region/semantic role, criteria are `ink/paper`, and returned `darkness` equals `P(ink)`.

- [ ] **Step 2: Write failing evolution tests**

Assert only requested unique valid cells are submitted, criteria are `darken/preserve/fade`, unchanged cells remain byte-equal, and returned darkness uses the domain formula.

- [ ] **Step 3: Add batching, idempotency, and atomic-failure tests**

With batch size 96, assert 576 cells produce six stable row-major batches. Assert a repeated `sessionId/turn/batchIndex/lockedHash` reads the validated output from a maximum-15-minute cache without a second provider call, and the cache contains neither original request text nor photos. If batch 4 fails permanently, assert no `frameAfter` is returned, error is `PIXEL_BATCH_INCOMPLETE`, and no paid fallback is attempted.

- [ ] **Step 4: Run focused tests and verify failure**

Run: `npm test -- tests/server/pixel-decision.test.ts`  
Expected: FAIL.

- [ ] **Step 5: Implement pixel service and route**

Support configurable batch size/concurrency, stable idempotency keys, duplicate-cell rejection, and complete result assembly only after all batches validate.

- [ ] **Step 6: Verify**

Run: `npm test -- tests/server/pixel-decision.test.ts tests/server/idempotency-cache.test.ts tests/domain/pixels.test.ts && npm run typecheck`  
Expected: PASS.

- [ ] **Step 7: Checkpoint**

Record Task 5 complete after the green command.

### Task 6: Auxiliary model adapter, event structure, and stale-edit protection

**Files:**
- Create: `src/server/providers/auxiliary.ts`
- Create: `src/server/providers/mock-auxiliary.ts`
- Create: `src/server/services/event-service.ts`
- Create: `src/server/routes/events.ts`
- Create: `tests/server/auxiliary.test.ts`
- Create: `tests/server/events.test.ts`
- Create: `tests/fixtures/events.ts`
- Modify: `src/server/app.ts`

**Interfaces:**
- Produces `AuxiliaryModelAdapter`: `moderate`, `suggestEvents`, `structureEvent`, `createBlueprint`, `selectAffectedCells`.
- Produces: `suggestEvents(world, act, turn): Promise<[EventCard, EventCard, EventCard]>`.
- Produces: `structureAndLockEvent(input): Promise<LifeEvent>`.
- Produces HTTP: `POST /api/events/suggest`, `POST /api/events/structure`, `POST /api/canvas/affected-cells`.

- [ ] **Step 1: Write failing schema and role-boundary tests**

Assert exactly three materially distinct actions, complete consequences, all four behavior axes within `-1..1`, no action selected by the provider, and no pixel darkness in affected-cell output.

- [ ] **Step 2: Write failing edit/race tests**

Assert editing any action invalidates the prior consequence/hash; an action response created for the old hash is rejected after edit; duplicate affected cells are removed; 0 cells retries once; more than 160 cells are trimmed by declared importance.

- [ ] **Step 3: Write failing explicit mock-mode tests**

Assert mock provider is available only with `AUX_MODE=mock`, never activates automatically after a real provider error, and produces deterministic fixtures for local/E2E use.

- [ ] **Step 4: Run focused tests and verify failure**

Run: `npm test -- tests/server/auxiliary.test.ts tests/server/events.test.ts`  
Expected: FAIL.

- [ ] **Step 5: Implement adapters, event service, and routes**

Use the configured OpenAI-compatible `/chat/completions` endpoint with structured JSON prompts and Zod validation. Keep provider-specific payloads inside `auxiliary.ts`.

- [ ] **Step 6: Verify**

Run: `npm test -- tests/server/auxiliary.test.ts tests/server/events.test.ts tests/domain/locking.test.ts`  
Expected: PASS.

- [ ] **Step 7: Checkpoint**

Record Task 6 complete after the green command.

### Task 7: Blueprint route and photo privacy

**Files:**
- Create: `src/server/services/blueprint.ts`
- Create: `src/server/routes/blueprint.ts`
- Create: `tests/server/blueprint.test.ts`
- Modify: `src/server/app.ts`

**Interfaces:**
- Consumes: `AuxiliaryModelAdapter.createBlueprint` and `SemanticCanvasSchema`.
- Produces: `createAnonymousBlueprint(name?: string): Promise<BlueprintResult>` and `createPhotoBlueprint(file, name?): Promise<BlueprintResult>`.
- Produces HTTP: `POST /api/aux/blueprint` multipart with optional photo.

- [ ] **Step 1: Write failing anonymous and valid-photo tests**

Assert both paths return exactly 576 cells and no final darkness; valid photo input is absent from returned/logged/persisted data after adapter completion.

- [ ] **Step 2: Add hostile-image tests**

Cover forged MIME/magic bytes, excessive byte size, excessive dimensions, and auxiliary output containing banned sensitive fields. Each must release the buffer and return the anonymous blueprint without leaking provider payloads.

- [ ] **Step 3: Run focused tests and verify failure**

Run: `npm test -- tests/server/blueprint.test.ts`  
Expected: FAIL.

- [ ] **Step 4: Implement in-memory image validation and route**

Use multipart limits and a small image-header parser; do not write uploads to disk. Redact request bodies from Fastify logging for this route.

- [ ] **Step 5: Verify**

Run: `npm test -- tests/server/blueprint.test.ts && npm run typecheck`  
Expected: PASS.

- [ ] **Step 6: Checkpoint**

Record Task 7 complete after the green command.

### Task 8: Client session reducer and atomic IndexedDB repository

**Files:**
- Create: `src/client/state/session-reducer.ts`
- Create: `src/client/state/session-repository.ts`
- Create: `tests/client/session-reducer.test.ts`
- Create: `tests/client/session-repository.test.ts`

**Interfaces:**
- Produces: `sessionReducer(state: LifeSession, action: SessionAction): LifeSession`.
- Produces: `SessionRepository.saveCommittedTurn(session, turn): Promise<void>`, `load(id)`, `listResumable()`, `importExperiment(json)`, `delete(id)`.

- [ ] **Step 1: Write failing reducer tests**

Assert act mapping is turns `1–2`, `3–6`, `7–9`; only locked events can enter deciding; only complete pixel results can commit; turn 9 sets complete; stale hashes are rejected.

- [ ] **Step 2: Write failing IndexedDB transaction/recovery tests**

Using fake IndexedDB, abort midway through frame/session write and assert the previous turn remains loadable with no partial turn. Cover malformed imported JSON and schema-version mismatch.

- [ ] **Step 3: Run focused tests and verify failure**

Run: `npm test -- tests/client/session-reducer.test.ts tests/client/session-repository.test.ts`  
Expected: FAIL.

- [ ] **Step 4: Implement reducer and repository**

Store sessions and frames separately in one transaction; never store photo blobs. Keep transient in-flight state outside the committed session record.

- [ ] **Step 5: Verify**

Run: `npm test -- tests/client/session-reducer.test.ts tests/client/session-repository.test.ts`  
Expected: PASS.

- [ ] **Step 6: Checkpoint**

Record Task 8 complete after the green command.

### Task 9: Typed API client and nine-turn orchestration UI

**Files:**
- Create: `src/client/api/client.ts`
- Create: `src/client/screens/HomeScreen.tsx`
- Create: `src/client/screens/SetupScreen.tsx`
- Create: `src/client/screens/EventScreen.tsx`
- Create: `src/client/screens/RevealScreen.tsx`
- Create: `src/client/components/TypewriterText.tsx`
- Create: `src/client/components/ProbabilityBars.tsx`
- Create: `src/client/components/WorldStatus.tsx`
- Modify: `src/client/App.tsx`
- Create: `tests/client/app-flow.test.tsx`

**Interfaces:**
- Consumes: all server routes, `sessionReducer`, and `SessionRepository`.
- Produces: the playable setup → event suggestion/edit → action lock → Jev action → consequence → pixel update → reveal loop.

- [ ] **Step 1: Write failing first-turn flow test**

Assert anonymous setup, three event cards, custom edit, three action confirmation, disabled edits after lock, selected action/probabilities, consequence application, frame commit, and navigation to turn 2.

- [ ] **Step 2: Add motion/error/recovery tests**

Assert typewriter can be skipped, reduced-motion renders full text immediately, retryable provider failure preserves locked inputs, refresh restores only the last committed turn, and a stale response cannot overwrite a newer event.

- [ ] **Step 3: Run focused tests and verify failure**

Run: `npm test -- tests/client/app-flow.test.tsx`  
Expected: FAIL.

- [ ] **Step 4: Implement API client and screens**

Use an explicit screen state machine, not route-by-route global mutation. Display Chinese copy; keep API terminology out of the main flow.

- [ ] **Step 5: Verify**

Run: `npm test -- tests/client/app-flow.test.tsx && npm run typecheck`  
Expected: PASS.

- [ ] **Step 6: Checkpoint**

Record Task 9 complete after the green command.

### Task 10: Pixel canvas, before/after slider, and retro visual system

**Files:**
- Create: `src/client/canvas/render.ts`
- Create: `src/client/canvas/PixelCanvas.tsx`
- Create: `src/client/canvas/BeforeAfterSlider.tsx`
- Create: `src/client/components/RetroWindow.tsx`
- Create: `src/client/styles/tokens.css`
- Create: `src/client/styles/app.css`
- Create: `tests/client/canvas.test.tsx`
- Modify: `src/client/main.tsx`
- Modify: `src/client/screens/RevealScreen.tsx`

**Interfaces:**
- Produces: `renderFrame(ctx, darkness, scale)`, `composeLifeScroll(frames, labels, scale): Promise<Blob>`, `PixelCanvas`, `BeforeAfterSlider`.

- [ ] **Step 1: Write failing rendering tests**

Assert 576 values map row-major to a 24×24 logical canvas, values render in exactly five gray levels, integer scaling disables smoothing, and invalid frame length is rejected.

- [ ] **Step 2: Write failing accessible slider tests**

Assert pointer, touch, left/right keys, Home/End, ARIA value, and before/after labels; slider changes clipping only and never mutates either frame.

- [ ] **Step 3: Run focused tests and verify failure**

Run: `npm test -- tests/client/canvas.test.tsx`  
Expected: FAIL.

- [ ] **Step 4: Implement canvas and retro UI**

Use black, white, and three intermediate grays; square corners; beveled buttons; monospace/legible Chinese fallback; no gradients or glass effects. Add sequential pixel-refresh animation with reduced-motion fallback.

- [ ] **Step 5: Verify visual layer**

Run: `npm test -- tests/client/canvas.test.tsx && npm run build`  
Expected: PASS.

- [ ] **Step 6: Checkpoint**

Record Task 10 complete after the green command.

### Task 11: Ending, exports, import, and exact replay

**Files:**
- Create: `src/client/export/export-session.ts`
- Create: `src/client/screens/EndingScreen.tsx`
- Create: `tests/client/export-session.test.ts`
- Create: `tests/client/replay.test.ts`
- Modify: `src/client/App.tsx`

**Interfaces:**
- Consumes: nine committed turns, frame renderer, fingerprint, repository.
- Produces: `exportExperiment(session): string`, `exportLifeZip(session): Promise<Blob>`, `createReplaySession(experiment): LifeSession`.

- [ ] **Step 1: Write failing export tests**

Assert ZIP contains `scroll.png`, `frame-01.png` through `frame-09.png`, and `experiment.json`; JSON contains model/provider/usage/inputs/probabilities/formula version but excludes all secrets, photo data, IP, and server log identifiers.

- [ ] **Step 2: Write failing replay tests**

Assert replay fixes blueprint, events, actions, consequences, vectors, affected cells, and formula while clearing all Jev action/pixel decisions and frames for fresh calls.

- [ ] **Step 3: Run focused tests and verify failure**

Run: `npm test -- tests/client/export-session.test.ts tests/client/replay.test.ts`  
Expected: FAIL.

- [ ] **Step 4: Implement ending screen and export/replay functions**

Render life scroll, action timeline, four-axis fingerprint with non-psychometric disclaimer, and download/replay controls.

- [ ] **Step 5: Verify**

Run: `npm test -- tests/client/export-session.test.ts tests/client/replay.test.ts && npm run typecheck`  
Expected: PASS.

- [ ] **Step 6: Checkpoint**

Record Task 11 complete after the green command.

### Task 12: Public guards, content-free metrics, and final system verification

**Files:**
- Create: `src/server/guards/quota.ts`
- Create: `src/server/guards/quota-store.ts`
- Create: `src/server/guards/metrics.ts`
- Create: `tests/server/quota.test.ts`
- Create: `tests/server/privacy.test.ts`
- Create: `playwright.config.ts`
- Create: `e2e/life-flow.spec.ts`
- Modify: `src/server/app.ts`
- Modify: `README.md`
- Delete after replacement is verified: `server.mjs`, `core.mjs`, `core.test.mjs`, `public/index.html`, `public/app.js`, `public/styles.css`

**Interfaces:**
- Produces: `QuotaStore` with `incrementWithExpiry`, `getNumber`, and `acquireLock`; `MemoryQuotaStore` for local/test; `RedisQuotaStore` for public mode; `QuotaGuard.check(context): Promise<QuotaDecision>`; `MetricsSink.record(event): void`.
- Produces: runnable public MVP with documented local setup and explicit `AUX_MODE=mock` instructions.

- [ ] **Step 1: Write failing quota/privacy tests**

Cover kill switch, daily budget, installation daily session count, short IP window, concurrent session lock, free-model outage, Redis-unavailable fail-closed behavior in public mode, and content redaction. Assert blocked calls never reach providers.

- [ ] **Step 2: Write the browser E2E scenario**

Use mock auxiliary and mocked Zen HTTP fixtures to complete all nine turns, refresh during an in-flight turn, resume, manipulate the slider with keyboard and touch, export files, import JSON, and start exact replay.

- [ ] **Step 3: Run focused tests and verify failure**

Run: `npm test -- tests/server/quota.test.ts tests/server/privacy.test.ts && npm run test:e2e`  
Expected: FAIL until guards and final wiring exist.

- [ ] **Step 4: Implement guards, metrics, production serving, and README**

Metrics may include provider, model, token counts, question count, latency, retry count, estimated cost, and error code only. Document OpenCode Zen URL/model, env variable precedence, auxiliary provider config, privacy behavior, development commands, and the real-provider spike command.

- [ ] **Step 5: Remove the superseded ticket demo files**

Only delete them after `npm run build` succeeds and the new Fastify production server serves the Vite bundle and `/api/health`.

- [ ] **Step 6: Run the complete verification suite**

Run: `npm test && npm run typecheck && npm run build && npm run test:e2e`  
Expected: all commands PASS with no provider keys required in mock mode.

- [ ] **Step 7: Run the real OpenCode Zen spike**

With the existing `.env`, run the dedicated spike script against `jev-1.13-free` for 1, 96, 150, and—only if earlier tiers pass—576 questions. Record status, latency, usage, retry count, and whether the distributions degenerate. Never print the Key or user content.

- [ ] **Step 8: Apply the Spec's degradation rule if the spike fails**

In order: lower concurrency/batch size, cap affected cells at 96, then lower the logical grid to 16×16. Do not replace Jev pixels with auxiliary-model output.

- [ ] **Step 9: Final checkpoint**

Record the verification commands and real-spike summary in `README.md`. Do not claim public readiness if the real spike or any full-suite command fails.
