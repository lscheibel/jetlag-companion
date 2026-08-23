# Hide & Seek Companion App — Build Plan

A milestone-based plan for a companion app to _Jet Lag: The Game — Hide + Seek_. Milestones are ordered so that each one is independently reviewable and, from Phase 1 onward, each leaves the app more playable than it was before.

---

## Product principles

These apply to every milestone and should be part of every review.

1. **Companion, not competitor.** The app reproduces the rules and cards it needs to be useful, and credits the official game it accompanies.
2. **Good faith is assumed.** No anti-cheat, no lockouts, no adversarial modelling. The app warns, reminds and suggests — players decide. Everyone in a game is a friend: role-based visibility is a server-side filter that keeps the game fun, not a security boundary, and no effort is spent defending against a player who opens dev tools. The blast radius of a bad actor is exactly one game — the one they were invited to.
3. **Suggestions, never verdicts.** Every computed value is advisory and overridable. GPS can be wrong, absent, or lying, and the app must stay fully usable when it is.
4. **Answer-time truth.** All location-dependent facts are evaluated at the moment of answering, not asking. Computed suggestions recompute live until the hider submits.
5. **First to the server wins.** When teammates act on the same thing, the first action to reach the server is authoritative and later duplicates are discarded. The superseded player gets a dismissible notice; the discard itself is not a game event and does not enter the log.
6. **Host-configurable.** Any rule can be enabled, disabled or overridden. Hand-written house rules are first-class content, not an afterthought.
7. **Every scale.** A single Bezirk and an all-Germany Deutschlandticket game are the same product, not two products.
8. **Field-hostile by default.** Phone in a pocket, sun glare, rain, tunnels, 8% battery. Every screen assumes those conditions.
9. **Local-first and realtime.** Every action works offline and reconciles without the player thinking about it.

## Milestone template

Each milestone below has: **Goal** · **Features** · **Reviewable when** · **Deferred**.

---

# Phase 0 — Skeleton

## M0 — Skeleton and technical contracts

**Goal:** Multiple devices can be in the same game object, stay there, and agree on what happened — and every decision that later milestones inherit is settled and proven by working code.

M0 is deliberately the heaviest planning milestone in the project. Everything under _Contracts_ is expensive to change once features are built on top of it. The guardrail that keeps this from becoming a three-month architecture phase with nothing playable: **M0 defines contracts and builds one vertical slice that exercises each — not full implementations.** One question type, no builder, no UI beyond a debug harness.

Specified in full in [m0-spec.md](m0-spec.md).

**Contracts**

1. **Sync.** Zero (`zero-cache` + Postgres) for game state, with server-authoritative custom mutators. Ephemeral data — live position, heading, battery, online-ness — travels on a separate channel and is never written to Postgres. Zero has no presence layer by design; this split is the intended usage, not a workaround.
2. **Event log.** Typed, versioned, append-only. Every mutator writes both the state rows the UI queries **and** an event row, in one transaction. No mutator writes state without emitting an event.
3. **Time.** Answers are authored by players and recorded as given; the server never validates or recomputes one. Events carry the server's receive time, the client's submit time for display, and — on answers — the elapsed time measured on the answering device, which is what a deadline actually cares about and is immune to clock drift. Device clocks are never compared to each other. Ordering is a per-game sequence number, not a timestamp.
4. **Conflict resolution.** First to the server wins, implemented as a rejecting mutator; the rejection returns a structured error that the superseded client renders as a dismissible notice. The discard is not an event.
5. **Constraint engine.** `applyConstraint(area, constraint) → area`, with the search area defined as a pure left fold over an ordered list of constraints. A constraint is a first-class record with a source — derived from an answer, or authored by hand — and an enabled flag. It is _not_ owned by the question that produced it. That one distinction is what makes hand-drawn constraints, disabled constraints, corrected answers and bulk invalidation the same operation rather than four features. Radar implemented as the proof; every other question type is a later addition against the same interface.
6. **Area pack format.** Content-hashed and versioned, carrying the station and line inventory plus the polygons derived from it.
7. **Platform adapter.** One interface for location, notifications, wake-lock, haptics and battery, with a web implementation behind it. Enforced by a lint rule banning direct use of the underlying browser APIs anywhere else, so that a later Capacitor build is a second implementation rather than a rewrite. An unenforced adapter rots into a wrapper that half the app bypasses.
8. **Rounds, roles and tokens.** A game is a series of rounds and **role is a property of a round, not of a team**, since hiders and seekers swap between them. Tokens carry player identity only; role is resolved by joining player → team → round → role, so that lobby team switches and round-to-round swaps take effect immediately without token juggling.

