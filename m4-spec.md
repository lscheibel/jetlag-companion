# M4 — Game Area Builder — Technical Specification

A host defines the board — one polygon, and the transit around it — in a couple of
minutes, at any scale.

Companion to [build-plan.md](build-plan.md), [m0-spec.md](m0-spec.md),
[m1-spec.md](m1-spec.md), [m2-spec.md](m2-spec.md) and [m3-spec.md](m3-spec.md).
Where they disagree, the build plan owns _what_, m0-spec owns the contracts,
m2-spec owns how the map renders, m3-spec owns the toolkit, and this document owns
_how a map gets built_.

---

## 1. Scope

M0 hand-wrote one map config as a fixture and said M4 would generate them. Every
milestone since has read that fixture directly — `apps/web/src/game/hiding.tsx`
imports `BERLIN_VBB_PACK` to populate a dropdown, and M3's place search searches
it. M4 is where the fixture stops being the game.

**In scope**

- A **transit catalog for all of Germany**, imported from an open GTFS feed into
  Postgres, queried by the server and never shipped to a phone
- The game area as **one polygon**, chosen by administrative boundary or drawn by
  hand
- The stops a game carries: materialised onto the map config, so a playing phone
  needs nothing but its own rows
- A global hiding radius, and the two advisory predicates that make a hiding spot
  valid
- The scale a map was built at, recorded for M6
- Save, name, duplicate, and share a map by code or link
- Applying a map to a game, including a game that has already started

**Explicitly out of scope**

- **The union of station hiding radii as the game area** — and with it, per-mode
  radii, enable/disable by mode, operator, line or stop, and the bulk operations
  those needed. See below
- Custom Overpass queries, exclusion polygons, GeoJSON/KML import, water and no-go
  masking, POI zones, building footprints (M18)
- An automated catalog refresh. M4 imports by hand; §4 says why that is the right
  end of the milestone to stop at
- Question distances themselves (M6). M4 stores the scale a map was built at; M6
  reads it and derives its own defaults
- Any deduction, shading or elimination on the preview map (M13)

**The guardrail.** M4 writes down one polygon and the stops near it, and does it
the same way whether that polygon is a Bezirk or a Bundesland. **If a screen in M4
makes a decision that belongs to a round, it has become M5; if it attaches meaning
to geometry, it has become M13.**

### What removing the union actually defers

An earlier draft built `validHidingArea` as the union of every enabled station's
disc, which is what the build plan describes and what `berlinFixtureMapConfig`
does today over twelve stations. That is reversed: **the game area is a polygon the
host chooses, and no station contributes geometry to it.**

The reason is cost. Measured on this repo's `packages/geo`: accumulating the union
pairwise takes 9.3 seconds at 500 discs; the variadic single sweep that fixes that
**throws** at 12,000 discs. Making it work needed spatial bucketing, a web worker,
a determinism argument about reduction order, and a second simplification tolerance
to keep the result under two megabytes. A polygon is fifty vertices.

**What this does _not_ defer is the rule that a hiding spot should be near a
station.** An earlier revision of this document said it did, and that was wrong.
The union was one *reading* of that rule, not the rule itself. m0-spec §9 already
names the duality that makes this obvious:

```ts
satisfies(p, c) === regionContains(applyConstraint(WORLD, c), p);
```

*Is this point near a station* and *what region is near a station* are two readings
of one definition. M13's fold needs the region reading, because a fold consumes
regions. **A warning needs only the point reading, and the point reading is a
distance query over a list.** Measured: a naive scan with full Vincenty over 4,473
stops — the number a Berlin-sized game actually carries (§4) — costs **0.77 ms**,
with no index and no precomputation. It can run on every GPS fix.

So the honest list of what is deferred is shorter and more specific than "the
station rule":

- **Per-mode radii and stop, line and mode toggles.** Host configurability. M18.
- **The union as M13's fold seed.** M13's search area starts as the whole game area
  rather than as the lace of station discs, so the deduction map will not
  automatically eliminate the middle of a forest five kilometres from any platform.
  That makes it **coarser and never wrong** — the seed is a superset of the truth
  and the fold only ever shrinks. When the union lands, M13 tightens for free with
  no change to M13.

---

## 2. Schema deltas

Two groups: a static catalog that no client ever sees, and the game-side rows that
a map produces.

### The catalog

**In its own Postgres database, not the game's.** `zero-cache` replicates its
upstream database through a logical replication slot, and a quarter of a million
static reference rows have no business in a sync engine's replica. Logical
replication is per-database, so a separate database is a guarantee rather than a
configuration — and it costs one extra connection pool on the server.

