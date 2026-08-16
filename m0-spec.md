# M0 — Technical Specification

The contracts every later milestone inherits, and the vertical slice that proves each one works.

Companion to [build-plan.md](build-plan.md). Where the two disagree, the build plan owns _what_ and this document owns _how_.

---

## 1. Scope

M0 ships a debug harness, not a game. It exists to make the following decisions real, in code, before anything is built on top of them.

**In scope**

- Sync topology: Zero for game state, a separate channel for ephemeral data, a queued log for position tracks
- Rounds as the unit of play, and role as a property of a round rather than a team
- The event log and its guarantees
- Which timestamp is authoritative for what, and why device clocks are never compared
- First-to-the-server-wins conflict resolution, end to end
- The constraint engine interface, with **radar only** as the proof
- The area pack and map config formats
- The platform adapter interface, with a web implementation
- Identity, tokens and role resolution

**Explicitly out of scope**

- Any question type but radar
- The area builder — M0 hand-writes one map config as a fixture
- Any map rendering. The constraint engine is verified by geometry assertions, not by looking at it
- Any UI beyond what is needed to drive the acceptance tests
- Cards, curses, photos, chat

**The guardrail.** One vertical slice per contract. If M0 grows a second question type or a real map screen, it has stopped being M0.

---

## 2. Repo layout

```
apps/
  web/                  PWA — React Router, MapLibre later
  server/               Hono: mutate endpoint, ephemeral WS, photo ingest later
packages/
  schema/               Zero schema, Drizzle schema, mutator definitions, shared types
  rules/                PURE. Constraint definitions, question evaluation. No I/O, no Zero
  geo/                  Projection, boolean ops, simplification. Wraps turf/polygon-clipping
  platform/             PlatformAdapter interface + web implementation
  area-packs/           Pack format, validation, build tooling, Berlin fixture
  ui/                   Shared components
infra/
  docker/               Compose for postgres + zero-cache + server + web
```

Two rules about this layout, both enforced by lint:

1. **`packages/rules` imports nothing but `packages/geo` and types.** No Zero, no React, no network, no clock. It is the one part of the system that must survive a sync-engine change unharmed.
2. **Browser capability APIs are reachable only from `packages/platform`.** See §10.

---

## 3. Sync topology

Two channels, deliberately different in character.

|                    | Zero                                | Ephemeral channel                       |
| ------------------ | ----------------------------------- | --------------------------------------- |
| Carries            | Game state and the event log        | Position, heading, battery, online-ness |
| Durability         | Postgres, permanent                 | In-memory, lossy by design              |
| Delivery           | Queued and rebased — see the offline contract below | Best-effort, latest-wins  |
| Loss on disconnect | Nothing                             | Everything, and that is correct         |

Zero has no presence layer by design; this split is its intended usage rather than a workaround. Nothing about live position belongs in Postgres — it is worthless ten seconds later, and routing it through logical replication would generate continuous write churn to sync data that M2's staleness UI is already designed to survive losing.

**Persisted position snapshots are a third thing** and travel over Zero: a low-rate write (§8) capturing position at moments that matter, for M8's suggestion inputs and M14's replay track.

### Queries are resolved on the server

Zero 1.x does not let a client send ZQL to `zero-cache`. The client invokes a *named* query; `zero-cache` calls our query endpoint with that name, its arguments and a context we derive from the token; we return the authoritative ZQL. Queries and mutators are both defined once in `packages/schema`, and both have a server-side resolution step.

This is larger than it first reads. It means **§8's visibility filter is not confined to the ephemeral channel** — the same per-role rule applies to synced game state, so a seeker's client is never sent hider `positionSnapshot` rows at all. One rule, expressed in two places: once when resolving a query, once when fanning out presence.

### The offline write contract

**Zero does not support offline writes.** Its connection state machine allows reads in every live state but accepts writes only while `connected` or `connecting`; in `disconnected`, `error` and `needs-auth` a write is rejected outright. `connecting` decays to `disconnected` after `disconnectTimeoutMs` (default 60s), and a hidden tab decays after `hiddenTabDisconnectDelay` (default 5 min) — which on a phone means the screen going off.

Left at those defaults it is fatal here. This game is played on the U-Bahn: a hider answering from a platform is the normal case rather than an edge case, and a locked phone is the resting state of every device in the game.

