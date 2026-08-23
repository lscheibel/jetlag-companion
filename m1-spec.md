# M1 — Teams and Lobby — Technical Specification

The first milestone with a real screen. A group configures itself into the exact team structure it wants, and every device agrees on the result.

Companion to [build-plan.md](build-plan.md) and [m0-spec.md](m0-spec.md). Where they disagree, the build plan owns _what_, m0-spec owns the contracts, and this document owns _how M1 uses them_.

---

## 1. Scope

M0 proved the contracts with a harness. M1 spends them on the first thing a player actually sees.

**In scope**

- Create, join by code, join by link, join by QR
- Teams: name, colour, emoji — created, renamed, recoloured, deleted
- Membership: join, leave, move, and a host moving somebody else
- Roles: _n_ seeker teams × _m_ hider teams, assigned in the lobby
- Host as a hat any player can put on, and removing a player
- The lobby overview: every team, every member, who is online
- Presence, which turns out to have been filtering the wrong thing

**Explicitly out of scope**

- House rules (M5)
- Starting a round (M5). M1 assigns roles; it does not begin play
- Any map, any question, any card
- Avatars, profile pictures, chat (M7)

**The guardrail.** M1 amends exactly one M0 contract — the presence visibility rule, §9 — and otherwise adds three columns, one status value and one index. It also corrects two outright bugs (§5, §9). If M1 finds itself redesigning role resolution or the event log, it has strayed.

---

## 2. Schema deltas

The whole of M1's data model change, in one place.

```ts
// round.status widens by one value
type RoundStatus = "pending" | "hiding" | "seeking" | "ended";

player: {
  // …M0 columns unchanged
  isHost: boolean;                   // seeded true for the creator; §6
  leftAt: number | null;             // set on leave and on removal
  removedByPlayerId: string | null;  // set only on removal — the difference matters, §7
}

team: {
  // …M0 columns unchanged
  createdAt: number;                 // stable ordering that a rename does not disturb
}

game: {
  // hostPlayerId is renamed createdByPlayerId — see §6
}
```

```ts
// teamMember: the index on playerId becomes UNIQUE
uniqueIndex("teamMember_player_idx").on(table.playerId);
```

`EVENT_TYPES` gains `player.removed`, `team.deleted` and `host.changed`, and loses `host.transferred` — declared in M0 and never once emitted, so replacing it costs nothing and no version bump is owed. Three more that M0 declared and never emitted finally fire: `team.updated`, `player.left`, `round.rolesAssigned`.

Both schemas change together, and `packages/schema/src/schema.test.ts` is what proves they did.

`queries.teams()` re-orders by `createdAt` rather than `name`. M0 ordered by name purely so that "the first team" meant the same thing on every device; `createdAt` keeps that determinism without making a rename shuffle the lobby under someone's thumb.

`game.status` gains no new value and `"draft"` stays unused — it is there for M4, where a game can exist before its map does.

---

## 3. Roles before there is a round

This is M1's one real design decision, and it is a decision about not undoing M0's.

The build plan puts _"n seeker teams × m hider teams"_ in M1, so roles must be assignable in the lobby. m0-spec §4 says role is a property of a round and never of a team, because hiders and seekers swap between rounds. In the lobby there is no round. Something has to give.

**A team never gets a role column.** That column is precisely what m0-spec spent a section refusing, and adding it "just for the lobby" would mean two sources of role truth from the day the second round exists.

**Instead, the round exists earlier.** `POST /api/games` creates round 1 alongside the map config, with `status: "pending"`. The lobby assigns roles by writing `roundTeamRole` rows for that round — the same table, the same shape, the same mutator that M5 will use to swap roles for round 2.

```ts
round: {
  id, gameId,
  ordinal: 1,
  status: "pending",
  hidingDurationMs: 30 * 60_000,   // a default; M5 lets the host set it
  hidingStartedAt: null, seekingStartedAt: null, endedAt: null,
}
```

Consequences, all of them good:

- The lobby never special-cases "no round yet". There is always exactly one round to assign into.
- `useMyRole` works unchanged: it takes the highest-ordinal round that has not ended, and `pending` is not ended.
- Assigning roles in the lobby and swapping them between rounds are literally the same write.
- A team with no `roundTeamRole` row has `role: null`, which every consumer already handles.

And one consequence that is a trap, stated here because it is the kind of thing that ships silently:

> **A role existing is not the same as a round running.** Anything gated on role must also ask whether play has started.

