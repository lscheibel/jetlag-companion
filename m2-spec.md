# M2 — Live Map and Visibility Rules — Technical Specification

The screen the game is actually played on. Everyone can see who is playing; only some people can see where.

Companion to [build-plan.md](build-plan.md), [m0-spec.md](m0-spec.md) and [m1-spec.md](m1-spec.md). Where they disagree, the build plan owns _what_, m0-spec owns the contracts, m1-spec owns the lobby, and this document owns _how M2 renders position_.

---

## 1. Scope

M0 built the pipes for position and M1 built the roster. M2 is the first milestone that puts a coordinate on a screen.

**In scope**

- A base map, and the decision about which one — renderer, tiles, style, attribution
- Own position: marker, accuracy radius, compass heading, follow and recenter
- Everyone else's position, filtered exactly as m0-spec §8 and m1-spec §9 already say
- Staleness rather than confidence: _"last seen 3 min ago"_, greying, dashed accuracy
- Per-player battery, degrading to an honest "unavailable"
- The hider's self-blindness toggle
- A cold start with no connection, which m0-spec left open and assigned here

**Explicitly out of scope**

- 3D buildings, tilt, rotate, measurement, pins, place search (M3)
- The area builder; M2 renders the fixture map config and edits nothing (M4)
- Deduction shading and eliminated-area highlighting (M13). M2 draws the valid hiding area as an outline and gives it no meaning
- Movement trails and scrubbing (M14)
- **Caching map tiles.** Not deferred — not done, by anybody, ever. See §3
- Starting a round (M5). The debug harness remains the only way to move a round out of `pending`

**The guardrail.** M2 adds no Postgres column and no event type. It amends two things about the ephemeral channel (§5, §6), adds one platform capability (§8), and is otherwise a rendering milestone. If M2 finds itself changing what is stored, it has strayed.

---

## 2. Schema deltas

**There are none.** This is the first milestone that adds no column, no table, no event type and no status value, and it is worth saying out loud because it is evidence that M0 shaped the data correctly rather than evidence that M2 is small.

`positionSnapshot` already carries what M14 will replay. `ClientFix` already carries `accuracyMeters`, `speedMps` and a first-class `source: "unavailable"`. `mapConfig.validHidingArea` is already synced by `queries.game().related("mapConfig")`.

Two **wire** types change, and neither touches Postgres:

```ts
type PresenceEntry = {
  playerId: string;
  displayName: string;
  teamId: string | null;
  role: TeamRole | null;
  fix: PositionSnapshot | null;
  battery: BatteryState | null;
  onlineSince: number;

  online: boolean;           // ▲ an entry outlives its socket — §6
  fixAgeMs: number | null;   // ▲ measured on the server, at fan-out — §5
};
```

`ClientFix.headingDeg` stays on the wire and M2 renders nothing from it — see §8.

The map's initial camera is **derived from `mapConfig.validHidingArea`**, not stored. A bounding box of a MultiPolygon is four `Math.min`/`Math.max` calls, and a stored camera is a value that goes stale the moment M4 lets a host redraw the area. `game.mapConfigId` is nullable and stays nullable — a game whose map has not been built yet (M4's `draft`) opens on the player's own position instead, and on nothing in particular if there is no fix either.

---

## 3. The map stack

**Renderer: MapLibre GL JS.** Named in m0-spec §2 as the eventual choice, and confirmed here for a specific reason rather than a habitual one: M3 requires 3D buildings, tilt and rotate, which rules out Leaflet and every raster-tile library. Choosing a simpler renderer now and swapping at M3 means writing the marker layer and the camera twice.

**Tiles: OpenFreeMap's public instance.** Vector tiles and styles, served from `tiles.openfreemap.org`, consumed straight from the browser.

```js
new maplibregl.Map({
  container,
  style: "https://tiles.openfreemap.org/styles/positron",
});
```

That is the whole integration. No key, no registration, no account, no cookie, no usage ceiling on views or requests, and no origin to run ourselves. It is MIT-licensed and explicitly free for commercial use, and it offers weekly planet downloads if this project ever outgrows the public instance — so the escape hatch exists without being built today.

**Style: Positron**, from the five OpenFreeMap publishes (Positron, Bright, Liberty, Dark, Fiord 3D). Positron is the low-contrast greyscale base designed to be drawn *on top of*, which is precisely what this screen is: the map is context and the players are the content. Bright and Liberty are handsome and would bury a 24 px marker in café pins.

Two things follow that are worth having decided:

- **Dark exists**, so a night mode is a style URL rather than a project.
- **Fiord 3D exists**, so M3's 3D buildings are a style swap on the same provider rather than a second map stack. That is the single biggest reason to pick this provider over a plain OSM raster source.

If Positron turns out not to be field-hostile enough in direct sun, the fix is Maputnik: edit the style, serve the resulting JSON as a static asset from our own app, and keep pointing at OpenFreeMap's tiles. That is a static file, not infrastructure, and it is the only thing this project would ever host.

**Attribution is not optional and not collapsible.** OpenFreeMap requires it, OpenStreetMap's licence requires it, and the build plan's first principle — credit what you build on — points the same way. The exact string, always visible:

> OpenFreeMap © OpenMapTiles Data from OpenStreetMap

### No tile caching. None.

**M2 does not cache tiles, and neither does any later milestone.** The browser's own HTTP cache does whatever it does; we do not help it, fight it, warm it or budget it, and no service worker rule mentions tiles.

