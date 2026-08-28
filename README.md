# zero-lag

A companion app for *Jet Lag: The Game — Hide + Seek*. Multiplayer, local-first,
n seeker teams against m hider teams, one to three players per team.

- [build-plan.md](build-plan.md) — what gets built, milestone by milestone
- [m0-spec.md](m0-spec.md) — the contracts every later milestone inherits
- [m1-spec.md](m1-spec.md) — teams and the lobby
- [m2-spec.md](m2-spec.md) — the live map and visibility rules
- [m3-spec.md](m3-spec.md) — the map toolkit
- [m4-spec.md](m4-spec.md) — the game area builder
- [m5-spec.md](m5-spec.md) — the game lifecycle

**Status: M3.** M0 built the contracts — sync topology, the event log,
first-to-the-server-wins, the constraint engine with radar as its proof, the
platform adapter, the area pack format. M1 spent them on the lobby. M2 puts a
coordinate on a screen: everyone in a game can always see who is playing, and
only some people can see where. M3 turns those coordinates into tools: local
geodesic measurement, offline area-pack search, team-private pins and suspected
search zones, coordinate copy, rotation, tilt, and 3D buildings.

Pins and search zones are durable, optimistic team-authored state. Measurements
remain entirely local and produce no row, event, or socket frame.

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

Postgres and `zero-cache` come up in Docker; the app runs on the host.
`npm run zero:start` points `zero-cache` at `http://host.docker.internal:3000`
so it can call back to that host server. Full-stack Compose (`npm run docker:up`)
keeps the in-network default of `http://server:3000`.

```bash
npm install
```

```bash
npm run db:migrate
```

That applies the migrations in `packages/schema/src/migrations` and, on an
empty database, creates the whole schema from them. **Not `db:push`** — see
[AGENTS.md](AGENTS.md#database).

```bash
npm run zero:start
```

```bash
npm run dev
```

The web app is on `https://localhost:5173`, the server on `:3000`, `zero-cache`
on `:4848`. Give `zero-cache` a minute on a cold replica — initial sync is slow
the first time and instant afterwards.

### Testing on a phone

`http://localhost` is a secure context; `http://192.168.x.x` on a phone is not,
so `crypto.randomUUID()` (and geolocation, and the PWA) fail there. The Vite
dev server therefore speaks HTTPS by default. Open `https://<lan-ip>:5173` on
the phone, same Wi-Fi. The first `npm run dev` may ask for the Mac password —
it installs a local CA and downloads `mkcert`. `HTTPS=0 npm run dev` turns
that off.

The phone has to trust that CA once, or the browser will warn and some APIs
stay blocked. The file is `rootCA.pem` in the directory printed by
`mkcert -CAROOT`.

- **iOS:** install the profile, then Settings → General → About → Certificate
  Trust Settings → enable full trust.
- **Android:** Settings → Security → install a CA certificate; open the app in
  Chrome.

Allow Node through the macOS firewall if prompted.

A public URL without installing a CA: `cloudflared tunnel --url https://localhost:5173`
and open the `*.trycloudflare.com` address. Vite proxies `/api` and Zero
through the page origin either way.

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

Each milestone's spec file is its definition of done. The checked-in Playwright
suites cover M0 through M2; M3's pure geometry, parsing, search, and schema
contracts are covered by the unit suites. Acceptance tests need the stack up
first, then:

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
