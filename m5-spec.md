# M5 — Game lifecycle v1

> A round can begin, run, pause and end, and the game records how long each
> hider team lasted.

Build plan: [M5 — Game lifecycle v1](build-plan.md#m5--game-lifecycle-v1).

Prior art this leans on: m0-spec §5 (the round, the commitment, and the one rule
that is never recorded), §6 (the event log), §7 (three clocks); m1-spec §3 (a
role belongs to a round); m3-spec §10 (which writes wait); m4-spec §3 (a hiding
spot is valid if it is inside the area and near a station, both advisory).

---

## 1. Scope

M0 built the skeleton and M1 filled the lobby. A round already exists from the
moment a game does, already carries roles, and already has `startHiding`,
`startSeeking`, `end` and `commitZone` mutators. **What M5 adds is everything
between those calls that makes a round a thing people can actually play.**

**In scope**

- **House rules** — free text the host writes, attached to the game, readable at
  any time
- **The hiding countdown**, visible everywhere, and the question of who ends it
- **Committing a zone**, with M4's two predicates as warnings rather than gates
- **Pause and resume with a reason**, and a clock that excludes paused time
- **Marking a hider team found**, with the duration recorded against both teams
- **A blob store**, and the optional photo on a found that needs it

**Not in scope**

- Hider-side help with *where* to hide inside the committed zone (M18, and
  cheaper once there is footprint data)
- **Deciding who won.** M5 records durations; whether the shortest seeker time
  or the longest hider time takes it is the players' call, and M12 owns the
  series
- Cards, curses and the question loop (M6, M7, M10, M11)
- The endgame, the series and `declaredSpot` (M12)
- Anything that reads a round after it is over (M14's replay, M17's stats)

---

## 2. Schema deltas

Four new tables and no changes to existing ones. That is worth noting: every
column M5 needs on a round already exists, because m0-spec §5 wrote them and M1
never used two of them.

### House rules

```ts
houseRules: {
  gameId: string;              // primary key — one set per game, not per round
  text: string;
  updatedAt: number;
  updatedByPlayerId: string;
}
```

One row per game rather than per round: house rules are how *this group* plays,
not how this round works, and a host who has to retype them every round will
stop writing them.

### Pause

```ts
roundPause: {
  id: string;
  roundId: string;
  startedAt: number;
  endedAt: number | null;      // null while the pause is running
  reason: string;
  startedByPlayerId: string;
  endedByPlayerId: string | null;
}
index("roundPause_round_idx").on(roundId)
```

**Append-only intervals rather than an accumulated total**, for the same reason
m0-spec §6 makes the event log the source of truth: a running total is a number
that can only be read, while intervals can be read, replayed, corrected and
displayed. M14 wants to draw the pauses on a timeline; a total could not.

**`RoundStatus` gains nothing.** A round is `pending | hiding | seeking | ended`
and pause is a *second axis* — you can pause during hiding or during seeking, and
resuming has to put the round back into the phase it was in. Adding `paused` to
the status enum would mean storing the phase to return to, which is the same
information one row further from where it belongs.

### The round's result

```ts
hiderOutcome: {
  id: string;
  roundId: string;
  hiderTeamId: string;              // unique (roundId, hiderTeamId)
  /** Who found them. Null while unfound, and null forever if nobody did. */
  seekerTeamId: string | null;
  foundAt: number | null;
  /** The pair's duration — one number, two readings. Null when unfound. §9. */
  durationMillis: number | null;
  photoId: string | null;
  markedByPlayerId: string | null;
  markedAt: number | null;
}
uniqueIndex("hiderOutcome_round_team_idx").on(roundId, hiderTeamId)
```

**A row per hider team, not a row per finding.** `round.end` writes one for
every hider team that has none, so the table is the round's complete result
rather than a list of the lucky ones. That is what makes the nulls meaningful:
a row with no `durationMillis` is a team that was never found, which is a
result, and not a row that failed to be written.

**Not a column on `hidingCommitment`**, though the grain is identical, because
the two have opposite visibility: a commitment is the hiders' secret until the
round ends (`queries.commitments()` enforces that today), and being found is the
most public fact in the game. Putting them in one row would mean either leaking
the zone or hiding the result.

### Photos

```ts
photo: {
  id: string;
  gameId: string;
  /** Content address. Two uploads of one image are one file. */
  sha256: string;
  contentType: string;
  byteSize: number;
  width: number;
  height: number;
  uploadedByPlayerId: string;
  uploadedAt: number;
}
```

**Metadata only. The bytes are not in Postgres**, and this is the same argument
m4-spec §2 made about the catalog one milestone ago: `zero-cache` replicates its
upstream database through a logical replication slot, and JPEGs have no business
in a sync engine's replica. A `bytea` column would put every photo of every game
into every client's replication path. §10 says where they actually go.

`EVENT_TYPES` gains four: `rules.updated`, `round.paused`, `round.resumed`,
`round.hiderFound` (§12).

---

## 3. What a round already is

Worth stating before adding to it, because three things people expect to build
in M5 are already built.

| Already true | Where |
| --- | --- |
| Round 1 exists from game creation, `status: "pending"` | m1-spec §3 |
| Roles belong to a round, not to a team | m0-spec §4, m1-spec §3 |
| `hidingDurationMs` is a column, host-settable | m0-spec §5 |
| `startHiding`, `startSeeking`, `end`, `commitZone` are mutators | `mutators.ts` |
| A committed zone is materialised, never recomputed | m0-spec §5 |
| Questions, answers and constraints hang off a round | m0-spec §5 |

So **M5 writes no new state machine.** It fills in the phase transitions that
exist, and the two columns M0 wrote and nobody has read yet —
`hidingStartedAt` and `seekingStartedAt` — become the clock in §8.

**Swapping sides between rounds is `round.assignRoles` against the next round.**
That is not new work: m1-spec §3 built the lobby's role assignment as literally
the write M5 would make, and `RolePanel` already carries the comment saying so.
Creating round 2 is `round.create`, which also exists.

---

## 4. House rules

A textarea, a save, and a version number.

Editable at any time, including mid-round. There is no acknowledgement step and
no version to acknowledge: house rules are how this group plays, and a group
that needs a tick-box confirming everyone read them has a problem software
cannot fix.

Rules are readable **at any time from any screen** — the build plan says so, and
it means a link in the game shell rather than a panel in the lobby. A rule you
can only read before the round starts is a rule nobody consults during an
argument, which is the only time anyone wants it.

---

## 5. The hiding phase, and who ends it

`startHiding` sets `hidingStartedAt` and flips the game to `running`. Both exist.
What M5 adds is the countdown and the answer to a question M0 left open.

### There is a countdown, and it is the hiding phase's

`round.hidingDurationMs` has existed since M0 — an integer, host-set, defaulting
to thirty minutes in `POST /games` today. m0-spec §5 spends it: *"for
`hidingDurationMs` after a round starts, hiders travel freely."* The build plan
calls it "a host-set countdown, visible to all". **This is the only countdown in
M5**, and what it counts down to is the end of the hiding phase.

Every device renders it as `hidingDurationMs` minus §8's `elapsed`, so it is the
same number everywhere without anybody sending a tick. **Pausing pauses it**,
because §8's `elapsed` excludes paused stretches and the countdown is just
`elapsed` subtracted from a constant — there is no second mechanism that could
disagree.

### When it reaches zero, a host still has to tap

The countdown hitting zero **does not by itself move the round from `hiding` to
`seeking`.** The status column changes when somebody calls `startSeeking`, and
nothing else changes it.

That is not a limitation of the timer; it is m0-spec §7's three clocks. "The
countdown expired" is a statement about one device's clock, and if a phone
wrote the transition the moment *its* clock said so, the phone that decided for
everybody would be whichever one happened to be unlocked and awake at that
second. There is no scheduler in this system, and M5 is not the milestone that
grows one.

So at zero, every device says **"hiding time is up"** and the host's *start
seeking* control becomes the primary action on their screen. Nothing is
ambiguous on any screen; what is waiting is a human.

The cost is worth naming: if the host has their phone in a pocket on a train,
seekers wait past zero. The mitigations are that anybody can take the host hat
in one tap (m1-spec §6), and that the screen says it is waiting for a host
rather than pretending to still be counting. **The better answer is a
server-side timer that writes the transition, and it is M15's** — field
resilience is that milestone's subject, and a background process belongs there
rather than being invented here for one feature.

### Hiders move freely, and there is no special case

For the whole hiding phase, hiders travel without restriction, and seekers are
travelling too — through areas nobody could hide in, past stations that are not
in play. m0-spec §5 already says this needs no special handling, and M5 adds no
check that would make it need one. The only thing that changes at the end of the
phase is what §7 does on the hider's own device.

---

## 6. Committing a zone

`commitZone` exists. M4 built the two predicates. M5 is where they meet.

A hider picks a station from the stops their game carries (`mapStop`, m4-spec
§5), and the zone is the circle of `mapConfig.hidingRadiusMeters` around it,
materialised at commit time.

Both of m4-spec §3's predicates are evaluated **on the hider's device, at the
moment they choose**, and both produce a sentence rather than a disabled button:

| Condition | What the hider sees |
| --- | --- |
| The stop is outside `validHidingArea` | *"Ostkreuz is outside the game area. You can still hide here — this is a reminder, not a rule."* |
| The nearest station is further than the hiding radius | *"That is 2.4 km from the nearest station in play."* |
| Both | Both sentences |

**Warned, never blocked**, for the third time in this document, and here it is
load-bearing rather than decorative: the hiding radius is a number a host picked
in a builder on a sofa, and a hider standing in a real street is better placed to
know whether a spot is reasonable than a circle drawn last Tuesday.

The commit is a Zero mutator and applies optimistically. It is a fact about your
own team (m3-spec §10) — nothing has to be true anywhere else for it to mean
something — and a hider committing a zone in a station basement with no signal
should see it take effect.

**Re-committing replaces.** The unique index on `(roundId, hiderTeamId)` already
enforces one zone per team per round, and `commitZone` already upserts. A team
that changes its mind before the phase ends simply commits again.

---

## 7. Leaving your zone: the rule defined by not being written down

> **If a hider's position leaves their committed zone, their own device tells
> them. Nothing else happens anywhere.**

m0-spec §5 specified this precisely and M5 implements it exactly as written. It
is worth repeating in full because it is the one feature in this milestone whose
correctness is measured by what is *absent*:

- No event. No row. No mutation. No notification to any other player.
- No column anywhere records that it happened, or that it stopped happening.
- The check runs on the hider's own device, comparing their own fix to their own
  team's `hidingCommitment.zone`, both of which are already in their local store.
- It runs only once the hiding phase has ended — during the phase there is
  nothing to leave.

**It transmits nothing**, which m2-spec §9 already established as a testable
property: the acceptance suite records every WebSocket frame a phone sends, and
§13's test asserts that walking a hider out of their zone adds none.

The notice is a nudge to somebody who wandered while looking for a better
doorway, not a report to the other side. Anything that made it visible elsewhere
would turn it into an accusation, and the build plan's second principle is that
everyone in the game is a friend.

---

## 8. Pause, and the clock that is never stored

### One function, four readouts

```ts
elapsed(phaseStartedAt, pauses, at) =
  at - phaseStartedAt - pausedMillisBefore(pauses, at)
```

Everything with a number on it is this function with different arguments: the
hiding countdown, the seeking clock, the per-team survival time on the found
sheet, and the round's total length. **Nothing is stored**, for the same reason
m2-spec §2 derives the camera and m2-spec's staleness derives from `capturedAt`:
a stored clock is a number that goes wrong while nobody is looking at it.

`pausedMillisBefore` sums the intersections of the pause intervals with
`[phaseStartedAt, at]`. An open pause — `endedAt: null` — is clamped to `at`,
which is what makes a paused clock *appear* frozen without anything freezing it.

### Pausing takes a reason, and the reason is the feature

`round.pause` requires non-empty text. A pause with no reason is a mystery to
everyone who was not standing next to the host, and the log is the only thing a
replay has.

Typical reasons are ordinary: *"food"*, *"train replacement bus"*, *"Sam's phone
died"*. The field is free text with no menu, because a menu of pause reasons is a
list somebody has to maintain and will never be right on the day.

Resuming closes the open interval. **A second pause while one is open is not
possible** and the control says "resume" rather than "pause" — this is a state
with two buttons, not two states.

### What a pause does and does not stop

| | Paused |
| --- | --- |
| The clocks | Stop, everywhere, derived |
| Position tracking | **Keeps running.** m2-spec's presence is about safety and finding each other, and a paused game is exactly when somebody is walking to a station alone |
| Questions and answers | Not M5's, but the round is not `ended` and nothing is closed |
| The zone notice (§7) | Keeps working. It is local and advisory and has no clock in it |

Tracking continuing through a pause is a decision rather than an oversight. The
alternative — going dark when the game stops — optimises for a privacy concern
the group has already settled by playing at all, and against the case where a
pause is *because* somebody needs finding.

---

## 9. Found, and the one duration it records

A seeker team finds a hider team; somebody marks it.

```
round.markFound({ roundId, hiderTeamId, seekerTeamId, photoId? })
```

**Any player may mark it**, not only a host and not only the finding team. The
moment of being found is a person walking up to another person, and requiring
whoever holds the host hat to be present is a rule that gets worked around by
shouting. `markedByPlayerId` records who, and it is correctable — a mismarked
found is undone with `round.unmarkFound`, which clears the row back to nulls,
**deletes the photo with it**, and logs both. A found that did not happen leaves
nothing behind, including on disk.

### One number, two readings

```ts
durationMillis = elapsed(round.seekingStartedAt, pauses, foundAt)
```

This is **the (seeker, hider) pair's duration**, and it is deliberately one
column rather than two. How long the hiders survived and how long the seekers
took are the same stretch of time read from opposite ends; storing it twice
would be storing one fact twice, and the two copies would eventually disagree.
The pair is `(hiderOutcome.seekerTeamId, hiderOutcome.hiderTeamId)`, and either
end can be grouped on.

**Measured from the start of seeking**, not from the start of hiding. The hiding
phase is the same length for every team by construction, so including it would
add a constant to every row and tell nobody anything.

**Null means never found**, and that is a result rather than missing data — see
§2. A hider team that survived to the end of the round has no duration, which is
exactly the shape of what happened to them.

### The app does not decide who won

M5 records durations and stops. **Whether the shortest seeker time takes it or
the longest hider time does is the players' call**, and it is a call groups make
differently and change between games. Scoring, series totals and anything that
would need a winner belong to M12.

That is not a deferral so much as a boundary: a `hiderOutcome` table with a
nullable duration is enough for either rule, for both at once, and for the rule
a group invents on the night. Baking one in would make the other need a
migration.

### A round ends when the host ends it

`round.end` exists and stays as it is, with one addition: it writes the empty
`hiderOutcome` rows described in §2, so the result is complete the moment the
round is over.

**Finding every hider team does not end the round automatically** — the host
might want a photo, a debrief, or one more minute, and a round that ended itself
while people were still walking towards each other would be the software being
clever at the wrong moment. When every hider team is found, the host's end
control becomes primary, exactly as the countdown makes *start seeking* primary
in §5.

---

## 10. The blob store

The photo on a found is the first binary this project has had to keep, and M9's
photo questions are the second. One store, built here, used by both.

### Bytes on a volume, metadata in Postgres

```
POST /photos          multipart, one file, returns { id, sha256, width, height }
GET  /photos/:id      the bytes, with a long cache header
```

Files land under a `photos` volume, **content-addressed by SHA-256** — the path
is derived from the digest, so re-uploading the same image writes no second copy
and a retry after a dropped connection is free. Postgres holds the `photo` row
from §2 and nothing larger than a number.

This is the shape m4-spec §2 argued for with the catalog, for the same reason:
`zero-cache` replicates its upstream database, and the way to keep something out
of a sync engine's replica is for it not to be in the database.

### HTTP, not Zero

Uploads are plain HTTP with a game token, like joining and like templates.
Zero's mutators are a poor place to put a two-megabyte payload: they run the
same code on the client and the server, they are meant to be small and
optimistic, and a photo upload is neither.

The reference is the other direction: **the `photoId` is a column** on
`hiderOutcome`, written by a mutator once the upload has already returned an id.
So the sequence is upload, then mark — and marking a found without a photo, or
adding one afterwards, are the same write with a different argument.

### What the server does to a photo before it stores it

| Step | Why |
| --- | --- |
| **Strip EXIF** | A photo of a hider carries the GPS fix and timestamp of the moment they were found. It is shown to everyone in the game, and M14 replays it. Nobody chose to publish that |
| **Re-encode and cap the long edge** | 2048 px is more than a phone screen needs and an order of magnitude less than a modern camera sends |
| **Reject over 20 MB, and anything not JPEG, PNG, WebP or HEIC** | A cap that is generous for a photo and not generous for a mistake |
| **Record `width`/`height`** | So a layout can reserve the space before the bytes arrive, which is the difference between a page that settles and a page that jumps |

Stripping EXIF is the one that is not an optimisation. The build plan's second
principle is that everyone in a game is a friend, and this is not defending
against them — it is that a person holding up a phone to record a funny moment
has not thought about the coordinates in the file, and should not have to.

### Deleting is the caller's job, and there is no sweeper

`round.unmarkFound` deletes the `photo` row and its file (§9). That is the only
way a photo leaves, and it is enough: a photo is referenced by exactly one
`hiderOutcome` row, so there is no counting to do and no orphan to find later.

There is no expiry, no quota and no cleanup job. A game is a handful of photos,
and inventing a retention policy before anybody has run out of disk is machinery
guarding a risk nobody has.

Content addressing has one consequence worth stating: two identical uploads share
a file, so deleting one must not remove the bytes the other still points at. The
delete is by `photo.id` and removes the file only when no other row holds the
same `sha256`.

---

## 11. Routes and UI shape

No new routes. The lifecycle lives on screens that exist.

```
/g/:code            the lobby — roles, rules, round controls
  RulesCard           read, and edit while wearing the host hat
  RoundControls       start hiding · start seeking · pause · resume · end
  OutcomeList         who has been found, how long they lasted, their photo
/g/:code/map        the playing surface
  RoundBar            phase · clock or countdown · paused banner
  HidingSheet         pick a station, see both warnings, commit
  FoundSheet          mark a hider team found, with an optional photo
```

`RoundBar` is the only always-visible addition to the map, and it is one line:
phase, the clock or the countdown depending on which phase it is, and a paused
banner when there is one. m3-spec §9 fought for every pixel of that screen and
M5 does not get to spend them on a panel.

**The rules link lives in the game shell**, reachable from the lobby and the map
both, per §4.

**`FoundSheet` opens the camera and does not require it.** The photo is one
optional step in a flow whose actual purpose is a timestamp; a sheet that made
somebody take a picture before the clock stopped would be a sheet that costs a
hider seconds they earned. Mark first, attach after — §9's photo is a separate
argument to the same mutator.

Field-hostile applies fully here, unlike m4-spec §9's builder: this screen is
read on a platform, in the rain, at 8%. 44 px targets, one-handed reach, and the
clock legible at arm's length.

---

## 12. Events

| Type | Payload |
| --- | --- |
| `rules.updated` | `{ length }` — the text is a row, not a log entry |
| `round.paused` | `{ roundId, pauseId, reason, startedAt }` |
| `round.resumed` | `{ roundId, pauseId, endedAt, pausedMillis }` |
| `round.hiderFound` | `{ roundId, hiderTeamId, seekerTeamId, foundAt, durationMillis, hasPhoto }` |

**`rules.updated` carries a length, not the text.** m3-spec §11 says an event
carries the full state of what it declares, and what this declares is *the rules
changed*. The text is a row anybody can read at any time; copying a paragraph
into an append-only log on every typo fix is a cost with no reader.

**`round.hiderFound` carries `hasPhoto`, not `photoId`.** A replay reading the
log wants to know a photo was taken; fetching it is a join away, and the id is
already a column on `hiderOutcome`. Unmarking emits the same type with
`foundAt: null`, which is the full state of what it declares.

`actorTeamId` is set on `hiderFound` — being found is a team fact, and the team
it is a fact about is the hider team. It is null on `paused`, `resumed` and
`rules.updated`, which are acts of running the game rather than of playing it.

---

## 13. Testing

**Unit, in `packages/rules`:** `elapsed` against a round with no pauses, one
closed pause, one open pause clamped to `at`, and a pause that straddles a phase
boundary; the found duration excluding a pause that ran during seeking and *not*
excluding one that ran during hiding; the countdown reaching zero and going no
further negative than the display wants.

**Unit, in the photo pipeline:** a JPEG with GPS EXIF coming back out with none;
an oversized image capped on its long edge with its aspect ratio intact; the
same bytes uploaded twice producing one file and two `photo` rows resolving to
one path.

**Playwright acceptance.** Each is a spec, and M5 is done when they pass.

1. **A full round, end to end.** Five phones, two hider teams, three seeker
   teams: rules written, hiding started, zones committed, seeking started, both
   hider teams found, round ended. Every phone agrees on the phase at every
   step.
2. **The recorded duration matches a stopwatch.** The build plan's
   reviewable-when, asserted against the test's own clock rather than the app's.
3. **A pause stops every clock and no positions.** During a pause the seeking
   clock is identical on two phones ten seconds apart, and so is the hiding
   countdown; position snapshots keep arriving; resuming continues from where it
   stopped rather than jumping.
4. **The countdown pauses with the game.** A round is paused with four minutes
   left and resumed a minute later: every phone still says four minutes.
5. **Leaving your zone tells you and transmits nothing.** A hider walks out of
   their committed zone: their own phone shows the notice, and the frames that
   phone *sent* contain no new message. m2-spec §9's assertion, pointed at §7.
6. **The countdown reaching zero changes nothing by itself.** Every phone says
   hiding time is up; the round status is still `hiding`; a host tap is what
   moves it.
7. **A found is markable by anyone and correctable.** A non-host seeker marks a
   hider found; every phone sees it; unmarking clears it and both acts are in
   the log.
8. **A round that ends with a hider unfound records that.** The unfound team has
   a `hiderOutcome` row with a null duration, not an absent row.
9. **A photo survives the round and loses its coordinates.** A found is marked
   with a photo carrying GPS EXIF; every phone can fetch it; the stored bytes
   contain no GPS tag.
10. **The suite makes no third-party request**, per m3-spec §12 — which now
    covers `/photos`, served locally like everything else.
11. The M0, M1, M2 and M4 suites still pass.

Test 5 is the one that matters most, for the same reason m4-spec §11's test 6
did: it is the only test that fails when somebody makes the zone notice useful
by telling somebody about it, which will look like a small kindness every time
it is proposed.

---

## 14. Decisions taken

1. **No new state machine** (§3). Every phase and column M5 needs already exists;
   M5 fills in the transitions.
2. **House rules are per game, editable at any time, with no acknowledgement
   step** (§4). A group that needs a tick-box confirming everyone read them has
   a problem software cannot fix.
3. **There is one countdown and it is the hiding phase's** (§5) —
   `hidingDurationMs`, which has been a column since M0.
4. **Pausing pauses the countdown** (§5, §8), and not by a second mechanism: the
   countdown is `elapsed` subtracted from a constant, so there is nothing that
   could disagree.
5. **The countdown reaching zero does not advance the round** (§5). A host tap
   does. Three clocks, no scheduler; the server-side timer is M15's.
6. **Both hiding predicates warn on commit and neither blocks** (§6).
7. **The zone notice is local and silent** (§7), and is tested by the frames a
   phone does not send rather than by the absence of a column.
8. **Pause is an append-only interval table, not a total** (§2), and not a
   `RoundStatus` value: phase and pause are different axes.
9. **A pause requires a reason** (§8), free text with no menu.
10. **Position tracking continues through a pause** (§8), because a pause is
    exactly when somebody may need finding.
11. **Every live clock is derived; the recorded duration is materialised** (§8,
    §9). A result that must not move is written down.
12. **One duration per (seeker, hider) pair, not two** (§9). How long the hiders
    lasted and how long the seekers took are one stretch of time read from
    opposite ends.
13. **Duration is measured from the start of seeking** (§9).
14. **A null duration means never found, and the row still exists** (§2, §9).
    `round.end` completes the table so a result is never an absence.
15. **The app records durations and does not decide who won** (§9). Shortest
    seeker time or longest hider time is the players' call; M12 owns scoring.
16. **Anyone may mark a found, and it is correctable** (§9).
17. **A round does not end itself when the last hider is found** (§9).
18. **`hiderOutcome` is its own table, not a column on `hidingCommitment`** (§2),
    because the two have opposite visibility.
19. **Photo bytes are on a volume, content-addressed; only metadata is in
    Postgres** (§2, §10). The way to keep something out of a sync engine's
    replica is for it not to be in the database.
20. **Uploads are plain HTTP; the `photoId` is what a mutator writes** (§10).
21. **EXIF is stripped on upload** (§10). Not defence against players — a person
    holding up a phone has not thought about the coordinates in the file.
22. **`elapsed` lives in `packages/rules`** (§8), as `clock.ts`.

### Nothing is open

Three questions were left open in an earlier draft and all three are settled the
same way — by not building the thing:

23. **A pause has no maximum and no nudge** (§8). A game paused for lunch and
    never resumed leaves a round open, the clock honestly not counting, until
    somebody taps resume. That is the correct behaviour and it needs no timer to
    enforce it.
24. **Unmarking a found deletes its photo** (§9, §10). Nothing accumulates, so
    there is nothing to sweep.
25. **A rules edit is not announced** (§4). House rules are per game and a row
    changing under everybody is the whole mechanism.