The reason is what a game actually looks like. A player is underground for two or three stops and then back on the surface. They are not walking Brandenburg with no signal for an afternoon. The things that genuinely must survive a tunnel already do, and they were designed to in M0: the durable position log queues in `localStorage` and flushes on resurfacing (m0-spec §8), and Zero holds writes through the gap (m0-spec §3). Those are records that cannot be recreated. A map tile can be re-fetched in four seconds.

Pre-caching a city's tiles would mean a download budget, a zoom-range policy, a per-preset size negotiation with M4, a cache eviction story and a stale-tile question — a substantial subsystem, bought to improve two minutes per U-Bahn ride. The map is blank grey while offline and comes back when the signal does. That is the correct trade and it is written down here so that nobody re-litigates it as an optimisation later.

**Bundle cost is accepted.** MapLibre is a large dependency by this repo's standards, precached by the existing service worker as an app asset. That is the library, not the map data — the library is what makes the app *start* offline, which is a different question from what it can *show* (§11).

**MapLibre is excluded from Vite's dependency optimizer**, in `apps/web/vite.config.ts`, and that is load-bearing rather than tidying. It loads its tile worker from a blob whose only statement is `import "<new URL('maplibre-gl-worker.mjs', import.meta.url)>"`. Prebundled into `.vite/deps`, that URL resolves next to the bundle, where the worker file is not — so the worker starts, its import 404s, and **every vector tile request hangs forever with no error event**. The symptom is a correctly sized map showing nothing but the style's background colour, with the style, the sprite and the TileJSON all fetched successfully. §13's twelfth test is the guard, and it does not need the real service to be one.

### The test suite never calls OpenFreeMap

**Every acceptance test intercepts `tiles.openfreemap.org`, unconditionally, and nothing reaches it.** OpenFreeMap serves this project for free, with no key and no request ceiling, on nothing but goodwill. A suite that hammers it on every run — locally, in CI, once per phone per case — is putting load on that goodwill in exchange for no information, because *that the service serves tiles* is an assumption this project is entitled to make and has no business re-verifying on a loop.

What is not an assumption is that this app manages to ask. The stub therefore serves a style that still declares a vector source, so MapLibre goes on to request tiles; the requests arriving at the interceptor are what proves the worker is alive. That is the whole of the guard against the defect above, and it costs the real service nothing.

---

## 4. Three sources of position, one map

The map reads from three places, and conflating any two of them is the mistake this section exists to prevent.

| Source | Carries | Used for |
| --- | --- | --- |
| `queries.players()` + `queries.teams()` (Zero) | Who is in the game, on which team, in which role | **Who gets a marker at all** |
| The ephemeral channel (m0-spec §8) | Live position, battery, online-ness | **Where each marker is, and how stale** |
| `webPlatform.location` (direct) | This device's own fix | **Own marker, own accuracy ring** |

Three rules fall out of that table.

**The roster is Zero's, not the channel's.** The map iterates players from synced state and left-joins presence onto them. A player with no presence entry is rendered as offline rather than omitted — which is the only way "a phone in airplane mode goes visibly stale instead of silently wrong" can be true, and it also survives a page reload, when the socket is new and Zero's store is not.

Players who have left or been removed (`leftAt` set, m1-spec §7) get no marker, however recently they were seen. They are not in the game, and a marker is a claim that somebody is out there.

**Own position never round-trips.** The device knows where it is; asking the server to tell it back adds latency and a failure mode for nothing. Own marker and own accuracy ring render from the local watch even with the socket down.

**The durable log is not a map source, and it is not a live surface at all.** It is a replay artifact. Nothing during a running game reads it — not the map, not a roster, not a hider's wider view — and that is not a restriction M2 is imposing but a description of what the log is for.

> **Amended.** The map now draws movement **trails** from the log, so it is a live source after all. The rest of this section stands: what changed is that a marker alone turned out not to answer "which way did they go", and the log is the only record of that. See _Trails_ below.

Worth stating plainly, because m0-spec twice says the log feeds M8's suggestions and it does not. Every input M8 needs is somewhere else: a location question is evaluated against **the live position of the player answering it** (build plan, M8), and a thermometer's two reference points are recorded on the `question` row as `askPosition` and `endPosition` (m0-spec §5). The log is written during play and read after it. Both m0-spec sentences have been corrected.

That dissolves the question of whether hiders should see everyone's track. During the game nobody reads it; once the game is over, the round is revealed and a replay shows everything to everyone. **The log's visibility is decided once, at reveal, and it belongs to M14.** `queries.positionLog()` keeps its own-team filter meanwhile, because the strict version cannot leak while nothing depends on the loose one.

A hider who was offline for five minutes has genuinely lost those five minutes of seeker movement. The ephemeral channel is lossy by design, and reconstructing a trail from the durable log would put a position on a hider's screen that the channel had already decided not to send them.

**Markers jump; they do not interpolate.** Fan-out is every 2 s, and smoothing between two fixes would paint a position nobody reported. Everything else in this app is careful to distinguish what was measured from what was inferred (m0-spec §7), and a marker gliding smoothly down a street it may not have taken is the same lie in a prettier form.

### Trails

_This subsection amends what §4 says above about the log's visibility._

A marker says where somebody is. It does not say which way they came, and on this map that is most of the information: a seeker team walking north-east out of a station is a different fact from a seeker team standing in it. Presence cannot supply it — it is lossy on purpose and carries one fix — so the trail is drawn from the log, one sampled vertex at a time.

**The sampling interval drops from 30 s to 5 s**, because it is now the trail's resolution as well as the replay's. At half a minute a walk around a block is three points and a straight line through the buildings between them — the polyline stops being coarse and starts being wrong about the shape of the route. `game.positionIntervalMs` was always a knob rather than a constant (m0-spec §8); this moves its default, and nothing else about §10's table changes.