```ts
catalogVersion: {
  id: string;              // 'de-2026-08'
  feedPublisher: string;   // 'gtfs.de — data from DELFI e.V.'
  feedVersion: string;
  importedAt: number;
  stopCount: number;
  routeCount: number;
}

catalogStop: {             // stations only — children are folded away at import
  id: string;              // the feed's stop_id — see §4 on stability
  versionId: string;
  name: string;
  lng: number;
  lat: number;
  modeIds: string[];       // rolled up from the routes that call there
}
index("catalogStop_pos_idx").on(versionId, lat, lng)

catalogRoute:    { id, versionId, modeId, operatorId, shortName, longName }
catalogStopRoute:{ versionId, stopId, routeId }
catalogOperator: { id, versionId, name }
catalogBoundary: { id, versionId, name, adminLevel: number, polygons }
```

A plain composite index on `(versionId, lat, lng)` is all the geo indexing this
needs: §5's only spatial query is a bounding box, and PostGIS for a `BETWEEN` is a
dependency bought for nothing. Point-in-polygon refinement happens in JS with
`regionContains`, over the few thousand rows the box returns.

### The game side

```ts
mapStop: {
  id: string;                   // `${mapConfigId}:${stopId}`
  mapConfigId: string;
  stopId: string;               // the catalog's id, for provenance and re-editing
  name: string;
  lng: number;
  lat: number;
  modeIds: string[];
  insideArea: boolean;          // inside the polygon, or in the margin — §5
}
index("mapStop_config_idx").on(mapConfigId)
```

```ts
mapConfig: {
  id, gameId, validHidingArea, contentHash,     // unchanged from m0-spec §11

  catalogVersionId: string;           // replaces areaPackId + areaPackVersion
  name: string;                       // 'Berlin — Mitte + Friedrichshain'
  scalePreset: ScalePreset;           // M6 reads this and never recomputes it
  selection: Selection;               // jsonb — what was picked, for re-editing
  boundaries: StoredBoundary[];       // jsonb — the boundaries in play, for M6
  hidingRadiusMeters: number;         // §3 — one number doing two jobs
  sourceTemplateId: string | null;
  supersedesConfigId: string | null;  // §8
}
```

**Two m0-spec §11 fields are dropped.** `enabledStopIds` goes, because `mapStop`
rows are the same list with the facts attached, and two representations of one list
drift the moment somebody edits only one. When toggles return, "enabled" is a
column on `mapStop`, not a parallel array. `hidingRadiusByMode` collapses to a
single `hidingRadiusMeters` — the build plan asks for the radius "set globally or
per mode", and the global half is exactly what survives.

**`validHidingArea` keeps its name**, and this was reconsidered rather than
inherited. With §3's second predicate the name is arguably incomplete — validity
now needs the area *and* a nearby station. But the name's real work is the
distinction m0-spec §11 fought for: this is the area in which hiding is valid, not
a boundary anyone is fenced inside. `gameArea` would quietly undo that, which is a
worse error than being incomplete.

### A template is a map that does not belong to a game

```ts
mapTemplate: {
  id, code, name, createdByPlayerId, createdAt, contentHash,
  catalogVersionId: string;     // pinned — §7
  scalePreset: ScalePreset;
  selection: Selection;
  hidingRadiusMeters: number;
  validHidingArea: StoredMultiPolygon;
}
uniqueIndex("mapTemplate_code_idx").on(code)
```

**A template carries no stops.** They rematerialise at apply time (§5), which keeps
a template a few kilobytes — small enough that sharing one is a link rather than a
transfer. **A template is immutable and is not in the Zero schema**, both for
reasons in §7.

`EVENT_TYPES` gains `map.applied` and `map.changed` (§10). `queries` gains
`mapStops()`. No visibility filter is added: a game's map is the board everybody
plays on, and there has never been a version of this feature where one team sees a
different board than another.

**`packages/area-packs` becomes `packages/catalog`.** There are no packs any more —
there is an importer, a set of catalog queries the server calls, the shared types,
and the small Berlin fixture the unit tests want. Keeping a package named for a
concept the milestone deleted is how a codebase starts lying about itself.

---

## 3. The area is drawn; hiding validity is two predicates

> **The game area is one polygon, chosen by the host, stored as given. A hiding
> spot is valid if it is inside that polygon _and_ within `hidingRadiusMeters` of a
> station in play. Both are advisory.**

### Choosing the area

```ts
type Selection =
  | { kind: "boundary"; boundaryIds: string[] }
  | { kind: "drawn"; polygon: StoredMultiPolygon };
```

**By administrative boundary.** The catalog carries Bundesländer, Kreise, Gemeinden
and Stadtbezirke (§4); the host picks one or several and their union is the area.
This is the path that makes the build plan's two-minute claim true, and it produces
the best possible boundary — the real one, rather than a shape somebody traced at
zoom 11 while holding a coffee.