**So we hold Zero in `connecting` for the length of a game.** `disconnectTimeoutMs` and `hiddenTabDisconnectDelay` are both raised to game scale, so writes queue instead of failing and flush on reconnect.

This is explicitly against Rocicorp's recommendation, which is worth justifying rather than glossing. Their reasons for refusing offline writes are semantic: merge conflicts no algorithm can settle, foreign keys that hold offline and break on reconnect, schemas that change under a queued mutation. None of those describe this app. Writes are append-mostly, ids are client-generated, the schema does not change during a two-hour game, and the one genuine conflict — two players answering one question — is the thing §7 is built around.

**It was a bet, and acceptance tests 3 and 7 have settled it: the bet holds.** A client held in `connecting` queues an answer through a severed socket, pushes it on reconnect, and loses the race correctly; a queued position track flushes complete and in order with its original capture times. If that ever stops being true, the fallback is a local outbox for the writes that must survive a tunnel — answers, question asks, constraint edits, position snapshots — posted to our own endpoint, with Zero demoted to the read and fan-out path. That fallback stays affordable exactly because §7 already puts conflict resolution in a server mutator rather than in Zero.

**One limit came with it, and it is worth knowing before M2.** Zero can read from its local store while disconnected, but only for queries it has already resolved. Because query resolution is a *server* round trip (above), a client that starts cold with no connection has no resolved queries and therefore no data at all — the app is blank rather than stale. Staying in the tunnel is fine; being launched in one is not. Whatever M2 does about a cold offline start is a UI problem, not a sync problem, but the sync layer will not solve it.

### Services

- `postgres` — source of truth
- `zero-cache` — single-node (replication-manager + view-syncer in one), persistent volume for the SQLite replica at `/data/replica.db`
- `server` — Hono. Mutate endpoint, ephemeral WS, token issuance
- `web` — static PWA

Deployment notes that bite if ignored: `zero-cache` needs a **direct** Postgres connection (no pgbouncer), needs a **startup grace period** of around ten minutes for initial sync, and must not be exposed publicly. Single-node is correct for this workload and will stay correct — a busy game is twenty players.

---

## 4. Identity, tokens and roles

No accounts. Identity is a device plus a chosen display name.

```ts
type DeviceId = string; // uuid v4, generated client-side, persisted in localStorage
type PlayerId = string; // uuid v4, server-assigned at join
```

**Token payload — carries identity only:**

```ts
type GameToken = {
  sub: PlayerId;
  gameId: string;
  deviceId: DeviceId;
  iat: number;
  exp: number; // long-lived — 90d; refreshed opportunistically while connected
};
```

**Forward compatibility with accounts.** A user concept may arrive later, so that past games can be reviewed and a person can be recognised across games. `player` is per-game by design and stays that way; the future change is a nullable `player.userId` and an `sub`-alongside claim, not a reshaping of identity. Nothing in M0 should assume a player exists only for the life of one game.

**Role is never in the token — and role is not a property of a team.** Hiders and seekers swap between rounds, so role belongs to the round. It is resolved by joining `player → teamMember → team → roundTeamRole` for the current round. A player switching teams in the lobby, or a whole table swapping roles between rounds, takes effect on the next query with no token churn and no window where a stale claim is still honoured.

**Trust boundary.** Per the build plan's second principle, visibility rules are a server-side filter that preserves the game, not a defence against a participant. The token exists to identify a player and to scope them to one game — that scoping _is_ load-bearing, because a bad actor's blast radius must be exactly the game they were invited to. Within a game, we do not defend against dev tools.

---

## 5. Data model

Drizzle is the source of truth for DDL; the Zero schema is derived from it. Both live in `packages/schema`.

```ts
game: {
  id: string;
  code: string; // short join code, unique among active games
  status: "draft" | "lobby" | "running" | "finished";
  hostPlayerId: string;
  mapConfigId: string | null;
  createdAt: number;
  startedAt: number | null;
  endedAt: number | null;
}

player: {
  id: string;
  gameId: string;
  displayName: string;
  deviceId: string;
  joinedAt: number;
}

team: {
  id: string;
  gameId: string;
  name: string;
  color: string;
  emoji: string;
} // no role column — see below

teamMember: {
  teamId: string;
  playerId: string;
  joinedAt: number;
}
```