**The log's live visibility is presence's rule, not the strict own-team one, and not M14's reveal.** `queries.positionLog()` returns own-team rows always, plus every row in the game to a hider on a running round — exactly the set §8 already sends that hider live. A seeker never receives a hider row and seeker teams stay hidden from each other, which is the invariant test 11 exists to defend and which is unchanged.

Two consequences follow, and both are deliberate.

**A hider who was offline for five minutes gets those five minutes back.** §4 said above that they should not, on the grounds that the channel had "decided not to send them". That was wrong about what the channel does: a dropped frame is a delivery accident, not a visibility decision, and the entitlement was never in question — the hider was allowed to see every one of those positions at the moment they happened. Losing them to a tunnel is a property of the transport, and there is no reason to reproduce it in a source that does not have it.

**A trail is the last fifteen minutes, and it fades out behind you.** Long enough to hold the leg somebody is on — a couple of stops and the walk either side of them — and short enough that a two-hour round does not end with eight players' whole afternoons drawn over each other. The fade runs to nothing at the window's edge, so the cut is never a visible end: a trail dissolves rather than stopping.

**The fade is dated without ever comparing two clocks.** This is the trap in the feature, and it is m0-spec §7's invariant in a new place. A point's age is `now - capturedAt`, and `capturedAt` is the *sender's* clock — the same subtraction §5 amended M0 for. What is done instead: the head of each trail is dated by the server-measured staleness §5 already computes, and every other point is aged as _the head's age, plus how long before the head it was captured_. That second term is a difference between two timestamps from one phone. No reader's clock ever meets a sender's, and a player whose head cannot be dated gets no trail — which is a player with no marker either.

It also gets the stale case right for free. A phone that went quiet twenty minutes ago has a head twenty minutes old, so its whole trail is past the window and gone, rather than a bright track implying somebody is still walking it.

**And it is drawn low in the stack.** A trail sits just above the board — buildings, the game area, elimination shading — and below every station, POI, zone, pin, measurement and draft. Those are all things somebody needs to read or act on now; history is never what should be covering one of them up. Above the board rather than under it, because a hairline beneath a translucent wash is a hairline nobody can follow. m3-spec §9's one declared order, not React's mount order, is what decides this.

Because MapLibre paints one opacity per feature, a trail is cut into sixteen bands and drawn as a run of features, each sharing its end vertex with the next so the line stays continuous. Sixteen is where the step between neighbours stops being visible in a hairline.

**The reveal is still M14's.** Trails end at the running round: a `pending` round has no track, an `ended` one is history, and the moment roles swap the hider's extra rows leave the client's store because the query is re-evaluated rather than latched. Scrubbing a round, replaying it, and showing hider tracks to seekers afterwards are all still M14's, and none of them is what this is.

**Blindness covers trails, through the same switch.** §9's toggle filters the marker set, and the trail set _is_ the marker set — a hider who stops seeing a rival's marker stops seeing where it came from, in the same tap, with no second rule to keep in step.

**Trails pass through the measured points, and are curved between them.** The live fix is appended as the last vertex so the line reaches the marker rather than stopping a whole interval behind it. Between two fixes the trail is a centripetal Catmull-Rom curve rather than a straight segment.

This is a deliberate exception to _"markers jump; they do not interpolate"_ above, and it is worth being exact about what it costs. The curve between two fixes is drawn, not observed — nobody reported walking it. What makes the exception survivable is that the spline is **interpolating**: every measured point is still on the line, so the trail never moves a fix, and the invented part is confined to the shape of the join. The alternative was a chain of mitre joints, which reads as a series of sharp decisions the player did not make either — at a five-second cadence a shallow turn is genuinely shallow, and the polyline was overstating it. Neither drawing is the truth; the curve is the one that misleads less.

The exception does **not** extend to markers. A marker is a claim about where somebody is now, and sliding one between two fixes puts a player somewhere they were never reported to be at a moment when somebody is deciding whether to get off the train. A trail is a claim about where somebody has been, and the fixes in it are all still there to be read.

Centripetal rather than uniform, because a uniform spline loops and cusps wherever two fixes are close together and the next is far — which is precisely what standing on a platform and then boarding looks like. At α = 0.5 the curve cannot self-intersect between two points, so a phone that sat still does not sprout a flourish.

**And it is drawn quietly.** A trail is context for a marker rather than something to read. Everything else on this map that matters is a solid stroke at full contrast, and a history painted at that weight competes with all of it at once — so a trail is 1 px of team colour on 3 px of backing, a hairline with a halo.

The backing is the same two-tone reasoning as the in-hand tools (m3-spec §9) applied to a colour that is not ours to choose: team colours are picked to tell teams apart, not to sit on a basemap, and some of the palette disappears into Positron's pale ground while some disappears into Dark's. The colour carries the identity and the backing does the separating, which leaves the theme knowing about exactly one of the two layers.

---

## 5. Staleness, and the clock M2 stops comparing

**M0 has a defect here, and M2 is the milestone that cannot live with it.**

m0-spec §8 says every client renders _"last seen 3 min ago"_ from the sender's `capturedAt`, and `presence.tsx` does exactly that:

```ts
`last seen ${Math.round((Date.now() - entry.fix.capturedAt) / 1000)}s ago`
```

