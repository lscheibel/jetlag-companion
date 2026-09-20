# M15 — Field resilience: background location

> A player's phone can report where it is with the screen locked, the browser
> closed and the app not running — by pointing a tracker app they already trust
> at one URL.

Build plan: [M15 — Field resilience](build-plan.md#m15--field-resilience).

Prior art this leans on: m0-spec §7 (three clocks, and the subtraction the
system never performs), §8 (the ephemeral channel is lossy on purpose); m1-spec
§9 (everyone is visible, positions are not); m2-spec §5 (staleness is an age,
not a timestamp), §6 (an entry outlives its socket), §7 (a stale battery is
dropped), §8 (heading is the compass or it is nothing), §10 (when a phone tracks).

---

## 1. Scope

M15 in the build plan is four things: offline queueing, background location,
push notifications, and low-power affordances. **This spec is the second one
only.** Push notifications, the low-power mode and the one-handed layout are
untouched and keep whatever the build plan says about them.

**In scope**

- A device-scoped tracking token, and the URL a tracker app is pointed at
- An ingest endpoint speaking the OsmAnd protocol family, OwnTracks' JSON and
  Overland's batched GeoJSON
- Delivery of an external fix to live presence and to the durable log
- Rehydrating a presence room from the log, so a room can die with its sockets
- The setup screen, and the case it has to make for something optional
- Two corrections it forces: how an age is measured, and when a phone broadcasts

**Not in scope**

- A Capacitor or Cordova build (§2)
- Battery level from a tracker app (§9)
- Push notifications, which need the native shell this milestone declines to
  build and are therefore still waiting on it

---

## 2. Why this instead of a native shell

The build plan says background location "is what a Capacitor build exists for",
and it was right that a browser cannot do it. It was wrong that a native shell
is the only thing that can.

**The job is not "run our code in the background". It is "know where a phone
is".** Several free, cross-platform, independently maintained apps already do
exactly that, have already solved the part that is genuinely hard — iOS
background location, permission prompts, battery behaviour, buffering through a
tunnel — and already offer to POST the result to a URL of the player's
choosing. What they need from us is an endpoint.

What that buys, measured against a Capacitor build:

| | Tracker app | Capacitor build |
| --- | --- | --- |
| Work to first position | one endpoint | a second build, two store listings, two review queues |
| iOS background location | already solved, by people who maintain it | ours to get right and keep right |
| Cost to a player | install an app, scan a code | install *our* app |
| Cost when it breaks | they use a different tracker | a store release |

**What it costs is honest and worth stating.** A player has to install a second
app and point it at a URL. That is real friction, it is why §6 exists, and it is
why this is optional rather than the way tracking works. Push notifications also
remain undelivered — they genuinely do need the native shell, and nothing here
brings them closer.

**This is additional, not a replacement.** The web page keeps its own
`watchPosition`, keeps its own durable log, and keeps working exactly as it did.
A player who sets none of this up has lost nothing. What they gain by setting it
up is the case the browser cannot cover: a locked phone in a pocket, which is
where a hider's phone spends most of a round.

---

## 3. The token is scoped to a device, and it is not the game token

A ping arrives carrying a URL and nothing else — no header, because none of
these apps can send one. So the URL is the credential, and what it grants is the
question worth getting right.

**It is not `GameToken`.** That one is the bearer for Zero and for the ephemeral
socket, it lives ninety days, and it would be sitting in a third-party app's
settings screen and in every proxy log between a player's phone and here. The
tracking token is a separate row that grants exactly one verb — *write a
position for this device* — and, being a row rather than a signed claim, can be
revoked.

**It is scoped to a device, not to a game or a player.** A phone running OsmAnd
is reporting where *it* is, and that fact is equally true of every game the
phone is currently in. Scoping to a game would mean re-pasting a URL into a
tracker app at the start of every evening, which is precisely the friction that
makes an optional feature go unused.

Which removes a rule that looked necessary and is not: **there is no "which game
did this ping mean" question.** A ping is delivered to every non-`finished` game
the device has an active player row in. Nearly always that is one game;
occasionally, during a handover between sessions, it is two, and writing to both
is correct rather than a compromise.

`trackingToken` is one of two tables Drizzle owns and Zero does not mirror.
Zero's query context is a game and this belongs to a device, which outlives
every game it plays — the same argument m4-spec §7 makes for `mapTemplate`. It
is also a secret whose whole purpose is to not be the sync bearer, so putting it
on the sync stream would be an odd way of keeping it off one.

| Route | Auth | Purpose |
| --- | --- | --- |
| `GET /api/tracking` | game token, header | the device's current token and whether it has ever been used |
| `POST /api/tracking` | game token, header | issue, or rotate — which is the revoke button for a URL already pasted somewhere |
| `DELETE /api/tracking` | game token, header | turn it off |
| `ALL /api/track/:token` | the path segment | a ping |

Revoked rows are kept rather than deleted, so a tracker still pointed at an old
URL can be told it was turned off (`410`) rather than that it was never valid
(`404`). Those are different problems with different fixes, and the player
reads the answer in whichever log that app keeps.

---

## 4. One endpoint, most of the apps

The OsmAnd URL shape is a de-facto family rather than a standard, and one
handler covers it because the apps that use it let the *player* write the whole
URL — OsmAnd and GPSLogger both do — so they can be made to send whatever names
this server reads.

The names accepted are Traccar's, which is the nearest thing the family has to a
canonical set: `id`, `lat`, `lon`, `timestamp`, `speed`, `altitude`, `hdop`,
`heading`, `batt`, plus the obvious aliases. Unknown
parameters are ignored rather than rejected, exactly as Traccar's own server
does, so a URL that worked against Traccar works here. GET with query
parameters, POST with a form body and POST with JSON all land in the same place,
and query parameters are merged either way rather than making a client that
sends both choose.

Timestamps are accepted in all four spellings Traccar accepts — epoch seconds,
epoch milliseconds, ISO-8601, and `yyyy-MM-dd HH:mm:ss` read as UTC — because a
client configured against Traccar and then re-pointed here must not begin
failing over a date format. The seconds-or-milliseconds split is by magnitude:
`1e11` milliseconds is 1973 and `1e11` seconds is the year 5138, so nothing
plausible is ambiguous.

**OwnTracks gets its own parser** because its payload is JSON rather than query
parameters, and it is the one recommended by name because it configures itself
from a link (§6) — one tap or one scan against a URL pasted by hand.

**The endpoint alone is not a working configuration, and that is the failure
this feature is most likely to ship with.** OsmAnd and GPSLogger both accept a
bare URL without complaint and then send a request carrying no position at all,
which this server answers `400 no_position` while the player sees an empty map
and no explanation. Worse, the two do not share a placeholder syntax:

| App | What its settings screen needs |
| --- | --- |
| OsmAnd | `…?lat={0}&lon={1}&timestamp={2}&hdop={3}&altitude={4}&speed={5}` |
| GPSLogger | `…?lat=%LAT&lon=%LON&timestamp=%TIME&accuracy=%ACC` |
| OwnTracks | the bare endpoint — it posts JSON |
| Overland | the bare endpoint — it posts JSON |

So there is no single string the screen can offer, and §6 offers each app its
own, pre-filled, with a copy button apiece. `%ACC` is worth having: it is an
accuracy in metres, so GPSLogger can give the map a real radius where OsmAnd's
`hdop` cannot.

### Overland, which batches

Overland is the second app that works on an iPhone, and it is built on a
different assumption from the rest: it POSTs `{ locations: [GeoJSON Feature, …] }`,
up to two hundred points at a time, because it is designed to survive a day with
no signal and hand over everything at once.

**Every point in a batch is kept.** Taking only the newest would discard exactly
the trail the durable log exists to replay, and an upload arriving after a
tunnel is the case this whole feature is for. Presence gets the newest point
only, because presence holds one position per player by construction and
replaying a batch through it would be ninety-nine discarded writes and one that
counted. The batch is sorted oldest-first before either, so a live marker cannot
end up showing the point where somebody entered the tunnel.

Coordinates are GeoJSON order — `[lon, lat]` — which is the reverse of every
other client here. `horizontal_accuracy` is metres and `speed` is m/s, both
already the units stored.

**The response body is not a formality.** Overland retries a batch until it is
answered exactly `{"result":"ok"}`, and OwnTracks wants a JSON array; answering
either one the other's way means a phone re-uploading the same points forever.
The reply is chosen by which parser matched, because that is the only thing in
the request that knows who is asking.

**Traccar Client is not claimed as supported.** Its protocol is the one this
parser is modelled on, but its "Server URL" setting is documented only as
requiring a full URL, and whether it preserves a *path* — which is where this
scheme carries its token — is unverified. Rather than list an app that may
silently never work, it is left out until someone tests it against a real
device. The parser would accept it unchanged if the URL survives.

**Two fields are deliberately dropped.**

- **`hdop` is not accuracy.** It is a unitless dilution of precision describing
  satellite geometry, and there is no conversion to metres. A fix carrying only
  `hdop` gets `accuracyMeters: null`.
- **`heading` and `bearing` are course over ground**, and m2-spec §8 is explicit
  that heading is the compass or it is nothing, with no course-over-ground
  fallback. They are read and discarded.

`speed` is taken as metres per second, which is what OsmAnd sends. Traccar's own
decoder reads that field as knots for some hardware trackers; between the two
readings this one belongs to the app whose URL template we document, and speed
is displayed rather than acted on.

---

## 5. Where an external fix goes

**Both places the web path's fixes go, and for the same reasons.** This is a
second *source*, not a second policy.

- **Live presence**, always. A position is published for other people, and they
  want it whether or not its owner's screen is on.
- **The durable log**, only while a round is `hiding` or `seeking` — m2-spec §10
  unamended. The log is a replay artifact and replay does not want the lobby.

The server writing `positionSnapshot` rows directly is not a new kind of thing:
`open-game.ts`, `routes/games.ts` and `dev/spawn.ts` all insert through Drizzle,
Zero syncs from the replication stream, and `position.record` appends no event
row, so there is nothing else to mirror.

**A room still dies with its last socket, and that is right.** The room is a
fan-out buffer, not a record. What makes tearing it down survivable is that the
record exists elsewhere — including for the positions that arrived over the
webhook from a phone with no browser open at all.

**So `hello` hydrates an empty room from the log, for everybody.** Not only for
the player who reconnected first: a player coming back to a table of
externally-tracked teammates must not find an empty map and conclude the feature
is broken. Hydration runs once per room, because the second person through the
door is joining a room that already knows everything the log can tell it.
Players who have left get no marker, however recently seen (m2-spec §4), and a
battery level is never restored — one read out of the log is exactly the fourth
state m2-spec §7 refuses to have.

**A ping can create a presence entry for a player who has no socket.** That is
the entire point. Such an entry carries `online: false` alongside a fresh fix,
and that is not a contradiction: `online` has always meant "a socket is open",
and what this says is that the phone is out there reporting while its owner's
screen is dark. The two ages are independent and always were — `fixAgeMs` dates
the position and `lastSeenAgeMs` dates the contact — so a position last updated
sixty seconds ago still reads as sixty seconds even when the last ping was four.

Visibility needs no new rule. `visibleTo` filters fields at fan-out and does not
care where a fix came from, so m1-spec §9's matrix applies to external fixes
unchanged.

---

## 6. Asking for something optional

The setup screen has a harder job than most: it is asking a player to install a
second app, during a game, for a benefit they cannot see yet.

**It leads with who it is for, not with a disclaimer.** Amended 2026-09-20: an
earlier draft opened with the word *optional*, which is true and gives a player
nothing to act on. The first sentence names the case instead — a seeker's phone
spends most of a round in a pocket while their team is trying to stay
coordinated, and this is what keeps it on the map. Nothing here is required to
play and a player who backs out has lost nothing, because the browser keeps its
watch; but that is a reassurance, not an opening.

**Every app gets one block: its name, where in its settings the address goes,
the address itself, and a copy button.** Not one shared address and an
explanation of how to adapt it — §4's three syntaxes do not match, so a single
address would be wrong for two of the three, and the wrongness is silent. The
copy state is per app, so three buttons cannot all claim to have been pressed.

**OwnTracks leads, and gets one extra button**, because it configures itself
from a link: `owntracks:///config?inline=<base64>` carries endpoint, device id
and mode, so its setup is one tap with nothing to paste at all.

**There is deliberately no QR code**, and the reason is worth writing down
because the invite sheet has one and this screen was first built by copying it.
A QR points *somebody else's* phone at something — which is exactly what
inviting a player is. Setting up background tracking is not: the phone being
configured is the phone displaying the screen, and it cannot scan itself.

**The screen says the minimum.** It does not explain what the placeholders do,
why a bare endpoint fails, or that the address is a credential. A player pastes
what they are given; the interesting parts of that belong in this document.

**And it says when the URL cannot possibly work.** In development `serverUrl()`
is the page's own origin, so a developer looking at `https://localhost:5173`
sees a tracking URL naming their own laptop — which is the one address certain
to fail, because on the phone running the tracker app `localhost` is the phone.
The screen detects a loopback host and says so, rather than leaving someone to
diagnose it from a connection-reset line in a proxy log.

**The screen shows whether it worked.** All the actual configuration happens in
another app, so a live *"last ping 4 s ago"* is the only way a player finds out
that it took, and it is the difference between a feature people trust and a URL
they hope about. Before the first ping it says so plainly rather than looking
configured.

The age shown obeys §7 like everything else: the server measures it, the screen
adds the time since it read it, and no timestamp crosses a clock boundary.

### One app, chosen for the phone

**The catalogue is not the same on both platforms, and the differences are not
cosmetic.**

| App | iOS | Android | Installed from |
| --- | --- | --- | --- |
| OwnTracks | yes | yes | App Store / Play |
| Overland | yes | — | App Store |
| OsmAnd | — | yes | Play |
| GPSLogger | — | yes | **F-Droid** |

- **OsmAnd's online tracking is Android-only.** The Trip Recording plugin exists
  on iOS; the *Online tracking* setting inside it does not. Offering OsmAnd to
  an iPhone sends a player to install a 300 MB map app and then hunt for a
  settings screen that is not there.
- **GPSLogger has no iOS build at all**, and was removed from the Play Store in
  2020 — it lives on F-Droid, so a Play link would be a dead end. Every app
  therefore carries its own install link and its own label, rather than a store
  being inferred from the platform.
- **Overland is why iOS has a choice at all.** Without it the iPhone list is one
  app, and one app is not a list.

**The screen shows one app at a time.** Four sets of instructions is four
chances to follow the wrong one, and on a real phone at least one of them is for
an app that cannot do the job. A picker appears when more than one applies.

Platform comes from a new `device.platform()` on the platform adapter, because
it is a `navigator.userAgent` parse and that package is the only place permitted
to touch `navigator` (m0-spec §10). It answers `ios`, `android` or **`unknown`**,
and `unknown` shows *everything*: a desktop browser cannot say which phone is in
the player's hand, and a list with two spare entries is a far smaller failure
than an empty screen.

### Where it lives, and what it is attached to

**Background tracking is reached from the map's locate control, not from a
menu.** It is not a host act and not a setting: it is one of two answers to
"where is this phone, and who can see it", and it belongs next to the live
answer to that question rather than in a list of things the game has.

So the locate control now opens a **position sheet** instead of cycling the
camera directly, and the camera cycle is that sheet's primary action.

| | Before | Now |
| --- | --- | --- |
| Tap with a fix | camera cycles | sheet opens; its primary button cycles |
| Tap with no fix | a help sheet explaining why | the same explanation, as a section of the same sheet |
| Background tracking | lobby menu | a flow, from this sheet |

### The setup itself is a flow, not a sheet

Settled 2026-09-20, after three shapes were drawn: a checklist inside the
sheet, a flow of its own, and a status card with the setup material folded
under it. **The flow won**, and it is `/g/:code/tracking` with a screen per
step — the same `Screen` / `ScreenHeader` / `Stepper` frame as the create
wizard, because this is three decisions with an order and that is what every
other multi-step path in this app already looks like.

| Screen | Asks |
| --- | --- |
| `/tracking` | nothing — it reports. Where a player who set this up at lunchtime lands |
| `/tracking/app` | which app, as a door apiece. Apps this phone cannot use are absent |
| `/tracking/address` | nothing — it hands over the address, or opens OwnTracks |
| `/tracking/waiting` | nothing — it listens, and resolves itself when a ping lands |

What that costs is the map: navigating unmounts it, so the camera and any
half-drawn constraint go with it. That is the price of the frame, and it was
paid deliberately rather than by accident.

Four things the sheet did that the flow does differently:

- **The token is issued by the address screen**, the first screen where having
  one changes what is on it. The sheet issued it behind a button whose only
  visible effect was more instructions, which is a tap that appears to do
  nothing.
- **Where the address goes and the address itself are one raised card**, and
  it is the only thing on that screen a player has to act on. The address is
  shown whole and the box scrolls: an elided token would be a string nobody can
  check against what they pasted.
- **Which app this phone uses is remembered** in `localStorage`, device-scoped
  like the token it goes with: the same argument m15-spec §3 makes for scoping
  the token to a device, and the same argument the briefing-seen flag makes for
  not putting it in the schema.
- **Turning it off is behind the `⋯`**, in a sheet with a red button — the
  shape the lobby settled for leaving a game. It revokes a URL already pasted
  into another app, and that does not belong one tone away from Copy.

**The waiting screen resolves on a *fresh* ping, not on any ping**, and then
latches. A device can arrive carrying a token last heard from two hours ago,
and greeting that with "it's working" would be a claim about the present made
out of the past; equally, a tracker on a five-minute interval must not be able
to un-answer the question while somebody is reading it.

**The cost is a tap on the map's most-used control, and it is worth paying**
because there are now two sources and they fail independently. A player whose
browser is blocked but whose tracker is running is *visible to everybody else*
while their own map cannot centre — and the old control, which said only `?`,
would have sent them off to fix a thing that was not broken. The sheet names
both sources separately:

| State | What the player is told |
| --- | --- |
| both | both reporting; locking the screen changes nothing |
| browser | seen only while this page is open |
| tracker | others can see you; this map cannot centre on you |
| none | nobody can see you |

A tracker counts as reporting until its last ping passes m2-spec §5's
`AGEING_MS` — the same ten minutes past which the map already draws a position
as cold, rather than a second threshold that could disagree with the first.

**`GpsHelpSheet` is gone, folded in whole.** It was the *alternative* to the
control doing anything, which meant the screen explaining why there was no
position was unreachable the moment there was one. As a section it can sit
under the state it explains.

One consequence recorded rather than hidden: the sheet's scrim covers the map
until it has finished leaving, so a gesture aimed at the canvas immediately
after recentring is swallowed. m2-spec's acceptance 6 drags right after
recentring and now waits for the sheet to go first.

---

## 7. An age is measured where the fix was taken

m2-spec §5 diagnosed this correctly and then implemented half of it. Its own
words: **"The fix is to send an age instead of a timestamp."** What it built
was the server measuring the age at fan-out, from `receivedAt`.

That restores m0-spec §7's invariant — no two device clocks are compared — and
it under-reports every fix's age by the entire gap between capture and arrival:
GPS acquisition, the three-second send throttle, the two-second heartbeat, and a
queue that waited for signal. Small in the ordinary case. Not small at all for a
tracker app that buffered underground for ten minutes and then replayed, which
would have arrived reading as fresh.

**The capturing device measures its own fix's age and sends that.** Both terms
are its own clock, subtracted from itself — the only kind m0-spec §7 allows:

```
capturedAgeMs = Date.now() - fix.capturedAt        // the device, its own clock
fixAgeMs      = capturedAgeMs + (now - receivedAt) // + this machine's, its own
ageMs         = fixAgeMs + (now - entriesArrivedAt)// + the reader's, its own
```

Three elapsed durations, each measured on one clock, added. Nothing crosses.
`capturedAt` keeps its job in the durable log, where it orders replay and where
a batch flushed after ten minutes underground must not claim to have happened
when the signal returned.

**What this cannot see is the one-way network latency** from a device sending to
this machine receiving, because measuring it would require exactly the
subtraction being avoided. Tens of milliseconds, against a thirty-second first
bucket. It is a strictly smaller error than the one it replaces.

**External trackers force the exception.** The protocol carries an absolute
timestamp and no age, so `receivedAt - capturedAt` here is the one cross-clock
subtraction in the system. It is clamped at zero, because a phone running fast
would otherwise report a position from the future as fresher than fresh. There
is no alternative to it, and it is written down rather than hidden.

**One consequence to watch.** The heartbeat re-offers the held fix every two
seconds, and under the old arithmetic each re-offer reset the age — so a
stationary phone read as permanently fresh. It no longer does: it ages honestly
and eventually greys out. That is **correct rather than a regression**, and
§5 of m2-spec already has the state for it — *"online, stale — connected, but
the phone has not managed a fix"*. A phone whose browser has stopped producing
fixes genuinely is that; we do not know it has not moved. The heartbeat still
earns its keep, keeping `online` true and carrying the fix to newly-joined
readers. It just stops lying about when the fix was taken.

---

## 8. Broadcasting is no longer gated on the screen

m2-spec §10 says *"broadcasting follows the screen"*, refining m1-spec §9's
lobby rule, on the grounds that a player not looking at the map is not asking
where anyone is. **That reads the direction of the question backwards.**

A position is published for everyone *else*. The player who most needs to be on
the map is the one who has locked their phone and put it in a pocket, and they
are exactly the player the old rule silenced. The battery argument that
motivated it — a lobby draining 8% while the group argues about team names —
was never weighed against what it costs, and the cost is a hider nobody can see.

`roundRunning` in the implemented gate was already a partial admission: during a
running round it broadcast regardless of screen. This removes the other half.

| | Live broadcast | Durable log |
| --- | --- | --- |
| Lobby, map closed | **yes** | no |
| Map open, round `pending` | yes | no |
| Round `hiding` / `seeking`, any screen | yes | yes, on the interval |

**Logging still follows the round**, unchanged and for its original reason: the
log feeds M14's replay, and replay does not want twenty minutes of everybody
milling about a station concourse.

This amends m2-spec §10 and m2-spec acceptance 14, and supersedes m1-spec §9's
final paragraph. m1-spec §9's *visibility* rules — everyone is visible,
positions are not — are untouched.

---

## 9. Accuracy can be absent, and says so

`ClientFix.accuracyMeters` becomes `number | null`.

The OsmAnd protocol family offers `hdop` and no radius, and the choice is
between saying nothing about accuracy and saying something false. m2-spec §7
already made this choice for battery — *"a stale battery percentage is worse
than none: it gets acted on"* — and the same reasoning applies to a fabricated
±0 m. Every display drops the segment rather than printing a placeholder;
`positionLabel` already worked this way and now the type agrees with it.

`PositionSource` gains `external`: a real position from the player's phone whose
physical provenance is unknown, because `hdop` cannot distinguish GPS from
network. It is not inferred to be `gps` on the grounds that tracker apps usually
use GPS.

**Battery is deliberately not ingested.** OwnTracks' `batt` is a percentage,
OsmAnd's `batproc` is a percentage, and Traccar's `batt` is volts on some
hardware. Rendering 11.43 V as 11% is exactly the kind of wrong number m2-spec
§7 refuses, and the feature is not worth the branch until someone wants it.

Both are type-level changes: `fix` is a `jsonb` column, so no migration.

---

## 10. Deferred

- **Battery from a tracker app** (§9). Ambiguous units, low value — though
  Overland's `battery_level` is unambiguous (0–1) and would be the one to start
  with if this is ever wanted.
- **Altitude.** Every one of these apps sends it; nothing in the game reads it.
- **A freshness guard on buffered replays.** It was going to be necessary and
  §7 removed the need: with ages measured at capture, a point buffered for ten
  minutes reports as ten minutes old and greys out on its own.
- **Push notifications**, which still need the native shell (§2).
- **The rest of M15** — offline queueing, low-power mode, one-handed layout.

---

## 11. Acceptance

1. **A ping with only `lat` and `lon` is accepted**, and one with neither is
   refused with a 400 (§4).
2. **All four timestamp spellings produce the same instant**, and an
   unparseable one falls back to arrival rather than to 1970 (§4).
3. **`hdop` never becomes a radius.** A fix carrying only `hdop` has
   `accuracyMeters: null` and the map draws no ring and prints no number (§4, §9).
4. **OwnTracks' `acc` does become a radius**, and its `vel` is converted from
   km/h to m/s (§4).
5. **`heading` is discarded** whatever the tracker sends, because it is course
   over ground (§4, m2-spec §8).
6. **A ping reaches every live game the device is in**, and no finished one (§3).
7. **A ping creates a presence entry for a player with no socket**, carrying
   `online: false` and a fresh `fixAgeMs` (§5).
8. **A revoked token answers 410 and an unknown token 404** (§3).
9. **An empty room hydrates every player from the log, not only the connecting
   one** (§5).
10. **A tracker's positions land in the durable log only while a round runs**,
    matching the web path exactly (§5).
11. **A phone whose clock is ten minutes fast still reports honest ages over the
    socket**, because it measures its own fix's age rather than handing over a
    timestamp (§7). This completes m2-spec §5 rather than amending it.
12. **A stationary phone's marker ages.** The regression guard for §7's
    consequence, and the deliberate reversal of the heartbeat's age reset.
13. **The lobby broadcasts.** m2-spec acceptance 14 is amended (§8).
14. **The durable log does not broadcast in the lobby** — the other half of 13,
    and the half that did not change.
15. **The setup flow names who it is for before it names anything else**, and
    shows whether a ping has ever arrived (§6).
16. **Turning tracking off stops an app already configured** on the next ping
    (§3).
17. **Each app gets its own pre-filled URL, and the bare endpoint is never
    offered as one.** OsmAnd's `{0}` template and GPSLogger's `%LAT` template
    are different strings, and an endpoint with neither is the silent failure
    this screen exists to prevent (§4, §6).
18. **The locate control reports both sources separately**, and a browser with
    no fix beside a tracker that is reporting reads as "tracker only" rather
    than as no position (§6). This amends m2-spec's locate behaviour: the
    control opens a sheet and the camera cycle is that sheet's primary action.
19. **The sheet says when the tracking URL names a loopback host** (§6), which
    in development it always does.
20. **An Overland batch lands whole in the log and as one point in presence**,
    oldest-first, with GeoJSON `[lon, lat]` read the right way round (§4).
21. **Overland is answered `{"result":"ok"}` and OwnTracks an array**, because
    the wrong reply makes either one re-upload forever (§4).
22. **An iPhone is not offered OsmAnd or GPSLogger**, and an unknown platform is
    offered everything rather than nothing (§6).
23. **Every app carries its own install link**, because GPSLogger is not on the
    Play Store and a store cannot be inferred from the platform (§6).
24. **A player who has set this up lands on the status screen, not on step one**
    (§6). Which app this phone uses survives a reload.
25. **The waiting screen does not resolve on a stale ping**, and does not
    un-resolve once a fresh one has landed (§6).