### Rounds

**A game is a series of rounds, and a round is the unit of play.** Teams keep their identity across the whole game; their _role_ changes from round to round as hiders and seekers swap. Everything a round produces — questions, answers, constraints, commitments — belongs to that round and not to the game.

```ts
round: {
  id: string;
  gameId: string;
  ordinal: number; // 1, 2, 3…
  status: "hiding" | "seeking" | "ended";
  hidingDurationMs: number;
  hidingStartedAt: number | null;
  seekingStartedAt: number | null;
  endedAt: number | null;
}

roundTeamRole: {
  roundId: string;
  teamId: string;
  role: "seeker" | "hider";
}

hidingCommitment: {
  id: string;
  roundId: string;
  hiderTeamId: string;
  stopId: string; // the committed zone's transit stop
  zone: Polygon; // materialised at commit time
  committedAt: number;
  declaredSpot: LngLat | null; // late, optional, correctable — M12
}
```

`zone` is materialised rather than recomputed from `stopId` plus the map config's radius, because the radius is host-configurable and a mid-series change must not silently move a zone that has already been committed to.

**The hiding phase, and the one rule that is never recorded.** For `hidingDurationMs` after a round starts, hiders travel freely and without restriction; seekers are travelling too and pass through areas nobody could hide in, which needs no special handling. Once the phase ends, a hider stays inside their committed zone.

If their position leaves it, **their own device tells them, and nothing else happens.** No event, no row, no mutation, no notification to anyone. It is a nudge to somebody who wandered off, rendered from local state by comparing their own fix to their own team's `hidingCommitment.zone`. This is worth spelling out precisely because every other rule in this document is about what gets written down: this one is defined by _not_ being written down.

### Questions and answers

M0 models one question type. The shape is chosen so M6/M7 add types without migrating.

```ts
question: {
  id: string;
  roundId: string;
  askingTeamId: string;
  targetTeamId: string;
  type: "radar"; // widens in M6
  params: Json; // radar: { radiusMeters: number }
  status: "started" | "pending" | "answered" | "cancelled";
  askedAt: number;
  askPosition: PositionSnapshot | null;
  endedAt: number | null; // interval questions only — see below
  endPosition: PositionSnapshot | null;
}

answer: {
  id: string;
  questionId: string; // UNIQUE — this index is the conflict resolution
  answeringPlayerId: string;
  value: Json; // radar: { kind: 'boolean', value: boolean }
  answerPosition: PositionSnapshot | null;
  clientSubmittedAt: number; // answering device's clock — display only
  answeredAfterMs: number; // monotonic elapsed on that device — displayed, never enforced
  serverReceivedAt: number; // when everyone else learned about it
}
```

**`status: 'started'` and the two position columns exist from day one** because of thermometers. A thermometer is not asked at a moment in time: starting one records the seeker team's position and announces itself to the hider, and it is nothing but game state until the team ends it somewhere else. Only on ending does it carry two positions, reach the hider, and become answerable. Radar never uses `'started'`, but the column shape is settled now rather than migrated in M7.

The `UNIQUE` index on `answer.questionId` is not a data-integrity nicety — it is the mechanism by which first-to-the-server-wins is enforced. See §7.

### Constraints

The single most important shape in the system.

```ts
constraint: {
  id: string;
  roundId: string; // constraints die with the round that produced them
  seekerTeamId: string; // scope: one (seeker team, hider team) pair
  hiderTeamId: string;
  source: "answer" | "manual";
  answerId: string | null; // set iff source === 'answer'
  geometry: ConstraintGeometry; // §9
  mode: "include" | "exclude";
  enabled: boolean;
  ordinal: number;
  createdAt: number;
}
```

Three things follow from this table, and all three are why it looks like this:

- **A constraint is not owned by the question that produced it.** Hand-authored constraints (a seeker team drawing a radius around a building they identified from a photo) are the same record with `source: 'manual'` and a null `answerId`.
- **Disabling is a column, not a deletion.** Toggling a constraint off, a hider correcting an answer, and the bulk "we are searching this zone now" invalidation are all writes to `enabled` — one operation, not three features.
- **Scope is a pair.** Seeker teams play against each other and do not share deductions, so each `(seekerTeamId, hiderTeamId)` pairing has its own list and its own search area.