**Features**

- Create game / join by short code or QR
- Lightweight identity: display name + device, no account required
- Host role, host transfer
- Presence (who's online), rejoin after app kill or connection loss
- Game states: draft → lobby → running → finished
- **Team-action conflict resolution:** for any action a team can only take once (answering a question, casting a curse, marking a find), the first message to reach the server is accepted and later ones are discarded
- **Discard notice:** a dismissible message to the superseded player — "your answer was discarded, a teammate already answered" — and nothing further

**Reviewable when:** Two phones sit in one lobby; one is force-quit and airplane-moded, rejoins, and sees the correct state without host intervention. A player answers offline, a teammate answers online first, and on reconnect the offline player gets a dismissible notice rather than watching their answer vanish silently. A radar constraint folded over a hand-built area polygon produces identical geometry on client and server.

**Deferred:** Anything visual, anything map-related, every question type but radar, the area builder.

---

# Phase 1 — Playable core

Target for the end of this phase: a real game can be played with the app for setup, map and timing, and paper cards for everything else.

## M1 — Teams and lobby

**Goal:** A group can configure itself into the exact team structure it wants.

Specified in full in [m1-spec.md](m1-spec.md).

**Features**

- Team creation: name, color, emoji picker
- Roles: _n_ seeker teams × _m_ hider teams, several players per team
- Move between teams, kick, rename, and host as a role any player can take
- Lobby overview showing every team and its members

**Reviewable when:** Five phones join; the host builds 2 hider teams and 3 seeker teams with distinct colors and emoji; a player switches teams and everyone sees it immediately.

**Deferred:** Ready checks (M5).

## M2 — Live map and visibility rules

**Goal:** The core "where is everyone" surface, with the asymmetry the game needs.

Specified in full in [m2-spec.md](m2-spec.md).

**Features**

- Base map, own position with accuracy radius, follow/recenter, heading
- Teammate positions
- **Visibility matrix, and it is only ever about position:** everyone can always see who is in the game and which team they are on. Hiders see the _positions_ of all seeker teams and all other hiders; a seeker team sees only its own
- Hider positions are recorded server-side (for answer suggestions and replay) and are never exposed to seekers during play
- Hider toggle to hide/show their own map view (for self-imposed blindness)
- Staleness rather than confidence: "last seen 3 min ago", greyed markers, accuracy circles
- Per-player battery level visible to teammates and to hiders, wherever the platform exposes it. Battery is a browser-dependent capability that several browsers do not implement at all, so it degrades to an honest "unavailable" rather than to a stale number — one of the first things the M0 platform adapter earns its keep on

**Reviewable when:** A hider watches three seeker teams move in real time; seeker team A can see that seeker team B is in the game, on which team, and online — and cannot see where they are; a phone put into airplane mode goes visibly stale instead of silently wrong.

**Deferred:** 3D buildings (M3), deduction shading (M13).

## M3 — Map toolkit

**Goal:** Both roles get the geometry tools they'd otherwise open Google Maps for.

Specified in full in [m3-spec.md](m3-spec.md).

**Features**

- 3D buildings, tilt and rotate
- **Distance measurement** (multi-point path, total + segment readout), available to hiders and seekers
- Radius / circle tool around any point
- Team-shared pins with notes and colors
- **Suspected hiding zone:** a seeker team marks the zone it intends to search next, shared within the team. A coordination marker and nothing more at this stage; M13 later turns it into a one-tap constraint reset
- Place search, drop pin, coordinate readout, copy coordinates

**Reviewable when:** Both roles measure the same 1.4 km line and get the same number; a seeker drops a pin that only their team sees.

## M4 — Game area builder

**Goal:** A host can define a real, playable map in a couple of minutes, at any scale.

Specified in full in [m4-spec.md](m4-spec.md).

**Features**

- **One area, and it constrains hiding rather than travel.** The valid hiding area is **a single polygon the host chooses**, and is the seed of every deduction fold in M13. It is not a fence: seekers move through it and outside it as their search requires, and hiders move freely during the hiding phase. What it constrains is where a hiding _spot_ may be — and once the hiding phase ends, which zone its hider stays inside (M5)
- Area selection by administrative boundary, or by a drawn shape where no boundary fits. Selecting several boundaries is normal
- **Two conditions make a hiding spot valid, and both are advisory:** it is inside the area, and it is within the hiding radius of a station in play. The second is a distance query over the stops the game carries — not a polygon — which is why it survives the union being deferred
- **Hiding radius, set globally.** One number, and it does two jobs: it sizes a committed hiding zone and it decides whether a spot is near enough to a station
- **A transit catalog for all of Germany**, imported from an open GTFS feed into the database, queried by the server. Adding an area is data, not code — and there is nothing to add, because the country is already in there
- Transit inventory materialised onto the map — **all subway, tram, train and bus lines**, grouped by mode and operator — so a playing phone never queries the catalog. It feeds place search, the hider's zone commitment, the validity check above and M6's transit questions; it contributes no geometry to the area
- **Scale presets:** single Bezirk / district · city · metropolitan region · state · ticket-validity area (Deutschlandticket, Euroticket). Each sets a default hiding radius and is recorded on the map, so M6 can derive question distances from it
- Live preview: the resulting area, its size and the number of stations inside it, updating as the host picks or draws
- Save, name, duplicate a map; share by code or link

**Reviewable when:** A host builds "Mitte plus Friedrichshain-Kreuzberg, 500 m radius" in under two minutes, sees the station count update as they add and remove boundaries, and shares a code that reproduces the map byte-identically on another device. The same builder produces a one-Bezirk map and a nationwide regional-rail map without the UI collapsing at either end.

**Deferred:** **Hiding radius per mode, enable/disable by mode, line or stop, and the union of station radii that turns them into geometry — one feature, deferred whole (M18).** What that costs is not the station rule, which the validity check above keeps: it is that M13's deduction map is seeded with the whole area rather than with the union, making it coarser and never wrong. Also custom Overpass queries, exclusion polygons, imports (M18); an automated catalog refresh (M20, where feed freshness first matters); areas beyond Germany (M19).

## M5 — Game lifecycle v1

**Goal:** A round can begin, run, pause and end.

**Features**

- **House rules:** host-authored free-text rules ("no image searching train stations"), attached to the game and readable at any time
- **Ready check:** every team explicitly marks ready
- **Area comfort confirmation:** at ready check, each team confirms they're comfortable playing in the defined area, with a way to raise a concern to the host instead
- Rules acknowledgement as part of readiness
- **Rounds are the unit of play, and roles belong to a round.** A game is a series of them, with hider and seeker teams swapping between rounds. A round runs _hiding phase → seeking phase → ended_, and questions, answers and constraints all belong to a round rather than to the game
- **Hiding phase:** a host-set countdown, visible to all, during which the hiders travel to wherever they intend to hide. They move freely and without restriction for its whole duration. Seekers are travelling too, and pass through non-hiding areas on the way; none of that is a special case
- **Hider commits a hiding zone** — not a spot. Warning (not a block) if the chosen zone isn't a valid one. The exact spot within it stays undeclared.
- **Once the hiding phase ends, a hider stays inside their committed zone.** If their position leaves it, their own device says so — _"looks like you left your hiding zone"_ — and that is the entire feature. The notice is local, never sent anywhere, never recorded, and no other player is told. It is a helpful nudge to someone who wandered, not a report
- Round timer, pause/resume with a reason, manual end
- Mark hider found, optional photo, recorded hiding time per hider team

**Reviewable when:** A full round is played end to end with paper cards and paper questions — setup, ready check, hide, seek, found — and the recorded time matches a stopwatch.

**Deferred:** Hider-side help with _where_ to hide — suggesting candidate spots inside the committed zone from POI and building data. Genuinely useful, not needed to play, and much cheaper once M18 has the footprint data.

---

# Phase 2 — The game systems

## M6 — Question set and rules reference

**Goal:** The question catalog lives in the app and is fully configurable.

**Features**

- Predefined question catalog by type (matching, measuring, thermometer, radar, photo, tentacles) with per-question rules text
- **Constraint definition per question type** — the geometry an answer cuts from the search area, and the equivalent point test that decides whether a given position satisfies it. Written once against M0's engine and used from both directions: M8 evaluates the point test, M13 folds the geometry
- **Question builder:** enable/disable individual questions _or_ entire types
- Per-question flag: whether the question may target **more than one hider team** — off for most questions, on only where it makes sense
- Per-question flag: whether **"not possible to answer"** is a legal response, following the rulebook
- Scale-aware distance defaults from the M4 preset, with per-question override
- Searchable in-game rulebook including the host's house rules
- Printable / shareable summary of the enabled set

**Reviewable when:** A host disables all tentacles and two radar questions; neither role sees them anywhere for the rest of the game; the exact rules text for any question is reachable in two taps mid-round.

## M7 — Asking and answering

**Goal:** The question loop works for multiple seeker teams and multiple hider teams in parallel.

**Features**

- **Targeting:** a seeker team asks one hider team by default; only questions flagged multi-target in M6 can go to several or all
- Seeker: pick question, choose targets, see rules and card cost, ask, see pending state and answer deadline per target
- **Questions that run over an interval.** A thermometer is not asked at a moment in time. Starting one records the seeker team's position and tells the hider "Team X started a 0.5 km thermometer" — and that is _all_ it is until the team ends it somewhere else. Only on ending does it become a real question, carrying two positions, reaching the hider and producing a constraint. A started-but-unended thermometer is game state with no answer, no card draw and no effect on the deduction map. The running team gets an advisory readout of how far they have travelled against the distance they declared — a nudge, never a gate on ending it
- Hider: push + haptic on arrival, question rules on screen, countdown, answer
- **Answer options:** the structured answer (yes/no, value, photo), plus **"not possible to answer"** where the question permits it
- **Notes and threads on everything:** every question and every answer carries a free-text note, and each question is a thread both sides can keep talking in
- Team-internal chat and an all-players channel alongside question threads
- First-answer-wins within a hider team, per M0; the superseded teammate gets a dismissible notice and the log shows only the accepted answer
- Correct, withdraw or cancel a question; a hider can likewise correct an answer already submitted, which updates that answer's constraint in place rather than adding a second one
- Logs: each seeker team sees only its own threads; hiders see every thread addressed to them, labelled by asking team

**Reviewable when:** One question is sent to all three hider teams; two answer yes, one answers "not possible", each with a note; the asking seeker team sees all three replies attributed correctly and the other seeker teams see none of it.

## M8 — Answer assistance (advisory only)

**Goal:** Make answering fast and accurate without ever taking the decision away from the hider.

**Features**

- Location questions are evaluated against **the live position of the player who is answering** — not the committed zone, not a team centroid
- The committed zone is used only by questions that ask about the zone itself
- **Recomputed continuously until the hider submits** — correctness is evaluated at answer time
- Radar / matching / measuring geometry; tentacles resolved against a POI lookup
- Thermometer: the two reference points are the seeker team's position when the thermometer _started_ and their position when it _ended_; what the hider compares between them is their own position at answer time. All three are recorded, since M13 needs the seeker pair to construct the bisector. No suggestion exists before the thermometer is ended, because until then there is no question
- Suggestions run the same constraint definitions M13 folds with, evaluated as a point test against the answering player's live position. One definition, two usages — so a hider's suggestion and a seeker's eliminated region cannot disagree
- Every suggestion shows its inputs and their freshness: "based on Team Red's position, 12 s old, ±30 m"
- Suggestions are computed per hider for multi-target questions
- A "not possible to answer" suggestion where the app can tell the question is unanswerable (no qualifying POI in range, for instance)
- One-tap accept; manual override always one tap away and never buried
- "No suggestion available" is a normal, non-blocking state

**Reviewable when:** A hider answers a radar question with location services fully disabled and the flow is no slower than with GPS on; a suggestion visibly flips as a seeker crosses the boundary while the hider is deciding.

## M9 — Photo questions

**Goal:** Photo answers that are convenient to produce and safe to share.

**Features**

- **Two paths in:** capture in-app, or upload a photo taken on any camera
- **The server strips all location and identifying metadata on ingest**, and the original is never served to any client
- Redaction tool for censoring identifying text before or after upload
- Per-photo framing rules displayed on the capture/upload screen; extended deadline
- Replace an uploaded photo before the answer is submitted
- Seeker viewer: pinch zoom, brightness, pin to a comparison board

**Reviewable when:** A geotagged DSLR photo uploaded from a laptop reaches the seekers with no recoverable coordinates, and no request path returns the original file.

## M10 — Card economy

**Goal:** The deck moves into the app without becoming an enforcement engine.

**Features**

- Full card catalog; **deck builder** with enable/disable per card and per type, and adjustable counts
- Draws granted per question type, offered automatically, adjustable by hand
- Every hider team targeted by a question draws for it independently
- **"Not possible to answer" is a valid answer** and grants the question's normal draw reward
- Hand view; hand-limit **warning and a "play or discard" prompt** — never a block
- Non-curse cards: veto, duplicate, randomize, discard & draw, time bonus, relocation
- Draw pile / discard pile state, reshuffle

**Reviewable when:** A hider goes over the hand limit, is nudged, ignores the nudge, and keeps playing normally; a veto is applied to a question that is currently in flight.

## M11 — Curses

**Goal:** Curses are castable, targetable and legible to both sides.

**Features**

- Curse catalog with cost, effect text and duration
- Cast at one seeker team, several, or all
- Cost payment guided step by step; warn if unpaid, don't block
- Active-curse panel on both sides with live timers
- Notes and a thread on every cast curse, same as questions
- Seeker acknowledgement / mark-complete; full curse history
- Relocation cards and curses interact correctly with the committed hiding zone

**Reviewable when:** A curse cast at two of three seeker teams is visible and ticking for exactly those two, and expires on its own.

## M12 — Endgame and series

**Goal:** Rounds end cleanly and stack into a series.

**Features**

- Detection and alert when a seeker team enters a committed hiding zone (hider movement freeze)
- **Hiding spot declaration:** optional and suggested once seekers enter the zone, required only at round end — always a suggestion the hider confirms or corrects
- Proximity notice to the hider as seekers close in
- Found confirmation with photo; zone and spot revealed to everyone afterwards
- Round summary; role swap; cumulative hiding-time leaderboard across rounds

**Reviewable when:** A two-round series completes with roles swapped and the leaderboard matches a hand tally.

---

# Phase 3 — Force multipliers

## M13 — Seeker deduction map

**Goal:** Turn the answer log into a shrinking map.

The search area is a pure left fold of M0's constraint engine over an ordered, editable constraint list, seeded with M4's valid hiding area and scoped to one (seeker team, hider team) pair. Most of what follows falls out of that shape: the fold is incremental, since each new constraint is one operation applied to the previous snapshot; it is cacheable by area-pack version plus the ordered constraint ids; and it is trivially reversible, since disabling a constraint just means folding without it.

**Features**

- Each answer contributes a geometric constraint; the surviving search area is highlighted and eliminated area is shaded
- **Hider team selector:** the map shows one hider team's search area at a time, each pairing having its own fold
- Live **share of the hiding area eliminated**, and how much the most recent constraint contributed
- "Not possible to answer" responses treated as constraints in their own right where the question makes that meaningful
- **The constraint list is editable, always.** Any constraint can be disabled and re-enabled from a list; a hider correcting an answer (M7) updates its constraint in place. A suggestion is never a verdict, and this is the screen where that promise is easiest to quietly break
- Pre-ask preview: for each candidate question and target set, how much of the _current_ area it would likely remove

**Reviewable when:** After six answered questions across two hiders, each surviving area matches a hand calculation done on paper by a reviewer. Disabling the third constraint and re-enabling it returns the map to byte-identical geometry.

**Deferred, but the architecture assumes them from M0:**

- **Hand-authored constraints.** A seeker team draws its own radius, polygon or pie sector and folds it in like any other constraint. The use cases are the deductions the app cannot make: identifying a building from a photo answer, ruling out a park by eye, marking a direction someone is fairly sure of. These are simply constraints with a manual source — which is the whole reason the fold consumes a constraint list rather than the answer log.
- **"We are searching this zone."** One tap that disables every existing constraint and adds a radius constraint around a chosen transit stop. Entirely a macro over the two primitives above, and worth having because it marks the moment the earlier constraints stop being trustworthy: a hider may move freely within their zone until seekers actually enter it, so a thermometer that split that zone an hour ago says nothing about where they are standing now.

## M14 — Replay and spectate

**Goal:** The artifact people share afterwards, and the thing friends watch during.

**Features**

- Live spectator link with configurable fog: full knowledge, seeker view, or time-delayed
- Post-game replay: scrubbable timeline of all movement, questions, answers, notes, photos, curses and found events
- Playback speed, isolate a team, jump to any event
- Export: GPX / GeoJSON tracks, event log, and a timestamp list usable as video chapter markers

**Reviewable when:** A non-player watches a live game on a 15-minute delay; afterwards, anyone can scrub the whole round and see exactly what each team knew at any moment.

## M15 — Field resilience

**Goal:** The app survives a real day out.

**Features**

- Offline queueing across every action, with clear pending/synced state and clear superseded state
- Background location and reliable push notifications for questions, answers, curses and deadlines. **Neither is deliverable in a browser**: geolocation stops when the screen locks and web push is best-effort at both ends, so this item is what a Capacitor build exists for. Until it lands, the honest fallback is foreground-only tracking, a wake-lock during active rounds, and M2's staleness UI telling the truth about the gap
- Low-power mode; battery warnings for yourself and your team
- One-handed layout, large tap targets

**Reviewable when:** A complete ask-answer cycle survives ten minutes underground and reconciles on resurfacing with no duplicates and no lost answers.

## M16 — Safety and comfort

**Goal:** Nobody has a bad time.

**Features**

- Share live location with a non-playing contact
- SOS / "I need to stop" that pauses the game and notifies the host
- Quiet hours and no-go area reminders
- Accessibility pass; localisation groundwork

## M17 — Post-game stats

**Goal:** Make people want to play the next round.

**Features**

- Distance travelled, search area eliminated per question, question efficiency ranking, answer latency, curse impact
- Movement heatmaps
- Shareable recap card

---

# Phase 4 — Expansion

## M18 — Zone builder power tools

**Hiding radius per mode, and enable/disable by mode, line or stop — with the union of enabled station radii as the game area, which is the rule M4 defers.** Also: custom Overpass queries with saved snippets and templates · inclusion and exclusion polygons · GeoJSON/KML import · water and no-go masking · POI-based zones · building footprints for judging what's actually enterable.

## M19 — Beyond Germany

Per-area defaults · community-shared map presets with browsing and ratings · cross-border areas for ticket-scale games, which is where a second national feed first has to coexist with Germany's.

## M20 — Transit departures

Next departures at nearby stops · line status · lightweight journey aid · curse interactions with transit rules.

## M21 — Custom content

User-authored questions and curses · custom decks and rule packs, shareable by code · practice/tutorial mode and a solo demo game.

---

# Sequencing notes

- **M4's bottleneck is the data, not the geometry.** With the area reduced to one polygon, building a map is a boundary picker and the geometry is free; what is left to get wrong is the catalog. The German feed classifies every S-Bahn, RE and ICE as one route type, so the mode split is a heuristic over line names — and a heuristic that drifts produces a map which looks entirely plausible and is wrong. It is a labelled table with a test over the real feed for that reason. Administrative boundaries are a second import the feed does not carry at all, and they are the primary way an area gets chosen, so they are the first thing to settle. Test the extremes early: one Bezirk and one nationwide map, not just city-sized ones, and test with hosts who did not build the app.
- **Multi-hider targeting is one per-question flag, off by default.** Each targeted hider team answers and draws independently, gets its own fold and its own search area, and the map shows one hider team at a time. Define the flag in M6 so M7 and M13 simply inherit it.
- **The zone/position distinction must be settled before M5 ships.** The committed zone is the record; the answering player's live position resolves location questions; the exact spot is a late, optional, correctable declaration. Conflating any two of these will show up as bugs three milestones later.
- **M8 depends on M7 only for UI, not for correctness.** The answer-time evaluation model should be settled before M7 ships, since it shapes what the question log stores.
- **M13 depends on M7's answer log**, not on M8. It works fine with entirely hand-entered answers — and because the fold consumes a constraint list rather than the log directly, it works equally well with constraints that have no question behind them at all.
- **The constraint library is built once, and never twice.** M8 evaluates a constraint as a point test against the answering player's live position; M13 folds the same constraint over a polygon. If those become two implementations they will drift, and the symptom — a hider told "yes, within 3 km" while the seeker's map eliminates the wrong region — reads as a geometry bug for a week before anyone suspects duplication. The interface lands in M0, the per-question definitions in M6, and both milestones import them.
- **One coordinate system, everywhere: WGS84 lng/lat.** An earlier draft folded constraints in a projected metric CRS. Booleans do not need one — they are topological, and lng/lat preserves every containment result — so there is no stored projection, no per-pack CRS choice, and no conversion between what Postgres holds, what the wire carries and what the map draws. The metre enters in three places only: constructing geometry from a distance (a radius, a bisector, a sector), measuring a length or an area, and choosing a snap or simplify tolerance. Each takes its scale from its own latitude, which is why this is *more* accurate on a Deutschlandticket map than a single UTM zone could ever be. Two consequences carry: long edges are densified, because a straight line in degrees is not a straight line on the ground; and simplification and coordinate snapping between fold steps belong in the engine from the start, not in a later optimisation pass, because long folds accumulate degenerate slivers from repeated boolean operations. That one bites at the fifteenth answer, not the third, which is exactly late enough to be expensive.
- **M14 depends on a complete event log**, which means every earlier milestone must emit well-formed events from day one — including notes and "not possible to answer" responses. Retrofitting this later is the most likely source of pain in the whole plan.
- **M9's server-side stripping is a release blocker**, not a feature. A single leaked geotag ends a round. It is also the one place where assuming good faith buys nothing: photos get screenshotted and forwarded well outside the game, so the metadata must be gone before the file leaves the server rather than merely hidden by a client.

# Explicitly not in scope

- Cheat detection, position verification, or any adversarial modelling
- Any security boundary between players within a single game — visibility rules exist to preserve the game, not to withstand a determined player with dev tools open
- Automatically answering questions on the hider's behalf
- Blocking any action on the grounds that it breaks a rule