Selecting several is normal and useful — *Mitte plus Friedrichshain-Kreuzberg* is a
perfectly good game — and it is what keeps `validHidingArea` a genuine
`MultiPolygon` in practice rather than only in the type.

**By drawing.** Tap to add vertices, drag one to move it, tap the first to close.
The fallback for "no boundary matches what we want", which is most Deutschlandticket
games and any game defined by a river or a Ringbahn.

**Both are stored twice, and that is deliberate.** `selection` records *what was
picked* so the builder can be reopened; `validHidingArea` records *the geometry
that resulted*. Same reason m0-spec materialises `hidingCommitment.zone`: a catalog
re-import that nudges a boundary must not silently move the area a game is being
played in.

### A drawn ring is normalised through a union with itself

Hosts draw bowties. The fix is one line and it is not a special case:

```ts
normalizeRegion(unionRegions(drawn, drawn))
```

`polygon-clipping` resolves a self-intersecting ring during its sweep, so unioning
a ring with itself is the standard way to make it valid. Verified against a
deliberate bowtie over Berlin: it comes back as **two triangles totalling
18.81 km², exactly half the 37.61 km² of the square with the same four corners** —
the correct answer, not merely a plausible one.

`normalizeRegion` then snaps, simplifies and canonicalises, so the stored area is
in the same normal form as every other region in the system and hashes the same on
every device. Degenerate results — fewer than three distinct vertices, zero area —
are rejected at the builder with a message, not stored.

### The second predicate, and what it costs

```ts
function nearestStation(spot: LngLat, stops: readonly MapStop[]): Meters {
  let best = Infinity;
  for (const s of stops) best = Math.min(best, distanceMeters(spot, [s.lng, s.lat]));
  return best;
}
```

That is the whole implementation. **0.77 ms** over the 4,473 stops a Berlin-sized
game carries, measured with full Vincenty and no index, which is well inside the
budget for something that recomputes on every fix. No bounding-box prefilter, no
spatial structure, no precomputed region — and if it ever needs one, `mapStop` is
indexed and a box prefilter is four lines.

Two places read it, both advisory, per the build plan's third principle:

- **M5, when a hider commits a zone.** *This zone's centre is 1.2 km from the
  nearest station; the radius is 500 m.* A warning, never a block.
- **M5's local nudge**, the one m0-spec §5 specifies as being defined by not being
  written down. It gains a second sentence and stays exactly as unrecorded.

`hidingRadiusMeters` is one number doing both jobs, because in the game they are
one thing: a committed zone *is* "within R of station X", so the radius that sizes
a zone is the radius that decides whether a spot is near enough to one.

### It is still not a fence

Unchanged from m0-spec §11 and restated because this is the section people will
read: **the area constrains where a hiding _spot_ may be, and constrains nothing
else.** Seekers travel through it and far outside it. Hiders move freely during the
hiding phase. A spot that fails either predicate earns a warning, never a block.

### The guardrail against making this hard to undo

The union comes back one day, as an additional producer of the same stored value.
It stays cheap to add back as long as nothing downstream starts assuming the area
is simple:

- `validHidingArea` stays `MultiPolygon`, never `Polygon`
- `packages/geo`'s tests keep at least one case with holes and disjoint parts
- nothing renders, folds or tests the area as "the outer ring"

Cost of the guardrail: nothing. Without it, the expensive part of reintroducing the
union is not the union.

---

## 4. The catalog: what the feed actually contains

The source is **gtfs.de's `de_full` feed** — all of Germany, published by gtfs.de
from DELFI e.V. data, with OpenStreetMap contributors credited in
`attributions.txt`. It is already in `gtfs/`. What follows is measured from that
copy, not assumed, because three of the five things below are not what the previous
draft of this section predicted.

| File | Size | Rows |
| --- | --- | --- |
| `stops.txt` | 40 MB | 695,621 |
| `routes.txt` | 467 KB | 24,829 |
| `trips.txt` | 32 MB | 1,788,241 |
| `stop_times.txt` | **2.09 GB** | **36,321,019** |

### Stations and platforms: better than hoped

| | Rows |
| --- | --- |
| `location_type = 1` — stations | 250,183 |
| children carrying `parent_station` | 443,880 |
| children with no parent — their own station | 1,558 |

**99.6% of platform rows carry a `parent_station`**, so the fold that turns poles
into stations is a declared relation rather than the name-and-radius heuristic the
previous draft budgeted for. The 1,558 orphans are promoted to stations as
themselves. Total catalog stations: **251,741**.

The number that matters for everything downstream is the local one. A Berlin
bounding box of `13.0, 52.3 → 13.8, 52.7` holds **15,495 stop rows, which fold to
4,473 stations**. That is what a city-sized game materialises, and it is why §5's
per-game set is a comfortable size rather than an interesting problem.