### Position snapshots

```ts
type ClientFix = {
  lng: number;
  lat: number;
  accuracyMeters: number;
  headingDeg: number | null;
  speedMps: number | null;
  capturedAt: number; // the sender's own clock — trusted, and the staleness reference
  source: "gps" | "network" | "manual" | "unavailable";
};

type PositionSnapshot = ClientFix & {
  receivedAt: number | null; // server clock, for diagnostics only; null inside a mutation
};
```

Embedded on events and questions/answers, and written to a `positionSnapshot` table at a configurable rate for replay (§8). `source: 'unavailable'` is a first-class value — a hider with location services off must be able to answer, and the record should say plainly that there was no fix rather than omit the field.

**`capturedAt` is what everything reads.** The device that took the fix says when it took it, and we believe it, exactly as we believe the answers players give. `receivedAt` exists only for the diagnostic in §8 and is deliberately not what staleness is computed from — a queued fix flushed after ten minutes underground would otherwise arrive claiming to be seconds old, which is the precise opposite of what M2 promises.

---

## 6. The event log

Every mutator writes the state rows the UI queries **and** an event row, in one transaction. There is no exception to this, and the review checklist should treat a state write with no event as a defect.

```ts
event: {
  id: string; // uuid, client-generated when client-originated
  gameId: string;
  seq: number; // server-assigned, monotonic per game
  type: EventType;
  version: number; // per-type schema version
  actorPlayerId: string | null;
  actorTeamId: string | null;
  payload: Json;
  clientSubmittedAt: number | null;
  serverReceivedAt: number;
}
```

`seq` is allocated inside the mutator transaction from a per-game counter, so replay ordering is total and gap-free. Wall-clock timestamps are for display; **ordering is always `seq`**.

**M0 event types:**

```
game.created            game.stateChanged        host.transferred
player.joined           player.renamed           player.left
team.created            team.updated             team.memberJoined      team.memberLeft
round.created           round.rolesAssigned      round.hidingStarted
round.seekingStarted    round.ended              round.zoneCommitted
question.asked          question.answered        question.cancelled
constraint.created      constraint.enabledChanged
```

`version` starts at 1 for each type. Adding a field is a compatible change; changing the meaning of one is a version bump with a migration in the replay reader. M14 is the milestone that pays for this being right, and it is the only milestone that cannot be retrofitted.

**Discards are not events.** A superseded answer produces a rejection delivered to one client and nothing else. It is not in the log, does not replay, and no other player ever learns it happened.

---

## 7. Time, ordering and conflict

### What the server does not do

> **Answers are authored by players and recorded as given. The server does not validate, recompute or second-guess them.**

A hider _chooses_ their answer. The app may suggest one (M8), but a suggestion is accepted by a person or ignored, and answering automatically on a hider's behalf is explicitly out of scope. What reaches the server is a decision, not a computation, so there is nothing for the server to verify. This is not a concession to offline play — it is the product principle, and it happens to make offline play trivial.

Stating it this way removes a great deal of machinery an earlier draft of this spec carried. If no evaluation crosses a device boundary, no two device clocks ever need reconciling.

### Ordering

`event.seq`, allocated per game inside the mutator transaction. Total, gap-free, and the only ordering authority in the system.

### Three timestamps, each authoritative for one thing

| Field               | Clock                       | Authoritative for                      |
| ------------------- | --------------------------- | -------------------------------------- |
| `serverReceivedAt`  | server                      | When everyone else learned about it    |
| `clientSubmittedAt` | answering device            | Display only — "you answered at 14:13" |
| `answeredAfterMs`   | answering device, monotonic | How long the answer took               |

`answeredAfterMs` is elapsed time measured on a single device between receiving the question and submitting the answer. Because it never leaves that device's own clock it is immune to drift, timezone changes, and a phone that rebooted flat.

**Deadlines are a game rule the app does not enforce.** Nothing expires, nothing is blocked, nothing is rejected for lateness. The app displays how long the answer took, and may colour it red if that exceeds the question card's stated limit. What the players do about that is theirs to decide, exactly as with every other rule here.

