# M3 — Map Toolkit — Technical Specification

The geometry tools both roles would otherwise open Google Maps for, and the first
thing in this app that a team writes down for itself.

Companion to [build-plan.md](build-plan.md), [m0-spec.md](m0-spec.md),
[m1-spec.md](m1-spec.md) and [m2-spec.md](m2-spec.md). Where they disagree, the
build plan owns _what_, m0-spec owns the contracts, m1-spec owns the lobby,
m2-spec owns how position is rendered, and this document owns _how M3 turns the
map into a tool_.

---

## 1. Scope

M2 put coordinates on a screen. M3 lets a player do something with them.

**In scope**

- Tilt, rotate, and 3D buildings
- Distance measurement: a multi-point path with a total and per-segment readout
- A radius / circle tool around any point
- Team-shared pins with a label, a note and a colour
- The suspected search zone: one per seeker team, shared within that team
- Place search, drop pin, coordinate readout, copy coordinates

**Explicitly out of scope**

- Anything that turns a drawn shape into a deduction (M13). M3 draws geometry and
  attaches no meaning to it — see the guardrail
- The area builder and the stop inventory on the map (M4). M3 renders the fixture
  map config and edits nothing
- Shared paths, freehand polygons, imports (M13's hand-authored constraints, M18)
- External geocoding (§7), place photos, routing, elevation, road snapping
- Pending/synced chrome per write (M15), which owns it across every action at once
- Starting a round (M5). The debug harness is still the only way to move one

**The guardrail.** M3 adds two tables, five event types and one geo primitive. It
changes no visibility filter, touches the ephemeral channel not at all, adds no
platform capability and adds no route. **If M3 finds itself computing anything
about where a hider might be from something a team has drawn, it has become
M13.** The circle tool is going to look exactly like a `radius` constraint and it
must not become one here — see §4.

---

## 2. Schema deltas

M2 added no column and called that evidence M0 shaped the data correctly. M3 adds
two tables, and it is the same evidence: these are new **kinds** of thing, not new
facts about existing ones. Nothing that already exists changes shape.

```ts
pin: {
  id: string;
  gameId: string;
  teamId: string;                  // whose it is — §3
  roundId: string | null;          // where it was dropped, for replay
  createdByPlayerId: string;
  lng: number;
  lat: number;
  radiusMeters: number | null;     // null = a plain pin; set = a kept circle, §4
  label: string;
  note: string;
  color: string;
  createdAt: number;
  updatedAt: number;
}
index("pin_team_idx").on(gameId, teamId)

searchZone: {
  id: string;
  roundId: string;                 // it dies with the round, like a constraint
  seekerTeamId: string;
  stopId: string | null;           // set when the zone was anchored from search
  lng: number;
  lat: number;
  radiusMeters: number;
  note: string;
  declaredByPlayerId: string;
  declaredAt: number;
}
uniqueIndex("searchZone_round_team_idx").on(roundId, seekerTeamId)
```

`EVENT_TYPES` gains `pin.created`, `pin.updated`, `pin.deleted`,
`searchZone.declared` and `searchZone.cleared` (§11). `queries` gains `pins()` and
`searchZones()`, both filtered by the same `exists("teamMembers", …)` shape
`queries.constraints()` already uses — which is the point of §3 being one rule
rather than three.

**Position is two columns, not a JSON point.** `hidingCommitment.declaredSpot` is
jsonb because a spot is absent or present as a unit; a pin that exists always has
a position, and two numbers Zero can index beat a blob it cannot.

**A pin belongs to the game; a search zone belongs to the round.** A good pin —
_"the courtyard behind this block is open"_ — is still good in round two. A zone
somebody intended to search is about one hunt and expires with it, exactly as
`constraint.roundId` does and for the same reason. The pin's `roundId` records
where it was dropped and nothing at M3 reads it: M14 replays a game round by
round, and a pin appearing on the replay with no idea when it was dropped is a
hole that cannot be filled afterwards.

**`searchZone` mirrors `hidingCommitment`.** Same round scope, same one-row-per-
team unique index, same materialised geometry. That symmetry is not decoration —
it is the hider's zone and the seeker's zone being the same kind of object, which
is what makes M12's "a seeker team entered a committed zone" a comparison between
two rows of the same shape.

**No ephemeral change.** The channel carries what is worthless in ten seconds
(m0-spec §3). A pin is worthless in ten seconds only if you dropped it in the
wrong place, so it goes in Postgres and syncs through Zero, where it survives a
reload, a tunnel and a force-quit.

---

## 3. The line M3 has to draw

Every visibility rule so far has been about **where somebody is**. M3 introduces
the first thing a team *writes*, and the two need different rules.

| | Who receives it |
| --- | --- |
| Roster: name, team, role, online-ness | everyone in the game, always |
| Live position and battery | own team always; **hiders** additionally receive every other team's |
| The durable position log | own team; the reveal decides the rest, and that is M14's |
| **Pins, notes, search zones** | **the team that authored them, and nobody else** |

**No role exception, and that is deliberate.** A hider sees every seeker's
position and does not see a single seeker pin.

The distinction is between what is observed and what is authored. A position is a
fact about the world: anybody standing on that platform can see that team
standing on that platform, and the hider's advantage in this game is designed as
observation at a distance. A note is not observable at any distance. _"We think
she's in the allotments"_ is a sentence somebody typed to their own team, and
handing it to the person it is about is not an asymmetry, it is reading their
mail.

Two secondary arguments, either of which would be enough on its own:

- m2-spec §7 already generalised position secrecy to intent — _"a rival's
  intended search area is worth more than a rival's current position, not
  less"_ — for seeker-versus-seeker. The same sentence is at least as true of a
  hider reading the search zone aimed at them.
- **A rule with no "unless" in it cannot be got wrong by a screen written three
  milestones from now.** m2-spec §7 makes this argument about the round-state
  precondition it declined to add, and it is the same argument here.

**This settles M7 by precedent.** Team-internal chat, question threads and answer
notes are authored content and inherit this rule without another debate. The
all-players channel M7 also lists is authored content that was addressed to
everybody, which is a property of who it was sent to rather than an exception to
who may read it.

**One filter shape, already written.** `queries.constraints()` scopes rows by
`exists("seekerTeamMembers", member => member.where("playerId", playerId))`.
`pins()` and `searchZones()` are that query with a different table. M3 writes no
new kind of filter and no client-side hiding — the argument m0-spec §8 makes about
leaks being one-line UI mistakes has not changed.

---

## 4. Measuring

### It is local, and that is the whole specification

A measurement is never sent, never stored, never logged, and never seen by anyone
else. No table, no event, no channel frame, no mutator. It is the same shape as
m2-spec §9's blindness toggle and m0-spec §5's hiding-zone nudge, and for the same
reason: it is a fact about what one person is looking at, not a fact about the
game.

That also makes it the one map feature that is completely unaffected by having no
signal (§10).

### Two shapes, one tool

```ts
type Measure =
  | { kind: "path"; points: LngLat[] }
  | { kind: "radius"; center: LngLat; radiusMeters: number };
```

**Path** — tap to drop a vertex; the total updates on every tap and each segment
carries its own length. Undo removes the last vertex and is a 44 px target,
because the common correction on a walking phone is one bad tap. A **"from my
position"** seed drops the first vertex on the device's own fix, which is the
majority of real measurements: _how far is that from me_.

**Radius** — tap sets the centre, drag sets the radius live, and preset chips
(100 m · 250 m · 500 m · 1 km · 2 km) exist because a thumb cannot drag 2 km
accurately on a phone held one-handed.

The path does not snap to anything. Stops are not drawn on the map until M4, so
there is nothing to snap to but the player's own position, which is what the seed
is for.

### Distance is a geodesic on the coordinates we already have

```ts
function distanceMeters(a: LngLat, b: LngLat): Meters;   // packages/geo
```

m0-spec §9 has been amended since M2: there is no stored projection anywhere in
the system, and every coordinate is WGS84 lng/lat. So the ruler takes the numbers
the map, the wire and Postgres already hold and needs no frame conversion at all —
which is the whole shape of that amendment, seen from the one feature that cares
most about metres.

**Vincenty's inverse solution on WGS84**, roughly forty lines, converging in a
handful of iterations at every distance this app measures. Haversine on a mean
sphere was the alternative and it is rejected because of the scale the build
plan's seventh principle insists on — up to 0.5% error, which is nothing at 1.4 km
and two kilometres across Germany, and this is the one number in the app a player
reads as a fact. Vincenty fails to converge only for near-antipodal points, which
cannot arise here; the fallback is haversine and a comment saying so.

`distanceMeters` is one of the three places m0-spec §9 lets a metre into the
system, and it is the only one M3 adds. Unit-tested against published reference
pairs rather than against itself.

### The circle is `circleLngLat`, and it has a bug M3 has to fix

The radius tool renders `packages/geo`'s `circleLngLat` — the same densified
circle radar builds its constraint from and M2 draws the accuracy ring with. Three
callers, one implementation, per m0-spec §9's argument that two implementations of
one idea drift.

**Which is how a defect in it surfaced.** `circleLngLat` converts metres to
degrees with two fixed constants:

```ts
const metersPerDegreeLat = 110_574;
const metersPerDegreeLng = 111_320 * Math.cos((center[1] * Math.PI) / 180) || 1;
```

110,574 m is the meridian degree **at the equator**. At Berlin's 52.5° it is
111,277 m, so a ring is drawn about **0.64% too large north–south**; the
longitude term is about 0.21% too large. The ring is therefore not only slightly
big, it is **out of round by roughly 0.4%** — an ellipse.

Against M2's accuracy ring, sized by a ±10 m GPS fix, that is invisible and M2 was
right not to care. M3 puts a number next to the circle and ships a ruler in the
same milestone, and _"you said 400 m and I measured 402"_ is a bug report someone
will file. The fix is a latitude-dependent meridian and parallel degree from the
WGS84 ellipsoid — six lines, and the existing 50 m ring test gets a tolerance
tightened rather than loosened.

**And that function is now load-bearing rather than incidental.** m0-spec §9's
amendment makes metres-to-degrees-at-a-latitude one of the three doors a metre
enters the system by, shared by every circle, bisector and sector the constraint
engine builds. It is no longer a helper inside one drawing routine that happens to
be 0.6% out; it is the metric. It gets its own tests at several latitudes rather
than being trusted because a ring looked round.

### The readout

One formatter, unit-tested, used by every caller:

| Distance | Rendered |
| --- | --- |
| < 1 km | whole metres — "847 m" |
| 1 km – 100 km | two decimals — "1.40 km" |
| > 100 km | whole kilometres — "412 km" |

Metres below a kilometre because a decimal metre is a lie about GPS; two decimals
above it because 1.40 km and 1.44 km are a four-minute walk apart.

The radius tool reports **the radius the player set**, never a measurement of the
drawn ring. The number is exact by construction and only the rendered polygon
carries the approximation, which is the right way round.

### It is not a constraint

A seeker measuring 1.4 km has deduced nothing that the app records. The radius
tool produces geometry that is structurally identical to a
`{ kind: "radius", center, radius }` `ConstraintGeometry`, the `constraint` table
has a `source: "manual"` value waiting for it, and writing one here would take
about an hour.

**It would also be wrong.** A constraint row is an input to a fold that does not
exist yet, `enabled` defaults to true, and the moment M13 arrives every circle
anybody ever drew for fun becomes a deduction that shrinks a search area. M13
owns hand-authored constraints and owns the UI that says _"this is a deduction"_
when you make one. M3 draws circles.

---

## 5. Pins

A pin is a point, a colour and something a team wrote to itself.

| Field | Notes |
| --- | --- |
| `label` | short, rendered on the map next to the dot |
| `note` | free text, in the sheet |
| `color` | m1-spec §4's palette, defaulting to the team's own colour |
| `radiusMeters` | optional — a kept circle (§4) |

**Colour means something different here than it does on a team badge.** Team
colour identifies a team; a pin's colour is a category its own team invented —
_red is ruled out, green is worth a look_. The palette is reused anyway, because
m1-spec §10 chose it for legibility under three colour-vision deficiencies in
direct sun, and that argument does not stop applying because the meaning changed.
m1-spec §4's rule holds unchanged: **colour is never the only channel.** A pin
always renders a label, and an unlabelled pin renders its index — "Pin 3" — so
nothing on the map is distinguished by hue alone.

**Any member of the team may edit or delete any of the team's pins.** Not the
host — the team. This is m1-spec §6's rule about `team.update` applied to the same
kind of object: how a team organises itself is the team's business, and four
people should not queue behind one to fix a typo. `createdByPlayerId` records who
dropped it and the sheet says so, because _"Ana dropped this"_ is worth knowing
and is not the same as _"only Ana may move it"_.

**Deleting a pin deletes the row.** m1-spec §7's "departure is a column, never a
delete" is about rows other rows point at — `event.actorPlayerId`,
`answer.answeringPlayerId`. Nothing points at a pin except the event log, which
holds its own history and does not read the table. A soft-deleted pin would be a
row every present and future query has to remember to filter out, which is the
one-line mistake §3 exists to make impossible.

**The mutator is the save, not the keystroke.** `pin.update` fires when the sheet
closes or the field blurs, not per character. Every mutator writes an event
(m0-spec §6) and a note typed at walking pace must not produce forty of them.

No cap on how many pins a team may drop. A team drops a dozen.

---

## 6. The suspected search zone

> A seeker team marks the zone it intends to search next, shared within the team.
> A coordination marker and nothing more at this stage. — build plan, M3

Four decisions make that sentence a table.

**Seeker teams only.** A hider wanting to mark a place uses a pin. The hider's
zone is `hidingCommitment` and it belongs to M5, and building an earlier,
unrelated hider zone at M3 is precisely the conflation the build plan's sequencing
note warns about: _"the zone/position distinction must be settled before M5
ships"_. One zone concept per role, each owned by exactly one milestone.

**One per team per round, replaced rather than accumulated.** The unique index on
`(roundId, seekerTeamId)` is the rule. Declaring a new zone overwrites the old
one, and the history lives in the event log where every other history in this
project lives.

**Which makes it last-write-wins, and that is not a bug.** m0-spec §7's
first-to-the-server-wins applies to _actions a team can take only once_ — an
answer, a curse, a find. Changing your mind about where to look next is the
normal operation, not a race, and wiring the discard-notice machinery to it would
tell a teammate their perfectly good decision was thrown away. Not everything a
team does once is a first-to-the-server-wins action, and this is the first place
the difference matters.

**Its default radius comes from the map config.** When the zone is anchored to a
stop, `hidingRadiusByMode[mode]` is the default — so the zone a team intends to
search opens the size of the zone a hider could actually be in. Overridable, like
everything else.

**Not gated on the round running.** m1-spec §3's trap says anything gated on role
must also ask whether play has started, and this deliberately does not: that gate
belongs on actions with game consequences, and a marker has none. Seekers plan on
the platform before the round starts, which is exactly when this is useful.

**Not a constraint, for the reason §4 gives.** M13's _"we are searching this
zone"_ is one tap that disables every existing constraint **and** declares a zone
— two halves of one gesture, and only one half exists yet. Writing the constraint
half now means M3 emits rows nothing reads, which M13 then inherits as history it
has to reconcile against semantics that were invented after they were written.
M13's macro will write both.

---

## 7. Search, coordinates and copy

### Place search does not leave the device

**M3 searches the area pack, and calls no geocoder.** Stops by name, lines by
name, admin boundaries by name, and typed coordinates. Nothing else, and no
network request of any kind.

There are two reasons and the second is the stronger one.

The first is the one this project has already accepted for tiles (m2-spec §3):
Nominatim and Photon are free services running on somebody's goodwill, Nominatim's
usage policy explicitly forbids autocomplete, and a search box that fires on
keystroke is the single most expensive thing you can point at a shared endpoint.

The second is that **a geocode query is a leak**. _"Where is the allotment garden
on Kolonnenstraße"_, typed by a hider mid-round, is that hider's intent — and
§3 has just finished arguing that a team's intent is the most protected thing on
this map. Sending it to a third party, from a phone, with a referer and an IP,
because a search box needed a completion, is worse than anything the visibility
matrix defends against. The rule protects players from each other; it should not
be trivially defeated by a text field.

What is searchable, and what a match does:

| Match | Result |
| --- | --- |
| Stop | fly to it; marked when it is in the game's hiding inventory |
| Line | fit the map to that line's stops |
| Admin boundary | fit the map to its bounds |
| A coordinate pair | offer to fly there and drop a pin |

Marking which stops are in the hiding inventory leaks nothing: the map config is
synced to every player and its area is already drawn on the map.

**Matching is folded, both sides, the same way.** Case, diacritics and the German
transliterations people actually type: `ü→ue`, `ß→ss`, `ö→oe`, `ä→ae`. So
`suedkreuz` finds `Südkreuz` and so does `sudkreuz`. A short alias table handles
`hbf → hauptbahnhof` and `str → straße`. Ranking is prefix-before-substring, then
distance from the player's own fix, falling back to the map centre when there is
no fix.

A linear scan over the Berlin/VBB fixture's stop list per keystroke is a fraction
of a millisecond and needs no index library. **M4's nationwide packs will need
one**, and that is M4's problem, alongside the larger one of a pack becoming
fetched data rather than a bundled module.

### Coordinates, and the order they are written in

```
52.52190, 13.41320
```

Decimal degrees, five places — about a metre, which is finer than any fix this app
will ever hold. **Latitude first**, which is the opposite of `LngLat`, the order
every internal type uses. That inversion is a real trap and this is the one place
the two meet: **one formatter and one parser, tested as a round trip.**

The format is chosen because it pastes into Google Maps, Apple Maps and a message
to a friend, and because it parses back into this app's own search box — the
counterpart to the copy button being the search field.

The parser accepts a comma or whitespace separator and optional signs. If the
first number's magnitude exceeds 90 it cannot be a latitude, so it is read as
`lng, lat` and the result row **says that it swapped them** rather than silently
guessing. Out-of-range pairs are not offered as matches at all, and the input
falls through to a name search.

### Copy

Through `webPlatform.clipboard`, which M1 added for the join link and which gets
its second caller here. **M3 adds no platform capability** — and it could not have
added this one anyway without noticing, because m0-spec §10's lint rule makes
`navigator.clipboard` unreachable outside `packages/platform`.

`write` already returns a boolean rather than throwing, for exactly this: a
browser can refuse, a "Copied" label that lies is worse than one that admits it
did not, and where the capability is unavailable the coordinate is rendered as
selectable text with a plain instruction instead.

---

## 8. Tilt, rotate and 3D buildings

M2 constructed the map with `dragRotate: false` and `pitchWithRotate: false` and a
comment saying M3 owns this. Turning them on has three consequences and one of
them is a bug.

### Rotation needs a way back

A player who rotates a map by accident and cannot find north has lost the map.
**A north indicator appears the moment bearing or pitch is non-zero, and resets
both in one tap.** It is not present at bearing 0, because a control that does
nothing is a control that gets tapped anyway.

**A rotate or pitch gesture drops the camera to `free`**, exactly as a drag
already does (m2-spec §12). The `followHeading` mode owns the map's bearing while
it is active, and two owners of one value is how a map ends up fighting a thumb.

### The heading arrow is wrong today, and rotation is what exposes it

`OwnPosition` rotates the compass arrow by `transform: rotate(${headingDeg}deg)`,
in viewport space, with no reference to the map's bearing. `CameraController` sets
`bearing: headingDeg` in `followHeading` mode.

So in heading-up mode the map is rotated by the heading **and** the arrow is
rotated by the heading, and the arrow points off by exactly the amount the map
already turned — when the whole purpose of the mode is that "the way I am facing"
is straight up the screen. It is wrong in M2 today. Nothing caught it because
m2-spec's test 7 asserts the no-compass case, and a compass is not something
Playwright hands you.

```
arrowRotation = headingDeg − map.getBearing()
```

Correct in heading-up mode (zero, pointing up), correct at bearing 0 (unchanged
from today), and correct at every bearing M3 is about to make reachable. It needs
the map's `rotate` event as a render trigger — one small `useMapBearing()` hook,
which is a subscription to an external system and therefore the kind of
`useEffect` the repo's rules permit.

### Buildings are a layer, not a style swap

m2-spec decision 2 said Fiord 3D on the same provider meant M3's buildings would
be a style swap. **The cheaper route is better and M3 takes it instead:** add one
`fill-extrusion` layer to the Positron style already loaded, sourced from the same
OpenMapTiles vector tiles, extruding `render_height` from `render_min_height`.

Swapping to Fiord 3D would throw away the reason Positron was chosen — that the
map is context and the players are the content (m2-spec §3) — in exchange for
buildings that a single layer gives us on the style we already like. The escape
hatch stands and is unchanged; it is simply not needed.

**This depends on one fact that must be checked before anything is built:** that
the tiles OpenFreeMap serves for Positron carry the OpenMapTiles `building` layer
with its height attributes at high zoom. The schema says they should. If they do
not, the fallback is the style swap m2-spec already described, and if that also
disappoints, buildings are dropped and the milestone still delivers everything
else. Nothing else in M3 depends on the answer.

**Buildings are derived from the camera, not stored as a setting.** They render
above roughly zoom 15 and a pitch above about 20°, which is when they are useful
and when the GPU cost is worth paying — this app runs on a phone at 8% battery,
and extruding a city at zoom 11 is a way to make that worse for no information.
Derived rather than synced, per the repo's React rules: there is no toggle, no
persisted preference, and no state to get out of step with the view.

DOM markers draw above the WebGL canvas, so a player behind a building stays
visible. That is a lie about occlusion and it is the correct lie: the marker is
the content.

---

## 9. Layers, tools and taps

```
MapRoute                 camera, tool state, blindness, tracking gate
  MapCanvas              owns the MapLibre instance; provides it by context
    GameAreaLayer        validHidingArea, outline only
    BuildingsLayer       fill-extrusion, mounted with the camera that earns it
    SearchZoneLayer      own team's zone
    PinLayer             pins, and the halo of any that carry a radius
    MeasureLayer         the scratch path or circle, and its vertices
    OwnPosition          own marker, corrected compass arrow, accuracy ring
    PlayerMarker         one per player
  MapControls            recenter cycle, north reset, tool bar, blindness
  ToolSheet              measure readout · pin editor · search results
  PlayerSheet            unchanged from M2
```

**One hook for map layers.** M2 hand-rolled the add-source / add-layer /
`getSource<GeoJSONSource>().setData()` dance twice, and M3 needs it four more
times. `useGeoJsonLayer(id, data, paint)` replaces both existing copies and serves
every new one. Six hand-rolled copies of a teardown that has to remove layers
before sources is six chances to leak one on a fast route change.

**Layer order is declared, not discovered.** MapLibre draws in insertion order and
React's mount order is not something to build a visual hierarchy on. A single
ordered list of layer ids, with each layer inserted before the first existing
layer that sits above it:

```
game-area · buildings · search-zone · pin-radius · measure-fill · measure-line · own-accuracy
```

Markers are DOM and are always above all of it.

**Tool state is a discriminated union**, per the repo's React rules:

```ts
type Tool =
  | { kind: "none" }
  | { kind: "measure"; measure: Measure }
  | { kind: "placingPin" }
  | { kind: "editingPin"; pinId: string }
  | { kind: "placingZone"; center: LngLat; radiusMeters: number };
```

**An active tool captures taps.** While one is active a map tap belongs to it and
marker taps do nothing — a half-drawn path that opens somebody's player sheet on
the fourth vertex is the sort of thing that makes a tool unusable while walking.
The consequence is a hard requirement: **the active tool is named on screen at all
times with a cancel next to it, at 44 px.** A mode you cannot see is a mode you
cannot leave.

**Haptics gets its first caller.** m0-spec §10 defined `webPlatform.haptics` and
nothing has ever called it — the same "plumbing laid in M0 and never connected"
that M2 found in `sendBattery`. A short tick when a vertex lands, a pin drops, or
a tool is cancelled is worth a great deal in gloves and sun, and it degrades to
nothing where the capability is unavailable, which is most desktops and all of
iOS Safari.

Field-hostile throughout, per the build plan and m1-spec §11: 44 px targets, tools
within one-handed reach at the bottom, readouts large enough to read at a glance,
nothing carried by colour alone.

---

## 10. Offline, and the write that does not wait

m1-spec left this open and named M2 as the owner; M2 added no writes and so never
answered it. M3 adds writes that will happen underground constantly, so it closes
it.

> **A write that is a fact about your own team applies optimistically. A write
> that has to be true somewhere else before it means anything waits.**

A pin appears the instant it is dropped, with no spinner and no pending chrome.
Zero queues it and rebases it on reconnect (m0-spec §3), which is the behaviour
acceptance test 3 settled two milestones ago. Dropping a pin on a platform with no
signal is the normal case, not the edge case.

`player.leave` still waits, and the contrast is the rule rather than an
inconsistency: you have not left a lobby that does not know you have left it.
Nobody else needs to agree that your team has a pin.

**No per-pin sync indicator.** The build plan wants clear pending/synced state and
gives it to M15, across every action at once. Five hand-rolled versions of it now,
each slightly different, is how that milestone gets more expensive rather than
less.

What the toolkit does with no connection at all:

| | Works offline |
| --- | --- |
| Measure, both shapes | **yes** — pure arithmetic on local state |
| Coordinate readout and copy | **yes** — the device's own fix |
| Place search | **yes** — the area pack is bundled |
| Drop, edit, delete a pin | **yes**, queued |
| Declare a search zone | **yes**, queued |
| See a teammate's new pin | no — that needs the connection both ways |
| The base map underneath all of it | no, and it never will (m2-spec §3) |

Which is worth saying plainly: **M3's toolkit is the part of the map that still
works in the tunnel.** A blank canvas with a measured distance and a coordinate on
it is a genuinely useful screen, and it is the same argument m2-spec §11 made for
rendering own position on nothing.

---

## 11. Events

Every mutator writes state rows **and** an event row in one transaction — m0-spec
§6, no exceptions, and a state write with no event is a defect at review.

| Type | Payload |
| --- | --- |
| `pin.created` | `{ pinId, lng, lat, radiusMeters, label, color }` |
| `pin.updated` | `{ pinId, … }` — changed fields only, like `team.updated` |
| `pin.deleted` | `{ pinId }` |
| `searchZone.declared` | `{ zoneId, stopId, lng, lat, radiusMeters, note }` — the full zone, every time |
| `searchZone.cleared` | `{ zoneId }` |

`actorTeamId` carries the owning team on all five, so a replay can scope them
without a join.

`searchZone.declared` carries the complete zone rather than a delta, for
`round.rolesAssigned`'s reason (m1-spec §10): a replay reader should never have to
accumulate to know the state of the board.

**Measurements emit nothing** (§4). **Notes are not events per keystroke** (§5).

---

## 12. Testing

**Unit, in `packages/geo` and `apps/web`:** `distanceMeters` against published
geodesic reference pairs; the corrected `circleLngLat` measured geodesically at
three latitudes — Flensburg, Berlin, Garmisch — asserting round to within a tenth
of a percent at each, which is the test the old equatorial constants would fail; the distance formatter
across the bucket boundaries; the coordinate formatter and parser as a round trip,
including the lat/lng swap case and the out-of-range rejection; the search fold
and ranking over the Berlin fixture, including `suedkreuz` and `hbf`.

**Playwright acceptance.** Each of these is a spec, and M3 is done when they pass.

**The suite makes no third-party request at all.** M2 made this true for
`tiles.openfreemap.org` specifically; M3 generalises it in the harness — every
context records and refuses any request whose origin is not one of the three local
servers, and a non-empty list fails the test. Search is the reason to write it now
(§7), and it is cheaper than auditing each new feature for the same mistake.

1. **Both roles measure the same line and read the same number.** A seeker and a
   hider each measure the same two points; the readouts are identical strings and
   the value matches a geodesic reference to within a metre. The build plan's
   first reviewable-when.
2. **A seeker drops a pin that only their team sees.** Their teammate sees it;
   the other seeker team does not; **the hider does not** — §3's rule and the half
   with no precedent. Asserted against the synced store and the database, not the
   UI, for m0-spec test 6's reason.
3. Editing and deleting a pin propagates to a teammate without a reload; the row
   is gone; the log holds created, updated and deleted, in that order, with
   consecutive `seq`.
4. A seeker team declares a zone anchored to a stop found by search; teammates see
   it; no other team does. Declaring a second replaces the first — one row, two
   `searchZone.declared` events.
5. A measurement transmits nothing and records nothing: the socket frames and the
   event log are identical either side of a full multi-point measure session, and
   no teammate's screen changes. The direct analogue of m2-spec's test 8.
6. Rotate and tilt: a rotate gesture drops the camera out of follow, the north
   control appears only when it is not north-up, and one tap returns bearing and
   pitch to zero. In heading-up mode the compass arrow's rendered rotation is zero
   — the regression guard for §8's inherited bug.
7. Buildings: the extrusion layer is present above the zoom and pitch thresholds
   and absent below them, asserted against the map's layer list. A WebGL extrusion
   is not something a DOM assertion can count, which is m2-spec test 5's argument
   for asserting structure instead.
8. Search: a station name flies to the station; a line fits its stops; a typed
   coordinate pair offers a pin; a pair with the first value above 90 is offered
   swapped and says so. Zero requests leave the app throughout — which the
   suite-wide rule above asserts anyway, and which this test names.
9. Copy coordinates writes the round-trippable string, and that string pasted into
   the search box finds the same point. With the clipboard capability unavailable
   the text is rendered selectable and nothing throws.
10. Offline: with both sockets cut and tiles blocked, a player measures, reads
    coordinates, searches for a station and drops a pin — all of it works — and
    the pin arrives on a teammate's map when the connection returns.
11. The M0, M1 and M2 suites still pass.

Tests 2 and 4 are the pair that matters most. They are the only two that fail
loudly when somebody widens the authored-content filter three milestones from now,
and they are the reason §3 is one rule instead of a role matrix.

---

## 13. Decisions taken

1. **Authored content is team-private, with no role exception** (§3). A hider sees
   every seeker position and no seeker pin, because a position is observed and a
   note is authored. This settles M7's threads and chat by precedent.
2. **Two tables: `pin` on the game, `searchZone` on the round** (§2). A good pin
   outlives a round; an intended search does not, exactly as a constraint does not.
3. **`searchZone` mirrors `hidingCommitment`** — same round scope, same one-per-
   team unique index (§2), which is what makes M12's zone comparison a comparison
   between two rows of one shape.
4. **Measurement is local, unsent and unrecorded** (§4), the same shape as the
   blindness toggle and the hiding-zone nudge.
5. **Distance is a WGS84 geodesic on the coordinates the app already holds** (§4),
   with no frame conversion — which is m0-spec §9's amendment arriving at the
   feature that cares most about metres.
6. **Vincenty's inverse, not haversine** (§4). Forty lines to remove a 0.5% error
   that is nothing in a city and two kilometres across a country, in the one number
   a player reads as a fact.
7. **`circleLngLat`'s metres-per-degree constants are latitude-dependent** (§4).
   The equatorial figures draw a Berlin ring 0.64% large north–south and 0.4% out
   of round — invisible under an accuracy ring, a bug report next to a ruler, and
   since m0-spec §9's amendment this is the metric the whole constraint engine
   constructs through rather than a helper in one drawing routine.
8. **The radius tool reports the radius that was set**, never a measurement of the
   drawn ring (§4).
9. **The circle tool is not a constraint and the search zone is not a constraint**
   (§4, §6). `source: "manual"` is waiting and using it now means M13 inherits
   rows written before its semantics existed.
10. **A kept circle is a pin with a radius** (§5). One shared object, not a second
    kind of thing, and one tap promotes a scratch circle into one.
11. **Any team member edits or deletes any of the team's pins** (§5), per m1-spec's
    rule that a team's own presentation is the team's business. `createdByPlayerId`
    is a credit, not a permission.
12. **A deleted pin is deleted** (§5). Soft-delete is for rows other rows point at,
    and nothing points at a pin but the log.
13. **A search zone is seeker-only, one per team, replaced rather than
    accumulated, and last-write-wins** (§6). Changing your mind is the normal
    operation, not a race — not everything a team does once is a
    first-to-the-server-wins action.
14. **Place search never leaves the device** (§7). The load argument is the one M2
    made about tiles; the stronger one is that a geocode query is a hider's intent,
    sent to a third party, defeating §3 through a text field.
15. **Coordinates are lat-first decimal degrees to five places**, with one
    formatter and one parser tested as a round trip (§7), because the internal
    order is the opposite and this is the only place the two meet.
16. **3D buildings are a `fill-extrusion` layer on Positron, not a style swap**
    (§8). This refines m2-spec decision 2: the escape hatch stands, it is simply
    cheaper to keep the style that was chosen for good reasons. Contingent on the
    served tiles carrying the `building` layer, which is verified first.
17. **Buildings are derived from the camera** — zoom and pitch — with no toggle and
    no stored preference (§8).
18. **The compass arrow rotates by `headingDeg − bearing`** (§8), fixing an M2 bug
    that only rotation makes visible.
19. **Rotate and pitch gestures drop the camera to `free`**, and a north reset
    appears only when there is something to reset (§8).
20. **One `useGeoJsonLayer` hook and one declared layer order** (§9), rather than
    six hand-rolled copies and whatever order React mounted in.
21. **An active tool captures taps and is always named on screen with a cancel**
    (§9).
22. **Optimistic for your own team's writes, waiting for writes that must be true
    elsewhere** (§10). This closes m1-spec's open question about an offline-first
    screen and a write it cannot complete.
23. **No per-pin sync indicator** (§10). M15 owns pending/synced across every
    action, and five hand-rolled versions now make that milestone harder.

### Still open

**Whether the tiles carry building heights** (§8). Checked before anything is
built; the fallbacks are named and nothing else in M3 depends on the answer.

**External geocoding stays deferred with its terms pre-agreed** (§7): if it ever
lands it is opt-in, fires on submit rather than on keystroke, names its provider
on screen, and is intercepted in tests like every other third party. The privacy
argument means it should probably never land during a running round at all.

**Clutter across rounds** (§2). A team's pins accumulate over a series and M3 has
exactly one round to look at, so there is nothing yet to judge. `pin.roundId` is
recorded so that M5 — which is where a second round first exists — can filter
without a migration.