### Route types are basic, not extended — and that breaks S-Bahn

| `route_type` | Meaning | Routes |
| --- | --- | --- |
| 3 | bus | 23,215 |
| 2 | **rail — all of it** | 1,058 |
| 0 | tram | 385 |
| 1 | subway / U-Bahn | 80 |
| 4 | ferry | 74 |
| 7 | funicular | 16 |

**The previous draft of this document was wrong about this.** It said the German
feeds use the extended route types — 109 for suburban railway, the 400-range for
urban rail — and that the ingest would map them. This feed uses none of that. Every
S-Bahn, every RE, every ICE is `route_type = 2`, and **S-Bahn versus regional rail
is precisely the distinction a German game is built on.**

It is recoverable from `route_short_name`, which is clean:

| Prefix | Routes | Mode |
| --- | --- | --- |
| `RB` · `RE` · `RS` · `MEX` | 661 | regional |
| `S` | 146 | **s-bahn** |
| `ICE` · `IC` · `EC` · `ECE` · `RJ` · `NJ` · `EN` · `CD` | ~120 | long-distance |

So the mode mapping is `route_type` for tram, subway, bus, ferry and funicular, and
a **short-name prefix table for rail**. That is a heuristic and it is labelled one:
it lives in a table with a test that asserts the counts above against the real
feed, so the day a feed changes shape the test says so instead of the U-Bahn
quietly becoming a train.

### Modes per stop need the 36-million-row join

A stop carries no mode of its own. Knowing that a station is served by S-Bahn means
joining stops ← `stop_times` ← `trips` ← `routes`, and `stop_times` is the 2 GB
file. **This is why the catalog lives in Postgres rather than in a JSON artifact:
`COPY` plus one `SELECT DISTINCT` is the right tool, and a streaming parse in
JavaScript is not.**

```sql
CREATE UNLOGGED TABLE stop_route AS
SELECT DISTINCT t.route_id,
       COALESCE(NULLIF(s.parent_station, ''), s.stop_id) AS station_id
FROM gtfs_stop_times st
JOIN gtfs_trips  t ON t.trip_id = st.trip_id
JOIN gtfs_stops  s ON s.stop_id = st.stop_id;
```

One statement does the platform fold and the line membership together, and the
staging tables are dropped afterwards. **It needs roughly 3 GB of transient disk**,
which is a fact about the import script's host and not about anything that ships.

### Stop ids are the feed's own, and they are not DHIDs

The previous draft assumed VBB's DHID/IFOPT ids (`de:11000:900100001`), which are
designed to be stable across versions. This feed's ids are **plain integers**
(`372476`, `3258`) assigned by gtfs.de. Nothing promises they survive a re-import.

That is a risk the design already absorbs, and it is worth naming as the payoff of
a decision made two sections earlier: because §5 copies the name, position and modes
onto `mapStop`, **a re-import that renumbers every station in Germany cannot damage
a map that already exists.** What it can do is make *reopening* an old template
resolve fewer stops, which is a builder-side inconvenience with a visible message,
not silent data loss in a running game.

### Boundaries are not in GTFS, and this is the open dependency

§3 makes administrative boundaries the *primary* way an area gets chosen, and this
feed has none. They are a second import — OSM `boundary=administrative` at the
levels that correspond to Bundesland, Kreis, Gemeinde and Stadtbezirk, or the
official BKG dataset. **Which source, and which admin levels map to which of those,
is verified before the importer is written** (§12). Until boundaries land, drawing
is the only path to an area, and the two-minute claim is not testable.

### Importing, and when to automate it

```bash
npm run catalog:import -- --gtfs ./gtfs
```

`COPY` the four files into staging tables, run the join, fold, classify and write
the catalog tables inside one transaction, drop the staging. Reproducible: every
collection is written in id order, and the importer has a test that a second run
over the same feed produces identical rows.

**The scheduled refresh is not M4.** Nothing in a running game reads the catalog —
§5 copied what it needed — so a stale catalog means only that a station opened last
month is missing from the builder. That is a low-stakes, hand-run operation until
something depends on freshness, and the milestone that does is **M20**, where next
departures make the feed's currency part of the product. Automating it before then
is machinery guarding a risk nobody has.

### The fixture stays

`BERLIN_VBB_PACK`'s twelve stations remain, as a test fixture, because a test that
asserts on geometry wants twelve stations and a square rather than a database. What
goes is every import of it from a play screen (§5).

---

## 5. Which stops a game carries

The map config materialises the stops near its area, so **a phone that is playing
never queries the catalog.** The catalog is the builder's index; the config is the
game.

Today the opposite is true: `hiding.tsx`, `toolkit.ts` and `map-tool-sheet.tsx` all
import `BERLIN_VBB_PACK` directly. That works because the fixture is twelve stations
and 4 KB, and it stops working the moment the data is real.