**The late-arrival notice.** When `serverReceivedAt` falls outside the deadline but `answeredAfterMs` is inside it, both sides see an informational note: _"answered in time, but only reached the seekers six minutes later — the connection was down."_ It is not an accusation and changes nothing. It exists so a seeker team that sat waiting does not quietly conclude the hider stalled.

### No clock offset

An earlier draft synchronised device clocks NTP-style and stored an offset on every event. It is not needed, and the reason is the same one that runs through the rest of this document: **we trust the clients.**

- positions carry the sender's own `capturedAt` and are rendered from it (§8)
- deadlines use `answeredAfterMs`, which never leaves one device
- ordering uses `seq`
- replay renders tracks from `capturedAt` and events from `serverReceivedAt`

A phone with a badly wrong clock will look odd rather than corrupt anything, and §8's diagnostic tells its owner so. If something ever genuinely requires two device clocks to be compared, this is the section it belongs in.

### First to the server wins

The client mutator applies optimistically with no check. The server mutator checks and throws. Zero rolls back the optimistic write during rebase and returns the error to the originating client.

The check is the `UNIQUE` index on `answer.questionId` plus one disambiguation:

| Existing answer               | Meaning                    | Result                                  |
| ----------------------------- | -------------------------- | --------------------------------------- |
| Same `answeringPlayerId`      | My own retry               | Silent success — nothing happened twice |
| Different `answeringPlayerId` | A teammate got there first | Dismissible discard notice              |

**There is no separate idempotency key**, on answers or anywhere else in M0. The natural key already carries everything needed: a question holds one answer, and that answer records who gave it.

Two details fell out of building this that the table above does not convey.

**The check has two chances to fire and they are not equivalent.** The mutator's read may or may not see the winning answer depending on when the losing transaction starts; when it does not, the `UNIQUE` index catches the insert instead. Both are correct, but only the first can name the winner — by the time the index fires the transaction is aborted and nothing more can be read from it. So the mutator translates the constraint violation into the same `team_action_superseded` rejection, minus the `acceptedBy` detail, and the client fills that in from state it has already synced.

**The client mutator must not throw, including during rebase.** §7 says the client applies optimistically with no check, and that turns out to be load-bearing rather than stylistic: a queued answer is rebased on reconnect, by which point the winner *is* in the local store, and a throw there fails the whole poke and takes the connection down with it. The check is server-only, guarded on `tx.location`.

**And the losing client learns it lost from synced state, not from the mutation result.** `zero.mutate(...).server` resolves with an outcome object rather than rejecting, and for a mutation that was queued through a reconnect it reported success even where the server had rejected it. The notice is therefore derived: *I answered this question, and the answer that exists is somebody else's.* That is the same fact, read from data that has definitely arrived.

This is deliberately correct whatever Zero does underneath. Zero's push protocol "records the fact that the mutation ran", which reads like the exactly-once mechanism its predecessor had, but the published docs do not say so plainly and it could not be confirmed. It does not matter here: if Zero deduplicates, a retry never reaches the mutator; if it does not, the mutator finds the player's own answer already present and returns success. Both paths land in the same place, so nothing in this design waits on that answer. Worth settling with one forced-double-push test when convenient — and it becomes load-bearing the moment a **non-Zero** endpoint exists, since M9's photo upload is plain HTTP and will need a key of its own.

```ts
type MutationRejection =
  | {
      code: "team_action_superseded";
      questionId: string;
      acceptedBy: { playerId: string; displayName: string };
      acceptedAt: number;
    }
  | { code: "not_permitted"; reason: string }
  | { code: "game_state_invalid"; expected: string; actual: string };
```

On `team_action_superseded` the client shows one dismissible notice — _"Your answer was discarded, Ana answered first."_ — and nothing further. No retry, no log entry, no notification to anyone else.

---

## 8. The ephemeral channel

A WebSocket route on the same Hono service. Per-game presence lives in server memory.

```ts
type EphemeralUp =
  | { t: "hello"; token: string }
  | { t: "pos"; fix: ClientFix }
  | { t: "batt"; level: number | null; charging: boolean | null }
  | { t: "ping" };

type EphemeralDown =
  | { t: "presence"; entries: PresenceEntry[] } // filtered per subscriber
  | { t: "pong" }
  | { t: "bye"; reason: "token_expired" | "game_ended" | "replaced" };

type PresenceEntry = {
  playerId: string;
  teamId: string;
  fix: PositionSnapshot | null; // receivedAt stamped by the server
  battery: BatteryState | null;
  onlineSince: number;
};
```

