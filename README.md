# zero-lag

A companion app for *Jet Lag: The Game — Hide + Seek*. Multiplayer, local-first,
n seeker teams against m hider teams, one to three players per team.

- [build-plan.md](build-plan.md) — what gets built, milestone by milestone
- [m0-spec.md](m0-spec.md) — the contracts every later milestone inherits
- [m1-spec.md](m1-spec.md) — teams and the lobby

**Status: M1.** M0's contracts are real in code — sync topology, the event log,
first-to-the-server-wins, the constraint engine with radar as its proof, the
platform adapter, the area pack format — and M1 spends them on the first screen
a player actually sees: create or join a game, build the teams you want, take
the sides you want. There is no map screen and only one question type, on
purpose.

```
/                 create a game, or join by typing a code
/j/:code          join by link or QR
/g/:code          the lobby
/g/:code/debug    the M0 harness, kept
```

## Layout

```
apps/web            PWA — React Router in SPA mode
apps/server         Hono: Zero's query and mutate endpoints, joining, ephemeral WS
packages/schema     Drizzle DDL, the Zero schema derived from it, queries, mutators
packages/rules      PURE. Constraint definitions and question semantics
packages/geo        Projection, boolean ops, snapping, simplification
packages/platform   PlatformAdapter interface + web implementation
packages/area-packs Pack format, validation, Berlin/VBB fixture
e2e                 Playwright — the M0 acceptance suite
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

The seven specs in `e2e/tests/m0.spec.ts` are M0's definition of done. They need
the stack up first, then:

```bash
npm run test:e2e
```

Playwright starts the server and web dev servers itself, and reuses them if they
are already running.

## Deployment

```bash
docker compose -f infra/docker/docker-compose.yml up -d --build
```

`zero-cache` needs a direct Postgres connection — no pgbouncer — and must not be
exposed publicly.