### The margin, and a correction

An earlier draft materialised stops by strict containment in the area, arguing that
offering a station outside the game means nothing. **That was reasoning from the
union model**, where every station was inside the area by construction, so one
outside it meant one the host had switched off.

With a drawn polygon it is plainly wrong. m0-spec §11 says seekers travel far
outside the area routinely, and a seeker searching for the station they are changing
at is the most ordinary thing in the game.

So materialisation is a bounding box, expanded by a margin from the scale preset
(§6), refined in JS:

```sql
SELECT id, name, lng, lat, "modeIds" FROM "catalogStop"
WHERE "versionId" = $1
  AND lat BETWEEN $2 AND $3 AND lng BETWEEN $4 AND $5;
```

```ts
insideArea = regionContains(area, [stop.lng, stop.lat]);
```

**A bounding box, not a polygon buffer**, deliberately: `packages/geo` has no
offsetting function, buffering an arbitrary polygon is real work, and this is an
index rather than a rule, so precision buys nothing. `insideArea` is recorded per
stop because the readout wants an honest count and M5's station picker wants to
sort by it — not because anything is forbidden outside.

### Why Zero never has to be asked the hard question

Zero carries only the per-game materialised set: a few thousand rows, scoped by
`mapConfigId`, bounded by the game area and therefore by the size of a playable
game. Whether `zero-cache` would happily sync an unfiltered query over a
quarter-million-row national stop table is a question **nobody has to answer**,
because the catalog is in a different database and no such query exists.

### Boundaries come too

Every catalog boundary that intersects the area, not only the ones selected. M6's
matching questions ask *which Bezirk are you in*, and the answer set is all of them.
Berlin's twelve Bezirke are a few thousand vertices; this is cheap and it saves M6 a
migration.

### The count is live while the host works

The build plan's reviewable-when wants a station count that updates as the area
changes. It does: the builder holds the candidate rows for the current view and
re-runs `regionContains` over them, which at these sizes is imperceptible.

**There is no worker, no debounce and no bucketing in this milestone.** The previous
draft needed all three. A polygon needs none of them, and that is the clearest
measure of what removing the union bought.

---

## 6. Scale, and what M6 reads

A preset sets two numbers and records one fact.

| Preset | Typical span | Stop margin (§5) | Hiding radius |
| --- | --- | --- | --- |
| `district` | 5–15 km | 5 km | 300 m |
| `city` | 20–40 km | 10 km | 500 m |
| `metro` | 60–120 km | 25 km | 1 km |
| `state` | 200–400 km | 50 km | 2.5 km |
| `ticket` | 800 km+ | 100 km | 5 km |

The fact it records is `scalePreset` itself, which M6 reads to pick question
distances. Both numbers are host-overridable, and overriding them does not change
the preset — a host who builds a `city` map and then sets a 5 km hiding radius has a
`city` map with big zones, and M6 offering them city-scale question distances is
correct.

The per-mode radii and the "which modes start enabled" defaults an earlier draft put
here are gone with the toggles. They return together.

---

## 7. Saving, sharing and versioning

### A template is immutable

Saving a map writes a `mapTemplate` row and never updates one. Renaming, editing or
duplicating produces a new row with a new code.

Immutability buys the thing sharing needs most: **a code you gave somebody cannot
change under them.** A host who shares a map on Tuesday and redraws it on Wednesday
has not silently changed the board three groups are playing on. "Duplicate" is
therefore not a feature: it is opening a template in the builder and saving.

### The catalog version is pinned, and the stops rematerialise

A template stores `catalogVersionId` and no stops. Applying it runs §5's query
against that version, which is a pure function of (polygon, margin, catalog
version) — so two devices applying the same code get identical rows, and the build
plan's byte-identity requirement holds by construction rather than by luck. The area
itself travels verbatim and the recipient verifies `contentHash` on arrival.

Applying a template whose pinned version has been superseded falls back to the
current one and **says so**, rather than failing: §4's integer stop ids mean a
re-import can move ids, and the honest behaviour is to rebuild the index and tell
the host which version it used. The polygon — the actual board — is unaffected
either way, which is the whole reason this degrades gracefully.

### Templates are plain HTTP, not Zero

```
POST /maps               → { id, code }        save a builder session
GET  /maps/:code         → the template        open or import one
POST /games/:id/map      → { mapConfigId }     apply a template to a game
GET  /catalog/stops?bbox= · /catalog/boundaries?q=   the builder's reads
```

Zero's query context is a game (`requireContext(ctx)` needs a `gameId`), and a
template belongs to no game — that is the entire point of it. m0-spec already carries
the precedent and the reason: joining is plain HTTP because a token has to exist
before Zero can be pointed at anything. A template has to be readable before a game
exists to point at. The catalog endpoints are HTTP for the stronger version of the
same reason: the catalog is not in Zero's database at all.