`Date.now()` is the reader's clock. `capturedAt` is the sender's. That subtraction compares two device clocks — the one operation m0-spec §7 says is never performed anywhere in the system, in a section titled "No clock offset". On a phone five minutes fast it renders _"last seen -300s ago"_; on a phone five minutes slow every teammate looks permanently stale.

m0-spec knew and accepted this: _"a phone with a badly wrong clock will look odd rather than corrupt anything."_ That trade was fine when staleness lived in a debug panel. It is not fine now — **staleness is M2's headline feature**, and the build plan's reviewable-when for this milestone is precisely that a disconnected phone looks stale rather than wrong.

**The fix is to send an age instead of a timestamp.** The server already stamps `receivedAt` on every fix it relays, so at fan-out it measures the age itself — one clock, subtracted from itself:

```ts
fixAgeMs = Date.now() - entry.fix.receivedAt   // server clock, both terms
```

The client counts up from the moment the frame arrived, using its own clock for both terms:

```ts
ageMs = entry.fixAgeMs + (Date.now() - frameArrivedAt)
```

Two elapsed durations added together. No absolute timestamp from one device is ever compared with another's, and the invariant m0-spec §7 states survives contact with the feature that was going to break it.

`capturedAt` keeps its job everywhere else. It remains authoritative for the **durable** log, where it is the whole point: a batch flushed after ten minutes underground must not claim to have happened when the signal returned. The amendment is narrow — presence is never queued, so presence has no use for it.

The `clockDrift` advisory from m0-spec §8 stays exactly as it is. It now tells a device its clock is odd without that oddness being visible to anyone else, which is what "advisory, local, never propagated" was always supposed to mean.

### The buckets

| Age of the last fix | Marker | Label |
| --- | --- | --- |
| < 30 s | full colour | "±50 m" |
| 30 s – 2 min | full colour, dimmed | "1 min ago · ±50 m" |
| 2 – 10 min | desaturated | "6 min ago · ±50 m" |
| > 10 min | grey outline only | "last seen 43 min ago" |
| no fix ever | grey outline | "no position" |

**The label is always relative, at every age.** "Last seen 43 minutes ago" is the fact a player acts on; a clock time makes them do the subtraction themselves while walking. The absolute time appears in the detail sheet (§12), where somebody has stopped to read.

**Accuracy is a ring for your own position and a number for everybody else's.** The build plan asks for an accuracy radius on own position and it earns its place there: it is one circle, it is about the phone in your hand, and its size is the difference between "I am at this exit" and "I am somewhere in this square". Drawing the same circle around four other players turns the map into overlapping washes — and a network fix with 1.5 km of accuracy would swamp a district with a ring that tells a reader nothing they can act on. _"±1500 m"_ next to the name says the same thing in six characters and gets read rather than squinted at.

Accuracy drops off the label with the position, past ten minutes: a metre figure attached to a fix that old is precision about the wrong thing.

Bucketing is a pure function of an age in milliseconds, so it is unit-tested rather than looked at.

---

## 6. Offline is a state, not an absence

**The second inherited defect, and it is one line.** `apps/server/src/ephemeral.ts` deletes the presence entry when the socket closes:

```ts
socket.on("close", () => {
  room.presence.delete(connection.playerId);   // ← the player vanishes
});
```

So a phone that goes into a tunnel does not go stale. It disappears — from every other device, instantly, taking its last known position with it. §5's careful staleness buckets would have nothing to render, and "last seen 5 minutes ago" would be unimplementable.

**An entry outlives its socket, for the life of the game.** On close the entry stays and flips `online: false`; the fix it was last carrying stays with it and keeps ageing. On reconnect, `register` updates the existing entry rather than replacing it, so a page reload does not blank a position that is still perfectly good.

**There is no expiry sweep.** An entry is discarded when the room is — which already happens when the last connection leaves — and never before. A three-hour-old fix labelled "last seen 3 hours ago" is a true statement and a useful one; deleting it to save memory would delete the answer to "where did we last see Ben" in a game with at most twenty players in it.

The distinction the UI draws from this:

- **online, fresh** — a live position
- **online, stale** — connected, but the phone has not managed a fix (indoors, GPS denied, battery saver)
- **offline** — no socket, so the last known position is as good as it gets
- **never seen** — in the game, has not opened it

Those are four different things and a player reading the map can act on the difference between them. That is the whole argument for staleness over a confidence percentage.

**The reading side had the same defect and it was missed twice.** `apps/web/src/ephemeral.ts` emptied `entries` when *its own* socket closed, so a phone entering a tunnel lost every marker it had — the same "vanishes rather than goes stale" mistake, seen from the other end. What a phone knew a moment ago is still the best information available, so the entries stay and age from the frame they arrived in. A reconnect replaces the lot with a fresh frame.

### Two more inherited defects, found by watching a marker fail to move

Neither was visible before M2, and both are in the same family: plumbing that was never exercised because nothing rendered what it carried.

**The send heuristic could not deliver a fix that lost a race.** `sendPosition` was only ever called from a `watchPosition` callback, which makes both of its rules unreachable in the two cases that matter most. A fix arriving inside the 3 s throttle window was dropped — and `watchPosition` does not call back again for a phone that has walked somewhere and stopped, so the position it walked *to* was simply never sent. For the same reason `FORCE_SEND_AFTER_MS` could never fire on a stationary phone: its `receivedAt` was stamped once and then aged through §5's buckets while it sat there online with a perfectly good lock. **A hider standing on a platform would have looked stale to everyone within two minutes**, which is the whole hiding phase.

The channel now re-offers the fix it is already holding, every two seconds. That is not a retry and not a queue — `sendPosition` is handed the one fix it already has, and every existing rule about distance and interval still decides whether it goes. It makes M0's two constants mean what their names say.