**Client timestamps are trusted and propagated unchanged.** A fix carries the `capturedAt` its own device recorded; the server relays it, and every other client renders "last seen 3 min ago" from that. The server notes its own `receivedAt` alongside, and uses the gap between the two for exactly one thing: if a device's clock sits minutes away from the server's, that device is told so once, on its own screen. Advisory, local, never corrective and never propagated — the same shape as every other warning in this app.

`ping`/`pong` is liveness only; it carries no timing payload.

**Visibility is applied server-side, per subscriber**, at the moment of fan-out — and it filters _fields_, not entries.

> **Everyone in a game can always see everyone else. What is secret is where they are.**

Every subscriber receives a `PresenceEntry` for every player in the game, always: identity, team, and online-ness are how a lobby works and how the two sides talk to each other during a round. Seekers know perfectly well who is hiding, and interact with them constantly. The two location-bearing fields — `fix` and `battery` — are the ones that get nulled:

- a **hider** receives positions for every seeker team and every other hider team
- a **seeker** receives positions for their own team only, and for nobody else — not the hiders, and not the other seeker teams
- a player **on no team yet** receives every entry, and no positions but their own

`battery` follows `fix` rather than identity because it is a teammate-and-hider affordance (build plan, M2) and because a seeker team's battery curve is information about a seeker team.

An earlier draft of this section filtered whole entries, which is a stricter rule that is also the wrong one: it hid the roster, so a lobby of five phones showed one. M1 corrects it (m1-spec §9).

Filtering happens on the server not because a seeker would inspect the frames, but because the alternative — sending everything and hiding it in the client — makes an accidental leak a one-line UI mistake instead of an impossible one.

### The position log is queued, and is not the same thing as presence

The same fix has two fates, and conflating them is a mistake worth naming.

**Presence is lossy on purpose.** A `pos` broadcast that cannot be delivered right now is worthless in five seconds. It is dropped, never queued, and the stale marker greys out — which is the honest outcome.

**The position log is not lossy.** Each client records a fix on a **configurable interval, defaulting to 30s**, into a local queue, plus one unconditionally at every question ask, question end and answer. The queue flushes on reconnect. A player who spends ten minutes in a tunnel contributes ten minutes of track the moment they surface, ordered by their own `capturedAt`.

This is the reason client timestamps are trusted rather than stamped on arrival. M14's replay and M8's suggestion inputs both read this log, and neither can afford holes wherever the mobile network had them — nor a flushed batch that all claims to have happened at the instant the signal came back.

The interval sets both replay resolution and suggestion freshness, so it wants to be a knob rather than a constant.

Cadence: clients send `pos` at most every 3s, and only when moved more than 10m or 10s have elapsed. Server fans out at most every 2s per game, coalescing to latest-per-player.

---

## 9. The constraint engine

`packages/rules` and `packages/geo`. Pure functions, no I/O, no clock.

### Types

```ts
type LngLat = readonly [number, number];
type Meters = number;

type ConstraintGeometry =
  | { kind: "radius"; center: LngLat; radius: Meters }
  | { kind: "halfPlane"; a: LngLat; b: LngLat; nearer: "a" | "b" }
  | { kind: "polygon"; polygon: Polygon | MultiPolygon }
  | { kind: "sector"; center: LngLat; radius: Meters; fromDeg: number; toDeg: number };

type Constraint = {
  id: string;
  geometry: ConstraintGeometry;
  mode: "include" | "exclude";
};
```

Four geometry kinds cover every question in the game and both hand-authored constraint types the build plan defers. Radar is a `radius`; thermometer is a `halfPlane` built from the start and end positions; matching is a `polygon`; measuring reduces to a `halfPlane`; tentacles is a `polygon` (the union of candidate POI buffers). `sector` exists only for hand-authored constraints.

### The core operations

```ts
function toRegion(g: ConstraintGeometry, p: Projection): Region;
function applyConstraint(area: Region, c: Constraint, p: Projection): Region;
function foldConstraints(seed: Region, cs: Constraint[], p: Projection): Region;

// The inverse usage — M8's hider-side suggestion
function satisfies(point: LngLat, c: Constraint, p: Projection): boolean;
```