`POST /games/:id/map` writes the `mapConfig` row, the `mapStop` rows and the event in
one transaction on the game database, exactly as `POST /games` already does for game
creation. The catalog read happens before it opens, which is safe because the catalog
is static.

### Applying a map waits

m3-spec §10 settled the offline write rule: *a write that is a fact about your own
team applies optimistically; a write that has to be true somewhere else before it
means anything waits.* A map everybody plays on is the second kind, and it is the
case that rule was written for. Applying a map shows a spinner and can fail.

There is a mechanical reason pointing the same way: a Zero custom mutator runs the
same code on the client and the server, so applying optimistically would mean
inserting several thousand `mapStop` rows into the local store to produce a screen
that cannot be trusted until the server agrees anyway.

### Two hosts, one map

The host hat is shared — m1-spec §6 lets any player wear it and more than one wear it
at once. Two hosts building simultaneously and both saving is **last write wins**,
not first-to-the-server-wins.

That is m3-spec decision 13's argument one level up: first-to-the-server-wins exists
for actions a team may take only once, where a second attempt is a race between
teammates who both thought it was their job. Configuring the board is not that. A
host who applies a map after another host did has changed their mind, and the correct
behaviour is that the map changes. The superseded host sees the new map arrive
through Zero like everybody else, which is the notice.

---

## 8. Changing the map after the game has started

Allowed, warned, and safe — and it is safe because M0 already paid for it.

A new map produces a **new `mapConfig` row** with `supersedesConfigId` pointing at
the old one, and `game.mapConfigId` is repointed. Nothing is updated in place, so a
replay can reconstruct which board was in force at any event by walking the
`map.changed` events.

| | What happens |
| --- | --- |
| M13's folds | `contentHash` changes, so the cache key changes and every search area refolds. The seed changed; refolding is correct. |
| Committed hiding zones | Do not move. m0-spec §5 materialises `hidingCommitment.zone` at commit time *for this exact reason*, and says so. |
| A hider now outside the area | Nothing happens beyond §3's advisory notice on their own device. There is no fence, and the round already has a committed zone. |
| M3 pins and search zones | Untouched. They are the team's own content and have never referenced the map. |
| `mapStop` rows | Rewritten for the new config. A hider's committed `stopId` is unaffected, because the zone was materialised. |

The warning the host sees before applying mid-round names the first two: search areas
will be recomputed, committed zones will not move. **Warned, never blocked** — the
build plan's third principle, and there is no honest reading of "the host may not fix
a map that turned out wrong at the start of a round".

---

## 9. Routes and UI shape

One new route.

```
/g/:code/build     the builder — full-screen map, boundary picker, readouts
```

```
BuildRoute                   session state: selection, preset, radius, name
  BuilderMap                 MapCanvas, reused wholesale from M2/M3
    BoundaryLayer            selectable boundaries, the picked ones filled
    AreaLayer                the resulting area — fill and outline
    DrawLayer                the in-progress ring and its vertices
    StopsLayer               catalog stops in view, dimmed outside the area
  SelectionPanel             boundary search and list · switch to drawing
  ReadoutBar                 stations · area km² · modes present
  SaveSheet                  name, preset, hiding radius, save, share, apply
```

`AreaLayer` is `useGeoJsonLayer` with a fill, which m3-spec §9 built and
`GameAreaLayer` already uses for the outline. `DrawLayer` is `MeasureLayer` with a
different colour — a ring of tapped vertices with a line between them is exactly what
M3's path measurement already renders, and the draw tool inherits its tap-capture
rule from m3-spec §9: **while drawing, a map tap belongs to the tool, and the tool is
named on screen with a cancel next to it.**

`StopsLayer` fetches by viewport from `/catalog/stops`, which is the one screen in
the app that talks to the catalog. It is debounced on map idle rather than on every
frame — not for compute, which is trivial, but because it is a network call.

The declared layer order gains `boundary-fill`, `boundary-outline`, `area-fill`,
`draw-line`, `draw-vertices` and `builder-stops`. The builder never mounts the play
layers and the map route never mounts these, but they share one list because m3-spec
§9's argument against discovering layer order from React's mount order does not
weaken when there are two screens.

**"Share of the game boundary" is not a readout any more**, and the build plan's
feature list should lose it: the area *is* the boundary now, so the share is always
100%. What replaces it is the station count, which is the number a host actually uses
to judge whether a map is a game.

**Reachable from the lobby, by anyone wearing the host hat**, next to the round
controls. Not from the map route: the map is the playing surface and m3-spec §9
already fought for every pixel of it.