In the lobby every team may already know it is a hider team, and none of what that implies has begun. The gate is `round.status === "hiding" | "seeking"`, never "a role is set" — and it belongs on anything that lets a team _act_ on its role: the question controls, M5's zone commitment, M12's found flow. It is deliberately **not** on presence: §9 is a rule about positions, and it is the same rule in the lobby as in a round.

**Balance is displayed, not enforced.** A lobby with no hider team, or with three players on one team and one on another, gets an advisory line — _"no hider team yet"_ — and nothing more. M5's round controls warn rather than block for the same reason.

---

## 4. Team identity

A team is a name, a colour and an emoji, and it is always all three at once.

```ts
const TEAM_COLORS = [ /* 8 swatches */ ];
const TEAM_EMOJI  = [ /* a curated set */ ];
```

The palette is chosen for a phone screen in direct sun and for the common colour-vision deficiencies — which is to say it is short, high-contrast, and not a colour wheel. Emoji come from a curated list rather than the system picker: a skin-tone-modified family emoji at 16px on a map marker is not a team identity.

**Colour is never the only channel.** Name, emoji and colour travel together everywhere a team is rendered, and there is exactly one component that renders a team:

```tsx
<TeamBadge team={team} />   // emoji · name · colour, in that order of legibility
```

One component, because M2's map markers, M7's thread headers and M13's hider selector will all render a team, and three hand-rolled versions will drift into one of them dropping the emoji on the day someone plays in gloves and sunglasses.

**Duplicate colours are prevented by the picker and not by the server.** A swatch already used in this game is shown as taken and cannot be selected, and if duplicates arise anyway the lobby says so. The mutator does not reject them: a duplicate colour is ugly rather than broken, and a rejection here would be this app's first refusal of a harmless action. Same for emoji.

**A team's own members edit its name, colour and emoji.** Not the host — the team. How a team presents itself is the team's business, and there is no reason for four people to queue behind one person to change an emoji. Creating and deleting teams is a different matter and belongs to the host (§6), because how many teams exist is a property of the game rather than of anyone's presentation.

**Deleting a team is a lobby-only operation.** The mutator rejects with `game_state_invalid` once any round has left `pending`, because `question`, `constraint`, `hidingCommitment` and `positionSnapshot` all carry a `teamId` and the event log names teams that must still resolve. Inside the lobby it is safe, and the mutator does the whole thing in one transaction: every member is moved out (a `team.memberLeft` each), the pending round's `roundTeamRole` row is dropped, then `team.deleted`.

---

## 5. One player, one team

**M0 has a bug here, and M1 is where it gets fixed.** `team.join` upserts a `teamMember` row and does not remove the player's existing membership. A player who joins a second team is in both; `useMyRole` does `teams.find(team => team.members.some(…))` and silently picks whichever comes first in a name-ordered list. The symptom — a player who is a seeker on one device and a hider on another — reads as a sync bug for as long as it takes someone to look at the `teamMember` table.

Two changes, and the second is what makes the first true:

1. **Joining is a move.** The mutator deletes the player's existing membership in this game and inserts the new one, in one transaction, emitting `team.memberLeft` then `team.memberJoined`. Two events with consecutive `seq`, because that is what happened.
2. **`teamMember.playerId` becomes UNIQUE.** A `player` row belongs to exactly one game, so a unique index on `playerId` says precisely "one team per player per game" with no composite key and no gameId denormalised onto the membership.

Delete before insert, inside the transaction, or the index rejects the move that the index exists to protect.

---

## 6. Host is a hat, not a rank

> **The host role exists because some players are new to the game, not because anyone needs authority over anyone.**

That sentence decides everything in this section. The host is whoever is driving setup and knows how the game goes. Once a round is running the game barely cares who they were.

**Any player can take the host hat, and more than one can wear it.**

```ts
player.isHost: boolean   // seeded true for whoever created the game
```

- `game.claimHost` and `game.releaseHost` are self-scoped and gated by nothing at all. Two people setting up a lobby together is a normal Tuesday, not a conflict.
- Multiple hosts are allowed, so there is no transfer, no hand-off, no "are you sure", and no approval step.
- A lobby can end up with **zero** hosts — the last one steps down, or their phone dies. That is fine and self-healing: the lobby shows _"nobody is host — take it?"_ and any player taps it. The UI has to handle zero hosts anyway, because a dead phone was never going to ask permission first.

This is why there is no section here about the host disappearing. There is nothing to recover from.

**`game.hostPlayerId` is renamed `createdByPlayerId`.** It records who created the game, it never changes, and it seeds the first `isHost`. Nothing reads it for authorization — that is `player.isHost` — and leaving two columns both called "host" that mean different things is how a later milestone checks the wrong one. The column is written at creation and read nowhere in M0, so the rename is free today and expensive never.