**`satisfies` and `applyConstraint` are two readings of one definition, and this is the point.** M8 asks _"does the hider's live position satisfy this?"_; M13 asks _"what area survives it?"_ Two implementations would drift, and the symptom — a hider told "yes, within 3 km" while the seeker's map eliminates the wrong region — reads as a geometry bug long before anyone suspects duplication.

The invariant is testable, and is the highest-value property test in the codebase:

```ts
satisfies(p, c) === regionContains(applyConstraint(WORLD, c), p);
```

### The fold commutes

Every constraint reduces to _intersect the area with some set_ — `include` intersects with S, `exclude` intersects with the complement of S. Intersection is commutative and associative, therefore:

> The search area does not depend on constraint order.

Three consequences worth stating explicitly, because they make several later features free:

- `ordinal` exists only to make snapshot caching deterministic, not to make results correct
- disabling a constraint in the middle of the list needs no reordering
- the cache key is the **set** of enabled constraint ids, not the sequence

```
cacheKey = sha256(mapConfig.contentHash, sorted(enabledConstraintIds))
```

Incremental append is `snapshot(n) = snapshot(n−1) ∩ Sₙ`. Disabling forces a fresh fold, which at these sizes is cheap.

### Projection and numerical hygiene

All boolean operations happen in a **projected, metric CRS**, never in degrees. The projection is a property of the map config, chosen when the area is built:

```ts
type Projection = {
  proj4: string; // e.g. UTM 33N for Berlin
  snapPrecisionMeters: number; // default 0.1
  simplifyToleranceMeters: number; // default 1.0
};
```

Repeated boolean operations on unions of hundreds of buffered circles accumulate degenerate slivers and near-duplicate vertices. **Snapping and simplification between fold steps are part of the engine, not a later optimisation.** This is invisible at the third constraint and ugly at the fifteenth, which is exactly late enough to be expensive to fix.

Circles are densified to a fixed vertex count (default 64) at construction, so that a given radius always produces byte-identical geometry on every device. Client and server must agree exactly — that is an M0 acceptance test.

---

## 10. Platform adapter

One interface, one web implementation, one lint rule.

```ts
type Capability =
  | { available: true }
  | { available: false; reason: "unsupported" | "denied" | "insecure_context" | "unavailable" };

interface PlatformAdapter {
  location: {
    capability(): Capability;
    getCurrent(opts?: LocationOpts): Promise<PositionSnapshot>;
    watch(cb: (fix: PositionSnapshot) => void, opts?: LocationOpts): Unsubscribe;
  };
  notifications: {
    capability(): Capability;
    requestPermission(): Promise<"granted" | "denied" | "default">;
    show(n: LocalNotification): Promise<void>;
  };
  wakeLock: { capability(): Capability; acquire(): Promise<Release> };
  haptics: { capability(): Capability; vibrate(pattern: number[]): void };
  battery: { capability(): Capability; read(): Promise<BatteryState | null> };
}
```

**Every capability can report itself unavailable, and the UI must handle that as a normal state.** This is not defensive padding. Battery is the immediate case: the Battery Status API is unimplemented in several browsers, so M2's per-player battery display is _already_ a partial feature on day one. Behind the adapter it degrades to an honest "unavailable"; scattered through components it becomes a mystery on half the fleet.

Background location and reliable push are the same story at larger scale — not deliverable in a browser at all, and the reason a Capacitor build will eventually exist. Keeping them behind this interface is what makes that build a second implementation rather than a rewrite.

**The lint rule is the whole point.** `packages/platform` is the only place permitted to reference `navigator.geolocation`, `Notification`, `navigator.vibrate`, `navigator.getBattery` or `navigator.wakeLock`. An unenforced adapter decays into a wrapper that half the app bypasses, and then it has bought nothing.

---

## 11. Area pack and map config

Two formats, settled here because M4 and M13 both depend on their shape.

**The area pack** is a versioned, content-hashed dataset — for M0, a Berlin/VBB fixture:

```ts
type AreaPack = {
  id: string; // 'berlin-vbb'
  version: string; // semver
  contentHash: string; // sha256 of canonical serialization
  name: string;
  projection: Projection;
  bounds: BBox;
  modes: TransitMode[];
  lines: TransitLine[];
  stops: TransitStop[];
  boundaries: AdminBoundary[]; // districts etc — matching questions and area selection
};
```