Field-hostile is a weaker requirement here than anywhere else in the app, and it is
worth saying why rather than silently dropping it. Nobody draws a game area in the
rain with 8% battery; they do it on a sofa the night before. 44 px targets and
one-handed reach still apply to the readouts and the save, which a host does check on
a platform.

---

## 10. Events

| Type | Payload |
| --- | --- |
| `map.applied` | `{ mapConfigId, templateId, name, scalePreset, hidingRadiusMeters, stopCount, areaSquareMeters, catalogVersionId, contentHash }` |
| `map.changed` | `{ mapConfigId, supersedesConfigId, … same fields }` |

Two types rather than one because the questions they answer differ: the first is
*what board is this game on*, the second is *the board changed under a running
round*, which a replay viewer needs to see marked rather than infer from a repeated
event.

Neither payload carries the geometry. m3-spec §11 established that an event carries
the full state of what it declares rather than a delta, and `contentHash` plus
`mapConfigId` is the full state of this one — the geometry is a row a replay can
read, and duplicating it into an append-only log is a cost with no reader.

`actorTeamId` is null on both. Configuring the board is not a team act.

---

## 11. Testing

**Unit, in `packages/geo`:** a self-intersecting ring normalised by a union with
itself, asserting the bowtie's two triangles and its exact half-area against the
square — §3's measurement as a regression test; a multi-part area with a hole
surviving `normalizeRegion` and `regionContains`, which is §3's guardrail with teeth.

**Unit, in `packages/catalog`:** the rail short-name classifier, asserting §4's
counts against the real `routes.txt` — the test that notices when a feed changes
shape; the platform fold, including the 1,558 parentless stops promoted to stations;
the importer producing identical rows on a second run; §5's materialisation as a pure
function — same polygon, same margin, same catalog version, same rows in the same
order; `nearestStation` against known Berlin pairs.

**Playwright acceptance.** Each is a spec, and M4 is done when they pass.

1. **A host builds a map in under two minutes.** Open the builder, search for a
   Bezirk, add a second, set the hiding radius, name it, save, apply. The build
   plan's first reviewable-when, with the timing asserted — not as a performance test
   but as a guard on how many interactions the flow costs.
2. **The station count follows the area.** Adding a second boundary raises the count;
   removing it lowers it to the previous value exactly.
3. **A drawn bowtie is accepted and fixed.** The host taps four vertices in the
   crossing order; the stored area is valid and its size matches §3's figure.
4. **A share code reproduces the map byte-identically on another device.** A second
   context opens the code, applies it to its own game, and gets a `contentHash`, a
   `validHidingArea` and a set of `mapStop` rows identical to the first's. The build
   plan's second reviewable-when.
5. **Both extremes build.** A one-Bezirk boundary selection and a drawn state-sized
   area at `ticket` preset both complete and both render, and the station list stays
   usable at its largest.
6. **A game plays from its own rows.** With the catalog endpoints blocked at the
   network layer, a joined player sees the area, finds a station by name in M3's
   search, and commits a zone to it. §5's whole argument, as one test.
7. **Both predicates warn and neither blocks.** A zone outside the area warns; a zone
   inside the area but 3 km from any station warns differently; the hider commits
   anyway in both cases and the commitment exists. §3, and the build plan's third
   principle.
8. **Applying a map mid-round is warned and safe.** A round is running with a
   committed zone; a host applies a different map; the warning names both effects; the
   committed zone's geometry is unchanged afterwards and the search area refolds
   against the new seed.
9. **Two hosts, last write wins.** Both save; both templates exist; the game carries
   the later one; the log holds two `map.changed` events with consecutive `seq`.
10. **The suite makes no third-party request**, per m3-spec §12 — which now covers
    the catalog endpoints, served locally like everything else.
11. The M0, M1, M2 and M3 suites still pass, against a map produced by the builder
    rather than by the fixture.

Test 6 is the one that matters most. It is the only test that fails when somebody
reintroduces a direct catalog import into a play screen, which is the shortcut that
is already in the codebase three times and will look reasonable every time somebody
needs a station's name in a hurry.

---

## 12. Decisions taken

1. **The game area is a polygon the host chooses, and no station contributes
   geometry to it** (§1, §3). The union cost seconds and megabytes; a polygon costs
   nothing.
2. **The "near a station" rule is not deferred** (§1, §3). It is a point test over
   the stop list — 0.77 ms over 4,473 stops with no index — and the union was only
   ever its region reading, which m0-spec §9's `satisfies`/`regionContains` duality
   already predicted. What is deferred is per-mode radii, toggles, and the union as
   M13's fold seed, which makes M13 coarser and never wrong.
3. **A hiding spot is valid if it is inside the area and near a station, both
   advisory** (§3), with one `hidingRadiusMeters` doing both jobs because in the game
   they are one thing.