**A closed channel still introduced itself, and replaced its own successor.** `close()` cannot cancel a handshake, so a socket abandoned mid-connect finished connecting anyway and then said `hello`. The server's one-connection-per-player rule is newest-wins, so the dying socket replaced the live one that had already taken its place — which was sent `bye: replaced` and, correctly, stopped reconnecting. The result was **a phone with no presence stream at all for the rest of the game**, whenever a remount lost that race. Every screen change is a remount, and so is every StrictMode double-mount in development. A channel that has been closed now says nothing and hangs up.

---

## 7. Visibility, on a screen

The rule is settled and M2 changes none of it. m0-spec §8, as corrected by m1-spec §9:

> **Everyone in a game can always see everyone else. What is secret is where they are.**

| | Roster, name, team, role, online-ness | Position and battery |
| --- | --- | --- |
| Own team | yes | yes |
| Another seeker team, seen by a seeker | yes | **no** |
| A hider team, seen by a seeker | yes | **no** |
| Anyone at all, seen by a hider | yes | yes |
| Anyone, before roles are assigned | yes | own only |

Seeker teams know each other perfectly well. They are in the same game, in the same lobby, in the same group chat, and they will compare notes over a beer afterwards. What they must not have is each other's **whereabouts**, because seeker teams race each other and a team that can watch a rival converge on a district has been handed that rival's deductions for free.

The build plan's reviewable-when for M2 used to say seeker A could not see seeker B "anywhere in the UI", which was wrong and has been corrected in [build-plan.md](build-plan.md). It is a rule about coordinates, not about existence.

**The rule generalises, and stating it now settles a later question.** Anything that reveals where a seeker team is or is going is scoped to that team: their positions, and — when M3 adds them — their pins and their suspected hiding zone. The build plan already says that zone is "shared within the team", and this is why. A rival's intended search area is worth more than a rival's current position, not less.

**No new filtering code.** The channel filters fields at fan-out and `queries.positionLog()` filters rows at query resolution. The map renders what it is given. Anything the client has to remember to hide is a leak waiting for a refactor — the argument m0-spec §8 already makes, and M2 simply does not undermine it.

**The filter has no round-state precondition**, as shipped in M1. The strictest reading is also the cheapest one here: in a lobby everyone is standing in the same room, so nobody loses anything by not being tracked, and a rule with no "unless" in it cannot be got wrong by a screen written three milestones from now.

### Battery

Teammates and hiders, following `fix` rather than identity, per m0-spec §8.

**And nothing has ever sent it.** `EphemeralChannel.sendBattery` exists, the server handles `batt`, `PresenceEntry.battery` is on the wire — and no code in the app calls it. The plumbing was laid in M0 and never connected, which is invisible until a milestone displays the value. M2 connects it: read on mount and on the sampling interval, push through the channel, re-announced on connect alongside the position.

Display is three states and never two:

| Capability | Shown |
| --- | --- |
| available, read | "62%", with a charging indicator |
| available, refused or failed | "battery unavailable" |
| unsupported by the browser | "battery unavailable" |

There is deliberately no fourth state for "we knew once". A stale battery percentage is worse than none: it gets acted on. m0-spec §10 called battery the immediate case for capabilities being first-class, and this is the milestone that collects on it.

**Which forces a decision that §6 would otherwise contradict.** A presence entry now outlives its socket carrying its last fix — so it carries a last battery reading too, and that must not quietly become a fourth state. Battery inherits the fix's staleness bucket and then stops: shown plainly while fresh, shown with its age while ageing, and **dropped entirely** once the marker greys out or the player goes offline.

The asymmetry with position is the point. A position from forty minutes ago is still a fact about the world — Ben was at Ostkreuz — and a player can act on it. A battery level from forty minutes ago is a fact about a phone that has been running ever since, and there is nothing to do with it but be wrong.

---

## 8. Heading is the compass, or it is nothing

There are two things called heading and only one of them is wanted.

- **Course over ground** — `ClientFix.headingDeg`, derived by GPS from movement. It is null whenever a phone is standing still, and it describes where somebody has been going rather than where they are facing.
- **Facing** — the compass. Available while stationary, which is when a player standing at a station exit needs it.

**M2 uses the compass and nothing else.** A player looking at their own marker wants to know which way to walk out of the station, and a course-over-ground arrow that appears while moving and vanishes when they stop — then reappears pointing backwards as they turn around — is worse than no arrow. **When there is no compass, no orientation is displayed at all.** No fallback, no inference, no arrow drawn from the last known course.

That requires one addition to the platform adapter, because `DeviceOrientationEvent` is a browser capability API and m0-spec §10's lint rule means it can live nowhere else:

```ts
readonly orientation: {
  capability(): Capability;
  watch(cb: (headingDeg: number) => void): Unsubscribe;
};
```

It reports itself unavailable freely, and the UI treats that as an ordinary state: iOS requires a user gesture before it emits anything, Android's absolute orientation varies by device, and a desktop browser has no compass at all. `capability()` returning `{ available: false, reason: "denied" }` until a gesture is an honest description of iOS rather than a workaround for it. The callback takes a number, not a nullable one — "no heading" is the absence of the capability, not a null reading inside it.

**Only your own marker has an orientation.** Compass heading is never broadcast: it changes every time a phone turns in a hand, which would defeat the channel's 3 s / 10 m send heuristic entirely, and no one needs to know which way a teammate's phone is pointing. Broadcasting position is a game mechanic; broadcasting facing is telemetry. Other players' markers therefore show no direction, and `ClientFix.headingDeg` — which M0 put on the wire and M2 renders nothing from — is left for M14's replay to decide what to do with.