**The map config** is what a host's builder session produces. M0 hand-writes one; M4 generates them:

```ts
type MapConfig = {
  id: string;
  gameId: string;
  areaPackId: string;
  areaPackVersion: string;
  projection: Projection;

  validHidingArea: MultiPolygon; // stored, not derived on demand — the seed of every fold

  enabledStopIds: string[];
  hidingRadiusByMode: Record<string, Meters>;
  contentHash: string;
};
```

**One area, and it constrains hiding rather than movement.** There is no second "play boundary" polygon. Players are not fenced in: seekers travel wherever they need to, routinely far outside any hiding zone, and a hider may wander out of their own. The area defines where a hiding _spot_ should be — and a spot outside it earns a warning, never a block.

The area pack's stop list is a _candidate_ inventory; what the builder emits is what the game uses.

**`validHidingArea` is stored, not recomputed from `enabledStopIds`.** It will often be heavily hand-customised — drawn additions, carve-outs, imported geometry by M18 — so it is not reproducible from the stop list plus a radius, and treating it as derived would silently discard a host's work.

The only movement rule anywhere in the game is a hider staying in their committed zone once the hiding phase ends, and that one is enforced by nobody and recorded nowhere (§5).

---

## 12. Testing

**`packages/rules` — unit and property tests.** The fast, cheap layer that must be dense:

- `satisfies(p, c) === regionContains(applyConstraint(WORLD, c), p)` for generated points and constraints
- fold commutativity: shuffling the constraint list yields identical geometry
- fold idempotence: disabling and re-enabling returns byte-identical output
- client and server produce identical geometry for identical inputs

**Playwright — acceptance.** Multiple browser contexts, one per phone. `context.setGeolocation` drives movement; `page.clock` makes timers and deadlines deterministic. Every "Reviewable when" in the build plan becomes a spec, and a milestone is done when its spec passes.

### M0 acceptance tests

1. Two contexts join one game by code; each sees the other in the lobby.
2. One context is force-quit and its network disabled, then rejoins and converges to correct state with no host action.
3. A context answers a radar question offline; a second context answers online first; on reconnect the first sees exactly one dismissible discard notice, and the log contains exactly one answer.
4. A player's own answer submission, retried after its response was lost, is a silent success — not a discard notice and not a duplicate row.
5. A radar constraint folded over the fixture map config produces byte-identical geometry on client and server.
6. A seeker context receives no hider coordinates on the ephemeral channel — asserted on the socket frames, not on the UI.
7. A context with its network disabled for ten simulated minutes flushes a complete, correctly ordered position track on reconnect, with every fix carrying the time it was actually taken rather than the time it arrived.

**Tests 3 and 7 are the ones that settle §3's offline bet**, and they should be written and run before anything is built on the assumption that they pass. They are not checking our code so much as checking that Zero, held in `connecting` for game-scale durations, queues and flushes the way its state table promises.

Test 6 is worth keeping even under the good-faith assumption. Not because a friend would open dev tools, but because it is the only test that fails loudly when someone widens a fan-out filter by accident three milestones from now.

---

## 13. Decisions taken

1. **Position snapshot rate** — 30s default, configurable (§8).
2. **Token lifetime** — long, 90 days, with a note in §4 on staying compatible with a later account concept for reviewing past games.
3. **Join codes** — globally unique, six characters from an unambiguous alphabet (no `0/O`, `1/I`). Simplest to reason about, and the collision domain is nowhere near a problem at this scale.
4. **Debug harness** — kept, provided it stays cheap. A tool that can drive a synthetic game with scripted movement is worth a great deal by the time M13 needs to be verified against a hand calculation, and it doubles as the fixture generator for the Playwright suite.
5. **`validHidingArea`** — stored (§11).

### Still open

- **Whether Zero deduplicates retried mutations.** Nothing in this spec depends on the answer (§7), and acceptance test 4 shows the mutator's own-retry branch behaves either way. It becomes load-bearing before M9's photo endpoint, which is plain HTTP and will need a key of its own.
- **A cold start with no connection shows nothing** (§3). Not a blocker for M0, whose harness is always launched online, but M2 owns whatever the answer is.