4. **The area is chosen by administrative boundary first, drawn second** (§3).
5. **`selection` and `validHidingArea` are both stored** (§3), so the builder can be
   reopened and a re-import cannot move a board already in play.
6. **A drawn ring is normalised by a union with itself** (§3), verified against a
   bowtie whose two triangles are exactly half the square's area.
7. **`validHidingArea` keeps its name** (§2), reconsidered and kept: `gameArea`
   would undo the distinction m0-spec §11 fought for.
8. **`validHidingArea` stays a `MultiPolygon`, and a holed, disjoint case stays in
   the tests** (§3). The guardrail that keeps the union cheap to reintroduce.
9. **`enabledStopIds` is dropped in favour of `mapStop` rows**, and
   `hidingRadiusByMode` collapses to one global `hidingRadiusMeters` (§2). Both amend
   m0-spec §11; the build plan's "globally or per mode" keeps its global half.
10. **The catalog is all of Germany, in Postgres, in its own database** (§2, §4).
    Logical replication is per-database, so `zero-cache` cannot pick up a quarter of a
    million static rows by accident — a guarantee rather than a configuration.
11. **`COPY` and SQL, not a streaming parse** (§4). Modes-per-stop needs a
    36-million-row join, which is a database's job; the staging tables want ~3 GB of
    transient disk and are dropped.
12. **A composite `(versionId, lat, lng)` index, not PostGIS** (§2). The only spatial
    query is a bounding box.
13. **Rail modes come from a `route_short_name` prefix table, not from
    `route_type`** (§4). This feed uses basic route types, so every S-Bahn, RE and ICE
    is `2`; the classifier is a labelled heuristic with a test that asserts the real
    feed's counts.
14. **Stations are folded by `parent_station`**, with 1,558 parentless stops promoted
    to stations as themselves (§4). No name-and-radius heuristic is needed — the feed
    declares the relation for 99.6% of platforms.
15. **Stop ids are the feed's integers and are not assumed stable** (§4). §5's copying
    is what makes a re-import unable to damage an existing map.
16. **A phone that is playing never queries the catalog** (§5). The config carries the
    stops and boundaries the game needs, in rows.
17. **Stops are materialised by bounding box plus a scale margin, not by containment**
    (§5). This corrects an earlier decision that reasoned from the union model.
18. **A bounding box rather than a polygon buffer** (§5).
19. **No worker, no debounce and no bucketing** (§5) — the clearest measure of what
    removing the union bought.
20. **A template is immutable, carries no stops, and pins its catalog version** (§7),
    falling back to the current version with a message rather than failing.
21. **Templates and catalog reads are plain HTTP** (§7).
22. **Applying a map waits** (§7). m3-spec §10's rule, meeting the case it was written
    for.
23. **Two hosts saving is last-write-wins, not first-to-the-server-wins** (§7).
24. **A map change is a new config row, warned and never blocked** (§8).
25. **The catalog import is hand-run in M4; the scheduled refresh is M20's** (§4),
    where next departures make the feed's currency part of the product.
26. **`packages/area-packs` becomes `packages/catalog`** (§2). There are no packs.
27. **Two events, `map.applied` and `map.changed`, neither carrying geometry** (§10).

### Still open

**Administrative boundaries: which source, and which admin levels** (§4). This is the
one open dependency of §3's primary path, and it blocks the build plan's two-minute
claim rather than merely delaying it. OSM `boundary=administrative` from a Germany
extract is the default assumption; the BKG's official dataset is the alternative.
Both the source and the level-to-name mapping are settled before the importer is
written, and this is the first task in the milestone.

**Whether `zero-cache`'s default publication would have picked up catalog tables in
the game database** (§2). The separate database makes it moot, and the answer is
worth knowing anyway before anything else static is ever added.

**What a second catalog version does to open templates** (§7). The fallback is
specified; nothing has been tested against two versions because there has only ever
been one.

**Two measured findings from the union draft, recorded so they are not
rediscovered.** Neither is M4 work.

- **`unionRegions` in a loop is quadratic** — 9.3 s at 500 discs against 53 ms for
  `polygon-clipping`'s variadic single sweep. M8's tentacles unions candidate POI
  buffers and should call the variadic form. The variadic sweep itself throws at
  roughly 12,000 inputs.
- **Snapping to a decimal-degree grid rather than a metric one halves stored
  geometry** — 1,602 KB against 895 KB on a test region, for identical geometry,
  because `snapRegion` has already destroyed the digits that make up the difference.
  With the union gone the payload is kilobytes and the saving does not matter, but it
  would also make the canonical form exact rather than float-formatted.

**When the union comes back.** Per-mode radii, stop and line toggles, and the union
that turns them into geometry are one feature and arrive together. §3's guardrail is
what keeps that an additive change rather than a rewrite.