---

## 9. Self-imposed blindness

A hider who can watch three seeker teams closing in has swapped a game for a spectator sport. The build plan gives them a switch.

**It is local, and that is the entire specification.** Stored in `localStorage` per game, never sent, never recorded, no event, no mutator, no column — the same shape as m0-spec §5's "you have left your hiding zone" nudge, and for the same reason: it is a fact about how one person wants to use their phone, not a fact about the game.

```
zero-lag.blind.<gameId>   // "on" | absent
```

- **Offered to hiders only.** A seeker sees their own team and nobody else, so the toggle would be a no-op with a confusing label.
- **It hides other teams' markers, not the player's own team.** Three hiders coordinating still need each other; what they want to stop seeing is the search closing in.
- **It is obvious and reversible in one tap**, and the map says plainly that it is on. A player who forgets they enabled it and concludes the app is broken is a worse outcome than the temptation it was protecting them from.
- **Nothing else changes.** Presence keeps arriving, the channel keeps sending, the durable log keeps recording. This is a rendering switch, and a hider who flips it back sees the current truth rather than a resumed one.

---

## 10. When a phone tracks, and when it does not

m1-spec §9 says the lobby does not track position, and gives a good reason: a lobby that drains 8% of everyone's battery while the group argues about team names is a bad first impression. M2 needs positions before M5 exists to start a round, so the rule needs restating rather than breaking.

**Broadcasting follows the screen. Logging follows the round.**

| | Live broadcast | Durable log |
| --- | --- | --- |
| Lobby, map closed | no | no |
| Map open, round `pending` | **yes** | no |
| Round `hiding` / `seeking`, any screen | **yes** | yes, on the interval |
| Screen locked | stops — see below | keeps whatever it had queued |

A player who opens the map is asking where everyone is, and the answer is worthless if their own phone is not part of it. A player sitting in the lobby is not, and their phone stays quiet.

The durable log stays gated on a running round because it feeds M8's suggestions and M14's replay, and neither wants twenty minutes of everybody milling about a station concourse.

**The screen-lock problem is admitted rather than solved.** Browser geolocation stops when the screen locks; the build plan says so at M15 and says a Capacitor build is the answer. Until then M2 does the two honest things available to it:

1. **Acquire the wake lock while the map is open during a running round** — `webPlatform.wakeLock`, unused since M0 defined it — and release it on unmount and when the round ends.
2. **Say so.** The map states that tracking pauses when the screen locks, once, where a player will read it. Everyone else's view of that phone degrades through §5's buckets, which is exactly what those buckets are for.

**Backgrounding the app is the same admission, and "broadcasting follows the screen" turns out to be literal.** A hidden document has its `watchPosition` suspended and its timers throttled by the browser, so a player who switches to their messages stops reporting until they come back. §5's first bucket is thirty seconds wide, so a glance away is invisible; a longer detour greys the marker, which is true. This is not a bug to route around — it is the same browser limit as the lock screen, with the same answer at M15.

**The hiding-zone nudge is a round feature, not a map feature.** m0-spec §5's local, unrecorded _"looks like you left your hiding zone"_ warning is armed only once the round has actually started — specifically once the hiding phase has ended and `round.status === "seeking"`. During the hiding phase hiders travel freely and without restriction, so a nudge then would be wrong on its own terms. M5 owns the commitment flow that gives the nudge a zone to compare against; M2 only has to leave room for it on the screen.

---

## 11. A cold start with no connection

m0-spec §3 left this open and named M2 as the owner. Here is the answer.

The situation is specific: Zero resolves named queries on the server, so a client launched with no connection has no resolved queries and therefore no synced data at all — not stale data, none. The app is blank rather than out of date. Staying in a tunnel is fine; being _launched_ in one is not.

**What a cold offline start shows: the app, your own position, and a sentence explaining the rest.**

- **The app starts**, because the bundle and the shell are precached by the service worker.
- **The base map does not render**, because tiles come from the network and §3 caches none. The canvas is empty. That is the trade taken deliberately and it should look deliberate — an explicit "map unavailable offline" surface, not a broken grey rectangle.
- **Own position and accuracy render regardless**, on that empty canvas, with a coordinate readout — because the device's own fix needs no server and a hider who wants to know whether they have drifted is served by numbers when they cannot be served by a picture.
- **The durable position log keeps queueing** to `localStorage`, exactly as m0-spec §8 promises, and flushes when the signal returns.
- **A banner says the game has not loaded yet** — not a spinner, not an error. A spinner implies something is about to happen, and a phone underground has no idea whether that is true.
- **Everything needing synced state** — roster, teams, roles, other players — is absent and labelled absent.

**What it deliberately does not do: mirror Zero into local storage.** A local copy of the roster would make the cold start prettier and would be a second source of truth for synced state, kept fresh by hand, diverging silently. The whole reason M0 chose a sync engine is to not own that problem. If a cold offline start ever needs to be richer than this, the answer is a persistent local store in Zero's own layer, not a shadow copy in ours.

This is a rare case and it is worth being honest about how rare: it needs the app to have been killed *and* the phone to be offline *and* the player to relaunch before resurfacing. The common case — the app already open when the train enters the tunnel — keeps every marker it had, ages them through §5's buckets, and re-renders tiles the moment there is signal.

---

## 12. Routes and UI shape

One new route, inside the session layout that m1-spec §8 established:

