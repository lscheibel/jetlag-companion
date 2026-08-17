# zero-lag

A companion app for *Jet Lag: The Game — Hide + Seek*. Multiplayer, local-first,
n seeker teams against m hider teams, one to three players per team.

- [build-plan.md](build-plan.md) — what gets built, milestone by milestone
- [m0-spec.md](m0-spec.md) — the contracts every later milestone inherits
- [m1-spec.md](m1-spec.md) — teams and the lobby
- [m2-spec.md](m2-spec.md) — the live map and visibility rules
- [m3-spec.md](m3-spec.md) — the map toolkit *(specified, not built)*

**Status: M2.** M0 built the contracts — sync topology, the event log,
first-to-the-server-wins, the constraint engine with radar as its proof, the
platform adapter, the area pack format. M1 spent them on the lobby. M2 puts a
coordinate on a screen: everyone in a game can always see who is playing, and
only some people can see where. A disconnected phone goes visibly stale rather
than silently missing, and a hider who does not want to watch the search closing
in can switch it off.

M2 adds no Postgres column and no event type. It is a rendering milestone that
amends the ephemeral channel twice and adds one platform capability.

```
/                 create a game, or join by typing a code
/j/:code          join by link or QR
/g/:code          the lobby
/g/:code/map      the live map
/g/:code/debug    the M0 harness, kept
```

The map is MapLibre GL JS over [OpenFreeMap](https://openfreemap.org)'s public
instance — no key, no registration, no request ceiling, nothing to host. **No
tile caching, at any milestone**: a tunnel lasts two stops, and the things that
genuinely cannot be recreated already survive it. The map is blank while offline
and comes back with the signal.

## Layout

```
apps/web            PWA — React Router in SPA mode
apps/server         Hono: Zero's query and mutate endpoints, joining, ephemeral WS
packages/schema     Drizzle DDL, the Zero schema derived from it, queries, mutators
packages/rules      PURE. Constraint definitions and question semantics
packages/geo        Boolean ops, geodesics, snapping, simplification — all in WGS84
packages/platform   PlatformAdapter interface + web implementation
packages/area-packs Pack format, validation, Berlin/VBB fixture
e2e                 Playwright — one acceptance suite per milestone
infra/docker        Compose for postgres + zero-cache + server + web
```

Two boundaries are enforced by lint rather than by convention: `packages/rules`
imports nothing but `packages/geo`, and browser capability APIs (`navigator.*`,
`Notification`) are reachable only from `packages/platform`.

## Running it

Postgres and `zero-cache` come up in Docker; the app runs on the host. The
`APP_ORIGIN` override is what lets `zero-cache`, inside the container, call back
to a server running outside it.

```bash
npm install
```

```bash
npm run db:push
```

```bash
APP_ORIGIN=http://host.docker.internal:3000 npm run zero:start
```

```bash
npm run dev
```

The web app is on `http://localhost:5173`, the server on `:3000`, `zero-cache`
on `:4848`. Give `zero-cache` a minute on a cold replica — initial sync is slow
the first time and instant afterwards.

## Checks

```bash
npm run test
```

```bash
npm run check-types
```

```bash
npm run check
```

The unit layer is dense where it is cheap: `packages/geo` and `packages/rules`
carry property tests for the invariant that `satisfies` and `applyConstraint`
are two readings of one definition, for the fold commuting, and for geometry
being byte-identical across evaluations.

## Acceptance tests

Each milestone's spec file is its definition of done: seven cases in
`e2e/tests/m0.spec.ts`, nine in `m1.spec.ts`, twelve in `m2.spec.ts`. They need
the stack up first, then:

```bash
npm run test:e2e
```

Playwright starts the server and web dev servers itself, and reuses them if they
are already running.

**The suite never calls OpenFreeMap.** Every phone intercepts the tile host
unconditionally and nothing reaches it: the service is free, keyless and
uncapped, and putting a run's worth of load on it every time somebody types
`npm run test:e2e` buys no information. The stub still declares a vector source,
so the map goes on to request tiles and the suite can check that the tile worker
is alive without a byte leaving the machine. The whole suite runs offline.

## Deployment

```bash
docker compose -f infra/docker/docker-compose.yml up -d --build
```

`zero-cache` needs a direct Postgres connection — no pgbouncer — and must not be
exposed publicly.