### What the hat is actually for

**Host-only is exactly the set of actions that change the shape of the game** — how many teams there are, who is on which side, who is in the game at all. Everything about how you or your team present yourselves is yours.

| Mutator                              | Who                                     |
| ------------------------------------ | --------------------------------------- |
| `game.claimHost` · `game.releaseHost` | anyone, for themselves                 |
| `player.rename({ playerId?… })`      | self always; another player, host only   |
| `team.leave`                         | self always                              |
| `team.join({ teamId, playerId? })`   | self always; another player, host only   |
| `team.update`                        | any member of **that** team              |
| `team.create` · `team.delete`        | host only — team count is gameplay       |
| `round.assignRoles`                  | host only — roles are gameplay           |
| `player.remove` · `player.readmit`   | host only                                |

Adding an optional `playerId` to `player.rename` and `team.join` is a compatible argument change and keeps one mutator per concept rather than a `renameOther` twin of everything.

Checks read `player.isHost` (or, for `team.update`, the caller's `teamMember` row) inside the transaction and reject with `{ code: "not_permitted", reason }` — the `MutationRejection` shape M0 already defined.

> Per the build plan's second principle, none of this is a security boundary. It keeps a stale client honest and it keeps two people from editing the same lobby at cross purposes. Nothing here should be designed as though a participant were an adversary — a rejection means somebody's screen was out of date, which is the only case worth catching.

**Client-side checks live in one hook**, `useIsHost()`, for the same reason `TeamBadge` exists.

---

## 7. Leaving, being removed, and coming back

**Player rows are never deleted.** `event.actorPlayerId`, `answer.answeringPlayerId` and `positionSnapshot.playerId` all point at them, and M14 replays a game with names attached. Departure is a column.

| Action                | `leftAt` | `removedByPlayerId` | Event            |
| --------------------- | -------- | ------------------- | ---------------- |
| Player leaves         | set      | null                | `player.left`    |
| Host removes a player | set      | the host's id       | `player.removed` |
| Host re-admits        | cleared  | cleared             | `player.joined` with `payload.readmitted: true` |

Either way the player's `teamMember` row goes in the same transaction, so the lobby shows the truth immediately.

**Rejoining depends on which of the two it was**, and this is the part worth deciding rather than discovering. m0-spec's join endpoint returns the _same_ player for a known `deviceId`, which is what makes a force-quit phone rejoin as itself:

- **Left voluntarily** → rejoin succeeds and clears `leftAt`. People close apps by accident, walk into tunnels, and hand phones to friends. This must be frictionless.
- **Removed by a host** → `POST /api/games/join` returns `403 removed_from_game`, and the client says so plainly.

The 403 exists because a kick button that a phone can undo by tapping "join" one second later is a button that lies, and a lying button is worse than no button. It is emphatically not enforcement: a removed player who genuinely wants back in can clear their device id and join under a new name, and that is fine. We are not defending against participants — we are making the host's action mean something to a cooperating device.

Re-admission is a host tap on a "removed" section of the lobby.

---

## 8. Getting people into the game

Three doors, one code.

```
/                 create, or join by typing a code
/j/:code          join with the code prefilled — the link and QR target
/g/:code          the lobby
/g/:code/debug    the M0 harness, retained per m0-spec decision 4
```

The lobby's share panel shows the code at a size readable across a train carriage, a **Copy link** button, and a QR code. Codes are the unambiguous six-character alphabet from m0-spec decision 3 and are matched case-insensitively — the endpoint already uppercases.

**Sharing is not a host action.** Anyone in the lobby can show the QR or send the link. The person whose phone is nearest the newcomer is the one who should be doing it, and that is rarely the host.

**The QR is rendered locally, from a library, with no network call.** A game is set up in a station hall, a basement bar, or a car park with one bar of signal; a QR that is an `<img>` pointing at a third-party generator is a QR that fails in exactly the places this app is for. It also means the code never leaves the device to reach a stranger's server.

This closes an M0 feature the harness only half-delivered: joining by QR was listed there and never built.

---

## 9. Presence: everyone is visible, positions are not

**M0 filtered the wrong thing, and the bug is bigger than it first looked.**

`visibleTo()` in `apps/server/src/ephemeral.ts` drops whole `PresenceEntry` objects:

```ts
// A seeker — and anyone with no role yet — sees only their own team.
if (connection.teamId !== null && entry.teamId === connection.teamId) …
```

So a seeker cannot see that the hiders exist, and in a lobby — where nobody has a role — everyone sees only their own team and an unteamed player sees nobody at all. Five phones in a lobby show one.

That is not a stricter reading of the visibility matrix; it is a different rule. m0-spec §8 has been amended, and the correct one is:

> **Everyone in a game can always see everyone else. What is secret is where they are.**

Seekers know exactly who is hiding — they ask them questions, read their answers, and eventually go and find them. Hiding identity was never the game. The filter therefore applies to **fields, not entries**:

| Field                              | Who receives it                                        |
| ---------------------------------- | ------------------------------------------------------ |
| `playerId` · `displayName` · `teamId` · `role` · `onlineSince` | everyone in the game, always |
| `fix` · `battery`                  | own team always; **hiders** additionally receive every other team's |

Which means, stated the way it will be argued about in a review:

- a **seeker** sees the position of their own team and of nobody else — not the hiders, and not the other seeker teams
- a **hider** sees every position in the game
- a player **on no team yet** sees every entry, and no position but their own
- all of that is true in the lobby and in a running round alike — there is no round-state precondition, because there is no moment at which a seeker may see a hider's coordinates

`battery` follows `fix` rather than identity because it is a teammate-and-hider affordance (build plan, M2) and because how a seeker team's phones are holding up is information about a seeker team.

The implementation gets simpler: `visibleTo` stops choosing entries and starts blanking two fields, so the roster and the map are fed by the same stream and cannot disagree about who is playing.

**The lobby does not track position.** It subscribes for identity, online-ness and battery, and does not start the location watch or the position log; both belong to a round that has started. A lobby that quietly drains 8% of everyone's battery while the group decides on team names is a bad first impression and an avoidable one.

m0-spec's acceptance test 6 — _a seeker context receives no hider coordinates, asserted on the socket frames_ — is unchanged and still passes. It was always about coordinates.

---

## 10. Events

Every mutator writes state rows **and** an event row in one transaction — m0-spec §6, no exceptions, and a state write with no event is a defect at review.

| Type                  | New? | Payload                                          |
| --------------------- | ---- | ------------------------------------------------ |
| `team.created`        |      | `{ name, color, emoji }`                         |
| `team.updated`        | ▲    | `{ name?, color?, emoji? }` — changed fields only |
| `team.deleted`        | ●    | `{ teamId, name }`                               |
| `team.memberJoined`   |      | `{ }` — actor and team are columns               |
| `team.memberLeft`     |      | `{ }`                                            |
| `player.renamed`      |      | `{ displayName }`, plus `{ playerId }` when a host renamed somebody else |
| `player.left`         | ▲    | `{ }`                                            |
| `player.removed`      | ●    | `{ playerId }` — actor is the host               |
| `player.joined`       |      | `{ displayName, readmitted?: true }`             |
| `host.changed`        | ●    | `{ playerId, isHost }`                           |
| `round.rolesAssigned` | ▲    | `{ roundId, roles: [{ teamId, role }] }` — the full set, every time |

● added to `EVENT_TYPES` · ▲ declared in M0, first emitted here · `host.transferred` is removed (§2)

`round.rolesAssigned` carries the complete assignment rather than a delta, so a replay reader never has to accumulate to know the state of the board. It fires on every change, including the one that unassigns a team.

A team move is `team.memberLeft` immediately followed by `team.memberJoined` (§5). Two events, one transaction, consecutive `seq`.

---

## 11. Routes and UI shape

React Router in SPA mode, per the project's existing setup. Navigation via `useNavigate` / `redirect`, never `window.location`; route exports typed from `./+types/<route-name>`.

The lobby splits at its natural boundaries, and no lower:

```
LobbyRoute            token, game id, redirect if absent
  ShareCard           code, copy link, QR — available to everyone
  RosterPanel
    TeamCard          one team — TeamBadge, members, join/leave, edit if a member
      PlayerRow       name, online dot, host badge, kick
    UnassignedList    players in no team yet
  RolePanel           per-team seeker/hider, host only; balance advisory
  HostBanner          "nobody is host — take it?" when the game has none
```

`useIsHost()` and `TeamBadge` are the two pieces every one of those touches, and they exist once each.

**Field-hostile from the first screen**, per the build plan's eighth principle: 44px minimum targets, the join code and team names at a size that survives glare, no information carried by colour alone, and every list readable with a thumb while walking. The lobby is used standing on a platform, not sitting down.

State follows the repo's React rules — derived rather than synced, discriminated unions for anything with modes, `useEffect` only for the ephemeral socket subscription, which is the one genuine external system on this screen.

---

## 12. Testing

**Unit, in `packages/schema`:** the move invariant (joining while in a team leaves exactly one membership), the permission guard on each gated mutator, and the schema drift test extended over the new columns, the widened enum and the unique index.

**Playwright acceptance.** Five browser contexts, one per phone. Each of these is a spec, and M1 is done when they pass.

1. Five contexts join one game by code. The host creates three seeker teams and two hider teams with distinct colours and emoji, assigns everyone, and all five contexts render the same roster in the same order.
2. A player switches teams. Every other context reflects it without a reload, and the database holds exactly one `teamMember` row for that player.
3. A non-host member renames their own team and changes its colour; every context sees it. A player who is not on that team is rejected with `not_permitted`, as is a non-host attempting `team.create`.
4. A second player claims host while the first is still host; both have host controls; the first releases it and keeps playing normally. With no hosts left, any context can claim it back.
5. Removal: a host removes a player; that device shows the removal; rejoining with the same code and device is refused with `403 removed_from_game`; after re-admission the same rejoin succeeds.
6. Voluntary leave: a player leaves and rejoins with no host action, and comes back as the same player with their team membership gone.
7. Lobby presence: five contexts each receive five entries — including contexts on different teams and a context on no team — asserted on the socket frames, the way m0-spec test 6 is.
8. Running-round presence: with a round in `seeking`, a seeker context receives an entry for every player and a `fix` for nobody outside its own team; a hider context receives a `fix` for everyone.
9. A join link shared from a non-host device works.
10. The M0 suite still passes unchanged, with role assignment now flowing through the pending round.

Tests 7 and 8 together are the regression guard for §9 — one proves the roster is not filtered, the other proves the coordinates are — and test 10 proves §3 did not quietly reshape role resolution.

---

## 13. Decisions taken

1. **Roles live on a `pending` round 1**, created with the game, rather than on a team (§3).
2. **`teamMember.playerId` is UNIQUE**, and joining a team is a move rather than an addition (§5).
3. **Host is a self-service hat and more than one player can wear it** (§6). No transfer, no approval, and no recovery story needed when a host's phone dies.
4. **`game.hostPlayerId` becomes `createdByPlayerId`**; authorization reads `player.isHost` (§6).
5. **Host-only is exactly what changes the shape of the game** — team count, role assignment, membership of the game. A team's own name, colour and emoji belong to its members (§4, §6).
6. **Departure is a column, never a delete.** Voluntary leave permits rejoin; removal refuses it until a host re-admits (§7).
7. **Presence filters fields, not entries.** Everyone sees everyone; only `fix` and `battery` are scoped, and the scoping has no round-state precondition (§9). This amends m0-spec §8.
8. **Sharing the game is not a host action** (§8), and the QR is rendered on-device.
9. **Teams are ordered by `createdAt`**, so a rename does not reorder the lobby (§2).
10. **The palette is Okabe–Ito**, seven chromatic swatches plus a neutral (§4). Chosen because it stays distinguishable under deuteranopia, protanopia and tritanopia rather than because it is pretty, and acceptable at that size only because `TeamBadge` never lets colour carry meaning alone.

### Settled during implementation

Three things the spec assumed and the code did not have. All three were M0's, and all three were invisible until an M1 test asked for them.

1. **A screen that can write needs the `game` row synced.** Every mutator calls `appendEvent`, which allocates `seq` from `game.eventSeq` — so the `/g/:code` layout subscribes to `queries.game()` for every screen beneath it. Without that, a lobby's first optimistic write refuses itself with `game_state_invalid` and the cause reads as a permissions problem.
2. **One socket's messages are handled in the order they arrived.** `handleMessage` awaits, and firing each frame straight into the event loop let a `pos` overtake the `hello` that registers its connection — so the position was dropped, silently, exactly once per session. m0-spec §8's ordering guarantee was a property of the wire that this side was not preserving.
3. **A stationary phone still has a position.** `watchPosition` may fire once and never again, so the live channel is now seeded by a one-shot read and re-announces on connect. A device standing still on a platform reported no position at all — during the hiding phase, when standing still is the entire plan.

### Still open

- **Whether `player.isHost` should gate M5's round controls too.** M1 has no action that starts or ends anything, so the question does not arise yet. The likely answer is yes for starting a round and no for pausing one — a team that needs to stop should not have to find the host — but that belongs in M5 with the rest of the lifecycle.
- **Leaving a game with no signal.** `player.leave` waits for the server before the session is cleared, because you have not left a lobby that does not know you have. Underground that leaves the button reading _"Leaving…"_ until the signal returns, which is honest but not obviously good. M2 owns what an offline-first screen does with a write it cannot complete.