```
/g/:code          the lobby
/g/:code/map      the map                    ← new
/g/:code/debug    the M0 harness, kept
```

The lobby links to it and the map links back. There is no navigation chrome beyond that yet; M5 owns what the in-round shell looks like.

```
MapRoute                camera state, blindness toggle, tracking gate
  MapCanvas             owns the MapLibre instance; provides it by context
    GameAreaLayer       validHidingArea, outline only — M13 gives it meaning
    OwnPosition         own marker, compass arrow, accuracy ring — the only ring
    PlayerMarker        one per player — TeamBadge, staleness, accuracy as text, battery
  MapControls           recenter / follow cycle, blindness, tracking notice
  PlayerSheet           tap a marker: name, team, last seen (relative and absolute), accuracy, battery
```

**MapLibre is a genuine external system**, which makes it the legitimate `useEffect` this screen is allowed. One effect creates the map and one tears it down; everything after that is a component that owns one imperative object and syncs it from props. Markers render `TeamBadge` through `createPortal` into the marker's own DOM node, so m1-spec §4's promise — one component renders a team, everywhere — holds on the map too. That promise was written for exactly this screen: a marker at 24 px in bright sun is where colour-alone identification fails first.

**Camera is a discriminated union**, per the repo's React rules:

```ts
type Camera =
  | { mode: "free" }
  | { mode: "follow" }         // centre on own position
  | { mode: "followHeading" }; // centre and rotate to compass heading
```

`followHeading` is offered only where the compass is available (§8), rather than offered and then silently equivalent to `follow`. Any user gesture drops to `free` — dragging the map is an unambiguous statement about what you want to look at. The recenter control cycles forward and shows which mode is active, rather than being a button that silently does one of three things.

**The one accuracy ring is a circle in metres, and that primitive already exists.** `packages/geo` densifies a radius to a fixed vertex count for radar constraints; the ring uses the same function rather than a second one. The argument is m0-spec §9's, unchanged: two implementations of one idea drift, and the symptom shows up as a geometry bug long before anyone suspects duplication.

Field-hostile, per the build plan and m1-spec §11: 44 px controls, one-handed reach at the bottom of the screen, nothing carried by colour alone, and a marker legible with a thumb over half the phone.

**Crowding is accepted for now.** Five phones in one station concourse is the normal case at the start of a round, and five badges on one coordinate is a pile. No clustering, no spiderfying, no stacking in M2 — it is a known and tolerable ugliness, and it is much easier to design against once there is a real screen to look at with real bodies standing in a real concourse.

---

## 13. Testing

**Unit, in `packages/schema` and `apps/web`:** the staleness bucket function over a range of ages; the bounding box of a MultiPolygon; the accuracy ring's agreement with `packages/geo`'s circle; and the age arithmetic of §5 — given a `fixAgeMs` and an elapsed local interval, the rendered age is their sum and involves no absolute timestamp.

**Playwright acceptance.** Each of these is a spec, and M2 is done when they pass.

**Tiles are stubbed in all of them, and OpenFreeMap is never called** (§3). The stub answers the style URL with a minimal style that still declares a vector source, so MapLibre reaches `load` and then asks its worker for tiles — which is what test 12 reads. The whole suite runs with no internet.

1. A hider watches three seeker teams move. `context.setGeolocation` walks each seeker; the hider's map shows three markers moving, each attributed to the right team. Each phone is fronted while it walks, because §10's admission about the lock screen applies to a hidden tab too.
2. Seeker team A sees seeker team B in the roster, on their team, with their online state — and no coordinate of theirs anywhere: no marker, no readout, and none in the socket frames. The frame assertion is m0-spec test 6 extended to a second pairing; the roster assertion is what makes it the corrected rule rather than the old one.
3. A phone enters the tunnel. Its marker on every other device stays put, greys through the buckets, and reads "last seen N minutes ago". It does **not** disappear — the regression guard for §6. It first asserts the converse, which is the half that broke: a phone standing perfectly still for longer than the fresh bucket stays fresh.
4. A phone whose clock is ten minutes fast still reads every other marker's staleness correctly. The regression guard for §5, and it fails loudly against M0's `capturedAt` arithmetic. Only the *reader's* clock is skewed: skewing the sender's would need a faked `GeolocationPosition.timestamp`, which Playwright does not fake — the same limitation m0 test 7 records — so the drift advisory is not asserted here.
5. Own position renders with its accuracy, with the socket blocked from the first paint. Everybody else's accuracy appears as text, under the marker and in the sheet. That there is exactly one ring is structural rather than pixel-asserted — `AccuracyRing` has one caller and `PlayerMarker` draws no map layer at all — because a WebGL fill is not something a DOM assertion can count.
6. Follow, drag to free, recenter: the camera follows a moving fix, a drag drops it to `free` and it stays there, and recenter picks it back up.
7. With no compass available, no orientation is rendered anywhere — no arrow on own marker, no `followHeading` mode offered — and the map is otherwise fully usable.
8. The hider's blindness toggle hides other teams' markers, keeps their own team and their own position, is reversible in one tap, and sends nothing — asserted on the socket frames and on the event log, both identical either side of the toggle.
9. Battery with the capability unavailable reads "battery unavailable" and never "0%"; a teammate's battery disappears when they go offline, while their position and its age remain. The other half of that rule — a battery dropping when the *fix* greys out past ten minutes — is a unit test, where eleven minutes is an argument rather than eleven minutes of a faked clock driving a live sync socket.
10. A cold start with no connection shows the app, own position and coordinates, the "map unavailable offline" surface and the not-loaded banner — no spinner, no error, no roster.
11. A seeker's Zero store holds no hider `positionSnapshot` rows while the round runs, asserted against the database, which proves the query-side half of the filter that the frame assertions cover for the channel.
12. The map asks the configured provider by name — Positron — and its tile worker gets far enough to request tiles, asserted at the interceptor rather than over the wire. The attribution string is on screen exactly once and is not behind a disclosure control. This is the regression guard for §3's tile-worker defect, and re-enabling the dependency optimizer makes it fail with zero tile requests.

And the M0 and M1 suites still pass.

Tests 2 and 11 are the pair that matters most: they are the only two that fail loudly when someone widens a filter by accident three milestones from now, and they cover the two different places the filter lives.

---

## 14. Decisions taken

1. **MapLibre GL JS**, decided now rather than at M3, because tilt and 3D buildings rule out the simpler alternatives (§3).
2. **OpenFreeMap's public instance for tiles and styles.** No key, no registration, no request limit, nothing to host — and Fiord 3D on the same provider means M3's buildings are a style swap rather than a second map stack (§3).
3. **Positron as the base style**, because the map is context and the players are the content. A Maputnik-customised style served as a static asset is the escape hatch if sunlight demands one (§3).
4. **No tile caching, at any milestone.** A tunnel lasts two stops; the things that genuinely cannot be recreated — the position log, queued writes — already survive it. Pre-caching a city buys two minutes per ride and costs a whole subsystem (§3).
5. **Staleness is computed from a server-measured age, never from `capturedAt`.** This amends m0-spec §8 and restores m0-spec §7's invariant that two device clocks are never compared (§5).
6. **A presence entry outlives its socket for the life of the game**, carrying `online: false` and its last known fix, with no expiry sweep. A disconnected phone goes stale, never absent. This amends m0-spec §8 (§6).
7. **Staleness labels are always relative** — "last seen 43 minutes ago" — with the clock time confined to the detail sheet (§5).
8. **The roster comes from Zero and presence is left-joined onto it**, so the map shows every player in the game, including those who have never connected (§4).
9. **Markers jump rather than interpolate.** A smoothed marker paints a position nobody reported (§4).
10. **Battery gets connected**, and displays exactly three states with no memory of a value it can no longer read (§7).
11. **Heading is the compass or it is nothing.** One new platform capability, `orientation`; no course-over-ground fallback; nothing rendered when it is unavailable; never broadcast (§8).
12. **Position secrecy generalises to intent.** A seeker team's positions, pins and — from M3 — their suspected hiding zone are all scoped to that team, for the same reason (§7).
13. **Blindness is local, hider-only, and hides other teams rather than everyone** (§9).
14. **Broadcasting follows the screen; logging follows the round** (§10). This refines m1-spec §9 rather than contradicting it — the lobby still tracks nothing.
15. **A cold offline start shows the app, own position and an honest banner, with no map and no mirror of Zero** (§11). This closes m0-spec's open question.
16. **The valid hiding area is drawn as an outline with no meaning attached.** It is already synced, a map with no game area on it is disorienting, and M13 owns everything about shading and elimination (§12).
17. **The durable position log is a replay artifact.** Nothing in a running game reads it, so there is no in-game visibility question to answer; the reveal decides it, and that is M14's. This corrects m0-spec §3 and §8, which said M8's suggestions read it (§4). **Amended:** the map draws live trails from the log, and its live visibility is §8's presence rule — own team always, plus everybody to a hider on a running round. Seekers still never receive hider rows, and the reveal is still M14's (§4, _Trails_).
18. **A stale battery is dropped; a stale position is kept.** A position from forty minutes ago is a fact about the world; a battery level from forty minutes ago is a fact about a phone that has been running ever since (§7).
19. **Players who have left the game get no marker**, however recently they were seen (§4).
20. **Accuracy is a ring for your own position and a number for everybody else's** (§5). One circle about the phone in your hand is legible; four overlapping washes are not, and _"±1500 m"_ says in six characters what a district-sized ring says badly.

### Found while building it

These four were not in the spec because none of them was visible until something rendered a position. All are now fixed, and each is a line the milestone could not have shipped around.

21. **The channel re-offers the fix it is holding, every two seconds** (§6). Without it a fix that lost the 3 s throttle race was never sent at all, and a stationary phone aged into "stale" while sitting online with a good lock.
22. **A closed channel says nothing and hangs up** (§6). An abandoned socket that finished its handshake and then said `hello` replaced its own successor, leaving a phone with no presence stream for the rest of the game.
23. **MapLibre is excluded from Vite's dependency optimizer** (§3), because prebundling breaks its tile worker in a way that produces no error and no map. Its container is also observed for resize, because MapLibre keeps a 400×300 fallback for life if it is constructed before layout.
    **The acceptance suite never calls OpenFreeMap** (§3, §13). Interception is unconditional, not a mode, and the guard against the worker defect reads the requests as they arrive rather than the tiles that come back — so the service carries no load from this repo's tests at all.
24. **Attribution is rendered by this app, not by MapLibre's control** (§3). The control merges the style's own credit with anything passed to it, and OpenFreeMap's style already carries the required string — so asking for both printed the same sentence twice. Ours also survives a style that never arrived.

### Still open

Nothing that blocks building it.

**Crowding is knowingly deferred** (§12): five badges on one coordinate is a pile, M2 leaves it a pile, and clustering is designed against a real screen rather than against a paragraph.

**Backgrounding pauses broadcasting** (§10), like the lock screen and for the same reason. M15's Capacitor build is the answer to both.
